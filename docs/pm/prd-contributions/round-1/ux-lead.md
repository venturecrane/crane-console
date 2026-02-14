# UX Lead Review -- Venture Crane Website PRD v0.1

**Reviewer:** UX Lead
**Date:** 2026-02-13
**PRD Version:** 0.1 (Initial Draft)
**Review Round:** 1

---

## 1. Strengths

The PRD demonstrates several strong UX instincts that will serve the project well:

**Content-first philosophy is correct.** Principle #1 (Section 5) -- "Content is the product" -- is the single most important design decision for a site like this. The PRD correctly recognizes that every design and engineering decision should optimize for reading experience. This keeps the team focused on what actually matters to every persona.

**Personas are realistic and well-bounded.** The three personas in Section 3 (Alex, Jordan, Sam) cover distinct intent patterns without inflating the audience. The behavioral descriptions are particularly useful -- "Does not sign up for anything" (Alex), "Leaves within 5 minutes" (Sam). These constrain design scope productively and prevent the team from building features for imaginary users.

**The anti-requirements are as valuable as the requirements.** Section 1's "What this is NOT" list and F-001's "What it must NOT have" list are excellent UX guardrails. Explicitly excluding pricing, signup forms, testimonials, stock photos, newsletter modals, and account systems removes the most common sources of UX friction on marketing sites. This is disciplined.

**Typography specifications are unusually thoughtful.** Section 14 specifies ~70ch max width, 1.6-1.75 line height, syntax highlighting, and horizontal scroll for code blocks. These are not generic statements; they reflect someone who has thought about the reading experience for technical long-form content. The PRD goes further than most by identifying tables on mobile as a specific concern.

**Flat information architecture is appropriate for the content volume.** The IA in Section 9 is deliberately simple -- no nested routes, no categories, no pagination. For a site launching with 3-5 articles, this is exactly right. Over-structuring sparse content is a common mistake the PRD avoids.

---

## 2. User Journey Analysis

### 2.1 What the journeys get right

The three MVP journeys in Section 7 map cleanly to the three personas. Each journey is described as a sequence of concrete actions, not abstract goals. The journeys are appropriately short -- no one is expected to spend 30 minutes on the site or complete a seven-step funnel. This is honest about what a content site's user behavior actually looks like.

### 2.2 Missing and incomplete journey states

**No error or dead-end states are defined.** What happens when a user lands on a broken link, a draft article URL, or a path that does not exist? The PRD does not mention a 404 page. For a content site where articles will be shared as direct URLs on social media and Hacker News, the 404 experience is not an edge case -- it is a primary surface. If a URL gets shared before the article is published, or if a slug changes, users will hit this page. Recommendation: Add a 404 page to F-005 or as its own feature. It should help the user find content (link to articles index, homepage) rather than presenting a dead end.

**Journey 1 has a gap at the return-visit step.** Step 6 says the user "Returns when the next article is published (via direct URL, RSS, or social)." But the PRD provides no mechanism for the user to know a new article exists except RSS (F-006) and social media (external). There is no "latest articles" indicator visible from any page except the homepage. If Alex bookmarks `/methodology` or an article page, they have no way to discover new content without navigating to the homepage or checking RSS. Recommendation: Consider showing 2-3 recent article links in the footer or a "Latest" indicator in the header navigation. This is low-cost and helps repeat visitors without adding a newsletter system.

**No journey exists for the user who arrives at the wrong page.** All three journeys assume the user either lands on an article page (Journeys 1 and 3) or the homepage (Journey 2). What about the user who lands on `/portfolio` via a search engine or shared link? Or `/methodology`? These pages need to be self-sufficient entry points, not just destinations from the homepage. Each page should provide enough context about Venture Crane that a first-time visitor is not confused. Recommendation: Every page should include a brief site identity element (already handled by the persistent header in F-005) AND enough contextual introduction that it works as a landing page.

**The transition from VC site to product sites is undefined.** Journey 3 (Jordan) includes "Clicks through to a product site (DFG, SC) to see the output." This is a critical UX moment -- the user is leaving venturecrane.com for an entirely different site with potentially different design, navigation, and brand identity. How is this transition communicated? Does the link open in a new tab? Is there any visual indication that the user is leaving VC? The PRD's portfolio cards (F-003) mention linking to external product sites but do not address the transition experience. Recommendation: External venture links should open in a new tab and include a subtle visual indicator (e.g., an external link icon) so the user understands they are leaving the VC site. Each portfolio card should set the expectation: "Visit [product name]" rather than a generic "Learn more."

