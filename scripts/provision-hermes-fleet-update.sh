#!/bin/bash
#
# Provision the Hermes fleet_update skill and its systemd timer on `mini`.
#
# Installs from the canonical in-repo sources under
# tools/hermes/{fleet_update,systemd}/ into:
#   ~/.hermes/hermes-agent/skills/fleet_update/
#   ~/.hermes/hermes-agent/tools/fleet_update_tools.py
#   /etc/systemd/system/fleet-update.{service,timer}
#   /etc/fleet-update/fleet-update.env  (scaffolded if missing)
#   /var/log/fleet-update/               (created with smdurgan ownership)
#   /srv/crane-console                   (git clone of this repo; ExecStartPre
#                                         keeps it at origin/main every run)
#
# Patches ~/.hermes/hermes-agent/model_tools.py to discover
# tools.fleet_update_tools (mirrors the pattern in
# packages/crane-mcp/src/cli/launch-lib.ts:1362-1386).
#
# **Refuses to run on any host other than mini.** mac23 is not a
# scheduler host — see ~/.claude/plans/cuddly-riding-sifakis.md (#657).
#
# Usage:
#   sudo bash scripts/provision-hermes-fleet-update.sh
#
# Environment overrides:
#   HERMES_CMD    Override the hermes invocation used by the service.
#                 Default: "hermes chat --skill fleet_update --non-interactive"
#                 Set this if the installed hermes-agent build uses a
#                 different command form (e.g. "hermes skill run fleet_update").
#
# Idempotent: re-running is safe. Does NOT arm the timer until the
# Captain explicitly enables it (see the Next Steps output).

set -e
set -o pipefail

# ─── Refuse non-mini hosts ────────────────────────────────────────────
HOST=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//')
if [ "$HOST" != "mini" ]; then
    echo "[error] this script is mini-only (hostname=$HOST)." >&2
    echo "        mac23 is the Captain's workstation, not a scheduler host." >&2
    exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "[error] must run as root (use sudo)." >&2
    exit 1
fi

# ─── Locate repo sources ──────────────────────────────────────────────
# The script may be invoked from a local repo clone or via ssh. Either
# way, determine SOURCE_REPO from $0 and ensure /srv/crane-console exists
# as a canonical always-fresh checkout the systemd unit uses.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -d "$SOURCE_REPO/tools/hermes/fleet_update" ]; then
    echo "[error] expected tools/hermes/fleet_update at $SOURCE_REPO — is this a crane-console checkout?" >&2
    exit 1
fi

HERMES_CMD="${HERMES_CMD:-hermes chat --skill fleet_update --non-interactive}"
TARGET_USER="smdurgan"
TARGET_HOME="/home/$TARGET_USER"
CANONICAL_REPO="/srv/crane-console"

echo "[info] Provisioning fleet_update skill on $HOST (user $TARGET_USER)"

# ─── 1. Canonical checkout at /srv/crane-console ──────────────────────
if [ ! -d "$CANONICAL_REPO/.git" ]; then
    echo "[info] Cloning canonical repo to $CANONICAL_REPO..."
    mkdir -p "$(dirname "$CANONICAL_REPO")"
    # Use the local source repo as origin, then convert to github origin.
    # Alternative: direct clone from github if gh is authenticated.
    if command -v gh >/dev/null 2>&1 && sudo -u "$TARGET_USER" gh auth status >/dev/null 2>&1; then
        sudo -u "$TARGET_USER" gh repo clone venturecrane/crane-console "$CANONICAL_REPO"
    else
        git clone "$SOURCE_REPO" "$CANONICAL_REPO"
        git -C "$CANONICAL_REPO" remote set-url origin "git@github.com:venturecrane/crane-console.git" || true
    fi
    chown -R "$TARGET_USER:$TARGET_USER" "$CANONICAL_REPO"
fi
echo "[ok] /srv/crane-console exists and is git-tracked"

