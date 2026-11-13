/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { dispatchChatMessageJump, dispatchChatSearchPanelOpen } from '@/renderer/utils/chat/chatMinimapEvents';
import KimiIcon from '@renderer/components/base/KimiIcon';
import { Button, Dropdown, Menu, Message } from '@arco-design/web-react';
import { copyText } from '@/renderer/utils/ui/clipboard';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMessageList } from '../hooks';
import type { MessageAnchorItem } from './anchors';
import { useConversationAnchors } from './useConversationAnchors';
import {
  needsScroll,
  resolveScrollTopForIndex,
  resolveSearchButtonTop,
  resolveStackTop,
  resolveTickIndexAtOffset,
  resolveViewportHeight,
  TICK_GAP,
  tickCenterOffset,
  tickStackHeight,
} from './geometry';
import styles from './MessageAnchorRail.module.css';

const FLYOUT_ROW_HEIGHT = 36;
const FLYOUT_VERTICAL_PADDING = 16;
const FLYOUT_MAX_HEIGHT = 448;

const tickToneFor = (distance: number): string | undefined => {
  if (distance === 0) return styles.tickActive;
  if (distance === 1) return styles.tickNear;
  if (distance === 2) return styles.tickFar;
  return undefined;
};

/**
 * A compact vertical rail of ticks pinned to the chat area's left edge, with a
 * separate flyout for question labels. The compact strip and expanded list keep
 * their scroll positions proportional even though their row heights differ.
 */
