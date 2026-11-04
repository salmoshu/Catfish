/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type TurnWorkTimelineItem = {
  id: string;
  type?: string;
  position?: string;
  content?: unknown;
  created_at?: number;
  sourceMessageIds?: string[];
};

export type TurnWorkSummaryItem<T> = {
  type: 'turn_work_summary';
  id: string;
  items: T[];
  sourceMessageIds: string[];
  created_at: number;
  started_at: number;
  ended_at: number;
};

const getCreatedAt = (item: TurnWorkTimelineItem): number => item.created_at ?? 0;

const getSourceMessageIds = (item: TurnWorkTimelineItem): string[] => item.sourceMessageIds ?? [item.id];

const getTextContent = (item: TurnWorkTimelineItem): string => {
  if (item.type !== 'text' || item.position === 'right') return '';
  const content = (item.content as { content?: unknown } | undefined)?.content;
  return typeof content === 'string' && content.trim() ? content : '';
};

/**
 * Collapse each completed AI turn's thinking, progress text and tool work into
 * one expandable row, leaving only the turn's final text as the visible reply.
 * The active turn stays expanded so streaming work remains visible.
 */
export function collapseCompletedTurnWork<T extends TurnWorkTimelineItem>(
  items: T[],
  isProcessing: boolean
): Array<T | TurnWorkSummaryItem<Exclude<T, { type: 'artifact' }>>> {
  type TWork = Exclude<T, { type: 'artifact' }>;
  const result: Array<T | TurnWorkSummaryItem<TWork>> = [];
  let turn: T[] = [];

  const flushTurn = (active: boolean): void => {
    if (turn.length === 0) return;

    let finalTextIndex = -1;
    for (let index = turn.length - 1; index >= 0; index--) {
      if (getTextContent(turn[index])) {
        finalTextIndex = index;
        break;
      }
    }

    if (active || finalTextIndex < 0) {
      result.push(...turn);
      turn = [];
      return;
    }

    const finalText = turn[finalTextIndex];
    const workItems = turn.filter((item, index) => index !== finalTextIndex && item.type !== 'artifact') as TWork[];
    const artifacts = turn.filter((item) => item.type === 'artifact');

    if (workItems.length === 0) {
      result.push(...turn);
      turn = [];
      return;
    }

    const workTimes = workItems.map(getCreatedAt).filter((timestamp) => timestamp > 0);
    const finalTime = getCreatedAt(finalText);
    const endTimes = finalTime > 0 ? [...workTimes, finalTime] : workTimes;
    const startedAt = workTimes.length > 0 ? Math.min(...workTimes) : 0;
    const endedAt = endTimes.length > 0 ? Math.max(...endTimes) : 0;

    result.push({
      type: 'turn_work_summary',
      id: `turn-work-${finalText.id}`,
      items: workItems,
      sourceMessageIds: workItems.flatMap(getSourceMessageIds),
      created_at: finalTime || endedAt,
      started_at: startedAt,
      ended_at: endedAt,
    });
    result.push(finalText, ...artifacts);
    turn = [];
  };

  for (const item of items) {
    if (item.position === 'right') {
      flushTurn(false);
      result.push(item);
    } else {
      turn.push(item);
    }
  }
  flushTurn(isProcessing);

  return result;
}
