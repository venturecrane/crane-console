# Claude Certified Architect - Foundations | 30-Day Study Curriculum

**Candidate:** Scott Durgan  
**Exam window:** May 20-22, 2026  
**Study window:** April 22 - May 19, 2026 (30 days)  
**Produced by:** Venture Crane agent team

---

## Overview

Four phases across 30 days. Weekdays only for scheduled sessions (flex weekends for catchup or depth extension if a phase runs long).

| Phase                       | Days         | Window          | Goal                                     |
| --------------------------- | ------------ | --------------- | ---------------------------------------- |
| 1 - Weakness Sprint         | ~10 sessions | Apr 22 - May 5  | Close the 8 identified gaps              |
| 2 - Lay of the Land         | ~5 sessions  | May 6 - May 12  | Surface pass across all 5 domains        |
| 3 - Progressive Depth       | ~3 sessions  | May 13 - May 15 | Scenario walkthroughs + sample questions |
| 4 - Practice Exam + Revisit | 2 sessions   | May 18-19       | Full mock exam, gap-ledger closeout      |
| Exam sit                    | -            | May 20-22       | Sit at chosen slot                       |

---

## Working Assumptions

- **Session length:** 45-60 min per weekday session.
- **Flash-review habit:** First 2 min of every session = quick oral recall of the prior session's topic. No notes. Just reconstruct the key mechanism.
- **Mid-phase spaced recall:** Each closed weakness item retested at 48 hours post-close, then 7 days post-close, then at end of its phase (see Spaced-Recall Schedule below).
- **Gap ledger is live:** Update gap-ledger.md after every session. Any new gap discovered during study gets logged immediately with discovery date and a rough closure plan.
- **Weekends are flex:** Not scheduled. Use them if you hit a week where two items proved harder than expected, or if you want to extend a depth session.

---

## Day-by-Day Schedule

### Phase 1: Weakness Sprint (Apr 22 - May 5)

**Goal:** One weakness item per session. Two sessions reserved for flash-review sweeps and ad-hoc gap closure.

---

**Day 1 - Tue Apr 22 | Phase 1 | Item 1: Agentic Loop Mechanics**

Topic: stop_reason values ("tool_use" vs "end_turn"), the tool-result appending pattern, why text-parsing and natural-language-done-detection are anti-patterns.

What to do:

- Read the Anthropic "Tool use" reference (docs.anthropic.com/en/docs/build-with-claude/tool-use). Focus on the request/response cycle diagram.
- Trace through a 3-turn agentic loop on paper: assistant emits tool_use, you append tool_result, assistant responds with end_turn. Label each stop_reason.
- Articulate out loud why checking for the string "DONE" in the assistant response is unreliable versus reading stop_reason == "end_turn".

Self-test: Explain the full loop without notes. Answer: "What is the correct termination condition for an agentic loop and what happens if you cap iterations instead?"

---

**Day 2 - Wed Apr 23 | Phase 1 | Item 2: Hooks as Deterministic Enforcement**

Topic: PostToolUse for result normalization, tool-call interception for policy compliance, the principle that programmatic prerequisites beat prompt instructions.

What to do:

- Read Claude Code hooks documentation (docs.anthropic.com/en/docs/claude-code/hooks). Focus on PostToolUse lifecycle and exit-code semantics.
- Map the customer-support scenario: "customer must be verified before refund can be issued." Sketch the hook that enforces this - not the prompt instruction that requests it.
- Compare: prompt says "always verify customer first" vs PostToolUse hook that checks verification state and blocks if absent. Articulate why the hook is the correct architecture.

Self-test: Write a 30-line pseudocode PostToolUse hook that enforces a refund-threshold policy. Explain the exit codes.

---

**Day 3 - Thu Apr 24 | Phase 1 | Item 3: tool_choice Semantics**

Topic: "auto" vs "any" vs forced {"type":"tool","name":"..."}. When each applies. Why "any" guarantees a tool call. When to force-first a specific tool before downstream processing.

What to do:

