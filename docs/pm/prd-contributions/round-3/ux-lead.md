# UX Lead Contribution -- PRD Review Round 3 (Final)

**Author:** UX Lead
**Date:** 2026-02-13
**Scope:** MVP / Phase 0 only
**Status:** Final after 3 rounds

---

## Changes from Round 2

1. **Adopted per-article OG images at launch** instead of deferring to Phase 2. The Competitor Analyst argued persuasively in Round 2 that per-article OG images are a competitive differentiator against individual practitioner blogs. The Technical Lead confirmed that build-time generation via `astro-og-canvas` or Satori is low-cost. Social sharing is the primary distribution channel; link previews are the primary conversion surface. Deferring this undercuts distribution at the moment it matters most.
2. **Moved email capture from Phase 0 to Phase 1** and aligned with the Product Manager's trigger-based approach. My Round 2 contribution included email capture as a high-priority design recommendation. The Product Manager rejected this at launch, preferring a trigger threshold (1,000 monthly visitors for two consecutive months). The Business Analyst's trigger-based roadmap is more disciplined. I retain the UX design specification for when the trigger is met, but remove it from the Phase 0 screen inventory.
3. **Added build log screens to the information architecture and screen inventory.** Round 2 recommended build logs as a content type but did not fully integrate them into the IA or define their screen-level design. This round includes `/log` as a route with a complete screen specification.
4. **Integrated the Technical Lead's specific color values** into the dark theme specification. Round 2 proposed the hybrid dark theme conceptually. The Technical Lead provided concrete starting-point values (`#1a1a2e` chrome, `#242438` article surface, `#e8e8f0` text). These are now included as the baseline palette in the design constraints section, with the note that they require contrast verification before implementation.
5. **Consolidated accessibility into a single actionable specification** rather than deferring to an audit task. The Technical Lead elevated accessibility from Phase 1 to Phase 0 in their Round 2 review, agreeing with my enumeration of specific gaps. This round lists the Phase 0 accessibility requirements as concrete, testable criteria rather than a general WCAG reference.
6. **Added the 404 page and `/log` route to the IA.** The screen inventory now reflects the full consensus route list.
7. **Specified the methodology page as a lean launch** (500 words + founder identity) per the Target Customer's recommendation, with deeper methodology content published as articles over time.
8. **Removed tag vocabulary from Phase 0 scope.** My Round 1 recommendation for a small initial tag vocabulary was deprioritized in Round 2. The Product Manager noted it adds cognitive overhead before content volume justifies it. Tags should be applied consistently in frontmatter from article one (for future use), but no filtering UI or defined vocabulary is needed at launch.

---

## Target User Personas

### Persona 1: Alex -- The Technical Builder

Alex is a senior engineer or engineering lead at a mid-to-large tech company. They have 8-12 years of experience and currently manage a team of 4-8 engineers. They are actively experimenting with AI-assisted development workflows -- running Claude Code or Codex on side projects, evaluating whether to adopt agentic tooling for their team. They read Simon Willison's blog, follow Harper Reed on X, and listen to Latent Space. Their RSS reader has 30-50 feeds. They discovered Venture Crane through a link on Hacker News or a repost on X.

**Goals:** Find practitioner-level detail about AI-assisted development that goes beyond "I asked the AI to write a function." Specifically: session lifecycle management, context persistence across agents, failure modes, and real cost data. Alex wants to evaluate whether the approaches described are applicable to their team.

**Frustrations:** Most AI development content is either triumphant marketing ("10x productivity!"), superficial tutorials, or research-focused (model capabilities, benchmarks). Alex wants operational specifics: what broke, what it cost, how the workflow actually functions day-to-day.

**Behavior on the site:** Arrives on an article page via direct link. Reads the full article. If the content meets their quality bar (concrete artifacts, honest limitations, verifiable claims), they explore the site header, scan the portfolio, and may read a second article. They subscribe to RSS if the first article earns their trust. They do not sign up for anything. They do not click CTAs. They share articles that meet the "would survive an HN comment thread" test.

**Key UX implication:** The article reading experience is the entire product for Alex. Typography, code block rendering, content width, and page load speed are not polish -- they are the core experience. If the reading experience is worse than Stripe's blog or the React docs, Alex notices and mentally downgrades the site.

### Persona 2: Jordan -- The Indie Founder

