---
name: aie-onboard
description: Authors a validated AI-Employee customer.yaml + onboarding plan from a client-interview transcript. Captain-side; extractive, non-provisioning, non-committing.
version: 0.1.0
scope: enterprise
owner: captain
status: draft
---

# /aie-onboard - Author an AI-Employee config from a client interview

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "aie-onboard")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Turns an initial client-interview transcript or notes into two artifacts under the
venture repo's `ai-employee/customers/<slug>/`:

1. `customer.yaml` — the validated AI-Employee configuration
2. `onboarding-plan.md` — the specific per-engagement onboarding steps

It then validates the YAML and **stops for Captain review**. It does not provision a
Machine and it does not commit. This is the operator-side authoring step that precedes
`ai-employee/bin/provision-customer.sh` in the onboarding runbook
(`docs/runbooks/pi-firm-demo-prep.md`); it does not run it.

## Canonical sources (read these; do not re-encode them here)

This skill is a thin extractive procedure over docs that already own their content. Load
them rather than duplicating their rules:

- **Field rules + closed enums:** `docs/specs/ai-employee/customer-yaml-schema.md`
- **Scaffold to render from:** `ai-employee/customers/_template/customer.yaml`
- **Pain → skill mapping:** `docs/strategy/ai-employee-functional-shape-2026-05-13.md`
  (per-vertical task taxonomy + cross-vertical patterns)
- **Connector backend choice:** `docs/adr/0020-connector-strategy.md` (MCP-first)
- **Onboarding stages:** `docs/strategy/ai-employee-service-contract-2026-05-13.md`
  (3 phases) and `docs/specs/ai-employee/day-1-onboarding.md` (dashboard sequence)
- **The non-fabrication contract:** `references/extraction-contract.md` (load every run)

## Deltas this skill owns (not covered by the docs above)

1. **Trust-ceiling locking.** The customer.yaml validator does **not** enforce a skill's
   trust ceiling against the catalog (the `TrustCeilingExceeded` code exists but is never
   emitted — it is a provision-time check). So the discipline lives here: never raise a
   skill above its authored `metadata.smd.trust_ceiling`, and any skill whose frontmatter
   carries `trust_ceiling_locked: true` is forced to `draft_for_review` and can never be
   promoted. Detect lock via the `trust_ceiling_locked` frontmatter flag, read live from
   the skill's `SKILL.md` — never a hardcoded name list.
2. **Two-layer catalog (ADR 0022).** Base skills live in `ai-employee/skills/`; vertical
   addon skills (e.g. PI) live in `ai-employee/verticals/<vertical>/addons/<addon>/skills/`
   and are in scope **only** when the customer's `vertical`/addons select that pack. For a
   `mixed` (or any non-`law-firm`) customer, map only base skills; addon skills must not
   appear.
3. **Banned emissions.** Never emit a `composio:` connector backend (doctrine-dropped,
   ADR 0020). Never emit a `hermes_ref` fork tag — values like `v2026.5.16-smd.0` are
   rejected; the ref must match `v{YYYY}.{M}.{D}@{40-hex-sha}` (ADR 0024).

## Execution

### Step 1 — Gather inputs

Take the transcript/notes and a target customer slug. Confirm the slug with the user
(`^[a-z0-9][a-z0-9-]{0,31}$`). If `ai-employee/customers/<slug>/customer.yaml` already
exists, stop and ask whether to overwrite-with-review — never silently clobber.

### Step 2 — Load the contract

Read `references/extraction-contract.md` and restate the no-fabrication rules to yourself
before extracting anything.

### Step 3 — Extract facts (evidence-bound)

Pull only what the source states: identity, the humans with access and their roles,
**explicitly-named** tools (→ connectors), described pains (→ skills), any voice signal,
escalation contacts. Attach the verbatim quote that justifies each non-trivial value.
Anything undeterminable is a `TBD` / open-item — never an inference. Hold this in the
conversation; write an `INTENT.md` only if the Captain wants the audit trail.

### Step 4 — Map pains → skills

