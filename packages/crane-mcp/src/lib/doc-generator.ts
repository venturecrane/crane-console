/**
 * Doc generator for self-healing documentation system
 *
 * Reads local sources (codebase, configs, migrations) and produces
 * structured markdown documentation for upload to crane-context.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, basename, relative } from 'path'

// ============================================================================
// Types
// ============================================================================

export interface GeneratedDoc {
  content: string
  title: string
  sources_read: string[]
}

type SourceHandler = (repoPath: string) => SourceFragment | null

interface SourceFragment {
  label: string
  content: string
  path: string
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate documentation content from local sources.
 *
 * @param docName - The target doc name (e.g., "vc-project-instructions.md")
 * @param venture - Venture code
 * @param ventureName - Human-readable venture name
 * @param generationSources - Source keys from the requirement
 * @param repoPath - Absolute path to the venture's repo
 * @returns Generated doc or null if insufficient sources
 */
export function generateDoc(
  docName: string,
  venture: string,
  ventureName: string,
  generationSources: string[],
  repoPath: string
): GeneratedDoc | null {
  // Determine doc type from name
  const docType = detectDocType(docName)
  if (!docType) return null

  // Collect source fragments
  const fragments: SourceFragment[] = []
  for (const source of generationSources) {
    const handler = SOURCE_HANDLERS[source]
    if (handler) {
      const fragment = handler(repoPath)
      if (fragment) {
        fragments.push(fragment)
      }
    }
  }

  if (fragments.length === 0) return null

  // Build the document
  const now = new Date().toISOString().split('T')[0]
  const sourcesRead = fragments.map((f) => f.path)
  const sourcesList = sourcesRead.join(', ')

  let content: string
  switch (docType) {
    case 'project-instructions':
      content = buildProjectInstructions(ventureName, venture, fragments, now, sourcesList)
      break
    case 'api':
      content = buildApiDoc(ventureName, venture, fragments, now, sourcesList)
      break
    case 'schema':
      content = buildSchemaDoc(ventureName, venture, fragments, now, sourcesList)
      break
    default:
      return null
  }

  return {
    content,
    title: `${ventureName} - ${DOC_TYPE_TITLES[docType]}`,
    sources_read: sourcesRead,
  }
}

// ============================================================================
// Doc Type Detection
// ============================================================================

type DocType = 'project-instructions' | 'api' | 'schema'

const DOC_TYPE_TITLES: Record<DocType, string> = {
  'project-instructions': 'Project Instructions',
  api: 'API Reference',
  schema: 'Database Schema',
}

function detectDocType(docName: string): DocType | null {
  if (docName.includes('project-instructions')) return 'project-instructions'
  if (docName.includes('-api.')) return 'api'
  if (docName.includes('-schema.')) return 'schema'
  return null
}

// ============================================================================
// Source Handlers
// ============================================================================

const SOURCE_HANDLERS: Record<string, SourceHandler> = {
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
}

function readClaudeMd(repoPath: string): SourceFragment | null {
  const filePath = join(repoPath, 'CLAUDE.md')
  return readFileFragment(filePath, 'CLAUDE.md')
}

function readReadme(repoPath: string): SourceFragment | null {
  const filePath = join(repoPath, 'README.md')
  return readFileFragment(filePath, 'README.md')
}

