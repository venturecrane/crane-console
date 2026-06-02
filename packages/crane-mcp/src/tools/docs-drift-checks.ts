/**
 * Docs drift audit — check functions barrel
 *
 * Re-exports from drift-checks.ts for backward compatibility.
 * New code should import directly from drift-checks.ts.
 */

export {
  checkDeadInternalLinks,
  checkBrokenCraneDocReferences,
  checkDeprecatedSkillMentions,
  checkStaleByGit,
  checkSidebarDrift,
  checkCaptainReviewCandidates,
  checkVentureSidebarParity,
} from './drift-checks.js'
export type { Finding, Severity } from './drift-checks.js'
