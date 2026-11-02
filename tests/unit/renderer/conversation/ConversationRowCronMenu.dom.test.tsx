/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refreshCache: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: { conversation: { update: { invoke: mocks.update } } },
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: mocks.refreshCache,
}));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: mocks.emit } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({ disabled: true }),
}));

import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const conversation = {
  id: 'cron-menu-conversation',
  name: 'Scheduled task source',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { backend: 'claude' },
  model: {},
} as TChatConversation;

const makeProps = (overrides: Partial<ConversationRowProps> = {}): ConversationRowProps => ({
  conversation,
  isGenerating: false,
  isWaitingConfirmation: false,
  hasUnread: false,
  isManualUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: true,
  onToggleChecked: vi.fn(),
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onCreateCronTask: vi.fn(),
  onArchive: vi.fn(),
  onTogglePin: vi.fn(),
  onToggleManualUnread: vi.fn(),
  getJobStatus: () => 'none',
  ...overrides,
});

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(true);
  mocks.refreshCache.mockReset().mockResolvedValue(undefined);
  mocks.emit.mockReset();
  vi.spyOn(Message, 'success').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'error').mockImplementation(() => '' as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const openInlineRename = async (overrides: Partial<ConversationRowProps> = {}) => {
  const props = makeProps(overrides);
  render(<ConversationRow {...props} />);
  fireEvent.click(await screen.findByText('conversation.history.rename'));
  const input = (await screen.findByRole('textbox', { name: 'conversation.history.rename' })) as HTMLInputElement;
  return { input, props };
};

describe('conversation scheduled-task menu item', () => {
  it('renders the Timer action between Rename and Archive and invokes it for the selected row', async () => {
    const onCreateCronTask = vi.fn();
    const onArchive = vi.fn();
    render(<ConversationRow {...makeProps({ onCreateCronTask, onArchive })} />);

    const rename = await screen.findByText('conversation.history.rename');
    const createCronTask = screen.getByText('conversation.history.createCronTask');
    const archiveItem = screen.getByText('conversation.history.archive');

    expect(rename.compareDocumentPosition(createCronTask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(createCronTask.compareDocumentPosition(archiveItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(archiveItem);
    await waitFor(() => expect(onArchive).toHaveBeenCalledWith(conversation));
    fireEvent.click(createCronTask);
    await waitFor(() => expect(onCreateCronTask).toHaveBeenCalledWith(conversation));
  });

  it('keeps row actions hidden while batch selection is active', () => {
    render(<ConversationRow {...makeProps({ batchMode: true, menuVisible: false })} />);

    expect(screen.queryByText('conversation.history.createCronTask')).not.toBeInTheDocument();
  });
});

describe('ConversationRow inline rename', () => {
  it('opens a selected input at the conversation name and prevents navigation while editing', async () => {
    const onConversationClick = vi.fn();
    const { input, props } = await openInlineRename({ onConversationClick });

    expect(input).toHaveValue(conversation.name);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input.closest('.inline-rename-input')).not.toBeNull();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(conversation.name.length);
    expect(props.onMenuVisibleChange).toHaveBeenCalledWith(conversation.id, false);
    expect(screen.queryByText('conversation.history.renameTitle')).not.toBeInTheDocument();

    fireEvent.click(input);
    fireEvent.click(document.getElementById(`c-${conversation.id}`)!);
    expect(onConversationClick).not.toHaveBeenCalled();
  });

  it('commits a trimmed name on Enter through IPC, cache refresh, and history refresh', async () => {
    const { input } = await openInlineRename();
    fireEvent.change(input, { target: { value: '  Renamed conversation  ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        id: conversation.id,
        updates: { name: 'Renamed conversation' },
      })
    );
    await waitFor(() => expect(mocks.refreshCache).toHaveBeenCalledWith(conversation.id));
    expect(mocks.emit).toHaveBeenCalledWith('chat.history.refresh');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'conversation.history.rename' })).not.toBeInTheDocument()
    );
  });

  it('commits a changed name on blur', async () => {
    const { input } = await openInlineRename();
    fireEvent.change(input, { target: { value: 'Blur rename' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ id: conversation.id, updates: { name: 'Blur rename' } })
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'conversation.history.rename' })).not.toBeInTheDocument()
    );
  });

  it('cancels on Escape without IPC or navigation', async () => {
    const onConversationClick = vi.fn();
    const { input } = await openInlineRename({ onConversationClick });
    fireEvent.change(input, { target: { value: 'Discard this' } });
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'conversation.history.rename' })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(onConversationClick).not.toHaveBeenCalled();
    expect(screen.getByText(conversation.name)).toBeInTheDocument();
  });

  it.each(['   ', conversation.name])('closes a blank or unchanged draft on blur without IPC', async (value) => {
    const { input } = await openInlineRename();
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'conversation.history.rename' })).not.toBeInTheDocument()
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps the editor open with the draft after a failed rename', async () => {
    mocks.update.mockResolvedValue(false);
    const { input } = await openInlineRename();
    fireEvent.change(input, { target: { value: 'Still editing' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('conversation.history.renameFailed'));
    expect(screen.getByRole('textbox', { name: 'conversation.history.rename' })).toHaveValue('Still editing');
    expect(mocks.refreshCache).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('disables the input until the rename request settles', async () => {
    let finishRename!: (success: boolean) => void;
    mocks.update.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishRename = resolve;
      })
    );
    const { input } = await openInlineRename();
    fireEvent.change(input, { target: { value: 'Pending rename' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    await waitFor(() => expect(input).toBeDisabled());
    expect(mocks.update).toHaveBeenCalledTimes(1);
    finishRename(true);
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'conversation.history.rename' })).not.toBeInTheDocument()
    );
  });
});
