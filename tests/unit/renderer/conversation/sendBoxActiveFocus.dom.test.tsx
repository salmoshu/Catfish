/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DraftImageReference } from '@/renderer/hooks/chat/useSendBoxDraft';

const { layoutState } = vi.hoisted(() => ({
  layoutState: { isMobile: false },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getImageBase64: { invoke: vi.fn().mockResolvedValue('data:image/png;base64,aW1hZ2U=') },
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'var(--color-primary-6)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: 'sendbox-active-focus-conversation',
    type: 'acp',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: layoutState.isMobile }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [
    {
      id: 'prior-input',
      type: 'text',
      position: 'right',
      conversation_id: 'sendbox-active-focus-conversation',
      content: { content: 'Previous task instruction' },
    },
  ],
}));

vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    isOpen: false,
    showMenu: false,
    step: 'menu',
    filename: '',
    pathPreview: '',
    menuItems: [],
    activeIndex: 0,
    loading: false,
    openExportFlow: vi.fn(),
    closeExportFlow: vi.fn(),
    handleKeyDown: vi.fn(),
    onSelectMenuItem: vi.fn(),
    setActiveIndex: vi.fn(),
    setFilename: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    answer: '',
    question: '',
    isLoading: false,
    isOpen: false,
    ask: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hooks/system/useLiveTranscriptInsertion')>();
  return {
    ...actual,
    useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
  };
});

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));

import SendBox from '@/renderer/components/chat/SendBox';

const SendBoxHarness = ({
  active,
  onFocused,
  disabled,
  initialValue = '',
  onSend = vi.fn().mockResolvedValue(undefined),
  onAddToDraft,
  onValueChange,
  imagePaths,
  imageReferences,
  onImageReferencesChange,
}: {
  active?: boolean;
  onFocused?: () => void;
  disabled?: boolean;
  initialValue?: string;
  onSend?: (message: string) => Promise<void | false>;
  onAddToDraft?: () => void;
  onValueChange?: (value: string) => void;
  imagePaths?: string[];
  imageReferences?: DraftImageReference[];
  onImageReferencesChange?: (references: DraftImageReference[]) => void;
}) => {
  const [value, setValue] = useState(initialValue);
  return (
    <SendBox
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        onValueChange?.(nextValue);
      }}
      onSend={onSend}
      active={active}
      onFocused={onFocused}
      disabled={disabled}
      onAddToDraft={onAddToDraft}
      imagePaths={imagePaths}
      imageReferences={imageReferences}
      onImageReferencesChange={onImageReferencesChange}
    />
  );
};

