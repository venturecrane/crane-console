# Guardrails

**Rule:** Never deprecate features, drop schema, or change auth without Captain directive.

<!-- SOD_SUMMARY_START -->

- Never remove, deprecate, or disable existing features without explicit Captain directive
- Never drop database columns/tables or run destructive migrations without Captain directive
- Never modify authentication flows or remove access controls without Captain directive
- "Unused" is not sufficient justification - external consumers, bookmarks, and integrations may depend on it
- Infrastructure changes that affect agent-facing tools must update the corresponding instruction modules in the same PR
- When in doubt, STOP and escalate using the format below
<!-- SOD_SUMMARY_END -->

---

## Protected Actions

The following actions require an explicit Captain directive before proceeding.
No agent may take these actions based on their own judgment, regardless of
how confident they are that the action is safe.

### Feature Deprecation

Removing, disabling, or hiding any existing user-facing functionality:

- Deleting routes, pages, or UI components
- Removing API endpoints or response fields
- Disabling features behind flags without a directive to do so
- Replacing a feature with a different implementation that changes behavior

### Schema Changes (Destructive)

Any database change that removes or alters existing data structures:

- Dropping columns or tables
- Renaming columns (breaks existing queries)
- Changing column types in ways that lose data
- Running migrations that delete or transform existing data

### Auth Flow Changes

Modifications to how users authenticate or what they can access:

- Changing authentication mechanisms (e.g., swapping session-based for token-based)
- Removing access controls or permission checks
- Modifying OAuth flows, callback URLs, or token lifetimes
- Changing which roles can access which endpoints

---

## Concrete Heuristics

Bias toward false positives (stopping when unnecessary) over false negatives
(proceeding when you shouldn't). These are real examples of guardrail violations:

- **Removing an "unused" page you found during refactoring** - STOP, this is deprecation
- **Deleting an API endpoint because no frontend code calls it** - STOP, external consumers may depend on it
- **Renaming a route path to "clean up" the URL structure** - STOP, this breaks bookmarks and integrations
- **Dropping a database column marked "deprecated" in a comment** - STOP, comments are not Captain directives
- **Removing a feature flag check because the flag is always true** - STOP, the flag may be used for rollback
- **Consolidating two endpoints into one** - STOP, the old endpoint path is a public contract

**Standing rule:** If you are deleting a route, page, component, API endpoint,
or database table that currently exists in the production codebase, treat it as
a protected action regardless of whether it appears unused.

---

## Escalation Format

When a guardrail is triggered, stop work and report using this format:

```
## Guardrail Triggered

**Protected action:** {what you were about to do}
**Category:** {Feature Deprecation | Schema Change | Auth Flow Change}
**Context:** {why this came up during your current task}
**Impact:** {what would break or change if this action were taken}

Awaiting Captain directive to proceed or adjust scope.
```

---

## Instruction Module Coupling

Infrastructure changes have two audiences: **machines** (config, code) and **agents**
(instruction modules). When you change how a tool, service, or integration works,
you must update the instruction modules that teach agents how to use it - in the
same PR.

### What Counts

Any change to authentication, configuration, MCP setup, CLI behavior, or
deployment that affects how an agent would interact with the tool:

- Changing auth mechanisms (API key to OAuth, token rotation, new credentials)
- Adding, removing, or reconfiguring MCP servers
- Changing CLI flags, environment variables, or launch behavior
- Modifying deployment targets or infrastructure endpoints

### How to Check

Before marking a PR complete, search for instruction modules that reference
the tool or service you changed:

```bash
grep -rl "{tool_name}" docs/instructions/
```

Also check: `crane_doc_audit()` for the full doc index. Instruction modules
are listed in `CLAUDE.md` under "Instruction Modules."

### Concrete Examples

- **Changing Stitch MCP auth method** - MUST update `wireframe-guidelines.md`
  (tells agents how to use Stitch) and update relevant launcher code
- **Changing how `crane` injects secrets** - MUST update `secrets.md` and any
  venture-specific docs that reference secret access patterns
- **Reconfiguring an MCP server** - MUST update any instruction module that
  references that server's tools or capabilities
- **Changing fleet bootstrap steps** - MUST update `fleet-ops.md`

### Why This Matters

Agents read instruction modules to learn how to use tools. If the infrastructure
changes but the docs don't, agents will follow stale instructions and waste time
on approaches that no longer work. The code fix is incomplete without the doc fix.

---

## Per-Venture Feature Manifests

Each venture may maintain a feature manifest listing protected features
specific to that venture. The manifest lives in crane context as a
venture-scoped doc:

```
{venture}/feature-manifest.md
```

The manifest is optional. The guardrails above apply whether or not a manifest
exists. The manifest adds venture-specific detail (e.g., "the /api/v1/fees
endpoint is used by the mobile app and must not change without a migration
plan").

To create a manifest for a venture:

1. Audit the venture's routes, API endpoints, and database schema
2. Document each protected surface with its known consumers
3. Upload via `crane_doc('{venture}', 'feature-manifest.md')`

---

## Adding Guardrails

When a new governance gap is discovered (e.g., an agent takes an unauthorized
action in a category not covered above):

1. Add the new category to the Protected Actions section
2. Add concrete heuristic examples
3. Update the SOD summary between the markers
4. Upload the updated doc: `./scripts/upload-doc-to-context-worker.sh docs/instructions/guardrails.md`
5. The SOD section updates automatically - no TypeScript changes needed
