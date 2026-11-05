import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  join(__dirname, '../../../packages/desktop/src/renderer/pages/conversation/Workbench/workbench.css'),
  'utf8'
);

describe('Workbench activity layout', () => {
  it('scrolls the activity list without shrinking terminal cards', () => {
    expect(stylesheet).toMatch(/\.workbench-activity-list\s*{[^}]*min-height: 0;[^}]*flex: 1;[^}]*overflow-y: auto;/s);
    expect(stylesheet).toMatch(/\.workbench-activity-list > \*\s*{[^}]*flex: 0 0 auto;/s);
  });
});
