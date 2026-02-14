# Technical Lead Contribution — PRD Review Round 3 (Final)

**Author:** Technical Lead
**Date:** 2026-02-13
**Scope:** MVP / Phase 0 only
**Status:** Final after 3 rounds

---

## Changes from Round 2

1. **Email capture moved back to Phase 1 and explicitly deferred from Phase 0.** The Product Manager rejected email capture at launch (Round 2). The Business Analyst proposed a trigger-based threshold (1,000 monthly visitors for two consecutive months). The Competitor Analyst also deprioritized it in Round 2. I align with the consensus: email capture is a Phase 1 deliverable gated by a traffic trigger, not a Phase 0 requirement. The technical design is retained for when the trigger is met.

2. **Build logs elevated from recommendation to committed Phase 0 content type.** All six reviewers endorsed build logs. The Target Customer specified the cadence (supplement articles between deep dives). The UX Lead defined the visual treatment (lighter weight, no hero, date-prominent). This is no longer a suggestion -- it is a Phase 0 deliverable with a defined schema and route.

3. **Methodology page scoped down to a short "About" page at MVP.** The Target Customer recommended launching lean (500 words) and growing the methodology through articles. The Product Manager reversed their Round 1 deferral and elevated methodology, but endorsed the lean approach. I am updating the content model accordingly: `content/pages/about.md` rather than a full methodology collection.

4. **OG image strategy resolved as static site-wide image for Phase 0.** The UX Lead, Competitor Analyst, and Product Manager all weighed in. Consensus: a single branded OG image at launch, per-article generation deferred to Phase 2. I am adding the `ogImage` frontmatter field now but not building the generation pipeline.

5. **Accessibility approach refined.** The UX Lead's Round 2 revision deferred detailed accessibility items to implementation-level concerns, endorsing WCAG 2.1 AA as the PRD-level commitment with a Phase 1 audit task. I retain the specific implementation requirements in this document as a technical specification addendum, but no longer argue for enumerating them in the PRD body itself.

6. **Tag vocabulary deferred.** The UX Lead withdrew their tag vocabulary recommendation in Round 2, suggesting deferral until article count exceeds 10. I accept this. Tags remain in the frontmatter schema (optional field) but no initial vocabulary is mandated.

7. **Dark theme resolved as hybrid design requirement.** Five of six reviewers converged on this in Round 2. It is no longer an open decision. The specific color values from the UX Lead are adopted as the starting point, implemented via CSS custom properties in the Tailwind config.

8. **Content Security Policy updated to reflect the no-email-capture-at-launch decision.** The CSP is simpler at Phase 0 without a Worker endpoint. The policy remains strict with only Cloudflare Web Analytics as an external dependency.

9. **Added explicit WordPress redirect audit as a pre-launch task.** The Product Manager and I both flagged this in Round 2. It is now a concrete deliverable with a defined process.

10. **Consolidated architecture into a single ASCII diagram.** Round 2 described components in prose. This round provides a visual system boundary diagram for developer clarity.

---

## 1. Architecture and Technical Design

### 1.1 System Boundary Diagram

```
+---------------------------------------------------------------+
|                        BROWSER (Client)                       |
|  - Zero JS delivered (SSG HTML + CSS only)                    |
|  - System fonts (no external font requests)                   |
|  - Cloudflare Web Analytics beacon (injected by CF Pages)     |
+---------------------------------------------------------------+
         |                    |                    |
         | HTTPS              | HTTPS              | HTTPS
         v                    v                    v
+------------------+  +----------------+  +-------------------+
| Cloudflare Pages |  | Cloudflare DNS |  | CF Web Analytics  |
| (Static hosting) |  | (venturecrane  |  | (Privacy-friendly |
|                  |  |  .com)         |  |  server-side)     |
| - SSG HTML/CSS   |  |                |  |                   |
| - _headers file  |  |                |  |                   |
| - _redirects     |  |                |  |                   |
| - Preview deploys|  |                |  |                   |
+------------------+  +----------------+  +-------------------+
         ^
         | Deploy on push
         |
+------------------+
| GitHub Actions   |
| (CI/CD)          |
| - Build (Astro)  |
| - Lighthouse CI  |
| - Deploy to CF   |
+------------------+
         ^
         | Push / PR
         |
+------------------+
| venturecrane/    |
| vc-web (GitHub)  |
| - Astro 5 SSG    |
| - Content Colls  |
| - Tailwind CSS   |
+------------------+
```

