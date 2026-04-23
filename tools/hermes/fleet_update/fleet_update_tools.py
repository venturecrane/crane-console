"""Fleet update orchestrator helpers for the Hermes agent.

This module is provisioned onto mini's Hermes install by
``scripts/provision-hermes-fleet-update.sh`` and registered in
``~/.hermes/hermes-agent/model_tools.py`` alongside ``crane_tools``.
The SKILL.md beside this file drives the per-run flow; these helpers
are the building blocks it calls.

Design notes:
    - stdlib only (json, subprocess, urllib, ssl, os, time, datetime,
      pathlib, logging, typing) plus PyYAML — which hermes-agent
      already requires.
    - No retries inside a single run. Weekly cadence reconciles.
    - Every tool is side-effect-minimal; side effects (ssh, apply,
      POST) are explicit so the skill can reason about them.

Canonical source: ``tools/hermes/fleet_update/fleet_update_tools.py``
in ``venturecrane/crane-console``. Do not edit the deployed copy on
mini — it's overwritten by the provisioner on every systemd run via
``ExecStartPre=git reset --hard origin/main``.
"""

from __future__ import annotations

import json
import logging
import os
import shlex
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore[import-untyped]
except ImportError as exc:  # pragma: no cover - deployment error
    raise RuntimeError(
        "PyYAML is required for fleet_update_tools. "
        "Install with: pip install pyyaml"
    ) from exc


log = logging.getLogger("hermes.fleet_update")


# ─── Data types ──────────────────────────────────────────────────────


@dataclass
class Machine:
    """Single fleet machine the orchestrator visits."""

    alias: str
    tailscale_ip: str
    ssh_user: str
    role: str = "dev"

    @property
    def is_self(self) -> bool:
        """True if this is the executor host (mini). Local, no SSH."""
        return self.alias == "mini"


@dataclass
class Finding:
    """One classified finding ready for ingest + issue upsert.

    ``repo`` follows the convention ``machine/<alias>`` so the SOS
    renderer can branch on source to avoid emitting dead github.com
    links.
    """

    machine: str
    rule: str
    severity: str
    message: str
    classification: str  # "safe-auto" | "needs-human"
    extra: dict[str, Any] = field(default_factory=dict)

    def to_ingest_payload(self) -> dict[str, Any]:
        return {
            "repo": f"machine/{self.machine}",
            "rule": self.rule,
            "severity": self.severity,
            "message": self.message,
            "extra": {
                **self.extra,
                "classification": self.classification,
            },
        }


# ─── Constants & classification rules ────────────────────────────────


# Safe-auto candidates. Everything else is needs-human by default.
SAFE_AUTO_RULES = frozenset(
    {
        "os-security-patches",
        "brew-outdated",
    }
)


DEFAULT_CRANE_CONTEXT_BASE = "https://crane-context.automation-ab6.workers.dev"


# ─── Registry loading ────────────────────────────────────────────────


def load_suppressions(suppressions_path: str | Path) -> dict[str, set[str]]:
    """Return {machine_alias: set(suppressed finding_types | "*")}.

    Missing file → empty suppressions (permissive). Parse errors raise
    so a malformed YAML never silently disables safety rules.
    """
    path = Path(suppressions_path)
    if not path.exists():
        log.warning("suppressions file not found at %s — empty set", path)
        return {}

    data = yaml.safe_load(path.read_text()) or []
    out: dict[str, set[str]] = {}
    for entry in data:
        machine = entry.get("machine")
        types = entry.get("types") or []
        if not machine:
            continue
        out.setdefault(machine, set()).update(types)
    return out