Jordan is a solo founder or one of a two-person team, currently building their second or third product. They have a technical background (former engineer, now wearing all hats) and are generating modest revenue ($2K-$15K MRR) from an existing product. They are interested in how to run multiple products simultaneously without hiring, and specifically how AI agents can handle the development work they used to do manually. They found Venture Crane through a methodology-focused article or via the portfolio of a specific venture (DFG or KE).

**Goals:** The operational playbook. How sessions are structured, how handoffs work between agents and humans, how quality is maintained, how kill decisions are made, how infrastructure is shared across products. Jordan wants to adopt pieces of the Venture Crane methodology for their own operation.

**Frustrations:** Most "build in public" content is revenue screenshots and engagement bait. Jordan wants the systems layer: how does the factory actually work? They are skeptical of claims that sound too smooth and trust content that includes friction, cost, and honest trade-offs.

**Behavior on the site:** Arrives on the methodology page or an article about operational process. Reads deeply -- this is the one persona who may spend 15-20 minutes on the site in a single visit. Explores the portfolio to evaluate the output. Clicks through to a venture site (DFG, SC) to see whether the products built by this methodology are actually good. Bookmarks the methodology page. Returns when new articles are published, particularly those about process and operations.

**Key UX implication:** The methodology page and the portfolio page must work together. Jordan reads the methodology to understand the approach, then checks the portfolio to verify the output. If the portfolio links to broken pages or underwhelming products, the methodology loses credibility regardless of how well it is written. The transition from VC to venture sites is a trust-critical moment.

### Persona 3: Sam -- The Curious Observer

Sam is a product manager, designer, VC associate, or tech journalist. They are loosely interested in AI-driven development but do not build software themselves. They arrived via a social media share, a referral from a colleague, or a Google search for "AI product development" or "build in public AI agents." They have no prior awareness of Venture Crane.

**Goals:** Understand what Venture Crane is and why it is interesting in under 60 seconds. Form a clear mental model: "This is a one-person operation that uses AI agents to build and run multiple real software products, and they publish how it works." If that mental model is compelling, Sam may read one article or share the homepage link.

**Frustrations:** Jargon-heavy sites that assume technical context. Sites that take more than 10 seconds to explain what they are. Corporate language that obscures the human story.

**Behavior on the site:** Lands on the homepage. Reads the hero. Scans the portfolio cards. Maybe clicks one article or the methodology page. Total time on site: 2-5 minutes. May share the site link if the homepage clearly communicates the value proposition.

**Key UX implication:** The homepage hero must communicate the identity proposition in one sentence without jargon. The portfolio cards must show real products with real status indicators -- not aspirational descriptions. Sam benchmarks the site unconsciously against the best content sites they have seen (Stripe, Linear, Vercel). The visual quality of the homepage is Sam's proxy for the quality of the operation behind it.

---

## User Journey

### Journey 1: Alex discovers an article via social link

| Step | Screen                           | What Alex sees                                                                                                                                                         | What Alex does                                   |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | X/HN feed                        | Link preview with article title, description, and branded OG image                                                                                                     | Clicks the link                                  |
| 2    | Article page (`/articles/:slug`) | Clean reading layout: title, date, author, estimated reading time, article body with syntax-highlighted code blocks, AI disclosure at footer, previous/next navigation | Reads the full article (5-15 minutes)            |
| 3    | Article footer                   | AI authorship disclosure, previous/next article links, 2-3 recent article links in site footer                                                                         | Scrolls past disclosure, notices site footer     |
| 4    | Site header                      | Wordmark + nav: Home, Portfolio, Methodology, Articles                                                                                                                 | Clicks "Home" or wordmark                        |
| 5    | Homepage (`/`)                   | Hero with identity statement, portfolio cards (4 ventures with status badges), recent articles (3-5 with title/date/excerpt)                                           | Scans portfolio, reads article titles            |
| 6    | Article index or second article  | Article listing or another article page                                                                                                                                | Reads a second article if the first earned trust |
| 7    | RSS                              | Subscribes via `/feed.xml` link in footer                                                                                                                              | Adds to RSS reader. Exits.                       |

**Error state:** If Alex arrives on a broken or changed URL, they see the 404 page with links to the article index and homepage. This is a primary surface for social-shared links.

**Return visit:** Alex returns via RSS notification or a new social link. If they land on a non-homepage page (e.g., a bookmarked article), the footer's recent article links let them discover new content without navigating to the homepage.

### Journey 2: Sam lands on the homepage

