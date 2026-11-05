import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AcpConfigOptionDto } from '@/common/types/platform/acpTypes';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';

const controls = vi.hoisted(() => ({
  setOption: vi.fn(),
  restart: vi.fn(),
  responseOn: vi.fn(() => () => {}),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      setConfigOption: { invoke: controls.setOption },
      responseStream: { on: controls.responseOn },
    },
    conversation: { restartRuntime: { invoke: controls.restart } },
  },
}));

const options: AcpConfigOptionDto[] = [
  {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: 'gpt-5.5',
    options: [
      { value: 'gpt-5.5', name: 'GPT-5.5' },
      { value: 'gpt-5.4', name: 'GPT-5.4' },
    ],
  },
];

describe('Codex config recovery', () => {
  it('restarts a stale runtime and retries the requested model once', async () => {
    const nextOptions = options.map((option) => ({ ...option, current_value: 'gpt-5.4' }));
    controls.setOption
      .mockRejectedValueOnce(
        new BackendHttpError({
          method: 'PUT',
          path: '/api/conversations/codex-restart/config-options/model',
          status: 400,
          body: {
            success: false,
            error: 'session not found: codex thread/resume failed: no rollout found for thread id abc',
            code: 'BAD_REQUEST',
          },
        })
      )
      .mockResolvedValueOnce({ confirmation: 'observed', config_options: nextOptions });
    controls.restart.mockResolvedValueOnce({ config_options: nextOptions });

    const { result } = renderHook(() =>
      useAcpConfigOptions({
        conversation_id: 'codex-restart',
        configOptionsPort: { load: vi.fn().mockResolvedValue(options) },
      })
    );

    await act(async () => {
      await result.current.setConfigOption('model', 'gpt-5.4');
    });
    expect(controls.restart).toHaveBeenCalledWith({ conversation_id: 'codex-restart' });
    expect(controls.setOption).toHaveBeenCalledTimes(2);
  });
});
