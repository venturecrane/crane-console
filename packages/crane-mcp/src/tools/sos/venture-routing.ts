/**
 * SOS venture routing: handles cases where current dir is not a known venture
 * repo. Either navigates to a known local clone, requests a clone, or asks
 * the user to pick a venture.
 */

import { homedir } from 'node:os'
import { type Venture } from '../../lib/crane-api.js'
import { findRepoForVenture, scanLocalRepos, getCurrentRepoInfo } from '../../lib/repo-scanner.js'
import type { SosResult } from '../sos.js'

export function handleVentureNavigation(
  ventures: Venture[],
  ventureCode: string,
  defaultResult: Partial<SosResult>
): SosResult {
  const targetVenture = ventures.find((v) => v.code === ventureCode)

  if (!targetVenture) {
    return {
      ...defaultResult,
      status: 'error',
      message:
        `Unknown venture: ${ventureCode}\n\n` +
        `Available: ${ventures.map((v) => v.code).join(', ')}`,
    } as SosResult
  }

  const localRepo = findRepoForVenture(targetVenture)

  if (localRepo) {
    return {
      ...defaultResult,
      status: 'needs_navigation',
      target_venture: targetVenture.code,
      target_path: localRepo.path,
      nav_command: `cd ${localRepo.path} && claude`,
      message:
        `To work on ${targetVenture.name}:\n\n` +
        `  cd ${localRepo.path} && claude\n\n` +
        `Then run crane_sos again.`,
    } as SosResult
  }

  const suggestedPath = `${homedir()}/dev/${targetVenture.code}-console`
  const cloneUrl = `git@github.com:${targetVenture.org}/${targetVenture.code}-console.git`

  return {
    ...defaultResult,
    status: 'needs_clone',
    target_venture: targetVenture.code,
    target_path: suggestedPath,
    clone_command: `git clone ${cloneUrl} ${suggestedPath}`,
    nav_command: `cd ${suggestedPath} && claude`,
    message:
      `Repo for ${targetVenture.name} not found locally.\n\n` +
      `Clone it (adjust repo name if needed):\n` +
      `  git clone ${cloneUrl} ${suggestedPath}\n\n` +
      `Then:\n` +
      `  cd ${suggestedPath} && claude`,
  } as SosResult
}

export function handleVentureSelection(
  ventures: Venture[],
  currentRepo: ReturnType<typeof getCurrentRepoInfo>,
  cwd: string,
  defaultResult: Partial<SosResult>
): SosResult {
  const localRepos = scanLocalRepos()
  const ventureList = ventures.map((v) => {
    const repo = localRepos.find((r) => {
      if (r.org.toLowerCase() !== v.org.toLowerCase()) return false
      return v.repos?.includes(r.repoName) ?? false
    })
    return { code: v.code, name: v.name, installed: !!repo, path: repo?.path }
  })

  return {
    ...defaultResult,
    status: 'select_venture',
    ventures: ventureList.map((v) => ({ code: v.code, name: v.name, installed: v.installed })),
    message:
      `Not in a venture repo.\n\n` +
      `Current directory: ${cwd}\n` +
      (currentRepo
        ? `Git remote: ${currentRepo.org}/${currentRepo.repo} (not a known venture)\n`
        : `Not a git repository.\n`) +
      `\nAvailable ventures:\n` +
      ventureList
        .map((v) => `  ${v.code} - ${v.name} ${v.installed ? `[${v.path}]` : '[not installed]'}`)
        .join('\n') +
      `\n\nCall crane_sos with venture parameter to continue.\n` +
      `Example: crane_sos(venture: "vc")`,
  } as SosResult
}
