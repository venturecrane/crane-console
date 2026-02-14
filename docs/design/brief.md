# Venture Crane Website — Design Brief

> Synthesized from 1-round, 4-role design brief process. Generated 2026-02-13.
> Design Maturity: Greenfield

## Table of Contents

1. Product Identity
2. Brand Personality & Design Principles
3. Target User Context
4. Visual Language
5. Screen Inventory & Key Screens
6. Interaction Patterns
7. Component System Direction
8. Technical Constraints
9. Inspiration & Anti-Inspiration
10. Design Asks
11. Open Design Decisions

---

## 1. Product Identity

**Product Name:** Venture Crane Website (venturecrane.com)

**Tagline:** "The product factory that shows its work."

> _Target User reaction:_ "That tagline doesn't grab me. It sounds like a tagline. The alternative — 'How one person and a team of AI agents build real software' — is much better because it tells me what I'm looking at. It's specific. It's unusual. 'Product factory' is abstract. 'One person and a team of AI agents' is concrete and interesting."

**What it is:** A static, content-driven marketing site that publishes the operational reality of building products with AI agents — costs, failures, methodology, and metrics.

**What it is NOT:** A SaaS product, a lead generation funnel, a dashboard, or an application with user accounts.

**Organizational position:** Venture Crane sits at the head of the SMDurgan, LLC enterprise, above all ventures. The website is the hub that connects the portfolio brands (Durgan Field Guide, Kid Expenses, Draft Crane, Silicon Crane) through a central narrative.

**Brand voice:** Direct, technical, evidence-based. Show the work. No marketing fluff. The content itself is the marketing.

---

## 2. Brand Personality & Design Principles

### Personality Traits

| Trait           | Description                                                                                                                                                             | This, Not That                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Rigorous**    | Claims backed by evidence — session counts, API costs, failure modes, real configurations. Clean structure, precise spacing, no decorative flourishes.                  | Precise, not sterile. Engineering notebook, not corporate template.             |
| **Direct**      | Says what it means without hedging. One-sentence hero. One-paragraph elaboration. No progressive disclosure for its own sake.                                           | Blunt, not cold. Respects the reader's time.                                    |
| **Transparent** | Publishes costs, failures, kill decisions. AI disclosure is a feature, not a disclaimer. Honest status badges on portfolio.                                             | Honest, not confessional. Structural transparency, not emotional vulnerability. |
| **Grounded**    | Four ventures, one launched. Status badges say "In Development" and "Lab" without spin. Concrete over conceptual.                                                       | Understated, not self-deprecating.                                              |
| **Technical**   | Monospace accents. Code blocks that render as well as Stripe's documentation. System fonts, sub-1s load, zero JS — the technical execution is itself a brand statement. | Practitioner-grade, not developer-aesthetic cosplay.                            |

### Design Principles (Priority Order)

1. **Content Supremacy.** Every visual decision optimizes for reading. The design system is a frame for content — never the subject. Typography, spacing, contrast, and content width exist to serve long-form technical prose.

2. **Earned Complexity.** Nothing appears on screen unless it earns its place through function. No decorative borders, no gradients, no parallax. The most visually complex element on any page is a syntax-highlighted code block, because that complexity serves the reader.

3. **Performance as Brand.** Sub-1s load, zero JavaScript, system fonts, < 50 KB gzipped. When Alex checks the network tab and sees zero external requests, that's a trust signal as powerful as any written content.

4. **Contrast and Legibility First.** All text-background pairings pass WCAG AA (4.5:1 for normal text, 3:1 for large text). Contrast is checked before aesthetics.

5. **Structural Honesty.** The visual hierarchy reflects the information hierarchy. The homepage hero is prominent because identity comes first. Build logs receive lighter treatment than articles because they carry less editorial weight.

6. **System Consistency.** Every color, spacing value, font size, and component follows the design token system. No one-off values. An AI agent can build a new page without design review and it will look correct.

7. **Quiet Differentiation.** The dark theme is the primary visual differentiator from competitors (all use light themes). The indigo accent separates from generic dark-mode sites. But differentiation is through quality of execution, not visual novelty.

---

## 3. Target User Context

> _The following is synthesized from first-person user reactions. The target user is a composite of three PRD personas: Alex (senior engineer), Jordan (indie founder), and Sam (curious observer)._

**Who they are:** Technical builders with high quality bars and low patience. Alex leads a team of six engineers, follows Simon Willison daily, has 40+ RSS feeds, and gives a new site 90 seconds before deciding. Jordan runs a $6K/month product and wants the operational manual — the boring details nobody publishes. Sam is a PM or VC associate who clicked a Slack link with zero context and 10 seconds of patience.

