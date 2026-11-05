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

  it('keeps project-name descenders visible in the collapsed workspace selector', () => {
    const source = readFileSync('packages/desktop/src/renderer/pages/guid/index.module.css', 'utf8');
    expect(source).toMatch(/\.workspacePillMain\s*{[^}]*line-height: 1\.4;/s);
    expect(source).toMatch(/\.workspacePillName\s*{[^}]*line-height: 1\.4;/s);
  });

  it('ellipsizes overflowing selector text on every platform and exposes the full label', () => {
    const label = readFileSync('packages/desktop/src/renderer/components/agent/MarqueePillLabel.tsx', 'utf8');
    const pill = readFileSync('packages/desktop/src/renderer/components/agent/RuntimeSelectorPill.tsx', 'utf8');

    expect(label).toContain("active ? 'leading-[1.4] invisible' : 'leading-[1.4] block overflow-hidden text-ellipsis'");
    expect(label).toContain('title={children}');
    expect(pill).toContain('title={label}');
    expect(pill).toContain('aria-label={label}');
  });
});
