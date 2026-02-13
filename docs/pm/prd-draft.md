# Venture Crane Website — Product Requirements Document

**Tagline:** The product factory that shows its work.
**Version:** 0.1 (Initial Draft)
**Date:** 2026-02-13
**Status:** Phase 0 — PRD Development

---

## 1. Executive Summary

Venture Crane is a product development factory that builds, validates, and operates a portfolio of software products using AI-driven development. The current venturecrane.com is a WordPress site on Hostinger that reflects an outdated identity — a validation-as-a-service pitch that has since moved to Silicon Crane. The site needs to be rebuilt from the ground up to reflect Venture Crane's actual role: the operating system behind a portfolio of products, powered by AI agents.

The new venturecrane.com is a content-driven marketing site that tells the story of how we build. It serves as the public face of the enterprise, the home for build-in-public content, and the hub that connects the portfolio brands. It is built on the same Cloudflare-native stack used across all ventures (Astro 5, Cloudflare Pages, Tailwind CSS), following the pattern established by Silicon Crane's sc-console.

**What this is:** A content site that establishes Venture Crane's identity as a product factory, publishes technical and strategic content, and links to the portfolio.

**What this is NOT:** A SaaS product, a lead generation funnel, a dashboard, or an application with user accounts. There are no dynamic experiments, no payment flows, no user data to manage.

**Kill criteria:** If the site cannot be built, deployed, and populated with initial content within a single focused sprint (1-2 weeks), the scope is too large and must be cut.

---

## 2. Product Vision & Identity

Venture Crane sits at the head of the SMDurgan, LLC enterprise, below the legal entity and above all ventures. Its role is product factory and governance:

```
SMDurgan, LLC (legal entity)
└── Venture Crane (product factory + governance)
    ├── Silicon Crane (validation lab — determines what to build)
    ├── Durgan Field Guide (product — launched)
    ├── Kid Expenses (product — active)
    └── Draft Crane (product — in development)
```

The website must communicate this structure and role clearly. The target audience is technical — engineers, founders, and operators at AI-forward companies who are interested in how a small team runs a multi-product portfolio with AI agents doing the development work.

**Brand voice:** Direct, technical, evidence-based. Show the work. No marketing fluff. The content itself is the marketing.

**Build-in-public philosophy:** We publish what we learn — the systems, the decisions, the failures, the methodology. Not to sell consulting, but because transparency compounds: it attracts the right people, builds credibility, and forces intellectual honesty.

---

## 3. Target Users & Personas

### Persona 1: The Technical Builder ("Alex")

Alex is a senior engineer or engineering leader at a tech company. They're interested in how other teams are using AI agents for real software development — not toy demos, but production systems. They found Venture Crane through a technical article shared on Hacker News, X, or a dev community.

**What Alex wants:** Deep technical content about AI-assisted development workflows, tooling decisions, and honest assessments of what works and what doesn't.

**What Alex does on the site:** Reads articles, explores the methodology, maybe follows the build-in-public feed. Does not sign up for anything.

### Persona 2: The Indie Founder ("Jordan")

Jordan is building their own product(s) as a solo founder or tiny team. They're trying to figure out how to leverage AI agents beyond "write me a function." They want to see how someone else has structured multi-product operations with AI doing the heavy lifting.

**What Jordan wants:** The operational playbook — how sessions work, how handoffs happen, how quality is maintained, how the portfolio is organized.

**What Jordan does on the site:** Reads the methodology content, looks at the portfolio to see what was built this way, possibly reaches out via contact.

### Persona 3: The Curious Observer ("Sam")

Sam is loosely interested in AI-driven development. They might be a PM, a designer, a VC, or a journalist. They arrived via a social media link or a referral.

**What Sam wants:** A quick understanding of what Venture Crane is and why it's interesting. A compelling overview, not a deep dive.

**What Sam does on the site:** Reads the homepage, skims the portfolio, maybe reads one article. Leaves within 5 minutes.

---

## 4. Core Problem

Venture Crane has built a genuinely novel approach to product development — a fleet of AI agents operating across machines, coordinated by a centralized context management system, building and maintaining a portfolio of real products. But none of this is visible to the outside world. The current website tells the wrong story (VaaS sprints), on the wrong platform (WordPress on Hostinger), with no content behind the resource links.

