/**
 * Fleet health section renderer for the SOS tool.
 */

import { type FleetHealthFinding, type FleetHealthSummary } from '../../lib/crane-api.js'
import { calendarDaysSince, formatAgeDays } from './format-helpers.js'

function sevLabel(s: string): string {
  return s === 'error' ? 'ERROR' : s === 'warning' ? 'WARN' : 'INFO'
}

function extractFindingMessage(f: FleetHealthFinding): string {
  let msg = f.details_json
  try {
    const parsed = JSON.parse(f.details_json) as { message?: string }
    if (parsed.message) msg = parsed.message
  } catch {
    // use raw details_json
  }
  if (msg.length > 80) msg = msg.slice(0, 77) + '...'
  return msg.replace(/\|/g, '\\|')
}

function sortFindingsBySeverity(findings: FleetHealthFinding[]): FleetHealthFinding[] {
  const sevRank: Record<string, number> = { error: 0, warning: 1, info: 2 }
  return [...findings].sort((a, b) => {
    const aRank = sevRank[a.severity] ?? 3
    const bRank = sevRank[b.severity] ?? 3
    if (aRank !== bRank) return aRank - bRank
    return a.repo_full_name.localeCompare(b.repo_full_name)
  })
}

function renderFindingsTable(
  findings: FleetHealthFinding[],
  limit: number,
  opts: {
    heading: string
    colHeader: string
    rowFn: (f: FleetHealthFinding) => string
    moreLabel: string
  }
): string {
  const sorted = sortFindingsBySeverity(findings)
  const shown = sorted.slice(0, limit)

  let out = opts.heading + opts.colHeader
  for (const f of shown) {
    out += opts.rowFn(f)
  }
  if (findings.length > shown.length) {
    const remaining = findings.length - shown.length
    out += `\nShowing ${shown.length} of ${findings.length} ${opts.moreLabel} — +${remaining} more.\n`
  }
  return out + '\n'
}

function checkMachineHeartbeat(machineFindings: FleetHealthFinding[]): string {
  const newestMachine = machineFindings.reduce((acc, f) =>
    new Date(f.generated_at) > new Date(acc.generated_at) ? f : acc
  )
  const ageDays = calendarDaysSince(new Date(newestMachine.generated_at))
  if (ageDays > 10) {
    return `**⚠ fleet-update timer appears stuck:** newest machine snapshot is ${ageDays} days old. Check \`systemctl list-timers | grep fleet-update\` on mini, or tail \`/var/log/fleet-update/run.log\`.\n\n`
  }
  return ''
}

export function renderFleetHealthBlock(params: {
  fleetHealthFindings?: FleetHealthFinding[]
  fleetHealthSummary?: FleetHealthSummary | null
}): string {
  const { fleetHealthFindings, fleetHealthSummary } = params
  if (!fleetHealthSummary || fleetHealthSummary.total_open === 0) return ''

  const FLEET_HEALTH_PER_SOURCE_LIMIT = 10
  let out = `## Fleet Health\n\n`

  const { total_open, by_severity, open_repos, newest_generated_at } = fleetHealthSummary
  const breakdownParts: string[] = []
  if (by_severity.error > 0) breakdownParts.push(`${by_severity.error} error`)
  if (by_severity.warning > 0) breakdownParts.push(`${by_severity.warning} warning`)
  if (by_severity.info > 0) breakdownParts.push(`${by_severity.info} info`)
  const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : ''

  const ageLabel = newest_generated_at
    ? ` · last audit ${formatAgeDays(calendarDaysSince(new Date(newest_generated_at)))}`
    : ''

  out += `${total_open} open finding${total_open === 1 ? '' : 's'}${breakdown} across ${open_repos} repo${open_repos === 1 ? '' : 's'}${ageLabel}\n\n`

  const findings = fleetHealthFindings ?? []
  const githubFindings = findings.filter((f) => (f.source ?? 'github') === 'github')
  const machineFindings = findings.filter((f) => f.source === 'machine')

  if (machineFindings.length > 0) {
    out += checkMachineHeartbeat(machineFindings)
  }

  if (githubFindings.length > 0) {
    out += renderFindingsTable(githubFindings, FLEET_HEALTH_PER_SOURCE_LIMIT, {
      heading: machineFindings.length > 0 ? `### Repos (${githubFindings.length})\n\n` : '',
      colHeader:
        '| Severity | Repo | Finding | Message |\n|----------|------|---------|---------|\n',
      rowFn: (f) =>
        `| ${sevLabel(f.severity)} | ${f.repo_full_name} | ${f.finding_type} | ${extractFindingMessage(f)} |\n`,
      moreLabel: 'repo finding(s)',
    })
  }

  if (machineFindings.length > 0) {
    out += renderFindingsTable(machineFindings, FLEET_HEALTH_PER_SOURCE_LIMIT, {
      heading: `### Machines (${machineFindings.length})\n\n`,
      colHeader:
        '| Severity | Machine | Finding | Message |\n|----------|---------|---------|---------|\n',
      rowFn: (f) => {
        const alias = f.repo_full_name.startsWith('machine/')
          ? f.repo_full_name.slice('machine/'.length)
          : f.repo_full_name
        return `| ${sevLabel(f.severity)} | ${alias} | ${f.finding_type} | ${extractFindingMessage(f)} |\n`
      },
      moreLabel: 'machine finding(s)',
    })
  }

  return out
}
