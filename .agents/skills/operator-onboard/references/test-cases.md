# Test cases — `operator-onboard`

Synthetic **narrative** intakes used to exercise the skill (and to drive the SMD
customer-zero dogfood). These are written as kickoff-conversation prose on purpose:
the skill's job is to _derive_ config from what was said and to leave undeterminable
fields as `TBD`/`synthetic:`/open-items — not to copy a pre-filled answer key. A test
that feeds the skill its own output proves only the renderer, never the extractor.

---

## Case 1 — SMD Services (customer-zero, `vertical: mixed`)

This is the dogfood input. It is what Scott would say in a setup conversation. The
expected-output block below is the assertion target — it must be **derived** from the
narrative, not pasted in as input.

### Intake notes (narrative)

> I'm Scott Durgan. The legal entity is SMDurgan, LLC — we run as SMD Services, a
> solutions-consulting shop. This first one is us using our own product before we sell
> it, so I'm the only person who needs access: smdurgan@venturecrane.com, and I'm the
> principal — it answers to me and I review everything before it goes anywhere.
>
> I want to call the assistant **Crane**. Think of it as a Chief of Staff, not a
> secretary. The voice should be plainspoken and direct — executive-summary first, no
> throat-clearing, keep it short. I don't want it sounding like a chipper marketing bot.
>
> The one job I want to start with is my inbox. I'm drowning in email and things slip.
> I want it reading what comes in every morning, sorting it, and drafting replies for
> me to review — it should never send on its own, I want to be the one who hits send.
> One thing at a time; we'll add more once this earns its keep.
>
> We run everything in Google — Gmail, Google Calendar, and Google Drive. That's the
> whole stack for now.
>
> We're in Phoenix. If anything goes wrong or it spots something urgent, just flag it
> to me at the same address.

### Expected derived output (assertion target)

`customer.yaml`:

- `customer_id: smd`, `customer_name: 'SMDurgan, LLC'`
- `vertical: mixed` — SMD is consulting/services; the enum has no `consulting` value, so
  `mixed` is the honest non-fabricated choice (known PRD open question, #776). Because
  vertical ≠ `law-firm`, **no `practice_areas`** and **no PI-addon skills**.
- `fly_region: lax` (closest region to Phoenix; stated location → documented mapping)
- `model: claude-opus-4-7`; `hermes_ref: v2026.5.16@a91a57fa5a13d516c38b07a141a9ce8a3daabeb0`
  (operator-supplied current pin — never a `-smd.N` fork tag)
- `users`: one `principal`, Scott Durgan, smdurgan@venturecrane.com
- `personas`: one active persona `crane`, title `Chief of Staff`, tone
  `[plainspoken, direct, executive-summary, concise]` (from how he described the voice —
  not inferred personality), one skill `inbox-triage` @ `draft_for_review` ("review
  before it goes anywhere" / "never send on its own")
- `connectors`: `Email` → `mcp:google-gmail`, `Calendar` → `mcp:google-calendar`,
  `DocumentStorage` → `mcp:google-drive` (all named explicitly). No `composio:`.
- `escalation`: red_flag + failure recipients both smdurgan@venturecrane.com
- `memory`: `d1_namespace: smd`, `r2_vault_path: vaults/smd/`, `vectorize_index: hermes-smd-vault`

### Deliberately-absent facts (must NOT be fabricated)

- **Voice samples** — Scott never supplied or pointed to any writing samples. The skill
  must NOT assert a tone-from-samples or fabricate a corpus. `voice_library.samples_path`
  is the deterministic R2 path (structural), but **voice-sample collection is an open
  onboarding item** in Phase 1, marked TBD until the principal supplies a source.
- **Pronouns** — never stated → omit the field. Do not guess.
- This is the proof that the extractor (not just the YAML renderer) honors the contract:
  a green run must leave these as open-item/omitted, not filled.

---

## Case 2 — Adversarial: unnamed tools must go `synthetic:` (non-SMD)

Guards against the highest-risk failure: guessing a vendor the interviewee never named.

### Intake notes (narrative)

> We're a small real-estate brokerage. The owner is Dana Reyes, dana@example-realty.test,
> she signs off on everything. Call the assistant Riley. We want it watching the inbox
> and drafting replies. We use some scheduling thing for showings, and we've got a CRM
> for leads, but honestly I couldn't tell you the brand off the top of my head.

### Expected derived output

- `Email` → real backend only if a mail vendor were named; here it isn't named beyond
  "the inbox", so Email is `synthetic:fixture` + open-item OR omitted pending naming.
- `Calendar` (the "scheduling thing") → **`synthetic:fixture`** + open-item "confirm
  scheduling tool with client, swap synthetic→real" — NEVER a guessed `mcp:google-calendar`.
- `IntakeCRM` (the unnamed "CRM") → **`synthetic:fixture`** + open-item — NEVER a guessed
  `mcp:` adapter.
- The skill surfaces these as ambiguities at the review gate; it does not resolve them.

A run that emits `mcp:google-calendar` or any named CRM adapter for Case 2 is a contract
violation, even though the guess might be right.
