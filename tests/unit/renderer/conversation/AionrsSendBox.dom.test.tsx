import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import AionrsSendBox from '@/renderer/pages/conversation/platforms/aionrs/AionrsSendBox';
import type { AionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';

const {
  ensureConversationRuntimeMock,
  sendMessageInvokeMock,
  translateMock,
  useTeamPermissionMock,
  setSendBoxHandlerMock,
  markSendFailedMock,
  markSendStartedMock,
  markSendAcceptedMock,
  sendBoxPropsSpy,
  enqueueMock,
  clearFilesMock,
  draftMutateMock,
  draftContentRef,
  runtimeViewIsProcessingRef,
} = vi.hoisted(() => ({
  ensureConversationRuntimeMock: vi.fn().mockResolvedValue({ recovered: false, config_options: [], runtime: null }),
  sendMessageInvokeMock: vi.fn().mockResolvedValue(undefined),
  translateMock: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  useTeamPermissionMock: vi.fn(),
  setSendBoxHandlerMock: vi.fn(),
  markSendFailedMock: vi.fn(),
  markSendStartedMock: vi.fn(),
  markSendAcceptedMock: vi.fn(),
  sendBoxPropsSpy: vi.fn(),
  enqueueMock: vi.fn(),
  clearFilesMock: vi.fn(),
  draftMutateMock: vi.fn(),
  draftContentRef: { current: '' },
  runtimeViewIsProcessingRef: { current: false },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      sendMessage: {
        invoke: sendMessageInvokeMock,
      },
      stop: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

vi.mock('@/renderer/components/chat/SendBox', () => ({
  default: ({
    onSend,
    onChange,
    active,
    onFocused,
    disabled,
    sendDisabled,
    tools,
    rightTools,
    sendButtonPrefix,
    topRightOverlay,
    onAddToDraft,
    addToDraftDisabled,
    selectedSessions,
    onSelectedSessionsChange,
    crossSessionEnabled,
    isTeamConversation,
  }: {
    onSend: (message: string) => Promise<void>;
    onChange?: (value: string) => void;
    active?: boolean;
    onFocused?: () => void;
    disabled?: boolean;
    sendDisabled?: boolean;
    tools?: React.ReactNode;
    rightTools?: React.ReactNode;
    sendButtonPrefix?: React.ReactNode;
    topRightOverlay?: React.ReactNode;
    onAddToDraft?: () => void;
    addToDraftDisabled?: boolean;
    selectedSessions?: Array<{ id: string }>;
    onSelectedSessionsChange?: (sessions: Array<{ id: string }>) => void;
    crossSessionEnabled?: boolean;
    isTeamConversation?: boolean;
  }) => {
    sendBoxPropsSpy({
      active,
      onFocused,
      disabled,
      sendDisabled,
      onAddToDraft,
      addToDraftDisabled,
      selectedSessions,
      onSelectedSessionsChange,
      crossSessionEnabled,
      isTeamConversation,
    });
    return (
      <div>
        <div data-testid='composer-tools'>{tools}</div>
        {rightTools}
        {sendButtonPrefix}
        {topRightOverlay}
        <button type='button' onClick={() => onChange?.('hello')}>
          change
        </button>
        <button
          type='button'
          onClick={() => {
            // Models the Enter-key submit path: in the real component Enter
            // reaches `onSend` regardless of the button's visual `sendDisabled`
            // state — the parent decides whether to block+toast.
            void onSend('Hello').catch(() => {});
          }}
        >
          send
        </button>
      </div>
    );
  },
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: ({ modeLabelFormatter }: { modeLabelFormatter: (mode: { value: string; label: string }) => string }) => (
    <div data-testid='aionrs-mode-label'>{modeLabelFormatter({ value: 'auto_edit', label: '自动接受编辑' })}</div>
  ),
}));
vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: () => null,
  useAttachEntry: () => ({ entries: [], hiddenFileInput: null }),
}));
vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FileAttachButton', () => ({
  default: () => <div data-testid='file-attach-button' />,
}));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: () => ({
    setStatus: { state: 'idle' },
    mode: null,
    model: null,
    thoughtLevel: null,
    reload: vi.fn(),
    setConfigOption: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    loadedSkills: [],
    loadedMcpStatuses: [],
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: () => () => ({
    data: {
      atPath: [],
      uploadFile: [],
      content: draftContentRef.current,
    },
    mutate: draftMutateMock,
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  useSendBoxFiles: () => ({
    handleFilesAdded: vi.fn(),
    clearFiles: clearFilesMock,
  }),
  createSetUploadFile: () => vi.fn(),
}));
vi.mock('@/renderer/hooks/chat/useSlashCommands', () => ({
  useSlashCommands: () => [],
}));
vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({
    openFileSelector: vi.fn(),
    onSlashBuiltinCommand: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: <T,>(value: T) => ({ current: value }),
}));
vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: enqueueMock,
    remove: vi.fn(),
    clear: vi.fn(),
    reorder: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    lockInteraction: vi.fn(),
    unlockInteraction: vi.fn(),
    resetActiveExecution: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({
    hydrated: true,
    canSendMessage: true,
    get isProcessing() {
      return runtimeViewIsProcessingRef.current;
    },
    state: 'idle',
    markSendStarted: markSendStartedMock,
    markSendAccepted: markSendAcceptedMock,
    markSendFailed: markSendFailedMock,
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn().mockResolvedValue({
    extra: {
      workspace: '/tmp/workspace',
    },
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationRuntimeWorkspaceErrorMessage: () => 'workspace failed',
}));
vi.mock('@/renderer/pages/conversation/utils/ensureConversationRuntime', () => ({
  ensureConversationRuntime: ensureConversationRuntimeMock,
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: setSendBoxHandlerMock,
  }),
}));
vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: useTeamPermissionMock,
}));
vi.mock('@/renderer/services/FileService', () => ({
  allSupportedExts: [],
}));
vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
  useAddEventListener: vi.fn(),
}));
vi.mock('@/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn((items: unknown[]) => items),
}));
vi.mock('@/renderer/utils/file/messageFiles', () => ({
  collectChatFileRefs: () => [],
  splitChatFileRefs: () => ({ uploadFiles: [], atPath: [] }),
}));
vi.mock('@arco-design/web-react', () => ({
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type='button' onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock('@icon-park/react', () => ({
  Brain: () => null,
  MagicHat: () => null,
  Shield: () => null,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translateMock }),
}));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage', () => ({
  useAionrsMessage: () => ({
    thought: { subject: '', description: '' },
    running: false,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
  }),
}));

