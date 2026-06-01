/**
 * crane_secret_set — store an Infisical secret WITHOUT the value entering the
 * transcript. The sanctioned "capture" counterpart to crane_secret_check
 * ("retrieve presence").
 *
 * The recurring failure mode this solves: agents need to store keys daily, but
 * `infisical secrets set` is (correctly) blocked from the agent's raw Bash tool,
 * and pasting a value into chat leaks it. This tool reads the value SERVER-SIDE
 * — from the macOS clipboard (`pbpaste`) or a local file — writes it to Infisical
 * via `spawnSync` (args array, no shell string), and returns only a masked
 * confirmation. The value never passes through the agent's context, a shell
 * command line, or the returned message. The deny rules stay fully intact; this
 * is an additive secure door, not a hole in the wall.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { z } from 'zod'

export const secretSetInputSchema = z
  .object({
    path: z
      .string()
      .regex(/^\/[A-Za-z0-9._/-]*$/, 'path must start with / and contain only [A-Za-z0-9._/-]')
      .describe('Infisical path, e.g. /vc'),
    env: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'env must be lowercase alphanumeric (e.g. dev, prod, staging)')
      .describe('Infisical environment slug, e.g. prod'),
    name: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'invalid secret key name')
      .describe('Secret key name, e.g. ELEVENLABS_API_KEY'),
    source: z
      .enum(['clipboard', 'file'])
      .default('clipboard')
      .describe(
        'Where to read the value SERVER-SIDE: the macOS clipboard (pbpaste) or a local file. The value never enters the transcript.'
      ),
    file: z
      .string()
      .optional()
      .describe('Absolute path to a file holding the value (required when source=file).'),
    deleteSource: z
      .boolean()
      .default(true)
      .describe('When source=file, delete the file after a successful write (secure by default).'),
  })
  .superRefine((val, ctx) => {
    if (val.source === 'file' && (!val.file || !val.file.startsWith('/'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'source=file requires an absolute `file` path',
        path: ['file'],
      })
    }
  })

export type SecretSetInput = z.infer<typeof secretSetInputSchema>

export interface SecretSetResult {
  success: boolean
  message: string
}

const EXEC_TIMEOUT_MS = 15_000

/** Read the secret value from the chosen server-side source. Never logged. */
function readValue(input: SecretSetInput): { value?: string; error?: string } {
  if (input.source === 'file') {
    if (!input.file || !existsSync(input.file)) {
      return { error: `file not found: ${input.file ?? '(none)'}` }
    }
    try {
      // Strip a single trailing newline (editors add one); preserve internal content.
      return { value: readFileSync(input.file, 'utf-8').replace(/\r?\n$/, '') }
    } catch (err) {
      return { error: `failed to read file: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
  const res = spawnSync('pbpaste', [], { encoding: 'utf-8', timeout: EXEC_TIMEOUT_MS })
  if (res.error || res.status !== 0) {
    return {
      error: `clipboard read failed (pbpaste): ${res.error?.message ?? `exit ${res.status}`}`,
    }
  }
  return { value: res.stdout ?? '' }
}

export async function executeSecretSet(input: SecretSetInput): Promise<SecretSetResult> {
  const { value, error } = readValue(input)
  if (error) return { success: false, message: error }
  if (value === undefined || value.length === 0) {
    const where = input.source === 'clipboard' ? 'clipboard (empty?)' : 'file'
    return { success: false, message: `No value found in ${where}. Nothing stored.` }
  }

  // Guarantee the value never surfaces in any returned text, even if a child
  // process echoes it back on error.
  const redact = (s: string): string => s.split(value).join('***')

  // `infisical secrets set` is permitted by the PATH wrapper (writes don't leak
  // vault contents); call it directly. Only value-reading is restricted.
  const res = spawnSync(
    'infisical',
    ['secrets', 'set', `${input.name}=${value}`, '--path', input.path, '--env', input.env],
    { encoding: 'utf-8', timeout: EXEC_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  if (res.error) {
    return {
      success: false,
      message: `infisical set failed: ${redact(res.error.message).slice(0, 200)}`,
    }
  }
  if (res.status !== 0) {
    const stderr = redact((res.stderr ?? '').toString()).slice(0, 200)
    return { success: false, message: `infisical set exited ${res.status}: ${stderr}` }
  }

  let shredNote = ''
  if (input.source === 'file' && input.deleteSource && input.file) {
    try {
      unlinkSync(input.file)
      shredNote = ' (source file deleted)'
    } catch {
      shredNote = ' (warning: could not delete source file — remove it manually)'
    }
  }

  return {
    success: true,
    message:
      `Stored ${input.name} at ${input.path} (env: ${input.env}) — ${value.length} chars from ${input.source}${shredNote}. ` +
      `Value not shown. Verify: crane_secret_check({ path: '${input.path}', env: '${input.env}', names: ['${input.name}'] }).`,
  }
}
