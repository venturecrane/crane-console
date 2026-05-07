export const MAX_VERIFY_OUTPUT_BYTES = 8 * 1024

export const MAX_VERIFY_CLAIM_CHARS = 300

export const VERIFY_ORIGIN_LIMIT_CAP = 50

export const VERIFY_LOOKUP_MAX_IDS = 50

export const VERIFY_ID_REGEX = /^vfy_[0-9A-HJKMNP-TV-Z]{26}$/

export const VERIFY_METHODS = ['live_state', 'fresh_process', 'vendor_docs'] as const
export type VerifyMethod = (typeof VERIFY_METHODS)[number]

export const VERIFY_SOURCES = ['manual', 'tool', 'hook'] as const
export type VerifySource = (typeof VERIFY_SOURCES)[number]

export const VERIFY_TOOLS_USED = [
  'Bash',
  'Context7',
  'WebFetch',
  'gh_api',
  'wrangler',
  'vendor_mcp',
  'other',
] as const
export type VerifyToolUsed = (typeof VERIFY_TOOLS_USED)[number]

export const VERIFY_TRUNCATIONS = ['none', 'head', 'tail', 'head_tail'] as const
export type VerifyTruncation = (typeof VERIFY_TRUNCATIONS)[number]

export const VERIFY_VENDOR_DOCS_MIN_OUTPUT = 100

export const VERIFY_AUDIT_DEFAULT_WINDOW_DAYS = 7

export const VERIFY_AUDIT_MAX_WINDOW_DAYS = 90

export const VERIFY_AUDIT_DEFAULT_MAX_MEMORY_CANDIDATES = 5

export const VERIFY_AUDIT_MAX_MEMORY_CANDIDATES_CAP = 20

export const VERIFY_AUDIT_MEMORY_MIN_OCCURRENCES = 3

export const VERIFY_AUDIT_INTEGRITY_SAMPLE_SIZE = 5

export const VERIFY_AUDIT_UNVERIFIED_FILES_CAP = 20

export const VERIFY_AUDIT_CACHE_TTL_SECONDS = 8 * 60 * 60
