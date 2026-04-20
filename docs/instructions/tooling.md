# Tooling

**Rule:** Reach for the right plugin at the right moment. Installed plugins are authoritative for their domain; do not reinvent what a plugin already does.

<!-- SOD_SUMMARY_START -->

- **Context7** — call before editing against any third-party library/framework API. Training data is frozen; Context7 returns current vendor docs.
- **TypeScript LSP** — use for type-aware navigation and diagnostics before spinning up `tsc`.
- **Vercel plugin** — use for deploy status, env inspection, and deploy logs on Vercel-hosted ventures (crane-console).
- **Playwright** — use to codify repeatable browser flows (post-deploy smoke checks, E2E tests). Not a replacement for `claude-in-chrome` ad-hoc use.
- **Frontend Design** — invoke for production-grade UI generation. Wire-in to `/product-design` is in-flight in a separate session.
- **Semgrep** — run before ship on auth, secret-handling, webhook, or input-parsing code changes.
<!-- SOD_SUMMARY_END -->

---

## Plugin Catalog

The six plugins below are installed enterprise-wide via `/plugin install` and bootstrapped onto fleet machines via `scripts/bootstrap-machine.sh`. Rolled out 2026-04-19.

### Context7

**What it does.** MCP server from Upstash that fetches live, version-specific vendor documentation on demand. Inject `use context7` (or let the plugin auto-trigger) with a library name plus the version you're on; Context7 pulls the current docs page and returns it inline.

**When to use.**

- About to write code against a third-party library, framework, or SDK you haven't touched in the current session
- Upgrading a dependency across a major version (Astro, `@astrojs/cloudflare`, React, Wrangler, etc.)
- Debugging an API that doesn't behave as expected and the docs in training may be stale
- Any PR that bumps a `package.json` version beyond a patch

**When NOT to use.**

- For enterprise-internal docs — use `crane_doc('global' | '{venture}', '<name>.md')` instead
- For questions about code in this repo — read the source

**Anti-pattern.** Trial-and-error against vendor APIs before reaching for Context7. If you find yourself failing twice against the same third-party API, you skipped the Context7 step.

### TypeScript LSP

**What it does.** Language server exposing type-aware diagnostics, go-to-definition, find-references, and completion intelligence across the repo's TypeScript files.

**When to use.**

- Navigating large type graphs (Astro `App.Locals`, Cloudflare `Env`, shared contract types)
- Finding call sites of a function or type
- Surfacing type errors without the round-trip of running `tsc`

**When NOT to use.**

- Never a substitute for `npm run verify` before ship — the LSP runs on an in-memory model that may lag disk state

### Vercel plugin

**What it does.** Exposes Vercel CLI functionality as in-session skills: deploy status, project linking, env var inspection, deploy logs, marketplace integrations, CI/CD guidance, and Next.js / AI SDK / Chat SDK / Workflow expert references.

**When to use.**

- crane-console deployment inspection post-ship (replaces tab-switching to the Vercel dashboard)
- Diagnosing deploy failures from Vercel side
- Managing Vercel env vars alongside Infisical (source of truth is still Infisical; Vercel env is downstream)

**When NOT to use.**

- On Cloudflare Workers ventures (SS, DFG, KE, SC) — use `wrangler` instead
- For secret rotation — always go through Infisical (`crane_doc('global', 'secrets.md')`)

### Playwright

**What it does.** Microsoft browser automation — navigation, form fill, assertions, screenshots. Integrates as a plugin that can scaffold Playwright test suites in any venture.

**When to use.**

- Codifying a post-deploy smoke checklist into runnable tests (first example: the SS workers-migration validation checklist at `docs/handoffs/workers-migration-validation.md` in ss-console)
- Any user-flow regression a venture wants in CI

**When NOT to use.**

- Interactive, one-off browsing — use `claude-in-chrome` MCP
- Scraping or data extraction — use `WebFetch` or a scraping tool

**Distinction from `claude-in-chrome`.** Claude-in-chrome is for live, interactive sessions (Captain watching the browser). Playwright is for unattended, reproducible test flows that run in CI.

### Frontend Design

**What it does.** Anthropic skill for generating production-grade React/TSX components that avoid generic AI aesthetics. Invoked via the `frontend-design:frontend-design` skill.

**When to use.**

- Building net-new UI surfaces that need distinctive polish
- Inside `/product-design` once the wire-in lands (currently in-flight in a separate session)

**When NOT to use.**

- Copy-editing existing components — use direct edits
- Wireframing or design-spec authoring — use `/ux-brief`, `/nav-spec`, `/design-brief`

**Note.** If the output contradicts a venture's `.design/DESIGN.md` spec, the spec wins. Frontend Design is a generator, not a style arbiter.

### Semgrep

**What it does.** Static analysis scanner for security patterns (injection, XSS, secrets, misconfigurations) and code-quality anti-patterns. Exposes setup skill `semgrep:setup-semgrep-plugin`.

**When to use.**

- Before ship on any PR touching auth flows, webhook handlers, secret loading, input parsing, or SQL/KV queries
- As a first-pass before invoking `/security-review` on changes to externally-facing code

**When NOT to use.**

- As a replacement for `/security-review` — Semgrep catches patterns, `/security-review` reasons about them

---

## Invocation Reference

| Scenario                            | First tool to reach for                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| Upgrading a library version         | Context7                                                      |
| Unfamiliar vendor API               | Context7                                                      |
| Finding type definitions or callers | TypeScript LSP                                                |
| Vercel deploy status or logs        | Vercel plugin                                                 |
| Cloudflare Workers deploy status    | `wrangler tail` / `wrangler deployments`                      |
| Codifying a smoke test              | Playwright                                                    |
| Ad-hoc browser check                | `claude-in-chrome` MCP                                        |
| Generating new UI components        | Frontend Design (direct; `/product-design` wire-in in-flight) |
| Pre-ship security scan              | Semgrep → `/security-review`                                  |
| Internal enterprise docs            | `crane_doc('global', '<name>.md')`                            |
| Venture-scoped docs                 | `crane_doc('{venture}', '<name>.md')`                         |

---

## Fleet Parity

Plugins install to `~/.claude/plugins/` per-machine. `scripts/bootstrap-machine.sh` installs the canonical set on new fleet machines. To add a plugin to the enterprise:

1. Install locally: `/plugin install <name>`
2. Validate with a real task (not a smoke-call)
3. Add to the catalog above with trigger conditions and anti-patterns
4. Add the install line to `scripts/bootstrap-machine.sh`
5. Run the install on every active fleet machine (next fleet-sync cycle)
6. Upload the updated doc: `./scripts/upload-doc-to-context-worker.sh docs/instructions/tooling.md`

To deprecate a plugin:

1. Remove the install line from `scripts/bootstrap-machine.sh`
2. Remove the catalog entry (or move it under a "Retired" section with date and reason)
3. Upload the updated doc
4. Let fleet machines uninstall on next sync (or run `/plugin uninstall <name>` manually)

---

## Retired

No retirements yet. When a plugin is dropped, record here with: plugin name, date retired, reason, and what replaced it (if anything).