### 1.2 Key Design Decisions

| Decision            | Choice                                                  | Rationale                                                                   |
| ------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Rendering mode      | Full SSG (zero SSR, zero client JS)                     | Performance (sub-1s TTFMP), simplicity, zero runtime cost                   |
| Content storage     | Astro Content Collections (Markdown + YAML frontmatter) | Type-safe schemas, build-time validation, git-native authoring              |
| Styling             | Tailwind CSS with CSS custom properties for theming     | Utility-first, purged at build time, theme-able via config                  |
| Syntax highlighting | Shiki (build-time, Astro default)                       | Zero client JS, accurate tokenization, dark theme support                   |
| Analytics           | Cloudflare Web Analytics                                | No cookies, no GDPR consent, no JS bundle, automatic with CF Pages          |
| Fonts               | System font stack                                       | Zero network requests, guaranteed sub-1s TTFMP on 3G                        |
| Image optimization  | Astro `<Image />` with automatic WebP                   | Build-time optimization, no runtime cost                                    |
| Hosting             | Cloudflare Pages                                        | Free tier, global CDN, preview deployments, `_headers`/`_redirects` support |
| CI/CD               | GitHub Actions                                          | Consistent with all other ventures, Lighthouse CI integration               |

### 1.3 Repository Structure

```
venturecrane/vc-web/
  src/
    pages/
      index.astro              # Homepage
      articles/
        index.astro            # Article listing
        [...slug].astro        # Individual article pages
      log/
        index.astro            # Build log listing (reverse-chronological)
        [...slug].astro        # Individual log entry pages
      about.astro              # About/methodology page (renders content/pages/about.md)
      portfolio.astro          # Portfolio page
      404.astro                # Custom 404 page
    layouts/
      Base.astro               # HTML shell, meta tags, CSP, OG, analytics
      Article.astro            # Article page layout (hero, metadata, content, disclosure)
      Log.astro                # Build log layout (lighter, date-prominent, no hero)
    components/
      Header.astro             # Site header + navigation
      Footer.astro             # Site footer + recent articles
      ArticleCard.astro        # Article preview card
      LogEntry.astro           # Build log preview card
      PortfolioCard.astro      # Venture card (live / pre-launch states)
      ArticleMeta.astro        # Date, reading time, updated date, tags
      AIDisclosure.astro       # AI authorship disclosure component
      MobileNav.astro          # CSS-only mobile navigation (< 640px)
    content/
      config.ts                # Content Collection schemas (articles, logs, pages)
      articles/                # Markdown article files
        my-article/
          index.md
          hero.png             # Co-located images
      logs/                    # Markdown build log files
        2026-02-15-log.md
      pages/
        about.md               # About/methodology page content
    styles/
      global.css               # CSS custom properties, base styles, theme
  public/
    og-default.png             # Site-wide OG image
    favicon.svg                # Favicon
    robots.txt
  astro.config.mjs
  tailwind.config.mjs
  package.json
  _headers                     # Cloudflare Pages headers (CSP, caching)
  _redirects                   # WordPress URL redirects
```

### 1.4 Rendering Pipeline

All pages are generated at build time. There is no server-side rendering, no client-side JavaScript, and no API calls at runtime. The pipeline:

