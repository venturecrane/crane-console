# Business Analyst Contribution -- PRD Review Round 3 (Final)

**Author:** Business Analyst
**Date:** 2026-02-13
**Scope:** MVP / Phase 0 only
**Status:** Final after 3 rounds

---

## Changes from Round 2

1. **Converted all recommendations into formal user stories (US-001 through US-010) with acceptance criteria in Given/When/Then format.** Round 2 identified gaps and proposed solutions; Round 3 delivers the testable specifications the development team needs.
2. **Added a complete traceability matrix** mapping every user story to PRD features, personas, success metrics, and business rules.
3. **Codified business rules (BR-001 through BR-014)** that were implicit in Round 2 recommendations -- content quality standard, publishing cadence commitment, distribution ownership, analytics requirements, and trigger-based feature gating.
4. **Added edge cases section** covering 404 behavior, empty states, malformed content, build log boundary conditions, and portfolio ventures without public URLs.
5. **Standardized terminology to match panel consensus:** "build logs" (not "dev notes" or "updates"), "hybrid dark theme" (not "dark mode"), "founder identity" (not "about section"), "email capture" (deferred, with trigger defined).
6. **Adopted the Competitor Analyst's revised content cadence** of 1 article per month plus build logs, down from my Round 2 recommendation of 2 articles per month. The Target Customer and Competitor Analyst both argued this is more sustainable; I agree the cadence must be kept rather than set ambitiously and abandoned.
7. **Removed SEO ranking targets** from growth metrics. The Product Manager correctly noted that formal audience sizing is disproportionate for a near-zero-cost project. Organic search traction will emerge from content quality and distribution, not from PRD-level keyword targets.
8. **Elevated accessibility from an implementation detail to a testable acceptance criterion** within US-007 (Navigation & Layout), following the Technical Lead's and UX Lead's consensus that building it correctly in Phase 0 is cheaper than retrofitting.
9. **Incorporated the Technical Lead's revised article frontmatter schema** (adding `updatedDate` and `repo` fields) into the article content model business rules.
10. **Resolved email capture timing:** adopted the Business Analyst/Competitor Analyst compromise position. Email capture is out of MVP scope but the trigger threshold (1,000 monthly visitors for two consecutive months) is codified as BR-013 so the decision is data-driven, not deferred indefinitely.

---

## MVP User Stories

### US-001: Homepage Identity Comprehension

**Title:** Visitor understands Venture Crane's identity within 10 seconds
**Persona:** Sam (Curious Observer)
**Narrative:** As a curious observer landing on the homepage for the first time, I want to understand what Venture Crane is and why it exists so that I can decide whether to explore further or leave.

**Acceptance Criteria:**

- AC-001-1: Given a first-time visitor loads the homepage, when the page renders, then a single-sentence identity statement is visible above the fold without scrolling on a 375px-wide viewport.
- AC-001-2: Given a first-time visitor reads the hero section, when they reach the end of the hero content, then the elaboration paragraph is no longer than 50 words.
- AC-001-3: Given a first-time visitor scans below the hero, when the portfolio section renders, then at least one venture card is visible with name, one-line description, and status badge.
- AC-001-4: Given a first-time visitor views the homepage, when any stock photos, testimonial quotes, pricing tables, or signup forms are searched for, then none exist on the page.

**Business Rules:** BR-001, BR-002, BR-010
**Out of Scope:** A/B testing of hero copy. Animated hero elements. Video embeds.

---

### US-002: Article Reading Experience

**Title:** Technical reader consumes a long-form article without friction
**Persona:** Alex (Technical Builder)
**Narrative:** As a technical builder who arrived via a shared link, I want to read a full technical article with properly formatted code, tables, and prose so that I can evaluate whether the content is worth my time and attention.

**Acceptance Criteria:**

