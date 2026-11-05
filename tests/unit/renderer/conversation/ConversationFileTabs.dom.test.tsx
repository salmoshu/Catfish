import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationFileTabs from '@/renderer/pages/conversation/components/ChatLayout/ConversationFileTabs';

const preview = vi.hoisted(() => ({
  isOpen: false,
  tabs: [] as Array<Record<string, unknown>>,
  activeTabId: null as string | null,
  openPreview: vi.fn(),
  closePreview: vi.fn(),
  closeTab: vi.fn(),
  saveContent: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => preview,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ visible, children, footer }: { visible: boolean; children: React.ReactNode; footer: React.ReactNode }) =>
    visible ? (
      <div data-testid='close-confirm'>
        {children}
        {footer}
      </div>
    ) : null,
}));

const file = (id: string, title: string, isDirty = false) => ({
  id,
  title,
  content: `${title} content`,
  content_type: 'code',
  metadata: { file_name: title },
  isDirty,
});

beforeEach(() => {
  preview.isOpen = false;
  preview.tabs = [file('file-1', 'alpha.ts'), file('file-2', 'beta.md')];
  preview.activeTabId = null;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('ConversationFileTabs', () => {
  it('renders no tab row when every file is closed', () => {
    preview.tabs = [];
    const { container } = render(<ConversationFileTabs agentLabel='Kimi' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pins Agent first, keeps it active while chat is visible, and opens files on demand', () => {
    render(<ConversationFileTabs agentLabel='Kimi' />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Kimi');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('button', { name: 'preview.closeTabTitle' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('tab', { name: 'alpha.ts' }));
    expect(preview.openPreview).toHaveBeenCalledWith('alpha.ts content', 'code', { file_name: 'alpha.ts' });
    fireEvent.click(tabs[0]);
    expect(preview.closePreview).toHaveBeenCalledOnce();
  });

  it('closes clean files directly and keeps the row for remaining files', () => {
    render(<ConversationFileTabs agentLabel='Kimi' />);
    fireEvent.click(screen.getAllByRole('button', { name: 'preview.closeTabTitle' })[0]);
    expect(preview.closeTab).toHaveBeenCalledWith('file-1');
    expect(screen.getByRole('tab', { name: 'Kimi' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'beta.md' })).toBeInTheDocument();
  });

  it('asks before closing a dirty file', () => {
    preview.tabs = [file('file-1', 'alpha.ts', true)];
    render(<ConversationFileTabs agentLabel='Kimi' />);
    fireEvent.click(screen.getByRole('button', { name: 'preview.closeTabTitle' }));

    expect(screen.getByTestId('close-confirm')).toBeInTheDocument();
    expect(preview.closeTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'preview.closeWithoutSave' }));
    expect(preview.closeTab).toHaveBeenCalledWith('file-1');
  });
});