- Read the tool_choice section of the Anthropic API reference (docs.anthropic.com/en/api/messages).
- Build a decision tree: given a scenario, which tool_choice setting is correct?
  - "auto" - Claude decides whether to use a tool
  - "any" - Claude must use some tool (non-deterministic which one)
  - forced - Claude must use the named tool (deterministic)
- Identify two scenarios where forced tool_choice is necessary (e.g., structured extraction as first step before synthesis).

Self-test: Given three exam-style scenarios, assign the correct tool_choice and justify. No notes.

---

**Day 4 - Fri Apr 25 | Phase 1 | Item 4: Structured Error Responses**

Topic: isError, errorCategory (transient/validation/business/permission), isRetryable, distinguishing access-failure from valid-empty-result, partial results + attempted-query context in error payloads.

What to do:

- Read the MCP specification on structured errors and the Anthropic error handling docs.
- Draft a schema for a structured MCP tool error response covering all four errorCategory values. Include an example payload for each.
- Practice the distinction: "no results found" (valid empty result, isError=false) vs "permission denied" (isError=true, errorCategory=permission, isRetryable=false) vs "rate limit hit" (isError=true, errorCategory=transient, isRetryable=true).

Self-test: Given a tool failure description, produce the correct structured error payload with all fields. Explain why isRetryable matters for orchestrator retry logic.

---

**Day 5 - Mon Apr 28 | Phase 1 | Item 5: Message Batches API**

Topic: 50% cost savings, up to 24hr completion window, custom_id for request/response correlation, no multi-turn tool calling inside batch requests, unsuitable for blocking pre-merge checks, ideal for overnight or bulk jobs.

What to do:

- Read the Message Batches API docs (docs.anthropic.com/en/docs/build-with-claude/message-batches).
- Work through the SLA math: if a batch job costs $20 at standard pricing, batches cost $10. If turnaround time is up to 24 hours, is it suitable for a pre-merge CI check? (No - CI is blocking.) Is it suitable for nightly document classification? (Yes.)
- Map each exam scenario to "batch suitable" or "batch unsuitable" with a one-line reason.
- Note the custom_id field: arbitrary string set by requester, echoed in response. Enables correlation when batch results arrive out of order.

Self-test: Explain in 90 seconds why batches cannot support multi-turn tool calling. Identify two exam scenarios where batch processing is clearly wrong and two where it is clearly right.

---

**Day 6 - Tue Apr 29 | Phase 1 | Item 6: fork_session and --resume**

Topic: Named session resumption, fork_session for divergent exploration branches, when to resume-with-stale-context vs start-fresh-with-summary-injection.

What to do:

- Read the Claude Code session management docs (docs.anthropic.com/en/docs/claude-code/memory).
- Clarify the two operations: --resume continues a named session (same context, linear history). fork_session creates a branch from the current session state (parallel exploration, separate histories).
- Construct a scenario: you have a session mid-way through a refactor. You want to explore two different approaches. Map the correct fork_session usage.
- Address the stale-context tradeoff: resuming a session from yesterday may carry outdated file state. When is it better to start fresh with a summary injected as context?

Self-test: Describe fork_session vs --resume in 60 seconds without notes. Answer: "If a session's context is 12 hours old, what are the failure modes of resuming vs injecting a summary?"

---

**Day 7 - Wed Apr 30 | Phase 1 | Flash Review + Gap Closure**

Reserved session. No new material.

What to do:

- Oral recall of items 1-6 in sequence. 3 min per item, no notes.
- Check gap-ledger.md. Any item where oral recall failed or felt shaky gets flagged for 48-hour retest bump.
- If any item was harder than expected and you have documented residual gaps, use this session to address them before moving to items 7-8.

Self-test: All 6 items recalled with no significant gaps. Gap ledger updated.

---

**Day 8 - Thu May 1 | Phase 1 | Item 7: Validation-Retry Loops**

Topic: Retry with specific error feedback works for format/structural errors, fails when required info is absent from source. Pydantic-style validation. detected_pattern tracking for dismissal analysis.

