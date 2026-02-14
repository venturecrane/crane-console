# Venture Crane Website -- Product Requirements Document

> Synthesized from 3-round, 6-role PRD review process. Generated 2026-02-13.

## Table of Contents

1. Executive Summary
2. Product Vision & Identity
3. Target Users & Personas
4. Core Problem
5. Product Principles
6. Competitive Positioning
7. MVP User Journey
8. MVP Feature Specifications
9. Information Architecture
10. Architecture & Technical Design
11. Proposed Data Model
12. API Surface
13. Non-Functional Requirements
14. Platform-Specific Design Constraints
15. Success Metrics & Kill Criteria
16. Risks & Mitigations
17. Open Decisions / ADRs
18. Phased Development Plan
19. Glossary
20. Appendix: Unresolved Issues

---

## 1. Executive Summary

Venture Crane operates a portfolio of software products built by AI agents under human direction. The current venturecrane.com is a WordPress site on Hostinger that describes a validation-as-a-service offering that no longer exists -- that work moved to Silicon Crane. The site tells the wrong story on the wrong platform.

The new venturecrane.com is a static, content-driven marketing site built on the same Cloudflare-native stack used across the portfolio (Astro 5, Cloudflare Pages, Tailwind CSS). It serves three functions: establish Venture Crane's identity as a product factory, publish technical and operational content about AI-driven development, and connect the portfolio brands through a central hub.

The strategic case for building now rests on competitive timing. The practitioner AI-development content space is growing rapidly -- Harper Reed, Simon Willison, and Latent Space have established audiences publishing adjacent content. Venture Crane's differentiation is the organizational and multi-product perspective: fleet operations, cross-venture context management, portfolio-level kill decisions, and operational costs. No established voice occupies this position. The window is open but will narrow as more teams adopt agentic workflows and begin publishing.

The site ships within a 2-week sprint. Infrastructure cost is near zero (Cloudflare free tier). The only meaningful investment is the founder's time: the build sprint itself and an ongoing commitment to publish one substantive article per month plus supplementary build logs. If this content commitment cannot be sustained, the site becomes an empty shell and should be archived rather than maintained.

**What this is:** A content site that publishes the operational reality of building products with AI agents -- costs, failures, methodology, and metrics.

**What this is NOT:** A SaaS product, a lead generation funnel, a dashboard, or an application with user accounts. No dynamic experiments, no payment flows, no user data at MVP.

---

## 2. Product Vision & Identity

### Organizational Position

Venture Crane sits at the head of the SMDurgan, LLC enterprise, below the legal entity and above all ventures:

```
SMDurgan, LLC (legal entity)
  Venture Crane (product factory + governance)
    Silicon Crane (validation lab)
    Durgan Field Guide (product -- launched)
    Kid Expenses (product -- active)
    Draft Crane (product -- in development)
```

### Target Audience

Technical builders -- engineers, founders, and operators at AI-forward companies -- who want to understand how AI-assisted development works at the operational level. Not "I asked an LLM to write a function" but "here is how we manage session continuity across a fleet of machines running parallel AI agents, here is what it costs, and here is what breaks."

### Brand Voice

Direct, technical, evidence-based. Show the work. No marketing fluff. The content itself is the marketing.

### Tagline

"The product factory that shows its work."

Note: The review panel proposed reader-centric alternatives (e.g., "How one person and a team of AI agents build real software"). Tagline refinement is a post-PRD copywriting exercise. The current tagline communicates the core identity; alternatives should be tested against actual content before replacing it.

### Build-in-Public Philosophy

Venture Crane publishes what it learns -- systems, decisions, failures, methodology. Not to sell consulting, but because transparency compounds: it attracts the right people, builds credibility, and forces intellectual honesty.

### Founder Identity

Build-in-public content requires a visible human. The methodology/about page must include a brief founder section (2-3 sentences) with name, background relevant to the venture, and links to X and GitHub. This is the minimum to establish credibility. "Venture Crane" is the brand; a named person is the author.

### AI Authorship Disclosure

Content is drafted with AI assistance and reviewed/edited by a human. Each article includes a standardized disclosure at the footer: "Drafted with AI assistance. Reviewed and edited by [name]." This is a credibility asset, not a disclaimer -- it demonstrates that the AI-driven methodology works for content production, not just code. No competitor currently provides this level of transparency, making it a free differentiator that reinforces the core narrative.

---

## 3. Target Users & Personas

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

## 4. Core Problem

> "I piece together my understanding of AI-agent workflows from scattered sources. Willison covers tools. Harper Reed covers his personal workflow. Latent Space covers the ecosystem. Nobody covers the organizational layer: how you coordinate multiple agents across multiple products, how you manage context at scale, what the failure modes are when you try to run this as an operation rather than a hobby. I want that content. It does not exist." -- Alex persona

> "I am stuck at the 'AI writes functions for me' stage. I know people are running agents semi-autonomously -- starting sessions, handing off context, letting the agent pick up where it left off. But every post I find about this is either a triumphant announcement or a vendor tutorial. Nobody shows the unglamorous operational reality: the session that went sideways, the cost that surprised them, the handoff format that actually works after six iterations. I need the operational playbook, written by someone who runs it daily, not someone selling it." -- Jordan persona

> "I have no pain. I have curiosity. I saw something interesting and clicked a link. If the site rewards that curiosity with clarity, I will remember it. If it meets me with jargon or self-congratulation, I will close the tab." -- Sam persona

The core problem operates on two levels:

**For the audience:** Technical builders interested in AI-assisted development at the operational level have no single source that provides the organizational perspective -- fleet coordination, cross-product context management, portfolio-level kill decisions, and transparent cost reporting. Existing sources cover individual practitioner workflows (Harper Reed), tool evaluations (Willison), or ecosystem-level trends (Latent Space). The gap is the factory floor: how a multi-product operation runs day-to-day with AI agents, including the failures.

**For the business:** The current venturecrane.com actively misrepresents the enterprise. It describes services that migrated to another venture, has no content behind its resource links, and runs on WordPress while the organization builds on Cloudflare. Every visitor sees the wrong story on the wrong platform.

---

## 5. Product Principles

These principles are ordered by priority. When they conflict, higher-numbered principles yield to lower-numbered ones.

1. **Content is the product.** The site exists to publish and present content. Every design and engineering decision optimizes for reading experience and content authoring velocity. If a feature does not make content better or easier to publish, it does not ship.

2. **Ship thin, grow content.** Launch with the minimum viable site structure and 3 pieces of strong content. The site grows through content, not features. Content is the bottleneck, not engineering -- and that is correct.

3. **Eat our own cooking.** Build on the same stack used for everything else (Astro 5, Cloudflare Pages, Tailwind CSS). Deploy the same way. Use the same tooling. The site itself demonstrates the approach. Performance is a proof point: sub-1-second load, zero JavaScript, perfect Lighthouse score.

4. **No premature interactivity.** No newsletter signup, no account system, no comments, no analytics dashboards at MVP. Add these only when evidence-based triggers are met (see Section 15). The first interactive feature (email capture) enters scope at Phase 1, gated by a traffic threshold.

5. **Sustainable by agents.** Content publishing, site updates, and maintenance must be manageable by AI agents with human oversight. Markdown files in a git repo, built by Astro, deployed to Cloudflare Pages. No CMS admin panels or WordPress dashboards.

6. **Specificity over polish.** A concrete operational detail (a real cost figure, a real configuration, a real failure) is worth more than a well-designed page with generic content. The content quality bar rewards specificity; the design system should never obstruct it.

---

## 6. Competitive Positioning

### The Differentiation Thesis

Venture Crane's differentiation is the intersection of three attributes that no single competitor combines: (1) a multi-product portfolio with documented methodology, (2) transparent publication of operational reality -- costs, failures, kill decisions, and metrics -- not just wins, and (3) systematic use of AI agents for development operations, published from the organizational rather than individual perspective.

### Competitive Landscape

The competitive landscape operates on two axes: (1) content topic overlap (AI-assisted development operations) and (2) structural similarity (multi-product portfolio transparency). No single competitor occupies both axes simultaneously.

#### Tier 1 -- Direct Competitors for Audience Attention

| Competitor                             | What They Publish                                                                                                         | Threat Level | Where VC Differentiates                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Simon Willison** (simonwillison.net) | Daily AI tool coverage, link-commentary, deep dives. "Software factory" framing overlaps with VC. 500K+ monthly visitors. | High         | Writes as an individual practitioner. Cannot provide organizational/portfolio perspective.                                                            |
| **Harper Reed** (harper.blog)          | Infrequent but high-impact practitioner-level AI codegen workflow posts. Multiple HN front-page appearances.              | High         | Individual practitioner perspective -- no portfolio/factory angle. Sets the quality floor VC must meet.                                               |
| **swyx / Latent Space** (latent.space) | Weekly newsletter + podcast covering AI engineering ecosystem broadly. 10M+ annual reach.                                 | Medium-High  | Covers the ecosystem; VC covers its own operational reality. Latent Space interviews practitioners but does not "show the factory floor" itself.      |
| **Pieter Levels** (levels.io)          | Revenue transparency, shipping cadence, multi-product portfolio. $3M+ ARR. 40+ shipped products.                          | Medium       | Closest structural analogue but focuses on revenue/PMF, not development methodology or AI operations. The Jordan persona will compare portfolio size. |

#### Tier 2 -- Indirect Competitors

