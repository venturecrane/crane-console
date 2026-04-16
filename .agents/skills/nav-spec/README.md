# nav-spec

Companion to `stitch-design` and `stitch-ux-brief`. Eliminates navigation drift across Stitch-generated screens and live code by authoring and enforcing a per-venture `NAVIGATION.md`.

## What it does

- Authors `.stitch/NAVIGATION.md` — IA, surface-class taxonomy (by auth model), archetype × chrome contracts, mobile↔desktop transforms, states, transitions, a11y floor, anti-patterns
- Audits drift between shipped code and generated artifacts
- Feeds a NAV CONTRACT block into every Stitch generation prompt via the patched `stitch-design` pipeline
- Validates generated HTML against a deterministic rubric post-generation; fails loud on violations

## Who this is for

Ventures using the Stitch MCP server to generate design artifacts that also ship to production (Astro + Tailwind). One spec per venture; shared skill across the portfolio.

## When to run

| Moment                                        | Command                                        |
| --------------------------------------------- | ---------------------------------------------- |
| First time for a venture                      | `/nav-spec` (invokes author workflow)          |
| Quarterly review                              | `/nav-spec --audit`                            |
| After adding a new surface class or archetype | `/nav-spec --revise`                           |
| After Stitch model version change             | `/nav-spec --phase-0` (re-run compliance test) |

## Dependencies

- Stitch MCP connected (curl fallback supported when MCP is in its intermittent OAuth-broken state)
- Venture has `stitchProjectId` set in `crane-console/config/ventures.json`
- `STITCH_API_KEY` in Infisical at `/vc` path (for curl fallback)
- `.stitch/DESIGN.md` recommended but not required

## Relationship to other skills

- **stitch-design** reads `.stitch/NAVIGATION.md` and injects NAV CONTRACT into every generation prompt. Graceful-degradation: if no spec present, behaves as today.
- **stitch-ux-brief** reads `.stitch/NAVIGATION.md` in Phase 1; injects NAV CONTRACT into Phase 7 concept prompts; generates strip-directive forbidden-list from the spec's anti-patterns in Phase 11.
- **react-components** (future) will read the same spec to produce Astro components aligned with the chrome contracts.

## Key files

- `SKILL.md` — entry point and overview
- `workflows/author.md` — primary nine-phase workflow (intake → drift audit → draft → 3-reviewer pass → decisions → save → integration-check → adversarial verification → write-back)
- `workflows/audit.md` — standalone drift audit
- `workflows/revise.md` — update existing spec
- `workflows/phase-0-compliance-test.md` — empirical injection-compliance measurement
- `workflows/validate-navigation.md` — post-generation validator rubric
- `references/` — archetype catalog, chrome contracts, anti-patterns, injection template, classification rubric
- `examples/` — gold-standard NAVIGATION.md and audit/compliance report formats

## Philosophy

1. **Authoring is probabilistic; enforcement is deterministic.** Injection is the fast path; the validator is the truth.
2. **Ground specs in shipped code.** The Implementation reviewer's job is to flag any contract that would require a component refactor — the user chooses to align the spec or flag the refactor.
3. **Four surface classes, by auth model.** `public`, `token-auth`, `session-auth-client`, `session-auth-admin`. The subdomain is secondary.
4. **The spec prevents drift on unseen screens.** Self-consistency tests are necessary but not sufficient. The adversarial verification phase is the real gate.