**Emotional state:** Mildly curious but deeply skeptical. Everyone is claiming something revolutionary with AI. They've been burned by enough hype to be suspicious of anyone saying they're running a "product factory."

**Environment:** Phone-first discovery (X, Slack, HN link). Laptop for deep reading. Comparing unconsciously to Stripe's blog, React docs, Simon Willison, Linear. These are the baselines — not average corporate sites.

**What earns trust:**

- Portfolio cards with real product names, real status badges, and links to real working products
- Article titles that are specific, not clever ("What Running 4 Products with AI Agents Actually Costs")
- Fast loading, clean code, zero JavaScript — the site itself as evidence that the methodology works
- The AI disclosure presented as a feature, not a disclaimer

**What breaks trust:**

- Template-looking design ("I've seen this Astro template before")
- Default Tailwind indigo accent ("screams 'I did not choose a color'")
- Any animation or transition on page load
- Portfolio links that go to sites that look bad
- Light code blocks inside a dark-themed site
- Any hint of "subscribe to my newsletter" urgency
- Dark theme that causes eye strain after 5 minutes of reading

**Make-or-break moments:**

1. **First 5 seconds on homepage** — Sam must answer "what is this?" or they leave
2. **Article reading experience** — must be invisible (if you notice the font, the line length is wrong)
3. **Portfolio click-through** — Jordan clicks through to a venture site to verify the methodology produces quality output

---

## 4. Visual Language

### Color System

**Critical finding:** The PRD's placeholder accent `#6366f1` (indigo-500) fails WCAG AA for normal text on both backgrounds (3.82:1 on chrome, 3.40:1 on surface). It must be replaced. The Target User confirmed: "that exact shade of indigo is the default Tailwind indigo and I see it on every developer side project on the internet."

#### Chrome (Site Structure)

| Token          | Hex       | Usage                               | Contrast vs `#e8e8f0` |
| -------------- | --------- | ----------------------------------- | --------------------- |
| `chrome`       | `#1a1a2e` | Header, footer, homepage background | 14.00:1 (PASS AA)     |
| `chrome-light` | `#1e1e36` | Nav hover states, subtle elevation  | 13.32:1 (PASS AA)     |

PRD values endorsed. The deep indigo-navy creates a professional, immersive environment that differentiates from every competitor's light theme.

#### Surface (Content Areas)

| Token            | Hex       | Usage                                 | Contrast vs `#e8e8f0` |
| ---------------- | --------- | ------------------------------------- | --------------------- |
| `surface`        | `#242438` | Article body, methodology, build logs | 12.45:1 (PASS AA)     |
| `surface-raised` | `#2a2a42` | Cards, blockquotes                    | 11.42:1 (PASS AA)     |

PRD values endorsed. The subtle lift from `#1a1a2e` to `#242438` creates the hybrid dark theme's two-tier structure.

#### Text

| Token          | Hex       | Usage                           | vs Chrome | vs Surface |
| -------------- | --------- | ------------------------------- | --------- | ---------- |
| `text`         | `#e8e8f0` | Body copy, headings             | 14.00:1   | 12.45:1    |
| `text-muted`   | `#a0a0b8` | Dates, reading time, meta       | 6.67:1    | 5.93:1     |
| `text-inverse` | `#1a1a2e` | Dark text on accent backgrounds | —         | —          |

Muted text resolves PRD's "TBD" for secondary text color.

#### Accent (Brand Color — Replaces PRD Placeholder)

| Token          | Hex       | Usage                                              | vs Chrome | vs Surface |
| -------------- | --------- | -------------------------------------------------- | --------- | ---------- |
| `accent`       | `#818cf8` | Links, active states, primary interactive elements | 5.72:1    | 5.09:1     |
| `accent-hover` | `#a5b4fc` | Link hover, focus rings                            | 8.56:1    | 7.61:1     |
| `accent-muted` | `#7e83f7` | Tags, status indicators                            | 5.26:1    | 4.68:1     |
| `accent-bg`    | `#1e1b4b` | Accent-tinted backgrounds (inline code)            | —         | —          |

Indigo-400 (`#818cf8`) selected by founder. Rationale: stays in the indigo family established by the PRD, avoids the overused teal/green in the dev tool space, and passes WCAG AA on all backgrounds. A lighter step up from the original `#6366f1` (indigo-500) which failed contrast requirements.

#### Code Block

| Token         | Hex       | Usage                            | Notes                                                       |
| ------------- | --------- | -------------------------------- | ----------------------------------------------------------- |
| `code-bg`     | `#14142a` | Code block background            | Darker than chrome — recessed effect within article surface |
| `code-border` | `#2a2a44` | Subtle border around code blocks | 1.31:1 vs code-bg                                           |