There is a growing audience of technical builders who want to understand how AI-assisted development works at the operational level — not "I asked ChatGPT to write a function" but "here's how we manage session continuity across a fleet of machines running parallel AI agents." This audience has nowhere to find Venture Crane today.

---

## 5. Product Principles

1. **Content is the product.** The site exists to publish and present content. Every design and engineering decision should optimize for reading experience and content management.

2. **Eat our own cooking.** Build on the same stack we use for everything else (Astro, Cloudflare, Tailwind). Deploy the same way. Use the same tooling. The site itself demonstrates the approach.

3. **Ship thin, grow content.** Launch with the minimum viable site structure and 2-3 pieces of strong content. The site grows through content, not features.

4. **No premature interactivity.** No newsletter signup, no account system, no comments, no analytics dashboards. Add these only when there's evidence of an audience that wants them.

5. **Sustainable by agents.** Content publishing, site updates, and maintenance should be manageable by AI agents with human oversight. No CMS admin panels or WordPress dashboards required.

---

## 6. Competitive Positioning

This is not a competitive market in the traditional sense. The "build in public" space is crowded with indie hackers sharing revenue screenshots and founders posting engagement bait. What's rare is deep technical content about AI-assisted development operations from a team that's actually doing it in production.

**Closest comparisons:**

| Comparable                                             | What They Do                               | How VC Differs                                                          |
| ------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| Indie hacker blogs (e.g., levels.io)                   | Revenue transparency, solo founder journey | VC is about the system, not the individual. Multi-product, multi-agent. |
| AI company engineering blogs (e.g., Anthropic, OpenAI) | Model capabilities, research               | VC is about using the models operationally, not building them.          |
| Dev tool company blogs (e.g., Vercel, Cloudflare)      | Platform capabilities, tutorials           | VC is about the workflow and methodology, not selling a platform.       |
| Startup studios (e.g., Idealab, Pioneer Square Labs)   | Portfolio company announcements            | VC shows the factory floor, not just the output.                        |

**Unique position:** Practitioner-level content about running a multi-product AI-driven development operation. Not selling tools, not selling services — just showing the work.

---

## 7. MVP User Journey

### Journey 1: Technical Reader (Alex)

1. Discovers article link on X / HN / dev community
2. Lands on article page — clean reading experience, no popups or gates
3. Reads the full article
4. Notices the site header — clicks to homepage
5. Sees the portfolio, the methodology overview, maybe reads another article
6. Leaves. Returns when the next article is published (via direct URL, RSS, or social).

### Journey 2: Curious Observer (Sam)

1. Lands on homepage via referral or search
2. Reads the hero — understands "product factory + AI agents" in 10 seconds
3. Scans the portfolio — sees real products, not vaporware
4. Maybe clicks into one article or the methodology page
5. Leaves with a clear mental model of what Venture Crane is

### Journey 3: Indie Founder (Jordan)

1. Arrives via article or methodology page
2. Reads deeply — methodology, maybe multiple articles
3. Explores portfolio to see what was built
4. Clicks through to a product site (DFG, SC) to see the output
5. Bookmarks or shares the site

---

## 8. MVP Feature Specifications

### F-001: Homepage

**User stories:** US-001 (Sam understands VC in 10 seconds), US-002 (all personas can navigate to content)

**Requirements:**

- Hero section: one-sentence identity statement + one-paragraph elaboration
- Portfolio section: cards for each active venture (DFG, KE, DC, SC) with name, one-liner, status badge (launched / active / in development / lab), and link
- Recent content section: latest 3-5 articles with title, date, and excerpt
- Footer: links to all ventures, contact info, social links

**What it must NOT have:** Pricing, signup forms, testimonials, stock photos.

### F-002: Article Pages

**User stories:** US-003 (Alex reads a full technical article with good formatting)

**Requirements:**

- Markdown-authored content rendered as HTML
- Support for: headings (h1-h4), code blocks (with syntax highlighting), tables, blockquotes, diagrams (ASCII art in code blocks), inline code, bold/italic, lists, horizontal rules
- Article metadata: title, date, author (optional), tags/categories, estimated reading time
- Clean typography optimized for long-form reading (max-width ~70ch, generous line-height)
- Previous/next article navigation at bottom

**Content source:** Markdown files in the repo (`src/content/articles/`), using Astro's content collections.

### F-003: Portfolio Page