- AC-002-1: Given a visitor loads an article page, when the page renders, then the article title, publication date, estimated reading time, and author attribution are visible before the article body.
- AC-002-2: Given an article contains a fenced code block, when the page renders, then syntax highlighting is applied using Shiki with a named dark theme, and every syntax token meets WCAG AA contrast ratio (4.5:1) against the code block background.
- AC-002-3: Given an article body is rendered, when measured on a viewport width of 1280px or greater, then the prose content width does not exceed 680px.
- AC-002-4: Given an article contains a markdown table, when rendered, then the table uses semantic HTML (`<table>`, `<th>`, `<td>`) and does not overflow its container on a 375px-wide viewport (horizontal scroll is applied to the table element, not the page).
- AC-002-5: Given a visitor reaches the end of an article, when the article footer renders, then links to the previous and next articles (by publication date) are present.
- AC-002-6: Given an article includes an AI disclosure, when the article footer renders, then a standardized disclosure statement is visible (per BR-006).
- AC-002-7: Given an article has an `updatedDate` in its frontmatter, when the page renders, then both the original publication date and the updated date are displayed.

**Business Rules:** BR-003, BR-004, BR-005, BR-006, BR-009
**Out of Scope:** Comments. Social share buttons. Reading progress indicator. Related articles sidebar.

---

### US-003: Article Discovery via Index

**Title:** Visitor browses all published articles in reverse chronological order
**Persona:** Alex (Technical Builder), Jordan (Indie Founder)
**Narrative:** As a returning visitor, I want to browse all published articles sorted by date so that I can find content I have not yet read.

**Acceptance Criteria:**

- AC-003-1: Given a visitor navigates to `/articles`, when the page renders, then all published (non-draft) articles are listed in reverse chronological order.
- AC-003-2: Given the article index renders, when each article entry is displayed, then it shows the article title, publication date, description (from frontmatter), and estimated reading time.
- AC-003-3: Given the article index contains build log entries and articles, when the page renders, then both content types are listed in the same reverse-chronological feed with a visual indicator distinguishing build logs from articles.
- AC-003-4: Given fewer than 20 total content items exist, when the article index renders, then no pagination is displayed.

**Business Rules:** BR-003, BR-005
**Out of Scope:** Tag-based filtering. Search. Pagination (until content count exceeds 20 items).

---

### US-004: Build Log Consumption

**Title:** Visitor reads a short build log entry documenting recent operational activity
**Persona:** Alex (Technical Builder), Jordan (Indie Founder)
**Narrative:** As a technical reader interested in the day-to-day reality of AI-driven development, I want to read short, dated entries about what was built, what broke, and what was learned so that I can stay current on operational details between long-form articles.

**Acceptance Criteria:**

- AC-004-1: Given a build log entry exists in `src/content/logs/`, when the entry page renders, then the title, date, and tags are displayed.
- AC-004-2: Given a build log entry is rendered, when compared to a full article, then no estimated reading time, no description excerpt, and no previous/next navigation are displayed.
- AC-004-3: Given build log entries exist, when `/log` is loaded, then all published build log entries are listed in reverse chronological order.
- AC-004-4: Given a build log entry is published, when the RSS feed is regenerated at build time, then the build log entry appears in the feed alongside articles.

**Business Rules:** BR-003, BR-005, BR-007
**Out of Scope:** Separate RSS feed for build logs only. Filtering build logs by tag. Build log comments.

---

### US-005: Portfolio Exploration

**Title:** Visitor sees what Venture Crane has built and can navigate to live products
**Persona:** Sam (Curious Observer), Jordan (Indie Founder)
**Narrative:** As a visitor evaluating Venture Crane's credibility, I want to see the portfolio of products with their status and links so that I can verify these are real products, not vaporware.

**Acceptance Criteria:**

