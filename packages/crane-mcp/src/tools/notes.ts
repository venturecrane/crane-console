/**
 * crane_note / crane_notes tools - Enterprise knowledge store (VCMS)
 *
 * crane_note: Create or update a note with tags
 * crane_notes: Search/list notes by tag, venture, or text
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type { Note } from '../lib/crane-api.js'

// ============================================================================
// crane_note - Create or Update
// ============================================================================

export const noteInputSchema = z.object({
  action: z
    .enum(['create', 'update'])
    .describe('Whether to create a new note or update an existing one'),
  id: z.string().optional().describe('Note ID (required for update, ignored for create)'),
  title: z.string().optional().describe('Optional title/subject'),
  content: z.string().optional().describe('Note body (required for create)'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorization (e.g., executive-summary, prd, strategy, methodology, bio)'),
  venture: z.string().optional().describe('Optional venture code (ke, sc, dfg, etc.)'),
})

export type NoteInput = z.infer<typeof noteInputSchema>

export interface NoteResult {
  success: boolean
  message: string
}

function formatNote(note: Note): string {
  const parts: string[] = []
  parts.push(`**${note.title || '(untitled)'}** (${note.id})`)
  if (note.venture) parts.push(`Venture: ${note.venture}`)
  if (note.tags) {
    try {
      const tags = JSON.parse(note.tags) as string[]
      if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`)
    } catch {
      // ignore malformed tags
    }
  }
  parts.push(`Created: ${note.created_at}`)
  if (note.updated_at !== note.created_at) {
    parts.push(`Updated: ${note.updated_at}`)
  }
  parts.push('')
  parts.push(note.content)
  return parts.join('\n')
}

function formatNoteSummary(note: Note): string {
  const title = note.title || note.content.substring(0, 60).replace(/\n/g, ' ')
  const venture = note.venture ? ` [${note.venture}]` : ''
  return `- **${title}**${venture} (${note.id}) - ${note.created_at.split('T')[0]}`
}

export async function executeNote(input: NoteInput): Promise<NoteResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot access notes.',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  if (input.action === 'create') {
    if (!input.content) {
      return {
        success: false,
        message: 'Content is required for creating a note.',
      }
    }

    try {
      const note = await api.createNote({
        title: input.title,
        content: input.content,
        tags: input.tags,
        venture: input.venture,
      })

      const tagInfo = input.tags?.length ? `\nTags: ${input.tags.join(', ')}` : ''
      return {
        success: true,
        message: `Note created. (${note.id})${note.title ? `\nTitle: ${note.title}` : ''}${note.venture ? `\nVenture: ${note.venture}` : ''}${tagInfo}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to create note: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  if (input.action === 'update') {
    if (!input.id) {
      return {
        success: false,
        message: 'Note ID is required for updating a note.',
      }
    }

    try {
      const note = await api.updateNote(input.id, {
        title: input.title,
        content: input.content,
        tags: input.tags,
        venture: input.venture,
      })

      return {
        success: true,
        message: `Note updated. (${note.id})\n\n${formatNote(note)}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to update note: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  return {
    success: false,
    message: `Unknown action: ${input.action}`,
  }
}

// ============================================================================
// crane_notes - Search / List
// ============================================================================

export const notesInputSchema = z.object({
  venture: z.string().optional().describe('Filter by venture code'),
  tag: z.string().optional().describe('Filter by tag (e.g., executive-summary, prd, strategy)'),
  q: z.string().optional().describe('Text search in title and content'),
  limit: z.number().optional().describe('Maximum results to return (default 20)'),
})

export type NotesInput = z.infer<typeof notesInputSchema>

export interface NotesResult {
  success: boolean
  message: string
}

export async function executeNotes(input: NotesInput): Promise<NotesResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot access notes.',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  try {
    const result = await api.listNotes({
      venture: input.venture,
      tag: input.tag,
      q: input.q,
      limit: input.limit,
    })

    if (result.notes.length === 0) {
      const filters: string[] = []
      if (input.venture) filters.push(`venture=${input.venture}`)
      if (input.tag) filters.push(`tag=${input.tag}`)
      if (input.q) filters.push(`q="${input.q}"`)

      return {
        success: true,
        message: `No notes found${filters.length > 0 ? ` matching: ${filters.join(', ')}` : ''}.`,
      }
    }

    const lines: string[] = [`Found ${result.count} note${result.count === 1 ? '' : 's'}:\n`]

    for (const note of result.notes) {
      lines.push(formatNoteSummary(note))
    }

    if (result.pagination?.next_cursor) {
      lines.push(`\n_More results available._`)
    }

    return {
      success: true,
      message: lines.join('\n'),
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to search notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
