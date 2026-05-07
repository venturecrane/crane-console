export interface ScheduleItemRecord {
  id: string
  name: string
  title: string
  description: string | null

  cadence_days: number
  scope: string
  priority: number

  last_completed_at: string | null
  last_completed_by: string | null
  last_result: string | null
  last_result_summary: string | null

  gcal_event_id: string | null

  enabled: number // 0 = false, 1 = true
  created_at: string
  updated_at: string
}

export interface PlannedEventRecord {
  id: string
  event_date: string
  venture: string
  gcal_event_id: string | null
  title: string
  start_time: string
  end_time: string
  type: 'planned' | 'actual' | 'cancelled'
  sync_status: 'pending' | 'synced' | 'error'
  created_at: string
  updated_at: string
}

export interface WorkDayRecord {
  date: string
  gcal_event_id: string | null
  started_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}
