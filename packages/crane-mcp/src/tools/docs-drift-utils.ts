/**
 * Docs drift audit — utility barrel
 *
 * Re-exports from the split modules for backward compatibility.
 * New code should import directly from the source modules.
 */

export {
  VENTURE_CODES,
  GLOBAL_SEARCH_DIRS,
  extractMarkdownLinks,
  isExternalUrl,
  isMarkdownTarget,
  resolveLocalUrl,
  extractCraneDocCalls,
  resolveCraneDocCall,
} from './drift-markdown-parse.js'
export type { ExtractedLink, CraneDocCall } from './drift-markdown-parse.js'

export {
  findConsoleRoot,
  walkMarkdownFiles,
  gitMtimeMap,
  discoverDeprecatedSkills,
  classifyDocsDirs,
} from './drift-fs-helpers.js'
export type { DeprecatedSkill } from './drift-fs-helpers.js'

export {
  extractAstroSidebar,
  extractAstroSidebarViaImport,
  extractAstroSidebarViaSource,
} from './drift-astro-sidebar.js'
export type { SidebarExtraction } from './drift-astro-sidebar.js'
