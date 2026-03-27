# VCMS Conventions

VCMS (Venture Crane Management System) is the enterprise knowledge store. It holds agent-relevant context in a tagged notes system backed by Cloudflare D1, accessible from any machine via the Crane Context API. This document covers storage conventions, tag taxonomy, MCP tool usage, and boundaries with other storage systems.

## What VCMS Is

VCMS is a `notes` table in the crane-context D1 database. Each note has:

| Field          | Type              | Description                                                      |
| -------------- | ----------------- | ---------------------------------------------------------------- |
| `id`           | `note_<ULID>`     | Sortable, timestamp-embedded identifier                          |
| `title`        | string (nullable) | Optional title/subject line                                      |
| `content`      | string            | Note body (max 500KB)                                            |
| `tags`         | JSON string array | Categorization tags (max 20 tags, 50 chars each)                 |
| `venture`      | string (nullable) | Venture scope (`vc`, `ke`, `sc`, `dfg`, `dc`) or null for global |
| `archived`     | boolean           | Soft-delete flag (0 = active, 1 = archived)                      |
| `created_at`   | ISO 8601          | Creation timestamp                                               |
| `updated_at`   | ISO 8601          | Last modification timestamp                                      |
| `actor_key_id` | string            | Attribution (derived from API key)                               |

Notes are designed to make agents smarter across sessions. They persist enterprise context that would otherwise be lost between session handoffs.

## When to Use VCMS vs Other Storage

| Content Type                | Storage         | Why                                            |
| --------------------------- | --------------- | ---------------------------------------------- |
| Venture overviews, strategy | VCMS            | Agent context that crosses sessions and repos  |
| Product requirements (PRDs) | VCMS            | Agents need these during development sessions  |
| Market research, bios       | VCMS            | Enterprise knowledge reused by multiple agents |
| Design briefs               | VCMS            | Referenced during implementation sessions      |
| Work items, bugs, features  | GitHub Issues   | Trackable, assignable, closeable               |
| Architecture decisions      | `docs/adr/`     | Version-controlled, repo-specific              |
| Process documentation       | `docs/process/` | Version-controlled, repo-specific              |
| Code                        | Git             | Version-controlled source of truth             |
| Secrets, API keys           | Infisical       | Encrypted, rotatable, auditable                |
| Session handoffs            | `/eos` endpoint | Structured session-to-session context passing  |
| Personal content            | Apple Notes     | Not enterprise knowledge                       |

**Key rule: never auto-save to VCMS.** Only store notes when the Captain (human operator) explicitly asks to save something. If in doubt, ask before saving.

## Tag Taxonomy

Tags are the primary organization mechanism. Notes can have up to 20 tags. New tags can be added freely without code changes, but the following are the established vocabulary:

### Core Tags

| Tag                 | Purpose                                                     | Typical Venture Scope |
| ------------------- | ----------------------------------------------------------- | --------------------- |
| `executive-summary` | Venture overviews - mission, stage, tech stack              | Per venture + global  |
| `prd`               | Product requirements documents                              | Per venture           |
| `design`            | Design briefs, component specs, visual direction            | Per venture           |
| `strategy`          | Strategic assessments, founder reflections, market position | Per venture           |
| `methodology`       | Frameworks, processes (e.g., Crane Way, BVM)                | Global or per venture |
| `market-research`   | Competitor analysis, market sizing, trends                  | Per venture           |
| `bio`               | Founder and team bios                                       | Global or per venture |
| `marketing`         | Service descriptions, positioning, messaging                | Per venture           |
| `governance`        | Legal, tax, compliance notes                                | Global or per venture |
| `code-review`       | Codebase review scorecards, enterprise drift assessments    | Per venture           |
| `content-scan`      | Content pipeline scan results and analysis                  | Per venture           |

### Tags Surfaced in SOD Briefing

The SOD (Start of Session) flow includes a "Venture Knowledge Base" discovery section. This section surfaces notes matching a subset of tags considered venture-critical for development agents:

- `prd`
- `design`
- `strategy`
- `methodology`
- `market-research`

Notes tagged `executive-summary` are delivered separately as enterprise context. Tags like `bio`, `marketing`, and `governance` are available via search but not included in the automatic SOD briefing.

## CRUD Operations via MCP Tools

### crane_note - Create or Update

The `crane_note` MCP tool handles both creation and updates.

**Create a note:**

```
crane_note(
  action: "create",
  title: "KE Product Requirements",
  content: "...",
  tags: ["prd"],
  venture: "ke"
)
```

**Update an existing note:**

```
crane_note(
  action: "update",
  id: "note_01HXY...",
  title: "KE Product Requirements v2",
  content: "...",
  tags: ["prd"]
)
```

Parameters:

