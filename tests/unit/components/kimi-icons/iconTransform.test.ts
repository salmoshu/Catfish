import { describe, expect, it } from 'vitest';
import { iconParkPlugin } from '../../../../packages/desktop/electron.vite.config';

describe('Kimi icon transform', () => {
  it('passes component names to the icon wrapper', () => {
    const plugin = iconParkPlugin();
    const source = `import React from 'react';\nimport { Plus, CloseSmall } from '@icon-park/react';\nexport const icons = () => <><Plus /><CloseSmall /></>;`;
    const result = plugin.transform(source, '/workspace/Icons.tsx');

    expect(result).not.toBeNull();
    expect(result?.code).toContain('Plus as _Plus');
    expect(result?.code).toContain("IconParkHOC(_Plus, 'Plus')");
    expect(result?.code).toContain("IconParkHOC(_CloseSmall, 'CloseSmall')");
  });

  it('leaves dependencies and unrelated modules unchanged', () => {
    const plugin = iconParkPlugin();
    const source = `import { Plus } from '@icon-park/react';`;

    expect(plugin.transform(source, '/workspace/node_modules/library/Icons.tsx')).toBeNull();
    expect(plugin.transform('export const value = 1;', '/workspace/value.ts')).toBeNull();
    expect(plugin.transform('export const value = 1;', '/workspace/value.tsx')).toBeNull();
  });
});
