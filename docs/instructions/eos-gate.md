# EOS Surface Verification Gate

The EOS surface verification gate is a multi-layer mechanism that prevents cross-boundary deliverables (skills, MCP tools, fleet artifacts, config canon) from merging or being declared "done" without verification that they actually work end-to-end.

## Why this exists

Cross-boundary deliverables (a skill, an MCP tool, a fleet bootstrap script) used to ship and CI-pass on the author's machine, then take 3-4 session restarts to actually work on consuming machines. The captured lessons:

- `feedback_finish_means_merged.md` — agents declared "shipped" while PRs were stuck open with red CI
- `feedback_verify_fix_end_to_end.md` — runtime-config fixes weren't validated in fresh processes
- `feedback_no_manufactured_loose_ends.md` — closure was a moving target, not a verifiable assertion

Memory captured the lessons but didn't enforce them. This gate makes "definition of done" a verifiable assertion the harness checks at three points: PR open, post-merge sync, and EOS handoff.

## Architecture

Four layers, each closing a distinct failure mode:

### Layer 1 — Surface manifest (`config/eos-gate-surfaces.json`)

Declares which paths are cross-boundary surface and which are exempt. Five surface classes:

| Class            | Paths                                                                                                      | Probe mode            |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- |
| `skill`          | `.claude/commands/*.md`, `.agents/skills/**/SKILL.md`, `.gemini/commands/*.toml`                           | skill-invoke          |
| `mcp-tool`       | `packages/crane-mcp/src/tools/*.ts`, `packages/crane-mcp/src/index.ts`, `workers/crane-context/src/mcp.ts` | mcp-tool-list         |
| `fleet-artifact` | `scripts/sync-commands.sh`, `scripts/fleet-*.sh`, bootstrap scripts                                        | script-check          |
| `config-canon`   | `config/*.json`, `.claude/settings.json`                                                                   | config-parse-and-boot |
| `boot-config`    | `packages/crane-mcp/src/cli/**/*.ts`                                                                       | session-boot          |

Exempt classes: `docs-only`, `tests-only`, `build-info`, `ci-internal`. Path matching uses glob patterns; exempt rules win over surface rules. The classifier (`scripts/eos-gate-classify.mjs`) is shared by the GitHub Action and `fleet-probe.sh`.

### Layer 2 — PR-time gate (`.github/workflows/pr-eos-gate.yml`)

Triggers on every PR to main. Runs:

1. **Classify**: compute changed files vs base, classify against the manifest, output per-class booleans.
2. **Probe**: per surface class touched, run a targeted check.
   - skill → `sync-commands.sh --check` (triplet integrity)
   - mcp-tool → `npm run build -w @venturecrane/crane-mcp` and inspect output manifest
   - config-canon → JSON parse all `config/*.json`
   - fleet-artifact → shellcheck all `scripts/*.sh`
   - boot-config → typecheck and build
3. **Aggregate**: `gate-summary` job fails if any probe failed.

This catches: skill triplet drift, MCP tool build breakage, config JSON syntax errors, shellcheck failures in fleet scripts, launcher build breakage.

It does NOT (yet) catch: runtime-config issues that only manifest on a real fleet machine, user-level settings that diverge between probe machine and consumer machine. Those require the v2 fleet-dispatch probe (see "Roadmap" below).

### Layer 3 — Skill triplet check in `verify.yml`

Pre-existing `verify.yml` (typecheck + format + lint + test) now also runs `sync-commands.sh --check` on every push and PR. This is the file-format half of the gate: it catches the case where a skill author edits `.claude/commands/<x>.md` without regenerating `.agents/skills/<x>/SKILL.md` and `.gemini/commands/<x>.toml`.

### Layer 4a — EOS-time surfacing (visibility, not blocking)

When `crane_handoff` is invoked, the handoff summary includes a "Tool surface verification" block summarizing today's merged surface plus PR-time probe and post-merge heartbeat status. Captain sees the state at the moment they EOS. This is informational; it does not block.

### Layer 4b — EOS-time PR-merge gate

When `crane_handoff` is called with `status=done`, it queries `gh pr list` for open PRs from this session's branches. If any open PR has FAILURE / TIMED_OUT / CANCELLED checks, the handoff is rejected with a structured `unmerged_prs` payload listing each PR.

This catches the most-recent and most-direct failure mode: **agents declaring "shipped" while their PR is stuck open with red CI**.

Override paths:

- Pass `status=blocked` with the external blocker named in the summary. The agent is acknowledging unmerged work; gate accepts.
- Pass `override_pr_merge_gate=true` for rare false-positive cases. The override is recorded in the handoff summary and visible in the next session's SOS.

Best-effort by design: if `gh` CLI isn't available or the API call fails, the gate returns `should_block: false`. Never fail closed on infrastructure issues.

