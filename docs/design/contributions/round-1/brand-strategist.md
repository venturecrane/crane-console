# Brand Strategist Contribution -- Design Brief Round 1

**Author:** Brand Strategist
**Date:** 2026-02-13
**Design Maturity:** Greenfield
**PRD Reference:** `docs/pm/prd.md` (venturecrane.com)

---

## Brand Personality

The Venture Crane brand occupies a specific position: it is the visible face of a product factory that publishes its operational reality. The personality must communicate competence without arrogance, transparency without self-indulgence, and technical depth without gatekeeping.

### Trait 1: Rigorous

Venture Crane makes claims backed by evidence -- session counts, API costs, failure modes, real configurations. The visual identity must reinforce this: clean structure, precise spacing, no decorative flourishes. Every design element earns its place.

**This, not that:** Precise, not sterile. The site should feel like a well-organized engineering notebook, not an empty corporate template.

### Trait 2: Direct

The brand says what it means without hedging. The tagline is one sentence. The hero is one paragraph. Articles open with what you will learn, not why the topic matters in a changing world. The design supports this: no progressive disclosure for its own sake, no animations that delay content, no interstitial anything.

**This, not that:** Blunt, not cold. The directness comes from respect for the reader's time, not indifference to their experience.

### Trait 3: Transparent

This is the core differentiator. Venture Crane publishes costs, failures, and kill decisions. The design must make transparency feel natural rather than performative. Real data rendered cleanly. Honest status badges on the portfolio. The AI authorship disclosure presented as a feature, not a disclaimer.

**This, not that:** Honest, not confessional. Transparency is structural (the factory shows its work) rather than emotional (look how vulnerable we are).

### Trait 4: Grounded

Venture Crane builds real products that real people use. The portfolio is modest -- four ventures, one launched -- and the brand does not pretend otherwise. Status badges say "In Development" and "Lab" without spin. The visual language avoids aspirational abstraction. Concrete over conceptual.

**This, not that:** Understated, not self-deprecating. Confidence in the work without overclaiming. The portfolio speaks; the design lets it.

### Trait 5: Technical

The audience is engineers, founders, and operators. The design must pass the practitioner sniff test. Monospace accents in the right places. Code blocks that render as well as Stripe's documentation. A reading experience that respects the craft. System fonts, sub-1s load, zero JavaScript -- the technical execution is itself a brand statement.

**This, not that:** Practitioner-grade, not developer-aesthetic cosplay. The site is fast because performance matters, not because "fast" is a trend.

---

## Design Principles

Ordered by priority. When principles conflict, higher-ranked principles win.

### 1. Content Supremacy

Every visual decision optimizes for reading. Typography, spacing, color contrast, and content width exist to serve long-form technical prose with code blocks, tables, and data. The design system is a frame for content -- never the subject.

**Tradeoff example:** If a visual treatment for portfolio cards conflicts with article readability at the same viewport width, the article wins.

### 2. Earned Complexity

Nothing appears on screen unless it earns its place through function. No decorative borders, no gradient backgrounds, no parallax, no hero images at launch. Elements enter the design system when a specific content need demands them. The most visually complex element on any page should be a syntax-highlighted code block, because that complexity serves the reader.

**Tradeoff example:** A subtle border between the header and content area is earned (it clarifies the visual hierarchy). A decorative line under every heading is not.

### 3. Performance as Brand

Sub-1-second load, zero JavaScript, system fonts, < 50 KB gzipped. These are not just technical requirements -- they are brand statements. When Alex checks the network tab and sees zero external requests, that is a trust signal as powerful as any written content. The design must never compromise this.

**Tradeoff example:** A web font that improves aesthetics by 10% but adds 30 KB and 200ms is rejected. Always.

### 4. Contrast and Legibility First

All text-background pairings pass WCAG AA (4.5:1 for normal text, 3:1 for large text and UI components). This is not a constraint to work around -- it is a filter that prevents bad decisions. When evaluating any color choice, contrast is checked before aesthetics.