#### Semantic Colors

| Token     | Hex       | Usage                          | vs Chrome | vs Surface |
| --------- | --------- | ------------------------------ | --------- | ---------- |
| `success` | `#4ade80` | Launched status badge          | 9.79:1    | 8.70:1     |
| `warning` | `#eab308` | In-development status          | 8.89:1    | 7.91:1     |
| `error`   | `#f87171` | Error states, breaking changes | 6.17:1    | 5.48:1     |
| `info`    | `#60a5fa` | Informational callouts         | 6.71:1    | 5.97:1     |

All semantic colors pass WCAG AA on both backgrounds.

#### Status Badge Colors (Portfolio Cards)

| Status         | Text      | Background | Contrast |
| -------------- | --------- | ---------- | -------- |
| Launched       | `#5eead4` | `#1a2e2e`  | 9.63:1   |
| Active         | `#4ade80` | `#1a2a1e`  | 8.65:1   |
| In Development | `#facc15` | `#2a2a1a`  | 9.49:1   |
| Lab            | `#c4b5fd` | `#2a1a2a`  | 8.89:1   |

Status badges use tinted backgrounds with colored text. Text labels are always present — color is supplementary, not the sole differentiator.

#### Border and Divider

| Token           | Hex       | Usage                                 |
| --------------- | --------- | ------------------------------------- |
| `border-subtle` | `#2a2a44` | Card borders, section dividers        |
| `border-medium` | `#333352` | Table borders, stronger separators    |
| `border-strong` | `#3d3d5c` | High-contrast borders, focus outlines |

### Typography

**Font strategy:** System fonts only. Zero network requests. The site loads in the reader's native typeface, which is the most readable option on their device.

```css
--vc-font-body:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
  'Helvetica Neue', sans-serif;

--vc-font-mono:
  ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
```

**Type Scale:**

| Element       | Size             | Line Height | Weight | Letter Spacing | Notes                                  |
| ------------- | ---------------- | ----------- | ------ | -------------- | -------------------------------------- |
| H1            | 36px (2.25rem)   | 1.2         | 700    | -0.02em        | Article titles, page titles            |
| H2            | 28px (1.75rem)   | 1.3         | 600    | -0.01em        | Major sections                         |
| H3            | 22px (1.375rem)  | 1.4         | 600    | 0              | Subsections                            |
| H4            | 18px (1.125rem)  | 1.5         | 600    | 0.01em         | Minor headings                         |
| Body          | 18px (1.125rem)  | 1.7         | 400    | 0              | Article prose, 680px width             |
| Body (mobile) | 16px (1rem)      | 1.6         | 400    | 0              | Below 640px                            |
| Small / meta  | 14px (0.875rem)  | 1.5         | 400    | 0.01em         | Dates, reading time                    |
| Caption       | 13px (0.8125rem) | 1.4         | 400    | 0.02em         | Image captions, disclosure             |
| Code          | 15px (0.9375rem) | 1.6         | 400    | 0              | Inline and block                       |
| Nav           | 15px (0.9375rem) | 1           | 500    | 0.03em         | Header links                           |
| Wordmark      | 20px (1.25rem)   | 1           | 700    | 0.05em         | "VENTURE CRANE" — uppercase, monospace |

**Heading spacing** uses asymmetric margins: more space above (separating) than below (binding):

| Element | Margin Top | Margin Bottom |
| ------- | ---------- | ------------- |
| H2      | 48px       | 16px          |
| H3      | 32px       | 12px          |
| H4      | 24px       | 8px           |

**Paragraph spacing:** 24px (1.5x base unit).

**Content width:** 680px maximum (~70 characters at 18px). PRD specification, unanimously endorsed.

**Wordmark:** "VENTURE CRANE" — monospace font stack, uppercase, 0.05em letter-spacing, weight 700. Text-based (no logo file, no SVG). Color: `#e8e8f0` (primary text). The wordmark is structurally neutral — the content is the brand.

### Spacing System

**Base unit:** 4px. All spacing values are multiples of 4px.

| Token      | Value | Usage                                             |
| ---------- | ----- | ------------------------------------------------- |
| `space-1`  | 4px   | Tight gaps (icon-to-text, badge padding)          |
| `space-2`  | 8px   | Compact spacing (inline code padding, tag gaps)   |
| `space-3`  | 12px  | Small spacing (card internal padding)             |
| `space-4`  | 16px  | Default spacing (component margins)               |
| `space-6`  | 24px  | Section spacing (paragraph margins, card padding) |
| `space-8`  | 32px  | Major spacing (between page sections)             |
| `space-10` | 40px  | Large spacing (above H2 headings)                 |
| `space-12` | 48px  | Page section gaps                                 |
| `space-16` | 64px  | Page-level spacing (desktop)                      |
| `space-20` | 80px  | Maximum spacing (footer separation)               |

