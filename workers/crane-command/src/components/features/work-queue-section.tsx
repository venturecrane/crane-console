'use client';

import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WorkQueueCard } from './work-queue-card';
import { cn } from '@/lib/utils';
import type { WorkQueueCard as CardType, PromptType, QueueType } from '@/types/github';

interface WorkQueueSectionProps {
  title: string;
  queueType: QueueType;
  icon: React.ComponentType<{ className?: string }>;
  cards: CardType[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  onCopyPrompt: (card: CardType, type: PromptType) => Promise<void>;
}

export function WorkQueueSection({
  title,
  queueType,
  icon: Icon,
  cards,
  loading,
  error,
  onRefresh,
  onCopyPrompt,
}: WorkQueueSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-blue-500 dark:text-blue-400 shrink-0" />
          <h2 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
            {title}
          </h2>
          <span
            className={cn(
              'text-sm font-semibold',
              cards.length > 0
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
            ({cards.length})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw
            className={cn('h-4 w-4', loading && 'animate-spin')}
          />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {loading && cards.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        ) : cards.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <p className="text-sm">No items in this queue</p>
          </div>
        ) : (
          <div>
            {cards.map((card) => (
              <WorkQueueCard
                key={`${card.type}-${card.number}`}
                card={card}
                queueType={queueType}
                onCopyPrompt={onCopyPrompt}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
