/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const navigateMock = vi.fn();
const { useCronJobsMock } = vi.hoisted(() => ({
  useCronJobsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      getJob: { invoke: vi.fn() },
      onJobCreated: { on: () => vi.fn() },
      onJobUpdated: { on: () => vi.fn() },
      onJobRemoved: { on: () => vi.fn() },
    },
  },
}));

vi.mock('@renderer/pages/cron/useCronJobs', () => ({
  useCronJobs: (...args: unknown[]) => useCronJobsMock(...args),
}));

import CronJobManager from '@/renderer/pages/cron/components/CronJobManager';

const job = (): ICronJob =>
  ({
    id: 'job-1',
    name: '恢复前面任务',
    enabled: false,
    schedule: { kind: 'cron', expr: '45 0 9 11 *', tz: 'Asia/Shanghai', description: 'once' },
    target: { payload: { kind: 'message', text: '继续任务' }, execution_mode: 'existing' },
    metadata: {
      conversation_id: 'conv-1',
      conversation_title: 'Codex-Main',
      agent_type: 'acp',
      created_by: 'agent',
      created_at: 1,
      updated_at: 1,
      agent_config: {
        name: 'Codex CLI',
        assistant_id: 'bare:assistant',
        mode: 'agent-full-access',
        model_id: 'gpt-6.1-sol',
      },
    },
    state: {
      next_run_at_ms: 1,
      last_run_at_ms: undefined,
      last_status: 'ok',
      run_count: 0,
      retry_count: 0,
      max_retries: 3,
      queue_enabled: false,
    },
  }) as ICronJob;

describe('CronJobManager', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useCronJobsMock.mockReset();
    useCronJobsMock.mockReturnValue({ jobs: [job()], loading: false });
  });

  it('centers the scheduled-task pill and icon with header actions', () => {
    render(<CronJobManager conversation_id='conv-1' />);

    const button = screen.getByRole('button');
    const pill = screen.getByTestId('cron-job-manager');
    expect(button).toHaveClass('!inline-flex', '!items-center', '!justify-center', '!leading-none');
    expect(pill).toHaveClass('inline-flex', 'h-20px', 'items-center', 'leading-none');
    expect(pill.querySelector('svg')).toHaveClass('block');
  });
});