### Imagery & Iconography

**Icon style:** Outline, 1.5px stroke weight. Lighter visually, appropriate for a content-focused site. Render cleanly at small sizes on dark backgrounds.

**Icon library:** Lucide (open-source, ISC license, tree-shakeable). Inline SVG at build time — zero runtime JS, zero external requests.

**Required icons at MVP:**

| Icon                         | Usage                        |
| ---------------------------- | ---------------------------- |
| `external-link`              | Portfolio card venture links |
| `rss`                        | RSS feed link in footer      |
| `github`                     | GitHub profile link          |
| `calendar`                   | Publication date             |
| `clock`                      | Reading time                 |
| `arrow-left` / `arrow-right` | Previous/next article        |
| `menu` / `x`                 | Mobile nav toggle            |

**Icon sizing:** Match adjacent text — 18px with body text, 14px with meta text, 20px for nav, 24px for footer social links.

**Icon color:** Inherit adjacent text color. Interactive icons use accent color with hover treatment.

**No illustrations or photography at MVP.** If diagrams are added post-launch, they should be technical (architecture, flow charts) rendered as SVGs in the accent palette.

**OG image (Phase 0):** 1200x630px PNG. Chrome background (`#1a1a2e`), wordmark in `#e8e8f0`, tagline in `#a0a0b8`, subtle indigo accent element. Dark, clean, typographic — looks like the site itself.

---

## 5. Screen Inventory & Key Screens

### Screen Inventory

| #    | Screen           | URL               | PRD Feature | Purpose                                           | Primary Action                |
| ---- | ---------------- | ----------------- | ----------- | ------------------------------------------------- | ----------------------------- |
| S-01 | Homepage         | `/`               | F-001       | Establish identity, surface portfolio and content | Scan portfolio, click article |
| S-02 | Article Index    | `/articles`       | F-002       | Browse all articles by date                       | Click article to read         |
| S-03 | Article Page     | `/articles/:slug` | F-002       | Read a full technical article                     | Read to completion            |
| S-04 | Build Log Index  | `/log`            | F-007       | Browse build log entries                          | Click entry to read           |
| S-05 | Build Log Entry  | `/log/:slug`      | F-007       | Read a build log entry                            | Read to completion            |
| S-06 | Portfolio Page   | `/portfolio`      | F-003       | Evaluate venture portfolio                        | Click through to live venture |
| S-07 | Methodology Page | `/methodology`    | F-004       | Understand how VC operates                        | Read overview, explore links  |
| S-08 | RSS Feed         | `/feed.xml`       | F-006       | Subscribe via RSS                                 | Add to reader                 |
| S-09 | 404 Page         | `/404`            | F-008       | Recover from broken link                          | Navigate to articles or home  |
| S-10 | Privacy Policy   | `/privacy`        | F-005       | Legal disclosure                                  | Read                          |
| S-11 | Terms of Use     | `/terms`          | F-005       | Legal disclosure                                  | Read                          |

### Key Screen: Article Page (`/articles/:slug`)

The article page is the core product. The reading experience must be invisible — "if I notice the font, the line length is wrong."

**Mobile layout (< 640px):**

- Header: wordmark left, hamburger right (CSS-only `<details>/<summary>`)
- Skip-to-content link (visually hidden until focused)
- Article header: title (h1, wraps, never truncates), meta row (date, reading time, author), updated date if present
- Article body: 16px/1.6, full width minus 16px padding each side
  - Code blocks: full-width, horizontal scroll, right-edge shadow, distinct background
  - Tables: scrollable container, right-edge shadow
  - Blockquotes: left accent border, slightly indented
- AI disclosure: horizontal rule, text, link to methodology
- Previous/next nav: stacked vertically, 44px touch targets
- Footer

**Desktop (>= 1024px):**

- Body constrained to 680px, centered
- 18px/1.7 body text
- Previous/next side by side

**States:**

- Empty: N/A (pages generated at build time; missing slugs → 404)
- Loading: Static HTML, progressive browser rendering
- Error: 404 page

### Key Screen: Homepage (`/`)

**Mobile layout:**

- Hero: one-sentence identity statement (h1, above fold on 375px) + 50-word elaboration
- Portfolio: 4 venture cards stacked, ordered by status (Launched > Active > In Dev > Lab)
  - Live: entire card tappable, external link icon, new tab
  - Pre-launch: no link, default cursor, status badge only
