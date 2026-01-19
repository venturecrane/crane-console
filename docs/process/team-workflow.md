# Venture Crane Team Workflow

**Version:** 1.8  
**Date:** January 16, 2026  
**Status:** APPROVED

---

## Principles

1. **Single spine:** GitHub is the source of truth for all work items
2. **Nothing is real until it's in GitHub:** No work starts without an issue, no code merges without a PR
3. **Templates beat meetings:** Standardized formats reduce interpretation errors
4. **Labels drive routing:** Namespaced labels determine status and who needs to act
5. **Status is exclusive:** Only one `status:*` label at a time
6. **One system:** GitHub Issues + GitHub Projects = zero sync overhead
7. **Captain never touches GitHub:** All GitHub updates flow through PM Team via Crane Relay or Dev Team directly
8. **Velocity over ceremony:** PM Team handles both requirements and verification (no separate QA handoff)
9. **Grade determines method:** QA verification method matches the work type, not one-size-fits-all (v1.8)

---

## Related Documentation

- `AGENT_PERSONA_BRIEFS.md` - Role definitions, quality bars, handoff protocols
- `DEV_DIRECTIVE_PR_WORKFLOW.md` - PR-based development requirements
- `DEV_DIRECTIVE_QA_GRADING.md` - QA grade assignment and routing **(v1.8)**
- `EOD_SOD_PROCESS.md` - End of day / start of day discipline and handoffs
- `slash-commands-guide.md` - Claude Code CLI automation commands
- `parallel-dev-track-runbook.md` - Multi-instance parallelization setup
- `CRANE_RELAY_API.md` - Shared infrastructure API reference

---

## Team Structure

| Team | Tool | Primary Responsibility |
|------|------|------------------------|
| Dev Team | Claude Code (Desktop) | Implementation, PRs, technical decisions |
| PM Team | Claude Desktop | Requirements, prioritization, **verification**, **merges on Captain directive**, GitHub updates via relay |
| Auxiliary PM | ChatGPT Desktop | Strategic input, second opinions |
| Advisor | Gemini Web | Operator perspective, risk assessment |
| Captain | Human | Routing directives between teams, approvals, final decisions |

### Key Principle (v1.5+)

PM Team can execute merges via Chrome automation when Captain gives direct approval. This:
- Eliminates routing overhead for simple verified merges
- Keeps momentum when Dev Team isn't immediately available
- Captain retains approval authority - PM only merges on explicit Captain directive

### Captain Role - Explicit Boundaries

