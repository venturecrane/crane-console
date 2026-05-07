/**
 * Skill and Claude asset mirroring.
 *
 * Mirrors skills and Claude commands from crane-console to venture repos
 * and to the user's home directory on every launcher invocation.
 */

import { existsSync, copyFileSync, readFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { CRANE_CONSOLE_ROOT, venturesConfig } from './constants.js'

/** Load VC-only skill names from config/skill-exclusions.json */
function loadSkillExclusions(): Set<string> {
  try {
    const exclusionPath = join(CRANE_CONSOLE_ROOT, 'config', 'skill-exclusions.json')
    const content = readFileSync(exclusionPath, 'utf-8')
    const names: string[] = JSON.parse(content)
    return new Set(names.map((n) => `${n}.md`))
  } catch {
    return new Set()
  }
}

/**
 * Load launcher-managed Claude Code deny rules from config/claude-deny-rules.json.
 *
 * These rules are injected into user-scope ~/.claude/settings.json on every
 * `crane <venture>` launch by ensureClaudeUserDenyRules(). Adding a new rule
 * is a one-line config commit, not a launcher code change.
 *
 * Graceful fallback: a missing or malformed config file yields an empty list,
 * making the launcher a no-op rather than crashing.
 */
export function loadClaudeDenyRules(): string[] {
  try {
    const rulesPath = join(CRANE_CONSOLE_ROOT, 'config', 'claude-deny-rules.json')
    const content = readFileSync(rulesPath, 'utf-8')
    const rules = JSON.parse(content)
    return Array.isArray(rules) ? rules.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

/**
 * Sync .claude/commands/ and .claude/agents/ from crane-console to the target repo.
 * Overwrites stale files silently. Only copies .md files.
 * Skips sync when repoPath IS crane-console (source === target).
 */
export function syncClaudeAssets(repoPath: string): void {
  const resolvedRepo = readdirSync(repoPath).length >= 0 ? repoPath : repoPath // validate exists
  const resolvedConsole = CRANE_CONSOLE_ROOT

  try {
    if (statSync(resolvedRepo).ino === statSync(resolvedConsole).ino) return
  } catch {
    // If stat fails, proceed with sync anyway
  }

  const excluded = loadSkillExclusions()
  const dirs = ['commands', 'agents'] as const
  let totalSynced = 0

  for (const dir of dirs) {
    const sourceDir = join(resolvedConsole, '.claude', dir)
    const targetDir = join(resolvedRepo, '.claude', dir)

    if (!existsSync(sourceDir)) continue

    const sourceFiles = readdirSync(sourceDir).filter(
      (f) => f.endsWith('.md') && (dir !== 'commands' || !excluded.has(f))
    )
    if (!sourceFiles.length) continue

    mkdirSync(targetDir, { recursive: true })

    for (const file of sourceFiles) {
      const sourcePath = join(sourceDir, file)
      const targetPath = join(targetDir, file)

      if (existsSync(targetPath)) {
        const sourceContent = readFileSync(sourcePath, 'utf-8')
        const targetContent = readFileSync(targetPath, 'utf-8')
        if (sourceContent === targetContent) continue
      }

      copyFileSync(sourcePath, targetPath)
      totalSynced++
    }
  }

  if (totalSynced > 0) {
    console.log(
      `-> Synced ${totalSynced} Claude command/agent file${totalSynced > 1 ? 's' : ''} from crane-console`
    )
  }
}

/**
 * Load skill names from config/global-skills.json.
 *
 * These skills are mirrored from crane-console/.agents/skills/<name>/ to
 * ~/.agents/skills/<name>/ on every launch. They are global tools (e.g.,
 * nav-spec, product-design) that must be available in any venture context,
 * not just when Claude Code runs from crane-console.
 *
 * Graceful fallback: missing or malformed config yields empty list, making
 * the sync a no-op rather than crashing.
 */
function loadGlobalSkills(): string[] {
  try {
    const configPath = join(CRANE_CONSOLE_ROOT, 'config', 'global-skills.json')
    const content = readFileSync(configPath, 'utf-8')
    const names = JSON.parse(content)
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

/**
 * Recursively mirror a directory tree from source to target.
 *
 * - Creates target directories as needed.
 * - Skips files whose content is identical between source and target.
 * - Always overwrites stale files (source is authoritative).
 * - Returns the count of files actually copied.
 *
 * Does not delete files that exist in target but not in source — this keeps
 * local-only additions (e.g., user experiments) intact. Rename with caution.
 */
function mirrorDirectoryTree(sourceDir: string, targetDir: string): number {
  if (!existsSync(sourceDir)) return 0

  let copied = 0
  mkdirSync(targetDir, { recursive: true })

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      copied += mirrorDirectoryTree(sourcePath, targetPath)
    } else if (entry.isFile()) {
      if (existsSync(targetPath)) {
        const sourceContent = readFileSync(sourcePath, 'utf-8')
        const targetContent = readFileSync(targetPath, 'utf-8')
        if (sourceContent === targetContent) continue
      }
      copyFileSync(sourcePath, targetPath)
      copied++
    }
  }

  return copied
}

/**
 * Mirror version-controlled enterprise skills from crane-console to ~/.agents/skills/.
 *
 * Skills listed in config/global-skills.json are copied recursively from
 * crane-console/.agents/skills/<name>/ to ~/.agents/skills/<name>/. This keeps
 * the home-directory copies in sync with the source of truth across the fleet,
 * without requiring each venture repo to hold its own copy.
 *
 * Runs on every `crane <venture>` launch (via checkMcpSetup). Fast no-op when
 * everything is already current (identical files skipped by content compare).
 */
export function syncGlobalSkills(): void {
  const skills = loadGlobalSkills()
  if (skills.length === 0) return

  const sourceRoot = join(CRANE_CONSOLE_ROOT, '.agents', 'skills')
  const targetRoot = join(homedir(), '.agents', 'skills')

  let totalSynced = 0
  for (const skill of skills) {
    const sourceDir = join(sourceRoot, skill)
    const targetDir = join(targetRoot, skill)
    totalSynced += mirrorDirectoryTree(sourceDir, targetDir)
  }

  if (totalSynced > 0) {
    console.log(
      `-> Synced ${totalSynced} global skill file${totalSynced > 1 ? 's' : ''} to ~/.agents/skills/`
    )
  }
}

/**
 * Derive the venture code for a given repo path.
 *
 * Matches by repo directory name against the convention:
 *   {code}-console  (ke → ke-console, sc → sc-console, etc.)
 *   crane-console   (special case for vc, the infra venture)
 *
 * Returns null when no match is found (safe-default: scope-guarded skills skipped).
 */
function resolveVentureCodeFromPath(repoPath: string): string | null {
  const repoName = basename(repoPath)
  for (const v of venturesConfig.ventures as Array<{ code: string }>) {
    const expectedName = v.code === 'vc' ? 'crane-console' : `${v.code}-console`
    if (repoName === expectedName) return v.code
  }
  return null
}

/**
 * Extract the `scope:` value from a SKILL.md YAML frontmatter block.
 *
 * Handles both bare and quoted values:
 *   scope: global
 *   scope: "venture:ss"
 *   scope: enterprise
 *
 * Returns the trimmed, unquoted value, or null if absent or unreadable.
 */
export function parseSkillScope(skillMdPath: string): string | null {
  try {
    const content = readFileSync(skillMdPath, 'utf-8')
    // Match scope: inside a YAML frontmatter block (between the first two ---)
    const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content)
    if (!frontmatterMatch) return null
    const scopeMatch = /^scope:\s*["']?([^"'\n]+)["']?\s*$/m.exec(frontmatterMatch[1])
    if (!scopeMatch) return null
    return scopeMatch[1].trim()
  } catch {
    return null
  }
}

/**
 * Mirror .agents/skills/ from crane-console to a venture repo.
 *
 * Walks every skill directory in <crane-console>/.agents/skills/<name>/ and
 * recursively mirrors it to <venture-repo>/.agents/skills/<name>/.
 *
 * Safety checks applied per-skill:
 *  1. Scope filter: if the skill's SKILL.md declares `scope: venture:<code>`
 *     where <code> does NOT match the target venture, the skill is skipped.
 *  2. Content compare: mirrorDirectoryTree skips identical files — no needless I/O.
 *  3. Target-only preservation: files/dirs that exist in the venture repo but NOT
 *     in crane-console are never deleted.
 *
 * Env flag: CRANE_ENABLE_VENTURE_SKILL_SYNC — defaults to enabled ("1").
 * Set to "0" to disable for a session without code changes:
 *   CRANE_ENABLE_VENTURE_SKILL_SYNC=0 crane ke
 */
export function syncVentureSkills(repoPath: string): void {
  if (process.env['CRANE_ENABLE_VENTURE_SKILL_SYNC'] === '0') return

  const sourceRoot = join(CRANE_CONSOLE_ROOT, '.agents', 'skills')
  if (!existsSync(sourceRoot)) return

  try {
    if (statSync(repoPath).ino === statSync(CRANE_CONSOLE_ROOT).ino) return
  } catch {
    // If stat fails, proceed with sync anyway
  }

  const targetRoot = join(repoPath, '.agents', 'skills')
  const ventureCode = resolveVentureCodeFromPath(repoPath)

  let totalSynced = 0

  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const skillName = entry.name
    const sourceSkillDir = join(sourceRoot, skillName)
    const skillMdPath = join(sourceSkillDir, 'SKILL.md')

    const scope = parseSkillScope(skillMdPath)
    if (scope !== null && scope.startsWith('venture:')) {
      const scopeCode = scope.slice('venture:'.length)
      if (ventureCode === null || scopeCode !== ventureCode) continue
    }

    const targetSkillDir = join(targetRoot, skillName)
    totalSynced += mirrorDirectoryTree(sourceSkillDir, targetSkillDir)
  }

  if (totalSynced > 0) {
    console.log(
      `-> Synced ${totalSynced} venture skill file${totalSynced > 1 ? 's' : ''} to ${repoPath}/.agents/skills/`
    )
  }
}
