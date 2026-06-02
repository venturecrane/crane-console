# Dossier: Knowledge Inventory

Window: 2026-01-13 to 2026-05-09 (~16 weeks)

## VCMS Notes

- Total notes: 175
- By tag (top 8 queried):

| Tag                     | Count |
| ----------------------- | ----- |
| code-review             | 24    |
| executive-summary       | 8     |
| methodology             | 9     |
| prd                     | 5     |
| strategy                | 5     |
| governance              | 2     |
| bio                     | 1     |
| (untagged / other tags) | ~121  |

- Notes created in window: n/a — VCMS does not expose creation date filter; all 175 notes visible are assumed within or near window based on ID ordering

## Runbooks

- Total runbooks under `docs/runbooks/`: 9
- Topics (filenames):
  - ac-tick-workflow-rollout.md
  - blink-shell-quick-start.md
  - claude-design-enterprise-setup.md
  - clerk-playwright-auth-setup.md
  - index.md
  - new-box-onboarding.md
  - new-environment-setup.md
  - new-mac-setup.md
  - pm-container-tls-troubleshooting.md

## Docs Tree (top 2 levels)

```
docs/
├── adr/                        (2 ADRs + index)
├── anthropic-partnership/      (curriculum, engagements, gap-ledger, operating-model, qualification, the-ten + briefs/ + outbound/)
├── ci-verification/
├── claude-projects/            (per-venture project instruction files: dc, dfg, ke, sc, smd, ss, vc)
├── company/                    (company-overview, disaster-recovery, financial-dashboard, strategic-planning)
├── design-system/              (adoption/, components/, patterns/, governance, overview, token-taxonomy, current-state, enterprise-scoping, proposal)
├── design/                     (brief, charter, contributions/round-1/, ventures/dc|dfg|ke|sc|smd|vc)
├── enterprise/                 (ventures/ with per-venture executive summaries)
├── exports/
├── global/                     (verify.md)
├── handoffs/
├── infra/                      (github-packages-auth, machine-inventory, mcp-surfaces, secrets-management, secrets-rotation-runbook)
├── instructions/               (claude-design, coding-standards, content-policy, creating-issues, design-system, eos-gate, fleet-ops, git-guardrails, guardrails, operating-ethos, secrets, session-reflexes, tooling, wireframe-guidelines)
├── memory/                     (governance.md)
├── operations/                 (design-branding, operating-cadence, operating-principles, product-portfolio, shared-infrastructure)
├── planning/
├── pm/                         (prd-contributions/ rounds 1-3 with 6 roles each, prd-draft, prd)
├── process/                    (30+ files: team-workflow, pr-workflow, fleet-orchestration, multi-agent-coordination, mcp-server-architecture, session-lifecycle, etc.)
├── reflection/
├── research/                   (claude-p-automation, coding-standards audits, content-distribution-strategy, enterprise-design-system-survey, mcp-server-evaluation, puppeteer-evaluation, venture-eslint-adoption-audit)
├── reviews/                    (dated code-review and retrospective files)
├── runbooks/                   (9 files; see above)
├── skills/                     (governance.md, deprecated.md)
├── standards/                  (api-structure-template, docs-standard, golden-path, nfr-assessment-template, product-stack-standard, remediation-playbook)
├── templates/
└── ventures/                   (per-venture dirs: dc, dfg, ke, sc, smd, ss, vc; each with index, metrics, product-overview, roadmap)
```

## Net-New Doc Files Added in Window

- Total: 256
- Top 20 by path:

| Path                                                                       |
| -------------------------------------------------------------------------- |
| docs/adr/025-crane-context-worker.md                                       |
| docs/adr/026-environment-strategy.md                                       |
| docs/adr/index.md                                                          |
| docs/anthropic-partnership/README.md                                       |
| docs/anthropic-partnership/briefs/venturecrane-site-audit.md               |
| docs/anthropic-partnership/briefs/venturecrane-site-positioning-pattern.md |
| docs/anthropic-partnership/curriculum.md                                   |
| docs/anthropic-partnership/engagements.md                                  |
| docs/anthropic-partnership/gap-ledger.md                                   |
| docs/anthropic-partnership/operating-model.md                              |
| docs/anthropic-partnership/outbound/partner-support-initial-question.md    |
| docs/anthropic-partnership/qualification.md                                |
| docs/anthropic-partnership/the-ten.md                                      |
| docs/legacy-vault-cloudflare-cleanup.md                                    |
| docs/legacy-vault-migration-complete.md                                    |
| docs/blink-shell-quick-start.md                                            |
| docs/ci-verification/semgrep-initial-canary.md                             |
| docs/claude-projects/README.md                                             |
| docs/claude-projects/dc.md                                                 |
| docs/claude-projects/dfg.md                                                |

(showing first 20 of 256 total; remainder spans design-system/, company/, ventures/, instructions/, process/, standards/, research/, reviews/, runbooks/, and reflection/ directories)

## Memory Entries (already covered by Phase 1.3 — Memory Miner)

Skip; delegate to Memory Miner dossier.

## Data Sources Used

- `crane_notes()` for total count (175 notes)
- `crane_notes(tag: "executive-summary")` (8 results)
- `crane_notes(tag: "prd")` (5 results)
- `crane_notes(tag: "code-review", limit: 50)` (24 results)
- `crane_notes(tag: "strategy")` (5 results)
- `crane_notes(tag: "methodology")` (9 results)
- `crane_notes(tag: "bio")` (1 result)
- `crane_notes(tag: "governance")` (2 results)
- `find docs/runbooks -name '*.md'` (9 files)
- `ls -d docs/*/` (20 top-level directories)
- `git log origin/main --since=2026-01-13 --diff-filter=A --name-status -- 'docs/'` (256 net-new `.md` files)
- Inaccessible: VCMS does not expose creation-date filtering; tag distribution is partial (top 8 tags queried only; remaining ~121 notes carry unlisted or no tags)
