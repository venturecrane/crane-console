# UX Lead Review -- Venture Crane Website PRD v0.1

**Reviewer:** UX Lead
**Date:** 2026-02-13
**PRD Version:** 0.1 (Initial Draft)
**Review Round:** 2 (Cross-Pollination)

---

## Cross-Role Synthesis

Reading the five other Round 1 contributions sharpened and, in several cases, redirected my thinking. The most important themes that emerged across roles:

**1. Content quality and cadence are the existential risk, not site design.** The Target Customer, Business Analyst, Competitor Analyst, and Product Manager all independently flagged that the PRD spends disproportionate attention on site architecture and insufficient attention on the content that will determine whether anyone visits or returns. My Round 1 review focused heavily on component design, accessibility specifics, and mobile interaction patterns. Those still matter, but they are secondary to whether the content earns attention. I am recalibrating my priorities accordingly.

**2. Build logs need distinct UX treatment.** The Competitor Analyst's recommendation for build logs (shorter, more frequent entries alongside polished articles) is a strong content format that I did not consider in Round 1. Build logs require different visual treatment from articles -- lighter weight, chronological, possibly diary-style. This is a UX design decision that should be addressed in the PRD, and I have added a recommendation below.

**3. The Target Customer's persona expectations reframe content discovery.** Alex expects RSS and at least monthly depth. Jordan expects step-by-step operational specifics and minimum-viable-setup guidance. Sam needs to understand "who is behind this?" within 10 seconds. These expectations are more concrete than what the PRD provides and should directly inform page layout, content hierarchy, and navigation decisions. The Target Customer's article title suggestions also reveal that the most compelling content types (failure postmortems, cost breakdowns, tool comparisons) require no special UX infrastructure -- they are standard articles with high editorial standards.

**4. Email capture belongs at launch.** The Competitor Analyst made a persuasive case that RSS alone is insufficient as a retention mechanism in 2026. I initially supported Principle 4 (no premature interactivity) without qualification. After reading the Competitor Analyst's argument -- that a single-field email notification is distribution infrastructure, not interactivity -- I now agree that a lightweight email capture should be in scope. This has UX implications: placement, visual weight, and copy all need design attention to avoid undermining the "no marketing fluff" brand voice.

**5. System fonts are confirmed as the right call.** The Technical Lead's analysis that system fonts are the key variable for the 1-second TTFMP target on 3G, combined with their recommendation for Shiki (build-time syntax highlighting, zero client JS), validates my Round 1 instinct to define the type scale in Tailwind theme values. The performance constraint resolves the font strategy decision: system fonts, no external dependencies.

**6. Portfolio credibility is a primary trust signal.** The Target Customer and Product Manager both flagged that the portfolio page must link to live, functional products -- or clearly label ventures that are not yet public. This is not just a content strategy concern; it is a first-impression UX problem. A portfolio card that links to a broken URL or an underwhelming placeholder actively damages the site's credibility.

---

## Revised Recommendations

My Round 1 review contained 16 recommendations across three priority tiers. After cross-pollination, I am consolidating to 10 recommendations, reordered by impact and informed by the other reviewers' insights. Items from Round 1 that remain unchanged are noted; items that are new or substantially revised are marked.

### High Priority (before development)

**1. Define the build log content type and its visual treatment (NEW)**

The Competitor Analyst recommended build logs as a content format: shorter, more frequent entries documenting what was built, what broke, what was learned. This format requires distinct UX from long-form articles. Build logs should be:

- Displayed chronologically on a dedicated `/log` page (or as a filterable view on `/articles`)
- Visually lighter: no hero section, no estimated reading time, smaller type scale than articles
- Dated prominently, since recency is their primary value signal
- Optimized for scanning: each entry should communicate its substance in the first line

This addresses the content cadence risk flagged by every reviewer without requiring the production cost of polished long-form articles. Add as F-007 or as a sub-type within F-002.

**2. Add a 404 page to the feature list (RETAINED from Round 1)**

The Technical Lead independently flagged this. For a site relying on social sharing (HN, X), where links break frequently, the 404 page is a primary surface. It should guide users to the article index and homepage. Trivial to implement, meaningful for user experience.

**3. Design the email capture component (NEW)**

Informed by the Competitor Analyst's argument and the Business Analyst's recommendation for trigger-based feature additions, design a minimal email notification signup. UX constraints:

- Single field (email only), no name, no preferences
- Placed at the end of articles (after the reader has received value, not before)
- Copy should match the brand voice: direct and understated (e.g., "Get notified when we publish" -- not "Join our newsletter" or "Subscribe for updates")
- No modal, no popover, no sticky bar -- inline only
- Visual weight should be low: the article content is the priority, not the capture form

This can be powered by a single Worker + Resend endpoint, consistent with Section 12's post-MVP contact form pattern. The implementation is minimal; the design decision is what matters.

**4. Specify the OG image strategy (RETAINED, strengthened)**

The Product Manager and Technical Lead both flagged this independently. The Target Customer's expectations about link previews on HN and X make this more urgent than I initially assessed. For MVP: a single site-wide OG image with the Venture Crane wordmark and tagline. For Phase 2: per-article OG images generated at build time (the Technical Lead identified `astro-og-canvas` or Satori as options). Add an optional `ogImage` field to article frontmatter now, even if the generation pipeline is Phase 2.