| Competitor                            | Relevance                                                                                            | Threat Level |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| Cognition / Devin blog                | Practitioner-oriented content about AI agents doing real development work                            | Low-Medium   |
| The Pragmatic Engineer                | Engineering practices newsletter (700K+ subscribers) targeting the same audience                     | Low-Medium   |
| Vercel / Cloudflare engineering blogs | Platform-capability content. VC uses their tools but writes about methodology, not platform features | Low          |

#### Tier 3 -- Venture Studios (Structural Comparables)

No established venture studio (Atomic, Hexa, High Alpha) publishes operational methodology. The space is unoccupied. If VC claims it, the competition is zero -- the risk is audience size for the niche, not competitor displacement.

### Is the Differentiation Defensible?

**Short-term (6-12 months): Yes.** The combination is currently unoccupied. No individual practitioner can provide the organizational/portfolio perspective. No venture studio publishes operational methodology. No AI company blog covers using models operationally at the multi-product level.

**Long-term (12+ months): Partially.** Defensibility depends on being early with a body of published work (content compounds), the portfolio itself as evidence (each new product launched adds credibility no newcomer can fabricate), and compounding methodology documentation over 12+ months.

### Feature Comparison Matrix

| Feature                      | VC (MVP)                | Simon Willison              | Harper Reed                   | Latent Space               | Pieter Levels |
| ---------------------------- | ----------------------- | --------------------------- | ----------------------------- | -------------------------- | ------------- |
| Long-form technical articles | Yes (3 at launch)       | Yes (daily + deep dives)    | Yes (infrequent, high-impact) | Yes (weekly newsletter)    | No (X-native) |
| Build logs / short updates   | Yes (Phase 0)           | Yes (daily link-commentary) | No                            | No                         | Yes (X posts) |
| Portfolio page               | Yes                     | No                          | No                            | No                         | No            |
| Methodology / About          | Yes (narrative page)    | No                          | No                            | About page only            | No            |
| RSS feed (full content)      | Yes                     | Yes                         | Yes                           | Yes                        | No            |
| Email capture / newsletter   | Phase 1 (trigger-based) | No                          | No                            | Yes (primary distribution) | No            |
| Dark theme                   | Yes (hybrid)            | No (light)                  | No (light)                    | No (light)                 | N/A           |
| Zero JavaScript              | Yes                     | No                          | No                            | No                         | N/A           |
| System fonts / sub-1s load   | Yes (target)            | No (web fonts)              | No (web fonts)                | No (web fonts)             | N/A           |

### Pricing and Business Model Context

The target audience expects practitioner technical content to be free. Competitors who gate content (Latent Space, The Pragmatic Engineer) built large free audiences first and introduced paywalls only after establishing trust and scale. For a new site with zero audience, any content gating would be fatal.

The VC site is a cost center with near-zero infrastructure cost whose strategic return is measured in credibility and portfolio traffic, not in direct revenue. This framing prevents future scope creep toward monetization features (paywalls, sponsorships, courses) that would undermine the "not selling anything" positioning.

---

## 7. MVP User Journey

### Journey 1: Alex discovers an article via social link

| Step | Screen                           | What Alex sees                                                                                                                                                         | What Alex does                                   |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | X/HN feed                        | Link preview with article title, description, and branded OG image                                                                                                     | Clicks the link                                  |
| 2    | Article page (`/articles/:slug`) | Clean reading layout: title, date, author, estimated reading time, article body with syntax-highlighted code blocks, AI disclosure at footer, previous/next navigation | Reads the full article (5-15 minutes)            |
| 3    | Article footer                   | AI authorship disclosure, previous/next article links, 2-3 recent article links in site footer                                                                         | Scrolls past disclosure, notices site footer     |
| 4    | Site header                      | Wordmark + nav: Home, Portfolio, Methodology, Articles                                                                                                                 | Clicks "Home" or wordmark                        |
| 5    | Homepage (`/`)                   | Hero with identity statement, portfolio cards (4 ventures with status badges), recent articles                                                                         | Scans portfolio, reads article titles            |
| 6    | Article index or second article  | Article listing or another article page                                                                                                                                | Reads a second article if the first earned trust |
| 7    | RSS                              | Subscribes via `/feed.xml` link in footer                                                                                                                              | Adds to RSS reader. Exits.                       |

**Error state:** If Alex arrives on a broken or changed URL, they see the 404 page with links to the article index and homepage. This is a primary surface for social-shared links.

**Return visit:** Alex returns via RSS notification or a new social link. If they land on a non-homepage page, the footer's recent article links let them discover new content without navigating to the homepage.

### Journey 2: Sam lands on the homepage

| Step | Screen                     | What Sam sees                                                                 | What Sam does                                      |
| ---- | -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | Homepage (`/`)             | Hero: one-sentence identity statement + one-paragraph elaboration. No jargon. | Reads for 5-10 seconds. Decides whether to stay.   |
| 2    | Homepage portfolio section | 4 venture cards with name, one-liner, status badge, and conditional link      | Scans cards. Sees real products.                   |
| 3    | Homepage recent articles   | 3-5 article cards with title, date, and excerpt                               | Scans titles. May click one.                       |
| 4    | Article page or exit       | Article reading experience or departure                                       | Reads partially or exits. Total time: 2-5 minutes. |

**Key moment:** Step 1 determines everything. If the hero does not communicate "what this is and why it matters" within 10 seconds, Sam leaves.

### Journey 3: Jordan reads the methodology

| Step | Screen                            | What Jordan sees                                                                                                                                              | What Jordan does                                      |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | Methodology page (`/methodology`) | Lean overview (~500 words): what VC is, how it works, the development approach. Founder identity section. "Last updated" date. Links to methodology articles. | Reads the overview. Checks founder identity.          |
| 2    | Methodology-linked article        | A deep-dive article on a specific methodology aspect                                                                                                          | Reads deeply. 10-15 minutes.                          |
| 3    | Portfolio page (`/portfolio`)     | All ventures with cards. Live ventures link to external sites (new tab, external link icon). Pre-launch ventures show status badge with no link.              | Clicks through to a live venture site.                |
| 4    | External venture site             | A different site. Jordan understands they have left VC because the link opened in a new tab with a visual external-link indicator.                            | Evaluates the product quality. Returns to the VC tab. |
| 5    | Return to VC                      | Article index or homepage via navigation                                                                                                                      | Reads additional articles. Bookmarks the site.        |

**Critical transition:** Steps 3-4 are where methodology credibility is tested against portfolio reality. If the venture site is broken, empty, or visually poor, the methodology page loses authority.

### Journey 4: Sharing and link preview

| Step | Actor    | What happens                                                                            |
| ---- | -------- | --------------------------------------------------------------------------------------- |
| 1    | Reader   | Copies the article URL and pastes it into an HN submission, X post, or Slack message    |
| 2    | Platform | Fetches OG metadata: `og:title`, `og:description`, `og:image`                           |
| 3    | Viewer   | Sees a link preview card with a clear title, informative description, and branded image |
| 4    | Viewer   | Clicks through to the article page (Journey 1, Step 2)                                  |

---

## 8. MVP Feature Specifications

### Content Strategy

Content strategy has the same weight as technical architecture because content is the product.

#### Content Types

| Type                | Description                                               | Location                | Cadence                      |
| ------------------- | --------------------------------------------------------- | ----------------------- | ---------------------------- |
| **Articles**        | Deep technical and operational content, 1000-3000 words   | `src/content/articles/` | 1 per month minimum          |
| **Build logs**      | Short operational updates, 200-1000 words                 | `src/content/logs/`     | 2-4 per month                |
| **Narrative pages** | Evergreen content (methodology, about), updated as needed | `src/content/pages/`    | Updated quarterly            |
| **Portfolio data**  | Structured venture information                            | Static TypeScript/JSON  | Updated when ventures change |

#### Content Quality Standard

Every article published on venturecrane.com must meet all four criteria:

1. **Artifact test.** Contains at least one artifact a reader could use -- a configuration file, a template, a decision framework, a cost breakdown, a diagram of a real system. Not abstract advice.
2. **Specificity test.** Names real tools, real products, and real numbers. No anonymization of portfolio ventures. Articles reference DFG, KE, SC, DC by name and cite actual session counts, CI pass rates, API costs, and time-to-ship figures.
3. **Honesty test.** Includes at least one honest limitation or failure. Not as a humble-brag. A genuine operational lesson: what broke, what was the cost, what changed as a result.
4. **HN survival test.** Before publishing, ask: if this appeared on HN, would the comments be "this is useful, I learned something" or "this is content marketing dressed up as a blog post"? If the latter, rewrite or kill it.

Build logs are exempt from criteria 1 and 4 but must meet criteria 2 and 3. They are operational diary entries, not polished articles.

#### Launch Content (3 Articles + Methodology Page)

1. **"How We Give AI Agents Persistent Memory Across Sessions"** -- the context management system doc, already drafted. Targets the Alex persona. Must include real MCP configuration, real session logs, and real failure modes.
2. **"What Running 4 Products with AI Agents Actually Costs"** -- monthly breakdown of API spend, infrastructure costs, and human time across the portfolio. Targets the Jordan persona. No competitor publishes this data.
3. **"Why We Built a Product Factory Instead of a Product"** -- origin story and organizational philosophy, 800-1200 words. Targets the Sam persona. Links to the portfolio as evidence.

Additionally: the methodology/about page (500 words) and at least 1 build log entry ship at launch.

#### Publishing Cadence