**User stories:** US-004 (all personas can see what VC has built)

**Requirements:**

- One card per venture with: name, description (2-3 sentences), status, tech stack tags, link to product site
- Organized by status: Launched > Active > In Development > Lab
- Each card links to the external product site (not an internal detail page)

### F-004: Methodology / About Page

**User stories:** US-005 (Jordan understands the VC approach)

**Requirements:**

- The Venture Crane story: what it is, how it works, why it exists
- The organizational structure: VC → SC → Products
- The development approach: AI-agent-driven, MCP-based context management, session lifecycle, fleet operations
- This is narrative content, not a feature list — written as prose, possibly with diagrams
- Can be a single long page or split into sub-pages as content grows

### F-005: Navigation & Layout

**Requirements:**

- Persistent header: logo/wordmark + nav links (Home, Portfolio, Methodology, Articles)
- Footer: venture links, social links, legal (privacy/terms)
- Responsive: mobile-first, works on phone through desktop
- No hamburger menu required at MVP if nav items fit on one line
- Dark color scheme preferred (consistent with technical/builder aesthetic)

### F-006: RSS Feed

**User stories:** US-006 (Alex subscribes to new content)

**Requirements:**

- Standard RSS/Atom feed at `/feed.xml` or `/rss.xml`
- Includes all articles with full content (not excerpts)
- Astro has built-in RSS support (`@astrojs/rss`)

---

## 9. Information Architecture

```
venturecrane.com/
├── /                        → Homepage (hero + portfolio + recent articles)
├── /portfolio               → Full portfolio with all ventures
├── /methodology             → How we build (narrative)
├── /articles                → Article index (all posts, newest first)
├── /articles/:slug          → Individual article
├── /feed.xml                → RSS feed
├── /privacy                 → Privacy policy
└── /terms                   → Terms of use
```

Flat and simple. No nested routes, no categories, no pagination (until article count warrants it).

---

## 10. Architecture & Technical Design

### Stack

| Layer     | Technology                   | Rationale                                               |
| --------- | ---------------------------- | ------------------------------------------------------- |
| Framework | Astro 5                      | Content-first, proven in SC, static by default          |
| Hosting   | Cloudflare Pages             | Same platform as all ventures, free tier sufficient     |
| Styling   | Tailwind CSS                 | Consistent with SC and org standard                     |
| Content   | Astro Content Collections    | Markdown files in repo, type-safe, no external CMS      |
| Build     | Static Site Generation (SSG) | No server-side rendering needed — all content is static |
| CI/CD     | GitHub Actions               | Same verify pipeline as other ventures                  |
| DNS       | Cloudflare                   | Already managing DNS for other ventures                 |

### Monorepo Structure

```
vc-web/                          (or embedded in crane-console)
├── src/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── portfolio.astro
│   │   ├── methodology.astro
│   │   ├── articles/
│   │   │   ├── index.astro      (article listing)
│   │   │   └── [...slug].astro  (individual article)
│   │   ├── privacy.astro
│   │   └── terms.astro
│   ├── layouts/
│   │   ├── Base.astro           (HTML shell, meta, fonts)
│   │   └── Article.astro        (article layout with metadata)
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── VentureCard.astro
│   │   └── ArticleCard.astro
│   ├── content/
│   │   └── articles/
│   │       └── agent-context-management-system.md
│   └── styles/
│       └── global.css           (Tailwind base + custom typography)
├── public/
│   ├── favicon.svg
│   └── og-image.png
├── astro.config.mjs
├── tailwind.config.mjs
├── package.json
└── tsconfig.json
```

### Key Decision: Repo Location

**Option A:** New repo `venturecrane/vc-web` — clean separation, follows SC pattern.
**Option B:** Directory in `crane-console` (e.g., `apps/vc-web/`) — simpler, content lives next to the tooling.

Recommendation: **Option A**. VC-web is a deployable artifact with its own domain, CI, and release cycle. It should follow the same pattern as sc-console (separate repo, own GitHub Actions, own Cloudflare Pages project).

### No API Required at MVP

Unlike SC (which needs dynamic experiments, lead capture, and Stripe), the VC site is purely static. No Workers, no D1, no R2. Content is authored as markdown, committed to git, built by Astro, and deployed to Cloudflare Pages. This dramatically reduces complexity.