| Step | Screen                     | What Sam sees                                                                                                                                 | What Sam does                                                        |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1    | Homepage (`/`)             | Hero: one-sentence identity statement + one-paragraph elaboration. No jargon.                                                                 | Reads for 5-10 seconds. Decides whether to stay.                     |
| 2    | Homepage portfolio section | 4 venture cards with name, one-liner, status badge, and link (live ventures link out; pre-launch ventures show "In Development" with no link) | Scans cards. Sees real products.                                     |
| 3    | Homepage recent articles   | 3-5 article cards with title, date, and excerpt                                                                                               | Scans titles. May click one that looks accessible to a non-engineer. |
| 4    | Article page or exit       | Article reading experience or departure                                                                                                       | Reads partially or exits. Total time: 2-5 minutes.                   |

**Key moment:** Step 1 determines everything. If the hero does not communicate "what this is and why it matters to you" within 10 seconds, Sam leaves. The hero must not lead with internal jargon ("MCP-based context management") or organizational structure. It must lead with what the reader gets.

### Journey 3: Jordan reads the methodology

| Step | Screen                            | What Jordan sees                                                                                                                                                                                                               | What Jordan does                                      |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1    | Methodology page (`/methodology`) | Lean overview (approximately 500 words): what Venture Crane is, how it works, the development approach. Founder identity section (2-3 sentences + X/GitHub links). "Last updated" date. Links to methodology-related articles. | Reads the overview. Checks founder identity.          |
| 2    | Methodology-linked article        | A deep-dive article on a specific methodology aspect (session lifecycle, context management, etc.)                                                                                                                             | Reads deeply. 10-15 minutes.                          |
| 3    | Portfolio page (`/portfolio`)     | All ventures with cards. Live ventures link to external sites (open in new tab with external link icon). Pre-launch ventures show status badge with no link.                                                                   | Clicks through to a live venture site (DFG or SC).    |
| 4    | External venture site             | A different site with potentially different design. Jordan understands they have left VC because the link opened in a new tab and had a visual external-link indicator.                                                        | Evaluates the product quality. Returns to the VC tab. |
| 5    | Return to VC                      | Article index or homepage via navigation                                                                                                                                                                                       | Reads additional articles. Bookmarks the site.        |

**Critical transition:** Step 3-4 is where methodology credibility is tested against portfolio reality. If the venture site is broken, empty, or visually poor, the methodology page loses authority. Portfolio cards for pre-launch ventures must clearly label their status and not link to anything that undermines trust.

### Journey 4: Sharing and link preview

| Step | Actor                | What happens                                                                                                                                                                |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Alex (or any reader) | Copies the article URL and pastes it into an HN submission, X post, or Slack message                                                                                        |
| 2    | Platform             | Fetches OG metadata: `og:title` (article title), `og:description` (article description from frontmatter), `og:image` (per-article branded OG image generated at build time) |
| 3    | Viewer               | Sees a link preview card with a clear title, informative description, and branded image that visually identifies the content as Venture Crane                               |
| 4    | Viewer               | Clicks through to the article page (Journey 1, Step 2)                                                                                                                      |

**Key requirement:** The OG image must be generated per-article at build time, not a static site-wide fallback. A text-on-branded-background format (article title rendered on a dark VC-branded template) is sufficient and outperforms generic or missing images for click-through rates.

---

## Information Architecture

### Route Map (Phase 0)

```
venturecrane.com/
  /                        Homepage (hero + portfolio cards + recent articles + footer)
  /portfolio               Portfolio page (all ventures, organized by status)
  /methodology             Methodology overview (lean prose + founder identity + article links)
  /articles                Article index (all articles, newest first)
  /articles/:slug          Individual article
  /log                     Build log index (all entries, reverse-chronological)
  /feed.xml                RSS feed (articles + build logs, full content)
  /privacy                 Privacy policy
  /terms                   Terms of use
  /404                     Custom 404 page (links to article index + homepage)
```

This is flat, predictable, and human-readable. No nested routes, no categories, no pagination at launch. The addition of `/log` is the only IA change from the original PRD, reflecting the panel consensus on build logs as a distinct content type.

### Screen Inventory

#### Homepage (`/`)

| Content Block   | Purpose                | Content                                                                                    |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| Hero            | Identity statement     | One sentence (no jargon) + one paragraph elaboration                                       |
| Portfolio cards | Show what VC has built | 4 cards: venture name, one-liner, status badge, conditional link                           |
| Recent articles | Surface new content    | 3-5 article cards: title, date, excerpt                                                    |
| Footer          | Navigation + identity  | Venture links, social links (X, GitHub), recent article links (2-3), legal links, RSS link |

