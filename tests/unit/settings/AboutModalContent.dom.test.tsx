/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(),
  feedbackVisible: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/utils/platform', () => ({
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

  it('has no update check entry and no AionUi links remain', () => {
    render(<AboutModalContent />);

    expect(screen.queryByRole('button', { name: 'settings.checkForUpdates' })).not.toBeInTheDocument();
    expect(screen.queryByText('settings.helpDocumentation')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.contactMe')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.officialWebsite')).not.toBeInTheDocument();
    const openedUrls = mocks.openExternalUrlMock.mock.calls.map((call) => String(call[0]));
    expect(openedUrls.every((url) => !url.includes('aionui.com'))).toBe(true);
  });
});