- AC-005-1: Given a visitor loads the portfolio page, when the page renders, then one card is displayed per venture with: name, description (2-3 sentences), status badge, and technology stack tags.
- AC-005-2: Given a venture has status "launched" or "active", when the card renders, then a link to the external product site is present and opens in a new tab with a visual external-link indicator.
- AC-005-3: Given a venture has status "in-development" or "lab", when the card renders, then no external link is displayed and the status badge reads "In Development" or "Lab" respectively.
- AC-005-4: Given the portfolio page renders, when cards are ordered, then they appear in status order: Launched > Active > In Development > Lab.
- AC-005-5: Given a venture's external link returns an HTTP error (checked manually before launch), when this is detected, then the link is removed and the card falls back to the pre-launch treatment (AC-005-3).

**Business Rules:** BR-002, BR-010
**Out of Scope:** Internal detail pages per venture. Revenue or traffic data on cards. Venture filtering.

---

### US-006: Methodology Comprehension

**Title:** Indie founder understands the Venture Crane development approach
**Persona:** Jordan (Indie Founder)
**Narrative:** As an indie founder exploring AI-driven development, I want to understand how Venture Crane organizes its operations, manages AI agents, and makes product decisions so that I can evaluate whether aspects of this approach apply to my own work.

**Acceptance Criteria:**

- AC-006-1: Given a visitor loads the methodology page, when the page renders, then the organizational structure (VC position relative to ventures) is explained in prose or diagram form.
- AC-006-2: Given the methodology page renders, when the content is measured, then it does not exceed 800 words at launch (per BR-008).
- AC-006-3: Given the methodology page renders, when the founder identity section is present, then it includes the founder's name, a 1-2 sentence background, and links to at least two external profiles (X, GitHub).
- AC-006-4: Given the methodology page renders, when an "updated" date is displayed, then it reflects the last modification date of the underlying content file.
- AC-006-5: Given methodology articles are published after launch, when links to those articles exist, then they are added to the methodology page as inline references.

**Business Rules:** BR-008, BR-011
**Out of Scope:** Multi-page methodology section. Downloadable frameworks. Interactive diagrams. Full team bio page.

---

### US-007: Navigation and Layout

**Title:** Visitor navigates between all sections of the site without friction on any device
**Persona:** All personas (Alex, Jordan, Sam)
**Narrative:** As any visitor on any device, I want persistent navigation that works without JavaScript and adapts to my screen size so that I can move between sections without confusion.

**Acceptance Criteria:**

- AC-007-1: Given a visitor is on any page, when the header renders, then it displays the site wordmark and navigation links to Home, Portfolio, Methodology, and Articles.
- AC-007-2: Given a visitor is on a viewport wider than 640px, when the header renders, then all navigation links are visible inline without a menu toggle.
- AC-007-3: Given a visitor is on a viewport of 640px or narrower, when the header renders, then navigation is collapsed into a menu toggle that functions without JavaScript (using `<details>` or CSS-only mechanism).
- AC-007-4: Given any page renders, when the footer is displayed, then it contains links to all venture sites, social profile links, and links to recent articles (2-3 most recent).
- AC-007-5: Given the site uses a hybrid dark theme, when any page renders, then site chrome (header, footer, non-article pages) uses a dark background and article reading surfaces use a slightly lighter background, with all text meeting WCAG AA contrast (4.5:1 for normal text, 3:1 for large text).
- AC-007-6: Given any interactive element (link, button, menu toggle) receives keyboard focus, when the focus state renders, then a visible focus indicator is displayed that is distinct from the dark background.
- AC-007-7: Given any interactive element is rendered, when its dimensions are measured, then the touch target is at minimum 44x44px.
- AC-007-8: Given any page renders, when the HTML `<html>` element is inspected, then it includes `lang="en"`.
- AC-007-9: Given a visitor activates a skip-to-content link, when the link is followed, then focus moves to the main content area, bypassing the header navigation.

**Business Rules:** BR-010, BR-012
**Out of Scope:** Light theme toggle. Breadcrumbs. Search bar in header. Sticky header on scroll.

---

### US-008: RSS Subscription

**Title:** Technical reader subscribes to site content via RSS
**Persona:** Alex (Technical Builder)
**Narrative:** As a technical reader who uses RSS to track publications, I want a standard RSS feed containing full article content so that I can read new posts in my feed reader without visiting the site.

