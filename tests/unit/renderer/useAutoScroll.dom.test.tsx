/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UIEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import { useAutoScroll } from '@/renderer/pages/conversation/Messages/useAutoScroll';

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {
    resizeObserverCallback = null;
  }
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

function createLeftMessage(content: string): TMessage {
  return {
    id: 'left-message',
    msg_id: 'left-message',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'left',
    content: {
      content,
    },
    created_at: 1,
  } as TMessage;
}

function createRightMessage(content: string): TMessage {
  return {
    id: 'right-message',
    msg_id: 'right-message',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'right',
    content: {
      content,
    },
    created_at: 1,
  } as TMessage;
}

function createScroller({
  scrollTop = 520,
  scrollHeight = 1000,
  clientHeight = 400,
}: {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
} = {}): HTMLDivElement {
  const scroller = document.createElement('div');
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    writable: true,
    value: scrollHeight,
  });
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    writable: true,
    value: clientHeight,
  });
  scroller.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    if (typeof top === 'number') {
      scroller.scrollTop = top;
    }
  });
  return scroller;
}

function createContent(): HTMLDivElement {
  return document.createElement('div');
}

function attachElements(
  result: ReturnType<typeof renderHook<typeof useAutoScroll>>['result'],
  scroller: HTMLDivElement,
  content: HTMLDivElement
): void {
  act(() => {
    result.current.handleScrollerRef(scroller);
    result.current.handleContentRef(content);
  });
}

function fireScroll(
  handleScroll: (event: UIEvent<HTMLDivElement>) => void,
  scroller: HTMLDivElement,
  nextScrollTop: number
): void {
  scroller.scrollTop = nextScrollTop;
  act(() => {
    handleScroll({
      currentTarget: scroller,
    } as UIEvent<HTMLDivElement>);
  });
}