1. **Build trigger:** `git push` to `main` (production) or PR branch (preview deploy)
2. **GitHub Actions:** Installs dependencies, runs `astro build`, runs Lighthouse CI against the build output
3. **Astro build:** Reads Content Collections, validates frontmatter against schemas, renders Markdown to HTML, processes images (WebP conversion, responsive sizing), generates static HTML + CSS
4. **Deploy:** Cloudflare Pages receives the `dist/` directory, serves it globally via CDN
5. **Headers/Redirects:** Cloudflare Pages applies `_headers` (CSP, cache-control) and `_redirects` (WordPress URL mappings) at the edge

---

## 2. Data Model (Content Collection Schemas)

Astro Content Collections use Zod schemas defined in `src/content/config.ts`. These are the concrete schema definitions for Phase 0.

### 2.1 Articles Collection

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content'

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().max(160), // SEO meta description length
    author: z.string().default('Venture Crane'),
    tags: z.array(z.string()).optional(),
    updatedDate: z.coerce.date().optional(),
    repo: z.string().url().optional(), // Link to related GitHub repo
    draft: z.boolean().default(false),
    ogImage: z.string().optional(), // Path to per-article OG image (Phase 2)
  }),
})
```

| Field         | Type             | Required | Default           | Purpose                                                    |
| ------------- | ---------------- | -------- | ----------------- | ---------------------------------------------------------- |
| `title`       | string           | Yes      | --                | Article title, used in `<title>`, OG title, and listing    |
| `date`        | Date             | Yes      | --                | Publication date, used for sorting and display             |
| `description` | string (max 160) | Yes      | --                | Meta description, article listing excerpt, OG description  |
| `author`      | string           | No       | `"Venture Crane"` | Byline. Supports founder name for personal pieces          |
| `tags`        | string[]         | No       | --                | Content categorization. No UI filtering at MVP             |
| `updatedDate` | Date             | No       | --                | Displayed when present to signal content freshness         |
| `repo`        | URL string       | No       | --                | Link to related source code repository                     |
| `draft`       | boolean          | No       | `false`           | Excluded from production build when `true`                 |
| `ogImage`     | string           | No       | --                | Per-article OG image path. Falls back to site-wide default |

### 2.2 Build Logs Collection

```typescript
const logs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
  }),
})
```

| Field   | Type     | Required | Default | Purpose                                      |
| ------- | -------- | -------- | ------- | -------------------------------------------- |
| `title` | string   | Yes      | --      | Log entry title                              |
| `date`  | Date     | Yes      | --      | Entry date, primary sort and display field   |
| `tags`  | string[] | No       | --      | Categorization, consistent with article tags |
| `draft` | boolean  | No       | `false` | Excluded from production build when `true`   |

Build logs intentionally omit `description`, `author`, `repo`, `updatedDate`, and `ogImage`. They are short-form, date-driven entries. No `description` means no excerpt generation overhead; the first paragraph of the markdown body serves as the implicit preview.

### 2.3 Pages Collection

```typescript
const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    updatedDate: z.coerce.date().optional(),
  }),
})

export const collections = { articles, logs, pages }
```

| Field         | Type   | Required | Default | Purpose                                   |
| ------------- | ------ | -------- | ------- | ----------------------------------------- |
| `title`       | string | Yes      | --      | Page title for `<title>` and heading      |
| `updatedDate` | Date   | No       | --      | "Last updated" display on evergreen pages |

The `pages` collection holds the about/methodology page. It is a separate collection from articles to distinguish evergreen content from timestamped content. At MVP, this collection contains a single file (`about.md`).

---

## 3. API Surface

**Phase 0 has no API endpoints.** The site is fully static. There are no Worker endpoints, no form handlers, and no dynamic routes at launch.

### 3.1 Phase 1 API (Post-Launch, Trigger-Gated)

These endpoints are designed now but implemented only when traffic triggers are met. Documented here to prevent architectural decisions in Phase 0 that would make Phase 1 harder.

#### Email Subscription Endpoint

**Trigger:** Monthly unique visitors exceed 1,000 for two consecutive months.

```
POST /api/subscribe

Request:
  Content-Type: application/json
  Body: { "email": "user@example.com" }

Response (success):
  Status: 200
  Body: { "ok": true }