function readPackageJson(repoPath: string): SourceFragment | null {
  const filePath = join(repoPath, 'package.json')
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const pkg = JSON.parse(raw)
    const relevant = {
      name: pkg.name,
      description: pkg.description,
      version: pkg.version,
      scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
      dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
      devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
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
  const docsDir = join(repoPath, 'docs', 'process')
  return readDirectoryContents(docsDir, 'docs/process/')
}

function readRouteFiles(repoPath: string): SourceFragment | null {
  // Look in common route locations
  const candidates = [
    join(repoPath, 'src', 'routes'),
    join(repoPath, 'src', 'api'),
    join(repoPath, 'app', 'routes'),
    join(repoPath, 'app', 'api'),
  ]

  // Also look inside workers/*/src for Cloudflare Worker routes
  const workersDir = join(repoPath, 'workers')
  if (existsSync(workersDir)) {
    try {
      for (const entry of readdirSync(workersDir)) {
        const workerSrc = join(workersDir, entry, 'src')
        if (existsSync(workerSrc)) {
          candidates.push(workerSrc)
          candidates.push(join(workerSrc, 'routes'))
          candidates.push(join(workerSrc, 'endpoints'))
        }
      }
    } catch {
      // Ignore
    }
  }

  const fragments: string[] = []
  const paths: string[] = []

  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    const content = collectCodeFiles(dir, repoPath, ['.ts', '.js'])
    if (content) {
      fragments.push(content.content)
      paths.push(content.path)
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
  const candidates = ['openapi.yaml', 'openapi.json', 'swagger.yaml', 'swagger.json']
  for (const name of candidates) {
    const filePath = join(repoPath, name)
    const fragment = readFileFragment(filePath, name)
    if (fragment) return fragment
  }
  return null
}

function readTestFiles(repoPath: string): SourceFragment | null {
  // Look for test files that contain HTTP methods/paths
  const testPatterns = [
    join(repoPath, 'src', '**'),
    join(repoPath, 'test'),
    join(repoPath, 'tests'),
    join(repoPath, '__tests__'),
  ]

  const fragments: string[] = []
  const paths: string[] = []

  for (const dir of testPatterns) {
    if (!existsSync(dir)) continue
    try {
      const files = findFiles(dir, ['.test.ts', '.test.js', '.spec.ts', '.spec.js'])
      for (const file of files.slice(0, 10)) {
        // Limit to 10 test files
        const content = safeReadFile(file)
        if (
          content &&
          (content.includes('GET') ||
            content.includes('POST') ||
            content.includes('PUT') ||
            content.includes('DELETE') ||
            content.includes('/api/'))
        ) {
          fragments.push(`// ${relative(repoPath, file)}\n${truncate(content, 3000)}`)
          paths.push(relative(repoPath, file))
        }
      }
    } catch {
      // Ignore
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Test Files (API-related)',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function readMigrations(repoPath: string): SourceFragment | null {
  const candidates = [
    join(repoPath, 'migrations'),
    join(repoPath, 'drizzle'),
    join(repoPath, 'prisma', 'migrations'),
  ]

  // Also check worker-specific migrations
  const workersDir = join(repoPath, 'workers')
  if (existsSync(workersDir)) {
    try {
      for (const entry of readdirSync(workersDir)) {
        candidates.push(join(workersDir, entry, 'migrations'))
      }
    } catch {
      // Ignore
    }
  }

  const fragments: string[] = []
  const paths: string[] = []

  for (const dir of candidates) {
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
      // Ignore
    }
  }

  if (fragments.length === 0) return null

  return {
    label: 'Migration Files',
    content: fragments.join('\n\n---\n\n'),
    path: paths.join(', '),
  }
}

function readSchemaFiles(repoPath: string): SourceFragment | null {
  // Look for schema/model files
  const candidates: string[] = []

  // Common schema file patterns
  const schemaPatterns = ['schema.ts', 'schema.sql', 'schema.prisma', 'models.ts', 'db.ts']

  for (const pattern of schemaPatterns) {
    const filePath = join(repoPath, 'src', pattern)
    if (existsSync(filePath)) candidates.push(filePath)

    const filePath2 = join(repoPath, pattern)
    if (existsSync(filePath2)) candidates.push(filePath2)
  }

  // Look in src/db/ or src/models/
  for (const dir of ['src/db', 'src/models', 'src/schema', 'db']) {
    const fullDir = join(repoPath, dir)
    if (existsSync(fullDir)) {
      try {
        const files = findFiles(fullDir, ['.ts', '.sql'])
        candidates.push(...files)
      } catch {
        // Ignore
      }
    }
  }

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

function readWranglerToml(repoPath: string): SourceFragment | null {
  // Check root and worker dirs
  const candidates = [join(repoPath, 'wrangler.toml')]
  const workersDir = join(repoPath, 'workers')
  if (existsSync(workersDir)) {
    try {
      for (const entry of readdirSync(workersDir)) {
        candidates.push(join(workersDir, entry, 'wrangler.toml'))
      }
    } catch {
      // Ignore
    }
  }

  const fragments: string[] = []
  const paths: string[] = []

  for (const file of candidates) {
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

// ============================================================================
// Doc Builders
// ============================================================================

function buildProjectInstructions(
  ventureName: string,
  venture: string,
  fragments: SourceFragment[],
  date: string,
  sourcesList: string
): string {
  const sections: string[] = [
    `# ${ventureName} - Project Instructions`,
    '',
    `> Auto-generated by crane-context on ${date}. Review and update as needed.`,
    `> Sources: ${sourcesList}`,
    '',
  ]

  // Extract info from fragments
  const claudeMd = fragments.find((f) => f.label === 'CLAUDE.md')
  const readme = fragments.find((f) => f.label === 'README.md')
  const pkgJson = fragments.find((f) => f.label === 'package.json')
  const docsProcess = fragments.find((f) => f.label === 'docs/process/')

  // Product overview
  sections.push('## Product Overview', '')
  if (readme) {
    // Extract first paragraph from README
    const firstParagraph = extractFirstParagraph(readme.content)
    if (firstParagraph) {
      sections.push(firstParagraph, '')
    }
  }

  // Tech stack from package.json
  if (pkgJson) {
    sections.push('## Tech Stack', '')
    try {
      const pkg = JSON.parse(pkgJson.content)
      if (pkg.dependencies?.length > 0) {
        sections.push('**Key Dependencies:**', ...pkg.dependencies.map((d: string) => `- ${d}`), '')
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Development instructions from CLAUDE.md
  if (claudeMd) {
    sections.push('## Development Instructions', '')
    sections.push(truncate(claudeMd.content, 8000), '')
  }

  // Process docs
  if (docsProcess) {
    sections.push('## Process Documentation', '')
    sections.push(truncate(docsProcess.content, 4000), '')
  }

  return sections.join('\n')
}

function buildApiDoc(
  ventureName: string,
  venture: string,
  fragments: SourceFragment[],
  date: string,
  sourcesList: string
): string {
  const sections: string[] = [
    `# ${ventureName} - API Reference`,
    '',
    `> Auto-generated by crane-context on ${date}. Review and update as needed.`,
    `> Sources: ${sourcesList}`,
    '',
  ]

  const openapi = fragments.find((f) => f.label === 'OpenAPI Spec')
  const routes = fragments.find((f) => f.label === 'Route Files')
  const tests = fragments.find((f) => f.label === 'Test Files (API-related)')

  if (openapi) {
    sections.push('## API Specification', '')
    sections.push('```yaml', truncate(openapi.content, 10000), '```', '')
  }

  if (routes) {
    sections.push('## Route Definitions', '')
    sections.push(
      'The following route files define the API endpoints:',
      '',
      '```typescript',
      truncate(routes.content, 15000),
      '```',
      ''
    )
  }

  if (tests) {
    sections.push('## API Test Patterns', '')
    sections.push(
      'Endpoint usage patterns from tests:',
      '',
      '```typescript',
      truncate(tests.content, 8000),
      '```',
      ''
    )
  }

  return sections.join('\n')
}

function buildSchemaDoc(
  ventureName: string,
  venture: string,
  fragments: SourceFragment[],
  date: string,
  sourcesList: string
): string {
  const sections: string[] = [
    `# ${ventureName} - Database Schema`,
    '',
    `> Auto-generated by crane-context on ${date}. Review and update as needed.`,
    `> Sources: ${sourcesList}`,
    '',
  ]

  const migrations = fragments.find((f) => f.label === 'Migration Files')
  const schema = fragments.find((f) => f.label === 'Schema/Model Files')
  const wrangler = fragments.find((f) => f.label === 'Wrangler Config')

  if (wrangler) {
    sections.push('## Database Bindings', '')
    sections.push('From wrangler.toml:', '', '```toml', truncate(wrangler.content, 3000), '```', '')
  }

  if (migrations) {
    sections.push('## Migrations', '')
    sections.push('```sql', truncate(migrations.content, 20000), '```', '')
  }

  if (schema) {
    sections.push('## Schema Definitions', '')
    sections.push('```typescript', truncate(schema.content, 10000), '```', '')
  }

  return sections.join('\n')
}

// ============================================================================
// File Utilities
// ============================================================================

function readFileFragment(filePath: string, label: string): SourceFragment | null {
  if (!existsSync(filePath)) return null
  const content = safeReadFile(filePath)
  if (!content) return null
  return { label, content: truncate(content, 10000), path: label }
}

function readDirectoryContents(dirPath: string, label: string): SourceFragment | null {
  if (!existsSync(dirPath)) return null

  try {
    const files = findFiles(dirPath, ['.md', '.txt'])
    if (files.length === 0) return null

    const fragments: string[] = []
    for (const file of files.slice(0, 10)) {
      const content = safeReadFile(file)
      if (content) {
        fragments.push(`## ${basename(file)}\n\n${truncate(content, 3000)}`)
      }
    }

    if (fragments.length === 0) return null

    return {
      label,
      content: fragments.join('\n\n---\n\n'),
      path: label,
    }
  } catch {
    return null
  }
}

function collectCodeFiles(
  dir: string,
  repoPath: string,
  extensions: string[]
): { content: string; path: string } | null {
  if (!existsSync(dir)) return null

  try {
    const files = findFiles(dir, extensions)
    if (files.length === 0) return null

    const fragments: string[] = []
    for (const file of files.slice(0, 20)) {
      const content = safeReadFile(file)
      if (content) {
        fragments.push(`// ${relative(repoPath, file)}\n${truncate(content, 3000)}`)
      }
    }

    if (fragments.length === 0) return null

    return {
      content: fragments.join('\n\n'),
      path: relative(repoPath, dir),
    }
  } catch {
    return null
  }
}

function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = []

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue

      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          // Only recurse one level deep to avoid excessive scanning
          const subEntries = readdirSync(fullPath)
          for (const subEntry of subEntries) {
            const subPath = join(fullPath, subEntry)
            if (extensions.some((ext) => subEntry.endsWith(ext))) {
              try {
                if (statSync(subPath).isFile()) {
                  results.push(subPath)
                }
              } catch {
                // Ignore
              }
            }
          }
        } else if (extensions.some((ext) => entry.endsWith(ext))) {
          results.push(fullPath)
        }
      } catch {
        // Ignore stat errors
      }
    }
  } catch {
    // Ignore readdir errors
  }

  return results.sort()
}

function safeReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function truncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '\n\n... (truncated)'
}

function extractFirstParagraph(markdown: string): string | null {
  // Skip the title line(s) and get first real paragraph
  const lines = markdown.split('\n')
  let foundContent = false
  const paragraph: string[] = []

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (foundContent) break
      continue
    }
    if (line.trim() === '') {
      if (foundContent) break
      continue
    }
    foundContent = true
    paragraph.push(line)
  }

  return paragraph.length > 0 ? paragraph.join('\n') : null
}