Minimum 1 substantive article per month, supplemented by 2-4 build log entries per month. This commitment runs for 3 months post-launch with a review checkpoint. If the cadence is unsustainable, the content strategy is revisited before investing further in the site. If the cadence is met but traffic does not materialize, the distribution strategy is revisited.

#### Editorial Process

AI agents draft content. The human founder reviews, edits, and approves. Content is attributed to "Venture Crane" with the standardized AI disclosure at the article footer. The founder owns editorial judgment -- what to publish, what to kill, what to rewrite.

#### Content Review Checklist

Before any article is published:

- Meets all 4 quality criteria above
- No sensitive operational details exposed (API keys, customer data, security configurations)
- "So what" can be stated in one sentence
- Reviewed for factual accuracy of all cited numbers and configurations

#### Distribution Plan

Content without distribution is invisible. The PRD specifies distribution with the same rigor as architecture:

- **Target channels:** Hacker News, X, relevant subreddits (r/ExperiencedDevs, r/SideProject), relevant Discord communities
- **Launch amplification:** Draft HN submission titles and X thread outlines for each launch article before the articles are written. This forces clarity on the value proposition per article.
- **Portfolio cross-linking:** Every venture site (DFG, KE, SC) includes a "Built with Venture Crane" footer link. This is free, controlled referral traffic the organization already owns.
- **Ownership:** The human founder owns distribution. AI agents may draft social copy, but the founder posts, engages, and responds. Distribution cannot be delegated to automation.
- **RSS:** Full-content RSS feed at `/feed.xml`. No excerpts. RSS is the primary retention mechanism at launch.

### User Stories

#### US-001: Homepage Identity Comprehension

**Persona:** Sam (Curious Observer)
**Narrative:** As a curious observer landing on the homepage for the first time, I want to understand what Venture Crane is and why it exists so that I can decide whether to explore further or leave.

**Acceptance Criteria:**

- AC-001-1: Given a first-time visitor loads the homepage, when the page renders, then a single-sentence identity statement is visible above the fold without scrolling on a 375px-wide viewport.
- AC-001-2: Given a first-time visitor reads the hero section, when they reach the end of the hero content, then the elaboration paragraph is no longer than 50 words.
- AC-001-3: Given a first-time visitor scans below the hero, when the portfolio section renders, then at least one venture card is visible with name, one-line description, and status badge.
- AC-001-4: Given a first-time visitor views the homepage, when any stock photos, testimonial quotes, pricing tables, or signup forms are searched for, then none exist on the page.

#### US-002: Article Reading Experience

**Persona:** Alex (Technical Builder)
**Narrative:** As a technical builder who arrived via a shared link, I want to read a full technical article with properly formatted code, tables, and prose so that I can evaluate whether the content is worth my time and attention.

**Acceptance Criteria:**

- AC-002-1: Given a visitor loads an article page, when the page renders, then the article title, publication date, estimated reading time, and author attribution are visible before the article body.
- AC-002-2: Given an article contains a fenced code block, when the page renders, then syntax highlighting is applied using Shiki with a named dark theme, and every syntax token meets WCAG AA contrast ratio (4.5:1) against the code block background.
- AC-002-3: Given an article body is rendered, when measured on a viewport width of 1280px or greater, then the prose content width does not exceed 680px.
- AC-002-4: Given an article contains a markdown table, when rendered, then the table uses semantic HTML (`<table>`, `<th>`, `<td>`) and does not overflow its container on a 375px-wide viewport (horizontal scroll is applied to the table element, not the page).
- AC-002-5: Given a visitor reaches the end of an article, when the article footer renders, then links to the previous and next articles (by publication date) are present.
- AC-002-6: Given an article includes an AI disclosure, when the article footer renders, then a standardized disclosure statement is visible.
- AC-002-7: Given an article has an `updatedDate` in its frontmatter, when the page renders, then both the original publication date and the updated date are displayed.

#### US-003: Article Discovery via Index

**Persona:** Alex, Jordan
**Narrative:** As a returning visitor, I want to browse all published articles sorted by date so that I can find content I have not yet read.

**Acceptance Criteria:**

- AC-003-1: Given a visitor navigates to `/articles`, when the page renders, then all published (non-draft) articles are listed in reverse chronological order.
- AC-003-2: Given the article index renders, when each article entry is displayed, then it shows the article title, publication date, description, and estimated reading time.
- AC-003-3: Given fewer than 20 total content items exist, when the article index renders, then no pagination is displayed.

#### US-004: Build Log Consumption

**Persona:** Alex, Jordan
**Narrative:** As a technical reader interested in the day-to-day reality of AI-driven development, I want to read short, dated entries about what was built, what broke, and what was learned.

**Acceptance Criteria:**

- AC-004-1: Given a build log entry exists in `src/content/logs/`, when the entry page renders, then the title, date, and tags are displayed.
- AC-004-2: Given a build log entry is rendered, when compared to a full article, then no estimated reading time, no description excerpt, and no previous/next navigation are displayed.
- AC-004-3: Given build log entries exist, when `/log` is loaded, then all published build log entries are listed in reverse chronological order.
- AC-004-4: Given a build log entry is published, when the RSS feed is regenerated at build time, then the build log entry appears in the feed alongside articles.

#### US-005: Portfolio Exploration

**Persona:** Sam, Jordan
**Narrative:** As a visitor evaluating Venture Crane's credibility, I want to see the portfolio of products with their status and links so that I can verify these are real products, not vaporware.

**Acceptance Criteria:**

- AC-005-1: Given a visitor loads the portfolio page, when the page renders, then one card is displayed per venture with: name, description (2-3 sentences), status badge, and technology stack tags.
- AC-005-2: Given a venture has status "launched" or "active", when the card renders, then a link to the external product site is present and opens in a new tab with a visual external-link indicator.
- AC-005-3: Given a venture has status "in-development" or "lab", when the card renders, then no external link is displayed and the status badge reads "In Development" or "Lab" respectively.
- AC-005-4: Given the portfolio page renders, when cards are ordered, then they appear in status order: Launched > Active > In Development > Lab.

#### US-006: Methodology Comprehension

**Persona:** Jordan
**Narrative:** As an indie founder exploring AI-driven development, I want to understand how Venture Crane organizes its operations, manages AI agents, and makes product decisions so that I can evaluate whether aspects of this approach apply to my own work.

**Acceptance Criteria:**

- AC-006-1: Given a visitor loads the methodology page, when the page renders, then the organizational structure is explained in prose or diagram form.
- AC-006-2: Given the methodology page renders, when the content is measured, then it does not exceed 800 words at launch.
- AC-006-3: Given the methodology page renders, when the founder identity section is present, then it includes the founder's name, a 1-2 sentence background, and links to at least two external profiles (X, GitHub).
- AC-006-4: Given the methodology page renders, when an "updated" date is displayed, then it reflects the last modification date of the underlying content file.
- AC-006-5: Given methodology articles are published after launch, when links to those articles exist, then they are added to the methodology page as inline references.

#### US-007: Navigation and Layout

**Persona:** All personas
**Narrative:** As any visitor on any device, I want persistent navigation that works without JavaScript and adapts to my screen size so that I can move between sections without confusion.

**Acceptance Criteria:**

- AC-007-1: Given a visitor is on any page, when the header renders, then it displays the site wordmark and navigation links to Home, Portfolio, Methodology, and Articles.
- AC-007-2: Given a visitor is on a viewport wider than 640px, when the header renders, then all navigation links are visible inline without a menu toggle.
- AC-007-3: Given a visitor is on a viewport of 640px or narrower, when the header renders, then navigation is collapsed into a menu toggle that functions without JavaScript.
- AC-007-4: Given any page renders, when the footer is displayed, then it contains links to all venture sites, social profile links, and links to recent articles (2-3 most recent).
- AC-007-5: Given the site uses a hybrid dark theme, when any page renders, then site chrome uses a dark background and article reading surfaces use a slightly lighter background, with all text meeting WCAG AA contrast.
- AC-007-6: Given any interactive element receives keyboard focus, when the focus state renders, then a visible focus indicator is displayed that is distinct from the dark background.
- AC-007-7: Given any interactive element is rendered, when its dimensions are measured, then the touch target is at minimum 44x44px.
- AC-007-8: Given any page renders, when the HTML `<html>` element is inspected, then it includes `lang="en"`.
- AC-007-9: Given a visitor activates a skip-to-content link, when the link is followed, then focus moves to the main content area, bypassing the header navigation.

#### US-008: RSS Subscription

**Persona:** Alex
**Narrative:** As a technical reader who uses RSS to track publications, I want a standard RSS feed containing full article content so that I can read new posts in my feed reader without visiting the site.

**Acceptance Criteria:**

- AC-008-1: Given the site is built, when `/feed.xml` is requested, then a valid RSS 2.0 or Atom feed is returned.
- AC-008-2: Given the RSS feed is generated, when its entries are inspected, then each entry contains the full article content (not an excerpt).
- AC-008-3: Given both articles and build logs are published, when the feed is generated, then both content types are included in reverse chronological order.

#### US-009: 404 Error Recovery

**Persona:** All personas
**Narrative:** As a visitor who followed a broken or outdated link, I want a helpful error page so that I can find the content I was looking for or discover other content.

**Acceptance Criteria:**

- AC-009-1: Given a visitor requests a URL that does not match any route, when the server responds, then a custom 404 page is rendered (not the browser or Cloudflare default).
- AC-009-2: Given the 404 page renders, when its content is displayed, then it includes a link to the homepage and a link to the article index.
- AC-009-3: Given WordPress URLs from the old site are known, when a `_redirects` file is deployed, then known high-traffic old URLs redirect to their nearest equivalents on the new site.