**5. Define mobile navigation breakpoint and behavior (RETAINED from Round 1)**

"No hamburger if items fit" is ambiguous. The nav has four items (Home, Portfolio, Methodology, Articles) plus a wordmark. On a 320px screen, this will not fit. Define the breakpoint (recommendation: 640px) and the collapsed behavior (a simple hamburger menu that works without JavaScript, using a `<details>` element or CSS-only toggle).

**6. Resolve the dark theme strategy as a design requirement (REVISED)**

My Round 1 recommendation for a nuanced dark theme (dark chrome with a slightly lighter article reading area) is reinforced by the Product Manager, Technical Lead, and Target Customer, all of whom flagged dark theme readability as a concern. The Target Customer explicitly voted for "dark chrome with light or slightly off-white article body." Elevate this from an unresolved appendix item (UI-001) to a design requirement:

- Site shell (header, footer, homepage, portfolio): dark background
- Article reading surface: slightly lighter, with higher-contrast text
- Code blocks: distinct from the surrounding article body
- All text must pass WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)

The Technical Lead's recommendation to implement with CSS custom properties from day one is the correct approach, enabling a future light theme without restructuring stylesheets.

### Medium Priority (before launch)

**7. Design the portfolio card for ventures without public sites (NEW)**

The Product Manager flagged that Draft Crane is "in development" and may not have a public URL at launch. The Target Customer warned that linking to placeholder pages undermines credibility. Design two card states:

- **Live venture:** Status badge + link to external site (opens in new tab with external link icon, per my Round 1 recommendation)
- **Pre-launch venture:** Status badge ("In Development"), no link, description focuses on what is being built rather than what exists

This is a small design decision with outsized impact on first impressions.

**8. Add "Last updated" to methodology and portfolio pages (RETAINED from Round 1)**

The Business Analyst's emphasis on content staleness risk reinforces this. The Target Customer noted that "a site with 3 articles from launch month and nothing after signals abandonment." Visible update dates on evergreen pages are a low-cost trust signal.

**9. Add recent articles to the footer for repeat visitors (RETAINED, refined)**

My Round 1 analysis identified that only the homepage surfaces new content. The Target Customer's retention expectations (Alex needs to discover new content without navigating to the homepage) confirm this is a real problem. Add 2-3 recent article links to the site footer, visible on every page. This is one component, minimal implementation effort, and solves the content discovery gap for repeat visitors who enter on non-homepage pages.

**10. Include a brief founder identity on the methodology page (NEW)**

The Target Customer (all three personas) and the Product Manager both flagged that "Venture Crane" as an anonymous entity feels impersonal for a build-in-public site. Sam asks "who is behind this?" Jordan wants the founder's background. Alex wants the GitHub profile. Add a brief (2-3 sentence) founder section to the methodology/about page with links to X and GitHub. This is not a full bio page -- it is the minimum to establish human credibility behind the AI-driven methodology.

---

## Withdrawn or Deferred Recommendations

The following Round 1 recommendations are being deprioritized based on cross-pollination insights:

- **Define a small initial tag vocabulary (Round 1 #8):** The Product Manager noted the methodology page may already be overscoped. Adding a tag system, even as content strategy, adds cognitive overhead before there is enough content to justify it. Defer until article count exceeds 10.
- **Mobile reading progress indicator (Round 1 #15):** Remains a valid Phase 2 idea but is not worth PRD space given the more pressing concerns about content strategy and retention mechanisms.
- **Related articles section (Round 1 #13):** With build logs added as a content type and recent articles in the footer, the content discovery surface is adequate for launch. Defer related articles until the content library grows.
- **Detailed accessibility items (Round 1 #4, #10, #16):** My Round 1 review enumerated specific accessibility gaps (focus indicators, code block contrast, table semantics, forced-colors mode, `lang="en"`, 44px touch targets). These remain valid requirements but are implementation-level details, not PRD-level concerns. The PRD's commitment to WCAG 2.1 AA (Section 13) is the right level of abstraction. The Technical Lead's recommendation for an explicit accessibility audit task in Phase 1 is the correct mechanism to catch these -- I endorse adding that task rather than enumerating individual accessibility items in the PRD.

---

## Summary

My Round 1 review was thorough on component-level UX details but underweighted the content strategy and retention concerns that every other reviewer identified as the primary risk. This revised review shifts the emphasis:

1. **Content format diversity (build logs) requires UX design work** -- not just a content strategy decision
2. **Email capture is a UX design problem** -- placement, copy, and visual weight determine whether it feels like value or like spam
3. **Portfolio credibility is a trust-design problem** -- card states for pre-launch ventures need explicit design
4. **Founder identity solves a real user question** -- "who is behind this?" cannot go unanswered on a build-in-public site
5. **Dark theme, 404, OG images, and mobile navigation remain high-priority UX gaps** from Round 1, now reinforced by multiple reviewers

The PRD's content-first philosophy is sound. The UX work is to ensure the site's design serves that content -- and the people who come to read it -- without adding friction, ambiguity, or distrust.