If dynamic features are needed later (newsletter signup, contact form, view counters), a Worker can be added incrementally without redesigning the site.

---

## 11. Proposed Data Model

No database at MVP. All content is file-based:

**Article frontmatter schema:**

```yaml
---
title: string (required)
date: ISO date string (required)
description: string (required, used for meta + excerpts)
author: string (optional, defaults to "Venture Crane")
tags: string[] (optional)
draft: boolean (optional, defaults to false)
---
```

**Portfolio data:** Static TypeScript array or JSON file defining ventures:

```typescript
interface Venture {
  name: string
  code: string
  description: string
  status: 'launched' | 'active' | 'in-development' | 'lab'
  url: string
  stack: string[]
}
```

---

## 12. API Surface

None at MVP. The site is fully static.

If a contact form is added post-MVP, it would be a single Worker endpoint:

```
POST /api/contact
  Body: { name, email, message }
  Response: 200 OK | 400 Bad Request
  Implementation: Resend email to founder
```

---

## 13. Non-Functional Requirements

### Performance

- Lighthouse score >= 95 on all pages
- Time to first meaningful paint < 1 second on 3G
- No JavaScript required for content reading (Astro ships zero JS by default)

### SEO

- Semantic HTML with proper heading hierarchy
- Open Graph and Twitter Card meta tags on all pages
- Canonical URLs
- Sitemap.xml (Astro built-in)
- robots.txt

### Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigable
- Sufficient color contrast (especially with dark theme)
- Alt text on all images
- Skip-to-content link

### Security

- No user data collected at MVP (no cookies, no tracking, no forms)
- HTTPS everywhere (Cloudflare default)
- Content Security Policy headers via Cloudflare Pages `_headers` file

---

## 14. Platform-Specific Design Constraints

### Typography

- Long-form technical content demands excellent typography
- Max content width: ~70ch (680-720px)
- Line height: 1.6-1.75 for body text
- Code blocks: monospace font, syntax highlighting, horizontal scroll for long lines
- Tables: must be readable and not overflow on mobile

### Color Scheme

- Dark theme preferred (consistent with builder/technical aesthetic)
- Must support both light and dark or commit to one
- Recommendation: dark by default, light mode as a future enhancement
- Accent color should differentiate VC from SC and DFG brands

### Mobile

- Fully responsive, mobile-first
- Articles must be comfortable to read on phone screens
- Navigation must work without JavaScript

---

## 15. Success Metrics & Kill Criteria

### Success Metrics (Phase 0)

