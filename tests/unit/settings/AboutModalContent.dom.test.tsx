/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(),
  feedbackVisible: vi.fn(),
  autoUpdateCheckMock: vi.fn(),
  updateCheckMock: vi.fn(),
  messageInfoMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, info: mocks.messageInfoMock, error: mocks.messageErrorMock },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    autoUpdate: {
      check: { invoke: mocks.autoUpdateCheckMock },
    },
    update: {
      check: { invoke: mocks.updateCheckMock },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: mocks.openExternalUrlMock,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: ({ visible }: { visible: boolean }) => {
    mocks.feedbackVisible(visible);
    return null;
  },
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

describe('AboutModalContent', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.2.2');
    mocks.openExternalUrlMock.mockResolvedValue(undefined);
    mocks.autoUpdateCheckMock.mockResolvedValue({ success: true });
    mocks.updateCheckMock.mockResolvedValue({
      success: true,
      data: { currentVersion: '2.2.2', updateAvailable: false, latest: null },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the app name and installed version', () => {
    render(<AboutModalContent />);

    expect(screen.getByText('Catfish')).toBeInTheDocument();
    expect(screen.getByText('v2.2.2')).toBeInTheDocument();
  });

  it('opens the project releases page from the update-log link', () => {
    render(<AboutModalContent />);

    fireEvent.click(screen.getByText('settings.updateLog'));

    expect(mocks.openExternalUrlMock).toHaveBeenCalledWith('https://github.com/salmoshu/Catfish/releases');
  });

  it('opens the feedback modal from the bug-report link', () => {
    render(<AboutModalContent />);

    fireEvent.click(screen.getByText('settings.bugReport'));

    expect(mocks.feedbackVisible).toHaveBeenCalledWith(true);
  });

  it('shows a loading state while checking for updates', async () => {
    let resolveCheck!: (value: {
      success: boolean;
      data: { currentVersion: string; updateAvailable: boolean; latest: null };
    }) => void;
    mocks.updateCheckMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        })
    );

    render(<AboutModalContent />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

    expect(await screen.findByRole('button', { name: 'settings.checkingForUpdates' })).toBeInTheDocument();
    expect(mocks.updateCheckMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCheck({
        success: true,
        data: { currentVersion: '2.2.2', updateAvailable: false, latest: null },
      });
    });
    expect(await screen.findByRole('button', { name: 'settings.checkForUpdates' })).toBeInTheDocument();
  });

  it('hands an available update to the mounted notification controller', async () => {
    mocks.updateCheckMock.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '2.2.2',
        updateAvailable: true,
        latest: {
          tagName: 'v2.2.3',
          version: '2.2.3',
          name: 'v2.2.3',
          body: 'notes',
          htmlUrl: 'https://github.com/salmoshu/Catfish/releases/tag/v2.2.3',
          prerelease: false,
          draft: false,
          assets: [],
        },
      },
    });
    const availableListener = vi.fn();
    window.addEventListener('aionui-update-available', availableListener);

    try {
      render(<AboutModalContent />);
      fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

      await waitFor(() => expect(availableListener).toHaveBeenCalledTimes(1));
      const detail = (availableListener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.kind).toBe('available');
      expect(detail.updateInfo.version).toBe('2.2.3');
      expect(mocks.messageInfoMock).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('aionui-update-available', availableListener);
    }
  });

  it('shows an up-to-date message when no newer release exists', async () => {
    render(<AboutModalContent />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

    await waitFor(() => expect(mocks.messageInfoMock).toHaveBeenCalledWith('update.alreadyLatest'));
  });

  it('shows the check error when the update feed fails', async () => {
    mocks.updateCheckMock.mockResolvedValue({ success: false, msg: 'feed unavailable' });

    render(<AboutModalContent />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.checkForUpdates' }));

    await waitFor(() => expect(mocks.messageErrorMock).toHaveBeenCalledWith('feed unavailable'));
    expect(await screen.findByRole('button', { name: 'settings.checkForUpdates' })).toBeInTheDocument();
  });

  it('has no AionUi links', () => {
    render(<AboutModalContent />);

    expect(screen.queryByText('settings.helpDocumentation')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.contactMe')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.officialWebsite')).not.toBeInTheDocument();
    const openedUrls = mocks.openExternalUrlMock.mock.calls.map((call) => String(call[0]));
    expect(openedUrls.every((url) => !url.includes('aionui.com'))).toBe(true);
  });
});
