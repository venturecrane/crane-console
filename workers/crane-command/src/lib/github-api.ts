/**
 * GitHub API Client Layer
 *
 * Client-side functions for fetching GitHub work queues.
 * All calls go through the /api/github proxy route.
 */

import type {
  QueueType,
  WorkQueueCard,
  AllQueues,
  GitHubQueueResponse,
} from '@/types/github';

/**
 * Fetch a single work queue from GitHub.
 *
 * @param queue - The queue type to fetch
 * @returns Array of WorkQueueCard items
 * @throws Error if the API call fails
 */
export async function fetchWorkQueue(
  queue: QueueType
): Promise<WorkQueueCard[]> {
  const response = await fetch(`/api/github?queue=${queue}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: 'Unknown error' },
    }));
    throw new Error(
      error.error?.message || `Failed to fetch ${queue} queue`
    );
  }

  const data: GitHubQueueResponse = await response.json();
  return data.cards;
}

/**
 * Fetch all work queues in parallel.
 *
 * @returns Object containing all 5 queue arrays
 * @throws Error if any queue fails to fetch
 */
export async function fetchAllQueues(): Promise<AllQueues> {
  const [needsQa, needsPm, devQueue, readyToMerge, inFlight] =
    await Promise.all([
      fetchWorkQueue('needs-qa'),
      fetchWorkQueue('needs-pm'),
      fetchWorkQueue('dev-queue'),
      fetchWorkQueue('ready-to-merge'),
      fetchWorkQueue('in-flight'),
    ]);

  return {
    needsQa,
    needsPm,
    devQueue,
    readyToMerge,
    inFlight,
  };
}

/**
 * Refresh a single queue, bypassing cache.
 *
 * @param queue - The queue type to refresh
 * @returns Array of WorkQueueCard items
 * @throws Error if the API call fails
 */
export async function refreshQueue(
  queue: QueueType
): Promise<WorkQueueCard[]> {
  // Add cache-busting timestamp to force fresh fetch
  const timestamp = Date.now();
  const response = await fetch(`/api/github?queue=${queue}&_t=${timestamp}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: 'Unknown error' },
    }));
    throw new Error(
      error.error?.message || `Failed to refresh ${queue} queue`
    );
  }

  const data: GitHubQueueResponse = await response.json();
  return data.cards;
}