# ─── 2. Hermes skill + tool install ───────────────────────────────────
HERMES_ROOT="$TARGET_HOME/.hermes/hermes-agent"
if [ ! -d "$HERMES_ROOT" ]; then
    echo "[error] hermes-agent not found at $HERMES_ROOT" >&2
    echo "        install first: sudo -u $TARGET_USER pip install hermes-agent" >&2
    exit 1
fi

SKILL_DIR="$HERMES_ROOT/skills/fleet_update"
TOOLS_DIR="$HERMES_ROOT/tools"
sudo -u "$TARGET_USER" mkdir -p "$SKILL_DIR" "$TOOLS_DIR"

echo "[info] Rsyncing fleet_update skill + tools..."
rsync -a --delete \
    "$SOURCE_REPO/tools/hermes/fleet_update/" \
    "$SKILL_DIR/"
cp "$SOURCE_REPO/tools/hermes/fleet_update/fleet_update_tools.py" \
   "$TOOLS_DIR/fleet_update_tools.py"
chown -R "$TARGET_USER:$TARGET_USER" "$SKILL_DIR" "$TOOLS_DIR/fleet_update_tools.py"
echo "[ok] skill + tools installed"

# ─── 3. Patch model_tools.py to discover tools.fleet_update_tools ────
MODEL_TOOLS="$HERMES_ROOT/model_tools.py"
if [ -f "$MODEL_TOOLS" ]; then
    if ! grep -q "tools.fleet_update_tools" "$MODEL_TOOLS"; then
        echo "[info] Patching model_tools.py to include fleet_update_tools..."
        # Best-effort: append a discovery entry. Mirrors the logic in
        # packages/crane-mcp/src/cli/launch-lib.ts:1362-1386.
        python3 - "$MODEL_TOOLS" <<'PYEOF'
import re, sys
path = sys.argv[1]
src = open(path).read()
if "tools.fleet_update_tools" in src:
    sys.exit(0)
# Look for a TOOLS or DISCOVERY list and append our module.
m = re.search(r'(TOOLS|DISCOVERY|MODEL_TOOLS|tools)\s*=\s*\[([^\]]*)\]', src, re.DOTALL)
if m:
    updated = src.replace(m.group(0), m.group(0).rstrip("]").rstrip() + ',\n    "tools.fleet_update_tools",\n]')
    open(path, "w").write(updated)
else:
    # Append at end of file as a fallback.
    with open(path, "a") as fh:
        fh.write("\n# Added by provision-hermes-fleet-update.sh (#657)\n")
        fh.write('import importlib\n')
        fh.write('try: importlib.import_module("tools.fleet_update_tools")\n')
        fh.write('except Exception as _e: pass\n')
PYEOF
        chown "$TARGET_USER:$TARGET_USER" "$MODEL_TOOLS"
    fi
    echo "[ok] model_tools.py has tools.fleet_update_tools discovery"
else
    echo "[warn] $MODEL_TOOLS missing — skill will still run if hermes auto-discovers ~/tools/*.py"
fi

# ─── 4. Systemd service + timer ──────────────────────────────────────
echo "[info] Installing systemd units..."
mkdir -p /var/log/fleet-update /etc/fleet-update
chown "$TARGET_USER:$TARGET_USER" /var/log/fleet-update
chmod 755 /var/log/fleet-update

# Resolve the absolute path to `hermes` on THIS host as the target user,
# so the runtime PATH (pip install --user, /usr/local/bin, etc.) is
# respected. systemd requires an absolute path in ExecStart.
service_src="$SOURCE_REPO/tools/hermes/systemd/fleet-update.service"
timer_src="$SOURCE_REPO/tools/hermes/systemd/fleet-update.timer"

hermes_bin=$(sudo -u "$TARGET_USER" bash -lc 'command -v hermes' 2>/dev/null || true)
if [ -z "$hermes_bin" ]; then
    for candidate in /usr/local/bin/hermes "$TARGET_HOME/.local/bin/hermes" /usr/bin/hermes; do
        if [ -x "$candidate" ]; then
            hermes_bin="$candidate"
            break
        fi
    done
