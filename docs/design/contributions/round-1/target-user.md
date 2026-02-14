# Target User Contribution -- Design Brief Round 1

**Author:** Target User (Alex / Jordan / Sam composite)
**Date:** 2026-02-13
**Design Maturity:** Greenfield

---

## Who I Am

I am mostly Alex. I lead a team of six engineers at a Series B company. I have been writing software for eleven years and managing people who write software for three. My days are meetings until 2pm and then I try to get real work done until dinner. On the weekends and late at night I run experiments -- Claude Code sessions on side projects, trying to figure out if agentic workflows are something I should push my team toward or if it is still too early.

I read a lot. My RSS reader has about forty feeds. I follow Simon Willison daily, I read Harper Reed's posts whenever they appear, I skim Latent Space but I rarely finish their longer pieces. I found most of these through Hacker News links. My quality bar is high and my patience is low. I have maybe ninety seconds before I decide if a new site is worth my attention.

When I am in Jordan mode, I am running a small product that makes about $6K a month, and I am trying to figure out how to start a second one without hiring anyone. I am deeply practical. I do not want inspiration. I want the operational manual -- the boring details that nobody wants to publish because they are not impressive. Session handoffs. Context management. What breaks. What it costs. If someone is actually doing this at a multi-product level, I need to see the receipts.

When I am in Sam mode, I am a product manager or a VC associate who clicked a link someone shared in Slack. I have no context, limited patience, and I will form my entire opinion of this operation in about ten seconds based on how the homepage looks and whether the first sentence makes sense.

My emotional state when I would encounter this site: mildly curious but deeply skeptical. Everyone is claiming to be doing something revolutionary with AI right now. I have been burned by enough hype to be suspicious of anyone who says they are running a "product factory." Prove it.

---

## My Environment

**Device:** I will find this site on my phone first -- someone shares a link on X or in Slack, and I tap it. If the article is good, I will switch to my laptop later to read the whole thing. On weekends, I might be reading on a 14-inch MacBook Pro at my kitchen table or on the couch. Sometimes on an iPad in bed at 11pm.

**Attention level:** Low at first. I am scanning. I am deciding if this is worth my time within seconds. If I start actually reading an article, my attention ramps up -- I can stay focused for fifteen or twenty minutes on genuinely good technical content. But you have to earn that.

**Context switching:** I am probably coming from Twitter, HN, or an RSS reader. I am comparing this site, consciously or not, to every other technical blog I have read this week. That means I am comparing it to Stripe's blog, to the React docs, to Simon Willison's site, to the Linear changelog. Those are the baselines in my head. I am not comparing it to some average corporate website. I am comparing it to the best content sites on the internet because those are the sites I actually read.

**Time of day:** Mornings before standup (scanning, deciding what to read later), evenings after the kids are in bed (deep reading), weekends (exploring).

---

## First Impressions

Here is what I am going to think within ten seconds of landing on this site:

**If the dark theme is done well:** "This feels like a developer tool. Good. This was made by someone who builds things." The dark background with lighter reading surfaces sounds right to me. It immediately signals that this is not a marketing site, it is a builder's site. Linear does this. Vercel does this. I associate dark themes with tools I respect.

**If the dark theme is done poorly:** "This looks like a Discord server or a gaming site." There is a narrow band between "sophisticated dark theme" and "muddy, hard to read, trying too hard." The colors in the PRD -- `#1a1a2e` for chrome, `#242438` for article surfaces -- those are deep navy-purples. That could go either way. If there is not enough contrast between the chrome and the article surface, it will look like one flat, dark blob. **The two-tone has to be obvious enough that I notice the reading surface is different, but subtle enough that it does not look like two different websites stitched together.**

**The hero matters more than anything.** The PRD says one sentence plus a 50-word paragraph. That is the right instinct. If I land on the homepage and see a wall of text, I am leaving. If I see "The product factory that shows its work" -- honestly, that tagline does not grab me. It sounds like a tagline. I do not trust taglines. The alternative suggested in the PRD -- "How one person and a team of AI agents build real software" -- that is much better because it tells me what I am looking at. It is specific. It is unusual. "Product factory" is abstract. "One person and a team of AI agents" is concrete and interesting.

**The portfolio cards will either make or break my trust.** If I see four cards with real product names, real status badges, and real links to real sites -- that is powerful. Nobody does this. Most "build in public" people just talk. If I can click through to an actual product that works, my skepticism drops significantly. But if I click through and the product site is ugly, broken, or clearly a side project that has not been touched in months, the credibility collapses instantly and I am never coming back.

