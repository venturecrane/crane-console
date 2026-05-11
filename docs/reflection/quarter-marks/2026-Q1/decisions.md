# Decisions Document - Quarter Mark v1 (2026-Q1)

Date: 2026-05-10
Window: 2026-01-13 to 2026-05-09
Authority: Captain reflection 2026-05-10 (`captain-reflection.md`) + Phase 1-3 dossiers + Phase 3 v2 critiques + `charter.md`.

---

## The Bet

**smd.services generating sustaining revenue.**

Captain framed this as "make or break." If smd.services hits sustaining revenue, the rest of the portfolio (DC, KE, SC, DFG) remains open and re-engageable. If it does not, the future state of the operation is unresolved.

Operationally: the next cycle's primary energy goes here. All other work is subordinate unless it directly serves this bet or is required for continued operation (security gates, dependency drain, infrastructure health).

This is the first explicit Stage 2 bet. Stage 1 capability building was the precondition; the capability stack is now in place (per `critique-charter-check.md`) and the operation is entering market execution for the first time.

---

## Kept

Captain explicit:

- The whole enterprise development effort to date
- Public publication on venturecrane.com
- All five existing ventures (DC, KE, SC, DFG, SS / smd.services) - "all current ventures remain interesting to pursue" once smd.services is sustaining

Charter-anchored (per `critique-charter-check.md` Done / Working verdicts):

- crane-context worker + D1 typed-handoff ledger (ADR-025)
- Cross-machine memory layer (auto-memory + enterprise memory with FTS5 recall, per-machine cron ingest)
- Parallel session isolation system (bare-repo + worktrees + hooks + crane_worktree_doctor MCP)
- Cross-venture context for agents (multi-tenant alert scoping, `claude-projects/` instruction files)
- Content engine: 45 published articles, agents-as-voice content policy
- Operational telemetry: deploy heartbeats, fleet health audit, CI/CD alert ledger
- Security gates: Semgrep CI rolled to all six venture repos as required status check
- Kill discipline reflex (10+ documented kills in window with named replacements; `feedback_no_soft_sunset` codifies the rule)
- Skill governance: SKILL.md schema, `/skill-review` lint, `/skill-audit` cron, CI gate on skill changes
- Multi-machine Tailscale fleet (5 active machines, branch-protected, reliability-scored)
- Staging/production environment split across all workers (ADR-026)

---

## Changed

### Strategic posture: product-first SaaS -> services-first via smd.services

The original thesis was to build products, use them to generate revenue, then offer them as SaaS. The runway proved too long. Smd.services emerged as a faster path because the enterprise development unexpectedly produced a deliverable capability that maps to consultancy demand. The pivot is now explicit.

### Methodology v2 fix: Phase 3 critique prompts must include a Charter section

v1 produced wrong-yardstick critiques because the prompts lacked stage context. The pivot to charter-anchored critiques mid-cycle proved the fix. v2 methodology will require a Charter as a required input to every Phase 3 dispatch.

### Social media + marketing: from avoided to scheduled

Captain identified this as the avoided area (#3 reflection). The avoidance is explicit and stated for the record. Next-cycle allocation: campaign development capacity must be allocated after smd.services launch readiness.

### Cost telemetry: from invisible to instrumented

Sixteen weeks without monthly burn visibility (per `dossier-cost.md` and `critique-skeptic-v2.md`). Action: monthly Anthropic API and Cloudflare billing exports committed to `docs/finance/` via a cron-driven script. Owner: agents. This is the cost-dossier-v2 recommendation, accepted.

### VCMS tag normalization: from ~121 untagged to taxonomy-compliant

Findability gap (per `dossier-knowledge.md` and `critique-skeptic-v2.md`). Stage 2 retrieval will fail on the untagged notes. Action: enumerate the taxonomy in `docs/skills/vcms-tag-taxonomy.md` and run a bulk re-tag pass before next cycle.

---

## Killed

Per Captain reflection #2 ("delete? nothing yet"): **no kills this cycle.** The kill-discipline reflex remains intact; the cycle's deliberate choice is preservation while the smd.services bet runs.

The v1 Phase 3 critiques (`critique-skeptic.md`, `critique-customer.md`, `critique-successor.md`) are NOT killed. They remain on disk as the record of what wrong-yardstick critique produces, valuable for v2 methodology refinement.

---

## Hardening (Accepted-Risk Inventory)

Not killed, not changed this cycle. Documented as accepted-risk while smd.services-focused. These re-open as Hardening candidates for v2 if the bet succeeds. Per `critique-successor-v2.md`:

| Risk | Mitigation (deferred to v2) |
| --- | --- |
| GitHub App on personal account (smdurgan-llc, App ID 2619905) | Move to venturecrane org ownership |
| Memory store on mac23 only; no documented backup | Backup mechanism (S3/R2/rsync) to second machine |
| mac23 as only fleet-provisioning machine (`setup-ssh-mesh.sh` hostname check) | Remove hostname gate or replicate provisioner |
| Single Cloudflare account hosts all venture infrastructure | Documented multi-account split for DR |
| Anthropic API spend visible only to Captain | Per-worker cost attribution (part of cost telemetry change above) |
| Infisical as single secret store | Documented secondary path (sealed-secrets repo, 1Password fallback) |
| Solo reviewer on 907 PRs (agent multi-model review substitutes) | Explicit acknowledgment of substitute on smd.services; not equivalent to human peer review |

Captain has not directed remediation; these are accepted-risk for the current bet. The smd.services-success path opens this inventory for action.

---

## Authority and Signoff

Captain: Scott Durgan, Founder, Venture Crane
Date: 2026-05-10

This decisions document binds the next cycle's allocation until v2 reflection or explicit Captain override.
