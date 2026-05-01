# Session Reflexes

Real-time pause patterns the agent runs _before_ producing substantive output.

This doc is agent-facing. Read it on receipt of an imprecise redirect, or on any of the four signals below. The Captain doesn't read this — they use natural language. The agent decodes.

## The Four Reflexes

| Signal                                                                          | Reflex                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **You just received a redirect** ("recalibrate", "step up", "no, X not Y")      | Pause. Name the precise correction. Verify against code/memory before next action. Do NOT just shift the surface of your last answer and keep going.                                                                                                                                                                                                                                                                                                            |
| **You're about to opine on system behavior, architecture, or feasibility**      | Pause. Did you read the code? If no, read first. Theorizing about a system you haven't read is the most common drift.                                                                                                                                                                                                                                                                                                                                           |
| **You're about to ask a clarifying question**                                   | Classify it: **(a)** factual / in-codebase → read first; **(b)** judgment-call within guardrails → decide (see `/own-it`); **(c)** Captain-only (strategy, off-record context, guardrails-gated) → ask plainly. The trichotomy matters: collapsing (b) and (c) into "find it yourself" is the lossy "ask less" interpretation this doc exists to fix. Asking the Captain for genuine Captain-only judgment is correct; asking for a fact you could grep is not. |
| **The user explicitly framed the mode** ("research", "think", "design", "ship") | Note the mode. Check current behavior against it before producing output. Research mode is not "research while sliding toward design." Ship mode is not "let me write a plan first."                                                                                                                                                                                                                                                                            |

## Decoder for Imprecise Redirects

When the Captain lands an imprecise redirect, decode it before acting. The signal is fast and shorthand on purpose. Your job is to translate.

| Imprecise signal received              | Decode to                                                                           | Action                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "step up"                              | "verify against the code, then act"                                                 | Bias toward verification, not assumption. Don't bias toward "ask less" — that's the lossy reading. |
| "stop asking questions you can answer" | "before asking, check if (a) factual — files/memory; ask only for (c) Captain-only" | Apply reflex #3 trichotomy. Captain-only questions are still valid.                                |
| "this is wrong"                        | "wrong because — what specifically did I miss?"                                     | Identify the precise miss before responding. Don't apologize and try again on vibes.               |
| "we're out of sync"                    | "we drifted at some point — locate it, then re-anchor"                              | Re-anchor on framing, not surface. Find the moment of divergence.                                  |
| "recalibrate"                          | "re-read the most-relevant doc and re-evaluate; or, what mode are we in?"           | Verification or mode reset. Often both.                                                            |

## The Hook

`scripts/redirect-reflex-hook.sh`, wired up via `.claude/settings.json`, fires on every user prompt that matches the redirect patterns above. It prepends a one-line reminder to the agent's context for that turn, pointing back at this doc. The hook is the forcing function — without it, "real-time" is just retrospective work in present-tense costume.

If the hook fires and you didn't actually need it (false positive), note that in the next `/eos` so the patterns can be tuned.

## Cross-References

- **`docs/instructions/operating-ethos.md`** — the standing order. Reflexes are how the ethos lands in the moment.
- **`/own-it`** — decision ownership. Reflex #3(b) defers to /own-it's "decide instead of escalating." Don't double-prescribe.
- **`feedback_*.md` auto-memory** — patterns the agent has saved from prior corrections. Read on session start; the reflexes complement, not replace.

## Why This Exists

The originating session: agent (me) drifted multiple times, Captain redirected with imprecise shorthand ("step up"), agent internalized as "ask less" instead of "verify more," and the misalignment compounded. The retrospective made the patterns nameable. This doc + the hook makes them fire in real-time so future sessions don't need the same retrospective.

The ethos ("Mission first. Execute. If unclear, ask.") is the gestalt; the reflexes are the procedure for catching the moment when the gestalt would otherwise produce surface-confident drift.
