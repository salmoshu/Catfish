import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configGet = vi.hoisted(() => vi.fn());

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGet,
    whenReady: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      languageChanged: { on: vi.fn() },
      changeLanguage: { invoke: vi.fn() },
    },
  },
}));

describe('environment language preferences', { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    configGet.mockReturnValue('zh-CN');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the local language when the remote backend has another default', async () => {
    localStorage.setItem('i18nextLng', 'en-US');
    const { default: i18n } = await import('@/renderer/services/i18n');

    await waitFor(() => expect(i18n.language).toBe('en-US'));
    expect(localStorage.getItem('i18nextLng')).toBe('en-US');
  });

  it('uses the backend language when no local preference exists', async () => {
    const { default: i18n } = await import('@/renderer/services/i18n');

    await waitFor(() => expect(i18n.language).toBe('zh-CN'));
  });
});