#### Article Page (`/articles/:slug`)

| Content Block  | Purpose      | Content                                                                                                                |
| -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Article header | Context      | Title, publish date, estimated reading time, author                                                                    |
| Article body   | Core content | Rendered markdown: prose, headings (h2-h4), code blocks (syntax-highlighted), tables, blockquotes, lists, images       |
| AI disclosure  | Transparency | Brief note at article footer: "Drafted with AI assistance. Reviewed and edited by [name]." Linked to methodology page. |
| Previous/next  | Navigation   | Links to adjacent articles by date                                                                                     |
| Footer         | Discovery    | Site footer with recent article links, venture links, RSS link                                                         |

#### Build Log Index (`/log`)

| Content Block | Purpose        | Content                                                                                                                                        |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Page header   | Context        | "Build Log" title, brief description (one sentence)                                                                                            |
| Log entries   | Content stream | Reverse-chronological list of entries. Each entry: date (prominent), title, first 1-2 sentences as preview. No hero, no reading time, no tags. |
| Footer        | Navigation     | Standard site footer                                                                                                                           |

Build log entries are visually lighter than articles: smaller type scale for titles, no excerpt or description, date as the primary visual anchor. Optimized for scanning, not deep reading. Individual build log entries render at the same `/log/:slug` pattern if linked directly but are primarily consumed as a feed on the index page.

#### Portfolio Page (`/portfolio`)

| Content Block  | Purpose           | Content                                                                                                                                                   |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page header    | Context           | Brief introduction (1-2 sentences)                                                                                                                        |
| Venture cards  | Portfolio display | Organized by status: Launched, Active, In Development, Lab. Each card: name, description (2-3 sentences), status badge, tech stack tags, conditional link |
| "Last updated" | Freshness signal  | Date at bottom of page                                                                                                                                    |
| Footer         | Navigation        | Standard site footer                                                                                                                                      |

**Card states:**

- **Live venture** (status: launched or active): Status badge + "Visit [name]" link. Link opens in new tab with external link icon (`target="_blank"` with `rel="noopener noreferrer"`).
- **Pre-launch venture** (status: in-development or lab): Status badge ("In Development"), no link. Description focuses on what is being built, not what exists.

#### Methodology Page (`/methodology`)

| Content Block    | Purpose                    | Content                                                                                                                                                                                            |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page header      | Context                    | Title                                                                                                                                                                                              |
| Overview prose   | Methodology summary        | Approximately 500 words: what Venture Crane is, how it works, the development approach (AI agents, session lifecycle, context management, fleet operations). Lean and opinionated, not exhaustive. |
| Founder identity | Human credibility          | 2-3 sentences about the founder + links to X and GitHub. Not a full bio. Minimum needed to answer "who is behind this?"                                                                            |
| Related articles | Deeper methodology content | Links to published articles that expand on specific methodology aspects. This section grows as articles are published.                                                                             |
| "Last updated"   | Freshness signal           | Date at bottom of page                                                                                                                                                                             |
| Footer           | Navigation                 | Standard site footer                                                                                                                                                                               |

#### Article Index (`/articles`)

| Content Block | Purpose           | Content                                                                                            |
| ------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| Page header   | Context           | Title                                                                                              |
| Article list  | Content discovery | All articles, newest first. Each entry: title, date, description/excerpt. No pagination at launch. |
| Footer        | Navigation        | Standard site footer                                                                               |

#### 404 Page

| Content Block    | Purpose     | Content                                                                  |
| ---------------- | ----------- | ------------------------------------------------------------------------ |
| Error message    | Orientation | Clear statement that the page was not found. No humor, no gimmicks.      |
| Navigation links | Recovery    | Links to: article index, homepage. Optionally: 2-3 recent article links. |
| Footer           | Navigation  | Standard site footer                                                     |

#### Legal Pages (`/privacy`, `/terms`)

Standard text pages. No special design treatment. Standard site header and footer.

### Navigation Structure

**Header (all pages):**

- Wordmark (text-based, links to homepage)
- Nav links: Home, Portfolio, Methodology, Articles
- No utility items (no search, no theme toggle, no login) at MVP

**Footer (all pages):**

- Venture links: DFG, KE, DC, SC (external, new tab)
- Social links: X, GitHub
- Recent articles: 2-3 most recent titles, linked
- Legal: Privacy, Terms
- RSS: Link to `/feed.xml`

**Mobile navigation:**