**Overall first impression I want:** "This is clean, fast, and someone serious made it." Not flashy. Not trying to impress me with animations or gradients. Just solid, fast, thoughtful. The way a well-written README makes you trust a library before you read a single line of code.

---

## Emotional Reactions

### Homepage

The homepage as described has three sections: hero, portfolio cards, and recent articles. That is the right structure. I do not want more than that. **No testimonials, no partner logos, no "as seen on" -- the PRD explicitly excludes these and that is correct.** The moment I see social proof theater on a site with zero audience, I lose trust completely.

The portfolio cards with status badges -- "Launched," "Active," "In Development," "Lab" -- that is genuinely interesting. I have never seen a personal site do this. It is honest. It tells me exactly where each product is. **Do not make the badges look like they came from a government form.** They should feel like the status labels in a GitHub project or a Linear roadmap. Tight, lowercase or sentence-case, maybe with a subtle color coding. "Launched" in a calm green. "Lab" in a neutral gray. Nothing that screams at me.

The recent articles section -- I want to see titles that are specific, not clever. "How We Give AI Agents Persistent Memory Across Sessions" -- yes, that grabs me. That sounds like something I could learn from. "What Running 4 Products with AI Agents Actually Costs" -- even better. That is the kind of title that would survive on HN because it promises something nobody else is publishing.

**What I am afraid of on the homepage:** that it will feel empty. Three articles and four portfolio cards is not a lot of content. The design needs to make that feel intentional rather than sparse. The way a good restaurant menu with twelve items feels curated, not limited. White space (or dark space, in this case) handled well is the difference.

### Article Page

This is the one I care about the most. Everything lives or dies on this page because this is where I will spend 90% of my time.

