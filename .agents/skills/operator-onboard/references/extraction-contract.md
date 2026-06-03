# Extraction contract — `operator-onboard`

This is the **P0 no-fabrication contract** for the onboarding skill. It governs how
facts are pulled from a client-interview transcript/notes into a `customer.yaml` and
an onboarding plan. It exists because everything this skill produces becomes
client-facing engagement configuration, and CLAUDE.md's "No fabricated client-facing
content" rule is absolute: invented config is a compliance risk, not a convenience.

This contract mirrors the enforced enrichment-prompt contracts
(`src/lib/enrichment/dossier.ts`, asserted by `tests/enrichment-prompt-contracts.test.ts`).
The same discipline applies here.

## The rule

**Use only facts present in the supplied context.** Every value you write into
`customer.yaml` or `onboarding-plan.md` must trace to something the interviewee
actually said or supplied. If it is not in the transcript/notes, it is not a fact you
have.

**Do not infer management style, communication preference, personality, likely objections, or private business conditions.**
You are configuring an Operator, not profiling a person. Tone descriptors come from
how the principal describes the voice they want or from supplied writing — never from
your read of their character.

**When evidence is incomplete, label it as an open question instead of guessing.** A
missing field is a `TBD`, a `synthetic:` connector, or an explicit onboarding open-item
— never a plausible-sounding invention. A blank is honest; a fabrication is a defect.

## What this means field by field

- **Identity / people / roles** — only names, emails, and roles stated in the source.
  Never a placeholder like "Business Owner" standing in for a real signer.
- **Connectors** — wire a real `mcp:`/`build:` backend **only when the interviewee
  names the tool** ("we run everything in Gmail"). A capability they gesture at without
  naming ("some scheduling thing", "our CRM") becomes `synthetic:<adapter>` plus an
  onboarding open-item to confirm and swap. Never guess a vendor.
- **Skills / trust ceilings** — enable a skill only when the source describes the pain
  it addresses. Surface the verbatim quote that justifies it. Never raise a skill above
  its authored trust ceiling; never promote a `trust_ceiling_locked` skill.
- **Voice** — if the interviewee did not supply or point to writing samples, voice-sample
  collection is an **open onboarding item**, not a fabricated corpus or an asserted tone.
- **Optional fields** (pronouns, business hours, signature) — omit when unstated. Omission
  is correct; a guess is a violation.

## Evidence binding

For every non-trivial decision, carry the verbatim quote that justifies it (the
`proposal-drafter` pattern — `operator/skills/proposal-drafter/SKILL.md`). The
reviewer must be able to see that the config reflects what was said, not what was
imagined. If you cannot quote a source line for a value, you cannot write that value.

## Hard line

If the transcript is ambiguous, **surface the ambiguity — do not resolve it.** Present
the open-item to the Captain at the review gate. The skill never closes a gap by
inventing content.