const modelSelection = {
  current_model: {
    provider_id: 'openai',
    model: 'gpt-4.1',
    use_model: 'openai/gpt-4.1',
  },
} as AionrsModelSelection;

describe('AionrsSendBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureConversationRuntimeMock.mockResolvedValue({ recovered: false, config_options: [], runtime: null });
    useTeamPermissionMock.mockReturnValue(null);
    draftContentRef.current = '';
    runtimeViewIsProcessingRef.current = false;
  });

  it('uses raw English backend values for authorization mode labels', () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    expect(screen.getByTestId('aionrs-mode-label')).toHaveTextContent('auto_edit');
    expect(screen.getByTestId('aionrs-mode-label')).not.toHaveTextContent('自动接受编辑');
    expect(screen.getByTestId('file-attach-button').nextElementSibling).toBe(screen.getByTestId('aionrs-mode-label'));
  });

  it('does not warm up team session when draft content changes', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    warmupSession.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'change' }).click();
    });

    expect(warmupSession).not.toHaveBeenCalled();
  });

  it('still warms up team session before sending', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    warmupSession.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalledTimes(1);
    });
  });

  it('does not start standalone runtime while preparing a team conversation', async () => {
    const warmupSession = vi.fn().mockResolvedValue(undefined);
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conv-1',
      allConversationIds: ['conv-1'],
      propagateMode: vi.fn(),
      warmupSession,
    });

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(warmupSession).toHaveBeenCalled();
    });
    expect(ensureConversationRuntimeMock).not.toHaveBeenCalled();
  });

  it('uses runtime ensure instead of legacy warmup for standalone runtime preparation', async () => {
    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);

    await waitFor(() => {
      expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1');
    });
  });

  it('suppresses visible error and preserves runtime gate for active-turn busy conflicts', async () => {
    sendMessageInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/messages',
        status: 409,
        body: { success: false, code: 'CONFLICT', error: 'conversation conv-1 is already running' },
      })
    );

    render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
    await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

    await act(async () => {
      screen.getByRole('button', { name: 'send' }).click();
    });

    await waitFor(() => {
      expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1);
    });
    expect(markSendFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'busy_conflict', busyKind: 'active_turn' })
    );
    expect(Message.error).not.toHaveBeenCalled();
  });

  it('passes teamRuntime.isActive and onFocus down to SendBox as active/onFocused', () => {
    const onFocus = vi.fn();
    render(
      <AionrsSendBox
        conversation_id='conv-1'
        modelSelection={modelSelection}
        teamRuntime={{ loading: false, startedAtMs: null, isActive: true, onFocus } as unknown as TeamSendBoxRuntime}
      />
    );
    const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as { active?: boolean; onFocused?: () => void };
    expect(props.active).toBe(true);
    props.onFocused?.();
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  describe('mid-turn interjection controls', () => {
    it('queues through the primary send action while replying without a separate draft action', async () => {
      runtimeViewIsProcessingRef.current = true;
      draftContentRef.current = 'hello world';
      enqueueMock.mockReturnValue({ id: 'queued-new', input: 'Hello', files: [], created_at: 1 });

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      const props = sendBoxPropsSpy.mock.calls.at(-1)?.[0] as {
        onAddToDraft?: () => void;
        sendDisabled?: boolean;
      };
      expect(props.onAddToDraft).toBeUndefined();
      expect(props.sendDisabled).not.toBe(true);

      await act(async () => {
        screen.getByRole('button', { name: 'send' }).click();
      });

      expect(enqueueMock).toHaveBeenCalledWith({ input: 'Hello', files: [], sessions: undefined });
      expect(sendMessageInvokeMock).not.toHaveBeenCalled();
      expect(clearFilesMock).toHaveBeenCalled();
      expect(Message.warning).not.toHaveBeenCalled();
    });

    it('sends normally while idle', async () => {
      runtimeViewIsProcessingRef.current = false;

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      await act(async () => {
        screen.getByRole('button', { name: 'send' }).click();
      });

      await waitFor(() => {
        expect(sendMessageInvokeMock).toHaveBeenCalledTimes(1);
      });
      expect(enqueueMock).not.toHaveBeenCalled();
      expect(Message.warning).not.toHaveBeenCalled();
    });

    it('carries `@@` session references into the queue and clears them after a successful enqueue', async () => {
      runtimeViewIsProcessingRef.current = true;
      enqueueMock.mockReturnValue({ id: 'queued-new', input: 'Hello', files: [], created_at: 1 });

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      type SessionProps = {
        onSelectedSessionsChange?: (sessions: Array<{ id: string }>) => void;
        selectedSessions?: Array<{ id: string }>;
      };
      const latestProps = (): SessionProps => sendBoxPropsSpy.mock.calls.at(-1)?.[0] as SessionProps;

      await act(async () => {
        latestProps().onSelectedSessionsChange?.([{ id: 'conv_target' }]);
      });
      await act(async () => {
        screen.getByRole('button', { name: 'send' }).click();
      });

      expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ sessions: [{ id: 'conv_target' }] }));
      expect(latestProps().selectedSessions).toEqual([]);
    });

    it('does not clear attachments when queueing is rejected', async () => {
      runtimeViewIsProcessingRef.current = true;
      enqueueMock.mockReturnValue(null);

      render(<AionrsSendBox conversation_id='conv-1' modelSelection={modelSelection} />);
      await waitFor(() => expect(ensureConversationRuntimeMock).toHaveBeenCalledWith('conv-1'));

      await act(async () => {
        screen.getByRole('button', { name: 'send' }).click();
      });

      expect(clearFilesMock).not.toHaveBeenCalled();
    });
  });
});