- Recent articles: 3–5 cards with title, date, excerpt
- Footer

**Desktop:** Hero centered at 680px. Portfolio cards in 2x2 grid. Articles single-column.

**Empty state:** If all articles are drafts, the recent articles section is hidden entirely (no "coming soon").

### Key Screen: Portfolio Page (`/portfolio`)

**Mobile layout:**

- Page header: title, 1–2 sentence intro
- Venture cards stacked, ordered by status
  - Each: name, description (2–3 sentences), status badge, tech stack tags, conditional link
  - Live ventures: "Visit [name]" link, external icon, new tab, hover state on desktop
  - Pre-launch: no link, no hover, default cursor
- "Last updated" date
- Footer

**Desktop:** Single-column centered at 680px (descriptions benefit from readable line lengths).

### Key Screen: Methodology Page (`/methodology`)

**Mobile layout:**

- Overview prose (~500–800 words): what VC is, how it works, development approach
- Founder identity: name, 1–2 sentence background, links to X and GitHub
- Related articles: conditional — only renders when methodology articles exist
- "Last updated" date
- Footer

### Key Screen: Article Index (`/articles`)

- All non-draft articles in reverse chronological order
- Each entry: title (linked), date, description (max 160 chars), reading time
- No pagination at launch
- Empty state: "Content coming soon."

---

## 6. Interaction Patterns

### Navigation Model

**Header (all pages):** Wordmark (home link) + 4 nav links: Home, Portfolio, Methodology, Articles. Active page indicated via accent color or underline.

**Footer (all pages):** Venture links (external, new tab), Social (X, GitHub), Recent articles (2–3), Legal (Privacy, Terms), RSS link.

**Mobile nav (< 640px):** CSS-only `<details>/<summary>` pattern. Hamburger icon transforms to X when open. Nav items stack vertically, 44px min touch targets. Natively keyboard accessible.

**Maximum depth:** 2 taps from homepage to any content (homepage → index → detail).

**No breadcrumbs.** The site is flat. Header nav provides sufficient orientation.

### User Flows

**Flow 1: Article discovery via social link (Alex)**

1. Sees OG preview on HN/X → clicks link
2. Article loads sub-1s → reads title, date, reading time
3. Reads article (5–15 min) → code blocks, tables render cleanly
4. Reaches AI disclosure → notes it, respects it
5. Previous/next links → reads second article
6. Footer → finds RSS → subscribes

**Flow 2: Homepage evaluation (Sam)**

1. Arrives at homepage → hero visible above fold
2. Reads identity statement in < 5 seconds
3. Scrolls to portfolio → sees real products with real status badges
4. Clicks venture link → new tab opens → evaluates product
5. Returns to VC tab → scans articles → maybe reads one
6. Total time: 2–5 minutes

**Flow 3: Methodology deep-dive (Jordan)**

1. Arrives at methodology → reads 500–800 word overview
2. Checks founder identity → clicks GitHub → verifies real person
3. Follows related article link → reads 10–15 minutes
4. Navigates to portfolio → clicks through to venture site
5. Evaluates whether methodology produces quality output
6. Bookmarks methodology page → subscribes to RSS

### Feedback Patterns (Static Site)

| Scenario                         | Mechanism                      |
| -------------------------------- | ------------------------------ |
| Page not found                   | Custom 404 with recovery links |
| Empty content sections           | Section hidden entirely        |
| Current page                     | Active nav indicator           |
| External links                   | External-link icon + new tab   |
| Scrollable content (tables/code) | Right-edge shadow              |

### Responsive Strategy

| Component       | Mobile (< 640px) | Tablet (640–1023px) | Desktop (>= 1024px) |
| --------------- | ---------------- | ------------------- | ------------------- |
| Header nav      | Hamburger        | Inline horizontal   | Inline horizontal   |
| Content width   | Full - 32px      | 680px centered      | 680px centered      |
| Body text       | 16px / 1.6       | 18px / 1.7          | 18px / 1.7          |
| Portfolio cards | 1 column         | 1–2 columns         | 2 columns           |
| Prev/next nav   | Stacked          | Side by side        | Side by side        |
| Footer          | 1 column         | 2–3 columns         | 3–4 columns         |
| Touch targets   | 44px minimum     | 44px minimum        | Hover available     |

---

## 7. Component System Direction

### Component Inventory (14 Components)