describe('SendBox active-controlled focus', () => {
  it('keeps the draft intact when moving the caret with Up and Down', () => {
    render(<SendBoxHarness initialValue='unfinished draft' />);
    const input = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('unfinished draft');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('unfinished draft');
  });

  it('keeps Enter mapped to Send while Draft box has its own icon action', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onAddToDraft = vi.fn();

    render(<SendBoxHarness initialValue='queued draft' onSend={onSend} onAddToDraft={onAddToDraft} />);
    fireEvent.click(screen.getByTestId('sendbox-add-to-draft-btn'));

    expect(onAddToDraft).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    const textarea = screen.getByTestId('sendbox-input');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('queued draft');
  });

  it('restores the input when the parent blocks sending', async () => {
    const onSend = vi.fn().mockResolvedValue(false);

    render(<SendBoxHarness initialValue='blocked message' onSend={onSend} />);

    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('blocked message');
    await waitFor(() => expect(textarea.value).toBe('blocked message'));
  });

  it('uses the platform primary Enter shortcut for Draft box without sending', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onAddToDraft = vi.fn();

    render(<SendBoxHarness initialValue='save this for later' onSend={onSend} onAddToDraft={onAddToDraft} />);

    const textarea = screen.getByTestId('sendbox-input');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(onAddToDraft).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('focuses the textarea on mount when active is true (desktop)', async () => {
    layoutState.isMobile = false;
    render(<SendBoxHarness active={true} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('focuses on mount when active is omitted (default true, preserves single-conversation behavior)', async () => {
    layoutState.isMobile = false;
    render(<SendBoxHarness />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('does NOT focus on mount when active is false', async () => {
    layoutState.isMobile = false;
    render(
      <div>
        <button type='button'>outside</button>
        <SendBoxHarness active={false} />
      </div>
    );
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    screen.getByRole('button', { name: 'outside' }).focus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus());
    expect(textarea).not.toHaveFocus();
  });

  it('does not force focus on mobile even when active', async () => {
    layoutState.isMobile = true;
    render(
      <div>
        <button type='button'>outside</button>
        <SendBoxHarness active={true} />
      </div>
    );
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    screen.getByRole('button', { name: 'outside' }).focus();
    expect(textarea).not.toHaveFocus();
  });

  it('calls onFocused when the textarea gains focus', () => {
    layoutState.isMobile = false;
    const onFocused = vi.fn();
    render(<SendBoxHarness active={false} onFocused={onFocused} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
    });
    expect(onFocused).toHaveBeenCalledTimes(1);
  });
});

describe('SendBox selection→focus downward effect', () => {
  it('focuses when active transitions false→true', async () => {
    layoutState.isMobile = false;
    const { rerender } = render(<SendBoxHarness active={false} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    expect(textarea).not.toHaveFocus();
    rerender(<SendBoxHarness active={true} />);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('focuses once textarea becomes enabled while active (warmup recovery)', async () => {
    layoutState.isMobile = false;
    const { rerender } = render(<SendBoxHarness active={true} disabled={true} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    expect(textarea).not.toHaveFocus();
    rerender(<SendBoxHarness active={true} disabled={false} />);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('does not move the caret if the box is already focused when it becomes active', async () => {
    layoutState.isMobile = false;
    const { rerender } = render(<SendBoxHarness active={false} initialValue='hello world' />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(2, 2);
    });
    rerender(<SendBoxHarness active={true} initialValue='hello world' />);
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea.selectionStart).toBe(2);
  });

  it('never focuses while active stays false', async () => {
    layoutState.isMobile = false;
    render(
      <div>
        <button type='button'>outside</button>
        <SendBoxHarness active={false} />
      </div>
    );
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    screen.getByRole('button', { name: 'outside' }).focus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus());
    expect(textarea).not.toHaveFocus();
  });
});

describe('SendBox image paths', () => {
  it('inserts short image links at the current caret', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    const onValueChange = vi.fn();
    await act(async () => {
      render(<SendBoxHarness initialValue='ABCD' onValueChange={onValueChange} />);
    });

    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea).toHaveFocus());
    textarea.setSelectionRange(2, 2);
    await act(async () => {
      emitter.emit('sendbox.image-paths', ['D:\\images\\A Image.png'], 'sendbox-active-focus-conversation');
    });

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('AB [A Image] CD'));
    await waitFor(() => expect(textarea.value).toBe('AB [A Image] CD'));
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe(textarea.value.indexOf('CD'));
  });

  it('opens the original image from its short link and sends the full path', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    const { ipcBridge } = await import('@/common');
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<SendBoxHarness onSend={onSend} />);
    act(() => emitter.emit('sendbox.image-paths', ['C:\\images\\image-1.png'], 'sendbox-active-focus-conversation'));
    fireEvent.click(screen.getByRole('link', { name: '[image-1]' }));
    await waitFor(() =>
      expect(ipcBridge.fs.getImageBase64.invoke).toHaveBeenCalledWith({ path: 'C:\\images\\image-1.png' })
    );
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSend.mock.calls[0]?.[0].trim()).toBe('[C:\\images\\image-1.png]'));
  });

  it('does not insert an image intended for a different conversation', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    render(<SendBoxHarness initialValue='draft' />);
    act(() => emitter.emit('sendbox.image-paths', ['/tmp/image.png'], 'different-conversation'));
    expect(screen.getByTestId('sendbox-input')).toHaveValue('draft');
  });

  it('keeps images with the same filename linked to their original paths', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<SendBoxHarness onSend={onSend} />);
    act(() =>
      emitter.emit(
        'sendbox.image-paths',
        ['/first/image.png', '/second/image.png'],
        'sendbox-active-focus-conversation'
      )
    );
    expect(screen.getByRole('link', { name: '[image]' })).toHaveAttribute('title', '/first/image.png');
    expect(screen.getByRole('link', { name: '[image-2]' })).toHaveAttribute('title', '/second/image.png');
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSend.mock.calls[0]?.[0].trim()).toBe('[/first/image.png] [/second/image.png]'));
  });

  it('rehydrates image links from a saved conversation draft', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<SendBoxHarness initialValue='see [image]' imagePaths={['/tmp/image.png']} onSend={onSend} />);
    expect(screen.getByRole('link', { name: '[image]' })).toHaveAttribute('title', '/tmp/image.png');
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('see [/tmp/image.png]'));
  });

  it('preserves short image links when the parent rejects sending', async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<SendBoxHarness initialValue='see [image]' imagePaths={['/tmp/image.png']} onSend={onSend} />);
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByTestId('sendbox-input')).toHaveValue('see [image]'));
    expect(screen.getByRole('link', { name: '[image]' })).toBeInTheDocument();
    expect(onSend).toHaveBeenCalledWith('see [/tmp/image.png]');
  });

  it('retains saved image labels when an earlier same-named attachment is removed', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <SendBoxHarness
        initialValue='see [image-2]'
        imagePaths={['/second/image.png']}
        imageReferences={[
          { token: '[image]', path: '/first/image.png' },
          { token: '[image-2]', path: '/second/image.png' },
        ]}
        onSend={onSend}
      />
    );
    expect(screen.getByRole('link', { name: '[image-2]' })).toHaveAttribute('title', '/second/image.png');
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('see [/second/image.png]'));
  });

  it('saves the image label mapping with the conversation draft', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    const onImageReferencesChange = vi.fn();
    render(<SendBoxHarness onImageReferencesChange={onImageReferencesChange} />);
    act(() =>
      emitter.emit(
        'sendbox.image-paths',
        ['/first/image.png', '/second/image.png'],
        'sendbox-active-focus-conversation'
      )
    );
    expect(onImageReferencesChange).toHaveBeenCalledWith([
      { token: '[image]', path: '/first/image.png' },
      { token: '[image-2]', path: '/second/image.png' },
    ]);
  });

  it('preserves reply content with short image links when sending is rejected', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    const onSend = vi.fn().mockResolvedValue(false);
    render(<SendBoxHarness initialValue='see [image]' imagePaths={['/tmp/image.png']} onSend={onSend} />);
    act(() => emitter.emit('sendbox.reply', { messageId: 'quoted-message', content: 'quoted text', position: 'left' }));
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));
    await waitFor(() => expect(screen.getByTestId('sendbox-input')).toHaveValue('> quoted text\n\nsee [image]'));
    expect(onSend).toHaveBeenCalledWith('> quoted text\n\nsee [/tmp/image.png]');
  });

  it('reports an unavailable image without discarding the draft', async () => {
    const { ipcBridge } = await import('@/common');
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockResolvedValueOnce(null);
    const error = vi.spyOn(Message, 'error').mockReturnValue(() => {});
    try {
      render(<SendBoxHarness initialValue='see [image]' imagePaths={['/tmp/image.png']} />);
      fireEvent.click(screen.getByRole('link', { name: '[image]' }));
      await waitFor(() => expect(error).toHaveBeenCalledWith('preview.missingFile.title'));
      expect(screen.getByTestId('sendbox-input')).toHaveValue('see [image]');
    } finally {
      error.mockRestore();
    }
  });
});

