#!/usr/bin/env node
// Thin runner for the notification backfill CLI.
// The library lives at src/scripts/notifications-backfill.ts and compiles to
// dist/scripts/notifications-backfill.js.

import {
  runBackfill,
  parseArgs,
  printUsage,
  defaultLogger,
} from '../dist/scripts/notifications-backfill.js'

const parsed = parseArgs(process.argv.slice(2), process.env)

if (!parsed.ok) {
  if (parsed.help) {
    printUsage()
    process.exit(0)
  }
  console.error(`error: ${parsed.reason}`)
  console.error('Run with --help for usage.')
  process.exit(2)
}

try {
  const stats = await runBackfill(parsed.options)
  console.log('\n=== Backfill complete ===')
  console.log(JSON.stringify(stats, null, 2))
  if (stats.errors > 0) {
    console.error(`\nWARNING: ${stats.errors} error(s) encountered. See logs above.`)
    process.exit(1)
  }
  process.exit(0)
} catch (err) {
  defaultLogger().error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  process.exit(1)
}