def load_machine_registry(mesh_script_path: str | Path) -> list[Machine]:
    """Parse scripts/setup-ssh-mesh.sh machine lines.

    The mesh script uses a single-source-of-truth table whose rows look
    like ``alias|tailscale_ip|ssh_user|role``. We tolerate commented
    rows and blanks. Missing file returns a hard-coded fleet list so
    the orchestrator still functions if the mesh script is ever
    renamed.
    """
    path = Path(mesh_script_path)
    machines: list[Machine] = []

    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Match lines like: "mini|100.105.134.85|smdurgan|remote"
            if "|" not in line or line.count("|") < 3:
                continue
            parts = [p.strip().strip('"') for p in line.split("|")]
            if len(parts) < 4:
                continue
            alias, ts_ip, ssh_user, role = parts[0], parts[1], parts[2], parts[3]
            # Filter non-ip rows (headers, continuation lines)
            if not ts_ip.count(".") == 3:
                continue
            machines.append(Machine(alias=alias, tailscale_ip=ts_ip, ssh_user=ssh_user, role=role))

    if not machines:
        # Hard-coded fallback matching scripts/setup-ssh-mesh.sh at the
        # time #657 Phase C was written. Keep in sync when fleet changes.
        log.warning("falling back to hard-coded machine registry")
        machines = [
            Machine("mac23", "100.71.110.46", "scottdurgan"),
            Machine("mbp27", "100.66.43.51", "scottdurgan"),
            Machine("mini", "100.105.134.85", "smdurgan"),
            Machine("think", "100.75.35.43", "scottdurgan"),
            Machine("m16", "100.125.113.8", "scottdurgan"),
        ]

    return machines


# ─── Remote execution ────────────────────────────────────────────────


