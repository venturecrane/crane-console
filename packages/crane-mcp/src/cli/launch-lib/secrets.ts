/**
 * Secret fetching via Infisical.
 *
 * Single fetch, parse, and validate — no infisical wrapper subprocess.
 * Secrets are frozen at launch time and injected directly into the agent env.
 */

import { existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync, SpawnSyncReturns } from 'node:child_process'
import { getCraneEnv, getStagingInfisicalPath } from '../../lib/config.js'
import { CRANE_CONSOLE_ROOT, WORKSPACE_ID } from './constants.js'

type SecretsResult = { secrets: Record<string, string> } | { error: string }

/**
 * Ensure .infisical.json exists in the repo (auto-copy from crane-console if missing).
 * Returns an error string if the config can't be resolved, null on success.
 */
export function ensureInfisicalConfig(repoPath: string): string | null {
  const configPath = join(repoPath, '.infisical.json')
  if (existsSync(configPath)) return null

  const source = join(CRANE_CONSOLE_ROOT, '.infisical.json')
  if (existsSync(source)) {
    copyFileSync(source, configPath)
    console.log(`-> Copied .infisical.json from crane-console`)
    return null
  }

  return `Missing .infisical.json in ${repoPath} and no source found in ~/dev/crane-console/`
}

function resolveInfisicalTarget(infisicalPath: string): {
  resolvedPath: string
  resolvedEnv: string
} {
  const craneEnv = getCraneEnv()
  if (craneEnv !== 'dev') return { resolvedPath: infisicalPath, resolvedEnv: 'prod' }

  const ventureCode = infisicalPath.replace(/^\//, '')
  const stagingPath = getStagingInfisicalPath(ventureCode)
  if (stagingPath) return { resolvedPath: stagingPath, resolvedEnv: 'dev' }

  console.warn(`-> Warning: Staging not available for ${ventureCode}, using production secrets`)
  return { resolvedPath: infisicalPath, resolvedEnv: 'prod' }
}

function parseSpawnError(err: Error, _infisicalPath: string): string {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    return (
      'infisical CLI not found.\n' +
      'Install: https://infisical.com/docs/cli/overview\n' +
      'Or: brew install infisical/get-cli/infisical'
    )
  }
  return `Failed to run infisical: ${err.message}`
}

function parseInfisicalOutput(
  stdout: string,
  infisicalPath: string,
  resolvedPath: string,
  resolvedEnv: string
): SecretsResult {
  let parsed: Array<{ key: string; value: string }>
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return {
      error:
        `infisical export returned malformed JSON.\n` +
        `Output (first 200 chars): ${stdout.slice(0, 200)}`,
    }
  }

  const secrets: Record<string, string> = {}
  for (const entry of parsed) {
    if (entry.key && typeof entry.value === 'string') secrets[entry.key] = entry.value
  }

  if (Object.keys(secrets).length === 0) {
    return {
      error:
        `infisical export returned no secrets for path '${resolvedPath}' (env: ${resolvedEnv}).\n` +
        'Add secrets in Infisical web UI: https://app.infisical.com',
    }
  }

  if (!secrets.CRANE_CONTEXT_KEY) {
    return {
      error:
        `Secrets fetched from '${infisicalPath}' but CRANE_CONTEXT_KEY is missing.\n` +
        `Keys found: ${Object.keys(secrets).join(', ')}\n` +
        `Fix: cd ~/dev/crane-console && bash scripts/sync-shared-secrets.sh --fix\n` +
        'Or add CRANE_CONTEXT_KEY manually in Infisical web UI.',
    }
  }

  return { secrets }
}

function checkSpawnResult(
  result: SpawnSyncReturns<string>,
  infisicalPath: string
): { error: string } | null {
  if (result.error) {
    return { error: parseSpawnError(result.error, infisicalPath) }
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    return {
      error:
        `infisical export failed (exit ${result.status}) for path '${infisicalPath}'.\n` +
        (stderr ? `Stderr: ${stderr}\n` : '') +
        'Check: infisical login, or verify the path exists in Infisical web UI.',
    }
  }
  const stdout = result.stdout?.trim()
  if (!stdout) {
    return {
      error:
        `infisical export returned empty output for path '${infisicalPath}'.\n` +
        'The path may not exist or may have no secrets configured.',
    }
  }
  return null
}

/**
 * Fetch secrets from Infisical once, parse them, and validate.
 *
 * Trade-off: secrets are frozen at launch time. This is fine for static keys
 * like CRANE_CONTEXT_KEY and API tokens. If we ever need rotating secrets that
 * refresh mid-session, we'd need a different approach (e.g., sidecar process).
 *
 * Replaces the old checkInfisicalSetup + infisical-run-wrapper pattern.
 * Instead of two separate fetches (one to validate, one to run), we fetch
 * once with `infisical export --format=json`, parse the JSON, guard on
 * content, and inject the resulting env vars directly into the agent process.
 */
export function fetchSecrets(
  repoPath: string,
  infisicalPath: string,
  extraEnv?: Record<string, string>
): SecretsResult {
  const configError = ensureInfisicalConfig(repoPath)
  if (configError) return { error: configError }

  const { resolvedPath, resolvedEnv } = resolveInfisicalTarget(infisicalPath)

  const args = ['export', '--format=json', '--silent', '--path', resolvedPath, '--env', resolvedEnv]

  // When INFISICAL_TOKEN is present (SSH/UA path), add --projectId since
  // token-based auth doesn't read .infisical.json for project context
  if (extraEnv?.INFISICAL_TOKEN) args.push('--projectId', WORKSPACE_ID)

  const result = spawnSync('infisical', args, {
    cwd: repoPath,
    env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
    timeout: 30_000,
    encoding: 'utf-8',
  })

  const spawnErr = checkSpawnResult(result, infisicalPath)
  if (spawnErr) return spawnErr

  return parseInfisicalOutput(result.stdout.trim(), infisicalPath, resolvedPath, resolvedEnv)
}