#### US-010: Analytics Baseline

**Persona:** Internal (site owner)
**Narrative:** As the site owner, I want privacy-friendly analytics enabled at launch so that I can establish a traffic baseline and make evidence-based decisions.

**Acceptance Criteria:**

- AC-010-1: Given Cloudflare Web Analytics is enabled, when any page is loaded, then the page view is recorded without setting any cookies or requiring consent.
- AC-010-2: Given the site has a Content Security Policy, when the CSP is inspected, then `static.cloudflareinsights.com` is permitted in the `script-src` directive.

### Business Rules

**BR-001: Hero Copy Constraint.** The homepage hero section consists of exactly one sentence (identity statement) and one paragraph (elaboration) not exceeding 50 words.

**BR-002: No Marketing Artifacts.** No page may contain: pricing tables, testimonial quotes, stock photography, signup forms (at MVP), modal overlays, or sticky promotional bars.

**BR-003: Content Attribution.** All published content is attributed to "Venture Crane" as the default author. An optional per-article author override exists in frontmatter. No content is attributed to a specific AI model or agent by name.

**BR-004: Content Quality Standard.** Every article must satisfy all four content quality criteria before publication.

**BR-005: Draft Exclusion.** Draft content (`draft: true`) must not appear on the live site, in the article index, or in the RSS feed.

**BR-006: AI Authorship Disclosure.** Every article includes a standardized disclosure at the article footer: "Drafted with AI assistance. Reviewed and edited by [name]." The disclosure links to the methodology page. Build logs are exempt.

**BR-007: Build Log Boundaries.** Build logs are 200-1,000 words. They do not require a description, estimated reading time, or previous/next navigation. They are displayed in a visually lighter treatment than articles.

**BR-008: Methodology Page Scope at Launch.** The methodology page is limited to approximately 800 words at launch. It serves as an overview with links to methodology-focused articles as they are published.

**BR-009: Publishing Cadence Commitment.** Minimum 1 substantive article per month, supplemented by build log entries, for the first 3 months post-launch with a formal review at the 3-month mark.

**BR-010: Zero JavaScript for Content.** No JavaScript is required to read any content. Navigation must function without JavaScript. The only permitted external script is Cloudflare Web Analytics.

**BR-011: Founder Identity.** The methodology/about page includes a founder section: name, 1-2 sentence background, and links to X and GitHub profiles.

**BR-012: Content Security Policy.** The site deploys a CSP via Cloudflare Pages `_headers` file. Any additions to the baseline policy require explicit justification.

**BR-013: Trigger-Based Feature Addition.** Interactive features are added only when evidence-based triggers are met:

- Email capture: monthly unique visitors > 1,000 for 2 consecutive months
- Tag-based filtering and search: total published content items > 20
- Pagination: total published content items > 20

**BR-014: Portfolio Card Link Integrity.** External venture links are manually verified before launch and before each deployment that modifies portfolio data. Broken links are replaced with the pre-launch card treatment.

### Edge Cases

**EC-001: Empty Article Index.** If all content items have `draft: true`, the article index displays "Content coming soon." The homepage recent-content section is hidden. The RSS feed returns valid XML with zero entries.

**EC-002: Article with No Code Blocks.** The article renders normally. No syntax highlighting resources are loaded.

**EC-003: Build Log at Schema Boundaries.** The build system does not enforce word count at build time (editorial guideline, not schema constraint). Content renders regardless of length.

**EC-004: Portfolio Venture with No Description.** The build fails with a clear error message. The portfolio page does not render with blank cards.

**EC-005: Broken External Venture Link Post-Launch.** Per BR-014, the link is replaced with the pre-launch card treatment at the next deployment.

**EC-006: Long Article Title Overflow.** The title wraps to multiple lines. It does not truncate with ellipsis and does not overflow its container.

**EC-007: Old WordPress URL Access.** Known high-traffic old URLs redirect to their nearest equivalents. Unknown old URLs fall through to the custom 404 page.

**EC-008: RSS Feed with Mixed Content Types.** Both content types appear in a single feed in reverse chronological order with full content.

**EC-009: Methodology Page with No Linked Articles.** The page renders its overview without article links. No "related articles" section appears until methodology articles exist.

### Feature Priority Stack Rank

If the 2-week timeline is at risk, cut features in this order (last item cut first):

1. **F-005: Navigation and Layout** -- infrastructure for everything else. Cannot cut.
2. **F-002: Article Pages** -- the core product. Cannot cut.
3. **F-004: Methodology/About Page** -- the strongest differentiator. Cannot cut.
4. **F-001: Homepage** -- the front door. Cannot cut.
5. **F-007: Build Logs** -- addresses cadence risk. Low implementation cost. Should not cut.
6. **F-003: Portfolio Page** -- can temporarily live as a section on the homepage if time is short.
7. **F-006: RSS Feed** -- important for Alex, but a fast-follow if needed.
8. **F-008: 404 Page** -- low effort, high value. Cut only in extreme time pressure.

---

## 9. Information Architecture

### Route Map (Phase 0)

```
venturecrane.com/
  /                        Homepage (hero + portfolio cards + recent articles + footer)
  /portfolio               Portfolio page (all ventures, organized by status)
  /methodology             Methodology overview (lean prose + founder identity + article links)
  /articles                Article index (all articles, newest first)
  /articles/:slug          Individual article
  /log                     Build log index (all entries, reverse-chronological)
  /log/:slug               Individual build log entry
  /feed.xml                RSS feed (articles + build logs, full content)
  /privacy                 Privacy policy
  /terms                   Terms of use
  /404                     Custom 404 page (links to article index + homepage)
```

This is flat, predictable, and human-readable. No nested routes, no categories, no pagination at launch.

### Screen Inventory

#### Homepage (`/`)

| Content Block   | Purpose                | Content                                                                              |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| Hero            | Identity statement     | One sentence (no jargon) + one paragraph elaboration (max 50 words)                  |
| Portfolio cards | Show what VC has built | 4 cards: venture name, one-liner, status badge, conditional link                     |
| Recent articles | Surface new content    | 3-5 article cards: title, date, excerpt                                              |
| Footer          | Navigation + identity  | Venture links, social links (X, GitHub), recent article links, legal links, RSS link |

#### Article Page (`/articles/:slug`)

| Content Block  | Purpose      | Content                                                                                                          |
| -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Article header | Context      | Title, publish date, estimated reading time, author                                                              |
| Article body   | Core content | Rendered markdown: prose, headings (h2-h4), code blocks (syntax-highlighted), tables, blockquotes, lists, images |
| AI disclosure  | Transparency | "Drafted with AI assistance. Reviewed and edited by [name]." Linked to methodology page.                         |
| Previous/next  | Navigation   | Links to adjacent articles by date                                                                               |
| Footer         | Discovery    | Site footer with recent article links, venture links, RSS link                                                   |

#### Build Log Index (`/log`)

| Content Block | Purpose        | Content                                                                                                                    |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Page header   | Context        | "Build Log" title, brief description                                                                                       |
| Log entries   | Content stream | Reverse-chronological list. Each entry: date (prominent), title, first 1-2 sentences as preview. No hero, no reading time. |
| Footer        | Navigation     | Standard site footer                                                                                                       |

Build log entries are visually lighter than articles: smaller type scale for titles, no excerpt or description, date as the primary visual anchor. Optimized for scanning, not deep reading.

#### Portfolio Page (`/portfolio`)

| Content Block  | Purpose           | Content                                                                                                                                      |
| -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Page header    | Context           | Brief introduction (1-2 sentences)                                                                                                           |
| Venture cards  | Portfolio display | Organized by status: Launched > Active > In Development > Lab. Each card: name, description, status badge, tech stack tags, conditional link |
| "Last updated" | Freshness signal  | Date at bottom of page                                                                                                                       |
| Footer         | Navigation        | Standard site footer                                                                                                                         |

**Card states:**

- **Live venture** (launched or active): Status badge + "Visit [name]" link. Opens in new tab with external link icon (`target="_blank"` with `rel="noopener noreferrer"`).
- **Pre-launch venture** (in-development or lab): Status badge, no link. Description focuses on what is being built.

#### Methodology Page (`/methodology`)

| Content Block    | Purpose                    | Content                                                                                   |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Page header      | Context                    | Title                                                                                     |
| Overview prose   | Methodology summary        | ~500 words: what VC is, how it works, the development approach. Lean and opinionated.     |
| Founder identity | Human credibility          | 2-3 sentences about the founder + links to X and GitHub.                                  |
| Related articles | Deeper methodology content | Links to published articles that expand on specific methodology aspects. Grows over time. |
| "Last updated"   | Freshness signal           | Date at bottom of page                                                                    |
| Footer           | Navigation                 | Standard site footer                                                                      |

#### Article Index (`/articles`)

All articles listed newest first. Each entry: title, date, description/excerpt, reading time. No pagination at launch.

#### 404 Page

Clear statement that the page was not found. Links to: article index, homepage. Optionally: 2-3 recent article links. Standard site footer.

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
- Below 640px: header collapses to wordmark + CSS-only hamburger menu (`<details>` element or checkbox pattern -- no JavaScript)
- Above 640px: full horizontal nav

---

## 10. Architecture & Technical Design

### System Boundary Diagram

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

### Key Design Decisions

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

### Repository Structure

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

### Rendering Pipeline

