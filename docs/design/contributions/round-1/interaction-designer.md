# Interaction Designer Contribution -- Design Brief Round 1

**Author:** Interaction Designer
**Date:** 2026-02-13
**Design Maturity:** Greenfield
**PRD Reference:** `docs/pm/prd.md` (venturecrane.com static marketing site)

---

## Screen Inventory

Every screen maps to a PRD feature (F-001 through F-008) and route (Section 9). Every PRD feature has at least one screen below.

| #    | Screen           | URL Pattern        | PRD Feature    | Purpose                                                  | Primary Action                                         |
| ---- | ---------------- | ------------------ | -------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| S-01 | Homepage         | `/`                | F-001          | Establish identity, surface portfolio and recent content | Scan portfolio cards, click into an article            |
| S-02 | Article Index    | `/articles`        | F-002          | Browse all published articles by date                    | Click an article title to read                         |
| S-03 | Article Page     | `/articles/:slug`  | F-002          | Read a full technical article                            | Read to completion, then navigate to prev/next article |
| S-04 | Build Log Index  | `/log`             | F-007          | Browse all build log entries by date                     | Click a log entry title to read                        |
| S-05 | Build Log Entry  | `/log/:slug`       | F-007          | Read a single build log entry                            | Read to completion                                     |
| S-06 | Portfolio Page   | `/portfolio`       | F-003          | Evaluate the venture portfolio and verify credibility    | Click through to a live venture site (new tab)         |
| S-07 | Methodology Page | `/methodology`     | F-004          | Understand how VC operates, meet the founder             | Read overview, follow links to methodology articles    |
| S-08 | RSS Feed         | `/feed.xml`        | F-006          | Subscribe to content via RSS reader                      | Add feed URL to an RSS reader                          |
| S-09 | 404 Page         | `/404` (catch-all) | F-008          | Recover from a broken or outdated link                   | Click link to article index or homepage                |
| S-10 | Privacy Policy   | `/privacy`         | F-005 (layout) | Legal disclosure                                         | Read (no action)                                       |
| S-11 | Terms of Use     | `/terms`           | F-005 (layout) | Legal disclosure                                         | Read (no action)                                       |

**Navigation chrome** (F-005) is not a standalone screen but a persistent component present on every screen: header with wordmark and 4 nav links, footer with venture links, social links, recent articles, legal links, and RSS link.

**RSS Feed (S-08)** is not an HTML page -- it is an XML document consumed by feed readers. No visual design is required, but the feed must be discoverable via `<link rel="alternate">` in the `<head>` of every HTML page and via a visible link in the footer.

### Feature-to-Screen Traceability

| PRD Feature                  | Screens                                           |
| ---------------------------- | ------------------------------------------------- |
| F-001: Homepage              | S-01                                              |
| F-002: Article Pages         | S-02, S-03                                        |
| F-003: Portfolio Page        | S-06                                              |
| F-004: Methodology/About     | S-07                                              |
| F-005: Navigation and Layout | All screens (header, footer, responsive behavior) |
| F-006: RSS Feed              | S-08                                              |
| F-007: Build Logs            | S-04, S-05                                        |
| F-008: 404 Page              | S-09                                              |

Legal pages (S-10, S-11) are implied by the footer structure specified in F-005 and the route map in Section 9.

---

## Key Screen Breakdowns

### 1. Article Page (`/articles/:slug`) -- S-03

The article page is the core product. Per the PRD, the article reading experience is "the entire product" for the Alex persona. Every design decision here must optimize for sustained reading of 1,000-3,000 word technical content with code blocks, tables, and images.

**Mobile layout (< 640px):**

- Full-width header: wordmark left, hamburger toggle right (CSS-only `<details>/<summary>`)
- Skip-to-content link (visually hidden until focused)
- Article header block (stacked, full-width with 16px horizontal padding):
  - Title (`<h1>`, wraps to multiple lines, never truncates)
  - Meta row: publication date, estimated reading time, author name -- single line if it fits, wraps gracefully
  - Updated date (if present), displayed below meta row in muted text
- Article body: 16px body text, 1.6 line-height, full content width minus 16px padding each side
  - Headings: h2, h3, h4 with scroll-margin-top to clear sticky header (if any) or provide breathing room
  - Code blocks: full-width, horizontal scroll for long lines, visible scroll indicator (right-edge shadow/fade), 15px monospace, distinct background color from article surface
  - Tables: wrapped in a scrollable container, horizontal scroll when content exceeds viewport, right-edge shadow indicator
  - Blockquotes: left border accent, slightly indented
  - Images: full content width, proper alt text, WebP format
- AI disclosure component: horizontal rule, disclosure text, link to methodology page
- Previous/next navigation: stacked vertically, each link is a full-width block with label ("Previous" / "Next") and article title, minimum 44px touch target height
- Footer: standard site footer

