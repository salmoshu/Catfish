/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the upload state store, focused on the abort wiring added
 * for ELECTRON-1K2 (uploads cannot be cancelled / are not bound to the
 * conversation lifecycle).
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { abortUpload, abortUploads, trackUpload } from '@/renderer/hooks/file/useUploadState';
import { PasteService } from '@/renderer/services/PasteService';

const { uploadFileViaHttpMock } = vi.hoisted(() => ({ uploadFileViaHttpMock: vi.fn() }));

vi.mock('@/renderer/services/FileService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/services/FileService')>();
  return { ...actual, uploadFileViaHttp: uploadFileViaHttpMock };
});

describe('useUploadState abort wiring', () => {
  it('invokes onAbort exactly once when abortUpload is called', () => {
    const onAbort = vi.fn();
    const tracker = trackUpload(100, { source: 'sendbox', name: 'a.txt', onAbort });

    abortUpload(tracker.id);
    abortUpload(tracker.id); // second call must be a no-op

    expect(onAbort).toHaveBeenCalledTimes(1);

    // Cleanup so the store is empty between tests.
    tracker.finish();
  });

  it('tracker.abort() reaches the registered onAbort handler', () => {
    const onAbort = vi.fn();
    const tracker = trackUpload(100, { source: 'sendbox', name: 'b.txt', onAbort });

    tracker.abort();

    expect(onAbort).toHaveBeenCalledTimes(1);
    tracker.finish();
  });

  it('abortUploads with exceptConversationId only aborts uploads bound to other conversations', () => {
    const onAbortKept = vi.fn();
    const onAbortDropped = vi.fn();
    const onAbortUnbound = vi.fn();

    const kept = trackUpload(10, {
      source: 'sendbox',
      name: 'keep.txt',
      conversationId: 'cur',
      onAbort: onAbortKept,
    });
    const dropped = trackUpload(10, {
      source: 'sendbox',
      name: 'drop.txt',
      conversationId: 'old',
      onAbort: onAbortDropped,
    });
    const unbound = trackUpload(10, {
      source: 'sendbox',
      name: 'unbound.txt',
      onAbort: onAbortUnbound,
    });

    abortUploads({ source: 'sendbox', exceptConversationId: 'cur' });

    expect(onAbortKept).not.toHaveBeenCalled();
    expect(onAbortDropped).toHaveBeenCalledTimes(1);
    expect(onAbortUnbound).toHaveBeenCalledTimes(1); // unbound != 'cur', so it is aborted

    kept.finish();
    dropped.finish();
    unbound.finish();
  });

  it('abortUploads scoped by source only affects matching uploads', () => {
    const onAbortSendbox = vi.fn();
    const onAbortWorkspace = vi.fn();

    const sendbox = trackUpload(10, { source: 'sendbox', onAbort: onAbortSendbox });
    const workspace = trackUpload(10, { source: 'workspace', onAbort: onAbortWorkspace });

    abortUploads({ source: 'sendbox' });

    expect(onAbortSendbox).toHaveBeenCalledTimes(1);
    expect(onAbortWorkspace).not.toHaveBeenCalled();

    sendbox.finish();
    workspace.finish();
  });
});

describe('PasteService clipboard image names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 13, 9, 8, 7));
    uploadFileViaHttpMock.mockImplementation(async (file: File) => `/uploads/${file.name}`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const pasteImages = async (files: File[], onFilesAdded = vi.fn()) => {
    const event = {
      stopPropagation: vi.fn(),
      clipboardData: { getData: () => '', files },
    };
    const handled = await PasteService.handlePaste(event as never, ['.png'], onFilesAdded, undefined, 'conv-1');
    return { handled, onFilesAdded };
  };

  it('names a clipboard image with the local date and time', async () => {
    const image = new File(['image'], 'image.png', { type: 'image/png' });

    const { handled, onFilesAdded } = await pasteImages([image]);

    expect(handled).toBe(true);
    expect(uploadFileViaHttpMock.mock.calls[0][0]).toEqual(expect.objectContaining({ name: '20261113-090807.png' }));
    expect(onFilesAdded).toHaveBeenCalledWith([
      expect.objectContaining({ name: '20261113-090807.png', path: '/uploads/20261113-090807.png' }),
    ]);
  });

  it('keeps same-second images in one batch distinct', async () => {
    const images = [
      new File(['first'], 'image.png', { type: 'image/png' }),
      new File(['second'], 'clipboard.png', { type: 'image/png' }),
    ];

    await pasteImages(images);

    const names = uploadFileViaHttpMock.mock.calls.map(([file]) => (file as File).name);
    expect(names).toEqual(['20261113-090807.png', '20261113-090807_2.png']);
  });

  it('does not add an attachment when the upload fails', async () => {
    uploadFileViaHttpMock.mockRejectedValueOnce(new Error('network unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const image = new File(['image'], 'image.png', { type: 'image/png' });

    const { handled, onFilesAdded } = await pasteImages([image]);

    expect(handled).toBe(true);
    expect(onFilesAdded).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