- Breakpoint: 640px
- Below 640px: header collapses to wordmark + CSS-only hamburger menu (using `<details>` element or checkbox hack -- no JavaScript required)
- Above 640px: full horizontal nav

---

## Interaction Patterns

### Content Reading

The primary interaction is reading. The design must optimize for sustained reading of 1,000-3,000 word technical articles with code blocks, tables, and occasional images.

- **Content width:** 680px maximum (approximately 70 characters at 18px body text)
- **Body text:** 18px / line-height 1.7 on desktop; 16px / line-height 1.6 on mobile
- **Heading scale:** Modular 1.25 ratio across h1-h4
- **Code text:** 14-15px monospace, visually distinct from body prose
- **Meta text** (dates, tags, reading time): 14px, secondary color or reduced opacity

### Code Blocks

- Syntax highlighting via Shiki (build-time, zero client JS). Theme selected after brand palette is decided; must pass WCAG AA contrast for all token types.
- Horizontal scroll for long lines. Scroll container does not conflict with page scroll on mobile.
- Code block background is a distinct shade from the article surface to create clear visual separation.
- Horizontal scrollbar or scroll indicator visible on mobile so users know content extends.
- Increased padding on mobile to make the scrollable area easier to target with a thumb.

### Tables

- Horizontal scroll within a container for tables wider than the viewport.
- Visible scroll indicator (shadow or fade on the right edge) so users know there is more content.
- Semantic markup: proper `<th>`, `<caption>`, and `scope` attributes. Verify that Astro's markdown rendering produces these; add a remark plugin if not.

### Portfolio Card Interaction

- **Live venture card:** Hover state (subtle background or border change). Click opens external site in new tab. External link icon visible in resting state.
- **Pre-launch venture card:** No hover state change. No link. Cursor remains default. Status badge clearly communicates "In Development."

### Navigation (Mobile)

- CSS-only collapse below 640px using `<details>`/`<summary>` or checkbox pattern.
- Hamburger icon as the toggle. Menu expands vertically below the header.
- All touch targets meet 44x44px minimum.
- Menu closes on link click (CSS `:target` or similar stateless pattern).

### External Link Treatment

All links that leave venturecrane.com (venture site links, founder social links) open in a new tab (`target="_blank"` with `rel="noopener noreferrer"`) and display a subtle external link icon. This communicates to the user that they are leaving the site before they click.

### 404 Recovery

When a user hits a non-existent URL, the 404 page provides two clear recovery paths: article index (most likely intent for a social-shared broken link) and homepage. No search, no suggested content, no clever copy. Functional recovery only.

---

## Platform-Specific Design Constraints

The primary platform is the web, optimized for mobile-first responsive design. The site has no native app component and no platform-specific APIs.

### Dark Theme Specification (Resolved)

The panel reached consensus across five of six reviewers on a hybrid dark theme. This is a design requirement, not an open question.

**Color baseline (requires contrast verification before implementation):**

| Surface               | Value                                       | Usage                                                                                |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Site chrome           | `#1a1a2e`                                   | Header, footer, homepage background, portfolio page background                       |
| Article surface       | `#242438`                                   | Article body background, build log body background, methodology page body background |
| Primary text          | `#e8e8f0`                                   | Body text, headings                                                                  |
| Secondary text        | TBD (reduced opacity or lighter variant)    | Dates, reading time, meta text                                                       |
| Code block background | TBD (distinct from article surface)         | Code blocks within articles                                                          |
| Accent color          | TBD (must differentiate VC from SC and DFG) | Links, status badges, hover states                                                   |

**Implementation:**

- All color values defined as CSS custom properties from day one (enables future light theme without stylesheet restructuring).
- Exposed as Tailwind theme colors for consistent usage.
- All text must pass WCAG AA contrast ratios: 4.5:1 for normal text (under 18px or under 14px bold), 3:1 for large text (18px+ or 14px+ bold).

### Typography

- **Font strategy:** System fonts only. No web fonts, no CDN dependencies. This is the key variable for the 1-second TTFMP target on 3G and eliminates the most common performance bottleneck for content sites.
- **Body:** System font stack (e.g., `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`)
- **Code:** System monospace stack (e.g., `ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace`)
- **Type scale:** 18px/1.7 body desktop, 16px/1.6 body mobile, modular 1.25 heading ratio, 14-15px code, 14px meta text
- **Content width:** 680px maximum

### Responsive Breakpoints