Response (validation error):
  Status: 400
  Body: { "ok": false, "error": "Invalid email address" }

Response (duplicate):
  Status: 200
  Body: { "ok": true }
  (Idempotent — does not reveal whether email already exists)

Response (rate limited):
  Status: 429
  Body: { "ok": false, "error": "Too many requests" }
```

**Implementation:** Cloudflare Worker function. D1 database with a single table. Resend API for confirmation email (single opt-in at MVP, double opt-in if volume warrants).

**D1 Schema:**

```sql
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_subscribers_email ON subscribers(email);
```

**Rate limiting:** 3 requests per IP per hour, enforced via Cloudflare's built-in rate limiting rules (no custom implementation needed).

**Privacy:** No tracking, no cookies, no third-party data sharing. Email stored in D1 only. Unsubscribe link in every sent email. Compliant with CAN-SPAM. GDPR consent is implicit in the form submission (single-purpose, clear copy).

#### Contact Form Endpoint (Phase 2)

```
POST /api/contact

Request:
  Content-Type: application/json
  Body: {
    "name": "string",
    "email": "user@example.com",
    "message": "string (max 2000 chars)"
  }

Response (success):
  Status: 200
  Body: { "ok": true }

Response (validation error):
  Status: 400
  Body: { "ok": false, "error": "description" }
```

**Implementation:** Same Worker, Resend integration. Sends email to a configured recipient address. No data storage beyond the email delivery.

---

## 4. Non-Functional Requirements

All values are concrete, measurable, and testable in CI.

### 4.1 Performance

| Metric                                 | Target                                  | Measurement                                                               |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Lighthouse Performance score           | >= 95                                   | Lighthouse CI in GitHub Actions, every PR                                 |
| Lighthouse Accessibility score         | >= 95                                   | Lighthouse CI in GitHub Actions, every PR                                 |
| Lighthouse Best Practices score        | >= 95                                   | Lighthouse CI in GitHub Actions, every PR                                 |
| Lighthouse SEO score                   | 100                                     | Lighthouse CI in GitHub Actions, every PR                                 |
| Time to First Meaningful Paint (TTFMP) | < 1 second on simulated 3G              | Lighthouse CI with `--throttling-method=simulate`                         |
| Total page weight (HTML + CSS)         | < 50 KB gzipped (homepage)              | Build output size check                                                   |
| Client-side JavaScript                 | 0 bytes                                 | Build output audit (no `.js` files in `dist/`) except CF analytics beacon |
| External network requests              | 0 at page load (excluding CF analytics) | No fonts, no CDN resources, no third-party scripts                        |
| Time to Interactive                    | < 1 second on simulated 3G              | Lighthouse CI                                                             |
| Cumulative Layout Shift                | < 0.05                                  | Lighthouse CI                                                             |

### 4.2 Accessibility

| Requirement                      | Standard                                                                | Verification                                                         |
| -------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| WCAG conformance level           | 2.1 AA                                                                  | Lighthouse accessibility audit + manual review                       |
| Color contrast (normal text)     | >= 4.5:1                                                                | Automated contrast check against theme colors                        |
| Color contrast (large text / UI) | >= 3:1                                                                  | Automated contrast check                                             |
| Focus indicators                 | Visible on all interactive elements, custom-styled for dark backgrounds | Manual review during PR                                              |
| Touch targets                    | >= 44x44 CSS pixels                                                     | Manual review during PR                                              |
| Syntax highlighting contrast     | All Shiki token types >= 4.5:1 against code block background            | Manual verification of chosen theme                                  |
| HTML `lang` attribute            | `lang="en"` on `<html>`                                                 | Lighthouse audit                                                     |
| Motion                           | `prefers-reduced-motion` respected for all transitions/animations       | Manual review if any motion is added                                 |
| Table semantics                  | `<th>`, `scope` attributes on markdown-generated tables                 | Verify Astro's markdown renderer output; add remark plugin if needed |
| Heading hierarchy                | Single `<h1>` per page, no skipped levels                               | Lighthouse audit                                                     |
| Image alt text                   | Required for all content images                                         | Build-time linting                                                   |
| Skip navigation link             | Present on all pages                                                    | Manual review                                                        |

### 4.3 Security

| Requirement             | Implementation                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| HTTPS                   | Enforced by Cloudflare (automatic)                                 |
| Content Security Policy | Defined in `_headers` file (see Section 4.4)                       |
| X-Content-Type-Options  | `nosniff` in `_headers`                                            |
| X-Frame-Options         | `DENY` in `_headers`                                               |
| Referrer-Policy         | `strict-origin-when-cross-origin` in `_headers`                    |
| Permissions-Policy      | `camera=(), microphone=(), geolocation=()` in `_headers`           |
| No inline scripts       | Enforced by CSP; Shiki generates inline CSS for syntax tokens only |
| Dependency audit        | `npm audit` in CI, fail on high/critical vulnerabilities           |

### 4.4 Content Security Policy (Phase 0)

```
default-src 'self';
script-src 'self' static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self';
font-src 'self';
connect-src 'self' cloudflareinsights.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Notes:

