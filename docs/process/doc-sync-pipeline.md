# Doc Sync Pipeline

How documentation flows from markdown files in git to agents (via D1) and to the Starlight documentation site.

## Architecture

Two independent sync paths run on every push to `main`:

```
                                  ┌──> GitHub Action (sync-docs.yml)
                                  │       │
docs/**/*.md committed to main ───┤       ▼
                                  │    upload-doc-to-context-worker.sh
                                  │       │
                                  │       ▼
                                  │    crane-context D1 (context_docs table)
                                  │       │
                                  │       ▼
                                  │    crane_doc MCP tool (agents read docs)
                                  │
                                  └──> Vercel build
                                          │
                                          ▼
                                       sync-docs.mjs (prebuild)
                                          │
                                          ▼
                                       Starlight site (site/src/content/docs/)
```

### Path 1: Git Push to Agent-Readable D1

Agents read documentation via the `crane_doc` MCP tool, which fetches from crane-context's D1 database. The sync from git to D1 is handled by a GitHub Action.

### Path 2: Git Push to Starlight Documentation Site

The Starlight site (hosted on Vercel) runs `sync-docs.mjs` as a prebuild step. This copies markdown files from the repo into the site's content directory with frontmatter injection and template variable replacement.

## Path 1: GitHub Action to D1

### Trigger

The workflow (`.github/workflows/sync-docs.yml`) runs on:

- **Push to `main`** when files change under `docs/company/`, `docs/operations/`, or `docs/ventures/`
- **Manual dispatch** (`workflow_dispatch`) for bulk re-upload of all docs

### Scope Determination

Every document gets a scope that determines which agents can see it:

| Directory path           | Scope                 | Example                      |
| ------------------------ | --------------------- | ---------------------------- |
| `docs/company/*`         | `global`              | Available to all ventures    |
| `docs/operations/*`      | `global`              | Available to all ventures    |
| `docs/ventures/{code}/*` | `{code}` (e.g., `ke`) | Only visible to that venture |

The scope is derived from the file path using a simple regex match. Files outside these three directories are ignored.

### Change Detection

On push events, the workflow runs `git diff --name-status HEAD^ HEAD` to detect:

- **Added/Modified** (`A`/`M`) files -- queued for upload
- **Deleted** (`D`) files -- queued for deletion from D1
- **Renamed** (`R`) files -- old path deleted, new path uploaded

On manual dispatch, all matching files are treated as additions.

### Upload Process

Each changed file is uploaded by `scripts/upload-doc-to-context-worker.sh`:

1. Reads the markdown content from disk
2. Extracts the title from the first `# heading`
3. Builds a JSON payload with `scope`, `doc_name`, `content`, `title`, `source_repo`, `source_path`, and `uploaded_by`
4. POSTs to `crane-context /admin/docs` with `X-Admin-Key` authentication
5. crane-context computes a SHA-256 content hash, assigns a version number, and stores the document

The API response includes:

- `version` -- Auto-incremented integer
- `content_hash` -- SHA-256 of the content
- `created` -- Boolean indicating first upload vs update
- `content_size_bytes` -- Size of stored content

### Deletion Process

For deleted files, the workflow sends `DELETE /admin/docs/{scope}/{doc_name}` directly via `curl`.

### Content Hashing and Versioning

crane-context stores each document in the `context_docs` table with:

| Column         | Purpose                         |
| -------------- | ------------------------------- |
| `scope`        | `global` or venture code        |
| `doc_name`     | Filename (e.g., `secrets.md`)   |
| `content`      | Full markdown content           |
| `content_hash` | SHA-256 of the content          |
| `title`        | Extracted from first heading    |
| `version`      | Auto-incremented on each update |

When an agent fetches docs for a venture, crane-context returns all `global` docs plus docs scoped to that specific venture. A combined content hash (SHA-256 of all individual hashes joined by `|`) enables cache validation.

### How Agents Read Docs

Agents call `crane_doc(scope, doc_name)` via MCP, which hits `GET /docs/{scope}/{doc_name}` on crane-context. The response includes the full content, hash, title, and version.

