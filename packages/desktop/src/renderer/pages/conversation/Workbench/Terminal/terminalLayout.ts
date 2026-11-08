/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type TerminalSplitDirection = 'horizontal' | 'vertical';
export type TerminalLayoutNode =
  | { type: 'pane'; paneId: string }
  | {
      type: 'split';
      id: string;
      direction: TerminalSplitDirection;
      ratio: number;
      first: TerminalLayoutNode;
      second: TerminalLayoutNode;
    };
export type TerminalRect = { left: number; top: number; width: number; height: number };
export type TerminalDivider = TerminalRect & { id: string; direction: TerminalSplitDirection; ratio: number };

/** Create a layout containing one shell. */
export const createTerminalLayout = (paneId: string): TerminalLayoutNode => ({ type: 'pane', paneId });

/** Split the selected pane while retaining every existing pane's identity. */
export const splitTerminalLayout = (
  node: TerminalLayoutNode,
  paneId: string,
  newPaneId: string,
  direction: TerminalSplitDirection
): TerminalLayoutNode => {
  if (listTerminalPaneIds(node).includes(newPaneId)) return node;
  if (node.type === 'pane') {
    return node.paneId === paneId
      ? {
          type: 'split',
          id: `split-${newPaneId}`,
          direction,
          ratio: 0.5,
          first: node,
          second: createTerminalLayout(newPaneId),
        }
      : node;
  }
  return {
    ...node,
    first: splitTerminalLayout(node.first, paneId, newPaneId, direction),
    second: splitTerminalLayout(node.second, paneId, newPaneId, direction),
  };
};

/** Remove a pane and expand its surviving neighbor into the freed space. */
export const removeTerminalPane = (node: TerminalLayoutNode, paneId: string): TerminalLayoutNode | null => {
  if (node.type === 'pane') return node.paneId === paneId ? null : node;
  const first = removeTerminalPane(node.first, paneId);
  const second = removeTerminalPane(node.second, paneId);
  return first && second ? { ...node, first, second } : (first ?? second);
};

/** Resize a split without allowing either side to become inaccessible. */
export const updateTerminalSplitRatio = (
  node: TerminalLayoutNode,
  splitId: string,
  ratio: number
): TerminalLayoutNode => {
  if (node.type === 'pane' || !Number.isFinite(ratio)) return node;
  if (node.id === splitId) return { ...node, ratio: Math.max(0.15, Math.min(0.85, ratio)) };
  return {
    ...node,
    first: updateTerminalSplitRatio(node.first, splitId, ratio),
    second: updateTerminalSplitRatio(node.second, splitId, ratio),
  };
};

/** Return pane ids in visual order. */
export const listTerminalPaneIds = (node: TerminalLayoutNode): string[] =>
  node.type === 'pane' ? [node.paneId] : [...listTerminalPaneIds(node.first), ...listTerminalPaneIds(node.second)];

/** Flatten the layout so React never reparents a running terminal when panes split. */
export function getTerminalLayoutRects(node: TerminalLayoutNode): {
  panes: (TerminalRect & { paneId: string })[];
  dividers: TerminalDivider[];
} {
  const panes: (TerminalRect & { paneId: string })[] = [];
  const dividers: TerminalDivider[] = [];
  const visit = (current: TerminalLayoutNode, rect: TerminalRect): void => {
    if (current.type === 'pane') {
      panes.push({ ...rect, paneId: current.paneId });
      return;
    }
    dividers.push({ ...rect, id: current.id, direction: current.direction, ratio: current.ratio });
    if (current.direction === 'horizontal') {
      const width = rect.width * current.ratio;
      visit(current.first, { ...rect, width });
      visit(current.second, { ...rect, left: rect.left + width, width: rect.width - width });
    } else {
      const height = rect.height * current.ratio;
      visit(current.first, { ...rect, height });
      visit(current.second, { ...rect, top: rect.top + height, height: rect.height - height });
    }
  };
  visit(node, { left: 0, top: 0, width: 100, height: 100 });
  return { panes, dividers };
}
