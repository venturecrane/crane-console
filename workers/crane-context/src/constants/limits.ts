export const MAX_HANDOFF_PAYLOAD_SIZE = 800 * 1024

export const MAX_IDEMPOTENCY_BODY_SIZE = 64 * 1024

export const MAX_REQUEST_BODY_SIZE = 1024 * 1024

export const IDEMPOTENCY_TTL_SECONDS = 3600

export const REQUEST_LOG_RETENTION_DAYS = 7

export const ACTOR_KEY_ID_LENGTH = 16

export const ID_PREFIXES = {
  SESSION: 'sess_',
  HANDOFF: 'ho_',
  CHECKPOINT: 'cp_',
  CORRELATION: 'corr_',
  MACHINE: 'mach_',
  NOTE: 'note_',
  SCHEDULE: 'sched_',
  NOTIFICATION: 'notif_',
  PLANNED_EVENT: 'pe_',
  VERIFY: 'vfy_',
} as const

export const CURRENT_SCHEMA_VERSION = '1.0'

export const DEFAULT_PAGE_SIZE = 20

export const MAX_PAGE_SIZE = 100
