/**
 * Doc generator for self-healing documentation system
 *
 * Reads local sources (codebase, configs, migrations) and produces
 * structured markdown documentation for upload to crane-context.
 *
 * Implementation is split across sibling modules:
 *   - doc-generator-fs.ts       file-system primitives
 *   - doc-generator-sources.ts  per-source-key handlers
 *   - doc-generator-builders.ts per-doc-type markdown builders
 */

import { SOURCE_HANDLERS } from './doc-generator-sources.js'
import { buildProjectInstructions, buildApiDoc, buildSchemaDoc } from './doc-generator-builders.js'

// ============================================================================
// Public types
// ============================================================================

export interface GeneratedDoc {
  content: string
  title: string
  sources_read: string[]
}

// ============================================================================
// Doc type registry
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
// Main entry point
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
  const docType = detectDocType(docName)
  if (!docType) return null

  const fragments = generationSources.flatMap((source) => {
    const handler = SOURCE_HANDLERS[source]
    if (!handler) return []
    const fragment = handler(repoPath)
    return fragment ? [fragment] : []
  })

  if (fragments.length === 0) return null

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
  }

  return {
    content,
    title: `${ventureName} - ${DOC_TYPE_TITLES[docType]}`,
    sources_read: sourcesRead,
  }
}