**Acceptance Criteria:**

- AC-008-1: Given the site is built, when `/feed.xml` is requested, then a valid RSS 2.0 or Atom feed is returned.
- AC-008-2: Given the RSS feed is generated, when its entries are inspected, then each entry contains the full article content (not an excerpt).
- AC-008-3: Given both articles and build logs are published, when the feed is generated, then both content types are included in reverse chronological order.
- AC-008-4: Given a new article or build log is committed and the site is rebuilt, when the feed is regenerated, then the new item appears as the most recent entry.

**Business Rules:** BR-003, BR-005
**Out of Scope:** Separate feeds per content type. Feed discovery via `<link>` autodiscovery tag is recommended but not a gating criterion.

---

### US-009: 404 Error Recovery

**Title:** Visitor who reaches a broken URL is guided to valid content
**Persona:** All personas (Alex, Jordan, Sam)
**Narrative:** As a visitor who followed a broken or outdated link (common from HN, X, or old WordPress URLs), I want a helpful error page so that I can find the content I was looking for or discover other content.

**Acceptance Criteria:**

- AC-009-1: Given a visitor requests a URL that does not match any route, when the server responds, then a custom 404 page is rendered (not the browser or Cloudflare default).
- AC-009-2: Given the 404 page renders, when its content is displayed, then it includes a link to the homepage and a link to the article index.
- AC-009-3: Given WordPress URLs from the old site are known, when a `_redirects` file is deployed, then at minimum the old homepage URL and any high-traffic WordPress post URLs redirect to their nearest equivalents on the new site.

**Business Rules:** BR-010
**Out of Scope:** Dynamic redirect matching. Search on the 404 page. Automatic WordPress URL discovery.

---

### US-010: Analytics Baseline Establishment

**Title:** Site owner has traffic data from day one for evidence-based decisions
**Persona:** Site owner (internal)
**Narrative:** As the site owner, I want privacy-friendly analytics enabled at launch so that I can establish a traffic baseline and make evidence-based decisions about content strategy and feature additions.

**Acceptance Criteria:**

- AC-010-1: Given Cloudflare Web Analytics is enabled on the Pages project, when any page is loaded by a visitor, then the page view is recorded without setting any cookies or requiring consent.
- AC-010-2: Given the site has a Content Security Policy, when the CSP is inspected, then `static.cloudflareinsights.com` is permitted in the `script-src` directive.
- AC-010-3: Given the site has been live for 30 days, when the Cloudflare dashboard is checked, then monthly unique visitors, page views by path, and referral sources are available.

**Business Rules:** BR-012, BR-013
**Out of Scope:** Google Analytics. Custom event tracking. Analytics dashboard on the site itself. Conversion funnels.

---

## Business Rules

### Content Rules

**BR-001: Hero Copy Constraint.** The homepage hero section consists of exactly one sentence (identity statement) and one paragraph (elaboration) not exceeding 50 words. No images, videos, or interactive elements in the hero.

**BR-002: No Marketing Artifacts.** No page on the site may contain: pricing tables, testimonial quotes, stock photography, signup forms (at MVP), modal overlays, or sticky promotional bars. This rule applies to all pages including the homepage and portfolio.

**BR-003: Content Attribution.** All published content (articles and build logs) is attributed to "Venture Crane" as the default author. An optional per-article author override exists in frontmatter. No content is attributed to a specific AI model or agent by name.

**BR-004: Content Quality Standard.** Every article published on the site must satisfy all four of the following criteria before publication:

1. Contains at least one concrete artifact a reader could use (code snippet, configuration file, decision framework, cost breakdown, or system diagram).
2. Names real tools, real products, and real numbers. No anonymization of portfolio ventures.
3. Includes at least one honest limitation, failure, or lesson learned -- not as a humble-brag but as a genuine operational insight.
4. Passes the "Hacker News test": if submitted to HN, the expected top comments would be substantive engagement, not accusations of content marketing.

