# Draft Crane — Executive Summary

## What It Is

DraftCrane is a browser-based writing environment that helps non-technical professionals turn scattered expertise into a publishable nonfiction book. It connects to the author's own Google Drive, provides a chapter-based editor with AI writing assistance, and exports directly to PDF and EPUB — with all manuscript files stored in the author's own cloud account.

**Tagline:** Your book. Your files. Your cloud. With an AI writing partner.

## Stage

**Design → Prototype** — PRD v2.0 complete (synthesized from 3-round, 6-agent team review). Phase 0 prototype in development.

## Target Users

Non-technical professionals — consultants, coaches, academics, founders, executives — who have deep expertise scattered across dozens of documents and have been meaning to write a book for years. iPad Safari is the primary device target.

## Problem

Writing a nonfiction book today requires stitching together word processors, note apps, research folders, AI chat tools, and formatting software. The target customer: "I have 200 pages of raw material and zero finished chapters."

## Solution (Phase 0)

Five core capabilities:

1. **Sign in** — Clerk auth (Google primary)
2. **Connect Google Drive** — `drive.file` scope, auto-create Book Folder, user owns all files
3. **Chapter-based editor** — structured writing with auto-save (IndexedDB → Drive → D1 metadata), chapter reorder, word counts
4. **AI rewrite** — select text, suggestion chips + freeform instruction, SSE streaming via Claude API, accept/reject/retry
5. **Export** — PDF and EPUB, full-book or single-chapter, saved to Drive or downloaded

## Competitive Position

DraftCrane's real competitor is the user's existing Google Drive folder chaos. Phase 0 wins on: chapter structure (vs. long Google Docs), integrated AI (vs. copy-pasting to ChatGPT), cloud file ownership (unique), and iPad-first design.

## Kill Criteria

| Gate            | Criterion                                                                       |
| --------------- | ------------------------------------------------------------------------------- |
| After prototype | At least 1 of 5-10 test users completes a chapter (500+ words) in first session |
| After beta      | 3+ of 10 beta users return for second session                                   |
| After 90 days   | Willingness-to-pay signal ($19-29/month "no-brainer")                           |

## Tech Stack

- **Frontend:** Next.js + Tailwind on Vercel
- **Backend:** Cloudflare Workers (Hono)
- **Database:** D1 (metadata only — content lives in Google Drive)
- **Object Storage:** R2 (export artifacts, pre-Drive buffer)
- **Cache:** KV (sessions, rate limits)
- **Auth:** Clerk
- **AI:** Direct Anthropic Claude API (SSE streaming)
- **File Storage:** Google Drive (`drive.file` scope)
- **Secrets:** Infisical at path `/dc`

## Infrastructure

| Resource       | Name              |
| -------------- | ----------------- |
| Worker         | `dc-api`          |
| Database       | D1 (metadata)     |
| Object Storage | R2 (exports)      |
| Cache          | KV                |
| Frontend       | Next.js on Vercel |

## Repository

`venturecrane/dc-console`

## Phased Roadmap

| Phase       | Focus                                                         | Gate                                |
| ----------- | ------------------------------------------------------------- | ----------------------------------- |
| 0 (current) | Auth, Drive, editor, AI rewrite, export                       | Chapter completion in first session |
| 1           | Book Blueprint, outline generation, Craft Buttons, Idea Inbox | Return visits                       |
| 2           | Source Intelligence (import/index existing materials)         | Willingness to pay                  |
| 3           | Publishing polish, templates, cover toolkit                   | —                                   |
| 4           | Consistency engine, developmental editing                     | —                                   |

## Open ADRs

- **ADR-001:** Editor library (Tiptap vs. Lexical — iPad spike needed)
- **ADR-002:** Drive sync strategy (2s debounce recommended)
- **ADR-003:** AI provider (direct Anthropic API recommended)
- **ADR-004:** PDF/EPUB generation (Browser Rendering spike needed)
