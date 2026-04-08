/**
 * Notification Auto-Resolver Backfill (Track A PR 3)
 *
 * THIN WRAPPER: the actual library lives at
 *   packages/crane-mcp/src/scripts/notifications-backfill.ts
 *
 * The library is housed under packages/crane-mcp because that's the only
 * place in the repo with a Node-targeted TypeScript build pipeline. The
 * runner shim at packages/crane-mcp/bin/notifications-backfill.js handles
 * the actual execution after `npm run build`.
 *
 * This file exists at the path documented in the v2 plan
 * (~/.claude/plans/kind-gliding-rossum.md §A.5) so an operator following
 * the plan literally can find the entry point. It re-exports the public
 * API from the real location so import paths from outside the repo still
 * work.
 *
 * For CLI usage:
 *   1. cd packages/crane-mcp && npm run build
 *   2. node packages/crane-mcp/bin/notifications-backfill.js [flags]
 *
 * Or via the bin entry after `npm install`:
 *   notifications-backfill [flags]
 *
 * See scripts/notifications/README.md for the full operator runbook.
 */

export {
  runBackfill,
  parseArgs,
  printUsage,
  defaultLogger,
  parseNextLink,
} from '../../packages/crane-mcp/src/scripts/notifications-backfill'

export type {
  BackfillOptions,
  BackfillStats,
  BackfillLogger,
  Fetch,
} from '../../packages/crane-mcp/src/scripts/notifications-backfill'