**BR-005: Content Freshness and Schema.** Article frontmatter must conform to this schema:

```yaml
---
title: string (required)
date: ISO date string (required)
description: string (required)
author: string (optional, defaults to "Venture Crane")
tags: string[] (optional, from approved vocabulary)
updatedDate: ISO date string (optional)
repo: string (optional, URL to related GitHub repo)
draft: boolean (optional, defaults to false)
---
```

Build log frontmatter uses a simpler schema:

```yaml
---
title: string (required)
date: ISO date string (required)
tags: string[] (optional)
draft: boolean (optional, defaults to false)
---
```

Draft content (`draft: true`) must not appear on the live site, in the article index, or in the RSS feed.

**BR-006: AI Authorship Disclosure.** Every article includes a standardized disclosure at the article footer. The format is: "Drafted with AI assistance. Reviewed and edited by [name]." The disclosure links to the methodology page. Build logs are exempt from this disclosure requirement.

**BR-007: Build Log Boundaries.** Build logs are 200-1,000 words. They do not require a description, estimated reading time, or previous/next navigation. They are displayed in a visually lighter treatment than articles (smaller type scale, no hero section, date prominently displayed).

**BR-008: Methodology Page Scope at Launch.** The methodology page is limited to 800 words at launch. It serves as an overview with links to methodology-focused articles as they are published. It is stored as a markdown file in a `content/pages/` collection, not hardcoded in an Astro component.

### Content Cadence Rules

**BR-009: Publishing Cadence Commitment.** The organization commits to publishing a minimum of 1 substantive article per month, supplemented by build log entries, for the first 3 months post-launch. At the 3-month mark, the cadence is reviewed. If the cadence has not been met, the content strategy is formally reassessed before further site investment.

### Site Behavior Rules

**BR-010: Zero JavaScript for Content.** No JavaScript is required to read any content on the site. Navigation must function without JavaScript. The only permitted external script is Cloudflare Web Analytics, which is loaded by the platform and does not affect content rendering.

**BR-011: Founder Identity.** The methodology/about page includes a founder section: founder name, 1-2 sentence background, and links to X and GitHub profiles. This section establishes the human identity behind the "Venture Crane" attribution.

**BR-012: Content Security Policy.** The site deploys a CSP via Cloudflare Pages `_headers` file. The baseline policy is: `default-src 'self'; script-src 'self' static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self' cloudflareinsights.com`. Any additions to this policy require explicit justification.

### Feature Gating Rules

**BR-013: Trigger-Based Feature Addition.** Interactive features are added only when evidence-based triggers are met. Defined triggers for Phase 1+:

- Email capture (newsletter notification): enabled when monthly unique visitors exceed 1,000 for two consecutive months.
- Tag-based filtering and search: enabled when total published content items (articles + build logs) exceed 20.
- Pagination on article index: enabled when total published content items exceed 20.

**BR-014: Portfolio Card Link Integrity.** Before launch and before each subsequent deployment that modifies portfolio data, external venture links are manually verified. Any link that returns an HTTP error is replaced with the pre-launch card treatment (status badge, no link) until the destination is restored.

---

## Edge Cases

### EC-001: Empty Article Index

**Condition:** The site is deployed before any articles or build logs are published (all content items have `draft: true`).
**Expected behavior:** The article index page displays a message such as "Content coming soon" rather than an empty list. The homepage recent-content section is hidden entirely if no published content exists. The RSS feed returns a valid XML document with zero entries.

### EC-002: Article with No Code Blocks

**Condition:** An article contains only prose, lists, and blockquotes -- no fenced code blocks.
**Expected behavior:** The article renders normally. No syntax highlighting resources are loaded. The reading experience is identical to articles with code, minus the code-specific styling.

### EC-003: Build Log at Schema Boundaries

**Condition:** A build log entry contains fewer than 200 words or more than 1,000 words.
**Expected behavior:** The build system does not enforce word count at build time (this is an editorial guideline, not a schema constraint). Content renders regardless of length. The editorial process (BR-004 quality standard) catches entries outside the target range before merge.