| Breakpoint     | Behavior                                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| < 640px        | Mobile layout: stacked content, collapsed nav, 16px body text, full-width cards |
| 640px - 1024px | Tablet: expanded nav, 18px body text, content centered with side margins        |
| > 1024px       | Desktop: same as tablet, generous whitespace on sides of content column         |

### OG Image Strategy

- **Phase 0:** Per-article OG images generated at build time. Format: article title rendered as text on a dark VC-branded background template (wordmark + accent color). Implementation via `astro-og-canvas`, Satori, or equivalent build-time generator.
- **Fallback:** A site-wide static OG image for non-article pages (homepage, portfolio, methodology) using the VC wordmark and tagline.
- **Frontmatter:** Add an optional `ogImage` field to article frontmatter for manual override. Auto-generated image is the default.

---

## Accessibility Requirements

The PRD specifies WCAG 2.1 AA as the compliance target. The following are the concrete Phase 0 requirements for a dark-themed, code-heavy content site. These are build-time requirements, not a post-launch audit checklist.

### Phase 0 Accessibility Specification

| Requirement                  | Detail                                                                                                                                                                | Test                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focus indicators             | Custom visible focus styles on all interactive elements (links, buttons, nav items, hamburger toggle). Default browser focus rings are invisible on dark backgrounds. | Tab through every page. Focus must be visible on every interactive element against both chrome and article surface backgrounds.                                                |
| Syntax highlighting contrast | Every token type in the chosen Shiki theme must meet 4.5:1 contrast against the code block background.                                                                | Check each token color (keywords, strings, comments, operators, functions) against the code block background using a contrast checker. Customize the theme if any token fails. |
| Table semantics              | Markdown-generated tables produce proper `<th>`, `<caption>`, and `scope` attributes.                                                                                 | Inspect rendered table HTML. Add a remark plugin if Astro's default rendering does not produce semantic markup.                                                                |
| Touch targets                | All interactive elements meet 44x44px minimum (WCAG 2.5.5). This affects link spacing in nav, footer, article cards, and previous/next navigation.                    | Measure rendered touch targets on a 375px viewport.                                                                                                                            |
| Language attribute           | `lang="en"` on the `<html>` element.                                                                                                                                  | Inspect base layout HTML.                                                                                                                                                      |
| Reduced motion               | If any hover effects, transitions, or animations are added, they must be gated behind `prefers-reduced-motion: reduce`.                                               | Enable reduced motion in OS settings. Verify no animations play.                                                                                                               |
| Skip-to-content link         | Visible on focus, positioned before the header navigation. Links to `#main-content`.                                                                                  | Tab from page load. First focusable element should be the skip link.                                                                                                           |
| Heading hierarchy            | Every page has exactly one `<h1>`. Headings do not skip levels. Articles use h2-h4 within the article body.                                                           | Inspect heading structure on every page template.                                                                                                                              |
| Alt text                     | All images have descriptive alt text. Decorative images use `alt=""`.                                                                                                 | Inspect all `<img>` elements.                                                                                                                                                  |
| Color independence           | Information is not conveyed by color alone. Status badges on portfolio cards use text labels, not just color.                                                         | Review portfolio cards and any status indicators with a grayscale filter.                                                                                                      |

---

## Unresolved Issues

1. **Per-article OG images: scope risk.** The Competitor Analyst argued for per-article OG images at launch. The Technical Lead confirmed feasibility (build-time generation, 2-4 hours). I have adopted this recommendation. However, the Product Manager did not explicitly endorse or reject per-article OG images at launch in Round 2 -- they listed it as a Phase 1 item. If the 2-week sprint timeline is at risk, this is a candidate for deferral to a static site-wide image. **Decision needed:** Does the per-article OG image generator ship in Phase 0 or Phase 1?

2. **Brand kit minimum.** The color baseline in this document uses the Technical Lead's proposed values (`#1a1a2e`, `#242438`, `#e8e8f0`) as starting points. These require verification against WCAG contrast ratios and aesthetic judgment. The accent color, which affects links, badges, hover states, and the OG image template, has not been specified by any reviewer. The Product Manager flagged this as a blocking prerequisite. **Decision needed:** Primary color, accent color, and wordmark treatment before development begins.

3. **Methodology page length at launch.** The Target Customer recommended a lean 500-word overview that grows through linked articles. The Product Manager elevated the methodology page's priority but also endorsed the lean launch approach. The PRD describes it as potentially "a single long page." **Decision needed:** Is the methodology page a 500-word overview linking to articles, or a comprehensive standalone document at launch? This affects content production timeline and UX design (table of contents, section anchors, scroll depth).
