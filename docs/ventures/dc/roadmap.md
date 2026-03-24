---
sidebar:
  order: 4
---

# Roadmap

**Current Stage:** Prototype
**Next Milestone:** InstructionList integration + dependency security sweep

## Current Focus

- InstructionList integration into Chapter Editor panel (#408) and Desk tab (#407)
- Update SourcesContext for three instruction types (#409)
- Retire legacy InstructionSetPicker and InstructionPicker (#410)
- High-severity dependency upgrades: Hono (#445), flatted (#446), vitest-pool-workers (#447)

## Near-Term

- Add instruction list design tokens to globals.css (#412)
- Instruction speed validation on iPad (#413)
- Accessibility audit for InstructionList (#414)
- Voice & tone audit for seed instruction labels (#415)
- CI deployment step for workers on main merge (#430)
- Replace console.log with structured logging (#429)
- Add test coverage for drive route handlers (#428)

## Future

- Google Drive import/export integration
- Collaborative editing
- Export to manuscript formats (EPUB, PDF)

## Completed (Recent)

- Design system polish batch (2026-02-25): layout/motion tokens, toolbar keyboard shortcuts, ARIA live regions, panel animations, component extraction
- Editor panel empty state and streaming response headers (2026-02-25)
- Landing page copy updated with Author/Editor metaphor (2026-02-25)

## Dependencies

| Item                | Blocks            | Notes                             |
| ------------------- | ----------------- | --------------------------------- |
| Dependency upgrades | Production deploy | 3 HIGH CVE chains in Hono/flatted |
| Clerk auth          | Multi-user        | Currently single-author scope     |
| TipTap/ProseMirror  | Core editing      | Rich text editor foundation       |