const MessageAnchorRail: React.FC = () => {
  const { t } = useTranslation();
  const messages = useMessageList();
  const conversationContext = useConversationContextSafe();
  const conversationId = conversationContext?.conversation_id;
  const anchors = useConversationAnchors(conversationId, messages);

  const [railNode, setRailNode] = useState<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const [railHeight, setRailHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);

  useEffect(() => {
    const host = railNode?.parentElement;
    if (!railNode || !host || typeof ResizeObserver === 'undefined') return;

    const measure = () => setRailHeight(host.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [railNode]);

  useEffect(() => {
    setActiveIndex((current) => (current !== null && current >= anchors.length ? null : current));
  }, [anchors.length]);

  const jumpToAnchor = useCallback(
    (anchor: MessageAnchorItem | undefined) => {
      if (!anchor || !conversationId) return;
      dispatchChatMessageJump({
        conversation_id: conversationId,
        messageId: anchor.messageId,
        msgId: anchor.msgId,
        align: 'start',
        behavior: 'smooth',
      });
    },
    [conversationId]
  );

  const stackHeight = tickStackHeight(anchors.length);
  const viewportHeight = resolveViewportHeight(railHeight, anchors.length);
  const scrollable = needsScroll(railHeight, anchors.length);
  const stackTop = resolveStackTop(railHeight, anchors.length);
  const searchTop = resolveSearchButtonTop(railHeight, anchors.length);

  const followedCountRef = useRef(0);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !scrollable || anchors.length === 0) return;
    if (anchors.length === followedCountRef.current) return;
    followedCountRef.current = anchors.length;
    viewport.scrollTop = resolveScrollTopForIndex(anchors.length - 1, anchors.length, viewportHeight);
  }, [anchors.length, scrollable, viewportHeight]);

  const openSearchPanel = useCallback(() => {
    if (!conversationId) return;
    dispatchChatSearchPanelOpen({ conversation_id: conversationId });
  }, [conversationId]);

  const pointerYRef = useRef<number | null>(null);
  const [pointerOffset, setPointerOffset] = useState<number | null>(null);

  const selectAtPointer = useCallback(() => {
    const viewport = viewportRef.current;
    const pointerY = pointerYRef.current;
    if (!viewport || pointerY === null) return;
    const offsetY = pointerY + viewport.scrollTop;
    setPointerOffset(offsetY);
    setActiveIndex(resolveTickIndexAtOffset(offsetY, anchors.length));
  }, [anchors.length]);

  const syncScroll = useCallback((source: HTMLElement, target: HTMLElement) => {
    const sourceMax = Math.max(0, source.scrollHeight - source.clientHeight);
    const targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
    const next = sourceMax === 0 ? 0 : (source.scrollTop / sourceMax) * targetMax;
    if (Math.abs(target.scrollTop - next) > 1) target.scrollTop = next;
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      pointerYRef.current = event.clientY - viewport.getBoundingClientRect().top;
      selectAtPointer();
    },
    [selectAtPointer]
  );

  const handleViewportScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const viewport = event.currentTarget;
      if (flyoutRef.current) syncScroll(viewport, flyoutRef.current);
      selectAtPointer();
    },
    [selectAtPointer, syncScroll]
  );

  const focusAnchor = useCallback((index: number) => {
    setActiveIndex(index);
    setPointerOffset(tickCenterOffset(index));
  }, []);

  const revealIndex = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport || !scrollable) return;
      viewport.scrollTop = resolveScrollTopForIndex(index, anchors.length, viewportHeight);
    },
    [anchors.length, scrollable, viewportHeight]
  );

  const clearHover = useCallback(() => {
    if (copyMenuOpen) return;
    pointerYRef.current = null;
    setPointerOffset(null);
    setActiveIndex(null);
    setDirectoryOpen(false);
  }, [copyMenuOpen]);

  const copyInstruction = async (anchor: MessageAnchorItem): Promise<void> => {
    try {
      await copyText(anchor.input);
      Message.success(t('common.copySuccess'));
    } catch {
      Message.error(t('common.copyFailed'));
    }
  };

  const openDirectory = useCallback(() => setDirectoryOpen(true), []);

  if (anchors.length === 0) return null;

  const activeAnchor = activeIndex === null ? undefined : anchors[activeIndex];
  const tickInfluenceRadius = tickCenterOffset(1) * 3;
  const tickWidthFor = (index: number): number | undefined => {
    if (pointerOffset === null) return undefined;
    const distance = Math.abs(tickCenterOffset(index) - pointerOffset);
    const proximity = Math.max(0, 1 - distance / tickInfluenceRadius);
    const eased = proximity * proximity * (3 - 2 * proximity);
    return 12 + eased * 18;
  };
  const flyoutHeight = Math.min(
    anchors.length * FLYOUT_ROW_HEIGHT + FLYOUT_VERTICAL_PADDING,
    FLYOUT_MAX_HEIGHT,
    Math.max(0, window.innerHeight - 80)
  );
  const flyoutTop = stackTop + viewportHeight / 2 - flyoutHeight / 2;

  return (
    <div
      ref={setRailNode}
      className={classNames(styles.rail, directoryOpen && styles.directoryOpen, 'absolute start-0 top-0 bottom-0 z-20')}
      data-testid='message-anchor-rail'
      aria-label={t('messages.anchorRail.label')}
      role='navigation'
      onPointerLeave={clearHover}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearHover();
      }}
    >
      <div
        ref={viewportRef}
        className={classNames(styles.viewport, scrollable && styles.viewportScrollable)}
        style={{ top: stackTop, height: viewportHeight }}
        data-testid='message-anchor-rail-zone'
        data-scrollable={scrollable ? 'true' : undefined}
        onScroll={handleViewportScroll}
        onPointerEnter={openDirectory}
        onPointerMove={handlePointerMove}
        onClick={() => jumpToAnchor(activeAnchor)}
      >
        <div className={styles.ticks} style={{ height: stackHeight, rowGap: TICK_GAP }}>
          {anchors.map((anchor, index) => (
            <Button
              key={anchor.messageId}
              type='text'
              size='mini'
              htmlType='button'
              data-testid='message-anchor-tick'
              data-anchor-index={anchor.index}
              data-anchor-active={activeIndex === index ? 'true' : undefined}
              aria-label={t('messages.anchorRail.tickAria', { index: anchor.index })}
              aria-current={activeIndex === index ? 'location' : undefined}
              className={classNames(
                styles.tick,
                activeIndex === null ? undefined : tickToneFor(Math.abs(index - activeIndex))
              )}
              onClick={(event) => {
                event.stopPropagation();
                jumpToAnchor(anchor);
              }}
              onFocus={() => {
                openDirectory();
                focusAnchor(index);
                revealIndex(index);
              }}
              onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
            >
              <span
                className={styles.tickMark}
                style={{ width: tickWidthFor(index) }}
                data-testid='message-anchor-tick-mark'
                aria-hidden='true'
              />
            </Button>
          ))}
        </div>
      </div>

      <div
        ref={flyoutRef}
        className={styles.flyout}
        style={{ top: flyoutTop }}
        role='group'
        aria-hidden={!directoryOpen}
        inert={!directoryOpen}
        aria-label={t('messages.anchorRail.label')}
        data-testid='message-anchor-flyout'
        onScroll={(event) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          syncScroll(event.currentTarget, viewport);
          selectAtPointer();
        }}
        onPointerMove={(event) => {
          const item = (event.target as Element).closest<HTMLElement>('[data-anchor-flyout-index]');
          if (item) focusAnchor(Number(item.dataset.anchorFlyoutIndex));
        }}
      >
        {anchors.map((anchor, index) => (
          <Dropdown
            key={anchor.messageId}
            trigger='contextMenu'
            onVisibleChange={setCopyMenuOpen}
            droplist={
              <Menu onClickMenuItem={() => void copyInstruction(anchor)}>
                <Menu.Item key='copy'>{t('messages.anchorRail.copyInstruction')}</Menu.Item>
              </Menu>
            }
          >
            <Button
              type='text'
              size='mini'
              htmlType='button'
              className={classNames(styles.flyoutItem, activeIndex === index && styles.flyoutActive)}
              data-anchor-flyout-index={index}
              data-testid='message-anchor-flyout-item'
              aria-label={t('messages.anchorRail.tickAria', { index: anchor.index })}
              aria-current={activeIndex === index ? 'location' : undefined}
              onClick={() => jumpToAnchor(anchor)}
              onFocus={() => {
                focusAnchor(index);
                revealIndex(index);
              }}
            >
              <span className={styles.flyoutLabel}>{anchor.question}</span>
            </Button>
          </Dropdown>
        ))}
      </div>

      <Button
        type='text'
        size='mini'
        htmlType='button'
        className={styles.searchButton}
        style={{ top: searchTop }}
        data-testid='message-anchor-rail-search'
        aria-label={t('messages.anchorRail.searchAria')}
        title={t('messages.anchorRail.searchAria')}
        onClick={openSearchPanel}
        icon={<KimiIcon name='search' className={styles.searchIcon} />}
      />
    </div>
  );
};

export default MessageAnchorRail;