What to do:

- Read the structured output and tool use sections of the Anthropic prompt engineering guide (docs.anthropic.com/en/docs/build-with-claude/structured-outputs).
- Model two scenarios:
  - Schema validation failure: Claude returns JSON missing a required field. Retry with the exact validation error message injected into next turn. This works because Claude has the information but mis-formatted it.
  - Source-absent failure: Claude cannot extract a field because the source document does not contain it. Retrying is futile - the correct response is null/absent, not a retry loop.
- Sketch the retry orchestrator logic: max-retries cap, error specificity in retry prompt, detected_pattern field for tracking which fields consistently fail.

Self-test: Given a validation error description, classify it as "retry will help" or "retry will not help" and explain why in 30 seconds.

---

**Day 9 - Fri May 2 | Phase 1 | Item 8: Confidence Calibration**

Topic: Field-level confidence scores, stratified sampling for error rate measurement, accuracy segmentation by document type and field, why LLM self-reported confidence is poorly calibrated for hard cases.

What to do:

- Read the human review and confidence calibration sections of the Anthropic reliability docs.
- Understand the fundamental limitation: LLMs tend to be overconfident on hard cases and appropriately confident on easy ones. Self-reported confidence cannot be trusted at face value for hard documents.
- Design a stratified sampling protocol: sample 5% of high-confidence extractions, 20% of medium-confidence, 100% of low-confidence. Measure actual error rates per stratum. Use measured error rates to recalibrate routing decisions.
- Distinguish field-level from record-level confidence: a document may extract 8 of 10 fields with high confidence and 2 with low confidence. The correct response is partial-accept + flag for partial review, not reject-entire-record.

Self-test: Describe the stratified sampling protocol and explain why 100% sampling of high-confidence results is not necessary. Explain the overconfidence failure mode in one concrete example.

---

**Day 10 - Mon May 5 | Phase 1 | Flash Review + Gap Closure**

Reserved session. No new material.

What to do:

- Full oral recall sweep of all 8 items. Track which ones have residual hesitation.
- Update gap-ledger.md: close any items that pass the self-test protocol, schedule 48h retests.
- If 2+ items still have residual gaps, this is the last Phase 1 buffer. Flag in gap ledger. Phase 2 begins Tuesday regardless - residual Phase 1 gaps will be addressed in Phase 3 depth sessions.

Self-test: 8/8 items recalled with no critical gaps. Gap ledger current.

---

### Phase 2: Lay of the Land (May 6 - May 12)

**Goal:** One domain per session, surface-level pass. Not depth - breadth and orientation. One integration session at end.

---

**Day 11 - Tue May 6 | Phase 2 | Domain 1: Agentic Architecture & Orchestration**

Covers: agentic loops, stop_reason, coordinator-subagent patterns, subagent context passing, multi-step workflow enforcement, Agent SDK hooks, task decomposition, fork_session, --resume.

Note: Items 1, 2, and 6 from the weakness sprint map directly here. This session is consolidation and coverage of the parts not covered in the sprint (coordinator-subagent patterns, context passing, task decomposition).

Self-test: Draw the coordinator-subagent architecture for the Multi-Agent Research scenario. Label context passing points.

---

**Day 12 - Wed May 7 | Phase 2 | Domain 2: Tool Design & MCP Integration**

Covers: tool descriptions, structured MCP errors, tool distribution, tool_choice, MCP server config (.mcp.json vs settings), built-in tools.

Note: Items 3 and 4 map here. Focus session on the gaps: tool description quality (what makes a description that Claude uses correctly vs incorrectly), .mcp.json vs ~/.claude.json configuration hierarchy.

Self-test: Write a high-quality tool description for a hypothetical "search_customer_records" tool. Explain .mcp.json vs ~/.claude.json scope.

---

**Day 13 - Thu May 8 | Phase 2 | Domain 3: Claude Code Configuration & Workflows**