### 2.3 Journeys that should be added

**Sharing journey.** The build-in-public philosophy depends on content being shared. When Alex shares an article on Hacker News or X, what does the link preview look like? The PRD mentions Open Graph tags in Section 13, but does not specify what the preview content should be. For technical content shared on social platforms, the link preview (title, description, image) is the single most important conversion point. Recommendation: Define the OG image and metadata strategy. Will there be a generic VC OG image, or a per-article image? The article frontmatter (Section 11) includes `description` but no `image` field. Consider adding an optional `ogImage` field or defining a generated OG image strategy (text-based, auto-generated from title).

**RSS reader journey.** The PRD specifies full-content RSS (F-006), which is the right choice. But what does the reading experience look like inside an RSS reader? If articles use custom Tailwind typography classes, those styles will not render in RSS. Code blocks, tables, and diagrams may display poorly. Recommendation: Verify that article HTML output degrades gracefully in RSS readers. Consider a brief note about this in the technical requirements for F-006.

---

## 3. Information Architecture Review

### 3.1 Current IA assessment

The IA in Section 9 is sound for launch:

```
/                    Homepage
/portfolio           Portfolio
/methodology         Methodology
/articles            Article index
/articles/:slug      Individual articles
/feed.xml            RSS
/privacy             Privacy policy
/terms               Terms
```

This is flat, predictable, and human-readable. URLs are clean and will age well.

### 3.2 Scalability concerns

**No tagging or categorization system is designed, even for the future.** The article frontmatter (Section 11) includes an optional `tags` field, but there is no corresponding `/articles/tag/:tag` route or any UI for filtering by tag. This is fine at launch with 3-5 articles, but the PRD does not indicate when or how this would be introduced. Without a plan, tags risk being applied inconsistently from the start, making them useless when filtering is eventually needed. Recommendation: Define a small initial tag vocabulary (5-10 tags) in the PRD and apply them consistently from article one, even if the filtering UI is not built yet. This is a content strategy decision, not a feature decision.

**The methodology page has no growth plan.** Section F-004 notes it "Can be a single long page or split into sub-pages as content grows." This is the most likely page to outgrow its format. The development approach (AI agents, MCP, session lifecycle, fleet operations) could easily fill multiple pages. Without a defined pattern for splitting, the page will either become unwieldy or require a retroactive IA change. Recommendation: Design the methodology page with section anchors and a table of contents from day one. If/when it splits, the sections become sub-pages and the existing anchor links can redirect. This costs nothing now and prevents link rot later.

**No "about the author" or "about the team" concept exists.** The PRD says content is attributed to "Venture Crane" (OD-004), but there is no `/about` page distinct from `/methodology`. A user who wants to know "who is behind this?" -- a natural question for any build-in-public brand -- must piece it together from the methodology page. Recommendation: Consider whether the methodology page should explicitly address the human+AI team composition, even briefly. This is not the same as an "about us" corporate page; it is part of the build-in-public narrative.

### 3.3 Navigation design gaps

**The header navigation in F-005 lists: Home, Portfolio, Methodology, Articles.** This is four items, which is manageable. But the PRD notes "No hamburger menu required at MVP if nav items fit on one line." This conditional needs a defined breakpoint. On a 320px screen, four nav items plus a logo/wordmark may not fit on one line, especially if "Methodology" is the longest label. Recommendation: Either define the breakpoint at which a hamburger menu activates, or shorten the nav labels (e.g., "How We Build" instead of "Methodology") to ensure they fit. Do not leave this to implementation-time guesswork.

---

## 4. Content Strategy Assessment

### 4.1 Content discovery

**The homepage is the only content discovery surface.** Recent articles appear on the homepage (F-001), and there is an article index at `/articles` (Section 9). But there is no cross-linking strategy within articles -- no "related articles" section, no internal linking guidance. For a site whose primary value is content, internal linking is the main mechanism for keeping readers engaged beyond their entry page. Recommendation: Add a "Related articles" section to the article layout (F-002), even if it is just the previous/next navigation already specified. Consider a lightweight manual approach: an optional `relatedArticles` field in frontmatter that references other article slugs.

### 4.2 Content types

**The PRD defines only one content type: articles.** But the methodology page (F-004) is described as "narrative content, not a feature list -- written as prose, possibly with diagrams." This is functionally a different content type from a timestamped article. The portfolio page (F-003) has structured data (venture cards). These are three distinct content types with different authoring, display, and update patterns:

