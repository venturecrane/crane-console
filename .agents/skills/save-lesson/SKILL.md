---
name: save-lesson
description: Capture a memoryable lesson or anti-pattern from the current session into the enterprise memory system (VCMS). Agent drafts frontmatter from session context; Captain confirms before save.
version: 1.0.0
scope: enterprise
owner: captain
status: stable
depends_on:
  mcp_tools:
    - crane_skill_invoked
    - crane_memory
---

# /save-lesson - Capture Session Lesson

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "save-lesson")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Capture a memoryable lesson or anti-pattern from this session into the enterprise memory system. Agent drafts the memory; Captain confirms before it is written.

After filing runs `/eos`, the recommended capture path for routine session learning is the "Memoryable moments?" step at session close. Use `/save-lesson` when you want to capture something immediately, mid-session, without waiting for `/eos`.

## Usage

```
/save-lesson [optional one-line summary]
```

## Execution Steps

### Step 1: Telemetry

Call `crane_skill_invoked(skill_name: "save-lesson")`.

### Step 2: Parse arguments

Parse `$ARGUMENTS` as an optional one-line summary.

- If a summary is provided, use it as the seed for the draft body.
- If empty, scan the last 10 messages of the session transcript for the most operationally significant event — a correction made, an unexpected failure, a gotcha discovered, an anti-pattern avoided. Draft a one-line summary from that context.

### Step 3: Infer frontmatter from session context

Infer the following fields from the session transcript and environment:

**kind** — default `lesson`. Use `anti-pattern` if the summary contains "don't", "never", "avoid", "stop", or "do not".

**scope** — default `enterprise`. Use `venture:<code>` for any rule that only applies inside one venture, including: marketing voice and positioning, business-model rules, page-level copy patterns, and venture-specific code (API contracts, data models). Use `global` if the learning applies outside the Venture Crane enterprise (e.g., a third-party tool gotcha).

**Why scope matters:** the SOS injection path filters by `scope === 'enterprise' || scope === 'global' || scope === 'venture:<active_venture>'` (`packages/crane-mcp/src/tools/memory.ts` recall path). An enterprise-scoped memory surfaces in **every** venture's session. A SMD-positioning rule filed at `enterprise` scope will inject into KE/VC/SC/etc sessions where it does not apply. When in doubt about whether a rule generalizes across ventures, narrow to `venture:<code>` — Captain can promote it to `enterprise` later via `/memory-audit`.

**severity** — required only for `anti-pattern`. Infer:

- `P0` — data loss, security exposure, or production outage risk
- `P1` — significant wasted time or correctness risk
- `P2` — workflow friction

**applies_when.skills** — list any skill names mentioned or invoked in the relevant session window (e.g., `["eos", "ship"]`). Omit if no specific skills are relevant.

**applies_when.commands** — list any CLI commands prominent in the relevant context (e.g., `["git", "wrangler"]`). Omit if none.

**applies_when.files** — list abbreviated stems of file paths touched in the relevant session window (e.g., `[".infisical*", "wrangler.toml"]`). Omit if none.

**supersedes_source** — if the lesson was derived from a specific retrospective or incident file, include its path.

### Step 4: Draft body

Write 1-2 sentences:

1. What to do (or not do) — concrete and actionable.
2. Why — the failure mode or benefit this rule prevents or produces.

Show the full proposed memory to the Captain for confirmation:

```
Proposed memory:
  kind: {kind}
  scope: {scope}
  severity: {P0/P1/P2 or omitted}
  applies_when: {json summary}
  body: "{draft body}"

Save this memory? (y/n)
```

Wait for Captain response before proceeding.

### Step 5: Apply the 3 memoryability tests

Before calling save, verify all three tests hold:

1. **Actionable** — tells a future agent what to do or avoid, not how someone felt.
2. **Non-obvious** — not derivable from reading the codebase or default Claude reasoning.
3. **General enough to recur** — applies to a class of situations, not a single accident.

If any test fails, report which one failed and explain why, then suggest a refinement. Do not proceed to save until the draft passes all three or the Captain explicitly overrides.

### Step 5b: Scope/name consistency check

Before calling save, verify both:

1. **If `scope: enterprise` or `global`:** the proposed `name` must NOT encode a single venture's code (current codes: `vc`, `sc`, `dfg`, `ke`, `smd`, `ss`, `dc`) as a prefix or suffix (e.g., `ke-`, `ss-`, `-for-ke`, `-for-ss`). The name should be venture-agnostic. If the rule truly applies cross-venture, the name must read as such.
2. **If `scope: venture:<code>`:** the `venture` field (passed to `crane_memory(action: 'save')`) must equal `<code>`. Both fields populated, both consistent.

If a venture marker appears in the name despite an enterprise scope, either rename (drop the marker) or rescope (narrow to `venture:<code>`). Mismatched name and scope is the failure mode that surfaces SMD-positioning rules in KE sessions.

### Step 6: Save

Call `crane_memory(action: 'save', ...)` with:

```yaml
name: { kebab-case identifier derived from body — strip venture markers if scope is enterprise/global }
description: { one-sentence purpose, same as body sentence 1 }
kind: { inferred kind }
scope: { inferred scope }
venture: { the venture code, e.g. "ss" — REQUIRED when scope is venture:<code>; omit otherwise }
owner: captain
status: draft
captain_approved: false
version: 1.0.0
severity: { if anti-pattern }
applies_when: { inferred }
supersedes_source: { if applicable }
last_validated_on: { today ISO date }
```

Note: `/save-lesson` always saves `status: draft, captain_approved: false`. The `/eos` path is the only path that creates `captain_approved: true` memories at write time. Captain promotes drafts to injection-eligible via the weekly `/memory-audit` review flow.

### Step 7: Report

```
Memory saved (draft).
ID: {note_id}
Kind: {kind} | Scope: {scope} | Status: draft
To promote for always-on SOS injection: approve via /memory-audit or crane_memory(update, id, captain_approved: true)
```

## Key Principle

Zero nagging. If the Captain declines the proposed memory (Step 4 response is "n"), stop immediately. Do not re-propose or suggest alternatives. The session learning was considered and the Captain chose not to file it — that is a valid answer.