### EC-004: Portfolio Venture with No Description

**Condition:** A venture entry in the portfolio data has an empty or missing `description` field.
**Expected behavior:** The build fails with a clear error message indicating which venture is missing required data. The portfolio page does not render with blank cards.

### EC-005: Broken External Venture Link Post-Launch

**Condition:** A venture's external URL that was valid at launch begins returning errors.
**Expected behavior:** Per BR-014, the link is replaced with the pre-launch card treatment at the next deployment. No automated link checking occurs at build time (this is a manual pre-deployment check).

### EC-006: Long Article Title Overflow

**Condition:** An article title exceeds the width of the article card on a 375px viewport.
**Expected behavior:** The title wraps to multiple lines. It does not truncate with ellipsis and does not overflow its container.

### EC-007: Old WordPress URL Access

**Condition:** A visitor navigates to a URL that existed on the old WordPress venturecrane.com (e.g., `/services/`, `/about-us/`, `/wp-admin/`).
**Expected behavior:** Per US-009 AC-009-3, known high-traffic old URLs redirect to their nearest equivalents. Unknown old URLs fall through to the custom 404 page. No WordPress content or admin interface is accessible.

### EC-008: RSS Feed with Mixed Content Types

**Condition:** The RSS feed contains both articles and build logs.
**Expected behavior:** Both content types appear in a single feed in reverse chronological order. Articles include full content. Build logs include full content. Each entry is distinguishable by its metadata (articles have a description; build logs do not).

### EC-009: Methodology Page with No Linked Articles

**Condition:** At launch, no methodology-focused articles have been published yet, so the methodology page has no inline article references.
**Expected behavior:** The methodology page renders its 800-word overview without any article links. No "related articles" or "further reading" section appears until methodology articles exist to link to.

---

## Traceability Matrix

| User Story | PRD Feature                  | Primary Persona | Launch Metric                                       | Growth Metric                                            | Business Rules                         |
| ---------- | ---------------------------- | --------------- | --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| US-001     | F-001 (Homepage)             | Sam             | Site live in 1-2 weeks                              | Homepage-to-article click-through                        | BR-001, BR-002, BR-010                 |
| US-002     | F-002 (Article Pages)        | Alex            | 3 content pieces at launch, Lighthouse >= 95        | Article page views, referral sources per article         | BR-003, BR-004, BR-005, BR-006, BR-009 |
| US-003     | F-002 (Article Pages)        | Alex, Jordan    | 3 content pieces at launch                          | Article page views relative to homepage                  | BR-003, BR-005                         |
| US-004     | New: F-007 (Build Logs)      | Alex, Jordan    | --                                                  | Content cadence adherence                                | BR-003, BR-005, BR-007, BR-009         |
| US-005     | F-003 (Portfolio)            | Sam, Jordan     | Cross-device functionality                          | Portfolio click-through rate                             | BR-002, BR-010, BR-014                 |
| US-006     | F-004 (Methodology)          | Jordan          | 3 content pieces at launch                          | --                                                       | BR-008, BR-011                         |
| US-007     | F-005 (Navigation & Layout)  | All             | Lighthouse >= 95, cross-device, zero runtime errors | --                                                       | BR-010, BR-012                         |
| US-008     | F-006 (RSS)                  | Alex            | --                                                  | RSS subscriber count (if measurable)                     | BR-003, BR-005                         |
| US-009     | New: F-008 (404 Page)        | All             | Zero runtime errors                                 | --                                                       | BR-010                                 |
| US-010     | New: Analytics (non-feature) | Internal        | --                                                  | Monthly unique visitors, referral sources, article views | BR-012, BR-013                         |

### Metric Definitions Referenced

**Launch Metrics** (gate for Phase 0 completion -- from PRD Section 15):

