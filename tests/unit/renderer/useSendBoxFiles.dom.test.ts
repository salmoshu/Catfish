import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { emitter } from '@/renderer/utils/emitter';

afterEach(() => {
  emitter.removeAllListeners('sendbox.image-paths');
});

describe('useSendBoxFiles image paths', () => {
  it('emits uploaded image paths for the active conversation', () => {
    const listener = vi.fn();
    emitter.on('sendbox.image-paths', listener);
    const setUploadFile = vi.fn();
    const { result } = renderHook(() =>
      useSendBoxFiles({
        atPath: [],
        uploadFile: [],
        setAtPath: vi.fn(),
        setUploadFile,
        conversation_id: 'conversation-1',
      })
    );

    act(() => {
      result.current.handleFilesAdded([
        { name: 'A Image.png', path: 'D:\\images\\A Image.png', size: 1, type: 'image/png', lastModified: 1 },
        { name: 'notes.txt', path: 'D:\\notes.txt', size: 1, type: 'text/plain', lastModified: 1 },
      ]);
    });

    expect(listener).toHaveBeenCalledWith(['D:\\images\\A Image.png'], 'conversation-1');
    const update = setUploadFile.mock.calls[0][0] as (previous: string[]) => string[];
    expect(update([])).toEqual(['D:\\images\\A Image.png', 'D:\\notes.txt']);
  });

  it('does not emit paths for non-image attachments', () => {
    const listener = vi.fn();
    emitter.on('sendbox.image-paths', listener);
    const { result } = renderHook(() =>
      useSendBoxFiles({
        atPath: [],
        uploadFile: [],
        setAtPath: vi.fn(),
        setUploadFile: vi.fn(),
      })
    );

    act(() => {
      result.current.handleFilesAdded([
        { name: 'notes.txt', path: 'D:\\notes.txt', size: 1, type: 'text/plain', lastModified: 1 },
      ]);
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