def run_health_check(machine: Machine, repo_dir: str = "/srv/crane-console") -> dict[str, Any]:
    """Execute ``machine-health.sh --quick --json`` on the machine.

    Returns the parsed JSON. Local execution for ``mini``; Tailscale
    SSH otherwise with ``bash -lc`` wrapping so macOS brew PATH loads.

    Raises ``RuntimeError`` on unreachable / non-zero / malformed JSON.
    The caller should convert those to preflight-fail findings rather
    than letting them abort the whole run.
    """
    script = f"{repo_dir if machine.is_self else '~/dev/crane-console'}/scripts/machine-health.sh"
    cmd_str = f'bash -lc "{script} --quick --json"'

    if machine.is_self:
        cmd = ["bash", "-lc", f"{script} --quick --json"]
    else:
        cmd = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "StrictHostKeyChecking=accept-new",
            f"{machine.ssh_user}@{machine.tailscale_ip}",
            cmd_str,
        ]

    log.info("health check: %s", machine.alias)
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    # Exit 0/2 are both success-ish (2 = warnings, meaningful to us);
    # exit 1 means at least one hard failure (DNS, preflight, crane-mcp).
    # We still parse the JSON — the fields carry the signal either way.
    if not proc.stdout.strip():
        raise RuntimeError(
            f"{machine.alias}: empty output (exit={proc.returncode}, "
            f"stderr={proc.stderr[:200]!r})"
        )

    try:
        return json.loads(proc.stdout.splitlines()[-1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"{machine.alias}: unparseable JSON: {exc} (raw={proc.stdout[:200]!r})"
        ) from exc


# ─── Classification ──────────────────────────────────────────────────


def classify_findings(machine: Machine, health: dict[str, Any]) -> list[Finding]:
    """Translate a per-machine health JSON into zero or more Findings.

    A Finding per non-zero signal. No Findings at all = machine is fully
    current (green snapshot → prior findings auto-resolve on ingest).
    """
    findings: list[Finding] = []

    def needs_human(rule: str, severity: str, msg: str, **extra: Any) -> None:
        findings.append(
            Finding(
                machine=machine.alias,
                rule=rule,
                severity=severity,
                message=msg,
                classification="needs-human",
                extra=extra,
            )
        )

    def safe_auto(rule: str, severity: str, msg: str, **extra: Any) -> None:
        findings.append(
            Finding(
                machine=machine.alias,
                rule=rule,
                severity=severity,
                message=msg,
                classification="safe-auto",
                extra=extra,
            )
        )

    # Security patches — Linux safe-auto; macOS needs-human (major OS
    # updates shouldn't auto-apply because they often require reboot).
    sec_count = int(health.get("os_security", 0) or 0)
    if sec_count > 0:
        if health.get("os", "").lower() == "linux":
            safe_auto(
                "os-security-patches",
                "warning",
                f"{sec_count} security updates pending",
                count=sec_count,
            )
        else:
            needs_human(
                "os-security-patches",
                "warning",
                f"{sec_count} security updates pending (macOS — manual review)",
                count=sec_count,
            )

    # Non-security OS updates — feature updates, always needs-human.
    total = int(health.get("os_updates", 0) or 0)
    feature_count = max(total - sec_count, 0)
    if feature_count > 0:
        needs_human(
            "os-feature-updates",
            "info",
            f"{feature_count} non-security OS updates pending",
            count=feature_count,
        )

    # Brew outdated — safe-auto in bounded volume, needs-human above
    # threshold to avoid multi-hour apply times and surprise regressions.
    brew = int(health.get("brew_outdated", 0) or 0)
    if brew > 0:
        if brew <= 20:
            safe_auto(
                "brew-outdated",
                "info",
                f"{brew} brew formulae outdated",
                count=brew,
            )
        else:
            needs_human(
                "brew-outdated",
                "warning",
                f"{brew} brew formulae outdated — review manually (>20 threshold)",
                count=brew,
            )

    # Reboot required — always needs-human. Never auto-reboot any box.
    if health.get("reboot_required"):
        needs_human(
            "reboot-required",
            "warning",
            "Machine needs a reboot to complete pending updates",
        )

    # Uptime — flag long-running boxes as needs-human so Captain can
    # coordinate a reboot window.
    uptime_days = int(health.get("uptime_days", 0) or 0)
    if uptime_days > 30:
        needs_human(
            "uptime-high",
            "info",
            f"Uptime is {uptime_days} days (>30 — consider reboot)",
            uptime_days=uptime_days,
        )

    # Xcode CLT on macOS.
    if health.get("xcode_clt_outdated"):
        needs_human(
            "xcode-clt-outdated",
            "info",
            "Xcode Command Line Tools update available",
        )

    # Disk pressure — warn early, fail at 95%.
    disk_str = str(health.get("disk", "0%")).rstrip("%")
    try:
        disk_pct = int(disk_str)
    except ValueError:
        disk_pct = 0
    if disk_pct >= 95:
        needs_human(
            "disk-pressure",
            "error",
            f"Disk is {disk_pct}% full",
            disk_pct=disk_pct,
        )
    elif disk_pct >= 90:
        needs_human(
            "disk-pressure",
            "warning",
            f"Disk is {disk_pct}% full",
            disk_pct=disk_pct,
        )

    # Preflight failure — crane-mcp / infisical / DNS issues. Always
    # needs-human; the orchestrator can't self-heal these.
    if health.get("preflight") == "fail":
        needs_human(
            "preflight-fail",
            "error",
            "preflight-check.sh failed",
            preflight=health.get("preflight"),
        )

    return findings


# ─── Apply gate ──────────────────────────────────────────────────────


def should_apply(
    finding: Finding,
    *,
    apply_enabled: bool,
    suppressions: dict[str, set[str]],
) -> tuple[bool, str]:
    """Return ``(will_apply, reason_if_not)``.

    Rules (first-match):
        1. classification != 'safe-auto' → don't apply.
        2. FLEET_UPDATE_APPLY=false → "canary:report-only".
        3. suppressions matches machine + ('*' or type) → "suppressed:<reason>".
        4. otherwise apply.
    """
    if finding.classification != "safe-auto":
        return False, f"classification:{finding.classification}"

    if not apply_enabled:
        return False, "canary:report-only"

    sup_types = suppressions.get(finding.machine, set())
    if "*" in sup_types or finding.rule in sup_types:
        return False, "suppressed"

    return True, ""


def apply_safe_auto(
    machine: Machine,
    finding: Finding,
) -> dict[str, Any]:
    """Execute the fix for a safe-auto finding. Never on mac23.

    Returns ``{auto_applied, apply_exit_code, apply_output_tail}`` for
    inclusion in ``finding.extra``. Caller updates ``finding.extra``
    before ingest.
    """
    if finding.rule == "os-security-patches":
        # Linux only — unattended-upgrade is the kernel of our floor,
        # triggering it here just accelerates the pending patches.
        remote = 'sudo unattended-upgrade -d'
    elif finding.rule == "brew-outdated":
        # macOS brew — bash -lc picks up .zprofile so /opt/homebrew/bin
        # is on PATH for non-interactive SSH sessions.
        remote = 'bash -lc "brew upgrade --quiet"'
    else:
        raise ValueError(f"apply_safe_auto not implemented for rule={finding.rule!r}")

    if machine.is_self:
        cmd = ["bash", "-lc", remote]
    else:
        cmd = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            f"{machine.ssh_user}@{machine.tailscale_ip}",
            remote,
        ]

    log.info("apply %s on %s", finding.rule, machine.alias)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=900,  # 15 min ceiling — brew can be slow
            check=False,
        )
        output_tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-20:])
        return {
            "auto_applied": proc.returncode == 0,
            "apply_exit_code": proc.returncode,
            "apply_output_tail": output_tail,
            "apply_mode": "apply",
        }
    except subprocess.TimeoutExpired:
        return {
            "auto_applied": False,
            "apply_exit_code": -1,
            "apply_output_tail": "(timed out after 900s)",
            "apply_mode": "apply",
            "apply_failed": True,
        }


