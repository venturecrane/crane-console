# Tooling

**Rule:** Reach for the right plugin at the right moment. Installed plugins are authoritative for their domain; do not reinvent what a plugin already does.

<!-- SOD_SUMMARY_START -->

- **Context7** — call before editing against any third-party library/framework API. Training data is frozen; Context7 returns current vendor docs.
- **TypeScript LSP** — use for type-aware navigation and diagnostics before spinning up `tsc`.
- **Vercel plugin** — use for deploy status, env inspection, and deploy logs on Vercel-hosted ventures (crane-console).
- **Playwright** — use to codify repeatable browser flows (post-deploy smoke checks, E2E tests). Not a replacement for `claude-in-chrome` ad-hoc use.
- **Frontend Design** — invoke for production-grade UI generation. Wire-in to `/product-design` is in-flight in a separate session.
- **Semgrep** — CI-only gate in each venture's `security.yml`. Not a Claude Code plugin (retired 2026-04-22). Fix findings in the PR that surfaces them.
<!-- SOD_SUMMARY_END -->

---

## Plugin Catalog

The five plugins below are installed enterprise-wide via `/plugin install` and bootstrapped onto fleet machines via `scripts/bootstrap-machine.sh`. Rolled out 2026-04-19. A sixth plugin, Semgrep, was installed in the same rollout and retired on 2026-04-22 — see the Retired section below for why. Security scanning now happens exclusively in CI via `security.yml`.

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

**What it does.** MCP server (`@playwright/mcp@latest`) that exposes programmatic browser control to an active Claude session. Headless by default. Scriptable per-tool-call. The plugin does not scaffold or run CI regression tests.

**Distinct from the `@playwright/test` library.** For committed spec files and CI deploy gates in a venture repo, install `@playwright/test` directly. That is a separate track unrelated to this plugin.

**Distinct from `claude-in-chrome` MCP.** `claude-in-chrome` attaches to Captain's live Chrome (watched, user's authenticated session). Playwright MCP runs headless and fresh (unwatched, no user state).

**When to use.**

- Agent-driven URL sweep on an unwatched target (visit N routes, assert status + title, report)
- Page content extraction where JS rendering is required (SPAs, client-rendered dashboards)
- Screenshot capture for a PR or handoff doc
- Reproducing a bug from a fresh browser session (no user-state bleed-through)

**When NOT to use.**

- Captain wants to watch: use `claude-in-chrome`
- Task needs the user's authenticated session (Notion, Gmail, logged-in dashboards): use `claude-in-chrome`
- Static HTML is enough, no JS rendering needed: use `WebFetch`
- Committed regression tests or CI deploy gates: install `@playwright/test` in the venture; this plugin is not the vehicle

### Frontend Design

**What it does.** Anthropic skill for generating production-grade React/TSX components that avoid generic AI aesthetics. Invoked via the `frontend-design:frontend-design` skill.

**When to use.**

- Building net-new UI surfaces that need distinctive polish
- Inside `/product-design` once the wire-in lands (currently in-flight in a separate session)

**When NOT to use.**

- Copy-editing existing components — use direct edits
- Wireframing or design-spec authoring — use `/ux-brief`, `/nav-spec`, `/design-brief`

**Note.** If the output contradicts a venture's `.design/DESIGN.md` spec, the spec wins. Frontend Design is a generator, not a style arbiter.

### Semgrep (CI gate, not a plugin)

**What it is now.** A GitHub Actions job in each venture's `.github/workflows/security.yml`. Runs on every PR and push to main against pinned rulesets (`p/typescript`, `p/javascript`, `p/security-audit`, `p/owasp-top-ten`), with an auxiliary `nosemgrep-audit` job that enforces ≥20-char justifications on any inline suppressions. Findings block merge.

**What it is NOT.** A Claude Code plugin. The plugin-level integration was installed on 2026-04-19 and retired on 2026-04-22 — see the Retired section below for why. Do not reinstall.

**When it fires.** Every push to main and every PR. The agent never invokes Semgrep directly; the gate runs automatically. Code paths that get the most scrutiny from the configured rulesets: auth flows, webhook handlers, secret loading, input parsing, SQL/KV queries.

**What the agent should do.**