All pages are generated at build time. No server-side rendering, no client-side JavaScript, no API calls at runtime.

1. **Build trigger:** `git push` to `main` (production) or PR branch (preview deploy)
2. **GitHub Actions:** Installs dependencies, runs `astro build`, runs Lighthouse CI against build output
3. **Astro build:** Reads Content Collections, validates frontmatter against schemas, renders Markdown to HTML, processes images (WebP conversion, responsive sizing), generates static HTML + CSS
4. **Deploy:** Cloudflare Pages receives the `dist/` directory, serves it globally via CDN
5. **Headers/Redirects:** Cloudflare Pages applies `_headers` (CSP, cache-control) and `_redirects` (WordPress URL mappings) at the edge

### Dark Theme Implementation

The hybrid dark theme is a resolved design requirement (consensus across five of six reviewers): dark chrome for site structure, slightly lighter surface for article content.

**Tailwind configuration:**

```javascript
// tailwind.config.mjs (theme color excerpt)
export default {
  theme: {
    extend: {
      colors: {
        chrome: {
          DEFAULT: '#1a1a2e',
          light: '#1e1e36',
        },
        surface: {
          DEFAULT: '#242438',
          raised: '#2a2a42',
        },
        text: {
          DEFAULT: '#e8e8f0',
          muted: '#a0a0b8',
          inverse: '#1a1a2e',
        },
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

### System Font Stack

```css
:root {
  --font-body:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
    'Helvetica Neue', sans-serif;
  --font-mono:
    ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
}
```

### Type Scale

| Element       | Size             | Line height | Weight |
| ------------- | ---------------- | ----------- | ------ |
| Body text     | 18px (1.125rem)  | 1.7         | 400    |
| H1            | 36px (2.25rem)   | 1.2         | 700    |
| H2            | 28px (1.75rem)   | 1.3         | 600    |
| H3            | 22px (1.375rem)  | 1.4         | 600    |
| Code (inline) | 15px (0.9375rem) | inherit     | 400    |
| Code (block)  | 15px (0.9375rem) | 1.6         | 400    |
| Small / meta  | 14px (0.875rem)  | 1.5         | 400    |

Mobile adjustment: body text 16px / line-height 1.6 below 640px breakpoint.

### AI Disclosure Component

A standardized footer component displayed at the bottom of every article and build log.

```
---
Drafted with AI assistance. Reviewed and edited by [author name].
Learn more about how we build -> [link to about page]
---
```

The component reads the `author` field from frontmatter. When the author is "Venture Crane" (default), the disclosure omits the name. When a specific author is credited, the name is displayed.

### WordPress Redirect Audit Process

Pre-launch task:

1. Query `site:venturecrane.com` on Google to identify all indexed URLs.
2. Crawl the current WordPress site for all internal links and published page slugs.
3. Map each discovered URL to the corresponding new URL (or to homepage if no equivalent exists).
4. Encode all mappings in the `_redirects` file using Cloudflare Pages redirect syntax.
5. Verify redirects work on a preview deployment before DNS cutover.
6. After DNS cutover, monitor Cloudflare Web Analytics for 404 spikes and add missed redirects.

### Mobile Navigation

Breakpoint: 640px (Tailwind `sm:`).

Above 640px: horizontal nav with all four items visible (Home, Portfolio, Methodology, Articles).

Below 640px: CSS-only collapsed menu using `<details><summary>` element pattern. No JavaScript required. The `<summary>` element renders as a hamburger icon. The `<details>` open state displays the nav items vertically. Supported in all modern browsers (Safari 12+, Chrome 70+, Firefox 49+, Edge 79+) and degrades gracefully.

### RSS Feed

A single RSS feed (`/feed.xml`) that includes both articles and build logs, sorted by date (newest first). Articles and logs are interleaved chronologically. Full content, not excerpts.

Implementation: Astro's `@astrojs/rss` package, configured to merge both collections and sort by date.

---

## 11. Proposed Data Model

Astro Content Collections use Zod schemas defined in `src/content/config.ts`.

### Articles Collection

```typescript
import { defineCollection, z } from 'astro:content'

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().max(160),
    author: z.string().default('Venture Crane'),
    tags: z.array(z.string()).optional(),
    updatedDate: z.coerce.date().optional(),
    repo: z.string().url().optional(),
    draft: z.boolean().default(false),
    ogImage: z.string().optional(),
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

### Build Logs Collection

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

Build logs intentionally omit `description`, `author`, `repo`, `updatedDate`, and `ogImage`. They are short-form, date-driven entries. The first paragraph of the markdown body serves as the implicit preview.

### Pages Collection

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

The `pages` collection holds the about/methodology page. At MVP, this collection contains a single file (`about.md`).

---

## 12. API Surface

### Phase 0: No API Endpoints

The site is fully static. There are no Worker endpoints, no form handlers, and no dynamic routes at launch.

### Phase 1 API (Post-Launch, Trigger-Gated)

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
  (Idempotent -- does not reveal whether email already exists)

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

**Rate limiting:** 3 requests per IP per hour, enforced via Cloudflare's built-in rate limiting rules.

**Privacy:** No tracking, no cookies, no third-party data sharing. Email stored in D1 only. Unsubscribe link in every sent email. Compliant with CAN-SPAM.

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

**Implementation:** Same Worker, Resend integration. Sends email to a configured recipient address. No data storage beyond email delivery.

---

## 13. Non-Functional Requirements

All values are concrete, measurable, and testable in CI.

### Performance

| Metric                          | Target                                  | Measurement                                                               |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Lighthouse Performance score    | >= 95                                   | Lighthouse CI in GitHub Actions, every PR                                 |
| Lighthouse Accessibility score  | >= 95                                   | Lighthouse CI in GitHub Actions, every PR                                 |
| Lighthouse Best Practices score | >= 95                                   | Lighthouse CI in GitHub Actions, every PR                                 |
| Lighthouse SEO score            | 100                                     | Lighthouse CI in GitHub Actions, every PR                                 |
| Time to First Meaningful Paint  | < 1 second on simulated 3G              | Lighthouse CI with `--throttling-method=simulate`                         |
| Total page weight (HTML + CSS)  | < 50 KB gzipped (homepage)              | Build output size check                                                   |
| Client-side JavaScript          | 0 bytes                                 | Build output audit (no `.js` files in `dist/`) except CF analytics beacon |
| External network requests       | 0 at page load (excluding CF analytics) | No fonts, no CDN resources, no third-party scripts                        |
| Time to Interactive             | < 1 second on simulated 3G              | Lighthouse CI                                                             |
| Cumulative Layout Shift         | < 0.05                                  | Lighthouse CI                                                             |

### Accessibility

| Requirement                      | Standard                                                                | Verification                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| WCAG conformance level           | 2.1 AA                                                                  | Lighthouse accessibility audit + manual review                                                    |
| Color contrast (normal text)     | >= 4.5:1                                                                | Automated contrast check against theme colors                                                     |
| Color contrast (large text / UI) | >= 3:1                                                                  | Automated contrast check                                                                          |
| Focus indicators                 | Visible on all interactive elements, custom-styled for dark backgrounds | Tab through every page; focus must be visible against both chrome and article surface backgrounds |
| Touch targets                    | >= 44x44 CSS pixels                                                     | Manual review during PR                                                                           |
| Syntax highlighting contrast     | All Shiki token types >= 4.5:1 against code block background            | Manual verification of chosen theme                                                               |
| HTML `lang` attribute            | `lang="en"` on `<html>`                                                 | Lighthouse audit                                                                                  |
| Motion                           | `prefers-reduced-motion` respected                                      | Manual review if any motion is added                                                              |
| Table semantics                  | `<th>`, `scope` attributes on markdown-generated tables                 | Verify Astro output; add remark plugin if needed                                                  |
| Heading hierarchy                | Single `<h1>` per page, no skipped levels                               | Lighthouse audit                                                                                  |
| Image alt text                   | Required for all content images                                         | Build-time linting                                                                                |
| Skip navigation link             | Present on all pages                                                    | Manual review                                                                                     |
| Color independence               | Information not conveyed by color alone. Status badges use text labels. | Review with grayscale filter                                                                      |

### Security

| Requirement             | Implementation                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| HTTPS                   | Enforced by Cloudflare (automatic)                                 |
| Content Security Policy | Defined in `_headers` file (see below)                             |
| X-Content-Type-Options  | `nosniff` in `_headers`                                            |
| X-Frame-Options         | `DENY` in `_headers`                                               |
| Referrer-Policy         | `strict-origin-when-cross-origin` in `_headers`                    |
| Permissions-Policy      | `camera=(), microphone=(), geolocation=()` in `_headers`           |
| No inline scripts       | Enforced by CSP; Shiki generates inline CSS for syntax tokens only |
| Dependency audit        | `npm audit` in CI, fail on high/critical vulnerabilities           |

### Content Security Policy (Phase 0)

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

- `'unsafe-inline'` for `style-src` is required because Shiki generates inline `style` attributes for syntax highlighting tokens. Shiki does not inject `<script>` tags, so `script-src` remains strict.
- `static.cloudflareinsights.com` is the Cloudflare Web Analytics beacon host.
- `frame-ancestors 'none'` prevents iframe embedding.
- No `'unsafe-eval'` anywhere. No external font or image sources.

### Complete `_headers` File

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

### Build and Deploy