- `'unsafe-inline'` for `style-src` is required because Shiki generates inline `style` attributes for syntax highlighting tokens. This is a known, accepted tradeoff. Shiki does not inject `<script>` tags, so `script-src` remains strict.
- `static.cloudflareinsights.com` is the Cloudflare Web Analytics beacon host. `cloudflareinsights.com` in `connect-src` allows the beacon to report data.
- `frame-ancestors 'none'` prevents the site from being embedded in iframes (equivalent to `X-Frame-Options: DENY`).
- No `'unsafe-eval'` anywhere. No external font sources. No external image sources.

### 4.5 Complete `_headers` File

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
```

### 4.6 Build and Deploy

| Requirement                     | Target                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| Build time                      | < 30 seconds for initial build, < 10 seconds incremental                |
| Deploy time                     | < 60 seconds (Cloudflare Pages)                                         |
| PR preview deployments          | Automatic for every PR via Cloudflare Pages                             |
| CI pipeline                     | Build + Lighthouse CI + deploy, triggered on push to `main` and all PRs |
| Lighthouse CI failure threshold | Fail the build if any Lighthouse category drops below 90                |

---

## 5. Technical Risks

| #    | Risk                                                                                       | Severity | Likelihood | Mitigation                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------ | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-1 | WordPress redirect coverage is incomplete, causing broken inbound links after DNS cutover  | Medium   | High       | Audit all indexed WordPress URLs (via `site:venturecrane.com` search and Cloudflare analytics from current site) before DNS cutover. Create comprehensive `_redirects` file. Implement a catch-all redirect from old URL patterns to the homepage as a fallback.                                      |
| TR-2 | Chosen Shiki theme fails WCAG AA contrast for one or more token types                      | Low      | Medium     | Verify every token type in the selected theme against the code block background color before committing to the theme. Budget 2-4 hours for theme customization if needed. Test with the `tokyo-night` and `github-dark` themes first, as these tend to have better contrast characteristics.          |
| TR-3 | Markdown-generated tables lack proper semantic HTML (`<th>`, `scope`)                      | Low      | Medium     | Test Astro's default markdown table rendering early in development. If semantics are insufficient, add `remark-gfm` configuration or a custom remark plugin. This is a 1-2 hour fix but should be caught before content is authored.                                                                  |
| TR-4 | Content authoring friction slows publishing velocity                                       | Medium   | Medium     | Ensure the content authoring workflow is tested end-to-end before launch: create a draft article, preview it locally, submit a PR, review the preview deployment, merge, verify production. Document this workflow in a `CONTRIBUTING.md`. Any friction in this loop directly reduces content output. |
| TR-5 | OG image dimensions or format cause poor rendering on specific platforms (X, LinkedIn, HN) | Low      | Low        | Test the default OG image on X Card Validator, LinkedIn Post Inspector, and Facebook Sharing Debugger before launch. Use 1200x630px PNG as the safe default.                                                                                                                                          |
| TR-6 | CSS-only mobile navigation fails on specific browser/OS combinations                       | Low      | Low        | Test the `<details>`-based or CSS checkbox toggle pattern on Safari iOS, Chrome Android, and Firefox. These patterns are well-established but edge cases exist. Budget 2 hours for mobile nav testing.                                                                                                |
| TR-7 | Build time exceeds 30 seconds as content volume grows                                      | Low      | Low        | Astro's incremental build support and Content Collections are designed for large content sets. At the expected content volume (< 100 articles in year one), this is not a concern. Monitor build times in CI.                                                                                         |

---

## 6. Implementation Specification

### 6.1 Dark Theme Implementation

The hybrid dark theme is a resolved design requirement (consensus across five reviewers).

**Tailwind configuration:**

```javascript
// tailwind.config.mjs (theme color excerpt)
export default {
  theme: {
    extend: {
      colors: {
        // Site chrome (header, footer, homepage, portfolio)
        chrome: {
          DEFAULT: '#1a1a2e',
          light: '#1e1e36',
        },
        // Article reading surface
        surface: {
          DEFAULT: '#242438',
          raised: '#2a2a42', // Code blocks, callouts
        },
        // Text
        text: {
          DEFAULT: '#e8e8f0',
          muted: '#a0a0b8',
          inverse: '#1a1a2e',
        },
        // Accent (placeholder — requires brand kit decision)
        accent: {
          DEFAULT: '#6366f1', // Placeholder, replace with brand color
          hover: '#818cf8',
        },
      },
    },
  },
}
```

**CSS custom properties in `global.css`:**

```css
:root {
  --color-chrome: #1a1a2e;
  --color-chrome-light: #1e1e36;
  --color-surface: #242438;
  --color-surface-raised: #2a2a42;
  --color-text: #e8e8f0;
  --color-text-muted: #a0a0b8;
  --color-accent: #6366f1;
  --color-accent-hover: #818cf8;
}
```

Both Tailwind theme values and CSS custom properties reference the same hex values. The CSS custom properties are the source of truth, enabling future theme switching (light mode) without rebuilding.

### 6.2 System Font Stack

```css
:root {
  --font-body:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
    'Helvetica Neue', sans-serif;
  --font-mono:
    ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
}
```

### 6.3 Type Scale

Adopted from the UX Lead's Round 1 recommendation, confirmed in Round 2.

| Element       | Size             | Line height | Weight |
| ------------- | ---------------- | ----------- | ------ |
| Body text     | 18px (1.125rem)  | 1.7         | 400    |
| H1            | 36px (2.25rem)   | 1.2         | 700    |
| H2            | 28px (1.75rem)   | 1.3         | 600    |
| H3            | 22px (1.375rem)  | 1.4         | 600    |
| Code (inline) | 15px (0.9375rem) | inherit     | 400    |
| Code (block)  | 15px (0.9375rem) | 1.6         | 400    |
| Small / meta  | 14px (0.875rem)  | 1.5         | 400    |

### 6.4 RSS Feed

A single RSS feed (`/rss.xml`) that includes both articles and build logs, sorted by date (newest first). Articles and logs are interleaved chronologically. The feed includes full content (not excerpts) per the PRD's specification and the Target Customer's expectation.

Implementation: Astro's `@astrojs/rss` package, configured to merge both collections and sort by date.

### 6.5 AI Disclosure Component

A standardized footer component displayed at the bottom of every article and build log.

```
---
Drafted with AI assistance. Reviewed and edited by [author name].
Learn more about how we build → [link to about page]
---
```

The component reads the `author` field from frontmatter. When the author is "Venture Crane" (default), the disclosure omits the name. When a specific author is credited, the name is displayed. This is a static component with no interactivity.

### 6.6 WordPress Redirect Audit Process

Pre-launch task, not automated:

1. Query `site:venturecrane.com` on Google to identify all indexed URLs.
2. Crawl the current WordPress site for all internal links and published page slugs.
3. Map each discovered URL to the corresponding new URL (or to homepage if no equivalent exists).
4. Encode all mappings in the `_redirects` file using Cloudflare Pages redirect syntax.
5. Verify redirects work on a preview deployment before DNS cutover.
6. After DNS cutover, monitor Cloudflare Web Analytics for 404 spikes and add missed redirects.

### 6.7 Mobile Navigation

Breakpoint: 640px (Tailwind `sm:`).

Above 640px: horizontal nav with all four items visible (Home, Portfolio, About, Articles).

Below 640px: CSS-only collapsed menu using `<details><summary>` element pattern. No JavaScript required. The `<summary>` element renders as a hamburger icon. The `<details>` open state displays the nav items vertically.

This pattern is supported in all modern browsers (Safari 12+, Chrome 70+, Firefox 49+, Edge 79+) and degrades gracefully (nav items are visible by default if CSS fails to load).

---

## 7. Phase 0 Deliverables Checklist

A concrete list of what the developer ships in Phase 0, derived from this document.

| #    | Deliverable                                                          | Acceptance Criterion                                                              |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D-01 | Repository `venturecrane/vc-web` created with Astro 5 + Tailwind CSS | `npm run build` succeeds with zero errors                                         |
| D-02 | Content Collection schemas (articles, logs, pages)                   | TypeScript compilation passes; invalid frontmatter causes build failure           |
| D-03 | Homepage (`/`)                                                       | Renders with portfolio preview, recent articles, recent logs                      |
| D-04 | Article listing (`/articles`) and individual article pages           | All non-draft articles render; frontmatter metadata displayed                     |
| D-05 | Build log listing (`/log`) and individual log pages                  | Reverse-chronological; lighter visual treatment than articles                     |
| D-06 | About page (`/about`)                                                | Renders `content/pages/about.md`; includes founder section; shows `updatedDate`   |
| D-07 | Portfolio page (`/portfolio`)                                        | Renders venture cards; live ventures link out; pre-launch ventures show status    |
| D-08 | Custom 404 page                                                      | Links to homepage and article index; matches site design                          |
| D-09 | RSS feed (`/rss.xml`)                                                | Valid RSS 2.0; includes full content from both articles and logs                  |
| D-10 | Navigation + responsive layout                                       | Desktop horizontal nav; mobile CSS-only collapsed nav at < 640px                  |
| D-11 | Dark hybrid theme                                                    | Chrome background #1a1a2e; article surface #242438; all text passes WCAG AA       |
| D-12 | Syntax highlighting (Shiki)                                          | Code blocks render with chosen dark theme; all tokens pass 4.5:1 contrast         |
| D-13 | AI disclosure component                                              | Appears at bottom of every article and log entry                                  |
| D-14 | OG metadata + default image                                          | Correct `og:title`, `og:description`, `og:image` on all pages                     |
| D-15 | `_headers` file with CSP and security headers                        | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| D-16 | `_redirects` file for WordPress URLs                                 | All known WordPress URLs redirect to corresponding new URLs or homepage           |
| D-17 | Cloudflare Web Analytics                                             | Enabled in CF Pages project settings; visible in CF dashboard                     |
| D-18 | PR preview deployments                                               | Every PR gets a unique preview URL via Cloudflare Pages                           |
| D-19 | GitHub Actions CI pipeline                                           | Build + Lighthouse CI on every push and PR; fails below score thresholds          |
| D-20 | Lighthouse scores >= 95 (all categories)                             | CI enforced on every PR                                                           |
| D-21 | 3 launch articles + at least 1 build log entry                       | Content authored, reviewed, and deployed                                          |

---

## 8. Open Decisions / ADRs

These decisions should be formally recorded before development begins. They are not blockers -- they have recommended resolutions -- but they require explicit sign-off.

| #      | Decision                                          | Recommendation                                                               | Impact if Deferred                                            |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| OD-001 | Repo location                                     | Separate repo: `venturecrane/vc-web`                                         | Blocks all development                                        |
| OD-002 | Brand kit (primary color, accent color, wordmark) | Minimal: pick two colors and a text wordmark in a 30-minute session          | Blocks Tailwind config, header component, OG image            |
| OD-003 | Shiki theme selection                             | `github-dark` or `tokyo-night` (verify WCAG AA contrast for all token types) | Blocks code block styling; affects article page development   |
| OD-004 | Accent color placeholder                          | Current placeholder `#6366f1` (indigo) — replace with brand accent           | Low impact; can be changed in config after brand kit decision |

