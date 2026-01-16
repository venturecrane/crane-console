'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Terminal,
  CheckCircle,
  AlertCircle,
  Layers,
  GitPullRequest,
  PlayCircle,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { WorkQueueSection } from '@/components/features/work-queue-section';
import { fetchAllQueues, refreshQueue } from '@/lib/github-api';
import {
  QA_PROMPT,
  PM_PROMPT,
  AGENT_BRIEF_PROMPT,
  MERGE_PROMPT,
} from '@/lib/prompt-templates';
import type {
  AllQueues,
  WorkQueueCard,
  PromptType,
  QueueType,
  VentureFilter,
} from '@/types/github';

const VENTURE_FILTERS: Array<{ id: VentureFilter; label: string }> = [
  { id: 'all', label: 'All Ventures' },
  { id: 'venture-crane', label: 'Venture Crane' },
  { id: 'silicon-crane', label: 'Silicon Crane' },
  { id: 'dfg', label: 'DFG' },
];

export default function CommandPage() {
  const [queues, setQueues] = useState<AllQueues | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<Set<QueueType>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ventureFilter, setVentureFilter] = useState<VentureFilter>('all');

  // Initial load
  useEffect(() => {
    loadAllQueues();
  }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(
      () => {
        loadAllQueues(true); // Silent refresh
      },
      60000
    ); // 60 seconds
    return () => clearInterval(interval);
  }, []);

  const loadAllQueues = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const data = await fetchAllQueues();
      setQueues(data);
    } catch (err) {
      console.error('Failed to load queues:', err);
      setError(err instanceof Error ? err.message : 'Failed to load queues');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefreshQueue = useCallback(
    async (queueType: QueueType, queueKey: keyof AllQueues) => {
      setRefreshing((prev) => new Set(prev).add(queueType));

      try {
        const cards = await refreshQueue(queueType);
        setQueues((prev) => (prev ? { ...prev, [queueKey]: cards } : null));
      } catch (err) {
        console.error(`Failed to refresh ${queueType}:`, err);
      } finally {
        setRefreshing((prev) => {
          const next = new Set(prev);
          next.delete(queueType);
          return next;
        });
      }
    },
    []
  );

  const handleCopyPrompt = useCallback(
    async (card: WorkQueueCard, type: PromptType) => {
      const context = {
        number: card.number,
        title: card.title,
        url: card.url,
        body: card.body,
        labels: card.labels,
        previewUrl: card.previewUrl,
        type: card.type,
        venture: card.venture,
        ventureOwner: card.ventureOwner,
        ventureRepo: card.ventureRepo,
      };

      let prompt: string | null = null;

      switch (type) {
        case 'qa':
          prompt = QA_PROMPT(context);
          break;
        case 'pm':
          prompt = PM_PROMPT(context);
          break;
        case 'agent-brief':
          prompt = AGENT_BRIEF_PROMPT(context);
          break;
        case 'merge':
          prompt = MERGE_PROMPT(context);
          break;
      }

      if (!prompt) {
        console.error(`Prompt type ${type} not available for this card`);
        return;
      }

      await copyToClipboard(prompt);
    },
    []
  );

  // Filter queues based on selected venture
  const filteredQueues = useMemo(() => {
    if (!queues || ventureFilter === 'all') return queues;

    return {
      escalations: queues.escalations.filter((card) => card.venture === ventureFilter),
      needsQa: queues.needsQa.filter((card) => card.venture === ventureFilter),
      needsPm: queues.needsPm.filter((card) => card.venture === ventureFilter),
      devQueue: queues.devQueue.filter((card) => card.venture === ventureFilter),
      readyToMerge: queues.readyToMerge.filter((card) => card.venture === ventureFilter),
      inFlight: queues.inFlight.filter((card) => card.venture === ventureFilter),
    };
  }, [queues, ventureFilter]);

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900">
      <main className="container mx-auto max-w-7xl">

        {/* Header */}
        <header className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Terminal className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Crane Command Center
                  {filteredQueues && filteredQueues.escalations.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {filteredQueues.escalations.length}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Multi-Venture Operations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Venture Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={ventureFilter}
                  onChange={(e) => setVentureFilter(e.target.value as VentureFilter)}
                  className="pl-9 pr-8 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                >
                  {VENTURE_FILTERS.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadAllQueues()}
                disabled={loading}
              >
                Refresh All
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Failed to load queues
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    {error}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadAllQueues()}
                  className="shrink-0"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {filteredQueues && (
            <>
              {/* Escalations Section */}
              {filteredQueues.escalations.length > 0 && (
                <WorkQueueSection
                  title="Escalations"
                  queueType="escalations"
                  icon={AlertCircle}
                  cards={filteredQueues.escalations}
                  loading={refreshing.has('escalations')}
                  onRefresh={() => handleRefreshQueue('escalations', 'escalations')}
                  onCopyPrompt={handleCopyPrompt}
                />
              )}

              <WorkQueueSection
                title="Needs QA"
                queueType="needs-qa"
                icon={CheckCircle}
                cards={filteredQueues.needsQa}
                loading={refreshing.has('needs-qa')}
                onRefresh={() => handleRefreshQueue('needs-qa', 'needsQa')}
                onCopyPrompt={handleCopyPrompt}
              />

              <WorkQueueSection
                title="Needs PM"
                queueType="needs-pm"
                icon={AlertCircle}
                cards={filteredQueues.needsPm}
                loading={refreshing.has('needs-pm')}
                onRefresh={() => handleRefreshQueue('needs-pm', 'needsPm')}
                onCopyPrompt={handleCopyPrompt}
              />

              <WorkQueueSection
                title="Dev Queue"
                queueType="dev-queue"
                icon={Layers}
                cards={filteredQueues.devQueue}
                loading={refreshing.has('dev-queue')}
                onRefresh={() => handleRefreshQueue('dev-queue', 'devQueue')}
                onCopyPrompt={handleCopyPrompt}
              />

              <WorkQueueSection
                title="Ready to Merge"
                queueType="ready-to-merge"
                icon={GitPullRequest}
                cards={filteredQueues.readyToMerge}
                loading={refreshing.has('ready-to-merge')}
                onRefresh={() =>
                  handleRefreshQueue('ready-to-merge', 'readyToMerge')
                }
                onCopyPrompt={handleCopyPrompt}
              />

              <WorkQueueSection
                title="In Flight"
                queueType="in-flight"
                icon={PlayCircle}
                cards={filteredQueues.inFlight}
                loading={refreshing.has('in-flight')}
                onRefresh={() => handleRefreshQueue('in-flight', 'inFlight')}
                onCopyPrompt={handleCopyPrompt}
              />
            </>
          )}

          {loading && !queues && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Terminal className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-600 dark:text-gray-400">
                  Loading work queues...
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Copy text to clipboard using Clipboard API with fallback.
 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    // TODO: Add toast notification in Phase 2
    console.log('Copied to clipboard');
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    console.log('Copied to clipboard (fallback)');
  }
}