**Desktop adaptation (>= 640px, optimal at >= 1024px):**

- Article body constrained to 680px max-width, centered
- 18px body text, 1.7 line-height
- Meta row comfortably on a single line
- Previous/next navigation side by side (previous left, next right)
- Code blocks and tables still scroll horizontally when content exceeds 680px

**Content elements and hierarchy (top to bottom):**

1. Site header (persistent navigation)
2. Article title (h1, largest visual element)
3. Article metadata (date, reading time, author -- secondary visual weight)
4. Updated date if applicable (tertiary)
5. Article body (primary content area)
6. AI disclosure (subtle, end-of-content signal)
7. Previous/next navigation (discovery mechanism)
8. Site footer (utility navigation)

**Primary action:** Read the article to completion. Visual weight is entirely on the content body. No competing calls to action, no sidebar, no promotional elements (BR-002).

**Empty state:** Not applicable -- article pages are generated at build time from markdown files. If a slug has no corresponding content file, the build system does not generate the page. A visitor requesting a non-existent slug receives the 404 page (S-09).

**Loading state:** This is a static HTML page. The browser fetches the HTML document and renders it progressively. There is no JavaScript-driven loading state. The page is fully rendered on first paint. For visitors on slow connections, the browser's native progressive rendering handles display -- text appears before images. No skeleton screens or spinners.

**Error state:** The only error state is a 404 -- the article does not exist (removed, renamed, or mistyped URL). This is handled by S-09. There are no runtime errors on a static page.

---

### 2. Homepage (`/`) -- S-01

The homepage must communicate "what Venture Crane is and why it matters" within 10 seconds (Sam persona). It is the front door for curious observers and the orientation point for returning visitors.

**Mobile layout (< 640px):**

- Header: wordmark left, hamburger toggle right
- Hero section (full-width, chrome background):
  - Identity statement: one sentence, no jargon, large text (h1 treatment), visible above the fold on 375px viewport (AC-001-1)
  - Elaboration paragraph: max 50 words (BR-001), standard body text, muted color
- Portfolio section (chrome background):
  - Section heading: "Portfolio" or similar
  - Venture cards: stacked vertically, full-width
    - Each card: venture name (h3), one-line description, status badge (text label, colored background), conditional link
    - Live ventures: card is a link, external link icon visible, entire card is the tap target (minimum 44px height)
    - Pre-launch ventures: no link, default cursor, status badge only ("In Development" or "Lab")
    - Cards ordered by status: Launched > Active > In Development > Lab (AC-005-4)
- Recent articles section:
  - Section heading: "Recent" or "Articles"
  - 3-5 article cards stacked vertically
  - Each card: title (linked), date, description excerpt
  - Each card minimum 44px touch target
- Footer: standard site footer

**Desktop adaptation (>= 1024px):**

- Hero: centered text, generous vertical padding, 680px max content width
- Portfolio cards: 2-column grid (2x2 for 4 ventures)
- Article cards: remain single column or shift to a wider single-column layout centered at 680px

**Content elements and hierarchy:**

1. Hero identity statement (highest visual weight -- this is the "10-second test")
2. Hero elaboration (supporting context)
3. Portfolio cards (proof of work)
4. Recent articles (content depth signal)
5. Footer (navigation and discovery)

**Primary action:** Comprehend what Venture Crane is. Secondary action: click a portfolio card or article.

**Empty state (EC-001):** If all articles have `draft: true`, the recent articles section is hidden entirely. The homepage renders hero + portfolio cards + footer. No "coming soon" placeholder in the articles section -- the section simply does not appear.

**Loading state:** Static HTML, progressive browser rendering. No spinner or skeleton.

**Error state:** The homepage always exists. No error state applies.

---

### 3. Portfolio Page (`/portfolio`) -- S-06

The portfolio page is where methodology credibility is tested against portfolio reality. Jordan reads methodology, then checks portfolio. This is a trust-critical screen.

**Mobile layout (< 640px):**

- Header: standard
- Page header: title ("Portfolio"), brief introduction (1-2 sentences)
- Venture cards: stacked vertically, full-width, ordered by status
  - Each card contains:
    - Venture name (h2 or h3)
    - Description (2-3 sentences)
    - Status badge (text label: "Launched", "Active", "In Development", "Lab")
    - Technology stack tags (small, inline, muted treatment)
    - Conditional link area:
      - **Live ventures** (launched/active): "Visit [venture name]" link with external link icon, opens in new tab. The link is a distinct, tappable element (44px minimum). The card itself may have a subtle border or background differentiation to signal interactivity.
      - **Pre-launch ventures** (in-development/lab): No link rendered. Card has no interactive affordance. Default cursor. Status badge is the primary signal.
  - Card spacing: sufficient vertical margin between cards to prevent accidental taps
