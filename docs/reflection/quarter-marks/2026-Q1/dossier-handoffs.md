# Dossier: Handoff Ledger

Window: 2026-01-13 to 2026-05-09 (~16 weeks)

## Total Handoff Count

- Total: 501 (API `total` field; all 501 records fetched and verified)
- By status: done=383, in_progress=97, blocked=15, null/unset=6
  - Note: ledger contains two spellings of in-progress (`in_progress` and `in-progress`) and `completed` as a synonym for `done`; normalized above
- By venture: vc=268, ss=150, dc=65, dfg=8, ke=5, sc=4, kidexpenses=1

## Sessions Per Week Trajectory

| Week start | Sessions |
| ---------- | -------- |
| 2026-01-12 | 1        |
| 2026-01-19 | 9        |
| 2026-01-26 | 9        |
| 2026-02-02 | 1        |
| 2026-02-09 | 24       |
| 2026-02-16 | 80       |
| 2026-02-23 | 30       |
| 2026-03-02 | 9        |
| 2026-03-09 | 0        |
| 2026-03-16 | 1        |
| 2026-03-23 | 66       |
| 2026-03-30 | 37       |
| 2026-04-06 | 44       |
| 2026-04-13 | 36       |
| 2026-04-20 | 53       |
| 2026-04-27 | 45       |
| 2026-05-04 | 56       |

## Theme Clusters

Themes assigned by first keyword match against summary text (single-pass classifier). Total = 501.

- Theme: **SS Product Build**
  - Count: 150
  - Examples: "V3 /book chat redesign - three-state shell (intro to chat to closed)"; "Fixed booking dual-write and magic-link org-scoped auth end-to-end with atomic single-use consumption"; "SignWell webhook verification fix + PDF signing page SOW template"

- Theme: **Skill & Command Infrastructure**
  - Count: 126
  - Examples: "Skill triplet dirty-state gitignore fix - git rm -r --cached + gitignore all three"; "Promoted 7 ss-only commands to canonical .claude/commands/"; "EOS surface verification gate (4 layers) merged"

- Theme: **CI/CD Pipeline & GitHub Actions**
  - Count: 81
  - Examples: "Dependabot drain 47 -> 0 open majors via auto-merge after CI fixes"; "4-layer CI break in deploy pipeline triaged and cleared"; "Machine-health check added claude_auth detection"

- Theme: **Security Gate & Vulnerability Remediation**
  - Count: 38
  - Examples: "Semgrep CI gate rolled to all 6 venture repos in parallel"; "dc-console XSS fixed server-side + Clerk middleware bypass via npm audit fix"; "Durable git-friction fix shipping - policy walls on rebase + force-push"

- Theme: **DC Venture Product Build**
  - Count: 27
  - Examples: "Pre-launch waitlist initiative across DC/KE/DFG/SC shipped to production"; "crane-test-harness rollout complete across 6 repos in parallel sprint"; "Redesigned populated dashboard to match approved warm literary design"

- Theme: **MCP & Worker Infrastructure**
  - Count: 20
  - Examples: "Quarter Mark v1 methodology merged to main (PR #913)"; "Enterprise-wide @venturecrane/\* tarball URLs migrated to GitHub Packages npm registry"; "Cloudflare Workers build & deploy CRIT alerts cleared"

- Theme: **Fleet & Machine Ops**
  - Count: 10
  - Examples: "Claude Code --chrome flag and Playwright MCP for fleet agents confirmed"; "Operator Transparency article drafted and published on venturecrane.com"; "Cadence scope fix shipped - schedule briefing query corrected"

- Theme: **Enterprise Design System**
  - Count: 7
  - Examples: "Design system rollout article shipped; @venturecrane/tokens v0.1.0 graduated"; "Stitch MCP auth confirmed on m16 - all 10 Stitch tools responding"; "Recurring STITCH_API_KEY / Stitch MCP failure root-caused and fixed"

- Theme: **Content & Editorial Pipeline**
  - Count: 6
  - Examples: "Parsed LLM responses into structured snippet list with source references (dc-api)"; "14 stale blog tracking issues closed; 'Multi-Model Code Review' article published"; "em dashes removed across vc-web (14 files)"

- Theme: **Memory, Knowledge & VCMS**
  - Count: 3
  - Examples: "Case studies section built for ss-console homepage"; "The Gravity Test strategic plan committed to venturecrane.com"; "MEMORY.md backup/restore system implemented"

- Theme: **Other / Cross-Cutting**
  - Count: 33
  - Examples: "Anthropic Partner Network solo+AI-agent policy research"; "Worktree leak diagnosed - /eos never fired exit on PR #789"; "Re-invocation of /eos on already-ended session (no work performed)"

## Recurring Blockers

Counts reflect keyword scanning across all 501 handoff summaries (not status=blocked alone).

1. **"Next session pickup" / continuation handoffs** - 185 occurrences. Sessions ended in_progress with explicit numbered pickup lists rather than status=done.
2. **SignWell / external API auth failures** - 75 occurrences. Recurs across SS sessions: webhook secret mismatch, OAuth token scope gaps, API key vs. OAuth mismatch.
3. **Unresolved CI/CD alerts backlog** - 41 occurrences. 81 unresolved critical/warning alerts by window end; sc-console alone carried 40. Background noise throughout.
4. **Dependabot PR backlog** - 36 occurrences. Peaked at 47 open PRs on crane-console; repeated theme of stale dependency PRs blocking clean CI.
5. **Open PRs awaiting captain review / merge** - 32 occurrences. Sessions ended with 2-5 PRs open but unmerged, requiring next-session pickup or captain action.

## Data Sources Used

- **Primary:** `GET https://crane-context.automation-ab6.workers.dev/handoffs?created_after=2026-01-13T00:00:00Z&limit=100` with cursor pagination - 6 pages, 501 records fetched
- **API total field:** confirmed 501 (matches fetched count)
- **crane_sos(venture: "vc"):** used for initial briefing and most-recent handoff slice
- **crane_schedule(action: "session-history", days: 120):** returned HTTP 400 - not used
- **Local worker source** (`workers/crane-context/src/handoffs.ts`): consulted to understand available query modes (date-range filter is supported as Mode 5)
- **Theme classification:** single-pass keyword classifier in Python across full 501-record corpus
- **Blocker counts:** keyword frequency scan across all summary text, not semantic analysis
