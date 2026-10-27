import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Github, Plus } from '@icon-park/react';
import IconParkHOC from '@/renderer/components/IconParkHOC';
import KimiIcon from '@/renderer/components/base/KimiIcon';
import WindowControls from '@/renderer/components/layout/WindowControls';
import PreviewTabs from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs';

const windowControlMocks = vi.hoisted(() => ({
  isMaximized: vi.fn(),
  maximizedChanged: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    windowControls: {
      isMaximized: { invoke: windowControlMocks.isMaximized },
      maximizedChanged: { on: windowControlMocks.maximizedChanged },
      minimize: { invoke: windowControlMocks.minimize },
      maximize: { invoke: windowControlMocks.maximize },
      unmaximize: { invoke: windowControlMocks.unmaximize },
      close: { invoke: windowControlMocks.close },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const MAXIMIZE_PATH = 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

describe('Kimi icons', () => {
  afterEach(() => cleanup());

  it('renders the original SVG paths without legacy stroke overrides', () => {
    const { container, rerender } = render(<KimiIcon name='plus' size={18} strokeWidth={5} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('height', '18');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg?.querySelector('path')).toHaveAttribute('d', expect.stringMatching(/^M12\.0684 2\.03418/));

    rerender(<KimiIcon name='close' />);
    expect(container.querySelector('path')).toHaveAttribute('d', expect.stringMatching(/^M17\.9542 4\.77253/));

    rerender(<KimiIcon name='shape-square' />);
    expect(container.querySelector('path')).toHaveAttribute('d', MAXIMIZE_PATH);

    rerender(<KimiIcon name='copy' />);
    expect(container.querySelector('path')).toHaveAttribute('d', expect.stringMatching(/^M17 7\.09961/));
  });

  it('retains both sidebar variants and original IconPark fallbacks', () => {
    const { container, rerender } = render(<KimiIcon name='panel-collapse' />);
    expect(container.querySelector('#bar-divider')).not.toBeNull();
    expect(container.querySelector('#bar-box')).not.toBeNull();

    rerender(<KimiIcon name='panel-collapse-right' />);
    expect(container.querySelector('#rbar-divider')).not.toBeNull();

    const WrappedPlus = IconParkHOC(Plus, 'Plus');
    rerender(<WrappedPlus size={17} strokeWidth={5} />);
    expect(container.querySelector('path')).toHaveAttribute('d', expect.stringMatching(/^M12\.0684 2\.03418/));
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '2');

    const WrappedGithub = IconParkHOC(Github, 'Github');
    const { container: original } = render(<Github />);
    rerender(<WrappedGithub />);
    expect(container.querySelector('svg')).not.toHaveAttribute('stroke-width', '2');
    const getPaths = (root: HTMLElement) => Array.from(root.querySelectorAll('path'), (path) => path.getAttribute('d'));
    expect(getPaths(container)).toEqual(getPaths(original));
  });
});

describe('icon interactions', () => {
  beforeEach(() => {
    Object.values(windowControlMocks).forEach((mock) => mock.mockReset());
    windowControlMocks.isMaximized.mockResolvedValue(false);
    windowControlMocks.maximizedChanged.mockReturnValue(windowControlMocks.unsubscribe);
  });

  afterEach(() => cleanup());

  it('keeps window control callbacks and switches maximize to restore', async () => {
    let updateMaximized: ((state: { is_maximized: boolean }) => void) | undefined;
    windowControlMocks.maximizedChanged.mockImplementation((listener: (state: { is_maximized: boolean }) => void) => {
      updateMaximized = listener;
      return windowControlMocks.unsubscribe;
    });

    const { unmount } = render(<WindowControls />);
    await waitFor(() => expect(windowControlMocks.isMaximized).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(windowControlMocks.minimize).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Maximize' }).querySelector('path')).toHaveAttribute('d', MAXIMIZE_PATH);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(windowControlMocks.maximize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(windowControlMocks.close).toHaveBeenCalledOnce();

    act(() => updateMaximized?.({ is_maximized: true }));
    const restoreButton = screen.getByRole('button', { name: 'Restore' });
    expect(restoreButton.querySelector('path')).toHaveAttribute('d', expect.stringMatching(/^M17 7\.09961/));
    fireEvent.click(restoreButton);
    expect(windowControlMocks.unmaximize).toHaveBeenCalledOnce();

    unmount();
    expect(windowControlMocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps preview maximize and close callbacks', () => {
    const onToggleMaximize = vi.fn();
    const onClosePanel = vi.fn();
    const { rerender } = render(
      <PreviewTabs
        tabs={[{ id: 'tab-1', title: 'Example' }]}
        activeTabId='tab-1'
        tabFadeState={{ left: false, right: false }}
        tabsContainerRef={React.createRef<HTMLDivElement>()}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onContextMenu={vi.fn()}
        onClosePanel={onClosePanel}
        onToggleMaximize={onToggleMaximize}
        isMaximized={false}
      />
    );

    const maximize = screen.getByTitle('preview.maximizePanel');
    expect(maximize.querySelector('path')).toHaveAttribute('d', expect.stringMatching(/^M5 11\.0996/));
    fireEvent.click(maximize);
    expect(onToggleMaximize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('preview-collapse-panel'));
    expect(onClosePanel).toHaveBeenCalledOnce();

    rerender(
      <PreviewTabs
        tabs={[{ id: 'tab-1', title: 'Example' }]}
        activeTabId='tab-1'
        tabFadeState={{ left: false, right: false }}
        tabsContainerRef={React.createRef<HTMLDivElement>()}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onContextMenu={vi.fn()}
        onToggleMaximize={onToggleMaximize}
        isMaximized
      />
    );
    expect(screen.getByTitle('preview.restorePanel').querySelector('path')).toHaveAttribute(
      'd',
      expect.stringMatching(/^M9\.85815 11\.957/)
    );
  });
});
