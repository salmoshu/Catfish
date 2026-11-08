import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}));

const files = Array.from({ length: 6 }, (_, index) => ({
  file_name: `file${index}.ts`,
  fullPath: `/repo/src/file${index}.ts`,
  insertions: index + 1,
  deletions: 1,
}));

describe('file change cards', () => {
  it('keeps the first three files visible and expands the remaining summary files', () => {
    render(<FileChangesPanel title='6 files modified' files={files} variant='summary' />);
    expect(screen.getByText('file2.ts')).toBeVisible();
    expect(screen.queryByText('file3.ts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'messages.moreFiles:3' }));
    expect(screen.getByText('file5.ts')).toBeVisible();
  });

  it('shows aggregate additions and deletions even when some files are folded', () => {
    render(<FileChangesPanel title='6 files modified' files={files} variant='summary' />);
    expect(screen.getByText('+21')).toBeVisible();
    expect(screen.getByText('−6')).toBeVisible();
  });

  it('shows paths during an operation and provides separate file and diff actions', () => {
    const openFile = vi.fn();
    const openDiff = vi.fn();
    render(<FileChangesPanel title='Edit' files={files.slice(0, 2)} onFileClick={openFile} onDiffClick={openDiff} />);
    fireEvent.click(screen.getByRole('button', { name: files[0].fullPath }));
    fireEvent.click(screen.getByRole('button', { name: `messages.fileChanges: ${files[1].fullPath}` }));
    expect(openFile).toHaveBeenCalledWith(files[0]);
    expect(openDiff).toHaveBeenCalledWith(files[1]);
  });

  it('collapses operation details with an accessible toggle', () => {
    render(<FileChangesPanel title='Edit' files={files.slice(0, 2)} />);
    fireEvent.click(screen.getByRole('button', { name: 'messages.editedFilesCount:2' }));
    expect(screen.queryByText('file0.ts')).not.toBeInTheDocument();
  });

  it('renders no empty card and disables unavailable file actions', () => {
    const { rerender, container } = render(<FileChangesPanel title='Edit' files={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FileChangesPanel title='Edit' files={files.slice(0, 1)} />);
    expect(screen.getByRole('button', { name: files[0].fullPath })).toBeDisabled();
  });
});