1. **Articles** -- timestamped, sequential, authored in markdown, displayed in reading layout
2. **Narrative pages** -- evergreen, updated over time, no publish date, longer-form
3. **Portfolio data** -- structured, card-based, updated when venture status changes

The PRD handles articles well (frontmatter schema, content collections) and portfolio data adequately (TypeScript interface in Section 11). But the methodology page has no defined content model. Is it a single markdown file? Multiple files stitched together? An Astro page with hardcoded content? Recommendation: Define the content model for the methodology page. If it is markdown, it should be in a `content/pages/` collection separate from `content/articles/`. If it is an Astro page with embedded content, acknowledge that it will be harder for agents to update.

### 4.3 Content voice and authorship

**The unresolved issue CONTENT-001 (AI authorship disclosure) has UX implications.** If the site publishes content "drafted by AI, reviewed by human" but does not disclose this, some readers will feel deceived if they discover it later (and in a build-in-public brand, they likely will). If the site over-discloses, it may undermine credibility. The UX recommendation is to lean into transparency since it is core to the brand. A standardized, subtle disclosure pattern (e.g., a small note at the end of each article: "This article was drafted with AI assistance and reviewed by [human name]") aligns with the build-in-public philosophy and preempts potential backlash. This is not just a content policy decision; it affects the article template design.

### 4.4 Content freshness signals

**The PRD does not address how stale content is handled.** In a build-in-public context, a methodology page last updated 6 months ago sends a signal that the project may be abandoned. Articles are timestamped, which helps. But the methodology and portfolio pages have no visible update indicator. Recommendation: Add a "Last updated" date to the methodology page and the portfolio page. For articles, the publish date is sufficient. This is one line of metadata and communicates active maintenance.

---

## 5. Accessibility Review

### 5.1 What the PRD covers

Section 13 specifies:

- WCAG 2.1 AA compliance
- Keyboard navigability
- Sufficient color contrast (especially with dark theme)
- Alt text on all images
- Skip-to-content link

This is a reasonable baseline. The mention of dark theme contrast as a specific concern is good.

### 5.2 What the PRD misses

**Focus management is not specified.** For a keyboard-navigable site, focus indicators must be visible and consistent. The default browser focus ring is often invisible on dark backgrounds. The PRD should specify that custom focus indicators will be designed and tested. Recommendation: Add "Visible focus indicators on all interactive elements, tested against the dark theme" to the accessibility requirements.

**Code block accessibility is not addressed.** Syntax-highlighted code blocks (F-002) present specific accessibility challenges: color contrast in syntax tokens, screen reader behavior with highlighted code, and the horizontal scroll interaction on mobile. Many syntax highlighting libraries produce output that fails WCAG contrast checks. Recommendation: Add a requirement that syntax highlighting themes must pass WCAG AA contrast ratios for all token types. Test with a screen reader to ensure code blocks are announced properly.

**Table accessibility is not mentioned.** The PRD notes tables must be "readable and not overflow on mobile" (Section 14), but does not address semantic table markup (proper `<th>`, `<caption>`, `scope` attributes) or how tables are announced by screen readers. Recommendation: Add table accessibility to the requirements. Markdown-generated tables via Astro should produce semantic HTML, but this should be verified.

**Motion and animation are not addressed.** The PRD does not mention animations, but if any are added (hover effects, page transitions, scroll animations), the site must respect `prefers-reduced-motion`. Recommendation: Add a blanket requirement: "All animations must respect the `prefers-reduced-motion` media query."

**Dark theme and forced colors mode.** Users on Windows with High Contrast mode or `forced-colors: active` will override the site's dark theme. This can break layouts that depend on background colors for visual structure (e.g., cards, code blocks). Recommendation: Test with Windows High Contrast mode and add a requirement to support `forced-colors` gracefully.

**Language attribute.** The PRD does not mention setting the `lang` attribute on the HTML element. This is a basic accessibility requirement for screen readers. Recommendation: Add `lang="en"` to the base layout requirements.

---

## 6. Design System Considerations

### 6.1 Decisions the PRD defers

The PRD explicitly defers several design decisions (UI-001, UI-002 in the Appendix):

- Dark theme commitment vs. hybrid approach
- Brand identity (logo, color palette, typography)