# ─── Ingest + GitHub ─────────────────────────────────────────────────


def _http_post_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> tuple[int, str]:
    """Minimal HTTPS POST via ``curl`` subprocess.

    We shell out to curl rather than use ``urllib.request.urlopen`` so
    the tool cannot be tricked into reading local files via ``file://``
    if ``CRANE_CONTEXT_BASE`` is ever poisoned — curl is HTTP-only by
    default and we additionally validate the ``https://`` prefix.

    Returns (status_code, response_body). Raises RuntimeError on curl
    transport failure (DNS, connection refused, TLS error, etc.).
    """
    if not url.startswith("https://"):
        raise ValueError(
            f"refusing non-https URL: {url!r} "
            "(fleet_update_tools only posts to crane-context)"
        )

    body = json.dumps(payload)
    cmd = [
        "curl",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "--proto",
        "=https",  # defense-in-depth: reject any non-https protocol at curl's own layer
        "--request",
        "POST",
        "--header",
        "Content-Type: application/json",
    ]
    for k, v in headers.items():
        cmd.extend(["--header", f"{k}: {v}"])
    cmd.extend(["--data", body, "--write-out", "\n%{http_code}", url])

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=45, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"curl timed out to {url}") from exc

    if proc.returncode != 0:
        raise RuntimeError(
            f"curl failed (exit {proc.returncode}) to {url}: {proc.stderr[:200]!r}"
        )

    # Response body is everything except the last line; status_code is
    # the last line (from --write-out "\n%{http_code}").
    lines = proc.stdout.rsplit("\n", 1)
    if len(lines) != 2:
        raise RuntimeError(f"unexpected curl output shape: {proc.stdout[:200]!r}")
    resp_body, status_line = lines[0], lines[1].strip()
    try:
        status = int(status_line)
    except ValueError as exc:
        raise RuntimeError(f"curl status not integer: {status_line!r}") from exc
    return status, resp_body