| #   | Component       | Purpose                                | Variants                                      | ARIA Pattern                                   | Status |
| --- | --------------- | -------------------------------------- | --------------------------------------------- | ---------------------------------------------- | ------ |
| 1   | `Header`        | Site header with wordmark + nav        | `default`                                     | `banner`, `navigation` landmarks               | New    |
| 2   | `MobileNav`     | CSS-only collapsed nav (≤ 640px)       | `default`                                     | `navigation`, `disclosure` (`details/summary`) | New    |
| 3   | `Footer`        | Venture links, social, recent articles | `default`                                     | `contentinfo` landmark                         | New    |
| 4   | `ArticleCard`   | Article preview in listings            | `default`, `compact`                          | `article` landmark                             | New    |
| 5   | `LogEntry`      | Build log preview in listings          | `default`                                     | `article` landmark                             | New    |
| 6   | `PortfolioCard` | Venture card with status + link        | `live`, `prelaunch`                           | `article` landmark                             | New    |
| 7   | `ArticleMeta`   | Date, reading time, updated date       | `full`, `compact`                             | Inline metadata                                | New    |
| 8   | `AIDisclosure`  | AI authorship disclosure               | `default`, `anonymous`                        | `note` role                                    | New    |
| 9   | `SkipLink`      | Skip-to-content keyboard link          | `default`                                     | Skip navigation                                | New    |
| 10  | `StatusBadge`   | Venture status indicator               | `launched`, `active`, `in-development`, `lab` | `status` role + text label                     | New    |
| 11  | `ExternalLink`  | New-tab link with icon                 | `default`                                     | `link` + "(opens in new tab)"                  | New    |
| 12  | `CodeBlock`     | Shiki code wrapper with scroll         | `default`                                     | `region` + `tabindex="0"`                      | New    |
| 13  | `TableWrapper`  | Responsive table with scroll           | `default`                                     | `region` + `tabindex="0"`                      | New    |
| 14  | `PageHead`      | Centralized `<head>` management        | `default`                                     | Document metadata                              | New    |

### Design Token Architecture

**Naming convention:** `--vc-{category}-{element}-{modifier}` — venture-prefixed to prevent collisions across the portfolio.

**Token categories:** Color (22 tokens), Spacing (12-step scale on 4px base), Typography (families, sizes, line-heights, weights), Radius (4 steps: 4px, 8px, 12px, pill), Shadow (4 tokens including scroll indicators), Motion (4 durations, 3 easing curves with `prefers-reduced-motion` collapse).

**CSS strategy:** Three layers:

1. **CSS custom properties** (`global.css`) — source of truth
2. **Tailwind utility classes** — primary styling mechanism, referencing custom properties
3. **Component-scoped styles** (Astro `<style>`) — only for prose styling and complex selectors (`.vc-prose`)

**Tailwind config** references CSS custom property values (e.g., `'var(--vc-color-chrome)'`) rather than hardcoded hex, keeping the token layer as single source of truth.

---

## 8. Technical Constraints

### Performance Budget

| Metric             | Target                                   |
| ------------------ | ---------------------------------------- |
| FCP                | < 800ms on simulated 3G                  |
| LCP                | < 1000ms on simulated 3G                 |
| CLS                | < 0.05                                   |
| TBT                | 0ms (zero JavaScript)                    |
| CSS (entire site)  | < 12 KB gzipped                          |
| Total homepage     | < 50 KB gzipped                          |
| Total article page | < 60 KB gzipped                          |
| JavaScript         | 0 KB (CF Analytics injected by platform) |
| Lighthouse scores  | >= 95 all categories, SEO = 100          |

### Dark Mode Implementation

Single dark theme at MVP — no light mode, no toggle. The dark theme is brand identity, not a user preference.

**Surface hierarchy:**

- Chrome (`#1a1a2e`): header, footer, homepage, portfolio, 404
- Surface (`#242438`): article reading area, methodology, build logs
- Raised (`#2a2a42`): cards, blockquotes
- Code (`#14142a`): code blocks (recessed, darker than chrome)

Hard edge between chrome and surface — no gradient.

**Future light theme** requires only redefining `--vc-*` values under a new selector. No structural CSS changes.

### Accessibility (WCAG 2.1 AA)

- **Focus:** 2px solid `#c7d2fe` outline, 2px offset. Visible on both chrome and surface backgrounds.
- **Keyboard:** Natural tab order. `<details>/<summary>` natively keyboard accessible. Scrollable regions get `tabindex="0"`.
- **Skip navigation:** First focusable element on every page.
- **Color independence:** Status badges use text labels. Links are underlined. Code highlighting uses font weight/style in addition to color.
- **Reduced motion:** All motion tokens collapse to 0ms under `prefers-reduced-motion: reduce`.
- **Screen reader:** `<time>` elements with `datetime`. External links announce "(opens in new tab)". Single `<h1>` per page, no skipped levels.

