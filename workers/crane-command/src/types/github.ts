/**
 * GitHub Integration Types for Crane Command Center
 *
 * Multi-venture support for Venture Crane operations.
 */

export type QueueType =
  | 'needs-qa'
  | 'needs-pm'
  | 'dev-queue'
  | 'ready-to-merge'
  | 'in-flight';

export type PromptType =
  | 'qa'
  | 'pm'
  | 'agent-brief'
  | 'merge';

export type VentureFilter = 'all' | 'venture-crane' | 'silicon-crane' | 'dfg';

export type TrackFilter = 'all' | '1' | '2' | '3' | 'unassigned';

export interface VentureConfig {
  id: VentureFilter;
  name: string;
  owner: string;
  repo: string;
  color: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}

export interface WorkQueueCard {
  // Multi-venture metadata
  venture: VentureFilter;
  ventureOwner: string;
  ventureRepo: string;

  // GitHub data
  type: 'issue' | 'pr';
  number: number;
  title: string;
  url: string;
  body: string;
  labels: GitHubLabel[];
  updatedAt: string;
  previewUrl?: string;

  // Derived fields
  statusLabels: string[];
  needsLabels: string[];
  qaGrade?: string;
  hasAgentBrief: boolean;
  track?: string; // Track assignment (T1, T2, T3, etc.)

  // Orchestrator metadata (future)
  lastEventType?: string;
  lastEventTimestamp?: string;
  overallVerdict?: 'PASS' | 'FAIL' | 'BLOCKED';
  provenanceVerified?: boolean;

  // Provider settings (future)
  qaProvider?: 'anthropic' | 'openai';
  qaModel?: string;
  qaTemperature?: number;
}

export interface AllQueues {
  needsQa: WorkQueueCard[];
  needsPm: WorkQueueCard[];
  devQueue: WorkQueueCard[];
  readyToMerge: WorkQueueCard[];
  inFlight: WorkQueueCard[];
}

export interface PromptContext {
  number: number;
  title: string;
  url: string;
  body: string;
  labels: GitHubLabel[];
  previewUrl?: string;
  type: 'issue' | 'pr';
  venture: VentureFilter;
  ventureOwner: string;
  ventureRepo: string;
}

export interface GitHubQueueResponse {
  queue: QueueType;
  cards: WorkQueueCard[];
  cached: boolean;
  fetchedAt: string;
}
