/**
 * Source handlers for doc-generator.
 *
 * Each handler reads a specific source from the repo and returns a
 * SourceFragment (or null if the source is absent).
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  type SourceFragment,
  safeReadFile,
  truncate,
  findFiles,
  readFileFragment,
  readDirectoryContents,
  collectCodeFiles,
} from './doc-generator-fs.js'

// ============================================================================
// Handler type
// ============================================================================

export type SourceHandler = (repoPath: string) => SourceFragment | null

// ============================================================================
// Worker directory helpers
// ============================================================================

function collectWorkerDirs(repoPath: string): string[] {
  const workersDir = join(repoPath, 'workers')
  const dirs: string[] = []
  if (!existsSync(workersDir)) return dirs
  try {
    for (const entry of readdirSync(workersDir)) {
      dirs.push(join(workersDir, entry))
    }
  } catch {
    // ignore
  }
  return dirs
}

// ============================================================================
// Individual source handlers
// ============================================================================

function readClaudeMd(repoPath: string): SourceFragment | null {
  return readFileFragment(join(repoPath, 'CLAUDE.md'), 'CLAUDE.md')
}

function readReadme(repoPath: string): SourceFragment | null {
  return readFileFragment(join(repoPath, 'README.md'), 'README.md')
}

function readPackageJson(repoPath: string): SourceFragment | null {
  const filePath = join(repoPath, 'package.json')
  if (!existsSync(filePath)) return null

  try {
    const raw = safeReadFile(filePath)
    if (!raw) return null
    const pkg = JSON.parse(raw) as Record<string, unknown>
    const relevant = {
      name: pkg['name'],
      description: pkg['description'],
      version: pkg['version'],
      scripts: pkg['scripts'] ? Object.keys(pkg['scripts'] as object) : [],
      dependencies: pkg['dependencies'] ? Object.keys(pkg['dependencies'] as object) : [],
      devDependencies: pkg['devDependencies'] ? Object.keys(pkg['devDependencies'] as object) : [],
    }
    return {
      label: 'package.json',
      content: JSON.stringify(relevant, null, 2),
      path: 'package.json',
    }
  } catch {
    return null
  }
}

function readDocsProcess(repoPath: string): SourceFragment | null {
  return readDirectoryContents(join(repoPath, 'docs', 'process'), 'docs/process/')
}

function buildRouteCandidates(repoPath: string): string[] {
  const candidates = [
    join(repoPath, 'src', 'routes'),
    join(repoPath, 'src', 'api'),
    join(repoPath, 'app', 'routes'),
    join(repoPath, 'app', 'api'),
  ]
  for (const workerDir of collectWorkerDirs(repoPath)) {
    const src = join(workerDir, 'src')
    if (existsSync(src)) {
      candidates.push(src, join(src, 'routes'), join(src, 'endpoints'))
    }
  }
  return candidates
}

function readRouteFiles(repoPath: string): SourceFragment | null {
  const fragments: string[] = []
  const paths: string[] = []

  for (const dir of buildRouteCandidates(repoPath)) {
    if (!existsSync(dir)) continue
    const result = collectCodeFiles(dir, repoPath, ['.ts', '.js'])
    if (result) {
      fragments.push(result.content)
      paths.push(result.path)
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Route Files',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function readOpenApi(repoPath: string): SourceFragment | null {
  for (const name of ['openapi.yaml', 'openapi.json', 'swagger.yaml', 'swagger.json']) {
    const fragment = readFileFragment(join(repoPath, name), name)
    if (fragment) return fragment
  }
  return null
}

function isApiRelatedContent(content: string): boolean {
  return (
    content.includes('GET') ||
    content.includes('POST') ||
    content.includes('PUT') ||
    content.includes('DELETE') ||
    content.includes('/api/')
  )
}

function readTestFiles(repoPath: string): SourceFragment | null {
  const testDirs = [
    join(repoPath, 'src', '**'),
    join(repoPath, 'test'),
    join(repoPath, 'tests'),
    join(repoPath, '__tests__'),
  ]

  const fragments: string[] = []
  const paths: string[] = []

  for (const dir of testDirs) {
    if (!existsSync(dir)) continue
    try {
      const files = findFiles(dir, ['.test.ts', '.test.js', '.spec.ts', '.spec.js'])
      for (const file of files.slice(0, 10)) {
        const content = safeReadFile(file)
        if (content && isApiRelatedContent(content)) {
          fragments.push(`// ${relative(repoPath, file)}\n${truncate(content, 3000)}`)
          paths.push(relative(repoPath, file))
        }
      }
    } catch {
      // ignore
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Test Files (API-related)',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function buildMigrationCandidates(repoPath: string): string[] {
  const candidates = [
    join(repoPath, 'migrations'),
    join(repoPath, 'drizzle'),
    join(repoPath, 'prisma', 'migrations'),
  ]
  for (const workerDir of collectWorkerDirs(repoPath)) {
    candidates.push(join(workerDir, 'migrations'))
  }
  return candidates
}

function readMigrations(repoPath: string): SourceFragment | null {
  const fragments: string[] = []
  const paths: string[] = []

  for (const dir of buildMigrationCandidates(repoPath)) {
    if (!existsSync(dir)) continue
    try {
      const files = findFiles(dir, ['.sql', '.ts'])
      for (const file of files) {
        const content = safeReadFile(file)
        if (content) {
          fragments.push(`-- ${relative(repoPath, file)}\n${truncate(content, 5000)}`)
          paths.push(relative(repoPath, file))
        }
      }
    } catch {
      // ignore
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Migration Files',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function collectSchemaCandidates(repoPath: string): string[] {
  const candidates: string[] = []
  const schemaPatterns = ['schema.ts', 'schema.sql', 'schema.prisma', 'models.ts', 'db.ts']

  for (const pattern of schemaPatterns) {
    const inSrc = join(repoPath, 'src', pattern)
    if (existsSync(inSrc)) candidates.push(inSrc)
    const atRoot = join(repoPath, pattern)
    if (existsSync(atRoot)) candidates.push(atRoot)
  }

  for (const dir of ['src/db', 'src/models', 'src/schema', 'db']) {
    const fullDir = join(repoPath, dir)
    if (!existsSync(fullDir)) continue
    try {
      candidates.push(...findFiles(fullDir, ['.ts', '.sql']))
    } catch {
      // ignore
    }
  }

  return candidates
}

function readSchemaFiles(repoPath: string): SourceFragment | null {
  const candidates = collectSchemaCandidates(repoPath)
  if (candidates.length === 0) return null

  const fragments: string[] = []
  const paths: string[] = []

  for (const file of candidates.slice(0, 10)) {
    const content = safeReadFile(file)
    if (content) {
      fragments.push(`// ${relative(repoPath, file)}\n${truncate(content, 5000)}`)
      paths.push(relative(repoPath, file))
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Schema/Model Files',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function buildWranglerCandidates(repoPath: string): string[] {
  const candidates = [join(repoPath, 'wrangler.toml')]
  for (const workerDir of collectWorkerDirs(repoPath)) {
    candidates.push(join(workerDir, 'wrangler.toml'))
  }
  return candidates
}

function readWranglerToml(repoPath: string): SourceFragment | null {
  const fragments: string[] = []
  const paths: string[] = []

  for (const file of buildWranglerCandidates(repoPath)) {
    if (!existsSync(file)) continue
    const content = safeReadFile(file)
    if (content) {
      fragments.push(`# ${relative(repoPath, file)}\n${truncate(content, 3000)}`)
      paths.push(relative(repoPath, file))
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Wrangler Config',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function readVenturesJson(repoPath: string): SourceFragment | null {
  return readFileFragment(join(repoPath, 'config', 'ventures.json'), 'ventures.json')
}

// ============================================================================
// Handler registry
// ============================================================================

export const SOURCE_HANDLERS: Record<string, SourceHandler> = {
  claude_md: readClaudeMd,
  readme: readReadme,
  package_json: readPackageJson,
  docs_process: readDocsProcess,
  route_files: readRouteFiles,
  openapi: readOpenApi,
  tests: readTestFiles,
  migrations: readMigrations,
  schema_files: readSchemaFiles,
  wrangler_toml: readWranglerToml,
  ventures_json: readVenturesJson,
}
