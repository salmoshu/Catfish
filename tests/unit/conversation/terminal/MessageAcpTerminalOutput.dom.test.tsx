import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageAcpTerminalOutput } from '@/common/chat/chatLib';
import MessageAcpTerminalOutput from '@/renderer/pages/conversation/Messages/acp/MessageAcpTerminalOutput';

vi.mock('@/common', () => ({
  ipcBridge: { conversation: { killTerminal: { invoke: vi.fn() } } },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const message = (output: string, running = false): IMessageAcpTerminalOutput => ({
  id: 'terminal-1',
  msg_id: 'turn-1',
  conversation_id: 'conversation-1',
  type: 'acp_terminal_output',
  position: 'left',
  created_at: 1,
  content: {
    terminal_id: 'terminal-1',
    command: 'git status',
    output,
    truncated: false,
    exit_status: running ? undefined : { exit_code: 0 },
  },
});

describe('MessageAcpTerminalOutput', () => {
  it('keeps completed output collapsed and reveals the request and response on demand', () => {
    render(<MessageAcpTerminalOutput message={message('completed output')} />);

    expect(screen.getByTestId('terminal-card-command')).toHaveTextContent('git status');
    expect(screen.getByTestId('terminal-card-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('terminal-card-output')).toBeNull();
    expect(screen.queryByTestId('terminal-card-preview')).toBeNull();

    fireEvent.click(screen.getByTestId('terminal-card-toggle'));
    expect(screen.getByTestId('terminal-card-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('terminal-card-request')).toHaveTextContent('git status');
    expect(screen.getByTestId('terminal-card-response')).toHaveTextContent('completed output');

    fireEvent.click(screen.getByTestId('terminal-card-toggle'));
    expect(screen.queryByTestId('terminal-card-output')).toBeNull();
  });

  it('uses icon-only actions and keeps the terminal action at the far right', () => {
    render(<MessageAcpTerminalOutput message={message('running', true)} />);

    const stop = screen.getByTestId('terminal-card-stop');
    const open = screen.getByTestId('terminal-open-workbench');
    expect(stop).toHaveAttribute('aria-label', 'Stop');
    expect(stop).toHaveStyle({ color: 'var(--danger-emphasis)' });
    expect(stop.className).toContain('items-center');
    expect(stop).not.toHaveTextContent('Stop');
    expect(stop.querySelector('span[aria-hidden="true"]')).toHaveClass('size-10px', 'bg-current');
    expect(open).toHaveAttribute('aria-label', 'Terminal');
    expect(open.className).toContain('items-center');
    expect(open).not.toHaveTextContent('Terminal');
    expect(open.querySelector('svg')).not.toBeNull();

    const actions = open.parentElement?.querySelectorAll(
      '[data-testid="terminal-card-stop"], [data-testid="terminal-open-workbench"]'
    );
    expect(Array.from(actions ?? []).map((element) => element.getAttribute('data-testid'))).toEqual([
      'terminal-card-stop',
      'terminal-open-workbench',
    ]);
  });

  it('shows only the last three output lines while running', () => {
    render(<MessageAcpTerminalOutput message={message('first\nsecond\nthird\nfourth\n', true)} />);

    expect(screen.getByTestId('terminal-card-preview').textContent).toBe('second\nthird\nfourth');
    expect(screen.getByTestId('terminal-card-preview')).not.toHaveTextContent('first');
    expect(screen.queryByTestId('terminal-card-output')).toBeNull();
    expect(screen.getByTestId('terminal-card-stop')).toBeInTheDocument();
  });
});
