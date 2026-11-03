/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pickerMocks = vi.hoisted(() => ({ systemInfo: vi.fn(), getFilesByDir: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: { systemInfo: { invoke: pickerMocks.systemInfo } },
    fs: { getFilesByDir: { invoke: pickerMocks.getFilesByDir } },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

import { WebFsPicker } from '@/renderer/components/workspace/webFsPicker';

beforeEach(() => {
  pickerMocks.systemInfo.mockReset().mockResolvedValue({ workDir: '/home/winchell' });
  pickerMocks.getFilesByDir.mockReset().mockImplementation(({ dir }: { dir: string }) => {
    if (dir === '/home/winchell') {
      return Promise.resolve([{ name: 'CatfishCore', full_path: '/home/winchell/CatfishCore', is_dir: true }]);
    }
    return Promise.resolve([{ name: 'src', full_path: `${dir}/src`, is_dir: true }]);
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('WebFsPicker responsive dialog', () => {
  it('keeps the picker inside a narrow WebUI viewport', async () => {
    render(<WebFsPicker options={{ properties: ['openDirectory'] }} onDone={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    const modal = dialog.closest<HTMLElement>('.arco-modal');

    expect(modal?.style.width).toBe('calc(100vw - 32px)');
    expect(modal?.style.maxWidth).toBe('640px');
  });

  it('browses remote directories and returns the selected remote path', async () => {
    const onDone = vi.fn();
    render(<WebFsPicker options={{ properties: ['openDirectory'] }} onDone={onDone} />);

    expect(screen.getByPlaceholderText('/path/to/folder')).toHaveAttribute('spellcheck', 'false');
    expect(screen.getByPlaceholderText('/path/to/folder')).toHaveAttribute('autocorrect', 'off');
    fireEvent.click(await screen.findByText('CatfishCore'));
    expect(await screen.findByText('src')).toBeInTheDocument();
    expect(pickerMocks.getFilesByDir).toHaveBeenLastCalledWith({
      dir: '/home/winchell/CatfishCore',
      root: '/home/winchell/CatfishCore',
    });

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(['/home/winchell/CatfishCore']));
  });
});
