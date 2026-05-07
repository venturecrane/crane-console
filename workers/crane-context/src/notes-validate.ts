/**
 * Crane Context Worker - Notes Validation Helpers
 *
 * Input validation shared by createNote and updateNote.
 */

import { MAX_NOTE_CONTENT_SIZE, VENTURES } from './constants'
import { sizeInBytes } from './utils'

/**
 * Throws if content exceeds the maximum allowed byte size.
 */
export function assertContentSize(content: string): void {
  if (sizeInBytes(content) > MAX_NOTE_CONTENT_SIZE) {
    throw new Error(`Content exceeds maximum size of ${MAX_NOTE_CONTENT_SIZE} bytes`)
  }
}

/**
 * Throws if venture is not in the known-ventures list.
 */
export function assertValidVenture(venture: string): void {
  if (!VENTURES.includes(venture)) {
    throw new Error(`Invalid venture: ${venture}`)
  }
}

/**
 * Throws if the tags array violates count or per-tag length rules.
 */
export function assertValidTags(tags: string[]): void {
  if (tags.length > 20) {
    throw new Error('Maximum 20 tags allowed')
  }
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.length > 50) {
      throw new Error('Each tag must be a string of at most 50 characters')
    }
  }
}
