/**
 * Venture discovery, matching, cloning, and display.
 */

import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { Venture } from '../../lib/crane-api.js'
import { API_BASE_PRODUCTION } from '../../lib/config.js'
import { scanLocalRepos, LocalRepo } from '../../lib/repo-scanner.js'
import { VentureWithRepo, ENGAGEMENT_REGISTRY, EngagementContext } from './constants.js'

export async function fetchVentures(): Promise<Venture[]> {
  try {
    // Always fetch from production - staging DB may be empty
    const response = await fetch(`${API_BASE_PRODUCTION}/ventures`)
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = (await response.json()) as { ventures: Venture[] }
    return data.ventures
  } catch (error) {
    console.error('Failed to fetch ventures from API')
    throw error
  }
}

/**
 * Match a venture to its local repo.
 *
 * All ventures live under the same GitHub org (venturecrane), so org-only
 * matching is ambiguous. We match by org + repo name convention:
 *   {code}-console  (ke → ke-console, dc → dc-console)
 *   crane-console   (special case for vc, the infra venture)
 */
function matchVentureToRepo(venture: Venture, repos: LocalRepo[]): LocalRepo | undefined {
  return repos.find((r) => {
    if (r.org.toLowerCase() !== venture.org.toLowerCase()) return false
    return (
      r.repoName === `${venture.code}-console` ||
      (venture.code === 'vc' && r.repoName === 'crane-console')
    )
  })
}

export function matchVenturesToRepos(ventures: Venture[]): VentureWithRepo[] {
  const repos = scanLocalRepos()
  return ventures.map((v) => {
    const repo = matchVentureToRepo(v, repos)
    return {
      ...v,
      localPath: repo?.path || null,
    }
  })
}

export async function cloneVenture(venture: VentureWithRepo): Promise<string | null> {
  let repos: { name: string; description: string }[]
  try {
    const output = execSync(
      // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `venture.org` comes from the ventures.json registry, not user input; no shell metacharacters possible in an org slug
      `gh repo list ${venture.org} --json name,description --limit 20 --no-archived`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    repos = JSON.parse(output)
  } catch {
    console.error(`Cannot list repos for ${venture.org}. Check: gh repo list ${venture.org}`)
    return null
  }

  if (repos.length === 0) {
    console.error(`No repos found in the ${venture.org} organization.`)
    return null
  }

  let repoName: string

  if (repos.length === 1) {
    repoName = repos[0].name
    console.log(`  Repo: ${venture.org}/${repoName}`)
  } else {
    console.log(`\n  Repos in ${venture.org}:\n`)
    for (let i = 0; i < repos.length; i++) {
      const desc = repos[i].description ? `  ${repos[i].description}` : ''
      console.log(`    ${i + 1}) ${repos[i].name}${desc}`)
    }
    console.log()

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>((resolve) => {
      rl.question(`  Which repo? (1-${repos.length}): `, resolve)
    })
    rl.close()

    const num = parseInt(answer, 10)
    if (isNaN(num) || num < 1 || num > repos.length) {
      return null
    }
    repoName = repos[num - 1].name
  }

  const targetPath = join(homedir(), 'dev', repoName)

  if (existsSync(targetPath)) {
    console.error(`\n  ~/dev/${repoName} already exists but isn't linked to ${venture.org}.`)
    console.error(`  Check its git remote: git -C "${targetPath}" remote -v`)
    return null
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const confirm = await new Promise<string>((resolve) => {
    rl.question(`  Clone to ~/dev/${repoName}? (Y/n): `, resolve)
  })
  rl.close()

  if (confirm.trim().toLowerCase() === 'n') {
    return null
  }

  console.log(`\n-> Cloning ${venture.org}/${repoName}...`)
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `venture.org` and `repoName` from ventures.json registry + `gh repo list` output, not user input; `targetPath` computed from internal config
    execSync(`gh repo clone ${venture.org}/${repoName} "${targetPath}"`, {
      stdio: 'inherit',
    })
    console.log(`-> Cloned to ~/dev/${repoName}\n`)
    return targetPath
  } catch {
    console.error(`\nClone failed. Verify access: gh repo list ${venture.org}`)
    return null
  }
}

/**
 * Group engagements by client for display under their parent venture.
 */
function engagementsByClient(code: string): Map<string, EngagementContext[]> {
  const grouped = new Map<string, EngagementContext[]>()
  for (const e of Object.values(ENGAGEMENT_REGISTRY)) {
    if (e.code !== code) continue
    const existing = grouped.get(e.clientSlug) ?? []
    existing.push(e)
    grouped.set(e.clientSlug, existing)
  }
  return grouped
}

export function printVentureList(ventures: VentureWithRepo[]): void {
  console.log('\nCrane Ventures')
  console.log('==============\n')

  const home = homedir()
  for (let i = 0; i < ventures.length; i++) {
    const v = ventures[i]
    const num = `${i + 1})`.padEnd(3)
    const name = v.name.padEnd(20)
    const code = `[${v.code}]`.padEnd(6)
    const path = v.localPath ? v.localPath.replace(home, '~') : '(not cloned)'
    console.log(`  ${num} ${name} ${code} ${path}`)

    const grouped = engagementsByClient(v.code)
    for (const [clientSlug, engagements] of grouped) {
      console.log(`        ${clientSlug}:`)
      for (const e of engagements) {
        console.log(`          ${v.code}/${clientSlug}/${e.engagementSlug}  ${e.repo}`)
      }
    }
  }
  console.log()
}

export async function promptSelection(
  ventures: VentureWithRepo[]
): Promise<VentureWithRepo | null> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question(`Select (1-${ventures.length}): `, resolve)
  })
  rl.close()

  const num = parseInt(answer, 10)
  if (isNaN(num) || num < 1 || num > ventures.length) {
    return null
  }

  const selected = ventures[num - 1]
  if (!selected.localPath) {
    console.log(`\n${selected.name} is not cloned locally.`)
    const clonedPath = await cloneVenture(selected)
    if (!clonedPath) {
      return null
    }
    selected.localPath = clonedPath
  }

  return selected
}
