#!/usr/bin/env tsx
/**
 * Memory recall eval harness.
 *
 * Reads eval/memory-recall.json (a list of {query, expected} pairs), calls
 * crane_memory(recall, query) against the configured staging worker, and
 * computes MRR@K. Writes baseline.json on first run; on subsequent runs,
 * fails if MRR@K drops below baseline.mrr - tolerance.
 *
 * Run:
 *   CRANE_RELAY_KEY=... CRANE_CONTEXT_BASE=... npm run eval:memory-recall
 *
 * Initial baseline target at our ~41-entry corpus: MRR@5 >= 0.4. The bar
 * rises as the corpus grows; bm25 IDF is statistically weak below ~10K docs.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface Pair {
  query: string
  expected: string
}

interface EvalSpec {
  description: string
  version: string
  k: number
  pairs: Pair[]
}

interface BaselineFile {
  mrr_at_k: number
  k: number
  pair_count: number
  recorded_at: string
  passing_pairs: number
  tolerance: number
}

interface RecallApiNote {
  id: string
  title: string | null
  content: string
  tags: string | null
}

interface ListNotesResponse {
  notes: RecallApiNote[]
  count: number
  total_matching?: number
}

const EVAL_PATH = resolve(process.cwd(), 'eval/memory-recall.json')
const BASELINE_PATH = resolve(process.cwd(), 'eval/baseline.json')
const TOLERANCE = 0.05

function getEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`Missing required env: ${key}`)
    process.exit(2)
  }
  return value
}

async function fetchRecall(
  base: string,
  apiKey: string,
  query: string,
  k: number
): Promise<RecallApiNote[]> {
  const url = `${base}/notes?tag=memory&q=${encodeURIComponent(query)}&limit=${k}`
  const res = await fetch(url, { headers: { 'X-Relay-Key': apiKey } })
  if (!res.ok) {
    throw new Error(`Recall fetch failed (${res.status}): ${await res.text()}`)
  }
  const body = (await res.json()) as ListNotesResponse
  return body.notes
}

function findExpected(notes: RecallApiNote[], expectedSubstr: string): number {
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]
    if (
      (n.content && n.content.includes(expectedSubstr)) ||
      (n.title && n.title.includes(expectedSubstr))
    ) {
      return i + 1 // 1-indexed rank
    }
  }
  return -1
}

async function main() {
  const base = getEnv('CRANE_CONTEXT_BASE')
  const apiKey = getEnv('CRANE_RELAY_KEY')

  const spec: EvalSpec = JSON.parse(readFileSync(EVAL_PATH, 'utf-8'))
  const k = spec.k ?? 5

  console.log(`Memory recall eval — ${spec.pairs.length} pairs, K=${k}`)
  console.log(`Target: ${base}`)
  console.log()

  let reciprocalRankSum = 0
  let passing = 0

  for (const pair of spec.pairs) {
    let rank = -1
    try {
      const notes = await fetchRecall(base, apiKey, pair.query, k)
      rank = findExpected(notes, pair.expected)
    } catch (err) {
      console.error(`  ERROR on "${pair.query}": ${(err as Error).message}`)
    }
    const rr = rank > 0 ? 1 / rank : 0
    reciprocalRankSum += rr
    if (rank > 0) passing++
    const status = rank > 0 ? `rank=${rank}` : 'MISS'
    console.log(`  [${status}] q="${pair.query}" expected~"${pair.expected}"`)
  }

  const mrr = reciprocalRankSum / spec.pairs.length

  console.log()
  console.log(`MRR@${k}: ${mrr.toFixed(4)}  (${passing}/${spec.pairs.length} pairs hit within K)`)

  if (existsSync(BASELINE_PATH)) {
    const baseline: BaselineFile = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
    const minAcceptable = baseline.mrr_at_k - TOLERANCE
    console.log(`Baseline MRR@${baseline.k}: ${baseline.mrr_at_k.toFixed(4)}`)
    console.log(`Tolerance: -${TOLERANCE.toFixed(2)} -> floor ${minAcceptable.toFixed(4)}`)
    if (mrr < minAcceptable) {
      console.error(`FAIL: MRR ${mrr.toFixed(4)} below floor ${minAcceptable.toFixed(4)}`)
      process.exit(1)
    }
    console.log('PASS')
  } else {
    const baseline: BaselineFile = {
      mrr_at_k: mrr,
      k,
      pair_count: spec.pairs.length,
      recorded_at: new Date().toISOString(),
      passing_pairs: passing,
      tolerance: TOLERANCE,
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8')
    console.log(`Wrote baseline: ${BASELINE_PATH}`)
    if (mrr < 0.4) {
      console.warn(
        `WARN: baseline MRR ${mrr.toFixed(4)} below initial target 0.40. Investigate before merging.`
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
