import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scheme = readFileSync(
  path.join(__dirname, '../../../packages/desktop/src/renderer/styles/themes/default-color-scheme.css'),
  'utf8'
);
const arcoOverrides = readFileSync(
  path.join(__dirname, '../../../packages/desktop/src/renderer/styles/arco-override.css'),
  'utf8'
);
const darkAt = scheme.indexOf("[data-color-scheme='default'][data-theme='dark']");
const light = scheme.slice(0, darkAt);
const dark = scheme.slice(darkAt);

const tokens = (source: string, names: string[]) =>
  Object.fromEntries(names.map((name) => [name, source.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]]));

describe('neutral application accents', () => {
  it('uses gray chat and interaction colors in both themes', () => {
    expect(darkAt).toBeGreaterThan(-1);
    expect(tokens(light, ['primary', 'brand', 'message-user-bg', 'message-tips-bg'])).toEqual({
      primary: '#525252',
      brand: '#525252',
      'message-user-bg': '#f5f5f5',
      'message-tips-bg': '#f5f5f5',
    });
    expect(tokens(dark, ['primary', 'brand', 'message-user-bg', 'message-tips-bg'])).toEqual({
      primary: '#d4d4d4',
      brand: '#d4d4d4',
      'message-user-bg': '#292929',
      'message-tips-bg': '#262626',
    });
    expect(scheme).not.toMatch(
      /--(?:primary|brand|message-user-bg|message-tips-bg):\s*#(?:1783ff|1a88ff|e8f3ff|1e2a38);/i
    );
  });

  it('keeps Arco accents neutral and preserves dark primary-button contrast', () => {
    expect(arcoOverrides).toContain('--arcoblue-6: 82, 82, 82;');
    expect(arcoOverrides).toContain('--arcoblue-6: 212, 212, 212;');
    expect(arcoOverrides).toContain("body[arco-theme='dark'] .arco-btn-primary:not(.arco-btn-disabled)");
    expect(arcoOverrides).toContain('color: var(--send-button-icon);');
  });
});
