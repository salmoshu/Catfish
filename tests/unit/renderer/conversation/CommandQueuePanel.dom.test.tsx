import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => {
  type MockButtonProps = {
    children?: React.ReactNode;
    icon?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    className?: string;
    disabled?: boolean;
    [key: string]: unknown;
  };

  const Button = ({ children, icon, onClick, className, disabled, ...props }: MockButtonProps) => (
    <button
      type='button'
      aria-label={props['aria-label'] as string | undefined}
      aria-expanded={props['aria-expanded'] as boolean | undefined}
      aria-controls={props['aria-controls'] as string | undefined}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );

  const Menu = Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  });

  return {
    Button,
    Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Menu,
    Modal: { confirm: vi.fn() },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Typography: {
      Ellipsis: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    },
  };
});

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock('@/renderer/utils/ui/dndModifiers', () => ({
  restrictToVerticalAxis: vi.fn(),
}));

import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';

const item = (id: string, input: string): ConversationCommandQueueItem => ({
  id,
  input,
  files: [],
  created_at: 1,
});

const defaultProps = {
  items: [item('command-1', 'First queued command'), item('command-2', 'Second queued command')],
  mode: 'auto' as const,
  interactionLocked: false,
  onInteractionLock: vi.fn(),
  onInteractionUnlock: vi.fn(),
  onSendNow: vi.fn(),
  onToggleMode: vi.fn(),
  onReorder: vi.fn(),
  onRemove: vi.fn(),
  onClear: vi.fn(),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('CommandQueuePanel collapse control', () => {
  it('starts expanded and exposes the queued command list', () => {
    render(<CommandQueuePanel {...defaultProps} />);

    const toggle = screen.getByRole('button', { name: 'Collapse queued commands' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('First queued command')).toBeInTheDocument();
    expect(screen.getByText('Second queued command')).toBeInTheDocument();
  });

  it('collapses the list and restores it when toggled again', () => {
    render(<CommandQueuePanel {...defaultProps} />);

    const toggle = screen.getByRole('button', { name: 'Collapse queued commands' });
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Expand queued commands' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('First queued command')).toBeInTheDocument();
    const queueList = screen.getByText('First queued command').closest('[data-command-queue-list]');
    expect(queueList?.parentElement).toHaveAttribute('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Expand queued commands' }));

    expect(screen.getByRole('button', { name: 'Collapse queued commands' })).toHaveAttribute('aria-expanded', 'true');
    expect(queueList?.parentElement).not.toHaveAttribute('hidden');
  });

  it('does not allow collapsing while a queue item is being dragged', () => {
    render(<CommandQueuePanel {...defaultProps} interactionLocked />);

    expect(screen.getByRole('button', { name: 'Collapse queued commands' })).toBeDisabled();
  });
});