Covers: CLAUDE.md hierarchy (user/project/directory), .claude/rules/ glob-scoped, .claude/commands/ slash commands, .claude/skills/ with context:fork + allowed-tools + argument-hint, plan mode vs direct execution, iterative refinement, CI/CD (-p flag, --output-format json, --json-schema).

Note: Candidate has strong real-world experience here. Session should focus on exam-question framing (what the exam tests vs what daily usage looks like) and the CI/CD flags which are less frequently used in practice.

Self-test: Describe the full CLAUDE.md precedence hierarchy. Explain -p flag and --output-format json usage in a CI context.

---

**Day 14 - Fri May 9 | Phase 2 | Domain 4: Prompt Engineering & Structured Output**

Covers: explicit criteria, few-shot examples, tool_use + JSON schemas, validation-retry loops, Message Batches API, multi-instance review architectures.

Note: Items 5, 7, and 8 map here. Session focuses on multi-instance review (separate reviewer instances vs single-model self-review) and JSON schema edge cases (nullable fields, enum+other+detail patterns).

Self-test: Design a multi-instance review architecture for the Structured Data Extraction scenario. Explain when nullable vs required fields change retry behavior.

---

**Day 15 - Mon May 12 | Phase 2 | Domain 5 + Integration**

Domain 5 covers: context preservation, escalation/ambiguity resolution, error propagation, large codebase exploration, human review workflows, multi-source synthesis provenance.

Integration: Map all 5 domains to the 6 exam scenarios. Which domains are tested by which scenarios? What domain combinations appear in each scenario?

Self-test: For each of the 6 scenarios, name the primary and secondary domains tested. Identify which scenario tests the most domains simultaneously.

---

### Phase 3: Progressive Depth (May 13 - May 15)

**Goal:** Scenario walkthroughs with sample questions and variants.

---

**Day 16 - Tue May 13 | Phase 3 | Scenarios 1-2**

Scenario 1: Customer Support Resolution Agent  
Scenario 2: Code Generation with Claude Code

For each scenario:

- Read the scenario prompt.
- Identify the domain weights it tests.
- Answer 3 sample questions per scenario.
- Identify variant framings (what if X was changed).

Self-test: Answer all 6 questions with no notes. Flag any question where confidence was below 80%.

---

**Day 17 - Wed May 14 | Phase 3 | Scenarios 3-4**

Scenario 3: Multi-Agent Research System  
Scenario 4: Developer Productivity with Claude

Same structure as Day 16.

Self-test: Same protocol.

---

**Day 18 - Thu May 15 | Phase 3 | Scenarios 5-6**

Scenario 5: Claude Code for Continuous Integration  
Scenario 6: Structured Data Extraction

Same structure. Note: Scenario 6 is the highest-density weakness scenario - confidence calibration, validation-retry, and batch processing all appear here. Give it extra attention.

Self-test: Same protocol. Flag CI scenario specifically for the "batch is wrong for pre-merge" pattern.

---

### Phase 4: Practice Exam + Revisit (May 18-19)

---

**Day 19 - Mon May 18 | Phase 4 | Full Practice Exam**

Take a timed full practice exam. 4 scenarios drawn at random (simulate this by randomly selecting 4 of the 6). Time-box to the actual exam format.

Score and categorize every wrong answer by domain and weakness item.

Self-test: Score above 720 scaled. Any domain below expected weight = flag for Day 20.

---

**Day 20 - Tue May 19 | Phase 4 | Gap Ledger Closeout**

Review practice exam results. Re-close any items that surfaced in the practice exam. Update gap ledger final status. No new material.

Evening: light review of the 8 weakness item core mechanisms. No cramming. 20 min max.

---

**Exam Window: May 20-22**

Sit the exam at the chosen slot. No new study material after May 19 evening.

---

## Study Materials by Domain

### Domain 1: Agentic Architecture & Orchestration