| Requirement                     | Target                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| Build time                      | < 30 seconds for initial build, < 10 seconds incremental                |
| Deploy time                     | < 60 seconds (Cloudflare Pages)                                         |
| PR preview deployments          | Automatic for every PR via Cloudflare Pages                             |
| CI pipeline                     | Build + Lighthouse CI + deploy, triggered on push to `main` and all PRs |
| Lighthouse CI failure threshold | Fail the build if any Lighthouse category drops below 90                |

---

## 14. Platform-Specific Design Constraints

The primary platform is the web, optimized for mobile-first responsive design. No native app component and no platform-specific APIs.

### Dark Theme Specification (Resolved)

The panel reached consensus across five of six reviewers on a hybrid dark theme: dark chrome for site structure, slightly lighter surface for article reading.

**Color baseline (requires contrast verification before implementation):**

| Surface               | Value                                       | Usage                                                          |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Site chrome           | `#1a1a2e`                                   | Header, footer, homepage background, portfolio page background |
| Article surface       | `#242438`                                   | Article body, build log body, methodology page body            |
| Primary text          | `#e8e8f0`                                   | Body text, headings                                            |
| Secondary text        | TBD (reduced opacity or lighter variant)    | Dates, reading time, meta text                                 |
| Code block background | TBD (distinct from article surface)         | Code blocks within articles                                    |
| Accent color          | TBD (must differentiate VC from SC and DFG) | Links, status badges, hover states                             |

**Implementation:** All color values defined as CSS custom properties from day one (enables future light theme without stylesheet restructuring). Exposed as Tailwind theme colors.

### Typography

- **Font strategy:** System fonts only. No web fonts, no CDN dependencies. Key variable for the 1-second TTFMP target on 3G.
- **Body:** System font stack
- **Code:** System monospace stack
- **Type scale:** 18px/1.7 body desktop, 16px/1.6 body mobile, modular 1.25 heading ratio, 14-15px code, 14px meta text
- **Content width:** 680px maximum (~70 characters at 18px body text)

### Responsive Breakpoints

| Breakpoint     | Behavior                                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| < 640px        | Mobile layout: stacked content, collapsed nav, 16px body text, full-width cards |
| 640px - 1024px | Tablet: expanded nav, 18px body text, content centered with side margins        |
| > 1024px       | Desktop: same as tablet, generous whitespace on sides of content column         |

### OG Image Strategy

- **Phase 0:** Static site-wide OG image for all pages using the VC wordmark and tagline. 1200x630px PNG.
- **Phase 1+:** Per-article OG images generated at build time (article title rendered on branded template via `astro-og-canvas` or equivalent). The `ogImage` frontmatter field is in the schema now for manual override.

### Interaction Patterns

**Content Reading:** Optimized for sustained reading of 1,000-3,000 word technical articles with code blocks, tables, and images. Content width 680px maximum. Code blocks use horizontal scroll for long lines with visible scroll indicator on mobile.

**Tables:** Horizontal scroll within a container for tables wider than the viewport. Visible scroll indicator (shadow or fade) on the right edge. Semantic markup with proper `<th>`, `<caption>`, and `scope` attributes.

**Portfolio Cards:** Live venture cards have hover state and external link icon. Pre-launch cards have no hover state change, no link, and default cursor.

**External Links:** All links that leave venturecrane.com open in a new tab (`target="_blank"` with `rel="noopener noreferrer"`) and display a subtle external link icon.

---

## 15. Success Metrics & Kill Criteria

### Launch Metrics (Phase 0 Gate)

All six must pass before Phase 0 is considered complete:

| Metric                          | Target                                      | Measurement               |
| ------------------------------- | ------------------------------------------- | ------------------------- |
| Site live on venturecrane.com   | Yes                                         | DNS resolves, HTTPS works |
| Content published at launch     | 3 articles + methodology page + 1 build log | Content audit             |
| Lighthouse performance score    | >= 95 on all pages                          | Lighthouse CI             |
| Mobile/tablet/desktop rendering | Correct on all three                        | Manual verification       |
| Build time                      | < 30 seconds                                | CI build logs             |
| Runtime errors                  | Zero                                        | Static site -- no runtime |

### Growth Metrics (Measured from Phase 1, Reviewed Monthly)

| Metric                                    | 6-Month Benchmark                         | Source                   |
| ----------------------------------------- | ----------------------------------------- | ------------------------ |
| Monthly unique visitors                   | 2,000                                     | Cloudflare Web Analytics |
| HN front page appearances                 | 2 articles                                | Manual tracking          |
| RSS subscribers                           | 200                                       | Feed analytics           |
| Article page views vs. homepage views     | Articles > homepage                       | Cloudflare Web Analytics |
| Portfolio click-through rate              | 10%+ of homepage visitors                 | Cloudflare Web Analytics |
| Referral traffic from venture sites to VC | Measurable                                | Cloudflare Web Analytics |
| Content cadence adherence                 | 1 article/month + build logs for 3 months | Content audit            |

### Trigger Metrics (Evidence-Based Feature Gates)

| Trigger                 | Threshold                        | Action                                          |
| ----------------------- | -------------------------------- | ----------------------------------------------- |
| Monthly unique visitors | > 1,000 for 2 consecutive months | Evaluate adding email newsletter signup         |
| Article count           | > 20                             | Evaluate adding search and tag-based filtering  |
| Content cadence failure | < 1 article in any 6-week window | Revisit content strategy before adding features |

### Competitive Benchmarks

| Metric                       | First Checkpoint (3 months) | Growth Target (6 months)  |
| ---------------------------- | --------------------------- | ------------------------- |
| Monthly unique visitors      | 500                         | 2,000                     |
| HN front page appearances    | 1                           | 2                         |
| RSS subscribers              | 50                          | 200                       |
| Portfolio click-through rate | Measurable                  | 10%+ of homepage visitors |

### Kill Criteria

- If the site cannot ship within 2 weeks of development start, scope must be cut immediately. The site is the easy part; content is the bottleneck. If engineering is the bottleneck, something is wrong.
- If content cadence falls below 1 article per 6-week window for 2 consecutive periods post-launch, pause feature development and either recommit to content or archive the site. An empty content site is worse than no site.
- If monthly unique visitors do not reach 500 within 3 months of active publishing and distribution, revisit the audience acquisition strategy. This does not mean kill the site -- it means the distribution plan is failing and must change.

### Business Case

**Cost of the Status Quo:** The current site describes services that migrated to another venture, has no content, and actively misrepresents the enterprise.

**Strategic Return:**

1. Credibility -- a well-built content site demonstrating the AI-driven methodology is the most credible proof that the methodology works.
2. Portfolio visibility -- the hub function connects all ventures under a single narrative.
3. Content platform -- technical content about AI-assisted development builds long-term audience equity.
4. Competitive timing -- the organizational/portfolio perspective is unoccupied.

**Investment Summary:**

| Category                          | Cost                                            |
| --------------------------------- | ----------------------------------------------- |
| Infrastructure (hosting, DNS, CI) | ~$0/month (Cloudflare free tier)                |
| Build sprint                      | 1-2 weeks of agent + founder time               |
| Ongoing content production        | ~8-12 hours/month (founder review + editing)    |
| Ongoing distribution              | ~2-4 hours/month (founder posting + engagement) |

---

## 16. Risks & Mitigations

### Product Risks

| #   | Risk                                                                                                 | Impact                                                  | Likelihood | Mitigation                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Content bottleneck** -- articles take longer to write than the site takes to build                 | Site launches empty or goes stale; audience never forms | High       | Launch articles are identified. Build logs provide lower-cost publishing. 3-month review checkpoint with explicit kill criterion.                          |
| R2  | **Distribution failure** -- content is published but no one sees it                                  | Site has zero traffic despite good content              | Medium     | Distribution plan specifies channels, launch amplification, and portfolio cross-linking. Founder owns distribution personally.                             |
| R3  | **Scope creep** -- features expand beyond the static site MVP                                        | Delays launch past the 2-week window                    | High       | PRD excludes all dynamic features from Phase 0. Kill criterion: if the site cannot ship in 2 weeks, cut scope. Feature additions gated by trigger metrics. |
| R4  | **Overclaiming** -- "product factory" positioning sets expectations the portfolio cannot yet support | Loss of credibility, HN backlash                        | Medium     | Content quality criterion #3 (honest limitations) and criterion #4 (HN-survivable). Portfolio page uses honest status badges.                              |
| R5  | **Dark theme readability** -- dark color scheme degrades long-form reading                           | Readers leave articles early                            | Medium     | Hybrid theme (dark chrome, lighter article surface). CSS custom properties enable rapid adjustment. WCAG AA contrast enforced.                             |
| R6  | **Competitive displacement** -- established voices publish similar content                           | Audience captured by incumbents                         | Low        | VC's organizational/portfolio perspective is structurally different. Launch content selected by competitive gap. 3-month checkpoint.                       |
| R7  | **WordPress migration disruption** -- DNS cutover breaks existing links                              | Brief period of broken URLs                             | Low        | Audit WordPress URLs before cutover. `_redirects` file. Simple DNS switch.                                                                                 |
| R8  | **Content sensitivity** -- publishing operational details exposes security-relevant info             | Security or competitive risk                            | Low        | Content review checklist. Founder has final editorial approval.                                                                                            |

### Technical Risks

