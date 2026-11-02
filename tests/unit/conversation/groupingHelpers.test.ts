/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { buildGroupedHistory } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

const t = (key: string): string => key;

const conversation = (id: string, extra: TChatConversation['extra'], modified_at: number): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modified_at,
    modified_at,
    extra,
  }) as TChatConversation;

describe('buildGroupedHistory', () => {
  it('keeps scheduled-task conversations in the regular conversation timeline', () => {
    const result = buildGroupedHistory(
      [conversation('cron-conversation', { backend: 'aioncore', cron_job_id: 'job-1' }, 100)],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'conversation',
        conversation: expect.objectContaining({ id: 'cron-conversation' }),
      }),
    ]);
  });

  it('keeps scheduled-task conversations with workspaces in the project section', () => {
    const result = buildGroupedHistory(
      [
        conversation(
          'cron-project-conversation',
          {
            backend: 'aioncore',
            cron_job_id: 'job-1',
            workspace: '/repo/aionui',
            custom_workspace: true,
          },
          100
        ),
      ],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({
          workspace: '/repo/aionui',
          conversations: [expect.objectContaining({ id: 'cron-project-conversation' })],
        }),
      }),
    ]);
  });

  it('promotes a project only when its conversation has real stream activity', () => {
    const conversations = [
      conversation('older', { workspace: '/older', custom_workspace: true }, 100),
      conversation('newer', { workspace: '/newer', custom_workspace: true }, 200),
    ];

    const result = buildGroupedHistory(conversations, t, new Map([['older', 300]]));
    expect(result.timelineSections[0].items.map((item) => item.workspaceGroup?.workspace)).toEqual([
      '/older',
      '/newer',
    ]);
    expect(buildGroupedHistory(conversations, t).timelineSections[0].items[0].workspaceGroup?.workspace).toBe('/newer');
  });

  it('continues to hide team-owned conversations from the regular history', () => {
    const result = buildGroupedHistory(
      [conversation('team-conversation', { backend: 'aioncore', team_id: 'team-1' }, 100)],
      t
    );

    expect(result.timelineSections).toEqual([]);
  });

  it('groups remote project conversations using the authoritative workspace flag', () => {
    const remote = conversation(
      'remote-project',
      {
        backend: 'kimi',
        workspace: '/home/user/project',
        custom_workspace: false,
        is_temporary_workspace: false,
      } as TChatConversation['extra'],
      100
    );
    expect(buildGroupedHistory([remote], t).timelineSections[0].items[0]).toMatchObject({
      type: 'workspace',
      workspaceGroup: { workspace: '/home/user/project' },
    });
  });

  it('keeps temporary workspaces out of projects even with a stale custom flag', () => {
    const temporary = conversation(
      'temporary',
      {
        backend: 'kimi',
        workspace: '/home/user/work/temp',
        custom_workspace: true,
        is_temporary_workspace: true,
      } as TChatConversation['extra'],
      100
    );
    expect(buildGroupedHistory([temporary], t).timelineSections[0].items[0].type).toBe('conversation');
  });
});
