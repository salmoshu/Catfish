/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageToolGroup } from '@/common/chat/chatLib';
import MessageToolGroup from '@/renderer/pages/conversation/Messages/components/MessageToolGroup';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ theme: 'light' }) }));

const message = {
  id: 'tool-message',
  conversation_id: 'conversation-1',
  type: 'tool_group',
  content: [
    {
      call_id: 'call-1',
      name: 'ReadFile',
      description: 'Reading project files',
      status: 'Success',
      result_display: 'file contents',
    },
  ],
} as unknown as IMessageToolGroup;

describe('MessageToolGroup step presentation', () => {
  it('uses expandable step rows and reveals details only on request', () => {
    render(<MessageToolGroup message={message} isProcessing={false} />);

    const step = screen.getByRole('button', { name: /ReadFile/ });
    expect(step).toHaveClass('tool-row__button');
    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('file contents')).not.toBeInTheDocument();

    fireEvent.click(step);
    expect(step).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('file contents')).toBeInTheDocument();

    fireEvent.click(step);
    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('file contents')).not.toBeInTheDocument();
  });

  it('leaves space at both ends of the connector line between steps', () => {
    const stylesheet = readFileSync(
      join(
        __dirname,
        '../../../packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.css'
      ),
      'utf8'
    );
    expect(stylesheet).toMatch(/\.tool-row::before\s*{[^}]*top: 28px;[^}]*bottom: 8px;/s);
    expect(stylesheet).toMatch(/\.tool-row:last-child::before\s*{[^}]*bottom: 8px;/s);
  });
});