def ingest_snapshot(
    findings: list[Finding],
    *,
    source_sha: str,
    crane_context_base: str | None = None,
    admin_key: str | None = None,
) -> dict[str, Any]:
    """POST a full machine-source snapshot to crane-context.

    Load-bearing: ``source: "machine"`` — without it, the ingest endpoint
    auto-resolves open GitHub findings via the pre-load query. See
    migration 0037 and ``ingestFleetHealth`` in ``workers/crane-context/
    src/fleet-health.ts``.
    """
    base = crane_context_base or os.environ.get(
        "CRANE_CONTEXT_BASE", DEFAULT_CRANE_CONTEXT_BASE
    )
    key = admin_key or os.environ.get("CRANE_ADMIN_KEY")
    if not key:
        raise RuntimeError("CRANE_ADMIN_KEY required for ingest_snapshot")

    # Annotate each finding with source_sha so stale-code drift is
    # visible in the ingested data (e.g. if ExecStartPre fails).
    payload_findings = []
    for f in findings:
        payload = f.to_ingest_payload()
        payload["extra"]["source_sha"] = source_sha
        payload_findings.append(payload)

    body = {
        "org": "venturecrane",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "fail" if any(f.severity == "error" for f in findings) else "pass",
        "source": "machine",
        "findings": payload_findings,
    }

    status, resp_text = _http_post_json(
        f"{base.rstrip('/')}/admin/fleet-health/ingest",
        body,
        {"X-Admin-Key": key},
    )
    if status != 200:
        raise RuntimeError(f"ingest failed: HTTP {status}: {resp_text[:500]}")
    return json.loads(resp_text)


def complete_cadence(
    *,
    summary: str,
    crane_context_base: str | None = None,
    relay_key: str | None = None,
) -> None:
    """Mark fleet-machine-check complete so SOS's Cadence block refreshes."""
    base = crane_context_base or os.environ.get(
        "CRANE_CONTEXT_BASE", DEFAULT_CRANE_CONTEXT_BASE
    )
    key = relay_key or os.environ.get("CRANE_CONTEXT_KEY")
    if not key:
        log.warning("CRANE_CONTEXT_KEY missing — skipping cadence completion")
        return

    status, resp = _http_post_json(
        f"{base.rstrip('/')}/schedule/fleet-machine-check/complete",
        {"summary": summary},
        {"X-Relay-Key": key},
    )
    if status != 200:
        log.warning("cadence completion returned HTTP %s: %s", status, resp[:200])