describe('SendBox undo and redo', () => {
  it('undoes and redoes controlled typing with Ctrl-Z and Ctrl-Y', () => {
    render(<SendBoxHarness />);
    const input = screen.getByTestId('sendbox-input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(input).toHaveValue('hello');
    fireEvent.keyDown(input, { key: 'y', ctrlKey: true });
    expect(input).toHaveValue('hello world');
  });

  it('discards the redo branch when new text is entered after undo', () => {
    render(<SendBoxHarness />);
    const input = screen.getByTestId('sendbox-input');
    fireEvent.change(input, { target: { value: 'old' } });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'y', ctrlKey: true });
    expect(input).toHaveValue('new');
  });

  it('undoes image insertion and restores its preview link with redo', async () => {
    const { emitter } = await import('@/renderer/utils/emitter');
    render(<SendBoxHarness initialValue='draft ' />);
    const input = screen.getByTestId('sendbox-input');
    act(() => emitter.emit('sendbox.image-paths', ['/tmp/image-1.png'], 'sendbox-active-focus-conversation'));
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(input).toHaveValue('draft ');
    fireEvent.keyDown(input, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('link', { name: '[image-1]' })).toBeInTheDocument();
  });

  it('undoes an IME composition as a whole without restoring unfinished phonetic input', () => {
    render(<SendBoxHarness initialValue='draft ' />);
    const input = screen.getByTestId('sendbox-input');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'draft n' } });
    fireEvent.change(input, { target: { value: 'draft ni' } });
    fireEvent.change(input, { target: { value: 'draft 你' } });
    fireEvent.compositionEnd(input, { data: '你' });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(input).toHaveValue('draft ');
    fireEvent.keyDown(input, { key: 'y', ctrlKey: true });
    expect(input).toHaveValue('draft 你');
  });
});
