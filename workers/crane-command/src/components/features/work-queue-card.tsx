'use client';

import { useState } from 'react';
import {
  ExternalLink,
  Copy,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { WorkQueueCard, PromptType, QueueType } from '@/types/github';

interface WorkQueueCardProps {
  card: WorkQueueCard;
  queueType: QueueType;
  onCopyPrompt: (card: WorkQueueCard, type: PromptType) => Promise<void>;
}

/**
 * Get the primary action for each queue type.
 * Returns null for queues that are info-only.
 */
function getPrimaryAction(queueType: QueueType): { type: PromptType; label: string } | null {
  switch (queueType) {
    case 'needs-qa':
      return { type: 'qa', label: 'Copy QA Prompt' };
    case 'needs-pm':
      return { type: 'pm', label: 'Copy PM Prompt' };
    case 'dev-queue':
      return { type: 'agent-brief', label: 'Copy Agent Brief' };
    case 'ready-to-merge':
      return { type: 'merge', label: 'Copy Merge Prompt' };
    case 'in-flight':
      return null; // Info only, no action
    default:
      return null;
  }
}

export function WorkQueueCard({ card, queueType, onCopyPrompt }: WorkQueueCardProps) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const primaryAction = getPrimaryAction(queueType);

  const handleCopy = async () => {
    if (!primaryAction) return;
    
    setCopying(true);
    try {
      await onCopyPrompt(card, primaryAction.type);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setCopying(false);
    }
  };

  const relativeTime = getRelativeTime(card.updatedAt);

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5"
          >
            <span className="truncate">
              #{card.number} · {card.title}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      </div>

      {/* Labels */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {/* Venture badge */}
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            card.venture === 'venture-crane'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : card.venture === 'silicon-crane'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          )}
        >
          {card.venture === 'venture-crane' ? 'VC' : card.venture === 'silicon-crane' ? 'SC' : 'DFG'}
        </span>

        {/* Track badge */}
        {card.track && (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            T{card.track}
          </span>
        )}

        {/* QA Grade badge */}
        {card.qaGrade && (
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              card.qaGrade === '0'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : card.qaGrade === '1'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  : card.qaGrade === '2'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : card.qaGrade === '3'
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            )}
          >
            qa:{card.qaGrade}
          </span>
        )}

        {card.statusLabels.map((label) => (
          <span
            key={label}
            className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
          >
            {label}
          </span>
        ))}
        {card.needsLabels.map((label) => (
          <span
            key={label}
            className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
          >
            {label}
          </span>
        ))}
        {card.type === 'pr' && (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            PR
          </span>
        )}
      </div>

      {/* Preview URL */}
      {card.previewUrl ? (
        <a
          href={card.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1.5 mb-2 truncate"
        >
          <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
          <span className="truncate">{card.previewUrl}</span>
        </a>
      ) : (
        <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1.5 mb-2">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          No preview URL available
        </div>
      )}

      {/* Timestamp */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Updated {relativeTime}
      </div>

      {/* Primary Action */}
      {primaryAction && (
        <Button
          variant={copied ? 'primary' : 'secondary'}
          size="sm"
          onClick={handleCopy}
          disabled={copying}
          className={cn(
            'transition-all',
            copied && 'bg-green-600 hover:bg-green-600 text-white'
          )}
        >
          {copying ? (
            <>
              <Copy className="h-3 w-3 mr-1.5 animate-pulse" />
              Copying...
            </>
          ) : copied ? (
            <>
              <CheckCircle className="h-3 w-3 mr-1.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1.5" />
              {primaryAction.label}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * Get relative time string from ISO date string.
 */
function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // For longer times, show the date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