These are appropriate deferrals for a PRD, but they need resolution before development begins. The following analysis aims to inform those decisions.

### 6.2 Dark theme: a nuanced recommendation

UI-001 raises the right question: does dark theme work for long-form reading? The evidence is mixed. Dark themes reduce eye strain in low-light conditions but can decrease readability for long-form prose, especially at smaller font sizes. The PRD's suggestion of "dark chrome with light article body" is worth serious consideration.

**Recommendation:** Implement a dark site chrome (header, footer, homepage, portfolio page) with a slightly lighter article reading area. This does not mean a full white background -- it means a dark charcoal (e.g., `#1a1a2e` or similar) for the site shell and a slightly lighter dark (e.g., `#242438`) for the article reading surface, with high-contrast off-white text (`#e8e8f0`). This creates visual depth without the readability penalty of pure dark-on-dark. Code blocks should be a distinctly different shade from the surrounding article body to create clear visual separation.

### 6.3 Component inventory for design

Based on the PRD, the minimum component set needed is:

| Component         | Used In                  | Key Design Decisions                                   |
| ----------------- | ------------------------ | ------------------------------------------------------ |
| Site header       | All pages                | Logo vs. wordmark, nav layout, mobile behavior         |
| Site footer       | All pages                | Link organization, social icons, legal links           |
| Hero section      | Homepage                 | Typography scale, spacing, identity statement          |
| Venture card      | Homepage, Portfolio      | Card layout, status badge design, hover state          |
| Article card      | Homepage, Articles index | Title, date, excerpt layout, link treatment            |
| Article layout    | Article pages            | Typography, max-width, heading styles, spacing         |
| Code block        | Articles                 | Syntax theme, copy button, language label, scroll      |
| Table             | Articles                 | Responsive strategy (scroll vs. stack), header styling |
| Tag/badge         | Portfolio, Articles      | Status badges, tag pills, color coding                 |
| Previous/next nav | Article pages            | Layout, label treatment, truncation                    |
| Skip-to-content   | All pages                | Position, visibility on focus                          |

This is approximately 11 components. For a site this size, this is manageable but not trivial. Each component needs at minimum: default state, hover state (where applicable), focus state, and mobile layout.

### 6.4 Typography system

The PRD specifies reading-optimized typography but does not define a type scale. For a content site, the type scale is arguably the most important design decision. Recommendation:

- **Body text:** 18px/1.7 on desktop, 16px/1.6 on mobile (slightly larger than typical web defaults for reading comfort)
- **Heading scale:** Use a modular scale (e.g., 1.25 ratio) to ensure visual hierarchy across h1-h4
- **Code text:** 14-15px monospace, slightly smaller than body to create visual distinction
- **Meta text (dates, tags, reading time):** 14px, reduced opacity or secondary color

Define these as Tailwind theme values to ensure consistency.

---

## 7. Mobile Experience

### 7.1 What the PRD addresses

Section 14 specifies:

- Fully responsive, mobile-first
- Articles must be comfortable to read on phone screens
- Navigation must work without JavaScript

This is correct in intent but thin on detail.

### 7.2 Mobile-specific gaps

**Table rendering on mobile is acknowledged but not solved.** Section 14 says "Tables: must be readable and not overflow on mobile." There are three common approaches: horizontal scroll within a container, responsive stacking (turning rows into cards), or hiding non-essential columns. For technical content tables (which often have 3-5 columns of data), horizontal scroll within a container is usually the least-bad option. Recommendation: Specify horizontal scroll within a container as the default table behavior on mobile. Add a visible scroll indicator (shadow or fade on the right edge) so the user knows there is more content.

**Code block behavior on mobile is not specified.** Long code lines are common in technical articles. On a 375px screen, a code block with 80+ character lines needs horizontal scroll. But the scroll interaction must not conflict with page scroll. Recommendation: Code blocks on mobile should scroll horizontally within their container, with the page scroll remaining vertical. Consider increasing the code block padding on mobile to make the scrollable area easier to hit with a thumb. Include a visible horizontal scrollbar or scroll indicator.

**Touch target sizes are not specified.** Navigation links, footer links, article links, and portfolio card links all need adequate touch targets (minimum 44x44px per WCAG 2.5.5). The PRD does not mention touch target sizing. Recommendation: Add a minimum touch target requirement of 44x44px for all interactive elements.