fi

if [ -z "$hermes_bin" ]; then
    echo "[error] could not locate hermes binary on this host." >&2
    echo "        install first: sudo -u $TARGET_USER pip install hermes-agent" >&2
    exit 1
fi
echo "[info] resolved hermes binary: $hermes_bin"

# Determine the ExecStart command. HERMES_CMD overrides the entire
# invocation; otherwise use the template's default subcommand form
# with the resolved binary path.
if [ -n "${HERMES_CMD:-}" ]; then
    first_word="${HERMES_CMD%% *}"
    rest_words="${HERMES_CMD#* }"
    if [[ "$first_word" == /* ]]; then
        # Already absolute — trust the override verbatim.
        resolved_exec="$HERMES_CMD"
    elif [ "$first_word" = "hermes" ]; then
        # Bare `hermes` — swap in the resolved binary path.
        resolved_exec="$hermes_bin $rest_words"
    else
        # Some other binary name — assume the user knows what they're doing.
        resolved_exec="$hermes_bin $HERMES_CMD"
    fi
else
    resolved_exec="$hermes_bin chat --skill fleet_update --non-interactive"
fi

echo "[info] ExecStart=$resolved_exec"

sed "s|^ExecStart=.*|ExecStart=$resolved_exec|" "$service_src" \
    > /etc/systemd/system/fleet-update.service
cp "$timer_src" /etc/systemd/system/fleet-update.timer
chmod 644 /etc/systemd/system/fleet-update.service /etc/systemd/system/fleet-update.timer

# Scaffold the env file (idempotent — never overwrite Captain's real secrets).
if [ ! -f /etc/fleet-update/fleet-update.env ]; then
    cat > /etc/fleet-update/fleet-update.env <<'EOF'
# Fleet update orchestrator environment (#657).
# Managed by Captain — do not commit real secrets to the repo.
#
# FLEET_UPDATE_APPLY=false is the canary default. Flip to true after
# ~2 weeks of classify-only runs and manual validation of the findings.

FLEET_UPDATE_APPLY=false

# Pulled from Infisical / Bitwarden by Captain and pasted here:
# CRANE_ADMIN_KEY=...
# CRANE_CONTEXT_KEY=...
# GH_TOKEN=...

CRANE_CONTEXT_BASE=https://crane-context.automation-ab6.workers.dev
EOF
    chmod 600 /etc/fleet-update/fleet-update.env
    echo "[ok] scaffolded /etc/fleet-update/fleet-update.env — populate secrets before arming"
else
    echo "[ok] /etc/fleet-update/fleet-update.env already exists"
fi

systemctl daemon-reload
echo "[ok] systemd units installed; daemon reloaded"

# ─── 5. Next steps (do NOT arm automatically) ────────────────────────

cat <<EOF

──────────────────────────────────────────────────────────────────────
Provisioning complete. Units installed but timer NOT enabled.

To arm the weekly timer:
  1. Populate secrets in /etc/fleet-update/fleet-update.env:
       CRANE_ADMIN_KEY, CRANE_CONTEXT_KEY, GH_TOKEN
  2. Verify mini can SSH to every fleet target as scottdurgan:
       for alias in mac23 mbp27 think m16; do
         ssh -o BatchMode=yes scottdurgan@\$alias 'echo ok' || echo "\$alias FAIL"
       done
  3. Confirm the hermes command form by running a dry execution:
       sudo systemctl start fleet-update.service
       tail /var/log/fleet-update/run.log
  4. When satisfied, enable:
       sudo systemctl enable --now fleet-update.timer
       systemctl list-timers | grep fleet-update

Canary: FLEET_UPDATE_APPLY=false for ~2 weeks. Set to true only after
validating classifications. mac23 is permanently suppressed per
tools/hermes/fleet_update/suppressions.yaml.
──────────────────────────────────────────────────────────────────────
EOF
