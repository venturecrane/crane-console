# CCA Foundations | Gap Ledger

**Candidate:** Scott Durgan  
**Opened:** April 22, 2026  
**Exam window:** May 20-22, 2026  
**Produced by:** Venture Crane agent team

This is a living document. Update after every study session. Do not batch updates.

---

## Active Gaps

| #   | Item                               | Status  | First-Close Date | Retest-48h Date | Retest-7d Date | Final-Retest Date | Residual Notes |
| --- | ---------------------------------- | ------- | ---------------- | --------------- | -------------- | ----------------- | -------------- |
| 1   | Agentic loop mechanics             | pending | -                | -               | -              | -                 | -              |
| 2   | Hooks as deterministic enforcement | pending | -                | -               | -              | -                 | -              |
| 3   | tool_choice semantics              | pending | -                | -               | -              | -                 | -              |
| 4   | Structured error responses         | pending | -                | -               | -              | -                 | -              |
| 5   | Message Batches API                | pending | -                | -               | -              | -                 | -              |
| 6   | fork_session and --resume          | pending | -                | -               | -              | -                 | -              |
| 7   | Validation-retry loops             | pending | -                | -               | -              | -                 | -              |
| 8   | Confidence calibration             | pending | -                | -               | -              | -                 | -              |

**Status values:** pending | in-progress | partially-closed | closed

"Partially-closed" = passes oral recall and unseen-question criteria but not the code-sketch criterion. Does not trigger the retest schedule.

---

## Closed Gaps

_Empty on day 1. Items move here after passing all three self-test criteria (oral recall + unseen questions + code sketch). Include first-close date and any notes on what finally resolved the gap._

---

## New Gaps Discovered

_Empty on day 1. When study surfaces a concept not on the original weakness list, log it here immediately. Include discovery date, which session surfaced it, and a brief closure plan._

| Discovery Date | Item | Surfaced During | Domain | Closure Plan |
| -------------- | ---- | --------------- | ------ | ------------ |
| -              | -    | -               | -      | -            |

---

## Scenario-Specific Gaps

_Reserved for Phase 3 (May 13-15). One subsection per scenario. Populated during depth sessions._

### Scenario 1: Customer Support Resolution Agent

_(Not yet populated)_

### Scenario 2: Code Generation with Claude Code

_(Not yet populated)_

### Scenario 3: Multi-Agent Research System

_(Not yet populated)_

### Scenario 4: Developer Productivity with Claude

_(Not yet populated)_

### Scenario 5: Claude Code for Continuous Integration

_(Not yet populated)_

### Scenario 6: Structured Data Extraction

_(Not yet populated)_

---

## Maintenance Protocol

**When to update:**

- After every study session: update status column for items touched that session.
- When an item first-closes: fill first-close date, compute and fill retest-48h date (first-close + 2 calendar days) and retest-7d date (first-close + 7 calendar days).
- When a retest is completed: fill the retest date with the actual date. Note pass/fail in residual notes.
- When a retest fails: revert item status to in-progress. Clear the retest dates. Re-close requires passing all three criteria again from scratch.
- When new gaps are discovered: add to New Gaps Discovered immediately with discovery date and session name.
- After Phase 3 sessions: populate the relevant scenario subsection.

**Closing an item:**
The closer (the study session) confirms retention by passing all three self-test criteria. Do not mark closed based on "felt comfortable" - run the oral recall, the unseen question, and the code sketch. If any criterion fails, mark partially-closed and log what failed in residual notes.

**Retest cycle:**
Items do not leave the retest cycle until 30 days post-first-close. Given the exam sits May 20-22 and Phase 1 opens April 22, most items will not reach 30 days before the exam. The final-retest date (end of current phase) serves as the exam-readiness gate for each item.

**Moving to Closed Gaps section:**
When an item passes its final retest, cut the row from the Active Gaps table and paste it into the Closed Gaps section. Preserve all dates and residual notes.

**Practice exam integration (May 18):**
After the practice exam, re-open any item that produced a wrong answer in the exam. Even if the item was previously closed. Log it in Active Gaps with a note "re-opened: practice exam [date]" and re-run the close process.