**No consideration of mobile reading patterns.** Mobile readers often read in short bursts (transit, waiting rooms). The article layout should support this with clear visual progress indicators -- either a progress bar (common on Medium-style sites) or visible heading hierarchy that lets the user skim and find their place. Recommendation: Consider a sticky reading progress indicator for articles on mobile, or ensure that heading styling creates enough visual landmarks for a reader to re-orient after a break. This is a Phase 2 enhancement, not MVP, but it is worth noting.

---

## 8. Specific Recommendations

### 8.1 High priority (should be addressed before development)

| #   | Recommendation                                                           | Rationale                                                                                   | PRD Section            |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | **Add a 404 page to the feature list**                                   | Direct URL sharing means 404 is a primary surface, not an edge case                         | Section 8, Section 9   |
| 2   | **Define the mobile navigation breakpoint and behavior**                 | "No hamburger if items fit" is ambiguous and will cause implementation churn                | F-005, Section 14      |
| 3   | **Define the methodology page content model**                            | Without a defined model, this page will be the hardest to author and maintain               | F-004, Section 11      |
| 4   | **Add visible focus indicators to accessibility requirements**           | Default focus rings are invisible on dark backgrounds                                       | Section 13             |
| 5   | **Specify the OG image strategy**                                        | Link previews are the primary conversion point for a content site relying on social sharing | Section 13, F-002      |
| 6   | **Add `lang="en"` and minimum touch target size (44px) to requirements** | Basic accessibility requirements that are easy to miss in implementation                    | Section 13, Section 14 |

### 8.2 Medium priority (should be addressed before launch)

| #   | Recommendation                                                     | Rationale                                                                                     | PRD Section          |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------- |
| 7   | **Add "Last updated" date to methodology and portfolio pages**     | Stale content on a build-in-public site signals abandonment                                   | F-003, F-004         |
| 8   | **Define a small initial tag vocabulary for articles**             | Consistent tagging from article one prevents retroactive cleanup                              | Section 11           |
| 9   | **Design the external link treatment for portfolio venture links** | Users leaving the site is a critical transition moment                                        | F-003, Journey 3     |
| 10  | **Specify code block and table accessibility requirements**        | Syntax highlighting and markdown tables often fail WCAG contrast                              | Section 13, F-002    |
| 11  | **Resolve AI authorship disclosure pattern (CONTENT-001)**         | Affects article template design, not just content policy                                      | Appendix CONTENT-001 |
| 12  | **Add recent articles to footer or header for repeat visitors**    | Only the homepage surfaces new content; repeat visitors to other pages have no discovery path | F-005, Journey 1     |

### 8.3 Low priority (Phase 2 considerations)

| #   | Recommendation                                                    | Rationale                                                               | PRD Section |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------- |
| 13  | **Add "Related articles" to article layout**                      | Internal linking is the primary engagement mechanism for a content site | F-002       |
| 14  | **Add section anchors and table of contents to methodology page** | Prepares for future page splitting without link rot                     | F-004       |
| 15  | **Mobile reading progress indicator**                             | Supports mobile reading patterns (short bursts, re-orientation)         | Section 14  |
| 16  | **Test with Windows High Contrast / forced-colors mode**          | Dark theme sites are particularly affected by forced-colors overrides   | Section 13  |

---

## 9. Summary Assessment

This PRD is unusually well-structured for an initial draft. The content-first philosophy, realistic personas, explicit anti-requirements, and thoughtful typography specifications demonstrate strong product instincts. The decision to launch thin with a flat IA is correct for the content volume and team size.

The primary UX gaps are:

1. **Error and edge-case states** -- The journeys describe the happy path but not what happens when things go wrong (404s, stale content, broken external links).
2. **Content discovery beyond the homepage** -- Repeat visitors and users who enter on non-homepage pages have limited ways to discover new content.
3. **Accessibility specifics** -- The requirements state WCAG AA compliance as a goal but do not enumerate the specific challenges that a dark-themed, code-heavy content site will face (focus indicators, syntax highlighting contrast, table semantics, touch targets).
4. **Mobile interaction details** -- The PRD correctly states "mobile-first" but does not specify the interaction patterns for the hardest mobile challenges (tables, code blocks, navigation).
5. **Design system foundation** -- The PRD defers visual identity decisions (appropriately) but should define the component inventory and type scale so that design and development can proceed in parallel.

None of these gaps are blockers for development. They are refinements that strengthen the PRD's already solid foundation. The most important action is resolving items 1-6 in the high-priority recommendations before the first line of code is written.