| Parameter | Create   | Update   | Description                     |
| --------- | -------- | -------- | ------------------------------- |
| `action`  | Required | Required | `"create"` or `"update"`        |
| `id`      | Ignored  | Required | Note ID to update               |
| `title`   | Optional | Optional | Title/subject line              |
| `content` | Required | Optional | Note body                       |
| `tags`    | Optional | Optional | Array of tag strings            |
| `venture` | Optional | Optional | Venture code or omit for global |

### crane_notes - Search and List

The `crane_notes` MCP tool searches and lists notes.

**Search by tag:**

```
crane_notes(tag: "executive-summary")
```

**Search by venture:**

```
crane_notes(venture: "ke")
```

**Text search:**

```
crane_notes(q: "authentication flow")
```

**Combined filters:**

```
crane_notes(tag: "prd", venture: "sc", limit: 5)
```

Parameters:

| Parameter | Description                          | Default |
| --------- | ------------------------------------ | ------- |
| `venture` | Filter by venture code               | All     |
| `tag`     | Filter by single tag                 | All     |
| `q`       | Text search across title and content | None    |
| `limit`   | Maximum results to return            | 10      |

Results are returned sorted by creation date (newest first). When more results exist than the limit, a pagination cursor is available.

## Venture Scoping

Notes have an optional `venture` field that determines their visibility scope:

- **Venture-scoped** (`venture: "ke"`) - visible only when querying for that venture
- **Global** (`venture: null`) - visible to all ventures

When querying with `include_global: true` (used internally by SOD), notes matching the specified venture AND global notes are both returned. This is how the SMD Enterprise Summary (global) and per-venture executive summaries both appear in SOD briefings.

Valid venture codes are loaded from `config/ventures.json` and validated on write. Attempting to save a note with an unrecognized venture code returns an error.

## Search Conventions

### By Tag

Tags are stored as JSON arrays and searched with SQL LIKE patterns. A query for tag `prd` matches any note whose `tags` column contains `"prd"` in the JSON array.

```
crane_notes(tag: "executive-summary", venture: "vc")
```

### By Venture

Venture filtering is exact-match. To include global notes alongside venture-specific ones, the internal API uses `include_global: true`.

```
crane_notes(venture: "dfg")
```

### Text Search

Text search is case-insensitive substring matching across both `title` and `content` fields.

```
crane_notes(q: "competitor analysis")
```

### Common Search Patterns by Skill

| Skill             | Query Pattern                                              |
| ----------------- | ---------------------------------------------------------- |
| Portfolio Review  | `crane_notes(tag: "code-review", venture: "{code}")`       |
| Content Scan      | `crane_notes(tag: "content-scan", limit: 1)`               |
| Design Brief      | `crane_notes(tag: "executive-summary", venture: "{code}")` |
| Code Review       | `crane_notes(tag: "code-review", venture: "{code}")`       |
| Enterprise Review | `crane_notes(tag: "code-review", q: "Enterprise Review")`  |
| Docs Refresh      | `crane_notes(tag: "executive-summary", venture: "{code}")` |
| Build Log         | `crane_notes` (broad search for recent handoff context)    |

## Archiving

Notes are soft-deleted via the `archived` flag. Archived notes:

- Are excluded from all queries by default
- Can be included by setting `include_archived: true` in the API query
- Retain all data (title, content, tags, venture) for potential restoration
- Continue to have their `updated_at` and `actor_key_id` updated when archived

Archive a note via the REST API:

```
POST /notes/:id/archive
```

There is no MCP tool for archiving - it is done through the direct API endpoint.

## Size Limits

| Constraint        | Limit    | Notes                                     |
| ----------------- | -------- | ----------------------------------------- |
| Content size      | 500KB    | D1 rows cap at 1MB; 500KB leaves headroom |
| Tags per note     | 20       | Each tag max 50 characters                |
| Tag length        | 50 chars | Per individual tag                        |
| Results per query | 100 max  | Default page size is 20                   |

## What NOT to Put in VCMS

- **Work items, bugs, feature requests** - Use GitHub Issues. Issues are trackable, assignable, and closeable. VCMS is not a task tracker.
- **Code, terminal output, implementation details** - These are ephemeral and belong in git or session context, not permanent knowledge.
- **Session handoffs** - Use `/eos`. Handoffs have their own structured table with session linkage.
- **Architecture decisions** - Use `docs/adr/` in the relevant repository. ADRs are version-controlled and repo-specific.
- **Process documentation** - Use `docs/process/` in the relevant repository.
- **Secrets, API keys, credentials** - Use Infisical. Never store secrets in VCMS.
- **Personal content** - Use Apple Notes. VCMS is for enterprise knowledge only.

## AI Agent Authorship Note

All VCMS content is produced by AI agents operating under the Crane system. The agents ARE the voice. Content stored in VCMS reflects this - it is not human writing with AI assistance, it is what an organized, structured team of AI agents produces. Never change author attribution to a human name or present content as human-drafted.