- Site is live on venturecrane.com within 1-2 weeks of development start
- At least 3 pieces of content published at launch
- Lighthouse performance score >= 95
- Site works correctly on mobile, tablet, and desktop
- Build time < 30 seconds
- Zero runtime errors (it's a static site)

### Kill Criteria

- If the site cannot ship within 2 weeks, scope must be cut immediately
- If the content takes longer to write than the site takes to build, that's expected and fine — the site should be simple enough that content is the bottleneck, not engineering

---

## 16. Risks & Mitigations

| Risk                                                                      | Impact                                        | Likelihood | Mitigation                                                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Scope creep** — adding features beyond static content                   | Delays launch, violates "ship thin" principle | High       | PRD explicitly excludes dynamic features. No database, no auth, no forms at MVP.                                            |
| **Content bottleneck** — site is ready but no content to publish          | Site launches empty, poor first impression    | Medium     | The agent context management system doc is already written. Methodology content can be derived from existing internal docs. |
| **WordPress migration confusion** — old site still live during transition | Brand confusion, SEO conflicts                | Low        | Simple cutover: update DNS to point to Cloudflare Pages. Old Hostinger site can be archived. No gradual migration needed.   |
| **Design paralysis** — spending too long on visual design                 | Delays launch                                 | Medium     | Start with SC's established patterns (Tailwind, dark theme). Refine after launch based on actual content.                   |
| **Dark theme readability** — poor contrast on code blocks, tables         | Bad reading experience                        | Medium     | Test all content types (prose, code, tables, diagrams) against the theme during development.                                |

---

## 17. Open Decisions / ADRs

### OD-001: Repo Location

**Question:** Does the VC website live in a new `venturecrane/vc-web` repo or in `crane-console/apps/vc-web/`?

**Arguments for separate repo:** Follows SC pattern, clean deployment, independent release cycle.
**Arguments for monorepo:** Content lives next to the tooling it describes, simpler project management.

**Recommendation:** Separate repo. Decision needed before development starts.

### OD-002: Domain and DNS Migration

**Question:** When and how to cut over venturecrane.com from Hostinger to Cloudflare?

**Options:**

- A: Build and deploy to a staging URL first, cut DNS when ready
- B: Point DNS to Cloudflare immediately, deploy incrementally

**Recommendation:** Option A. Build on a `.pages.dev` subdomain, verify everything works, then update DNS in a single cutover.

### OD-003: Analytics

**Question:** Should the site have any analytics at launch?

**Arguments for:** Understanding traffic sources for the first articles is valuable.
**Arguments against:** Principle #4 says no premature interactivity. Analytics add complexity (privacy policy, cookie consent).

**Recommendation:** Cloudflare Web Analytics only (privacy-friendly, no cookies, automatic with Pages). No GA4, no tracking scripts.

### OD-004: Content Ownership

**Question:** Who authors the build-in-public content — the human or the AI agents?

**Answer:** Both. The human provides direction and final review. The agents draft, research, and synthesize. The published content is attributed to "Venture Crane" (not to a specific agent or person).

---

## 18. Phased Development Plan

### Phase 0: Foundation (Week 1)

- Initialize Astro 5 project with Cloudflare Pages adapter
- Set up Tailwind CSS with dark theme
- Create base layout (header, footer, meta tags)
- Create homepage with placeholder content
- Create article layout with markdown rendering + syntax highlighting
- Deploy to `.pages.dev` staging URL
- Port the agent context management system doc as first article
- CI/CD: GitHub Actions verify pipeline (lint, format, typecheck, build)

### Phase 1: Content & Launch (Week 2)

- Write/port methodology page content
- Populate portfolio data (DFG, KE, DC, SC)
- Write 1-2 additional articles from existing internal docs
- RSS feed
- SEO: sitemap, robots.txt, OG tags
- Mobile testing and polish
- DNS cutover: venturecrane.com → Cloudflare Pages
- Archive WordPress site on Hostinger
- Cancel Hostinger hosting (if no other sites depend on it)

### Phase 2: Growth (Post-Launch)

- Additional articles on a regular cadence
- Light theme option
- Newsletter signup (if audience warrants it — single Worker endpoint + Resend)
- Contact page with form
- Social sharing metadata improvements
- Search (if article count grows significantly)

---

## 19. Glossary

| Term                    | Definition                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Venture**             | A product or business unit within the Venture Crane portfolio                                        |
| **Sprint**              | A time-boxed validation effort run by Silicon Crane                                                  |
| **Build in public**     | Publishing the process, decisions, and learnings of building products — not just the finished output |
| **Agent**               | An AI coding assistant (Claude Code, Gemini CLI, Codex) running a development session                |
| **Session**             | A single agent working session, tracked by the context management system                             |
| **SOD/EOD**             | Start of Day / End of Day — session lifecycle events that load and persist context                   |
| **MCP**                 | Model Context Protocol — the standard for extending AI coding tools with custom integrations         |
| **Content Collections** | Astro's built-in system for managing typed, file-based content (markdown/MDX)                        |

---

## Appendix: Unresolved Issues

### UI-001: Dark Theme Commitment

The PRD recommends dark theme by default. This needs validation: does dark theme work well for long-form reading? Many technical blogs (Stripe, Linear) use light themes for articles even if the product UI is dark. Consider a hybrid: dark chrome with light article body.

### UI-002: Brand Identity

No visual identity (logo, color palette, typography choices) exists for the new Venture Crane. The current WordPress site uses a crane illustration and blue/gold colors. Should the new site carry any of this forward, or start fresh?

### CONTENT-001: Article Authorship and Voice

When articles are substantially written by AI agents (as the context management doc was), how is this disclosed? Options: no disclosure, subtle note, explicit "drafted by AI, reviewed by human" attribution.

### CONTENT-002: Anonymization Standard

The agent context management doc anonymizes venture names but names external tools. Is this the standard for all build-in-public content? Some articles may benefit from naming the actual products (DFG, SC) to tell a more concrete story.

### INFRA-001: Hostinger Dependency Check

Before canceling Hostinger, verify no other sites or services depend on it (email, DNS records, other domains). Silicon Crane was also on Hostinger — confirm SC migration status.
