---
name: critique
description: Plan critique with auto-revision from critic perspectives
---

# Critique

Spawns critic perspectives to challenge the current plan or approach in conversation, then auto-revises based on the critique.

No files required - works against whatever plan, proposal, or approach is in the current conversation context.

## Arguments

```
critique [count]
```

- `count` - number of critic perspectives to evaluate sequentially (default: **1**). More perspectives = more angles, but slower.
  - **1**: Comprehensive Devil's Advocate. Fast. Good for quick sanity checks.
  - **2-3**: Multiple specialized perspectives. Good for important decisions.
  - **4+**: Full panel. Use sparingly - for high-stakes architectural or strategic decisions.

Parse the argument: if no arguments or not a number, default to 1. Store as `PERSPECTIVE_COUNT`.

## Execution

### Step 1: Identify the Plan

Scan the current conversation for the most recent plan, approach, or proposal. This could be:

- A plan written during planning
- A proposed implementation approach
- A technical design or architecture decision
- A strategy or workflow proposal
- Any structured "here's what I'm going to do" statement

**If no plan is identifiable**, stop:

> I don't see a plan or proposal in our current conversation to critique.
>
> Describe your approach first, then run `critique`.

**If a plan IS found**, capture it as `PLAN_TEXT` and display:

```
Critiquing: {one-line summary of what's being critiqued}
Perspectives: {PERSPECTIVE_COUNT}
```

Do NOT ask for confirmation - proceed immediately.

### Step 2: Assign Critic Perspectives

Select perspectives based on `PERSPECTIVE_COUNT`. Always assign from the top of this list:

| #   | Perspective               | Focus                                                                                                   |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Devil's Advocate          | Flaws, risks, edge cases, false assumptions, failure modes. "What could go wrong?"                      |
| 2   | Simplifier                | Over-engineering, unnecessary complexity, simpler alternatives. "Is there a simpler way?"               |
| 3   | Pragmatist                | Feasibility, hidden costs, timeline realism, operational burden. "Will this actually work in practice?" |
| 4   | Contrarian                | Fundamentally different approaches, paradigm challenges. "What if the entire framing is wrong?"         |
| 5   | User/Stakeholder Advocate | End-user impact, UX consequences, stakeholder concerns. "How does this affect the people who use it?"   |
| 6   | Security & Reliability    | Failure modes, data integrity, security surface, recovery paths. "How does this break?"                 |

- **1 perspective** gets "Devil's Advocate" (comprehensive - covers risks, gaps, AND simpler alternatives).
- **2+** each get a distinct perspective from the list.
- **If count exceeds 6**, wrap around and assign "Senior" variants with instructions to dig deeper.

### Step 3: Execute Critic Perspectives

Execute each perspective SEQUENTIALLY. For each perspective, analyze the plan from that angle.

Each perspective produces:

1. Start with `## {PERSPECTIVE_NAME} Critique`
2. **Strengths** (1-3 bullets): What's good about this plan? Acknowledge what works before attacking.
3. **Issues Found** (numbered list): Each issue must include:
   - **The problem**: What's wrong or risky
   - **Why it matters**: Impact if ignored
   - **Suggested fix**: A concrete alternative or mitigation - not just "think about this more"
4. **Alternative Approach** (optional): If a fundamentally better path exists, describe it briefly. Only include if genuinely superior.
5. **Verdict**: One line - "Proceed as-is", "Proceed with fixes", or "Reconsider approach"

Constraints for each perspective:

- Be specific and concrete. "This might have issues" is useless. "The database query in step 3 will table-scan because there's no index on user_id" is useful.
- Every issue MUST have a suggested fix. Critique without solutions is just complaining.
- Don't pad. If the plan is solid from this perspective, say so in 2-3 lines.
- Prioritize. If 10 issues are found, lead with the 3 that matter most.

### Step 4: Synthesize (if PERSPECTIVE_COUNT > 1)

If multiple perspectives were evaluated, synthesize their output before revising:

1. Deduplicate overlapping issues (if 2+ perspectives flagged the same thing, note the convergence - it's more credible)
2. Rank issues by severity and frequency
3. Note any contradictions between perspectives (one says "too simple," another says "too complex")
4. Present a brief **Critique Summary**:

```
## Critique Summary ({PERSPECTIVE_COUNT} perspectives)

### Consensus Issues (flagged by 2+ perspectives)
- ...

### Unique Issues
- ...

### Contradictions
- ...

### Verdicts
- Devil's Advocate: Proceed with fixes
- Simplifier: Reconsider approach
- ...
```

If `PERSPECTIVE_COUNT == 1`, skip synthesis - use the single perspective's output directly.

### Step 5: Auto-Revise

Using the critique (or synthesized critique), revise the plan:

1. Address each issue that has a "Suggested fix" - apply fixes that improve the plan without changing its fundamental intent
2. If a perspective suggested "Reconsider approach" AND provided a concrete alternative, evaluate whether the alternative is genuinely better. If so, adopt it. If not, note why the original approach is preferred despite the criticism.
3. If perspectives contradicted each other, make a judgment call and note the tradeoff
4. Do NOT address nitpicks that don't materially improve the plan

Present the revised plan clearly:

```
## Revised Plan

{THE_REVISED_PLAN}

### Changes Made
1. {What changed and why, referencing which perspective triggered it}
2. ...

### Critiques Acknowledged but Not Adopted
1. {What was raised, why it wasn't adopted}
```

### Step 6: Done

After presenting the revised plan, ask:

**"Revised plan above. Want to proceed, run another round of critique, or adjust something?"**

Do NOT automatically start implementing. Wait for the user.

---

## Notes

- **No files written**: Critique and revision happen in conversation, not on disk.
- **Context-dependent**: Quality depends on how much context is in the conversation. A vague plan produces vague critique. A detailed technical plan produces detailed critique.
- **Fast by default**: 1 perspective, no confirmation step, auto-revise. The whole flow should complete in one shot.
- **No rounds**: Single-pass by design. If the user wants another round, they run `critique` again - the revised plan is now the conversation context.