---

## 9. Unresolved Issues

### 9.1 Email Capture Timing: Phase 1 vs. Trigger-Gated

**The disagreement:** The Product Manager explicitly rejected email capture at launch and endorsed the Business Analyst's trigger-based threshold (1,000 monthly visitors for two consecutive months). The Competitor Analyst deprioritized it in Round 2. In my Round 2 review, I positioned email capture as a Phase 1 deliverable -- meaning it would be built shortly after launch regardless of traffic. The trigger-based approach means it might not be built for months if traffic grows slowly.

**Why it matters:** If the trigger is set too high (1,000 monthly visitors), email capture might never be implemented, and early visitors who would have subscribed are lost. If built too early, it adds a Worker endpoint and D1 table to maintain before there is meaningful traffic to justify it.

**My position:** I favor a lower trigger threshold (500 monthly visitors for one month, rather than 1,000 for two consecutive months) or a time-based fallback (build it 3 months post-launch regardless of traffic). The technical cost is 2-4 hours. The cost of not having it is invisible -- you never see the subscribers you did not capture.

**Needs:** Founder decision on the trigger threshold. This is a product judgment call, not a technical one.

### 9.2 Per-Article OG Images: Phase 2 vs. Phase 0

**The disagreement:** The Competitor Analyst argued in Round 2 (R-02) for per-article OG images at launch, calling it a competitive advantage over individual practitioner blogs. The UX Lead and I recommend deferring to Phase 2 with a static site-wide OG image at launch.

