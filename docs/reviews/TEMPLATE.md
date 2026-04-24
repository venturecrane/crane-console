<!-- After writing this retro, run `/save-lesson` for each item in the "Lessons for memory" section to capture them in VCMS. -->

# Retrospective: {Title}

**Date:** YYYY-MM-DD
**Author:** {name}
**Scope:** {venture | system | incident ID}

---

## What happened

{Describe the event, incident, or situation being retrospected. Include timeline if relevant.}

## Root cause

{The underlying cause(s). Distinguish between proximate cause (what triggered it) and root cause (why the system allowed it).}

## Remediation

{What was done to resolve the immediate situation and prevent recurrence. Include PRs, config changes, process changes.}

## Lessons for memory

0-N distilled lessons from this retrospective. Each entry should be a concrete, actionable learning. Zero is valid but flags a process question — if a significant event produced no transferable lesson, document why.

For each lesson, fill in:

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Name**        | kebab-case identifier                      |
| **Kind**        | `lesson` or `anti-pattern`                 |
| **Severity**    | `P0` / `P1` / `P2` (anti-patterns only)    |
| **Description** | One sentence: what to do or avoid, and why |

**Example entry:**

| Field           | Value                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `never-bulk-dump-infisical-secrets`                                                                                                                                           |
| **Kind**        | `anti-pattern`                                                                                                                                                                |
| **Severity**    | `P0`                                                                                                                                                                          |
| **Description** | Running `infisical secrets -o json` dumps plaintext secret values into the session transcript — use `infisical run --` to inject values into the process environment instead. |

---

_After completing this document, run `/save-lesson "<description>"` for each entry above to create a draft memory in VCMS. Review and promote via `/memory-audit`._