| #    | Risk                                                                 | Severity | Likelihood | Mitigation                                                                                                                 |
| ---- | -------------------------------------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| TR-1 | WordPress redirect coverage is incomplete after DNS cutover          | Medium   | High       | Audit all indexed WordPress URLs before cutover. Catch-all redirect to homepage as fallback.                               |
| TR-2 | Chosen Shiki theme fails WCAG AA contrast for some token types       | Low      | Medium     | Verify every token type before committing. Budget 2-4 hours for customization. Test `tokyo-night` and `github-dark` first. |
| TR-3 | Markdown-generated tables lack proper semantic HTML                  | Low      | Medium     | Test Astro's default rendering early. Add remark plugin if needed. 1-2 hour fix.                                           |
| TR-4 | Content authoring friction slows publishing velocity                 | Medium   | Medium     | Test the authoring workflow end-to-end before launch. Document in `CONTRIBUTING.md`.                                       |
| TR-5 | OG image renders poorly on specific platforms                        | Low      | Low        | Test on X Card Validator, LinkedIn Post Inspector, Facebook Sharing Debugger. Use 1200x630px PNG.                          |
| TR-6 | CSS-only mobile navigation fails on specific browser/OS combinations | Low      | Low        | Test on Safari iOS, Chrome Android, Firefox. Budget 2 hours for testing.                                                   |
| TR-7 | Build time exceeds 30 seconds as content volume grows                | Low      | Low        | At expected volume (< 100 articles in year one), not a concern. Monitor in CI.                                             |

### Competitive Risks (Uncomfortable Truths)

1. **The audience is real but tiny, and VC starts at zero.** Willison's 500K+ visitors and Latent Space's 10M+ reach prove demand exists. But VC launches with zero followers, zero domain authority, zero backlinks. The cold-start problem is severe. Content quality is necessary but not sufficient.

2. **The "multi-product factory" claim is aspirational relative to the portfolio.** One launched product (DFG), one active (KE), one in development (DC), and a lab (SC) is technically "multi-product" but modest compared to Pieter Levels (40+ products). Mitigated by content depth -- one deeply specific article about cross-venture coordination is more credible than a portfolio page with four cards.

3. **Sole-author dependency is an unresolvable structural risk.** Every piece of content depends on one human founder. There is no contributor pipeline, no guest post model, no editorial team. Partially mitigated by build logs (lower production cost) and AI-assisted drafting, but the dependency is real.

4. **Distribution strategy depends on channels VC does not control.** HN submission success is unpredictable. X reach depends on follower count VC does not have. Portfolio cross-linking is the one distribution channel VC fully controls, but it produces trickle traffic, not launch spikes.

5. **"Build in public" fatigue is real.** Growing skepticism toward build-in-public as performative or self-serving. Mitigated by content substance -- operational data, failure retrospectives, and real cost breakdowns transcend the label. But the label itself may cause some potential readers to dismiss the site before reading.

---

## 17. Open Decisions / ADRs

### Resolved Decisions

| ID          | Decision                     | Resolution                                                           | Source                                                      |
| ----------- | ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| OD-001      | Repo location                | Separate repo: `venturecrane/vc-web`                                 | Consensus across all reviewers                              |
| OD-003      | Analytics at launch          | Cloudflare Web Analytics, enabled at Phase 0                         | Business Analyst, Product Manager, Technical Lead consensus |
| UI-001      | Dark theme commitment        | Hybrid: dark chrome + lighter article surface, CSS custom properties | 5 of 6 reviewers endorsed                                   |
| CONTENT-001 | Article authorship and voice | AI-drafted, human-reviewed, transparent disclosure at footer         | All reviewers converged                                     |

### Still Open

**OD-002: DNS Migration Timing**

The site deploys to a `.pages.dev` staging URL first. DNS cutover to venturecrane.com happens when the site passes all launch metrics. The open question: does the WordPress site stay live during the build sprint (parallel operation), or does it go dark immediately?

Recommendation: Keep WordPress live until the new site passes all launch metrics and the `_redirects` file is in place. Then cut over DNS and archive WordPress.

Needs: Founder decision on timing preference. Low-stakes -- either approach works.

**OD-004: Content Ownership and Licensing**

The PRD does not specify content licensing. If the build-in-public content is meant to be freely shared and referenced, an explicit license (e.g., CC BY 4.0) should be stated. If content is proprietary, state that in the footer/terms.

Recommendation: CC BY 4.0 for articles and build logs. Code snippets within articles are MIT-licensed.

Needs: Founder decision. Add to privacy/terms page at launch.

**OD-005: Brand Identity Minimum (Blocking)**

Development cannot begin without: primary color, accent color, and wordmark (text-based is acceptable). System fonts resolve the typography question. Shiki syntax highlighting theme is chosen after the color palette. The current placeholder accent color is `#6366f1` (indigo).

Needs: 30-minute founder decision before sprint starts.

**OD-006: Shiki Theme Selection**

Recommended: `github-dark` or `tokyo-night` (verify WCAG AA contrast for all token types against code block background). Depends on OD-005 brand kit decision.

Needs: Technical decision after brand palette is established.

---

## 18. Phased Development Plan

### Phase 0: Foundation and Launch (Weeks 1-2)

Phase 0 ends when the site is live on venturecrane.com with all launch metrics passing.

**Infrastructure:**

- Initialize Astro 5 project in `venturecrane/vc-web`
- Cloudflare Pages deployment with `.pages.dev` staging URL
- Tailwind CSS with hybrid dark theme (CSS custom properties)
- GitHub Actions CI pipeline: lint, format, typecheck, build, Lighthouse CI
- Cloudflare Web Analytics enabled
- Content Security Policy via `_headers` file
- PR preview deployments enabled

**Site structure (all features):**

- F-005: Navigation and layout (header, footer, responsive, mobile nav at 640px breakpoint)
- F-002: Article pages (markdown rendering, Shiki syntax highlighting, metadata, reading time, AI disclosure footer, prev/next navigation)
- F-007: Build log pages (simpler layout, chronological feed at `/log`)
- F-004: Methodology/about page (500-word overview, founder section, section anchors, links to methodology articles as published)
- F-001: Homepage (hero, portfolio section, recent articles, recent build logs)
- F-003: Portfolio page (venture cards with status badges, live/pre-launch card states)
- F-006: RSS feed (full content, articles + build logs, via `@astrojs/rss`)
- F-008: 404 page (links to article index and homepage)

**Content:**

- 3 launch articles (specified in Section 8)
- Methodology/about page content (500 words)
- Portfolio data populated
- At least 1 build log entry

**SEO and meta:**

- Sitemap.xml (Astro built-in)
- robots.txt
- Open Graph and Twitter Card meta tags on all pages
- Static site-wide OG image with VC wordmark and tagline
- Semantic HTML with proper heading hierarchy
- Canonical URLs

**Accessibility (built in, not retrofitted):**

- WCAG 2.1 AA compliance
- Custom focus indicators (visible on dark backgrounds)
- Syntax highlighting theme verified for WCAG contrast
- 44x44px minimum touch targets
- `lang="en"` on HTML element
- `prefers-reduced-motion` respected
- Keyboard navigable, skip-to-content link

**Launch:**

- WordPress URL audit and `_redirects` file
- DNS cutover: venturecrane.com to Cloudflare Pages
- WordPress site archived on Hostinger

**Phase 0 Deliverables Checklist:**

| #    | Deliverable                                                          | Acceptance Criterion                                                              |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D-01 | Repository `venturecrane/vc-web` created with Astro 5 + Tailwind CSS | `npm run build` succeeds with zero errors                                         |
| D-02 | Content Collection schemas (articles, logs, pages)                   | TypeScript compilation passes; invalid frontmatter causes build failure           |
| D-03 | Homepage (`/`)                                                       | Renders with portfolio preview, recent articles, recent logs                      |
| D-04 | Article listing (`/articles`) and individual article pages           | All non-draft articles render; frontmatter metadata displayed                     |
| D-05 | Build log listing (`/log`) and individual log pages                  | Reverse-chronological; lighter visual treatment than articles                     |
| D-06 | About page (`/about` or `/methodology`)                              | Renders `content/pages/about.md`; includes founder section; shows `updatedDate`   |
| D-07 | Portfolio page (`/portfolio`)                                        | Renders venture cards; live ventures link out; pre-launch ventures show status    |
| D-08 | Custom 404 page                                                      | Links to homepage and article index; matches site design                          |
| D-09 | RSS feed (`/feed.xml`)                                               | Valid RSS 2.0; includes full content from both articles and logs                  |
| D-10 | Navigation + responsive layout                                       | Desktop horizontal nav; mobile CSS-only collapsed nav at < 640px                  |
| D-11 | Dark hybrid theme                                                    | Chrome background #1a1a2e; article surface #242438; all text passes WCAG AA       |
| D-12 | Syntax highlighting (Shiki)                                          | Code blocks render with chosen dark theme; all tokens pass 4.5:1 contrast         |
| D-13 | AI disclosure component                                              | Appears at bottom of every article and log entry                                  |
| D-14 | OG metadata + default image                                          | Correct `og:title`, `og:description`, `og:image` on all pages                     |
| D-15 | `_headers` file with CSP and security headers                        | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| D-16 | `_redirects` file for WordPress URLs                                 | All known WordPress URLs redirect appropriately                                   |
| D-17 | Cloudflare Web Analytics                                             | Enabled in CF Pages project settings                                              |
| D-18 | PR preview deployments                                               | Every PR gets a unique preview URL                                                |
| D-19 | GitHub Actions CI pipeline                                           | Build + Lighthouse CI on every push and PR                                        |
| D-20 | Lighthouse scores >= 95 (all categories)                             | CI enforced on every PR                                                           |
| D-21 | 3 launch articles + at least 1 build log entry                       | Content authored, reviewed, and deployed                                          |

