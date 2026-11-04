/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('composer text clipping regressions', () => {
  it('reserves enough single-line height for glyph descenders', () => {
    const source = readFileSync('packages/desktop/src/renderer/components/chat/SendBox/index.tsx', 'utf8');

    expect(source).toContain("height: isSingleLine ? '24px' : 'auto'");
    expect(source).toContain("minHeight: isSingleLine ? '24px' : '40px'");
    expect(source).not.toContain("height: isSingleLine ? (isMobile ? '22px' : '20px') : 'auto'");
  });

  it('uses relaxed line-height for selector labels instead of clipping leading-none', () => {
    const source = readFileSync('packages/desktop/src/renderer/components/agent/MarqueePillLabel.tsx', 'utf8');

    expect(source).toContain('leading-[1.4]');
    expect(source).not.toContain('leading-none');
  });
});
