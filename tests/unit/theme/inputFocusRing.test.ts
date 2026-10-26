import { describe, expect, it } from 'vitest';
import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';

describe('useInputFocusRing', () => {
  it('uses theme-aware brand tokens for input focus and resting borders', () => {
    expect(useInputFocusRing()).toEqual({
      activeBorderColor: 'var(--input-focus-border)',
      inactiveBorderColor: 'var(--border-base)',
      activeShadow: 'var(--input-focus-shadow)',
    });
  });
});
