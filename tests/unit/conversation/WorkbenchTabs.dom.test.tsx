import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchTabs } from '@/renderer/pages/conversation/Workbench/WorkbenchTabs';

const items = [
  { id: 'files' as const, label: 'Files' },
  { id: 'preview' as const, label: 'Preview' },
  { id: 'terminal' as const, label: 'Terminal', count: 2 },
];

describe('WorkbenchTabs', () => {
  it('supports roving focus and keyboard selection', () => {
    const onSelect = vi.fn();
    render(<WorkbenchTabs items={items} activeSection='files' label='Workbench sections' onSelect={onSelect} />);
    const files = screen.getByRole('tab', { name: 'Files' });
    const preview = screen.getByRole('tab', { name: 'Preview' });
    const terminal = screen.getByRole('tab', { name: 'Terminal 2' });

    expect(files).toHaveAttribute('aria-selected', 'true');
    expect(preview).toHaveAttribute('tabIndex', '-1');
    fireEvent.keyDown(files, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('preview');
    expect(preview).toHaveFocus();
    fireEvent.keyDown(preview, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('terminal');
    expect(terminal).toHaveFocus();
    fireEvent.keyDown(terminal, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('files');
    expect(files).toHaveFocus();
  });
});
