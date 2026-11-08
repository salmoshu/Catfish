import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAcpTerminalOutput } from '@/common/chat/chatLib';
import { WorkbenchPanel } from '@/renderer/pages/conversation/Workbench/WorkbenchPanel';
import {
  publishWorkbenchActivity,
  resetWorkbenchActivityForTest,
} from '@/renderer/pages/conversation/Workbench/workbenchActivityStore';
import { resetWorkbenchPanelStateForTest } from '@/renderer/pages/conversation/Workbench/workbenchPanelState';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/common', () => ({
  ipcBridge: { project: { get: { invoke: vi.fn() } }, shell: { checkToolInstalled: { invoke: async () => false } } },
}));
vi.mock('swr', () => ({
  default: () => ({
    data: {
      project_id: 'project',
      explorer: { workspace_pe_id: 'root', entries: [{ pe_id: 'root', display_path: '/repo' }] },
    },
    isLoading: false,
    mutate: vi.fn(),
  }),
}));
vi.mock('@/common/adapter/httpBridge', () => ({ getBackendEnvironment: () => ({ type: 'local' }) }));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => true }));
vi.mock('@/renderer/utils/workspace/backendCache', () => ({
  backendCacheKey: () => 'project',
  getActiveBackendEnvironment: () => ({ type: 'local' }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ isOpen: false, activeTab: null, sideChat: null }),
  PreviewPanel: () => null,
}));
vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  useOptionalPreviewContext: () => null,
}));
vi.mock('@/renderer/pages/conversation/Preview/components/PreviewPanel/SideChatPanel', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/explorer/currentConversationStore', () => ({
  useCurrentConversation: () => 'conversation',
}));
vi.mock('@/renderer/pages/conversation/explorer/ExplorerPanel', () => ({ ExplorerPanel: () => <div>Files</div> }));
vi.mock('@/renderer/pages/conversation/explorer/projectRoots', () => ({ toRootRefs: () => [] }));
vi.mock('@/renderer/pages/conversation/explorer/search/SearchPanel', () => ({
  SearchPanel: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: vi.fn() }));
vi.mock('@/renderer/pages/conversation/explorer/explorerStore', () => ({
  refreshRoot: vi.fn(),
  reveal: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@/renderer/pages/conversation/SourceControl/ScmPanel', () => ({ ScmPanel: () => null }));
vi.mock('@/renderer/pages/conversation/SourceControl/scmStore', () => ({
  rediscoverRepos: vi.fn(),
  refreshAllRepos: vi.fn(),
}));
vi.mock('@/renderer/utils/file/previewPayload', () => ({ resolvePreviewPayload: vi.fn() }));
vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpTerminalOutput', () => ({
  default: ({ message }: { message: IMessageAcpTerminalOutput }) => <div>{message.content.command}</div>,
}));
vi.mock('@/renderer/pages/conversation/Workbench/Terminal', () => ({
  default: () => <div data-testid='manual-terminal'>Interactive shell</div>,
}));

const command: IMessageAcpTerminalOutput = {
  id: 'command',
  msg_id: 'command',
  conversation_id: 'conversation',
  type: 'acp_terminal_output',
  content: { terminal_id: 'terminal', command: 'agent-command', output: 'done', truncated: false },
};

beforeEach(() => {
  localStorage.clear();
  resetWorkbenchPanelStateForTest();
  resetWorkbenchActivityForTest();
});

describe('workspace terminal entries', () => {
  it('shows agent tasks in Terminal and starts the interactive shell only from the plus menu', async () => {
    publishWorkbenchActivity('conversation', [command]);
    render(<WorkbenchPanel projectId='project' />);
    fireEvent.click(screen.getByRole('tab', { name: 'messages.workbench.terminal' }));
    expect(screen.getByText('agent-command')).toBeVisible();
    expect(screen.queryByTestId('manual-terminal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'conversation.workspace.openWorkspace' }));
    fireEvent.click(await screen.findByRole('button', { name: /conversation.workspace.openWith.terminal/ }));
    const shell = await screen.findByTestId('manual-terminal');
    expect(shell).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'messages.workbench.terminal' }));
    expect(shell).not.toBeVisible();
    expect(screen.getByText('agent-command')).toBeVisible();
  });

  it('keeps the activity tab empty without starting a shell when no commands have run', async () => {
    render(<WorkbenchPanel projectId='project' />);
    fireEvent.click(screen.getByRole('tab', { name: 'messages.workbench.terminal' }));
    expect(screen.getByText('messages.workbench.terminalEmpty')).toBeVisible();
    await act(async () => {
      publishWorkbenchActivity('conversation', [command]);
    });
    await waitFor(() => expect(screen.getByText('agent-command')).toBeVisible());
    expect(screen.queryByTestId('manual-terminal')).not.toBeInTheDocument();
  });
});
