/**
 * Crane Context API client — Schedule layer (Part 2b of 3)
 *
 * Extends CraneApiBase with schedule, planned events, and session history methods.
 * CraneApi extends this class.
 */

import { CraneApiBase } from './crane-api-base.js'
import type {
  ScheduleBriefingResponse,
  CompleteScheduleParams,
  CompleteScheduleResponse,
  ScheduleItemsResponse,
  LinkScheduleCalendarResponse,
  WorkDayResponse,
  PlannedEvent,
  CreatePlannedEventInput,
  SessionHistoryEntry,
} from './crane-api-types.js'

export class CraneApiSchedule extends CraneApiBase {
  async getScheduleBriefing(scope?: string): Promise<ScheduleBriefingResponse> {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ''
    const response = await fetch(`${this.apiBase}/schedule/briefing${qs}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    return (await response.json()) as ScheduleBriefingResponse
  }

  async completeScheduleItem(
    name: string,
    params: CompleteScheduleParams
  ): Promise<CompleteScheduleResponse> {
    const response = await fetch(`${this.apiBase}/schedule/${encodeURIComponent(name)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': this.apiKey },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Complete schedule item failed (${response.status}): ${text}`)
    }
    return (await response.json()) as CompleteScheduleResponse
  }

  async getScheduleItems(): Promise<ScheduleItemsResponse> {
    const response = await fetch(`${this.apiBase}/schedule/items`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    return (await response.json()) as ScheduleItemsResponse
  }

  async linkScheduleCalendar(
    name: string,
    gcalEventId: string | null
  ): Promise<LinkScheduleCalendarResponse> {
    const response = await fetch(
      `${this.apiBase}/schedule/${encodeURIComponent(name)}/link-calendar`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Key': this.apiKey },
        body: JSON.stringify({ gcal_event_id: gcalEventId }),
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Link calendar failed (${response.status}): ${text}`)
    }
    return (await response.json()) as LinkScheduleCalendarResponse
  }

  async upsertWorkDay(
    action: 'start' | 'end',
    gcalEventId?: string | null
  ): Promise<WorkDayResponse> {
    const body: Record<string, unknown> = { action }
    if (gcalEventId !== undefined) body.gcal_event_id = gcalEventId
    const response = await fetch(`${this.apiBase}/work-day`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': this.apiKey },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Upsert work day failed (${response.status}): ${text}`)
    }
    return (await response.json()) as WorkDayResponse
  }

  async getPlannedEvents(from: string, to: string, type?: string): Promise<PlannedEvent[]> {
    const queryParts = [`from=${encodeURIComponent(from)}`, `to=${encodeURIComponent(to)}`]
    if (type) queryParts.push(`type=${encodeURIComponent(type)}`)
    const response = await fetch(`${this.apiBase}/planned-events?${queryParts.join('&')}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const data = (await response.json()) as { events: PlannedEvent[] }
    return data.events
  }

  async createPlannedEvent(input: CreatePlannedEventInput): Promise<PlannedEvent> {
    const response = await fetch(`${this.apiBase}/planned-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': this.apiKey },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Create planned event failed (${response.status}): ${text}`)
    }
    const data = (await response.json()) as { event: PlannedEvent }
    return data.event
  }

  async updatePlannedEvent(
    id: string,
    updates: Partial<
      Pick<PlannedEvent, 'type' | 'start_time' | 'end_time' | 'sync_status' | 'gcal_event_id'>
    >
  ): Promise<PlannedEvent> {
    const response = await fetch(`${this.apiBase}/planned-events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': this.apiKey },
      body: JSON.stringify(updates),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update planned event failed (${response.status}): ${text}`)
    }
    const data = (await response.json()) as { event: PlannedEvent }
    return data.event
  }

  async clearPlannedEvents(from: string): Promise<{ deleted: number }> {
    const response = await fetch(
      `${this.apiBase}/planned-events?from=${encodeURIComponent(from)}&type=planned`,
      {
        method: 'DELETE',
        headers: { 'X-Relay-Key': this.apiKey },
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Clear planned events failed (${response.status}): ${text}`)
    }
    return (await response.json()) as { deleted: number }
  }

  async getSessionHistory(days: number): Promise<SessionHistoryEntry[]> {
    const response = await fetch(`${this.apiBase}/sessions/history?days=${days}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const data = (await response.json()) as { entries: SessionHistoryEntry[] }
    return data.entries
  }
}