**Captain DOES:**
- Route directives between teams (copy/paste handoffs)
- Make final decisions on scope, priority, and direction
- Approve work progression between phases
- Provide context and answer questions
- **Order merges** (PM Team executes on Captain's directive)

**Captain does NOT:**
- Update GitHub labels (PM Team does this via relay)
- Close issues (PM Team does this via relay)
- Create issues (PM Team does this via relay)
- Interact with GitHub directly in any way

---

## PM Team Modes

PM Team operates in three modes. Mode switching happens based on workflow state.

### PM Mode (Default)
- **Mindset:** Generative, collaborative
- **Focus:** Requirements, specs, prioritization
- **Output:** Issues, acceptance criteria, agent briefs
- **Bias:** Optimistic (what should we build?)

### QA Mode (Triggered by "code complete")
- **Mindset:** Critical, skeptical
- **Focus:** Does the implementation match the ACs?
- **Output:** Pass/fail verdicts, bug reports
- **Bias:** Skeptical (what could be wrong?)

### Merge Mode (Triggered by Captain's merge directive)
- **Mindset:** Careful, checklist-driven
- **Focus:** Execute merge safely
- **Output:** Merged PR, closed issue
- **Bias:** Defensive (verify before acting)

### Mode Switching Protocol

**Entering QA Mode** (Dev reports "PR ready" or "code complete"):
1. **CHECK GRADE** - Read QA grade label to determine verification method (v1.8)
2. **LOAD CONTEXT** - Fetch issue, re-read ACs as if you didn't write them
3. **PREPARE ENVIRONMENT** - Navigate to app/preview URL (if grade requires it)
4. **EXECUTE TESTS** - Test each AC per grade method, capture evidence as needed
5. **SUBMIT RESULTS** - Use `/v2/events` endpoint with verdict and scope_results
6. **NOTIFY CAPTAIN** - Summary of results, next action needed

**Entering Merge Mode** (Captain says "merge" or "proceed with merge"):
1. **VERIFY CHECKLIST** - Confirm all merge prerequisites
2. **EXECUTE MERGE** - Via Chrome automation on GitHub PR page
3. **UPDATE STATUS** - Apply `status:done`, close issue via relay
4. **CONFIRM COMPLETION** - Report merge complete to Captain

### Mitigating Same-Session Bias

Since PM writes ACs and tests them:
- Re-read ACs literally, not from memory of intent
- Ask "what could go wrong that isn't covered?"
- Test edge cases beyond explicit ACs (note as observations, don't block on them)
- If something feels wrong but ACs pass, note it - judgment matters

---

## Artifact Locations

| Artifact | Location | Format |
|----------|----------|--------|
| Story/Bug requirements | GitHub Issue | Issue template |
| Acceptance criteria | GitHub Issue | Checklist in issue |
| Implementation handoff | PR description | PR template |
| Code changes | GitHub PR | Code + tests |
| QA results | GitHub Issue (rolling comment) | Via /v2/events |
| Architecture decisions | `/docs/adr/` | ADR-XXXX.md |
| PM specifications | `/docs/pm/` | Markdown |
| Process documentation | `/docs/process/` | Markdown |
| Sprint board | GitHub Projects | Board view |
| Points tracking | GitHub Projects | Custom field |

---

## Label Taxonomy (Namespaced)

### Status Labels (EXCLUSIVE - only one at a time)

| Label | Meaning |
|-------|---------|
| `status:triage` | New, needs prioritization |
| `status:ready` | Approved, ready for development |
| `status:in-progress` | Dev actively working |
| `status:review` | PR open, code review |
| `status:qa` | Under QA verification |
| `status:verified` | QA passed, ready to merge |
| `status:done` | Merged AND deployed |
| `status:blocked` | Blocked by dependency |

### Routing Labels (ADDITIVE - can have multiple)

| Label | Meaning |
|-------|---------|
| `needs:pm` | Waiting for PM decision/input |
| `needs:dev` | Waiting for Dev fix/answer |
| `needs:qa` | Ready for QA verification |

### QA Grade Labels (EXCLUSIVE - exactly one required at `status:qa`) (v1.8)

| Label | Meaning | Verification Method |
|-------|---------|---------------------|
| `qa:0` | Automated only | CI green = pass. No manual verification. |
| `qa:1` | CLI/API verifiable | curl, gh CLI, DB queries. No browser needed. |
| `qa:2` | Light visual | Quick spot-check, single screenshot. |
| `qa:3` | Full visual | Complete walkthrough, full evidence capture. |

### Other Labels

- **Type:** `type:story`, `type:bug`, `type:tech-debt`, `type:question`
- **Priority:** `prio:P0`, `prio:P1`, `prio:P2`, `prio:P3`
- **Sprint:** `sprint:n`, `sprint:n+1`, `sprint:backlog`
- **Component:** `component:{venture}-{service}` (e.g., `component:dfg-app`)

---

## Workflow: Story Lifecycle

### Phase 1: Definition (PM Team)

1. PM creates GitHub Issue via relay using Story template
2. PM fills out: Summary, Operator Impact, Acceptance Criteria, Out of Scope
3. PM fills out **Agent Brief** section (for easy copy/paste to Dev)
4. Issue auto-labeled: `type:story`, `status:triage`
5. PM adds: priority label, sprint label via relay

**Gate:** Issue has Agent Brief filled before moving to `status:ready`

### Phase 2: Ready (PM Team + Captain)

1. Captain reviews issue for completeness
2. Captain approves for development
3. PM changes label via relay: `status:triage` -> `status:ready`
4. Captain copies Agent Brief, pastes to Dev Team window

**Gate:** Issue has `status:ready` before Dev starts

### Phase 3: Development (Dev Team)

1. Dev changes label: `status:ready` -> `status:in-progress`
2. Dev creates branch from main
3. Dev implements, commits, pushes to branch
4. Dev creates PR using PR template (include `Closes #XXX` to link issue)
5. Dev waits for preview deployment (1-2 min)
6. Dev fills out PR: Summary, How to Test, Screenshots, **Preview URL**
7. **Dev assigns QA grade label:** `qa:0`, `qa:1`, `qa:2`, or `qa:3` (v1.8)
8. Dev changes label: `status:in-progress` -> `status:qa`
9. Dev adds label: `needs:qa`
10. Dev notifies Captain with: issue #, PR #, **QA grade**, preview URL, commit SHA (v1.8)

**Gate:** PR passes CI AND has QA grade label before `status:qa` (v1.8)

**Warning: No direct pushes to main.** All changes must go through PR -> preview -> QA -> merge.

### Phase 4: Verification (Routing by QA Grade) (v1.8)

Verification method depends on QA grade assigned by Dev. PM may override grade if needed.

#### qa:0 — Automated Only

1. CI must be green
2. No manual verification required
3. Captain can direct merge immediately after CI passes
4. PM updates labels: `status:qa` -> `status:verified`

#### qa:1 — CLI/API Verification

1. Captain routes to Dev Team for self-verify OR PM for CLI verification
2. Verifier runs commands specified in handoff (curl, gh, DB queries)
3. Verifier confirms expected results
4. Verifier submits results via `/v2/events` or reports to Captain
5. On PASS: `status:qa` -> `status:verified`

#### qa:2 — Light Visual

1. Captain tells PM Team: "Issue #X ready for QA"
2. PM navigates to preview URL
3. PM performs quick spot-check per ACs
4. PM captures single screenshot as evidence
5. PM submits results via `/v2/events`
6. On PASS: auto-transitions to `status:verified`

#### qa:3 — Full Visual (Original Flow)

1. Captain tells PM Team: "Issue #X ready for QA" with PR # and preview URL
2. PM switches to **QA Mode**
3. PM navigates to **preview URL** (NOT production)
4. PM tests each Acceptance Criterion:
   - Capture screenshot evidence for each
   - Record PASS/FAIL per AC
5. PM submits results via `/v2/events`:
   ```bash
   POST /v2/events
   {
     "event_id": "qa_{issue}_{timestamp}",
     "repo": "{org}/{repo}",
     "issue_number": {issue},
     "role": "QA",
     "agent": "PM-QA-Claude",
     "event_type": "qa.result_submitted",
     "overall_verdict": "PASS|FAIL",
     "build": { "commit_sha": "{sha}" },
     "scope_results": [
       { "id": "AC1", "status": "PASS|FAIL", "notes": "..." }
     ]
   }
   ```
6. V2 relay automatically:
   - Stores event in D1
   - Creates/updates rolling status comment on issue
   - Applies label transitions (PASS -> `status:verified`, FAIL -> `needs:dev`)

**Gate:** All AC verified before `status:verified`

### Phase 5: Merge (PM Team on Captain Directive)

**Option A: Captain directs PM to merge**
1. Captain sees `status:verified` and tells PM: "merge it" or "proceed with merge"
2. PM switches to **Merge Mode**
3. PM verifies checklist:
   - [ ] `status:verified` label present
   - [ ] QA rolling comment shows PASS (or CI green for qa:0)
   - [ ] CI is green
   - [ ] No linked `prio:P0` bugs open
4. PM navigates to PR via Chrome automation
5. PM clicks merge button
6. PM changes label via relay: `status:verified` -> `status:done`
7. PM closes issue via relay
8. PM confirms to Captain: "Issue #X merged and closed"

**Option B: Captain routes to Dev Team**
1. Captain sees `status:verified` and routes merge directive to Dev Team
2. Dev confirms checklist and merges
3. Dev confirms merge complete to Captain
4. PM changes label via relay: `status:verified` -> `status:done`
5. PM closes issue via relay

**Key distinction:**
- `status:verified` = QA passed, PR still open, ready to merge
- `status:done` = Merged AND deployed to production

---

## Workflow: Bug Lifecycle

### Phase 1: Discovery (Any Team)

1. Discoverer reports bug to PM Team
2. PM creates GitHub Issue via relay using Bug template
3. PM fills out: Summary, Steps to Reproduce, Evidence
4. Issue auto-labeled: `type:bug`, `status:triage`
5. PM links to related story (if applicable)

### Phase 2: Triage (PM Team)

1. PM reviews bug
2. PM assigns priority via relay: `prio:P0`, `prio:P1`, `prio:P2`, `prio:P3`
3. PM changes label via relay: `status:triage` -> `status:ready`
4. PM adds sprint label via relay
5. PM adds `needs:dev` via relay

### Phase 3-5: Same as Story

---

## Communication Patterns

### Captain -> Dev Team

**Trigger:** Issue is `status:ready` + `needs:dev`

**Method:**
1. Captain copies **Agent Brief** section from issue
2. Captain pastes to Dev Team window
3. Dev acknowledges and begins work

### Dev Team -> PM Team (via Captain)

**Trigger:** PR has `status:qa` + `needs:qa`

**Method:**
1. Dev reports "PR ready" with: issue #, PR #, **QA grade**, **preview URL**, commit SHA (v1.8)
2. Captain routes based on grade:
   - `qa:0`: Direct merge after CI green
   - `qa:1`: Route to Dev self-verify or PM CLI check
   - `qa:2`/`qa:3`: Tell PM Team "Issue #X ready for QA"
3. Verifier proceeds per grade method

### PM Team -> Dev Team (Bug Found)

**Trigger:** QA fails an AC

**Method:**
1. PM submits FAIL verdict via `/v2/events` (auto-adds `needs:dev`)
2. PM creates bug issue via relay if needed (links to story)
3. Captain routes bug details to Dev Team

### Captain -> PM Team (Merge Directive)

**Trigger:** Issue has `status:verified`

**Method:**
1. Captain tells PM: "merge it" or "proceed with merge"
2. PM enters Merge Mode and executes

---

## Captain's Daily Routine

### What Captain Checks

| What | How |
|------|-----|
| Triage queue | PM reports issues needing review |
| Waiting on PM | PM handles via relay |
| Ready for QA | Check grade, route appropriately (v1.8) |
| Merge-ready | Tell PM to merge OR route to Dev |
| Blockers | Investigate and decide |
| P0 emergencies | Drop everything, route immediately |

### Routing Actions (v1.8 Updated)

| I see... | I do... |
|----------|---------|
| Issue needs review | Review and approve/reject, PM updates labels |
| `needs:pm` | Answer question or delegate to PM Team |
| `status:qa` + `qa:0` | Verify CI green, direct merge |
| `status:qa` + `qa:1` | Route to Dev self-verify or PM CLI check |
| `status:qa` + `qa:2` | Tell PM Team to do quick visual check |
| `status:qa` + `qa:3` | Tell PM Team to do full verification |
| `status:verified` | Tell PM to merge OR route to Dev Team |
| `status:blocked` | Investigate blocker, make decision |
| `prio:P0` | Drop everything, route immediately |

---

## Multi-Track Operations

When running parallel PM threads, each thread manages a subset of issues identified by the Track field on the project board.

### SOD Prompt Format

```
{Venture} PM SOD Track {N}
```

Examples: `SC PM SOD Track 1`, `DFG PM SOD Track 2`

### Board Reference

| Venture | Org | Project | Query Base |
|---------|-----|---------|------------|
| VC | venturecrane | 1 | `gh project item-list 1 --owner venturecrane` |
| SC | siliconcrane | 1 | `gh project item-list 1 --owner siliconcrane` |
| DFG | durganfieldguide | 1 | `gh project item-list 1 --owner durganfieldguide` |

### Query Patterns

```bash
# Your track's issues (replace ORG and N)
gh project item-list 1 --owner {ORG} --format json | jq '.items[] | select(.track == N) | {number: .content.number, title: .content.title}'

# Unassigned issues
gh project item-list 1 --owner {ORG} --format json | jq '.items[] | select(.track == null) | {number: .content.number, title: .content.title}'

# All issues with track info
gh project item-list 1 --owner {ORG} --format json | jq '.items[] | {number: .content.number, title: .content.title, track: .track}'
```

**Note:** Track is a NUMBER. Use `== 1` not `== "1"`.

### Query via Relay (for environments without gh CLI)

```bash
# Your track's issues
curl -sS "https://crane-relay.automation-ab6.workers.dev/project/items?org={ORG}&project=1&track={N}" \
  -H "Authorization: Bearer {token}"

# All issues (no track filter)
curl -sS "https://crane-relay.automation-ab6.workers.dev/project/items?org={ORG}&project=1" \
  -H "Authorization: Bearer {token}"

# Unassigned issues
curl -sS "https://crane-relay.automation-ab6.workers.dev/project/items?org={ORG}&project=1&track=null" \
  -H "Authorization: Bearer {token}"
```

### PM Thread Actions on SOD

1. Parse prompt: venture → org, track number
2. Query your track's issues using pattern above
3. Review `status:*` labels to understand current state
4. Start with highest priority open issue
5. Follow standard workflow

### Recovery

Same prompt. GitHub state is the source of truth.

### EOD

Standard EOD process. Report to Captain:

```
Track {N} EOD
- Completed: #X, #Y
- In Progress: #Z (PR #N, status:qa)
- Blocked: none
```

### Coordination

- Dependencies: document in issue description
- Cross-track blocks: `status:blocked` + note in issue
- Questions: route through Captain

---

## Definition of Ready (DoR)

A story is READY for development when:

- [ ] GitHub Issue exists with complete template
- [ ] Summary clearly states what and why
- [ ] Acceptance Criteria are specific and testable
- [ ] Out of Scope is defined
- [ ] **Agent Brief is filled out** (ready for copy/paste)
- [ ] Priority and sprint labels assigned
- [ ] `status:ready` label applied

---

## Definition of Done (DoD)

A story is DONE when:

- [ ] PR merged to main
- [ ] All Acceptance Criteria verified per QA grade method (v1.8)
- [ ] Rolling status comment shows PASS verdict (or CI green for qa:0)
- [ ] No open P0/P1 bugs linked to story
- [ ] Issue closed with `status:done` label
- [ ] Deployed to production

---

## Merge Checklist (PM Team)

Before merging any PR:

- [ ] Captain has given explicit merge directive
- [ ] `status:verified` label is present
- [ ] QA verification complete per grade method (v1.8)
- [ ] CI is green
- [ ] No linked issues with `prio:P0` or `prio:P1` are open
- [ ] PR description is complete (How to Test, Screenshots)

---

## V2 Relay Integration

PM Team uses Crane Relay V2 endpoints for structured QA reporting:

| Endpoint | Purpose |
|----------|---------|
| `POST /v2/events` | Submit QA results with automatic label transitions |
| `POST /v2/evidence` | Upload screenshots (optional) |
| `GET /v2/evidence/:id` | Retrieve evidence |

**Benefits over V1:**
- Structured event storage (audit trail)
- Automatic label transitions (PASS -> verified, FAIL -> needs:dev)
- Rolling status comments (single comment updated per issue)
- Idempotent submissions (safe to retry)

See `CRANE_RELAY_API.md` for full endpoint documentation.

---

## FAQ

**Q: Why did we consolidate PM and QA?**
A: Velocity. A separate QA Team with no project context requires extensive handoff documentation. PM Team already has context, Chrome access, and bash_tool for relay calls. At early stages, speed matters more than independent verification.

**Q: Doesn't same-person-writes-and-tests create blind spots?**
A: Yes, potentially. We mitigate by: re-reading ACs literally, asking "what could go wrong?", and noting observations beyond ACs. Captain can request independent review for high-risk changes.

**Q: Why can PM merge now?**
A: Eliminates routing overhead. When QA passes and Captain approves, PM can execute immediately via Chrome automation instead of waiting for Dev Team handoff. Captain retains approval authority.

**Q: Where do QA results go?**
A: V2 relay creates a rolling status comment on the GitHub issue. All events stored in D1 for audit trail.

**Q: What if an AC can't be tested (data constraints)?**
A: Mark as SKIPPED with notes explaining why. Don't block the whole PR. Discuss with Captain if critical.

**Q: What if I find a bug outside the ACs?**
A: Note it as an observation. If minor, don't block. If significant, discuss with Captain whether to file separately or block.

**Q: Why QA grades? (v1.8)**
A: Not all work needs visual verification. API changes don't need Chrome. Refactors with tests don't need manual checks. Grading routes work to the right verification method, eliminating the Chrome automation bottleneck for work that doesn't need it.

**Q: Who assigns QA grade? (v1.8)**
A: Dev Team assigns at PR creation based on the work type. PM can override at QA time if they disagree. When uncertain, grade higher.

**Q: What if Dev grades too low? (v1.8)**
A: PM catches it during verification and upgrades the grade. If it becomes a pattern, Captain addresses with Dev Team.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.8 | Jan 16, 2026 | Added QA grading system (qa:0-3), routing by grade |
| 1.7 | Jan 15, 2026 | Added track labels and multi-track operations |
| 1.6 | Jan 9, 2026 | All changes through PR, QA on preview URLs |
| 1.5 | Jan 2026 | PM Team can merge on Captain directive |
| 1.4 | Dec 2025 | Consolidated PM and QA roles |
