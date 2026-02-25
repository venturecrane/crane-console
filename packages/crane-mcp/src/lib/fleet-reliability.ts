/**
 * Fleet machine reliability scoring.
 *
 * Tracks dispatch counts and outcomes per machine in ~/.crane/fleet-reliability.json.
 * Used by fleet-dispatch to record dispatches and by the orchestrate protocol
 * to record outcomes and deprioritize unreliable machines.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface MachineStats {
  dispatches: number
  successes: number
  failures: number
  crashes: number
}

export type ReliabilityData = Record<string, MachineStats>

const RELIABILITY_PATH = join(homedir(), '.crane', 'fleet-reliability.json')

function ensureDir(): void {
  mkdirSync(join(homedir(), '.crane'), { recursive: true })
}

function readData(): ReliabilityData {
  try {
    return JSON.parse(readFileSync(RELIABILITY_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeData(data: ReliabilityData): void {
  ensureDir()
  writeFileSync(RELIABILITY_PATH, JSON.stringify(data, null, 2) + '\n')
}

function getOrCreate(data: ReliabilityData, machine: string): MachineStats {
  if (!data[machine]) {
    data[machine] = { dispatches: 0, successes: 0, failures: 0, crashes: 0 }
  }
  return data[machine]
}

/**
 * Record a dispatch to a machine (called at dispatch time).
 */
export function recordDispatch(machine: string): void {
  const data = readData()
  const stats = getOrCreate(data, machine)
  stats.dispatches++
  writeData(data)
}

/**
 * Record the outcome of a dispatched task (called by orchestrator after collection).
 */
export function recordOutcome(machine: string, outcome: 'success' | 'failure' | 'crash'): void {
  const data = readData()
  const stats = getOrCreate(data, machine)
  if (outcome === 'success') stats.successes++
  else if (outcome === 'failure') stats.failures++
  else if (outcome === 'crash') stats.crashes++
  writeData(data)
}

/**
 * Get reliability scores for all machines.
 * Returns machine name -> success rate (0-100).
 */
export function getScores(): Record<string, number> {
  const data = readData()
  const scores: Record<string, number> = {}
  for (const [machine, stats] of Object.entries(data)) {
    if (stats.dispatches === 0) {
      scores[machine] = 100
    } else {
      scores[machine] = Math.round((stats.successes / stats.dispatches) * 100)
    }
  }
  return scores
}

/**
 * Get raw reliability data for all machines.
 */
export function getReliabilityData(): ReliabilityData {
  return readData()
}
