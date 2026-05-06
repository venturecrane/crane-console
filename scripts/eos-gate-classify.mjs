#!/usr/bin/env node
// eos-gate-classify.mjs - Classify a list of changed files against the EOS gate surface manifest.
//
// Usage:
//   node scripts/eos-gate-classify.mjs --manifest config/eos-gate-surfaces.json --files changed-files.txt
//
// Output (stdout, JSON):
//   {
//     requires_probe: boolean,
//     surfaces_touched: { "<class>": ["<file>", ...] },
//     exempt_files: ["<file>", ...],
//     unclassified: ["<file>", ...]
//   }
//
// Used by fleet-probe.sh and pr-fleet-probe.yml to determine whether a PR's diff
// triggers the gate and which surface classes are affected.

import { readFileSync } from 'node:fs'

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    args[key] = argv[i + 1]
  }
  return args
}

// Convert a glob pattern to a RegExp. Supports **, *, and ?.
function globToRegExp(glob) {
  let re = '^'
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      // ** matches any sequence including /
      re += '.*'
      i += 2
      // skip trailing /
      if (glob[i] === '/') i += 1
    } else if (c === '*') {
      // * matches anything except /
      re += '[^/]*'
      i += 1
    } else if (c === '?') {
      re += '[^/]'
      i += 1
    } else if ('.+^$|(){}[]\\'.includes(c)) {
      re += '\\' + c
      i += 1
    } else {
      re += c
      i += 1
    }
  }
  re += '$'
  return new RegExp(re)
}

function matchAny(file, patterns) {
  return patterns.some((p) => globToRegExp(p).test(file))
}

function classify(file, manifest) {
  // Exempt classes win over surface classes — a docs change in a path that
  // ALSO matches a surface class glob is exempt.
  for (const [name, klass] of Object.entries(manifest.exempt_classes ?? {})) {
    if (!matchAny(file, klass.paths)) continue
    if (klass.exclude_paths && matchAny(file, klass.exclude_paths)) continue
    return { kind: 'exempt', class: name }
  }
  for (const [name, klass] of Object.entries(manifest.surface_classes ?? {})) {
    if (!matchAny(file, klass.paths)) continue
    if (klass.exclude_paths && matchAny(file, klass.exclude_paths)) continue
    return { kind: 'surface', class: name }
  }
  return { kind: 'unclassified' }
}

const args = parseArgs(process.argv)
if (!args.manifest || !args.files) {
  console.error('Usage: eos-gate-classify.mjs --manifest <path> --files <path>')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'))
const files = readFileSync(args.files, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)

const surfaces_touched = {}
const exempt_files = []
const unclassified = []

for (const f of files) {
  const c = classify(f, manifest)
  if (c.kind === 'surface') {
    surfaces_touched[c.class] ??= []
    surfaces_touched[c.class].push(f)
  } else if (c.kind === 'exempt') {
    exempt_files.push(f)
  } else {
    unclassified.push(f)
  }
}

const requires_probe = Object.keys(surfaces_touched).length > 0

process.stdout.write(
  JSON.stringify({ requires_probe, surfaces_touched, exempt_files, unclassified }, null, 2) + '\n'
)
