import { describe, expect, it } from 'vitest';
import {
  createTerminalLayout,
  getTerminalLayoutRects,
  listTerminalPaneIds,
  removeTerminalPane,
  splitTerminalLayout,
  updateTerminalSplitRatio,
} from '@/renderer/pages/conversation/Workbench/Terminal/terminalLayout';

describe('terminal split layout', () => {
  it('leaves the layout intact when the requested pane does not exist', () => {
    const root = createTerminalLayout('first');
    expect(splitTerminalLayout(root, 'missing', 'new', 'horizontal')).toBe(root);
    expect(removeTerminalPane(root, 'missing')).toBe(root);
  });

  it('splits the selected pane in both directions and retains pane ids', () => {
    const root = splitTerminalLayout(createTerminalLayout('first'), 'first', 'second', 'horizontal');
    const split = splitTerminalLayout(root, 'second', 'third', 'vertical');
    expect(listTerminalPaneIds(split)).toEqual(['first', 'second', 'third']);
    expect(getTerminalLayoutRects(split).panes).toEqual([
      { paneId: 'first', left: 0, top: 0, width: 50, height: 100 },
      { paneId: 'second', left: 50, top: 0, width: 50, height: 50 },
      { paneId: 'third', left: 50, top: 50, width: 50, height: 50 },
    ]);
  });

  it('expands the surviving pane when its neighbor closes', () => {
    const root = splitTerminalLayout(createTerminalLayout('first'), 'first', 'second', 'horizontal');
    expect(removeTerminalPane(root, 'first')).toEqual(createTerminalLayout('second'));
  });

  it('clamps resizing and ignores non-finite values', () => {
    const root = splitTerminalLayout(createTerminalLayout('first'), 'first', 'second', 'horizontal');
    expect(getTerminalLayoutRects(updateTerminalSplitRatio(root, 'split-second', -10)).panes[0].width).toBe(15);
    expect(getTerminalLayoutRects(updateTerminalSplitRatio(root, 'split-second', 10)).panes[0].width).toBe(85);
    expect(updateTerminalSplitRatio(root, 'split-second', Number.NaN)).toBe(root);
  });

  it('does not duplicate an existing pane id', () => {
    const root = splitTerminalLayout(createTerminalLayout('first'), 'first', 'second', 'horizontal');
    expect(splitTerminalLayout(root, 'second', 'first', 'vertical')).toBe(root);
  });
});