- Write code that passes the gate. If a finding is a true positive, fix the underlying code.
- If a finding is a false positive, add an inline `// nosemgrep: rule-id — <≥20 char justification>` comment. The `nosemgrep-audit` job enforces substantive justifications; bare suppressions fail.
- Never disable Semgrep for convenience. `semgrep-disable` as a string is banned by the audit job.

**Pair with.** `/security-review` — Semgrep catches patterns; `/security-review` reasons about them. Use both on changes to externally-facing code.

---

## Invocation Reference

| Scenario                            | First tool to reach for                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| Upgrading a library version         | Context7                                                                      |
| Unfamiliar vendor API               | Context7                                                                      |
| Finding type definitions or callers | TypeScript LSP                                                                |
| Vercel deploy status or logs        | Vercel plugin                                                                 |
| Cloudflare Workers deploy status    | `wrangler tail` / `wrangler deployments`                                      |
| Codifying a smoke test              | Playwright                                                                    |
| Ad-hoc browser check                | `claude-in-chrome` MCP                                                        |
| Generating new UI components        | Frontend Design (direct; `/product-design` wire-in in-flight)                 |
| Pre-ship security scan              | Automatic via CI (`security.yml`); pair with `/security-review` for reasoning |
| Internal enterprise docs            | `crane_doc('global', '<name>.md')`                                            |
| Venture-scoped docs                 | `crane_doc('{venture}', '<name>.md')`                                         |

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

### Semgrep plugin (retired 2026-04-22)

**What it was.** `semgrep@claude-plugins-official` from the official Claude Code marketplace (v0.5.3). Installed 2026-04-19 as part of the initial plugin rollout. Exposed three hooks: `PostToolUse` (scanned every Edit/Write), `UserPromptSubmit` (injected a "secure-by-default libraries" block into every user prompt), and `SessionStart` (injected secure-default guidance at session start).

**Why it was retired.** The plugin hooks added friction without adding value over the CI gate. Specifically:

- The `PostToolUse` scanner ran on every in-session edit, including non-code changes (markdown frontmatter, docs, in-progress refactors). Required `SEMGREP_APP_TOKEN` to run; without login, the hook blocked edits entirely. Pre-merge CI already catches complete changes.
- The `UserPromptSubmit` hook appended a static security-libraries block to every prompt — pure context pollution.
- Flag-based "retirement" (`enabledPlugins["semgrep@..."] = false`) did not unload the hooks. The plugin's cached `hooks.json` continued to fire regardless of the flag. Full uninstall required removing the cache directory AND the `installed_plugins.json` entry.

**What replaced it.** Nothing at the plugin layer. Security scanning is now exclusively the CI gate in each venture's `.github/workflows/security.yml` — which is the professional pattern (pre-merge, on complete changes, findings reviewed in PR context). The plugin was a third redundant layer on top of CI + ad-hoc `/security-review`.

**Operational lesson.** Plugin "disable" flags are advisory in Claude Code; they do not unload hooks. To actually retire a plugin, remove it from `~/.claude/plugins/installed_plugins.json` AND delete the cache and data directories. See `reference_plugin_disable_vs_uninstall.md`.

---

## Agent Pitfalls

Discovered failure modes that agents should actively avoid. Each entry captures a real incident and its durable fix.

### Date generation in content frontmatter

Never use `new Date().toISOString().split('T')[0]` or similar UTC-based idioms when setting a `date:` value in article or log frontmatter. In any ~4-hour window around UTC midnight, UTC and the project's canonical Arizona/Pacific date disagree, and you'll stamp tomorrow's date on today's work.

**Use instead:**

- The session's `currentDate` context value (blessed, TZ-pinned).
- Shell: `TZ=America/Phoenix date +%Y-%m-%d` (explicit TZ; works from any fleet machine).

**What the CI will do if you get it wrong.** The vc-web content schema (`src/content.config.ts`) rejects any article or log stamped beyond today in America/Phoenix. `npm run build` in `ci.yml` will fail with `date must not be in the future (America/Phoenix)`. That's the safety net, not the primary defense — get the date right up front.

**Real incident.** 2026-04-22 content sprint: six articles drafted at 20:13 PDT (03:13 UTC next day) were stamped with `date: 2026-04-23` because the drafting agents used `new Date().toISOString()`. Caught post-facto, fixed in PR #103, validator added in PR #105.