For listing available docs: `GET /docs?venture={code}` returns metadata (without content) for all global + venture-specific docs.

## Path 2: Starlight Site Sync

### Trigger

The `sync-docs.mjs` script runs as a Vercel prebuild step before `astro build`.

### Directories Synced

The script syncs markdown files from these directories under `docs/`:

```
company, operations, ventures, infra, process,
instructions, design-system, adr, runbooks, standards
```

Additionally, venture design specs from `docs/design/ventures/{code}/` are copied into each venture's content directory.

### Processing Pipeline

For each markdown file:

1. **Template variable replacement** -- Tokens are replaced with data from `config/ventures.json`:
   - `{{venture:CODE:FIELD}}` -- Replaced with the venture's field value (e.g., `{{venture:ke:name}}` becomes "Kid Expenses")
   - `{{portfolio:table}}` -- Replaced with a generated markdown table of all ventures with stage, status, and tech stack
   - `{{skills:table}}` -- Replaced with an auto-generated table of all skills from `.agents/skills/*/SKILL.md`
2. **Frontmatter injection** -- If the file lacks YAML frontmatter, a `title` is extracted from the first `# heading` and frontmatter is prepended
3. **Staleness check** -- Files with more than 2 TBD markers or fewer than 20 lines are flagged in a staleness report

### Fail-Fast Guard

If the `docs/` directory does not exist (which happens when Vercel's Root Directory is misconfigured), the script exits immediately with an error message.

## Documentation Audit System

crane-context maintains a `doc_requirements` table that defines which documents each venture should have. The audit system (`GET /docs/audit`) compares requirements against actual documents in the `context_docs` table.

### Default Requirements

| Pattern                             | Condition    | Auto-Generate | Staleness |
| ----------------------------------- | ------------ | ------------- | --------- |
| `{venture}-project-instructions.md` | All ventures | Yes           | 90 days   |
| `{venture}-api.md`                  | Has API      | Yes           | 90 days   |
| `{venture}-schema.md`               | Has database | Yes           | 90 days   |

The `{venture}` placeholder is replaced with the venture code at audit time. Requirements can specify `condition` fields (`has_api`, `has_database`) and `generation_sources` (what to read when auto-generating the doc).

Agents access the audit via `crane_doc_audit` MCP tool.

## Manual Upload

For one-off uploads outside the GitHub Action:

```bash
CRANE_ADMIN_KEY=<key> ./scripts/upload-doc-to-context-worker.sh <doc-path> [scope]
```

The script has a built-in whitelist of global doc names. If the doc name is not whitelisted, scope is determined from the `GITHUB_REPOSITORY` environment variable or must be provided as a second argument.

## Cache Invalidation and Freshness

- **D1 path**: Documents are overwritten on every push. There is no TTL-based expiry; freshness is guaranteed by the git-to-D1 sync running on every merge to `main`.
- **Agent cache**: The combined content hash returned by `GET /docs?venture={code}` can be used by clients to detect when the doc set has changed.
- **Staleness detection**: The doc audit system flags documents older than their configured `staleness_days` threshold. The Starlight prebuild script flags pages with excessive TBD markers.

## Key Files

| File                                             | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `.github/workflows/sync-docs.yml`                | GitHub Action: sync on push to main       |
| `scripts/upload-doc-to-context-worker.sh`        | Upload script called by the Action        |
| `site/scripts/sync-docs.mjs`                     | Prebuild sync for Starlight site          |
| `workers/crane-context/src/docs.ts`              | Doc fetch utilities and combined hash     |
| `workers/crane-context/src/endpoints/queries.ts` | GET /docs, GET /docs/:scope/:doc_name     |
| `workers/crane-context/src/endpoints/admin.ts`   | POST /admin/docs, DELETE /admin/docs      |
| `workers/crane-context/src/audit.ts`             | Documentation audit engine                |
| `workers/crane-context/src/constants.ts`         | DEFAULT_DOC_REQUIREMENTS definition       |
| `config/ventures.json`                           | Venture metadata for template replacement |