### Phase 1: Growth (Months 1-3 Post-Launch)

Phase 1 is content-focused. Engineering work is minimal and serves content production and distribution.

- Sustain publishing cadence: 1 article/month + 2-4 build logs/month
- Execute distribution plan for each published article
- Portfolio cross-linking deployed on venture sites
- Per-article OG images (build-time generation)
- `updatedDate` display on articles and narrative pages
- "Last updated" timestamps on methodology and portfolio pages
- Recent articles in site footer
- Light theme option (CSS custom properties make this a config change)
- Monthly review of growth metrics
- 3-month checkpoint: evaluate content strategy, distribution effectiveness, and audience traction

### Phase 2: Triggered Features (Post-3-Month Checkpoint)

Features enter scope only when their trigger metrics are met:

- Email newsletter signup (trigger: 1,000 monthly visitors for 2 consecutive months)
- Search and tag filtering (trigger: 20+ articles)
- Contact page with form
- Per-article author attribution (if team grows beyond founder)
- Social sharing improvements
- Related articles component

### Explicitly Out of Scope (All Phases)

- User accounts or authentication
- Payment flows
- Dynamic experiments or A/B testing
- Comments system
- CMS admin panel
- Multimedia/podcast (valid idea, separate initiative)

---

## 19. Glossary

| Term                         | Definition                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Venture Crane (VC)**       | The product factory and governance layer within SMDurgan, LLC. Sits above all portfolio ventures.                                                    |
| **Silicon Crane (SC)**       | Validation lab venture within the VC portfolio. Services revenue model.                                                                              |
| **Durgan Field Guide (DFG)** | Launched product venture within the VC portfolio.                                                                                                    |
| **Kid Expenses (KE)**        | Active product venture within the VC portfolio.                                                                                                      |
| **Draft Crane (DC)**         | Product venture in development within the VC portfolio.                                                                                              |
| **Build log**                | Short-form (200-1000 word) dated operational update. Lower bar than articles. Published at `src/content/logs/`.                                      |
| **Article**                  | Long-form (1000-3000 word) deep technical or operational content. Must meet all four content quality criteria. Published at `src/content/articles/`. |
| **Narrative page**           | Evergreen content page (e.g., methodology/about). Published at `src/content/pages/`.                                                                 |
| **Hybrid dark theme**        | Design approach using dark chrome (header, footer, homepage) with a slightly lighter surface for article reading areas.                              |
| **Content Collection**       | Astro's typed content management system using Zod schemas for frontmatter validation.                                                                |
| **SSG**                      | Static Site Generation. All pages are pre-rendered at build time with no server-side or client-side rendering.                                       |
| **Phase 0**                  | The initial build and launch sprint (Weeks 1-2). The site goes from zero to live.                                                                    |
| **Phase 1**                  | Post-launch growth period (Months 1-3). Content-focused with minimal engineering.                                                                    |
| **Phase 2**                  | Triggered feature additions gated by evidence-based metrics.                                                                                         |
| **Trigger metric**           | A measurable threshold that, when met, unlocks a specific feature for implementation (e.g., 1,000 monthly visitors unlocks email capture).           |
| **Kill criterion**           | A measurable condition that, when met, requires pausing investment or archiving the site.                                                            |
| **Content quality bar**      | The four-criteria standard every article must meet: artifact test, specificity test, honesty test, HN survival test.                                 |
| **HN survival test**         | Quality criterion: would this article receive substantive engagement (not accusations of content marketing) if submitted to Hacker News?             |
| **CSP**                      | Content Security Policy. HTTP header controlling which resources the browser may load.                                                               |
| **OG image**                 | Open Graph image displayed when a URL is shared on social platforms.                                                                                 |
| **Shiki**                    | Build-time syntax highlighting engine used by Astro. Generates styled HTML with zero client-side JavaScript.                                         |
| **Cloudflare Web Analytics** | Privacy-friendly, cookie-free analytics service integrated with Cloudflare Pages.                                                                    |

---

## Appendix: Unresolved Issues

This appendix collects all unresolved items from the final round of the 6-agent review, deduplicated and organized by category.

### UI-1: Per-Article OG Images at Launch

**Status:** Disagreement on timing.

The UX Lead adopted per-article OG images at Phase 0 in their final contribution, arguing that social sharing is the primary distribution channel and link previews are the primary conversion surface. The Technical Lead and Competitor Analyst recommend deferring to a static site-wide OG image at Phase 0 with per-article generation at Phase 1 or Phase 2, citing build pipeline complexity within the 2-week timeline.

The PRD adopts the majority position: static site-wide OG image at Phase 0, per-article generation at Phase 1. The `ogImage` frontmatter field is in the schema now, so no content migration is needed when generation is added.

**Decision needed:** If the founder strongly values per-article OG images at launch, budget an additional 4-6 hours in the sprint. Otherwise, ship with the static image.

### UI-2: Brand Kit Minimum (Blocking)

**Status:** Blocking prerequisite for development.

The Technical Lead and Product Manager both identified that a primary color, accent color, and wordmark must be decided before development starts. Three rounds of review passed without this decision being made. The current placeholder accent color (`#6366f1` indigo) is functional but not branded. The color baseline (`#1a1a2e` chrome, `#242438` surface, `#e8e8f0` text) requires contrast verification.

**Decision needed:** 30-minute founder session to select primary color, accent color, and wordmark treatment.

### UI-3: Methodology Page Scope at Launch

**Status:** Directional consensus, scope ambiguity.

All reviewers agree the methodology page ships at launch. The Target Customer recommends a lean 500-word overview. The Product Manager endorsed the lean approach. The Competitor Analyst identifies methodology as the primary differentiator, suggesting more depth. The PRD specifies approximately 500-800 words at launch, growing through linked articles.

**Decision needed:** Founder decision on word count and scope. Directly affects launch timeline and content authoring effort.

### BIZ-1: Silicon Crane Relationship and Revenue Attribution

**Status:** Raised by Business Analyst in two rounds. No other reviewer addressed it.

The PRD does not state whether the VC website plays any role in Silicon Crane's client acquisition pipeline. SC is the only venture with a services revenue model. If the portfolio page or methodology content drives indirect SC awareness, "visits to SC from VC referral" should be a tracked growth metric. If SC client acquisition is fully independent, the VC site has no revenue-adjacent function.

Product Manager's position: the VC site is not an SC sales funnel, but the portfolio page inherently creates SC visibility. Track organic referral traffic without designing for it.

**Decision needed:** Founder confirmation. Affects metric definition and portfolio page design.

### BIZ-2: Tagline Finalization

**Status:** Competing options, no blocking impact.

The current tagline is "The product factory that shows its work." The Competitor Analyst and Target Customer proposed "How one person and a team of AI agents build real software" as a reader-centric alternative. The Product Manager treats this as a post-PRD copywriting exercise.

**Decision needed:** Founder review before OG image and homepage hero are finalized. Does not block development -- the tagline can be updated with a single commit.

### BIZ-3: Content Cadence Sustainability

**Status:** Plan defined, commitment unconfirmed.

The panel agreed on 1 article/month plus build logs with a 3-month checkpoint. No reviewer has directly confirmed that the founder can commit to this. The sole-author dependency is structural and no round produced a mitigation beyond the checkpoint. If the answer is "no, I cannot sustain monthly articles," the content strategy needs reworking before development begins.

**Decision needed:** Founder commitment to the cadence, or an alternative plan.

### BIZ-4: Content Ownership and Licensing

**Status:** Not addressed by most reviewers.

The PRD does not specify content licensing. Recommendation: CC BY 4.0 for articles and build logs, MIT for code snippets.

**Decision needed:** Founder decision. Add to privacy/terms page at launch.

### BIZ-5: "Build in Public" Framing vs. Audience Skepticism

**Status:** Acknowledged but unresolved.

The panel acknowledged build-in-public fatigue but did not resolve whether the site should use the phrase "build in public" prominently or avoid it in favor of less loaded language (e.g., "operational transparency," "showing the work"). The content quality criteria mitigate risk at the article level, but site-level framing has not been tested against audience skepticism.

**Decision needed:** Founder positioning decision on whether to use the phrase explicitly.

### TECH-1: Email Capture Trigger Threshold

**Status:** Consensus on Phase 1 timing, disagreement on threshold.

The Product Manager set the trigger at 1,000 monthly visitors for 2 consecutive months. The Technical Lead favors a lower threshold (500 visitors for 1 month) or a time-based fallback (build it 3 months post-launch regardless). Technical cost is 2-4 hours. RSS is the retention mechanism at launch.

**Decision needed:** Founder decision on trigger threshold. Product judgment, not a technical call.

### TECH-2: DNS Migration Timing

**Status:** Low-stakes, requires founder preference.

Recommendation: keep WordPress live until the new site passes all launch metrics and `_redirects` file is in place.

**Decision needed:** Founder decision on timing.

### TECH-3: Launch Article Selection (Articles 2 and 3)

**Status:** Strong consensus on Article 1; two competing slates for Articles 2 and 3.

The Target Customer proposed a cost breakdown and origin story. The Competitor Analyst proposed a failure article and methodology overview. Both slates overlap but differ in emphasis. The Business Analyst and Product Manager favor the Target Customer's slate (cost breakdown + origin story) as the most differentiating combination.

**Decision needed:** Founder decision on article topics and willingness to publish real cost data.
