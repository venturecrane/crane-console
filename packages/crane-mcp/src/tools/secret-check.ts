/**
 * crane_secret_check — verify Infisical secret presence WITHOUT returning values.
 *
 * Positive-surface API for "is this set?" — agents should use this instead of
 * `infisical secrets <path>`, which prints unmasked values by default and is
 * the recurring leak vector that motivated the hook-enforced secret leak
 * prevention work (see docs/instructions/secrets.md).
 *
 * Defensive design: strips both `secretValue` AND `secretComment` at the parse
 * boundary. Comments have historically held value-like content (see the
 * description-as-value gotcha in secrets.md). The tool never holds a value in
 * memory — projection happens on the JSON parser output, not on returned data.
 */
import { execSync } from 'node:child_process'
import { z } from 'zod'

export const secretCheckInputSchema = z.object({
  path: z
    .string()
    .regex(/^\/[A-Za-z0-9._/-]*$/, 'path must start with / and contain only [A-Za-z0-9._/-]')
    .describe('Infisical path, e.g. /vc/api'),
  env: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'env must be lowercase alphanumeric (e.g. dev, prod, staging)')
    .describe('Infisical environment slug, e.g. prod'),
  names: z
    .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'invalid secret key name'))
    .optional()
    .describe('Specific keys to check; omit to list all'),
  includeImports: z
    .boolean()
    .default(false)
    .describe('Include imported secrets from linked paths (off by default — imports can leak)'),
})

export type SecretCheckInput = z.infer<typeof secretCheckInputSchema>

export interface SecretCheckResult {
  success: boolean
  message: string
}

const EXEC_TIMEOUT_MS = 15_000

interface InfisicalSecretRecord {
  secretKey?: string
  key?: string
  secretValue?: unknown
  secretComment?: unknown
}

/**
 * Project Infisical CLI JSON to keys-only. Tolerates both array-of-records
 * and { secrets: [...] } envelope shapes; tolerates `secretKey` vs `key`
 * field naming (Infisical has shipped both over time).
 */
function projectKeys(raw: unknown): string[] {
  let records: InfisicalSecretRecord[]
  if (Array.isArray(raw)) {
    records = raw as InfisicalSecretRecord[]
  } else if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { secrets?: unknown }).secrets)
  ) {
    records = (raw as { secrets: InfisicalSecretRecord[] }).secrets
  } else {
    return []
  }

  const keys: string[] = []
  for (const record of records) {
    const key = record.secretKey ?? record.key
    if (typeof key === 'string' && key.length > 0) {
      keys.push(key)
    }
    // Intentional: secretValue and secretComment are never read or copied
    // — the projection drops them at the parser boundary.
  }
  return keys
}

export async function executeSecretCheck(input: SecretCheckInput): Promise<SecretCheckResult> {
  const args = [
    'secrets',
    '--env',
    input.env,
    '--path',
    input.path,
    '--output',
    'json',
    // Explicit no-imports unless caller opts in.
    `--include-imports=${input.includeImports ? 'true' : 'false'}`,
  ]

  let stdout: string
  try {
    stdout = execSync(`infisical ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: EXEC_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `infisical CLI call failed: ${msg.slice(0, 200)}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `infisical JSON parse failed: ${msg.slice(0, 200)}`,
    }
  }

  const keys = projectKeys(parsed).sort()

  if (input.names && input.names.length > 0) {
    const present = input.names.filter((n) => keys.includes(n))
    const missing = input.names.filter((n) => !keys.includes(n))
    const lines = [
      `Path: ${input.path} (env: ${input.env})`,
      `Checked: ${input.names.length} key(s)`,
      `Present: ${present.length === 0 ? '(none)' : present.join(', ')}`,
      `Missing: ${missing.length === 0 ? '(none)' : missing.join(', ')}`,
    ]
    return { success: true, message: lines.join('\n') }
  }

  const lines = [
    `Path: ${input.path} (env: ${input.env})`,
    `Keys (${keys.length}): ${keys.length === 0 ? '(none)' : keys.join(', ')}`,
  ]
  return { success: true, message: lines.join('\n') }
}