**What I need:** A clean reading column, 680px max width as the PRD specifies, with generous line height (1.7 is good -- matches what Stripe's blog does), body text at 18px. I want to forget I am on a website and just read. The metadata at the top -- date, reading time, author -- should be quiet. Small, muted text. Do not make the metadata compete with the title.

**Code blocks are critical.** I read a lot of technical content. If the code blocks look bad, I will assume the technical content is bad. The Shiki syntax highlighting needs to actually look good on the dark background. I have seen too many dark-themed blogs where the code blocks are either too bright (jarring) or too similar to the background (unreadable). **The code block background needs to be visually distinct from the article surface -- a slightly darker or slightly lighter shade -- so my eye immediately knows "this is code."** Horizontal scrolling for long lines is fine and expected. Do not wrap long lines of code. That is worse.

**Tables.** The PRD mentions semantic HTML tables with horizontal scroll on mobile. Good. I have strong opinions about tables in articles: they should look like Markdown tables rendered by GitHub, not like Excel spreadsheets. Minimal borders or no borders. Just clean rows with alternating backgrounds or subtle lines. If tables look heavy, the whole article feels heavy.

**The AI disclosure at the bottom** -- "Drafted with AI assistance. Reviewed and edited by [name]" -- I actually like this. It is honest. It is not defensive. It does not apologize. The fact that it links to the methodology page is smart because it turns a disclosure into a pathway. I would scan it, note it, and respect it. The key is making it look like a natural part of the article footer, not like a legal disclaimer. **Do not put it in a box. Do not make it italic. Do not make it look like fine print.** It should be the same weight as the "published date" text -- present but not anxious.

**Previous/next navigation** at the bottom of articles -- I expect this. Every good blog has it. It should be simple. Previous on the left, next on the right. Title of the adjacent article visible. Nothing fancy.

### Build Log

The PRD describes build logs as "visually lighter" than articles with smaller title type, date as the primary visual anchor, and no reading time or description. **This is exactly right.** Build logs should feel like a developer's commit history or a changelog -- tight, scannable, date-driven. I think of how Linear does their changelog: clean, date-stamped, concise. That is the energy.

The `/log` index page should feel like scrolling through a feed. Not a blog listing -- a feed. Date prominent, title right there, maybe the first sentence or two visible. I should be able to scan ten entries in about fifteen seconds and decide if any are worth clicking into.

### Portfolio Page

This is where Jordan takes over for me. The portfolio page is where I go to answer one question: "Are these real products or are they vaporware?"

The card structure described in the PRD -- name, description, status badge, tech stack tags, conditional link -- is good. **The tech stack tags matter to me.** When I see "Astro, Cloudflare, TypeScript" I form an opinion about the technical sophistication. If the tags are "WordPress, PHP" I form a different opinion. Be real about the stack.

**The external link behavior is important.** The PRD says external links open in new tabs with a visual external-link indicator. Yes. Do this. When I click through to Durgan Field Guide or Kid Expenses, I want to know I am leaving this site and I want to be able to get back. The little arrow icon or external-link icon that Notion uses in its linked databases -- that is the right treatment. Subtle but clear.

The ordering by status (Launched > Active > In Development > Lab) is correct. Put the strongest evidence first. If I see a launched product at the top and it is real and it works, I will give you the benefit of the doubt on the ones that are still in development.

### Methodology Page

Jordan is fully driving now. This page is why I am here. If the articles got me interested, the methodology page is where I decide whether this person has actually built something systematic or is just writing about their hobby.

500-800 words is the right length for launch. Do not try to make this a comprehensive manifesto. Make it a tight, opinionated overview that links out to deeper articles. **I want to read this in three minutes, nod, and bookmark it.** Then come back when the linked articles are published.

The founder section -- name, background, links to X and GitHub -- is necessary and sufficient. I do not need a headshot at launch. I do not need a full bio. I need to know there is a real person behind this, and I need to be able to verify that by clicking through to their GitHub and seeing actual commit history. **If the GitHub profile is empty, the methodology page loses half its credibility.**

### 404 Page

I will probably never see this unless an old WordPress URL breaks, but if I do see it, I want it to feel like the rest of the site. Not a generic "Page Not Found" error. A clear message, links to the article index and homepage, and maybe the tone of "this page does not exist, but here is what does." Keep it brief.

---

## What Feels Right

**Linear's website** is the single best reference for what this site should feel like. Dark theme, clean typography, content-focused, no clutter. When I land on Linear's site, I immediately think "this was built by people who care about quality." That is the reaction I want from this site.

**Stripe's blog** is the gold standard for long-form technical reading experience. The content width, the typography, the code blocks, the way the page just gets out of the way and lets me read. The article page on this site needs to be that good. Not better, not more creative -- just that clean and that respectful of the reading experience.

**Simon Willison's blog** is not pretty, but it is fast and it is dense with good content. The thing I love about Willison's site is that the content is front and center, the design is invisible, and everything loads instantly. This site should load faster than Willison's (which uses web fonts -- this site uses system fonts, so it already has that advantage).

**GitHub's README rendering** is what I want tables and markdown content to look like. Clean, semantic, no decorative borders, just information presented clearly.

**Notion's breadcrumb and link treatment** -- the way Notion handles external links with that subtle icon, and the way pages feel spacious without being empty. That is the density I want.

**The Vercel dashboard's type scale** is excellent. Their headings, body text, and meta text all feel like they belong to the same family at different sizes. No jarring size jumps. No decorative fonts. Just a well-tuned type scale.

---

## What Would Turn Me Off

**If it looks like a template.** There are hundreds of dark Astro blog templates on GitHub. If I land on this site and my first thought is "I have seen this Astro template before," I am gone. The design needs to have enough personality that it does not feel generic, while being restrained enough that it does not feel try-hard. This is a narrow path.

**If the accent color is that default indigo.** The PRD acknowledges that `#6366f1` is a placeholder. Good, because that exact shade of indigo is the default Tailwind indigo and I see it on every developer side project on the internet. It screams "I did not choose a color, I just used the default." Pick something with intention.

**If there is any animation or transition on page load.** The PRD says zero JavaScript, which implies no animations. Good. But even CSS transitions on page elements -- fade-ins, slide-ups -- would feel wrong here. This is a content site. Content should be there when the page loads, immediately, completely. No choreography.

**If the mobile nav feels hacky.** The PRD describes a CSS-only hamburger using `<details><summary>`. I have seen these done well and I have seen them feel janky. **If the mobile nav opens with a visual jump or does not feel smooth, it undermines the entire "we are competent builders" message.** Test this aggressively.

**If the dark theme makes text hard to read after five minutes.** Long-form reading on dark backgrounds is genuinely harder on the eyes for many people. The hybrid approach (lighter article surface) is the right mitigation, but the contrast needs to be tested by actually reading a 2,000-word article on the site, not just checking hex values against a WCAG calculator. **If I get eye strain reading your article about AI agent costs, I am not subscribing to your RSS feed.**

**If the portfolio links go to sites that look bad.** This is the biggest risk. The portfolio page promises real products. If I click through to Durgan Field Guide and it looks like a WordPress template from 2019, every claim on the Venture Crane site is diminished. The methodology says the factory works. The portfolio is the evidence. If the evidence is weak, the argument falls apart.

**If code blocks use a light theme inside a dark-themed site.** I have seen this. It is jarring. It breaks the visual coherence completely. The Shiki theme needs to be dark and it needs to complement the article surface background.

**If there is any hint of "subscribe to my newsletter" or "follow me" urgency.** The PRD excludes this at MVP and that is absolutely right. The moment I feel like someone is trying to capture my email before I have decided whether their content is worth reading, I mentally downgrade the entire site. RSS link in the footer is perfect. No modal, no banner, no sticky bar, no "join X other readers" counter.

---

## Navigation Expectations

**One tap away:** The article I came to read. That is it. When I arrive from a shared link, the article should load and I should be reading within one second. Nothing between me and the content.

**Two taps away:** Any other section. Header nav should let me get from any page to any other page in a single click. Home, Portfolio, Methodology, Articles -- four items, always visible on desktop. That is the right number.

**OK to bury:** Legal pages (privacy, terms). Nobody navigates to these -- they are there for compliance, put them in the footer. Build log index can be slightly less prominent than articles -- maybe in the footer or accessible from the articles page. The RSS link belongs in the footer; people who use RSS know to look there.

**Header should be thin.** Do not make the header tall. Do not make it sticky. When I am reading a 2,000-word article, every pixel of vertical space matters. The header should be there when I scroll to the top, and it should stay out of my way while I read. This is not a SaaS app that needs persistent navigation -- it is a reading experience.

**Footer should be useful.** The footer described in the PRD -- venture links, social links, recent articles, legal links, RSS link -- is exactly right. A good footer is the second navigation on a content site. When I finish an article and scroll past the previous/next links, the footer should give me two or three reasons to stay on the site.

---

## Make-or-Break Moments

### Moment 1: The First Five Seconds on the Homepage

If Sam lands on this page from a Slack link and cannot answer "what is this?" within five seconds, the entire site fails for that persona. The hero sentence needs to be instantly comprehensible, jargon-free, and specific enough to be interesting. "The product factory that shows its work" is not specific enough. Something closer to the alternative -- "One person and a team of AI agents building real software, showing how it actually works" -- is better because it gives me the three hooks: solo founder, AI agents, transparency.

**The visual quality of the homepage in these five seconds is Sam's proxy for the quality of everything behind it.** If the homepage looks like a weekend project, Sam assumes the methodology is a weekend project. If it looks like Linear's marketing site, Sam assumes the operation behind it is serious. Fair or not, that is how it works.

### Moment 2: The Article Reading Experience

This is the moment for Alex. I clicked a link. I am on the article page. The first article I read will determine whether I ever come back. **The reading experience needs to be invisible -- meaning I do not think about the website at all, I just think about the content.** If I notice the font, the line length is wrong. If I notice the background, the contrast is wrong. If I notice the code blocks, the syntax highlighting is wrong. The best reading experience is the one I do not notice because nothing is in my way.

Specifically: body text should feel comfortable at 18px on a 680px column. Code blocks should be legible and well-spaced. Tables should not break the layout. The page should load instantly. When I finish the article, the previous/next links should invite me to keep reading without being pushy. This is the moment where content quality and design quality have to both deliver. Great content on a badly designed page loses. Great design on mediocre content loses faster. Both need to work.

### Moment 3: The Portfolio Click-Through

Jordan reads the methodology. Jordan finds it compelling. Jordan goes to the portfolio page and clicks through to Durgan Field Guide or Kid Expenses. **This is the trust verification moment.** The methodology page makes claims. The portfolio page provides evidence. The external venture site is the proof.

If the transition is smooth -- new tab opens, the venture site loads fast, it looks professional, it clearly works -- then everything the methodology page said is validated. Jordan bookmarks the site, subscribes to the RSS feed, and comes back monthly.

If the transition is rough -- the external site is slow, ugly, broken, or empty -- then the methodology page retroactively becomes empty words. "They write about building products with AI agents, but look at the products." Jordan closes the tab and does not return.

The design of the Venture Crane site cannot control the quality of the venture sites, but it can control how the handoff feels. The external link icon, the new tab opening, the clear indication that "you are leaving Venture Crane" -- those signals matter because they set expectations and demonstrate attention to detail.

---

There is one more thing I want to say, and it is not about any specific screen.

**This site needs to feel like it was built by the methodology it describes.** If the content says "we build products with AI agents under human direction" and the site itself feels sloppy, unfinished, or generic, the content loses all credibility. The site is the first product the visitor evaluates. It needs to be evidence that the approach works. Fast loading, clean code, no JavaScript, system fonts, perfect Lighthouse scores -- these are not just technical requirements. They are the opening argument for the entire Venture Crane thesis. If the site is not excellent, nothing else matters.