def gh_issue_upsert(
    finding: Finding,
    *,
    source_sha: str,
    repo: str = "venturecrane/crane-console",
) -> dict[str, Any]:
    """Upsert a `[fleet] <alias>: <type>` issue for this needs-human finding.

    Uses `gh` CLI. Caller must have GH_TOKEN in env (set by systemd
    EnvironmentFile). Returns ``{action: "created"|"updated"|"reopened",
    issue_number: N}`` or ``{skipped: reason}`` on gh failure.
    """
    title = f"[fleet] {finding.machine}: {finding.rule}"
    body = _build_issue_body(finding, source_sha)
    labels = [f"fleet:{finding.machine}", "type:patch"]

    # Search for an existing issue by exact title (open or closed).
    search_cmd = [
        "gh",
        "issue",
        "list",
        "--repo",
        repo,
        "--search",
        f'in:title "{title}"',
        "--state",
        "all",
        "--json",
        "number,state,title",
        "--limit",
        "10",
    ]
    try:
        proc = subprocess.run(search_cmd, capture_output=True, text=True, check=True, timeout=30)
        matches = [m for m in json.loads(proc.stdout) if m["title"] == title]
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        return {"skipped": f"gh_search_failed:{exc}"}

    if not matches:
        create_cmd = [
            "gh",
            "issue",
            "create",
            "--repo",
            repo,
            "--title",
            title,
            "--body",
            body,
        ]
        for label in labels:
            create_cmd.extend(["--label", label])
        try:
            proc = subprocess.run(create_cmd, capture_output=True, text=True, check=True, timeout=30)
        except subprocess.CalledProcessError as exc:
            return {"skipped": f"gh_create_failed:{exc.stderr[:200]}"}
        # gh returns "https://github.com/owner/repo/issues/N" on stdout
        issue_num = proc.stdout.strip().rstrip("/").rsplit("/", 1)[-1]
        return {"action": "created", "issue_number": int(issue_num)}

    # Take the newest match.
    target = sorted(matches, key=lambda m: -m["number"])[0]
    num = target["number"]

    if target["state"] == "CLOSED":
        subprocess.run(
            ["gh", "issue", "reopen", str(num), "--repo", repo, "--comment", "Finding re-surfaced in fleet-update snapshot."],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
        subprocess.run(
            ["gh", "issue", "edit", str(num), "--repo", repo, "--body", body],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
        return {"action": "reopened", "issue_number": num}

    subprocess.run(
        ["gh", "issue", "edit", str(num), "--repo", repo, "--body", body],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    return {"action": "updated", "issue_number": num}


def gh_issue_close_stale(
    active_titles: set[str],
    *,
    source_sha: str,
    repo: str = "venturecrane/crane-console",
) -> list[int]:
    """Close fleet:* issues whose title is not in the active snapshot.

    Matches by title prefix ``[fleet] `` so Captain-filed issues with
    different title shapes are left alone.
    """
    search_cmd = [
        "gh",
        "issue",
        "list",
        "--repo",
        repo,
        "--search",
        'in:title "[fleet]"',
        "--state",
        "open",
        "--json",
        "number,title",
        "--limit",
        "100",
    ]
    try:
        proc = subprocess.run(search_cmd, capture_output=True, text=True, check=True, timeout=30)
        existing = json.loads(proc.stdout)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return []

    closed: list[int] = []
    for issue in existing:
        title = issue["title"]
        if not title.startswith("[fleet] ") or title in active_titles:
            continue
        comment = (
            f"Finding no longer present in fleet-update snapshot at "
            f"{datetime.now(timezone.utc).isoformat()} (SHA {source_sha[:7]}). "
            "Closing automatically — reopen if the finding re-surfaces."
        )
        subprocess.run(
            ["gh", "issue", "close", str(issue["number"]), "--repo", repo, "--comment", comment],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
        closed.append(issue["number"])
    return closed


# ─── Helpers ─────────────────────────────────────────────────────────


def _build_issue_body(finding: Finding, source_sha: str) -> str:
    extra_lines = "\n".join(f"- `{k}`: {v}" for k, v in sorted(finding.extra.items()))
    return (
        f"Fleet update orchestrator found a **needs-human** finding on `{finding.machine}`.\n\n"
        f"## Finding\n\n"
        f"- **Type:** `{finding.rule}`\n"
        f"- **Severity:** `{finding.severity}`\n"
        f"- **Classification:** `{finding.classification}`\n"
        f"- **Message:** {finding.message}\n\n"
        f"## Context\n\n"
        f"{extra_lines}\n\n"
        f"## Source\n\n"
        f"- Crane-console: `{source_sha}`\n"
        f"- Timestamp: `{datetime.now(timezone.utc).isoformat()}`\n"
        f"- This issue is upserted by `tools/hermes/fleet_update/fleet_update_tools.py` "
        f"and will close automatically when the finding disappears from the next snapshot.\n\n"
        f"See plan: `~/.claude/plans/cuddly-riding-sifakis.md` (#657)."
    )


def current_source_sha(repo_dir: str = "/srv/crane-console") -> str:
    """Return the HEAD SHA of the canonical checkout on mini."""
    try:
        proc = subprocess.run(
            ["git", "-C", repo_dir, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return proc.stdout.strip()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return "unknown"


__all__ = [
    "Finding",
    "Machine",
    "SAFE_AUTO_RULES",
    "apply_safe_auto",
    "classify_findings",
    "complete_cadence",
    "current_source_sha",
    "gh_issue_close_stale",
    "gh_issue_upsert",
    "ingest_snapshot",
    "load_machine_registry",
    "load_suppressions",
    "run_health_check",
    "should_apply",
]
