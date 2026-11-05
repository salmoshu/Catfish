/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Rendered height of one compact outline row. Expanded labels use the flyout stylesheet. */
export const TICK_HEIGHT = 10;

/** Compact ticks form one continuous strip; labels no longer expand inside the rail. */
export const TICK_GAP = 0;

/** Space reserved for the 16px search button above the compact strip. */
export const SEARCH_BUTTON_BAND = 24;

/** At most seventeen compact ticks are visible; longer conversations scroll. */
export const MAX_VISIBLE_TICKS = 17;

const TICK_STRIDE = TICK_HEIGHT + TICK_GAP;

/** Tallest the compact tick viewport is ever allowed to get. */
export const MAX_VIEWPORT_HEIGHT = MAX_VISIBLE_TICKS * TICK_HEIGHT + (MAX_VISIBLE_TICKS - 1) * TICK_GAP;

/** Total height of the compact tick stack. */
export const tickStackHeight = (count: number): number => {
  if (count <= 0) return 0;
  return count * TICK_HEIGHT + Math.max(0, count - 1) * TICK_GAP;
};

/** Offset of a tick's vertical centre, measured from the top of the stack. */
export const tickCenterOffset = (index: number): number => index * TICK_STRIDE + TICK_HEIGHT / 2;

/** Height available to the compact rail, bounded by the search band and the seventeen-row cap. */
export const resolveViewportHeight = (railHeight: number, count = MAX_VISIBLE_TICKS): number => {
  const available = Math.max(0, railHeight - SEARCH_BUTTON_BAND);
  return Math.min(available, MAX_VIEWPORT_HEIGHT, Math.max(0, tickStackHeight(count)));
};

/** Whether the compact stack exceeds its capped viewport. */
export const needsScroll = (railHeight: number, count: number): boolean =>
  tickStackHeight(count) > resolveViewportHeight(railHeight, count);

/** Centre the search button and compact strip as one group. */
export const resolveSearchButtonTop = (railHeight: number, count: number): number => {
  const group = SEARCH_BUTTON_BAND + resolveViewportHeight(railHeight, count);
  return Math.max(0, (railHeight - group) / 2);
};

/** Top offset of the compact viewport, directly below the search button. */
export const resolveStackTop = (railHeight: number, count: number): number =>
  resolveSearchButtonTop(railHeight, count) + SEARCH_BUTTON_BAND;

/** Select the nearest compact tick to a stack-relative pointer offset. */
export const resolveTickIndexAtOffset = (offsetY: number, count: number): number | null => {
  if (count <= 0) return null;
  const raw = Math.round((offsetY - TICK_HEIGHT / 2) / TICK_STRIDE);
  return Math.min(count - 1, Math.max(0, raw));
};

/** Scroll offset that brings `index` into view, clamped to the compact viewport. */
export const resolveScrollTopForIndex = (index: number, count: number, viewportHeight: number): number => {
  const maxScroll = Math.max(0, tickStackHeight(count) - viewportHeight);
  const centred = tickCenterOffset(index) - viewportHeight / 2;
  return Math.min(maxScroll, Math.max(0, centred));
};