Using the functional-shape taxonomy and the **two-layer catalog** rule above: read each
candidate skill's `SKILL.md` frontmatter live; restrict to base skills unless the vertical
selects an addon pack; set `trust_ceiling = min(authored, requested)`; force any
`trust_ceiling_locked: true` skill to `draft_for_review`. Surface the justifying quote per
enabled skill.

### Step 5 — Decide connectors

MCP-first per ADR 0020. Emit a real `mcp:` / `build:` backend **only when the transcript
names the tool**. A capability gestured at but unnamed becomes `synthetic:<adapter>` plus
an onboarding open-item to confirm and swap. Never emit `composio:`.

### Step 6 — Render customer.yaml

Render from `ai-employee/customers/_template/customer.yaml`. Fill bracketed values; drop
PI-only blocks when `vertical != law-firm`; set the memory invariants to the slug
(`d1_namespace == <slug>`, `r2_vault_path == vaults/<slug>/`,
`vectorize_index == hermes-<slug>-vault`); set `hermes_ref` to the operator-supplied /
documented current pin (never synthesize one, never a fork tag); `model: claude-opus-4-7`
unless overridden. Keep any secret reference as a `token_ref: infisical:/...` — never an
inline value.

### Step 7 — Review gate (no file written before this)

Present the proposed `customer.yaml`, the per-field quote map, and the open-items list.
Ask the Captain to approve, revise, or cancel. Write nothing until approved.

### Step 8 — Write the artifacts

On approval, write `customer.yaml` and `onboarding-plan.md` (+ optional `INTENT.md`) to
`ai-employee/customers/<slug>/`. Emit the onboarding plan **inline from the actual enabled
connectors and skills** — a short three-phase list, not a parameterized template:

- **Phase 1 — Discovery + Access + Data audit (Day 1–5):** one OAuth/access row per
  enabled non-synthetic connector; one "confirm tool, swap synthetic → real" row per
  `synthetic:` connector; a voice-sample collection row (source TBD until the principal
  supplies one); a scope/data-audit row from `scope.*`.
- **Phase 2 — Shadow mode, observe/draft/no-send (Day 6–14):** one enablement row per
  enabled skill at its ceiling; locked skills noted as draft-for-review forever.
- **Phase 3 — Graduated autonomy (Day 15+):** promotion candidates = non-locked
  `draft_for_review` skills, gated on clean shadow runs.
  Unfilled fields render an explicit `TBD` per `docs/style/empty-state-pattern.md` — never
  invented copy.

### Step 9 — Validate

Run the canonical validator and require a clean exit:

```bash
npx tsx scripts/validate-customer-yaml.ts ai-employee/customers/<slug>/customer.yaml
```

On any error, surface every `[code] path: message`, fix, and re-run until it exits 0.

### Step 10 — Stop for review

Print the `file://` paths to the generated artifacts and the open-items summary. State
plainly that the config is **not provisioned and not committed**. If the Captain approves,
the next steps (a separate branch + PR, then provisioning) are theirs to trigger.

## Guardrails

- **NON-PROVISIONING.** This skill MUST NOT run `provision-customer.sh`, `fly`, `wrangler`,
  or `infisical`. It creates no Fly app, volume, secret, or remote resource. Provisioning
  is a separate, Captain-gated step.
- **NON-COMMITTING.** This skill MUST NOT run `git add`, `git commit`, or `git push`. It
  writes working-tree files and stops. Landing them is a separate review + PR.
- **No secret values.** Never write a literal credential into any artifact; secret
  references use the `token_ref: infisical:/...` form only.
- **Extractive only.** Honor `references/extraction-contract.md` — undeterminable facts are
  open-items, never inventions.
- **Trust ceilings.** Enforce locking here (the validator does not): `trust_ceiling_locked`
  skills stay `draft_for_review`; never exceed a skill's authored ceiling.

## Reference files

- `references/extraction-contract.md` — the P0 no-fabrication contract (load every run)
- `references/test-cases.md` — synthetic narrative intakes (SMD + adversarial)
- `scripts/validate-customer-yaml.ts` — the validation gate (in the venture repo)
- `ai-employee/customers/_template/customer.yaml` — the render scaffold (in the venture repo)