- docs.anthropic.com/en/docs/build-with-claude/tool-use (tool-result appending, stop_reason)
- docs.anthropic.com/en/docs/claude-code/hooks (PostToolUse, lifecycle, exit codes)
- docs.anthropic.com/en/docs/claude-code/memory (fork_session, --resume, session naming)
- docs.anthropic.com/en/docs/build-with-claude/agents (orchestrator/subagent patterns)

### Domain 2: Tool Design & MCP Integration

- docs.anthropic.com/en/docs/build-with-claude/tool-use (tool descriptions, tool_choice)
- docs.anthropic.com/en/docs/claude-code/mcp (MCP config, .mcp.json scope)
- modelcontextprotocol.io/docs (MCP specification, error schema)

### Domain 3: Claude Code Configuration & Workflows

- docs.anthropic.com/en/docs/claude-code/memory (CLAUDE.md hierarchy)
- docs.anthropic.com/en/docs/claude-code/slash-commands (custom commands)
- docs.anthropic.com/en/docs/claude-code/ci-cd (-p flag, --output-format, --json-schema)
- docs.anthropic.com/en/docs/claude-code/settings (settings.json, hooks config)

### Domain 4: Prompt Engineering & Structured Output

- docs.anthropic.com/en/docs/build-with-claude/prompt-engineering (few-shot, explicit criteria)
- docs.anthropic.com/en/docs/build-with-claude/structured-outputs (JSON schema, nullable fields)
- docs.anthropic.com/en/docs/build-with-claude/message-batches (Batches API, custom_id, limits)

### Domain 5: Context Management & Reliability

- docs.anthropic.com/en/docs/build-with-claude/context-windows (context preservation, trimming)
- docs.anthropic.com/en/docs/build-with-claude/agents (error propagation, escalation)
- docs.anthropic.com/en/docs/claude-code/troubleshooting (/compact, large codebase exploration)

---

## Self-Test Protocol

An item is "closed" when all three of the following are true:

1. **Oral recall without notes** - can explain the full mechanism, the failure modes, and the correct pattern in under 90 seconds.
2. **Unseen question performance** - can correctly answer 2 exam-style questions on the topic that were not used during study.
3. **Code sketch** - can write a 30-50 line pseudocode or schema example demonstrating the correct pattern (applicable to items 1, 2, 3, 4, 7, 8).

Items that pass criteria 1 and 2 but not 3 are marked "partially closed" in the gap ledger. They do not count as closed for retest scheduling.

---

## Spaced-Recall Schedule

Each closed weakness item follows this retest schedule:

| Retest       | Timing                          | Format                            |
| ------------ | ------------------------------- | --------------------------------- |
| Retest 1     | 48 hours after first-close date | Oral recall, 90 seconds, no notes |
| Retest 2     | 7 days after first-close date   | One unseen exam-style question    |
| Final retest | End of current phase            | Oral recall + one question        |

If any retest fails, the item reverts to "in-progress" in the gap ledger. Re-close requires passing all three self-test criteria again.

Items do not come off the retest cycle until 30 days post-first-close. Since the exam sits before the 30-day mark for most items, the final retest at end-of-phase serves as the graduation gate.

---

## Escape Hatches

**If behind at end of Phase 1 (May 5):**

- Compress Phase 1 flash-review sessions to 30 min.
- Carry residual Phase 1 gaps into Phase 3 depth sessions - flag in gap ledger.
- Do not compress Phase 2. Domain surface pass is prerequisite for Phase 3 scenario work.

**If behind at end of Phase 2 (May 12):**

- Use weekend May 16-17 for Phase 3 overflow.
- Compress Phase 3 to 2 sessions (pair scenarios 1-2 on one day, 3-6 on another).
- Do not compress Phase 4. The practice exam is non-compressible.

**If practice exam score is below 720 (May 18):**

- May 19 becomes targeted remediation, not gentle gap closeout.
- Prioritize the domains where the practice exam score was worst.
- Consider pushing the exam sit to May 22 to maximize the Day 19 remediation window.

**Non-compressible:** Phase 4. The practice exam must run in full under timed conditions. Skipping it removes the only realistic calibration of readiness before the actual exam.
