# Venture Crane Website

**URL:** venturecrane.com
**Repo:** venturecrane/vc-web
**Stack:** Astro 5 SSG, Cloudflare Pages, Tailwind CSS

## What It Is

The public-facing website for Venture Crane — a technical publication from a working development lab. Publishes field notes on AI-native development operations: costs, failures, methodology, fleet management, and multi-agent workflows.

## Content

| Type       | Count | Cadence                      |
| ---------- | ----- | ---------------------------- |
| Articles   | 24    | 1+ per month                 |
| Build logs | 26    | 2-4 per month                |
| Pages      | 8     | Portfolio, methodology, etc. |

### Published Articles (selected)

- What Running 4 Products with AI Agents Actually Costs
- How We Give AI Agents Persistent Memory Across Sessions
- Why We Built a Product Factory Instead of a Product
- Fleet Management as a Solo Developer
- Fleet Sprints: Parallel Work Across AI Agents
- Four Auth Vulnerabilities from One Code Review
- Kill Discipline with AI Agents
- Secrets Management for AI Agent Teams
- Where We Stand: Agent Operations in 2026

### Pages

- Portfolio — venture showcase
- The System — methodology overview
- Start Here — reader onboarding
- Open Problems — research questions
- Search — full-text article search

## Architecture

- **Rendering:** Full SSG — zero client JavaScript (except Cloudflare analytics beacon)
- **Content:** Astro Content Collections with Zod schemas for type-safe frontmatter
- **Hosting:** Cloudflare Pages (free tier)
- **Analytics:** Cloudflare Web Analytics (cookie-free)
- **Contact:** Cloudflare Workers function (no external form service)
- **Search:** Pagefind (static search index, built at deploy time)
- **RSS:** Full-content feeds at /feed.xml and /feed/logs.xml

## Content Pipeline

Articles and build logs are drafted by agents using enterprise skills:

| Skill           | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `/build-log`    | Draft operational updates from handoffs and PRs     |
| `/edit-article` | Two-pass editorial review (style + fact check)      |
| `/edit-log`     | Build log editorial review                          |
| `/content-scan` | Triage handoffs/PRs into article and log candidates |

All content is AI-drafted and human-reviewed. Published with CC BY 4.0 license for articles, MIT for code snippets.

## Performance Targets

- Lighthouse: >= 95 all categories
- Time to first paint: < 1 second (3G simulation)
- Total page weight: < 50 KB gzipped
- Client JavaScript: 0 bytes (analytics beacon only)

## Distribution

| Channel                                               | Status           |
| ----------------------------------------------------- | ---------------- |
| RSS feeds                                             | Active           |
| Hacker News                                           | Planned (#56)    |
| Reddit (r/programming, r/ExperiencedDevs, r/ClaudeAI) | Planned (#53-55) |
| Dev.to cross-posting                                  | Planned (#57)    |
| X/Twitter content pulls                               | Planned (#58)    |

## Relationship to Enterprise Docs Site

This site (crane-command.pages.dev, gated by Cloudflare Access) is the **internal** enterprise docs site for agents and the Captain. venturecrane.com is the **external** publication for the practitioner community. They serve different audiences and have different content policies:

|                | Enterprise Docs       | venturecrane.com               |
| -------------- | --------------------- | ------------------------------ |
| Audience       | Agents + Captain      | External practitioners         |
| Content        | Operational reference | Published articles             |
| Internal names | Used freely           | Genericized per content policy |
| Update cadence | Continuous            | Monthly articles + weekly logs |
