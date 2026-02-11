#!/usr/bin/env node
/**
 * crane - Venture launcher CLI
 *
 * Thin entry point. All logic lives in launch-lib.ts so it's testable.
 *
 * Usage:
 *   crane              # Interactive menu (launches default agent)
 *   crane vc           # Direct launch into Venture Crane
 *   crane vc --gemini  # Launch with Gemini instead of default
 *   crane --list       # Show ventures without launching
 */

import { main } from './launch-lib.js'

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
