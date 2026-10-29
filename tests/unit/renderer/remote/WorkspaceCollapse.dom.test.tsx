import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceCollapse from '@/renderer/pages/conversation/components/WorkspaceCollapse';

vi.mock('@icon-park/react', () => ({
  FolderClose: () => <svg data-testid='folder-close' />,
  FolderOpen: () => <svg data-testid='folder-open' />,
}));

const props = {
  onToggle: vi.fn(),
  header: <span>Project</span>,
  children: <div>Conversation</div>,
};

describe('WorkspaceCollapse leading icon', () => {
  it('keeps the folder icons as the default', () => {
    const { rerender } = render(<WorkspaceCollapse {...props} expanded={false} />);
    expect(screen.getByTestId('folder-close')).toBeInTheDocument();

    rerender(<WorkspaceCollapse {...props} expanded />);
    expect(screen.getByTestId('folder-open')).toBeInTheDocument();
  });

  it('replaces rather than decorates the folder with a custom icon', () => {
    render(
      <WorkspaceCollapse
        {...props}
        expanded={false}
        leadingIcon={<span data-testid='remote-project-icon'>Globe</span>}
      />
    );

    expect(screen.getByTestId('remote-project-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('folder-close')).not.toBeInTheDocument();
    expect(screen.queryByTestId('folder-open')).not.toBeInTheDocument();
  });
});