**Tradeoff example:** A muted gray that looks elegant but hits 3.8:1 against the surface is rejected in favor of a slightly brighter value that hits 4.5:1.

### 5. Structural Honesty

The visual hierarchy must reflect the information hierarchy. The homepage hero is the most prominent element because identity is the first thing Sam needs. Portfolio cards use honest status badges. Build logs receive a lighter visual treatment than articles because they carry less editorial weight. Nothing is visually elevated beyond its informational importance.

**Tradeoff example:** The methodology page is visually equivalent to an article page. It does not get special visual treatment just because it is strategically important.

### 6. System Consistency

Every color, spacing value, font size, and component follows the design token system. No one-off values. No magic numbers. The system is small enough that an AI agent can build a new page without design review and it will look correct. This is the "sustainable by agents" principle from the PRD, made visual.

**Tradeoff example:** A bespoke hero treatment for the homepage that requires unique CSS is rejected in favor of composing existing tokens.

### 7. Quiet Differentiation

The site must look distinct from competitors (Willison's light theme, Harper Reed's light theme, Latent Space's newsletter layout) without being distinctive for its own sake. The dark theme is the primary visual differentiator. The teal accent separates VC from generic dark-mode sites. But the differentiation is achieved through quality of execution, not visual novelty.

**Tradeoff example:** An animated logo that makes the site memorable but adds JavaScript is rejected. A well-chosen accent color that makes links immediately identifiable is adopted.

---

## Color System

### Critical Finding: PRD Accent Color Fails Accessibility

The PRD's placeholder accent `#6366f1` (indigo-500) fails WCAG AA for normal text on both the chrome background (3.82:1 -- needs 4.5:1) and the article surface (3.40:1). This color cannot be used for body-text links or any normal-weight text element. The indigo-hover value `#818cf8` passes on chrome (5.72:1) but this creates an inconsistency where the default state is inaccessible and the hover state is accessible -- the inverse of correct behavior.

The accent color must be replaced. The recommendation below selects a teal accent that passes AA on all surfaces while providing strong visual identity.

### Rationale for Teal

Teal communicates technical precision without the coldness of pure blue or the overuse of purple in the AI/developer tool space. It differentiates from the existing WordPress site's golden yellow and bright blue, establishing a clean break. It differentiates from portfolio venture identities (DFG, KE, SC, DC should each develop their own palettes). It sits in the cyan-teal family that reads as "engineering" to the target audience -- think terminal output, CI dashboards, and infrastructure monitoring tools -- without being a cliche.

Against the deep indigo-navy dark backgrounds proposed in the PRD, teal provides excellent contrast (8-12:1 ratios) while remaining visually distinctive. It avoids the "generic dark mode" feel of pure white links or the accessibility failures of the proposed indigo.

### Color Palette

#### Chrome (Site Structure)

| Token          | Hex       | Usage                               | Contrast vs #e8e8f0 |
| -------------- | --------- | ----------------------------------- | ------------------- |
| `chrome`       | `#1a1a2e` | Header, footer, homepage background | 14.00:1 (PASS AA)   |
| `chrome-light` | `#1e1e36` | Nav hover states, subtle elevation  | 13.32:1 (PASS AA)   |

PRD values endorsed without modification. The deep indigo-navy creates a professional, immersive reading environment that differentiates from the light themes used by every competitor.

#### Surface (Content Areas)

| Token            | Hex       | Usage                                          | Contrast vs #e8e8f0 |
| ---------------- | --------- | ---------------------------------------------- | ------------------- |
| `surface`        | `#242438` | Article body, methodology page, build log body | 12.45:1 (PASS AA)   |
| `surface-raised` | `#2a2a42` | Cards, portfolio items, blockquotes            | 11.42:1 (PASS AA)   |

PRD values endorsed. The subtle lift from `#1a1a2e` to `#242438` (1.12:1 between surfaces) creates the hybrid dark theme's two-tier structure without a jarring transition.

#### Text

| Token          | Hex       | Usage                                             | Contrast vs chrome | Contrast vs surface |
| -------------- | --------- | ------------------------------------------------- | ------------------ | ------------------- |
| `text`         | `#e8e8f0` | Body copy, headings                               | 14.00:1 (PASS AA)  | 12.45:1 (PASS AA)   |
| `text-muted`   | `#a0a0b8` | Dates, reading time, meta text, captions          | 6.67:1 (PASS AA)   | 5.93:1 (PASS AA)    |
| `text-inverse` | `#1a1a2e` | Dark text on accent backgrounds (badges, buttons) | N/A                | N/A                 |

PRD values endorsed. The muted text value `#a0a0b8` passes AA on all backgrounds, resolving the PRD's "TBD" for secondary text color.

#### Accent (Brand Color -- Replaces PRD Placeholder)

| Token          | Hex       | Usage                                                  | Contrast vs chrome | Contrast vs surface |
| -------------- | --------- | ------------------------------------------------------ | ------------------ | ------------------- |
| `accent`       | `#5eead4` | Links, active states, primary interactive elements     | 11.53:1 (PASS AA)  | 10.25:1 (PASS AA)   |
| `accent-hover` | `#99f6e4` | Link hover, focus rings                                | 13.53:1 (PASS AA)  | 12.03:1 (PASS AA)   |
| `accent-muted` | `#2dd4bf` | Subdued accent (tags, status indicators, dividers)     | 9.16:1 (PASS AA)   | 8.15:1 (PASS AA)    |
| `accent-bg`    | `#0d3d38` | Accent-tinted background (inline code, selected state) | N/A                | N/A                 |

`#5eead4` (Tailwind teal-300) is the primary brand color. It replaces the PRD's `#6366f1`. Dark text (`#1a1a2e`) on `#5eead4` achieves 11.53:1 -- suitable for inverse treatments like status badges and buttons.

#### Code Block

| Token         | Hex       | Usage                                                  | Contrast notes                          |
| ------------- | --------- | ------------------------------------------------------ | --------------------------------------- |
| `code-bg`     | `#14142a` | Code block background (recessed below article surface) | vs surface: 1.19:1 (visible separation) |
| `code-border` | `#2a2a44` | Subtle border around code blocks                       | vs code-bg: 1.31:1                      |

The code block background is darker than the chrome to create a "recessed" effect within the article surface -- the code block reads as inset, not overlaid. The Shiki theme tokens must all pass 4.5:1 against `#14142a`. At 14.81:1 for primary text and 7.06:1 for muted text against this background, all standard syntax token colors will pass.

#### Semantic Colors

| Token     | Hex       | Usage                                        | Contrast vs chrome | Contrast vs surface |
| --------- | --------- | -------------------------------------------- | ------------------ | ------------------- |
| `success` | `#4ade80` | Launched status badge, positive indicators   | 9.79:1 (PASS AA)   | 8.70:1 (PASS AA)    |
| `warning` | `#eab308` | In-development status, caution callouts      | 8.89:1 (PASS AA)   | 7.91:1 (PASS AA)    |
| `error`   | `#f87171` | Error states, breaking changes in build logs | 6.17:1 (PASS AA)   | 5.48:1 (PASS AA)    |
| `info`    | `#60a5fa` | Informational callouts, notes                | 6.71:1 (PASS AA)   | 5.97:1 (PASS AA)    |

All semantic colors pass WCAG AA on both chrome and surface backgrounds. The error color uses red-400 (`#f87171`) rather than red-500 (`#ef4444`) because the lighter value passes AA on the surface (5.48:1) while red-500 falls short (4.03:1).

#### Border and Divider

| Token           | Hex       | Usage                                     |
| --------------- | --------- | ----------------------------------------- |
| `border-subtle` | `#2a2a44` | Card borders, section dividers on surface |
| `border-medium` | `#333352` | Stronger separators, table borders        |
| `border-strong` | `#3d3d5c` | High-contrast borders, focus outlines     |

Borders on dark backgrounds do not need to pass 4.5:1 contrast -- they are decorative/structural, not informational. The 1.25:1 to 1.64:1 range provides visible separation without competing with content.

#### Status Badge Colors (Portfolio Cards)

Status badges use tinted backgrounds with colored text, per the PRD requirement that information is not conveyed by color alone (text labels are always present).

| Status         | Text      | Background | Contrast         |
| -------------- | --------- | ---------- | ---------------- |
| Launched       | `#5eead4` | `#1a2e2e`  | 9.63:1 (PASS AA) |
| Active         | `#4ade80` | `#1a2a1e`  | 8.65:1 (PASS AA) |
| In Development | `#facc15` | `#2a2a1a`  | 9.49:1 (PASS AA) |
| Lab            | `#c4b5fd` | `#2a1a2a`  | 8.89:1 (PASS AA) |

---

## Typography

### Font Stacks

The PRD mandates system fonts. Endorsed without modification. This is the correct call for a sub-1s TTFMP target and eliminates all external font dependencies.

```css
--font-body:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
  'Helvetica Neue', sans-serif;

--font-mono:
  ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
```

**Brand note on system fonts:** System fonts are not a compromise -- they are a deliberate brand decision. When Alex inspects the network tab and sees zero font requests, that communicates more about Venture Crane's values than any typeface choice. The site loads in the reader's native typeface, which is the most readable option on their device by definition. This reinforces the "performance as brand" principle.

### Type Scale

The PRD proposes an 18px body with 1.25 modular ratio. Endorsed with one refinement: adding explicit `letter-spacing` values for headings to improve legibility at scale against dark backgrounds.

| Element       | Size             | Line Height | Weight | Letter Spacing | Notes                                                                    |
| ------------- | ---------------- | ----------- | ------ | -------------- | ------------------------------------------------------------------------ |
| H1            | 36px (2.25rem)   | 1.2         | 700    | -0.02em        | Article titles, page titles                                              |
| H2            | 28px (1.75rem)   | 1.3         | 600    | -0.01em        | Major sections within articles                                           |
| H3            | 22px (1.375rem)  | 1.4         | 600    | 0              | Subsections                                                              |
| H4            | 18px (1.125rem)  | 1.5         | 600    | 0.01em         | Minor headings (same size as body, differentiated by weight and spacing) |
| Body          | 18px (1.125rem)  | 1.7         | 400    | 0              | Article prose. 680px max width yields ~70 chars/line                     |
| Body (mobile) | 16px (1rem)      | 1.6         | 400    | 0              | Below 640px breakpoint                                                   |
| Small / meta  | 14px (0.875rem)  | 1.5         | 400    | 0.01em         | Dates, reading time, tag labels, footer text                             |
| Caption       | 13px (0.8125rem) | 1.4         | 400    | 0.02em         | Image captions, table captions, disclosure text                          |
| Code (inline) | 15px (0.9375rem) | inherit     | 400    | 0              | Within prose, uses `--font-mono`                                         |
| Code (block)  | 15px (0.9375rem) | 1.6         | 400    | 0              | Fenced code blocks, uses `--font-mono`                                   |
| Nav           | 15px (0.9375rem) | 1           | 500    | 0.03em         | Header navigation links                                                  |
| Wordmark      | 20px (1.25rem)   | 1           | 700    | 0.05em         | "VENTURE CRANE" in header -- uppercase, tracked out, monospace stack     |

### Heading Spacing

Headings use asymmetric spacing: more space above (separating from previous content) than below (binding to following content).

| Element | Margin Top     | Margin Bottom |
| ------- | -------------- | ------------- |
| H1      | 0 (page title) | 24px          |
| H2      | 48px           | 16px          |
| H3      | 32px           | 12px          |
| H4      | 24px           | 8px           |

### Paragraph Spacing

Paragraphs within article body use `margin-bottom: 24px` (1.5x base unit). This is tighter than the 1.7 line-height but provides clear paragraph separation without excessive whitespace on dark backgrounds, where vertical gaps can feel more pronounced than on light backgrounds.

### Wordmark Treatment

The site uses a text-based wordmark: "VENTURE CRANE" set in the monospace font stack, uppercase, with wide letter-spacing (0.05em), weight 700. This is cost-free (no logo file, no SVG, no image request), technically honest (monospace signals engineering), and scalable to any context.

The wordmark color is `#e8e8f0` (primary text) in the header. It does not use the accent color -- the wordmark is structurally neutral and lets the content be the brand.

---

## Spacing and Rhythm

### Base Unit: 4px

All spacing values are multiples of 4px. This creates a consistent vertical and horizontal rhythm across all components.

### Scale

| Token      | Value | Usage                                                        |
| ---------- | ----- | ------------------------------------------------------------ |
| `space-1`  | 4px   | Tight gaps (icon-to-text, badge padding-y)                   |
| `space-2`  | 8px   | Compact spacing (inline code padding, tag gaps)              |
| `space-3`  | 12px  | Small spacing (card internal padding, list item gaps)        |
| `space-4`  | 16px  | Default spacing (form element gaps, component margins)       |
| `space-6`  | 24px  | Section spacing (paragraph margins, card padding)            |
| `space-8`  | 32px  | Major spacing (between page sections)                        |
| `space-10` | 40px  | Large spacing (above H2 headings)                            |
| `space-12` | 48px  | Page section gaps (hero to portfolio, portfolio to articles) |
| `space-16` | 64px  | Page-level spacing (top/bottom page padding on desktop)      |
| `space-20` | 80px  | Maximum spacing (footer separation on desktop)               |

### Content Width

| Context            | Max Width | Notes                                                     |
| ------------------ | --------- | --------------------------------------------------------- |
| Article prose      | 680px     | ~70 chars/line at 18px body. PRD specification, endorsed. |
| Code blocks        | 680px     | Horizontal scroll for overflow. Same width as prose.      |
| Tables             | 680px     | Horizontal scroll within container for wide tables.       |
| Homepage hero      | 680px     | Same as article width -- consistency across surfaces.     |
| Portfolio cards    | 800px     | Slightly wider to accommodate card grid.                  |
| Page container     | 1024px    | Outer container with horizontal padding.                  |
| Site header/footer | 1024px    | Content constrained; background extends full width.       |

### Responsive Padding

| Breakpoint     | Horizontal padding                          |
| -------------- | ------------------------------------------- |
| < 640px        | 16px (space-4)                              |
| 640px - 1024px | 32px (space-8)                              |
| > 1024px       | Auto-centering with 64px minimum (space-16) |

---

## Imagery and Iconography

### Icon Style: Outline, 1.5px Stroke

Use outline icons with a consistent 1.5px stroke weight. Outline icons are lighter visually and appropriate for a content-focused site where icons play a supporting role. They also render cleanly at small sizes on dark backgrounds, where solid icons can feel heavy.

### Icon Library: Lucide

Lucide is recommended. It is open-source (ISC license), has a comprehensive set, supports tree-shaking, and its 1.5px stroke weight aligns with the design direction. At build time, Astro can inline SVG icons directly -- zero runtime JavaScript, zero external requests.

**Required icons at MVP:**

| Icon                         | Usage                                     |
| ---------------------------- | ----------------------------------------- |
| `external-link`              | External venture links on portfolio cards |
| `rss`                        | RSS feed link in footer                   |
| `github`                     | GitHub profile link in footer             |
| `calendar`                   | Publication date on articles              |
| `clock`                      | Reading time estimate                     |
| `arrow-left` / `arrow-right` | Previous/next article navigation          |
| `menu`                       | Mobile navigation toggle (below 640px)    |
| `x` (close)                  | Mobile navigation close                   |
| `chevron-right`              | Breadcrumb or inline link indicators      |

### Icon Sizing

Icons are sized to align with adjacent text:

| Context               | Size                          | Notes                                  |
| --------------------- | ----------------------------- | -------------------------------------- |
| Inline with body text | 18px (matches body font size) | Vertically centered with text baseline |
| Inline with meta text | 14px (matches meta font size) | Dates, reading time                    |
| Navigation            | 20px                          | Menu toggle, close button              |
| Standalone            | 24px                          | Footer social links                    |

### Icon Color

Icons inherit the color of their adjacent text by default. Interactive icons (links) use the accent color (`#5eead4`) and follow the same hover treatment as text links (`#99f6e4`).

### Illustration Style

No illustrations at MVP. The PRD explicitly excludes stock photography (BR-002). If illustrations are added post-launch, they should be technical diagrams (architecture diagrams, flow charts, system boundaries) rendered as SVGs in the accent color palette -- not decorative art.

### Photography Direction

No photography at MVP. The PRD prohibits stock photography. If the founder adds a headshot to the methodology page post-launch, it should be a simple, well-lit portrait with a neutral background -- not a lifestyle shot. Processed to match the site's dark palette if displayed as a thumbnail.

### OG Image

The Phase 0 OG image (1200x630px PNG) should use the site's chrome background (`#1a1a2e`), the wordmark in `#e8e8f0`, the tagline in `#a0a0b8`, and a subtle accent element (a thin teal line or the accent color used sparingly). No gradients, no illustrations, no stock imagery. The OG image should look like the site itself -- dark, clean, typographic.

---

## Inspiration Board

### 1. Linear (linear.app)

**URL:** https://linear.app

**What to take:** The dark theme execution. Linear proves that a dark UI can feel premium without being heavy. Their use of subtle surface-level differentiation (dark chrome vs. slightly lighter content areas) is the exact hybrid approach the PRD describes. Their typography is clean without being cold. Their color accent (purple/violet) is used sparingly and always functionally.

**Specific elements:** Surface layering strategy, restrained accent usage, monochrome-plus-one-accent color system.

### 2. Stripe Documentation (docs.stripe.com)

**URL:** https://docs.stripe.com

**What to take:** The gold standard for technical content presentation. Code blocks, inline code, tables, and prose coexist without visual conflict. The reading experience at 680px content width is exactly what Venture Crane should feel like. Their syntax highlighting respects the surrounding design system rather than imposing its own aesthetic.

**Specific elements:** Code block rendering, table design, content width and spacing, heading hierarchy.

### 3. Vercel Blog (vercel.com/blog)

**URL:** https://vercel.com/blog

**What to take:** Article card design and content index layout. Their cards communicate title, date, and excerpt efficiently without visual noise. The transition from card (listing) to full article page is seamless. The dark-mode variant demonstrates that technical blog content reads well on dark backgrounds when the type scale and contrast are right.

**Specific elements:** Article card layout, listing-to-article transition, meta information hierarchy.

### 4. Oxide Computer (oxide.computer)

**URL:** https://oxide.computer

**What to take:** The dark theme with a strong technical identity. Oxide uses a dark palette with selective color accents to communicate "this is built by engineers for engineers" without the developer-aesthetic cliches (no terminal green, no matrix rain). Their typography and spacing demonstrate that dark themes can feel spacious rather than claustrophobic.

**Specific elements:** Dark palette confidence, engineering-culture visual language, whitespace management on dark backgrounds.

### 5. Simon Willison's Blog (simonwillison.net)

**URL:** https://simonwillison.net

**What to take:** Content-first architecture. Willison's site proves that a technically excellent blog does not need visual sophistication -- the content is the product. Venture Crane should match this content-first discipline while exceeding Willison's visual execution. This is the quality floor for content, and the visual differentiation opportunity (Willison's light theme, basic styling, web fonts vs. VC's dark theme, refined system, zero JS).

**Specific elements:** Content density, article structure, link-heavy prose formatting, absence of non-functional decoration.

---

## Anti-Inspiration

### 1. AI Startup Landing Pages (Generic)

**Example pattern:** gradient backgrounds, floating 3D objects, animated particle effects, "Revolutionize your workflow" hero text, pricing tables above the fold.

**What to avoid:** Every visual pattern associated with AI hype marketing. Venture Crane explicitly positions against "10x productivity!" marketing (PRD Section 4). The design must not borrow any visual vocabulary from the AI startup landing page template -- no gradients, no floating geometry, no blur effects, no glassmorphism. If a design element could appear on an AI tool's landing page, it should not appear on venturecrane.com.

### 2. Medium / Substack

**URL:** https://medium.com / https://substack.com

**What to avoid:** Platform aesthetics that make every publication look the same. Medium's homogenized design (identical serif fonts, identical card layouts, identical reading experience) communicates "this is just another blog." Substack's newsletter-first framing prioritizes email capture over content quality. Venture Crane is not a newsletter. It is not "on" a platform. The design must make this immediately clear -- the site looks like nothing else because it is built from scratch on the same stack used for everything else in the portfolio.

**Specific avoidances:** Serif body fonts, prominent subscribe CTAs, "follow" buttons, social proof counters (claps, likes, subscriber counts), cookie consent banners with 47 options.

### 3. Pieter Levels / levels.io

**URL:** https://levels.io

**What to avoid:** Revenue-brag aesthetics. Levels.io's design vocabulary centers on shipping speed and revenue numbers. Venture Crane shares the multi-product portfolio structure but differentiates on methodology over metrics. The design should not emphasize revenue figures, MRR dashboards, or "shipped in X days" badges. The visual identity communicates "how we build" not "how much we make."

**Specific avoidances:** Revenue counters, shipping streak displays, product count badges, any element that prioritizes quantity metrics over operational depth.

---

## Summary of Key Decisions

| Decision          | PRD Proposal              | Brand Strategist Position                    | Rationale                                                                |
| ----------------- | ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Chrome colors     | `#1a1a2e` / `#1e1e36`     | **Endorsed**                                 | Excellent contrast, professional depth                                   |
| Surface colors    | `#242438` / `#2a2a42`     | **Endorsed**                                 | Hybrid dark theme works as specified                                     |
| Primary text      | `#e8e8f0`                 | **Endorsed**                                 | 12.45:1+ on all backgrounds                                              |
| Muted text        | TBD in PRD                | **Resolved: `#a0a0b8`**                      | 5.93:1+ on all backgrounds, passes AA                                    |
| Accent color      | `#6366f1` (placeholder)   | **Replaced: `#5eead4`**                      | PRD placeholder fails WCAG AA (3.40-3.82:1). Teal passes (10.25-11.53:1) |
| Accent hover      | `#818cf8`                 | **Replaced: `#99f6e4`**                      | Consistent with new accent family                                        |
| Code block bg     | TBD in PRD                | **Resolved: `#14142a`**                      | Darker than chrome, recessed effect                                      |
| System fonts      | Specified                 | **Endorsed**                                 | Zero font requests, performance-as-brand                                 |
| Type scale        | 18px/1.7 body, 1.25 ratio | **Endorsed with letter-spacing additions**   | Negative tracking on large headings improves dark-bg legibility          |
| Content width     | 680px                     | **Endorsed**                                 | ~70 chars/line is the proven optimum                                     |
| Base spacing unit | Not specified             | **Proposed: 4px**                            | Clean scale for all component spacing                                    |
| Wordmark          | Text-based                | **Specified: monospace, uppercase, tracked** | Zero-cost, technically honest, scalable                                  |
| Icon library      | Not specified             | **Proposed: Lucide (outline, 1.5px stroke)** | Open-source, comprehensive, inline SVG                                   |