- "Last updated" date at bottom of content, muted text
- Footer: standard

**Desktop adaptation (>= 1024px):**

- Cards in a single-column centered layout (680px max-width) -- the 2-3 sentence descriptions benefit from readable line lengths, not a grid
- Live venture cards: subtle hover state (border color shift or background lightening) to signal interactivity. Pre-launch cards have no hover change.

**Content elements and hierarchy:**

1. Page title and introduction
2. Venture cards (ordered by status, descending credibility: launched first)
3. Technology stack tags (secondary detail)
4. "Last updated" date (freshness signal)

**Primary action:** Click through to a live venture site to verify quality.

**Empty state:** Not applicable at MVP -- portfolio data is static TypeScript/JSON, not user-generated. If a venture has no description, the build fails (EC-004). The portfolio always has content.

**Loading state:** Static HTML. No loading state.

**Error state:** No runtime error state. If a venture's external URL is broken (EC-005), the link is replaced with the pre-launch treatment (no link, status badge only) at the next deployment per BR-014.

---

### 4. Article Index (`/articles`) -- S-02

The article index is the browse-and-discover surface for returning visitors. It must communicate content depth and recency at a glance.

**Mobile layout (< 640px):**

- Header: standard
- Page header: title ("Articles"), no additional description needed
- Article entries: stacked vertically, full-width
  - Each entry:
    - Title (linked to article page, primary visual weight)
    - Publication date (muted text)
    - Description/excerpt (from frontmatter `description` field, max 160 chars)
    - Estimated reading time (muted text, same line as date or below it)
  - Entries listed in reverse chronological order (newest first, AC-003-1)
  - No pagination at launch (AC-003-3) -- all non-draft articles appear
  - Each entry is a tappable block with minimum 44px height
  - Clear visual separation between entries (spacing or subtle divider)
- Footer: standard

**Desktop adaptation (>= 640px):**

- Content centered at 680px max-width
- Date and reading time on the same line, right-aligned or inline with title
- Description on its own line below the title

**Content elements and hierarchy:**

1. Page title
2. Article entries (title is primary, date/reading time are secondary, description is tertiary)

**Primary action:** Click an article title to read it.

**Empty state (EC-001):** If all articles have `draft: true`, the index displays "Content coming soon." -- a single line of text, no elaborate empty state illustration or CTA. The page still has header and footer.

**Loading state:** Static HTML. No loading state.

**Error state:** No error state -- the page always renders. Content is determined at build time.

---

### 5. Methodology Page (`/methodology`) -- S-07

The methodology page is the strongest differentiator per the PRD. It serves the Jordan persona -- indie founders who want the operational playbook. It is lean at launch (500-800 words) and grows through linked articles.

**Mobile layout (< 640px):**