Implemented in: `packages/crane-mcp/src/lib/pr-merge-gate.ts` and `packages/crane-mcp/src/tools/handoff.ts`.

## Override mechanism (PR-time)

Some PRs legitimately need to bypass the PR-time probe — e.g., emergency hotfixes, scope-bounded refactors that the gate misclassifies. Add the `skip-eos-gate` label to the PR and provide a reason in the PR body. The classify job picks up the label, skips downstream probes, and emits a workflow-level warning. The override is auditable in PR history.

**Avoid pattern**: applying the label by default to skip the gate routinely. Override frequency is surfaced in `crane_status` weekly briefing; repeat overrides on the same surface should trigger Captain review.

## Verification step 0 — corpus replay (one-time)

Before merging a change to the gate itself, replay the gate logic against the historical incidents in `feedback_*.md` memories. Confirm: (a) the gate's manifest classifies the affected paths as surface, (b) the gate's probes would have caught the failure. The corpus replay performed at the time of the gate's introduction caught:

- **Memory 1 (`feedback_finish_means_merged.md`)** — Caught directly by Layer 4b. The PRs for `/estimate` and `/docs-audit` had failing CI; gate would have refused `status=done`.
- **Memory 2 (`feedback_verify_fix_end_to_end.md`)** — Partially caught. Manifest classifies launcher edits as `boot-config` and runs build-and-typecheck. Does NOT catch user-level `~/.claude/settings.json` divergence between probe machine and Captain's machine. Acknowledged limitation; v2 fleet-dispatch probe addresses.
- **Memory 3 (`feedback_no_manufactured_loose_ends.md`)** — Out of scope. About agent communication discipline, not surface drift.

If a future gate revision adds a manifest path or probe mode, repeat the corpus replay before merging.

## Roadmap (v2 — fleet-dispatch probes)

The v1 gate runs probes on `ubuntu-latest`. This catches build/lint/parse drift but not:

- Runtime-config drift (env vars set in user-level `~/.claude/settings.json` not in repo)
- Cross-machine launcher/boot drift (state cached on author's machine but not propagated)
- Tailscale/SSH/secret state that only appears on real fleet machines

v2 will dispatch probes to a designated fleet probe machine (mac23, m16, etc.) via Tailscale SSH. The dispatch path uses `scripts/fleet-probe.sh` (already shipped, runs on a real fleet machine) and a new `mode: "probe"` variant of `crane_fleet_dispatch`. Tracking work: separate issue.

## Operator quick reference

**A skill PR is failing `Skill triplet drift check`:**

Run `scripts/sync-commands.sh --generate-only` locally, commit the regenerated `.agents/skills/<name>/SKILL.md` and `.gemini/commands/<name>.toml`. The author owns the canonical `.claude/commands/<name>.md`; the other two are generated.

**An MCP-tool PR is failing `Probe — MCP tool registration`:**

Run `npm ci && npm run build -w @venturecrane/crane-mcp` locally and confirm the build succeeds. Check that `packages/crane-mcp/src/index.ts` registers the new tool.

**`crane_handoff` returned `[client] Handoff blocked by EOS PR-merge gate`:**

The agent declared `status=done` while a PR is open with failing CI. Three options:

1. Fix CI on the named PR(s) and merge them, then retry handoff.
2. Pass `status=blocked` with the external blocker named in the summary.
3. Pass `override_pr_merge_gate=true` if the gate is wrong (rare).

**Adding a new surface class to the manifest:**

1. Edit `config/eos-gate-surfaces.json`, add a new entry under `surface_classes` with paths and probe_mode.
2. Add a corresponding `probe-<class>` job in `.github/workflows/pr-eos-gate.yml`, gated on `needs.classify.outputs.touches_<class> == 'true'`.
3. Run the corpus replay to confirm the new class catches its target failure mode.
4. Add the new class to the boolean output list in the `classify` job.

## Anti-patterns

- **Don't probe on the author's machine.** A subagent in the same session inherits the same launcher mirror, settings, and MCP connection. The whole point is fresh-deployment-environment verification, not fresh-conversational-context.
- **Don't auto-create P0 issues for overrides.** Pre-v2 design considered this; rejected because issue queues overflow into wontfix and the gate becomes theater. Visible-in-PR-history audit + weekly review is the load-bearing signal.
- **Don't mistake `verify.yml` for the gate.** `verify.yml` catches code-level issues (typecheck, lint, test). The gate catches surface-deployment issues (does the new skill register, does the new MCP tool load, does the new config parse). Both are needed; neither replaces the other.
- **Don't skip the corpus replay when changing the gate.** `feedback_validate_patterns_against_corpus.md` was learned the hard way; this gate has its own corpus replay step for the same reason.
