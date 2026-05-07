export const STALE_AFTER_MINUTES = 45

export const HEARTBEAT_INTERVAL_SECONDS = 600

export const HEARTBEAT_JITTER_SECONDS = 120

export const SESSION_STATUSES = ['active', 'ended', 'abandoned'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

export const END_REASONS = ['manual', 'stale', 'superseded', 'error'] as const
export type EndReason = (typeof END_REASONS)[number]
