/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';

const mocks = vi.hoisted(() => ({ openFolderWith: vi.fn(), checkToolInstalled: vi.fn(), openSection: vi.fn() }));
vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openFolderWith: { invoke: mocks.openFolderWith },
      checkToolInstalled: { invoke: mocks.checkToolInstalled },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => true }));
vi.mock('@/renderer/pages/conversation/Workbench/workbenchActivityStore', () => ({
  openWorkbenchSection: mocks.openSection,
}));
vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  useOptionalPreviewContext: () => ({ openBrowserTab: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key }),
}));

describe('WorkspaceOpenButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.checkToolInstalled.mockResolvedValue(true);
    mocks.openFolderWith.mockResolvedValue(undefined);
  });

  it('opens the tool menu from the main folder button instead of launching immediately', async () => {
    render(<WorkspaceOpenButton workspacePath='/repo' isTemporary={false} />);
    const button = screen.getByRole('button', { name: 'Open workspace folder' });
    expect(button).toHaveClass('!text-t-secondary');

    fireEvent.click(button);
    expect(mocks.openFolderWith).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText('File Explorer'));
    expect(mocks.openFolderWith).toHaveBeenCalledWith({ folder_path: '/repo', tool: 'explorer' });
  });

  it('opens an interactive shell without replacing the agent terminal activity tab', async () => {
    render(<WorkspaceOpenButton workspacePath='/repo' isTemporary={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Terminal' }));
    expect(mocks.openSection).toHaveBeenCalledWith('shell');
    expect(mocks.openFolderWith).not.toHaveBeenCalled();
  });
});
