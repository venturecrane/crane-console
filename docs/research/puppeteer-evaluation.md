# Puppeteer vs Current Tooling Evaluation

**Date:** 2026-02-02
**Issue:** #123
**Status:** Complete

---

## Executive Summary

After evaluating Puppeteer against our current tooling (agent-browser), the recommendation is:

| Option        | Recommendation | Rationale                                                                                      |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| **Puppeteer** | Skip           | agent-browser already covers our QA needs; no concrete scripted automation use case identified |

**Bottom line:** agent-browser provides everything needed for AI-assisted manual QA. Puppeteer would add maintenance burden without addressing any current gap.

---

## Current Tooling: agent-browser

agent-browser is already installed on all 3 dev machines and provides:

### Core Capabilities

| Feature                     | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| **Screenshot capture**      | Full-page screenshots via `agent-browser screenshot <path>` |
| **DOM interaction**         | Click, type, navigate via CLI commands                      |
| **Accessibility snapshots** | `agent-browser snapshot` for AI analysis of page structure  |
| **Headless operation**      | Runs without GUI, suitable for CI/CD                        |

### Current Usage

- **qa:2 (Light Visual):** Quick spot-checks with single screenshot
- **qa:3 (Full Visual):** Complete walkthroughs with multiple screenshots
- **Evidence collection:** Screenshots stored for audit trails
- **AI analysis:** Accessibility snapshots enable programmatic page inspection

### Integration Points

- Built on Playwright (Chromium)
- CLI-first design ideal for agent workflows
- Verified working on mac23, mbp27, think

---

## Puppeteer Capabilities

Puppeteer is Google's Node.js library for controlling Chrome/Chromium:

### Core Features

| Feature                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| **Scripted automation**  | Programmatic browser control via JavaScript API |
| **Screenshot capture**   | Page/element screenshots                        |
| **PDF generation**       | Render pages to PDF                             |
| **Network interception** | Mock requests, capture traffic                  |
| **Page evaluation**      | Execute JavaScript in page context              |
| **Device emulation**     | Mobile viewports, touch events                  |

### Typical Use Cases

- E2E test suites (scripted, repeatable)
- Automated regression testing in CI
- Web scraping
- PDF/screenshot generation services
- Performance testing

---

## Comparison

| Capability             | agent-browser         | Puppeteer                     |
| ---------------------- | --------------------- | ----------------------------- |
| Screenshot capture     | Yes                   | Yes                           |
| DOM interaction        | Yes (CLI)             | Yes (API)                     |
| Accessibility snapshot | Yes                   | Partial (requires extra code) |
| AI-friendly output     | Yes (designed for it) | No (requires wrapper)         |
| PDF generation         | No                    | Yes                           |
| Network interception   | No                    | Yes                           |
| Scripted test suites   | No                    | Yes                           |
| Learning curve         | Low (CLI)             | Medium (API)                  |
| Maintenance burden     | Low                   | Medium-High                   |

---

## Gap Analysis

### What Puppeteer Can Do That agent-browser Can't

1. **PDF generation** - Not a current need; workers/APIs don't generate PDFs
2. **Network interception** - Useful for mocking, but not needed for QA verification
3. **Scripted test suites** - Could enable automated regression tests

### Is the Gap Worth Filling?

**No, for these reasons:**

1. **Current QA philosophy is AI-assisted manual QA**
   - Human judgment + AI analysis, not scripted automation
   - agent-browser's accessibility snapshots serve this well

2. **No scripted regression test use case identified**
   - Workers are small, focused services
   - Manual QA catches issues effectively
   - Adding Playwright-based E2E tests adds maintenance burden without clear ROI

3. **Maintenance cost is real**
   - Scripted tests break when UI changes
   - Requires ongoing maintenance investment
   - Team bandwidth is limited

4. **agent-browser is already deployed**
   - Verified on all dev machines
   - Team is familiar with it
   - Adding Puppeteer creates two tools doing similar things

---

## Decision Criteria Applied

| Criterion                | Assessment                                    |
| ------------------------ | --------------------------------------------- |
| **Functionality gap?**   | Minor (PDF, network interception not needed)  |
| **Concrete use case?**   | No scripted automation requirement identified |
| **Maintenance cost?**    | Scripted tests require ongoing maintenance    |
| **Team bandwidth?**      | Limited; better spent on features             |
| **Strategic alignment?** | AI-assisted QA, not E2E automation            |

---

## Recommendation: Skip

Do not adopt Puppeteer. The current tooling (agent-browser) adequately serves the AI-assisted manual QA approach.

### When to Reconsider

Revisit this decision if:

1. **Repeated regressions slip through** - If the same bugs keep recurring, scripted regression tests may be justified
2. **Team grows significantly** - More capacity could justify E2E test investment
3. **PDF generation becomes a requirement** - Puppeteer would be the natural choice
4. **CI visual regression testing needed** - Would require screenshot comparison infrastructure anyway

### Alternative: Playwright for CI (Future)

If scripted tests are ever needed, note that agent-browser already uses Playwright under the hood. A future path would be:

1. Write Playwright tests directly (not Puppeteer)
2. Reuse existing Playwright installation
3. Benefit from Playwright's cross-browser support

This avoids introducing a third tool (Puppeteer) when Playwright already exists in the stack.

---

## References

- Issue #123: Evaluate Puppeteer vs current tooling
- `docs/process/dev-box-setup.md` (agent-browser documentation)
- Issue #90-93: agent-browser rollout issues