### Animation & Motion

Motion is minimal and functional. Nothing animates on page load. Nothing bounces, pulses, or slides in.

| Interaction                      | Duration        | Easing       |
| -------------------------------- | --------------- | ------------ |
| Link hover color                 | 150ms           | ease-default |
| Card hover (live portfolio only) | 150ms           | ease-default |
| Focus ring                       | 100ms           | ease-default |
| Mobile nav toggle                | Browser default | Native       |

**Everything else does not animate:** page transitions, content scroll, card entrance, hero section, status badges, code blocks, table scroll indicators.

---

## 9. Inspiration & Anti-Inspiration

### Inspiration

| Reference          | URL               | What to Take                                                                                                                                                                                            |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linear**         | linear.app        | Dark theme execution. Surface-level differentiation. Restrained accent usage. Monochrome-plus-one-accent system. Proves dark UI can feel premium without being heavy.                                   |
| **Stripe Docs**    | docs.stripe.com   | Gold standard for technical content. Code blocks, tables, and prose coexist without conflict. Reading experience at 680px is the benchmark.                                                             |
| **Vercel Blog**    | vercel.com/blog   | Article card design. Listing-to-article transition. Meta information hierarchy. Dark-mode technical blog that reads well.                                                                               |
| **Oxide Computer** | oxide.computer    | Dark palette with strong technical identity. "Built by engineers for engineers" without cliches. Spacious feel on dark backgrounds.                                                                     |
| **Simon Willison** | simonwillison.net | Content-first architecture. Content density. Absence of non-functional decoration. Quality floor for content; visual differentiation opportunity (VC's dark theme vs. Willison's light, basic styling). |

### Anti-Inspiration

| Reference                     | What to Avoid                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI startup landing pages**  | Gradients, floating 3D objects, particle effects, glassmorphism. If a design element could appear on an AI tool's landing page, it should not appear on venturecrane.com. |
| **Medium / Substack**         | Homogenized design. Serif body fonts. Prominent subscribe CTAs. Social proof counters. Cookie consent banners. Platform aesthetics that make every site look the same.    |
| **Pieter Levels / levels.io** | Revenue-brag aesthetics. Revenue counters, shipping streaks, product count badges. VC differentiates on methodology over metrics — "how we build" not "how much we make." |

---

## 10. Design Asks

Specific, actionable design tasks extracted from all contributions.

| #     | Ask                       | Description                                                                                                                                                                                   | Priority | Source                                |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| DA-01 | ~~Resolve accent color~~  | **RESOLVED.** `#818cf8` (indigo-400) selected by founder 2026-02-14. Passes WCAG AA on all backgrounds.                                                                                       | ~~P0~~   | Brand Strategist, Design Technologist |
| DA-02 | ~~Verify Shiki theme~~    | **RESOLVED.** `github-dark` selected — 14/14 token types pass 4.5:1 against `#14142a`. No overrides needed. See ODD-3.                                                                        | ~~P0~~   | Design Technologist, Target User      |
| DA-03 | Design the wordmark       | Implement "VENTURE CRANE" text wordmark — monospace, uppercase, 0.05em tracking, weight 700. Verify rendering across system font stacks.                                                      | P1       | Brand Strategist                      |
| DA-04 | OG image design           | Create the Phase 0 OG image (1200x630px). Chrome background, wordmark, tagline, subtle teal element. Test on X Card Validator and LinkedIn.                                                   | P1       | Brand Strategist                      |
| DA-05 | Mobile nav testing        | Build and test the CSS-only `<details>/<summary>` mobile nav. Verify no visual jump, smooth feel, hamburger-to-X transition, 44px touch targets. Test on Safari iOS, Chrome Android, Firefox. | P1       | Target User, Interaction Designer     |
| DA-06 | Dark theme reading test   | Read a 2,000-word article on the actual built site for sustained comfort. Verify the chrome-to-surface transition is noticeable but not jarring. Test in low-light and daylight conditions.   | P1       | Target User                           |
| DA-07 | Portfolio card design     | Design live vs. pre-launch card states. Live: hover effect, external link icon, tappable area. Pre-launch: no interaction, status badge. Verify the visual difference is clear.               | P1       | Interaction Designer                  |
| DA-08 | Code block styling        | Style code blocks with `#14142a` background, `#2a2a44` border, horizontal scroll, right-edge shadow. Verify readability and visual separation from article surface.                           | P1       | Brand Strategist, Design Technologist |
| DA-09 | Table responsive behavior | Implement scrollable table wrapper with right-edge shadow indicator. Test with 4+ column tables on 320px viewports. Style to match GitHub README rendering — minimal borders, clean rows.     | P1       | Interaction Designer, Target User     |
| DA-10 | AI disclosure component   | Design the disclosure to feel like a natural part of the article footer, not legal fine print. Same visual weight as published date. Not in a box. Not italic.                                | P2       | Target User                           |
| DA-11 | Status badge design       | Design badges to feel like Linear roadmap labels or GitHub project labels — tight, sentence-case, subtle color. Not government form checkboxes.                                               | P2       | Target User                           |
| DA-12 | Hero copy finalization    | Finalize hero identity statement. Consider reader-centric alternative: "How one person and a team of AI agents build real software." Test against the current tagline.                        | P2       | Target User, Brand Strategist         |
| DA-13 | Empty state design        | Design the "Content coming soon" state for article/build log indices when all content is draft. Must feel intentional, not empty.                                                             | P2       | Interaction Designer                  |

