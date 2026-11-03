import { describe, expect, it } from 'vitest';
import { sanitizeTabsForPersistence } from '@/renderer/pages/conversation/Preview/context/PreviewContext';

describe('temporary preview tabs', () => {
  it('does not persist temporary side-chat tabs', () => {
    const tabs = [
      {
        id: 'chat',
        title: 'Side Chat',
        content: '',
        content_type: 'markdown',
        metadata: { transient: true, sideChat: true },
      },
      { id: 'doc', title: 'Document', content: 'text', content_type: 'markdown', metadata: {} },
    ] as const;
    expect(sanitizeTabsForPersistence([...tabs]).map((tab) => tab.id)).toEqual(['doc']);
  });
});
