import { noteInputSchema, executeNote, notesInputSchema, executeNotes } from '../tools/notes.js'
import { scheduleInputSchema, executeSchedule } from '../tools/schedule.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const NOTE_TOOLS: ToolEntry[] = [
  makeEntry(
    {
      name: 'crane_note',
      description: 'Create or update a VCMS note.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update'],
            description: 'Whether to create a new note or update an existing one',
          },
          id: {
            type: 'string',
            description: 'Note ID (required for update, ignored for create)',
          },
          title: {
            type: 'string',
            description: 'Optional title/subject',
          },
          content: {
            type: 'string',
            description: 'Note body (required for create)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Tags for categorization (e.g., executive-summary, prd, strategy, methodology, bio, governance)',
          },
          venture: {
            type: 'string',
            description: 'Optional venture code (ke, sc, dfg, etc.)',
          },
        },
        required: ['action'],
      },
    },
    noteInputSchema,
    executeNote,
    false
  ),
  makeEntry(
    {
      name: 'crane_notes',
      description: 'Search and list VCMS notes.',
      inputSchema: {
        type: 'object',
        properties: {
          venture: {
            type: 'string',
            description: 'Filter by venture code',
          },
          tag: {
            type: 'string',
            description: 'Filter by tag (e.g., executive-summary, prd, strategy, methodology, bio)',
          },
          q: {
            type: 'string',
            description: 'Text search in title and content',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default 10)',
          },
        },
      },
    },
    notesInputSchema,
    executeNotes,
    true
  ),
  makeEntry(
    {
      name: 'crane_schedule',
      description: 'Cadence engine - manage recurring activities and planned events.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'list',
              'complete',
              'items',
              'link-calendar',
              'planned-events',
              'planned-event-create',
              'planned-event-update',
              'planned-events-clear',
              'session-history',
            ],
            description:
              'Action: "list" to view briefing, "complete" to record completion, "items" to get all items with calendar state, "link-calendar" to store gcal_event_id, ' +
              '"planned-events" to list planned events, "planned-event-create" to create a planned event, "planned-event-update" to update a planned event, ' +
              '"planned-events-clear" to clear planned events, "session-history" to view session history',
          },
          scope: {
            type: 'string',
            description: 'Venture code to filter briefing (list action only)',
          },
          name: {
            type: 'string',
            description: 'Schedule item name (required for complete and link-calendar actions)',
          },
          result: {
            type: 'string',
            enum: ['success', 'warning', 'failure', 'skipped'],
            description: 'Completion result (complete action only)',
          },
          summary: {
            type: 'string',
            description: 'Brief outcome description (complete action only)',
          },
          completed_by: {
            type: 'string',
            description: 'Who completed this (complete action only)',
          },
          gcal_event_id: {
            type: ['string', 'null'],
            description: 'Google Calendar event ID (link-calendar action). Pass null to unlink.',
          },
          from: {
            type: 'string',
            description: 'Start date YYYY-MM-DD (planned-events action)',
          },
          to: {
            type: 'string',
            description: 'End date YYYY-MM-DD (planned-events action)',
          },
          // Keep description in sync with Zod schema in tools/schedule.ts
          type: {
            type: 'string',
            description:
              'Event type: planned, actual, or cancelled. Filters list results (planned-events) and sets value on create/update.',
          },
          event_date: {
            type: 'string',
            description: 'Event date YYYY-MM-DD (planned-event-create action)',
          },
          venture: {
            type: 'string',
            description: 'Venture code (planned-event-create action)',
          },
          title: {
            type: 'string',
            description: 'Event title (planned-event-create action)',
          },
          start_time: {
            type: 'string',
            description: 'Start time HH:MM (planned-event-create/update action)',
          },
          end_time: {
            type: 'string',
            description: 'End time HH:MM (planned-event-create/update action)',
          },
          id: {
            type: 'string',
            description: 'Event ID (planned-event-update action)',
          },
          sync_status: {
            type: 'string',
            enum: ['pending', 'synced', 'error'],
            description: 'Sync status (planned-event-update action)',
          },
          days: {
            type: 'number',
            description: 'Number of days to look back (session-history action, default 7)',
          },
        },
        required: ['action'],
      },
    },
    scheduleInputSchema,
    executeSchedule,
    true
  ),
]