**Why it matters:** OG images significantly affect click-through rates from X and HN -- the two primary distribution channels. A generic OG image on every shared link reduces visual differentiation in social feeds. However, per-article OG image generation adds build complexity (Satori or `astro-og-canvas` integration, font rendering, layout testing across platforms).

**My position:** Static site-wide OG image at Phase 0. The build complexity of per-article generation is disproportionate to the 1-2 week timeline. The `ogImage` frontmatter field is in the schema now, so adding generation later requires no content migration. The priority is shipping launch articles, not optimizing social sharing thumbnails.

**Needs:** Confirmation that the site-wide OG image approach is acceptable for launch. If the founder strongly values per-article OG images, budget an additional 4-6 hours and include it in Phase 0.

### 9.3 Methodology Page Scope at Launch

**The disagreement:** The Product Manager elevated the methodology page to a launch priority (reversing their Round 1 deferral). The Target Customer recommends launching lean (500 words) and growing through articles. The Competitor Analyst identifies the methodology as the primary differentiator. These positions are compatible in direction but differ in scope: should the about page at launch be a brief overview (500 words) or a substantive methodology document (2000+ words)?

**Why it matters:** A 500-word about page is quick to author but may not deliver on the "methodology" promise. A 2000+ word methodology page is a significant content investment that competes with article authoring time during the launch sprint.

**My position:** 500-word about page at launch, with explicit links to planned methodology articles. The content model (`content/pages/about.md`) supports unlimited expansion post-launch. The about page should promise depth ("We are publishing our full methodology as a series of articles") rather than attempt to deliver it all at once. This aligns with the Target Customer's recommendation and reduces the content bottleneck during the launch sprint.

**Needs:** Founder decision on the about page word count and scope. This directly affects the launch timeline.

---

_End of Technical Lead Contribution — Round 3 (Final)_
