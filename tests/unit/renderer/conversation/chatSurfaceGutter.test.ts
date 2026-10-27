/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAT_SURFACE_WIDTH_CLASS,
  getChatSurfaceWidthClass,
} from '@/renderer/pages/conversation/utils/chatSurfaceWidth';

const css = readFileSync(
  join(__dirname, '../../../../packages/desktop/src/renderer/pages/conversation/Messages/messages.css'),
  'utf8'
);

const surfaceRule = css.match(/\.chat-surface-fluid\s*{([^}]*)}/)?.[1] ?? '';

describe('chat surface width class', () => {
  it('is the same for team and standalone conversations', () => {
    expect(getChatSurfaceWidthClass()).toBe(CHAT_SURFACE_WIDTH_CLASS);
  });

  it('is full width by default, so a narrow column is never indented', () => {
    expect(surfaceRule).toMatch(/width:\s*100%/);
    expect(surfaceRule).not.toMatch(/calc\(/);
  });

  it('caps the conversation and composer at the shared 800px content width', () => {
    expect(surfaceRule).toMatch(/max-width:\s*800px/);
    expect(surfaceRule).toMatch(/margin-inline-start:\s*auto/);
    expect(surfaceRule).toMatch(/margin-inline-end:\s*auto/);
  });

  it('keeps the chat container as the layout measurement boundary', () => {
    expect(css).toMatch(/\.chat-surface-container\s*{[^}]*container-type:\s*inline-size/);
  });
});
