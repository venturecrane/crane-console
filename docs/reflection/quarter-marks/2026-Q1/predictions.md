# Phase 6: Baseline Predictions for v2 Calibration

Date: 2026-05-10
Authority: derived from `decisions.md` and `captain-reflection.md`.

This is the v1 reflection; there is no prior cycle to grade. These predictions are locked now so that v2 can score them. Each prediction is intentionally falsifiable.

Prediction window: **2026-05-10 to next Quarter Mark** (target ~2026-08-09 if a quarterly cadence holds; v2 may run earlier or later at Captain discretion).

---

## Outcome Predictions (The Bet)

These directly track smd.services as the bet.

| #   | Prediction                                                                                                                                                          | Grading                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| O1  | smd.services generates its first paid engagement before v2 runs                                                                                                     | Pass/fail                                        |
| O2  | smd.services hits **$15K MRR** by next Quarter Mark (Captain-locked 2026-05-10: "smd.services must build to 15k/MRR to sustain the whole enterprise at this stage") | Right: $15K+ MRR; Partial: $7K-$15K; Wrong: <$7K |
| O3  | No mid-cycle pivot away from smd.services as the primary bet                                                                                                        | Pass/fail at v2                                  |

Captain notes from #5 reflection: "right now we are putting everything on smd.services. that is our make or break at this point." That posture is the bet.

---

## Strategic Predictions

| #   | Prediction                                                                                                       | Notes                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| S1  | At least one of DC, KE, SC, DFG remains active (>= 5 sessions in the final month before v2)                      | Tests whether the "all current ventures remain interesting to pursue" stance held in practice |
| S2  | Anthropic Partner Network: a definitive response received (agreement, decline, or documented conditional)        | Currently pending Anthropic reply to outbound 2026-05-09                                      |
| S3  | At least one social-media or marketing-campaign experiment runs with a documented outcome (positive or negative) | Tests whether the #3 avoidance was actually addressed                                         |

---

## Capability Predictions (Stage 1 Durability)

These track whether the Stage 1 capability stack holds under Stage 2 load.

| #   | Prediction                                                                                                                                               | How v2 grades                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| C1  | All ten Stage 1 capability checkpoints marked Done or Working at v1 remain at the same verdict or better in v2                                           | `critique-charter-check.md` v2 verdict comparison |
| C2  | Cost telemetry: monthly burn figures committed to `docs/finance/` for at least May, June, July 2026                                                      | `ls docs/finance/anthropic-2026-{05,06,07}.csv`   |
| C3  | VCMS tag normalization: untagged note count drops below **50** (from ~121)                                                                               | `crane_notes(tag: ...)` coverage sweep            |
| C4  | Methodology v2 ships with Charter as a required input to Phase 3 dispatch                                                                                | `docs/reflection/quarter-mark.md` v2 diff         |
| C5  | Session-reflex hook v2 review (scheduled 2026-05-30 per `project_session_reflexes_v2_review`) produces a decision (keep / retune / kill) and is acted on | Memory or PR record                               |

---

## Brittleness Predictions

| #   | Prediction                                                                    | Failure surface                                         |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| B1  | No mac23 disk failure event causes data loss                                  | If mac23 fails before v2, was the auto-memory recovered |
| B2  | GitHub App on personal account does not cause an auth outage across the fleet | If account locked / changed, did the operation continue |
| B3  | Single Cloudflare account does not experience a billing-driven outage         | DR path or accepted risk                                |

These predictions are intentionally negative-framed: they test whether the accepted-risk inventory in `decisions.md` Hardening section held during the cycle.

---

## v1 Methodology Self-Check Predictions

These grade the reflection methodology itself.

| #   | Prediction                                                                                                                                 | v2 evidence                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| M1  | The decisions document produced this cycle (`decisions.md`) drove at least 3 of the 5 changes named in the "Changed" section to completion | Per-change pass/fail at v2                                               |
| M2  | The v2 reflection runs with the methodology fix from this cycle (Charter required input)                                                   | `quarter-mark.md` v2 frontmatter                                         |
| M3  | The Captain Phase 4 reflection in v2 is shorter or similar to v1, not longer                                                               | Word count comparison; longer suggests the cycle did not produce clarity |

---

## Calibration Rubric for v2

Each prediction gets one of:

- **Right** - prediction held; specific evidence cited
- **Wrong** - prediction failed; specific evidence cited
- **Partial** - some aspect held, some did not; explain
- **Not-yet-resolved** - cycle ended before resolution possible; carry forward

A pattern of "Wrong" or "Not-yet-resolved" across categories points to specific methodology or strategy adjustments for v3.

---

## Captain Locks (2026-05-10)

- **O1:** qualitative - first paid engagement before v2 runs
- **O2:** **$15K MRR by next Quarter Mark** is the threshold that defines "sustaining the whole enterprise at this stage"

The MRR target is the bar smd.services must clear. Partial credit on the way there is documented in the grading rubric for O2; full credit requires the named threshold.
