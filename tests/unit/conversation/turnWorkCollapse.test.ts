/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  collapseCompletedTurnWork,
  type TurnWorkTimelineItem,
} from '@/renderer/pages/conversation/Messages/turnWorkCollapse';

const user = (id: string, createdAt = 0): TurnWorkTimelineItem => ({
  id,
  type: 'text',
  position: 'right',
  content: { content: 'question' },
  created_at: createdAt,
});
const aiText = (id: string, content: string, createdAt = 0): TurnWorkTimelineItem => ({
  id,
  type: 'text',
  position: 'left',
  content: { content },
  created_at: createdAt,
});
const work = (id: string, createdAt = 0): TurnWorkTimelineItem => ({
  id,
  type: 'tool_summary',
  position: 'left',
  created_at: createdAt,
});

describe('collapseCompletedTurnWork', () => {
  it('folds all work before the final reply and computes its duration', () => {
    const result = collapseCompletedTurnWork(
      [
        user('u1'),
        work('thinking', 1000),
        aiText('progress', 'working on it', 2000),
        work('tools', 3000),
        aiText('answer', 'done', 6000),
      ],
      false
    );

    expect(result.map((item) => item.id)).toEqual(['u1', 'turn-work-answer', 'answer']);
    const summary = result[1];
    expect(summary.type).toBe('turn_work_summary');
    if (summary.type !== 'turn_work_summary') return;
    expect(summary.items.map((item) => item.id)).toEqual(['thinking', 'progress', 'tools']);
    expect(summary.started_at).toBe(1000);
    expect(summary.ended_at).toBe(6000);
  });

  it('keeps the active turn expanded while folding earlier completed turns', () => {
    const result = collapseCompletedTurnWork(
      [
        work('old-tools', 1000),
        aiText('old-answer', 'done', 2000),
        user('u2'),
        work('new-tools', 3000),
        aiText('new-answer', 'working', 4000),
      ],
      true
    );

    expect(result.map((item) => item.id)).toEqual([
      'turn-work-old-answer',
      'old-answer',
      'u2',
      'new-tools',
      'new-answer',
    ]);
  });

  it('leaves a plain reply without work items unchanged', () => {
    const items = [user('u1'), aiText('answer', 'done', 1000)];
    expect(collapseCompletedTurnWork(items, false)).toEqual(items);
  });

  it('does not hide a tool-only turn that has no final text reply', () => {
    const items = [user('u1'), work('tools', 1000)];
    expect(collapseCompletedTurnWork(items, false)).toEqual(items);
  });

  it('keeps artifacts outside the folded work items', () => {
    const result = collapseCompletedTurnWork(
      [
        work('tools', 1000),
        { id: 'artifact-1', type: 'artifact', position: 'left', created_at: 2000 },
        aiText('answer', 'done', 3000),
      ],
      false
    );

    expect(result.map((item) => item.id)).toEqual(['turn-work-answer', 'answer', 'artifact-1']);
    const summary = result[0];
    expect(summary.type).toBe('turn_work_summary');
    if (summary.type !== 'turn_work_summary') return;
    expect(summary.items.map((item) => item.id)).toEqual(['tools']);
  });
});
