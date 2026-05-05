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

`scripts/redirect-reflex-hook.sh`, wired up via `.claude/settings.json`, fires on **every** user prompt and prepends a one-line primer to the agent's context for that turn:

> `[reflex] Verify before opining; decode redirects precisely; classify questions (factual=read, judgment=decide, Captain-only=ask); respect mode framing; before stating duration estimates, run /estimate. See docs/instructions/session-reflexes.md.`

The primer maps to the four reflexes plus the estimation reflex (see below) in clause order. It's the forcing function — without it, "real-time" is just retrospective work in present-tense costume.

The primer is **always-on** by design. v1 of this hook tried to detect "imprecise redirects" via regex patterns drawn from one session's verbatim language. Corpus mining (5 recent JSONL transcripts, 906 user turns, 18 verbatim Captain redirects) showed those patterns matched **0 of 18 redirects**. Captain redirect language is too varied — and dominated by negation openers ("i don't", "what", "no") that are too noisy to match safely. The reflexes are universal; firing the primer universally is the only honest mechanism. v2 rationale below.

## Estimation Reflex

Before stating any duration estimate ("this will take X hours/days/weeks"), run `/estimate <scope>` and use the returned band.

| Signal | Reflex |
| --- | --- |
| **You're about to state a duration estimate** (hours, days, weeks) for a piece of work — internally to the Captain, in a SOW draft, in an issue body, or anywhere else | Pause. Run `/estimate <scope>` first. Use the returned band. Do NOT default to industry developer-day priors ("auth integration = 3 days") — agents systematically over-estimate by 5-50× when those priors aren't replaced with corpus-grounded numbers. |

**Why this is in the primer (not pattern-matched).** The estimation drift mode is a known recurring failure: agents anchor on training-data developer-day estimates, producing numbers 5-50× larger than actual cycle times in our corpus. Surfacing `/estimate` in the always-on primer is what makes agents reach for it organically; without surfacing, the skill exists but never gets invoked, and the drift keeps recurring.

**Why this doesn't violate the corpus-validation discipline** that produced v2. The corpus rule (`feedback_validate_patterns_against_corpus.md`) guards against pattern-matching code — regex/classifiers that try to detect specific phrases in user input. An always-on primer doesn't pattern-match anything; it fires unconditionally for every prompt, identical in form to the four reflexes above. The discipline applies to "should we add code that detects estimation language?" — and the answer there remains no, until the 30-day review proves otherwise.

**Output is internal-only.** `/estimate` returns execution-time bands grounded in our PR-commit-span data. Client-facing SOWs use milestone calendars, not hours. The skill enforces this with an `[INTERNAL ONLY]` footer on every output.

**30-day review folds this in.** The 2026-05-30 v2 reflex review now also evaluates: did adding the estimation clause correlate with `/estimate` invocations? Did Captain redirects on estimation events drop? Decide keep/refine/remove with real signal.

## Cross-References

- **`docs/instructions/operating-ethos.md`** — the standing order. Reflexes are how the ethos lands in the moment.
- **`/own-it`** — decision ownership. Reflex #3(b) defers to /own-it's "decide instead of escalating." Don't double-prescribe.
- **`feedback_*.md` auto-memory** — patterns the agent has saved from prior corrections. Read on session start; the reflexes complement, not replace.

## Why This Exists

The originating session: agent (me) drifted multiple times, Captain redirected with imprecise shorthand ("step up"), agent internalized as "ask less" instead of "verify more," and the misalignment compounded. The retrospective made the patterns nameable. This doc + the hook makes them fire in real-time so future sessions don't need the same retrospective.

The ethos ("Mission first. Execute. If unclear, ask.") is the gestalt; the reflexes are the procedure for catching the moment when the gestalt would otherwise produce surface-confident drift.

## v2 Rationale (2026-04-30) — From Regex to Always-On

v1 shipped (PR #778) with a six-pattern regex matcher derived from one session. The Captain pushed back: "are they just from the last session? will we continue to learn as new patterns emerge?" Both fair.

We did the corpus work that should have happened the first time:

- Mined 5 recent crane-console JSONL transcripts → 906 user turns, **18 verbatim Captain redirects**.
- The original 6 regex patterns matched **0 of 18 (0%)**. They were artifacts of one session's syntax, not a generalizable signal.
- Mined the 20 `feedback_*.md` memory files → drift clusters into 5 stable families (Verification/Evidence Skipping, Reference Blindness, False Thoroughness, Outsourcing/Delegation, Context Misalignment). The original 6 patterns covered family 3 weakly; missed families 1, 2, and 5 — the largest.

**Why not tune the regex.** Captain's natural redirect language is dominated by pure-negation openers ("i don't", "what", "no, please") — matching on those would fire on most prompts (terrible signal:noise). Higher-signal phrases ("do the research", "look back", "think hard") catch ~30% of redirects but miss the rest. A tuned regex would still need always-on as a floor, making the regex layer redundant.

**Why not LLM-classify.** A Haiku call per prompt adds 1-3s synchronous latency to every turn. That latency tax directly contradicts the operating ethos. v3 path only if always-on underperforms.

**The honest conclusion.** Pattern-matching against natural-language redirects is the wrong abstraction. The reflexes are universal procedures — the agent should run them every turn, not only when a corpus-snapshot phrase fires.

### What the hook can and can't do

The UserPromptSubmit hook sees the user's prompt before the agent generates its turn. That means the primer can prime reflexes #1 (decode redirects) and #4 (respect mode framing) directly — both are user-prompt-side signals.

Reflexes #2 (about to opine on system behavior) and #3 (about to ask a clarifying question) fire on **agent state**, not prompt content. The primer can remind the agent to consider them, but the hook cannot detect when the agent is about to violate them. If reflexes #2/#3 remain the dominant drift mode after the 30-day review, the next layer is a `PreToolUse` hook on Edit (read-before-edit forcing function). Out of scope for v2.

### 30-day review window

Captain reviews on or around 2026-05-30:

- (a) New `feedback_*.md` files created in the 30-day window vs the prior 30 days.
- (b) Agent self-corrections that cite the primer (search post-v2 JSONL for `[reflex]` mentions in agent turns or for verify-first patterns).
- (c) Captain redirects that should have been prevented but weren't — mine the JSONL the same way the v2 corpus was mined.

If (a) is flat or rising and (c) is high → escalate (LLM-classifier or richer telemetry). If (a) declines and (c) is rare → keep as-is.

### Known limitations

- **Habituation.** The same primer every turn may lose attention weight over a long session. Mitigation: keep it short. If the 30-day review shows the primer being ignored, rotation or per-turn salience signals become a v3 question.
- **Crane-console only.** The hook is wired in this repo's `.claude/settings.json`, which the launcher's `syncClaudeAssets` does not propagate to venture repos. Ventures don't get the primer today. Captain works mostly here, but increasingly in ventures (SS work). Propagation is a deferred follow-up — not promised, contingent on v2 earning its keep.