1. Site live on venturecrane.com within 1-2 weeks
2. At least 3 pieces of content published at launch
3. Lighthouse performance score >= 95 on all pages
4. Cross-device functionality (mobile, tablet, desktop)
5. Build time < 30 seconds
6. Zero runtime errors

**Growth Metrics** (measured starting Phase 1, reviewed monthly):

- Monthly unique visitors (baseline established in first 30 days)
- Article page views relative to homepage views
- Referral sources per article
- Portfolio click-through rate (homepage visitors who click a venture link)
- Content cadence adherence (1 article/month + build logs for 3 months)

**Trigger Metrics** (evidence-based thresholds per BR-013):

- Email capture: monthly unique visitors > 1,000 for 2 consecutive months
- Search and tag filtering: total published content items > 20

---

## Unresolved Issues

### 1. Silicon Crane Relationship and Revenue Attribution

**The disagreement:** The PRD does not state whether the VC website plays any role in Silicon Crane's client acquisition pipeline. No other reviewer raised this in Round 2, which may indicate it is not relevant -- or may indicate it was overlooked because other reviewers focus on content and engineering, not business model.

**Why it matters:** Silicon Crane appears to be the only venture with a services revenue model. If the VC portfolio page or methodology content drives even indirect awareness toward SC, this is a measurable business outcome. If the two are entirely independent, the VC site has no revenue-adjacent function and its value is purely strategic (credibility, visibility). This distinction affects whether "visits to SC from VC referral" should be a tracked growth metric and whether the portfolio page design should give SC any special treatment.

**My position:** The PRD should explicitly state the relationship. A single sentence is sufficient: either "The VC site is expected to contribute to SC awareness" (add the referral metric) or "SC client acquisition is fully independent of the VC site" (do not add the metric). Ambiguity here creates unmeasurable expectations.

**Needs:** Founder decision. No technical work is blocked by this -- it affects metric definition and portfolio page design priority only.

### 2. Launch Article Selection

**The disagreement:** There is strong panel consensus on Article 1 (agent context management, already drafted). Articles 2 and 3 have two competing slates. The Target Customer proposed: "What Running 4 Products with AI Agents Actually Costs" (operational cost breakdown) and "Why We Built a Product Factory Instead of a Product" (origin story). The Competitor Analyst proposed: a failure/limitation article and a portfolio/methodology overview. These overlap but are not identical -- the cost breakdown and the failure article are different content; the origin story and the methodology overview serve different purposes.

**Why it matters:** The launch articles are the site's first impression. The wrong three articles make the site indistinguishable from other AI-development blogs. The right three articles establish the competitive position (multi-product operational reality) that every reviewer identified as the differentiation.

**My position:** Adopt the Target Customer's slate. The cost breakdown article is the single most differentiating piece the site can publish -- no competitor provides this data. The origin story serves Sam (the widest-funnel persona) and addresses the "who is behind this" question. A failure article is valuable but can be Article 4 in month two; the cost breakdown implicitly contains failure content (things that cost more than expected, infrastructure decisions that were wrong).

**Needs:** Founder decision on article topics and willingness to publish real cost data.

### 3. Tagline

**The disagreement:** The Competitor Analyst recommended changing the tagline from "The product factory that shows its work" to something reader-centric and honest about scale. The Product Manager treated tagline refinement as a post-PRD copywriting activity, not a PRD concern. No other reviewer took a strong position.

**Why it matters:** The tagline appears in the OG image, the homepage hero, and every social share. If it overpromises ("product factory" when the portfolio has one launched product), it undermines the credibility that the entire content strategy depends on. If it is deferred, the site ships with a tagline that may not survive first contact with the target audience.

**My position:** This is a copywriting decision, not a PRD decision. The PRD should flag the tagline as requiring founder review before launch but should not specify the final tagline. The Competitor Analyst's alternatives ("How one person and a team of AI agents build real software") are strong candidates but are the founder's call.

**Needs:** Founder review of tagline options before the OG image and homepage hero are finalized. Does not block development -- the tagline can be updated with a single commit.
