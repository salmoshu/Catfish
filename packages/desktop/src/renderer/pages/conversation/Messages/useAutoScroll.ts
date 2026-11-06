/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAutoScroll - Auto-scroll hook for a plain scroll container
 *
 * Strategy:
 * - Track whether the user has intentionally scrolled away from the bottom.
 * - Observe content/scroller size changes and keep the list pinned to bottom
 *   only while auto-follow mode is active.
 * - Use DOM-native scrollIntoView for explicit message jumps.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TMessage } from '@/common/chat/chatLib';

const AT_BOTTOM_THRESHOLD_PX = 100;
const FOLLOW_BOTTOM_THRESHOLD_PX = 4;

interface UseAutoScrollOptions {
  messages: TMessage[];
  itemCount: number;
}

interface ScrollElementIntoViewOptions {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}

interface UseAutoScrollReturn {
  handleScrollerRef: (ref: HTMLDivElement | null) => void;
  handleContentRef: (ref: HTMLDivElement | null) => void;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  handlePointerDown: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollElementIntoView: (element: HTMLElement | null, options?: ScrollElementIntoViewOptions) => void;
  hideScrollButton: () => void;
}

const getBottomGap = (element: HTMLElement): number => {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
};

export function useAutoScroll({ messages, itemCount }: UseAutoScrollOptions): UseAutoScrollReturn {
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const previousListLengthRef = useRef(messages.length);
  const previousLastMessageRef = useRef<TMessage | undefined>(messages[messages.length - 1]);
  const initialScrollDoneRef = useRef(false);
  const pendingAutoFollowFrameRef = useRef<number | null>(null);
  const userInputActiveRef = useRef(false);

  const updateBottomState = useCallback((element: HTMLDivElement) => {
    const bottomGap = getBottomGap(element);
    const withinButtonThreshold = bottomGap <= AT_BOTTOM_THRESHOLD_PX;
    const pinnedToBottom = bottomGap <= FOLLOW_BOTTOM_THRESHOLD_PX;
    setShowScrollButton(!withinButtonThreshold);

    return pinnedToBottom;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (itemCount <= 0 || !scrollerEl) return;

      scrollerEl.scrollTo({
        top: scrollerEl.scrollHeight - scrollerEl.clientHeight,
        behavior,
      });
      userScrolledRef.current = false;
      setShowScrollButton(false);
    },
    [itemCount, scrollerEl]
  );

  const scheduleAutoFollow = useCallback(() => {
    if (!scrollerEl || userScrolledRef.current) return;

    if (pendingAutoFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingAutoFollowFrameRef.current);
    }

    pendingAutoFollowFrameRef.current = requestAnimationFrame(() => {
      pendingAutoFollowFrameRef.current = null;
      if (!scrollerEl || userScrolledRef.current) return;

      const gap = getBottomGap(scrollerEl);
      if (gap > 2) {
        scrollToBottom('auto');
      }
    });
  }, [scrollerEl, scrollToBottom]);

  const handleScrollerRef = useCallback((ref: HTMLDivElement | null) => {
    setScrollerEl(ref);
  }, []);

  const handleContentRef = useCallback((ref: HTMLDivElement | null) => {
    setContentEl(ref);
  }, []);

  const scrollElementIntoView = useCallback((element: HTMLElement | null, options?: ScrollElementIntoViewOptions) => {
    if (!element) return;

    userScrolledRef.current = true;
    setShowScrollButton(false);
    element.scrollIntoView({
      behavior: options?.behavior ?? 'smooth',
      block: options?.block ?? 'start',
      inline: 'nearest',
    });
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const currentScrollTop = target.scrollTop;
      const delta = currentScrollTop - lastScrollTopRef.current;
      const bottomGap = getBottomGap(target);
      const pinnedToBottom = bottomGap <= FOLLOW_BOTTOM_THRESHOLD_PX;

      // Only a real user gesture may cancel following. Layout changes (for
      // example cards collapsing when a turn finishes) also emit scroll events;
      // treating those as manual scrolling used to leave the list stuck even
      // though the user never touched it.
      if (!pinnedToBottom && Math.abs(delta) > 2 && userInputActiveRef.current) {
        userScrolledRef.current = true;
      }

      if (pinnedToBottom) {
        userScrolledRef.current = false;
        userInputActiveRef.current = false;
      } else if (Math.abs(delta) > 2) {
        userInputActiveRef.current = false;
      }

      lastScrollTopRef.current = currentScrollTop;
      updateBottomState(target);
    },
    [updateBottomState]
  );

  const cancelAutoFollow = useCallback(() => {
    userScrolledRef.current = true;
    if (pendingAutoFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingAutoFollowFrameRef.current);
      pendingAutoFollowFrameRef.current = null;
    }
    scrollerEl?.scrollTo({ top: scrollerEl.scrollTop, behavior: 'auto' });
  }, [scrollerEl]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
        userInputActiveRef.current = true;
      }
      // Wheel intent arrives before the browser emits scroll. Cancel a pending
      // follow now so collapsing a completed turn cannot win that race.
      if (e.deltaY < 0) cancelAutoFollow();
    },
    [cancelAutoFollow]
  );

  const handlePointerDown = useCallback(() => {
    userInputActiveRef.current = true;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
        userInputActiveRef.current = true;
      }
      if (['ArrowUp', 'PageUp', 'Home'].includes(e.key) || (e.key === ' ' && e.shiftKey)) cancelAutoFollow();
    },
    [cancelAutoFollow]
  );

  useEffect(() => {
    if (!scrollerEl || !contentEl) return;

    const observer = new ResizeObserver(() => {
      scheduleAutoFollow();
      updateBottomState(scrollerEl);
    });

    observer.observe(scrollerEl);
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [contentEl, scheduleAutoFollow, scrollerEl, updateBottomState]);

  useEffect(() => {
    if (!scrollerEl || initialScrollDoneRef.current || itemCount === 0) return;

    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      if (userScrolledRef.current) return;
      scrollToBottom('auto');
      lastScrollTopRef.current = scrollerEl.scrollTop;
    });
  }, [itemCount, scrollerEl, scrollToBottom]);

  useEffect(() => {
    const currentListLength = messages.length;
    const previousLength = previousListLengthRef.current;
    const lastMessage = messages[messages.length - 1];
    const previousLastMessage = previousLastMessageRef.current;
    const isNewMessage = currentListLength > previousLength;
    const isLastMessageUpdated = currentListLength > 0 && lastMessage !== previousLastMessage;

    previousListLengthRef.current = currentListLength;
    previousLastMessageRef.current = lastMessage;

    if (!isNewMessage) {
      if (isLastMessageUpdated) {
        scheduleAutoFollow();
      }
      return;
    }

    if (lastMessage?.position !== 'right') {
      scheduleAutoFollow();
      return;
    }

    userScrolledRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!userScrolledRef.current) scrollToBottom('auto');
      });
    });
  }, [messages, scheduleAutoFollow, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (pendingAutoFollowFrameRef.current !== null) {
        cancelAnimationFrame(pendingAutoFollowFrameRef.current);
      }
    };
  }, []);

  const hideScrollButton = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    handleScrollerRef,
    handleContentRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    handleKeyDown,
    showScrollButton,
    scrollToBottom,
    scrollElementIntoView,
    hideScrollButton,
  };
}