describe('useAutoScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T12:00:00.000Z'));
    resizeObserverCallback = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('auto-follows to the bottom when content height changes and the user is still following output', () => {
    const scroller = createScroller();
    const content = createContent();
    const { result } = renderHook(() =>
      useAutoScroll({
        messages: [createLeftMessage('hello')],
        itemCount: 1,
      })
    );

    attachElements(result, scroller, content);

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 600,
      behavior: 'auto',
    });
  });

  it('auto-follows assistant message updates even when resize observer does not fire', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const content = createContent();
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useAutoScroll({
          messages,
          itemCount: messages.length,
        }),
      {
        initialProps: {
          messages: [createLeftMessage('hello')] as TMessage[],
        },
      }
    );

    attachElements(result, scroller, content);
    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    scroller.scrollHeight = 1080;
    act(() => {
      rerender({
        messages: [createLeftMessage('hello world'.repeat(8))],
      });
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 680,
      behavior: 'auto',
    });
  });

  it('auto-follows newly appended assistant messages without forcing manual scroll state', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const content = createContent();
    const nextAssistantMessage = {
      ...createLeftMessage('new assistant reply'),
      id: 'left-message-2',
      msg_id: 'left-message-2',
      created_at: 2,
    };
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useAutoScroll({
          messages,
          itemCount: messages.length,
        }),
      {
        initialProps: {
          messages: [createLeftMessage('hello')] as TMessage[],
        },
      }
    );

    attachElements(result, scroller, content);
    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    scroller.scrollHeight = 1080;
    act(() => {
      rerender({
        messages: [createLeftMessage('hello'), nextAssistantMessage],
      });
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 680,
      behavior: 'auto',
    });
  });

  it('does not auto-follow after the user scrolls up', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const content = createContent();
    const { result } = renderHook(() =>
      useAutoScroll({
        messages: [createLeftMessage('hello')],
        itemCount: 1,
      })
    );

    attachElements(result, scroller, content);
    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    fireScroll(result.current.handleScroll, scroller, 600);
    vi.setSystemTime(new Date('2026-05-26T12:00:00.250Z'));
    act(() => {
      result.current.handlePointerDown();
    });
    fireScroll(result.current.handleScroll, scroller, 480);

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).not.toHaveBeenCalledWith({
      top: 600,
      behavior: 'auto',
    });
    expect(result.current.showScrollButton).toBe(true);
  });

  it('does not auto-follow after the user manually scrolls while remaining away from the bottom', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const content = createContent();
    const { result } = renderHook(() =>
      useAutoScroll({
        messages: [createLeftMessage('hello')],
        itemCount: 1,
      })
    );

    attachElements(result, scroller, content);
    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    fireScroll(result.current.handleScroll, scroller, 240);
    vi.setSystemTime(new Date('2026-05-26T12:00:00.250Z'));
    act(() => {
      result.current.handlePointerDown();
    });
    fireScroll(result.current.handleScroll, scroller, 260);

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).not.toHaveBeenCalledWith({
      top: 600,
      behavior: 'auto',
    });
    expect(result.current.showScrollButton).toBe(true);
  });

  it('keeps following after a layout-driven scroll without any user gesture', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const content = createContent();
    const { result } = renderHook(() =>
      useAutoScroll({
        messages: [createLeftMessage('hello')],
        itemCount: 1,
      })
    );

    attachElements(result, scroller, content);
    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    vi.setSystemTime(new Date('2026-05-26T12:00:00.250Z'));
    fireScroll(result.current.handleScroll, scroller, 420);
    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 600,
      behavior: 'auto',
    });
  });

  it('treats wheel-driven user scroll as manual intervention even inside the programmatic guard window', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const content = createContent();
    const { result } = renderHook(() =>
      useAutoScroll({
        messages: [createLeftMessage('hello')],
        itemCount: 1,
      })
    );

    attachElements(result, scroller, content);
    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    act(() => {
      result.current.handleWheel({
        deltaX: 0,
        deltaY: -320,
      } as React.WheelEvent<HTMLDivElement>);
    });
    vi.mocked(scroller.scrollTo).mockClear();
    fireScroll(result.current.handleScroll, scroller, 260);

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).not.toHaveBeenCalledWith({
      top: 600,
      behavior: 'auto',
    });
    expect(result.current.showScrollButton).toBe(true);
  });

  it('forces a bottom sync when a new user message is appended', () => {
    const scroller = createScroller();
    const content = createContent();
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useAutoScroll({
          messages,
          itemCount: messages.length,
        }),
      {
        initialProps: {
          messages: [createLeftMessage('hello')] as TMessage[],
        },
      }
    );

    attachElements(result, scroller, content);

    act(() => {
      rerender({
        messages: [createLeftMessage('hello'), createRightMessage('question')],
      });
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 600,
      behavior: 'auto',
    });
  });

  it('lets an upward wheel gesture cancel a resize follow before the scroll event arrives', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const { result } = renderHook(() => useAutoScroll({ messages: [createLeftMessage('done')], itemCount: 1 }));
    attachElements(result, scroller, createContent());
    act(() => vi.runAllTimers());
    vi.mocked(scroller.scrollTo).mockClear();

    scroller.scrollHeight = 1200;
    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      result.current.handleWheel({ deltaX: 0, deltaY: -80 } as React.WheelEvent<HTMLDivElement>);
      vi.mocked(scroller.scrollTo).mockClear();
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).not.toHaveBeenCalled();
    fireScroll(result.current.handleScroll, scroller, 520);
    expect(result.current.showScrollButton).toBe(true);
  });

  it('does not resume following when a completed turn collapses during an upward wheel gesture', () => {
    const scroller = createScroller({ scrollTop: 600 });
    const { result } = renderHook(() => useAutoScroll({ messages: [createLeftMessage('done')], itemCount: 1 }));
    attachElements(result, scroller, createContent());
    act(() => vi.runAllTimers());
    vi.mocked(scroller.scrollTo).mockClear();

    act(() => result.current.handleWheel({ deltaX: 0, deltaY: -80 } as React.WheelEvent<HTMLDivElement>));
    vi.mocked(scroller.scrollTo).mockClear();
    act(() => resizeObserverCallback?.([], {} as ResizeObserver));
    fireScroll(result.current.handleScroll, scroller, 500);
    scroller.scrollHeight = 1100;
    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });

  it('stops an in-flight native smooth scroll as soon as the user wheels upward', () => {
    const scroller = createScroller({ scrollTop: 520 });
    const { result } = renderHook(() => useAutoScroll({ messages: [createLeftMessage('done')], itemCount: 1 }));
    attachElements(result, scroller, createContent());

    act(() => {
      result.current.handleWheel({ deltaX: 0, deltaY: -80 } as React.WheelEvent<HTMLDivElement>);
    });

    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' });
  });

  it('does not run a queued initial bottom sync after the user starts scrolling', () => {
    const scroller = createScroller({ scrollTop: 520 });
    const { result } = renderHook(() => useAutoScroll({ messages: [createLeftMessage('done')], itemCount: 1 }));
    attachElements(result, scroller, createContent());

    act(() => {
      result.current.handleWheel({ deltaX: 0, deltaY: -80 } as React.WheelEvent<HTMLDivElement>);
      vi.runAllTimers();
    });

    expect(scroller.scrollTo).not.toHaveBeenCalledWith({ top: 600, behavior: 'auto' });
  });

  it('scrolls a target element into view for explicit message jumps', () => {
    const { result } = renderHook(() =>
      useAutoScroll({
        messages: [createLeftMessage('hello')],
        itemCount: 1,
      })
    );
    const target = document.createElement('div');
    target.scrollIntoView = vi.fn();

    act(() => {
      result.current.scrollElementIntoView(target, {
        behavior: 'smooth',
        block: 'center',
      });
    });

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  });
});