- Header: standard
- Page header: title (h1)
- Overview prose (~500-800 words):
  - Article surface background (lighter than chrome, #242438)
  - Standard article typography (16px body on mobile, 1.6 line-height)
  - Content explains: what VC is, how it works, the development approach
  - Lean, opinionated, no filler
- Founder identity section:
  - Visually distinct from prose (subtle separator or different background treatment)
  - Founder name
  - 1-2 sentence background
  - Links to X and GitHub profiles (external, new tab, external link icon)
  - Links are tappable with 44px minimum touch targets
- Related articles section (grows over time):
  - At launch: may be empty (EC-009). If empty, this section does not render. No "coming soon" placeholder.
  - When populated: list of links to methodology-focused articles with title and date
- "Last updated" date (muted text, from `updatedDate` frontmatter field)
- Footer: standard

**Desktop adaptation (>= 1024px):**

- Content centered at 680px max-width
- 18px body text, 1.7 line-height
- Founder identity section: could be a subtle aside or inline with the prose flow

**Content elements and hierarchy:**

1. Page title
2. Methodology overview prose (primary content)
3. Founder identity (credibility anchor)
4. Related articles (depth extension)
5. "Last updated" date (freshness signal)

**Primary action:** Read the methodology overview. Secondary action: follow links to methodology articles or founder social profiles.

**Empty state:** The methodology content always exists (it is a markdown file in the pages collection). The only conditional section is "related articles," which simply does not render when no methodology articles have been published (EC-009).

**Loading state:** Static HTML. No loading state.

**Error state:** No error state.

---

## Navigation Model

### Primary Navigation (Header)

Present on every page. Contains exactly 4 items plus the wordmark:

| Position  | Element         | Destination    | Behavior                |
| --------- | --------------- | -------------- | ----------------------- |
| Left      | Wordmark (text) | `/`            | Internal link, same tab |
| Right (1) | Home            | `/`            | Internal link, same tab |
| Right (2) | Portfolio       | `/portfolio`   | Internal link, same tab |
| Right (3) | Methodology     | `/methodology` | Internal link, same tab |
| Right (4) | Articles        | `/articles`    | Internal link, same tab |

**Active state:** The current page's nav link should have a visual indicator (underline, accent color, or increased font weight) so the visitor knows where they are.

**Maximum depth:** The site is flat. Every primary destination is 1 tap/click from any page. Article and build log detail pages are 2 taps from the homepage (homepage -> index -> detail), which satisfies the "max 2 taps to reach any primary feature" constraint.

### Secondary Navigation (Footer)

Present on every page. Organized into logical groups:

| Group              | Links                          | Behavior                                    |
| ------------------ | ------------------------------ | ------------------------------------------- |
| Portfolio ventures | DFG, KE, DC, SC                | External links, new tab, external link icon |
| Social             | X, GitHub                      | External links, new tab                     |
| Recent articles    | 2-3 most recent article titles | Internal links, same tab                    |
| Legal              | Privacy, Terms                 | Internal links, same tab                    |
| Feed               | RSS (link to `/feed.xml`)      | Direct link to XML feed                     |

### In-Content Navigation

| Context          | Navigation Element                     | Behavior                                               |
| ---------------- | -------------------------------------- | ------------------------------------------------------ |
| Article page     | Previous/next article links (by date)  | Internal links at bottom of article body, above footer |
| Article page     | AI disclosure link to methodology      | Internal link within disclosure component              |
| Build log page   | No prev/next                           | Build logs are standalone entries                      |
| Methodology page | Related article links (when populated) | Internal links within page body                        |

### Mobile Navigation Pattern

**Breakpoint:** 640px (Tailwind `sm:`)

**Below 640px:** The header collapses to:

- Left: wordmark (links to homepage)
- Right: hamburger icon rendered as a `<summary>` element within a `<details>` element

When the hamburger is tapped:

- The `<details>` element opens (native browser behavior, no JavaScript)
- Nav links appear vertically below the header bar
- Each nav link is a full-width block with minimum 44px height
- Tapping a nav link navigates to that page (the `<details>` element naturally closes on navigation because a new page loads)
- Tapping the hamburger icon again closes the menu (native `<details>` toggle behavior)

**Above 640px:** All 4 nav links are visible inline in the header. No hamburger icon.

**Keyboard accessibility:** The `<details>/<summary>` pattern is natively keyboard accessible. `Enter` or `Space` toggles the menu. Tab moves focus into the expanded menu items. Each item is a standard `<a>` element.

### Breadcrumbs

Not used. The site is flat (maximum 2 levels: index -> detail). Breadcrumbs would add visual noise with no navigational value. The header nav provides sufficient orientation.

---

## User Flows

### Flow 1: Alex Discovers an Article via Social Link (Happy Path)

This is the primary acquisition flow. Alex arrives from Hacker News or X with zero context about Venture Crane. The article must earn trust on its own.

1. Alex sees a link on HN/X with OG preview card showing article title, description, and branded image
2. Alex clicks the link
3. **Browser loads `/articles/how-we-give-ai-agents-persistent-memory`** (static HTML, sub-1-second load target)
4. Alex sees: article title, date, "12 min read", author "Venture Crane" -- all above the article body, providing context before committing to read
5. Alex reads the article body -- prose, code blocks with syntax highlighting, tables with horizontal scroll on mobile, blockquotes
6. Alex reaches the article footer: AI disclosure ("Drafted with AI assistance. Reviewed and edited by Scott Durgan.") with link to methodology page
7. Alex scrolls past disclosure to previous/next article links
8. Alex taps "Next: What Running 4 Products with AI Agents Actually Costs"
9. **Browser loads `/articles/what-running-4-products-costs`** -- same layout, different content
10. Alex reads the second article, further building trust
11. Alex scrolls to site footer, notices RSS link
12. Alex copies the `/feed.xml` URL and adds it to their RSS reader
13. Alex exits

**Key interaction moments:**

- Step 3: Page must load fast. Any delay and Alex bounces.
- Step 5: Code blocks and tables must render cleanly. Broken code rendering = credibility loss.
- Step 7: Previous/next links keep Alex on-site without requiring navigation to the index.
- Step 11: RSS link must be discoverable in the footer without hunting.

**Primary error path: Broken link (404)**

1. Alex clicks a shared link on HN/X
2. The URL is outdated (WordPress URL) or mistyped
3. **Browser loads the 404 page** (S-09)
4. Alex sees: "Page not found" message, link to article index, link to homepage
5. Alex taps "Browse all articles"
6. **Browser loads `/articles`** -- Alex can find the article they were looking for, or discover others
7. If the article exists under a different URL, Alex finds it in the index and continues reading

---

### Flow 2: Sam Evaluates Venture Crane from the Homepage (Happy Path)

Sam is a curious observer with no prior context. The homepage has 10 seconds to communicate value or Sam leaves.

1. Sam arrives at `venturecrane.com` via a colleague's link or Google search
2. **Browser loads `/`** -- hero section visible above the fold on 375px viewport
3. Sam reads the identity statement (one sentence, large text): understands "what this is" in under 5 seconds
4. Sam reads the elaboration paragraph (max 50 words): understands "why it matters"
5. Sam scrolls down to portfolio section: sees 4 venture cards with real names, real status badges, real descriptions
6. Sam sees Durgan Field Guide card with "Launched" badge and "Visit" link -- this signals real products, not vaporware
7. Sam taps the "Visit Durgan Field Guide" link
8. **New tab opens to `durganfieldguide.com`** -- Sam evaluates the actual product
9. Sam switches back to the Venture Crane tab
10. Sam scrolls to recent articles section, scans 3 article titles
11. Sam taps an article title that interests them
12. **Browser loads `/articles/:slug`** -- Sam reads partially (2-5 minutes total site time)
13. Sam exits, possibly sharing the homepage URL with a colleague

**Key interaction moments:**

- Step 2-4: The "10-second test." If the hero fails, Sam leaves. No amount of content below matters.
- Step 6-8: Portfolio card links opening in new tab is critical -- Sam must return to VC easily.
- Step 7: External link icon on the card signals "this will leave venturecrane.com."

**Primary error path: Homepage fails the 10-second test**

1. Sam arrives at `venturecrane.com`
2. Sam reads the hero but does not understand what Venture Crane is (too jargon-heavy, too abstract)
3. Sam scrolls briefly, does not find clarity
4. Sam closes the tab -- total time on site: under 10 seconds
5. No recovery mechanism exists for this failure. Mitigation is entirely in the copywriting and hero design, not in interaction patterns.

---

### Flow 3: Jordan Reads Methodology and Validates Against Portfolio (Happy Path)

Jordan is an indie founder evaluating whether VC's approach applies to their own work. This is the deepest engagement flow -- 15-20 minutes on site.

1. Jordan arrives at `/methodology` via a direct link from an article or social post
2. **Browser loads `/methodology`** -- overview prose begins immediately after the title
3. Jordan reads the methodology overview (~500-800 words): organizational structure, AI agent coordination, development approach
4. Jordan reaches the founder identity section: sees name, brief background, links to X and GitHub
5. Jordan taps the GitHub link -- **new tab opens to the founder's GitHub profile** -- Jordan evaluates the profile briefly
6. Jordan switches back to the methodology tab
7. Jordan scrolls to related articles section (if populated): sees links to deep-dive methodology articles
8. Jordan taps a related article link: "How We Give AI Agents Persistent Memory Across Sessions"
9. **Browser loads `/articles/how-we-give-ai-agents-persistent-memory`**
10. Jordan reads the full article (10-15 minutes)
11. Jordan uses the header nav to navigate to Portfolio
12. **Browser loads `/portfolio`**
13. Jordan scans all venture cards, evaluates status badges and descriptions
14. Jordan taps "Visit Durgan Field Guide" -- **new tab opens**
15. Jordan evaluates the DFG site -- is the product actually good? Does the methodology produce quality output?
16. Jordan switches back to VC tab, satisfied (or not) with portfolio quality
17. Jordan uses header nav to go to Articles
18. **Browser loads `/articles`** -- Jordan scans for more methodology-adjacent content
19. Jordan bookmarks the methodology page for future reference
20. Jordan exits

**Key interaction moments:**

- Step 3: The methodology prose must be lean and specific. No padding.
- Step 4-5: Founder identity is a credibility checkpoint. The links must work.
- Step 11-12: Navigation between methodology and portfolio must be frictionless -- both are in the primary nav header.
- Step 14-15: The transition to an external venture site is the trust-critical moment. External link behavior (new tab, icon) must be clear.

**Primary error path: External venture link is broken**

1. Jordan taps "Visit [venture name]" on the portfolio page
2. The new tab opens but the venture site is down or returns an error
3. Jordan's trust in the methodology is damaged -- the output does not work
4. Jordan closes the broken tab, returns to the VC portfolio tab
5. No recovery mechanism exists within the VC site. Mitigation: BR-014 requires link verification before each deployment. If a link breaks post-deployment, it is replaced with the pre-launch treatment (no link, status badge only) at the next build.

---

## Form Patterns

**Phase 0 has no forms.** The site is fully static with zero JavaScript. There are no input fields, no submission handlers, no validation states.

The PRD explicitly excludes signup forms, contact forms, and interactive features from Phase 0 (BR-002, BR-013). Email capture enters scope at Phase 1, gated by a traffic threshold trigger.

When forms are introduced in Phase 1+, the following patterns should apply:

- **Input style:** Full-width on mobile, constrained to content width on desktop. Dark field background (surface-raised color) with lighter border. Text color matches primary text.
- **Validation timing:** On-submit only (Phase 1 email capture is a single-field form -- on-blur validation adds friction without value for one field).
- **Error message placement:** Inline, immediately below the input field, in an accent or warning color that meets WCAG AA contrast.
- **Required field indicators:** For single-field forms (email capture), no indicator is needed -- the field is self-evidently required. For multi-field forms (Phase 2 contact), use an asterisk convention with a legend.
- **Submission feedback:** Replace the submit button text with a confirmation message ("Subscribed" or "Sent") in the same location. No toast, no modal, no page redirect. The feedback is inline and immediate.

---

## Feedback Patterns

### Phase 0 Feedback (Static Site)

A static site with zero JavaScript has a narrow feedback vocabulary. All feedback is delivered through HTML page content, not through dynamic UI elements.

| Scenario                        | Feedback Mechanism    | Implementation                                                                                                      |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Page not found                  | Full-page 404 (S-09)  | Custom 404 page with recovery links                                                                                 |
| Broken external link            | No immediate feedback | Link opens in new tab; if target is down, the browser handles the error. VC cannot control this.                    |
| Content not yet available       | Section omission      | Empty sections (no articles, no related methodology articles) are hidden, not shown with "coming soon" placeholders |
| Navigation state                | Active nav indicator  | Current page highlighted in header nav via CSS class                                                                |
| External link signal            | Visual icon           | Small external-link icon (arrow/box icon) adjacent to links that leave venturecrane.com                             |
| Scroll affordance (tables/code) | Edge shadow           | Right-edge shadow or fade on horizontally scrollable containers signals more content                                |

### Toast/Notification Patterns

Not applicable at Phase 0. No dynamic notifications exist on a static site.

### Success Confirmations

Not applicable at Phase 0. There are no user-initiated actions that require confirmation (no forms, no subscriptions, no submissions).

### Destructive Action Confirmations

Not applicable. There are no destructive actions. Visitors read content -- they do not create, modify, or delete anything.

### Progress Indicators

Not applicable in the traditional sense. Pages are pre-rendered HTML. The browser's native loading indicator (tab spinner, progress bar) is the only progress feedback. Optimizing for sub-1-second load on 3G ensures this indicator is visible for the minimum possible duration.

---

## Responsive Strategy

### Approach: Mobile-First

All layouts are designed for the smallest viewport first (375px reference width), then adapted upward. CSS is written mobile-first with `min-width` media queries for larger breakpoints. This aligns with the Tailwind CSS default approach and the PRD's mobile-first requirement.

### Breakpoints

| Breakpoint          | Tailwind Prefix | Viewport       | Designation |
| ------------------- | --------------- | -------------- | ----------- |
| Default (no prefix) | --              | < 640px        | Mobile      |
| `sm:`               | 640px           | 640px - 1023px | Tablet      |
| `lg:`               | 1024px          | >= 1024px      | Desktop     |

### What Changes at Each Breakpoint

#### Mobile (< 640px)

- **Navigation:** Wordmark + CSS-only hamburger (`<details>/<summary>`). Nav items stacked vertically when expanded.
- **Typography:** Body text 16px/1.6. H1 scales down proportionally (responsive `clamp()` or mobile-specific size).
- **Content width:** Full viewport width minus 16px padding on each side (32px total horizontal padding).
- **Layout:** All content is single-column, stacked vertically.
- **Portfolio cards:** Full-width, stacked vertically with clear spacing.
- **Article cards:** Full-width, stacked vertically.
- **Previous/next navigation:** Stacked vertically (previous on top, next below).
- **Footer:** All sections stacked vertically.
- **Code blocks:** Full content width, horizontal scroll with right-edge shadow indicator.
- **Tables:** Wrapped in scrollable container, horizontal scroll with right-edge shadow indicator. Page does not scroll horizontally.
- **Touch targets:** All interactive elements (links, nav items, cards) minimum 44x44px.
- **Images:** Full content width, aspect ratio preserved.

#### Tablet (640px - 1023px)

- **Navigation:** Full horizontal nav visible. No hamburger. Wordmark left, 4 nav links right.
- **Typography:** Body text 18px/1.7.
- **Content width:** Content area centered with side margins. Article body constrained to 680px max-width.
- **Layout:** Single-column content, centered. Portfolio cards may shift to 2-column grid depending on card content width.
- **Previous/next navigation:** Side by side (previous left, next right).
- **Footer:** May organize into 2-3 column layout for link groups.
- **Code blocks and tables:** Same horizontal scroll behavior, but less likely to trigger on wider viewports.

#### Desktop (>= 1024px)

- **Navigation:** Same as tablet. Generous horizontal padding around nav items.
- **Typography:** Same as tablet (18px/1.7). No further scaling.
- **Content width:** 680px max-width for article content, centered. Generous whitespace on both sides of the content column.
- **Layout:** Same as tablet. The content column does not widen beyond 680px -- whitespace increases instead.
- **Portfolio cards:** 2-column grid on portfolio page. On homepage, 2x2 grid for 4 venture cards.
- **Footer:** 3-4 column layout for link groups.
- **Hover states:** Portfolio cards (live ventures) gain subtle hover effect (border color shift, background lightening). Not present on touch devices.
- **Code blocks:** Still constrained to 680px content width, horizontal scroll for long lines.

### Responsive Behavior Summary by Component

| Component       | Mobile               | Tablet                  | Desktop                 |
| --------------- | -------------------- | ----------------------- | ----------------------- |
| Header nav      | Hamburger (CSS-only) | Inline horizontal       | Inline horizontal       |
| Content width   | Full width - 32px    | 680px max, centered     | 680px max, centered     |
| Body text       | 16px / 1.6           | 18px / 1.7              | 18px / 1.7              |
| Portfolio cards | 1 column             | 1-2 columns             | 2 columns               |
| Article cards   | 1 column             | 1 column                | 1 column                |
| Prev/next nav   | Stacked              | Side by side            | Side by side            |
| Footer          | 1 column             | 2-3 columns             | 3-4 columns             |
| Code blocks     | Full width, scroll   | 680px, scroll if needed | 680px, scroll if needed |
| Tables          | Full width, scroll   | 680px, scroll if needed | 680px, scroll if needed |
| Touch targets   | 44px minimum         | 44px minimum            | N/A (hover available)   |

### Critical Responsive Considerations

**Long article titles (EC-006):** Titles wrap to multiple lines on all viewports. They never truncate with ellipsis and never overflow their container. On mobile, a long title may consume significant vertical space -- this is acceptable. The alternative (truncation) loses information.

**Code blocks with long lines:** Horizontal scroll is the only acceptable behavior. Line wrapping in code blocks destroys readability. The right-edge shadow/fade provides a visual cue that scrollable content exists beyond the visible area. On mobile, the scroll container extends to the full content width. On desktop, it is constrained to 680px.

**Tables with many columns:** Same horizontal scroll treatment as code blocks. The table container scrolls independently of the page. The right-edge shadow signals more content. On extremely narrow viewports (320px), tables with 4+ columns will require scrolling -- this is expected and acceptable.

**Images:** Content images scale to fit the content width. They never exceed their natural dimensions on desktop (no upscaling). On mobile, they fill the content width. Aspect ratio is always preserved. `<Image />` component handles responsive sizing at build time.

---

## Supplementary Screen Details

### 404 Page (`/404`) -- S-09

**Mobile layout:**

- Header: standard
- Content area (centered, chrome background):
  - Clear heading: "Page not found" (h1)
  - Brief, human message: "The page you are looking for does not exist or has been moved."
  - Two recovery links (full-width buttons or prominent link blocks, 44px minimum height):
    - "Browse articles" -> `/articles`
    - "Go to homepage" -> `/`
  - Optional: 2-3 recent article links below the recovery links (provides immediate value and keeps the visitor on-site)
- Footer: standard

**Desktop:** Same content, centered at 680px max-width. Recovery links may be side by side.

This page is a primary surface for visitors arriving via broken social links or old WordPress URLs. It must be helpful, not clever. No jokes, no elaborate illustrations -- just clear paths to real content.

---

### Build Log Index (`/log`) -- S-04

**Mobile layout:**

- Header: standard
- Page header: "Build Log" title, brief description (1 sentence)
- Log entries: stacked vertically, reverse chronological
  - Each entry:
    - Date (prominent -- this is the primary visual anchor, per PRD Section 9)
    - Title (linked to log entry page)
    - First 1-2 sentences as preview text (pulled from markdown body, not from frontmatter -- build logs have no `description` field)
  - No reading time, no hero, no excerpt
  - Visually lighter treatment than article index: smaller type scale for titles, more compact spacing
  - Each entry is a tappable block, 44px minimum height
- Footer: standard

**Desktop:** Content centered at 680px max-width. Same single-column layout.

**Empty state:** If all build log entries have `draft: true`, display "Build log entries coming soon." Same approach as article index empty state.

---

### Build Log Entry (`/log/:slug`) -- S-05

**Mobile layout:**

- Header: standard
- Log header:
  - Title (h1, but smaller scale than article titles to signal lighter weight)
  - Date (prominent, immediately below title)
  - Tags (if present, inline, muted)
  - No reading time (AC-004-2)
  - No description excerpt (AC-004-2)
- Log body: rendered markdown, same typography as articles but shorter content (200-1000 words per BR-007)
- AI disclosure: present (standardized component)
- No previous/next navigation (AC-004-2)
- Footer: standard

**Desktop:** Content centered at 680px max-width.

**Key difference from article pages:** Build logs are visually lighter. Smaller title, no reading time, no prev/next navigation, date-prominent rather than title-prominent. The goal is to signal "this is a quick operational update, not a deep article."

---

### Legal Pages (`/privacy`, `/terms`) -- S-10, S-11

**Mobile layout:**

- Header: standard
- Page title (h1)
- Body text: standard prose rendering, same typography as articles
- No special design treatment (PRD Section 9)
- Footer: standard

**Desktop:** Content centered at 680px max-width.

These pages exist for legal compliance. They use the article surface background and standard typography. No design innovation needed.

---

## Accessibility Interaction Requirements

These requirements are specified in the PRD (US-007, Section 13) and have direct interaction design implications.

| Requirement                         | Interaction Design Implication                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skip-to-content link (AC-007-9)     | First focusable element on every page. Visually hidden until it receives keyboard focus, then displayed prominently (e.g., fixed position at top of viewport with accent background). Activating it moves focus to `<main>`.                                                               |
| Visible focus indicators (AC-007-6) | Every interactive element (links, nav items, hamburger toggle, card links) must show a visible focus ring when reached via keyboard. The ring must be distinct against both chrome (#1a1a2e) and surface (#242438) backgrounds. Recommend: 2px solid accent color outline with 2px offset. |
| 44px touch targets (AC-007-7)       | All tappable elements on mobile: nav links in expanded menu, article card links, portfolio card links, prev/next links, footer links, social links, legal links, RSS link. Padding expands the touch area where the visual element is smaller than 44px.                                   |
| `lang="en"` (AC-007-8)              | Set on `<html>` element in the base layout. No interaction implication, but required.                                                                                                                                                                                                      |
| Keyboard navigation                 | All navigation is reachable via Tab. The `<details>/<summary>` mobile nav is natively keyboard accessible. Focus order follows document order (header -> skip link target -> main content -> footer).                                                                                      |
| Color independence                  | Status badges on portfolio cards use text labels ("Launched", "Active", "In Development", "Lab"), not color alone. If badges also have colored backgrounds, the text label is the primary information carrier.                                                                             |
| `prefers-reduced-motion`            | If any CSS transitions are used (hover effects on portfolio cards, smooth scroll), they are disabled when the user has requested reduced motion. At Phase 0 with zero JavaScript, this is primarily relevant to CSS transitions on hover states.                                           |

---

## Navigation Depth Audit

Maximum taps/clicks from the homepage to reach any content:

| Destination                    | Path                                              | Taps from Homepage           |
| ------------------------------ | ------------------------------------------------- | ---------------------------- |
| Any article                    | Home -> Articles -> Article                       | 2                            |
| Any build log                  | Home -> (footer or nav) -> Log Index -> Log Entry | 2 (via direct nav to `/log`) |
| Portfolio                      | Home -> Portfolio                                 | 1                            |
| Methodology                    | Home -> Methodology                               | 1                            |
| Specific venture site          | Home -> Portfolio -> Venture link                 | 2                            |
| RSS feed                       | Home -> (footer RSS link)                         | 1                            |
| Privacy/Terms                  | Home -> (footer link)                             | 1                            |
| Recent article (from any page) | Any page -> (footer recent article link)          | 1                            |

All primary features are reachable within 2 taps from the homepage. The flat site architecture and persistent header/footer navigation ensure this constraint is met.

---

## Open Questions for Design Brief Panel

1. **Portfolio card interaction on mobile:** Should the entire card be tappable for live ventures (larger touch target, simpler interaction) or should only the "Visit" link be tappable (more explicit, less accidental navigation)? Recommendation: entire card is the link for live ventures, with clear visual affordance.

2. **Article index vs. combined content index:** The PRD specifies separate indexes for articles (`/articles`) and build logs (`/log`). Should the footer "Recent articles" section include build logs, or only articles? The RSS feed includes both. Recommendation: footer shows only articles (they are the premium content); build logs are discoverable via the `/log` index and RSS.

3. **Methodology page position in nav:** The PRD places it third in the nav (Home, Portfolio, Methodology, Articles). For the Jordan persona, Methodology is the primary destination. Should it move to second position (Home, Methodology, Portfolio, Articles)? Recommendation: keep PRD order -- Portfolio before Methodology puts the evidence before the explanation, which is the stronger persuasion sequence for skeptical visitors.