---

## 11. Open Design Decisions

### ODD-1: Accent Color Selection — RESOLVED

**Decision:** `#818cf8` (indigo-400). Selected by founder 2026-02-14.

**Rationale:** Stays in the indigo family from the original PRD. Passes WCAG AA on all backgrounds (5.72:1 on chrome, 5.09:1 on surface). Avoids teal, which the founder found undesirable. A single step lighter than the original `#6366f1` (indigo-500) which failed contrast.

**Full accent family:**

| Token          | Hex       | vs Chrome | vs Surface |
| -------------- | --------- | --------- | ---------- |
| `accent`       | `#818cf8` | 5.72:1    | 5.09:1     |
| `accent-hover` | `#a5b4fc` | 8.56:1    | 7.61:1     |
| `accent-muted` | `#7e83f7` | 5.26:1    | 4.68:1     |
| `accent-bg`    | `#1e1b4b` | —         | —          |

### ODD-2: Tagline

**The question:** Should the hero use "The product factory that shows its work" or a reader-centric alternative?

**Options considered:**

- "The product factory that shows its work" — current PRD tagline. Abstract but memorable.
- "How one person and a team of AI agents build real software" — proposed by PRD review panel. Specific and concrete. Target User strongly preferred it.

**Why it matters:** The hero sentence is the 10-second test for the Sam persona. It determines first-visit comprehension.

**Recommendation:** Use the reader-centric alternative. It's more specific, unusual, and tells the visitor what they're looking at rather than making a brand claim.

**Needs:** Founder decision. Can be changed with a single commit.

### ODD-3: Code Block Background Direction — RESOLVED

**Decision:** `#14142a` (recessed) with `github-dark` Shiki theme. Verified 2026-02-14.

**Background:** `#14142a` is darker than chrome, creating a recessed/inset effect that reads naturally to developers (VS Code, terminal conventions).

**Shiki theme audit results:**

| Theme         | Tokens Passing | Notes                                       |
| ------------- | -------------- | ------------------------------------------- |
| `github-dark` | 14/14          | All tokens pass 4.5:1 — no overrides needed |
| `tokyo-night` | 13/14          | Comment `#565f89` fails at 2.92:1           |

**Selected:** `github-dark`. Full token contrast against `#14142a`:

| Token       | Color     | Ratio   |
| ----------- | --------- | ------- |
| keyword     | `#ff7b72` | 7.16:1  |
| string      | `#a5d6ff` | 11.75:1 |
| comment     | `#8b949e` | 5.87:1  |
| function    | `#d2a8ff` | 9.27:1  |
| variable    | `#ffa657` | 9.32:1  |
| constant    | `#79c0ff` | 9.28:1  |
| operator    | `#ff7b72` | 7.16:1  |
| punctuation | `#c9d1d9` | 11.70:1 |
| plain text  | `#c9d1d9` | 11.70:1 |
| tag         | `#7ee787` | 11.75:1 |
| property    | `#d2a8ff` | 9.27:1  |

### ODD-4: Build Log Visual Differentiation

**The question:** How much lighter should build logs be compared to articles?

**Options considered:**

- Smaller title (h2 scale vs. article h1), date-prominent, no reading time, no prev/next — unanimously agreed
- Whether build log entries should use a different background or type treatment from articles

**Recommendation:** Same surface background, same body typography. Differentiate through: smaller title, date as primary anchor, absence of reading time/prev-next/description. The "lighter" treatment is subtractive (remove elements) not stylistically different.

**Needs:** Design spike — mock up 3 build log entries alongside 3 articles.

---

_4 contribution files in `docs/design/contributions/round-1/`, synthesized brief at `docs/design/brief.md`._
