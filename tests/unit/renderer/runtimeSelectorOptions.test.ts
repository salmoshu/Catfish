import { describe, expect, it } from 'vitest';
import {
  composeRuntimeSelectorLabel,
  formatThoughtLevelLabel,
} from '@/renderer/components/agent/runtimeSelectorOptions';

describe('thought level labels', () => {
  it('removes the provider Thinking prefix from compact labels', () => {
    expect(formatThoughtLevelLabel('Thinking Max')).toBe('Max');
    expect(formatThoughtLevelLabel('thinking high')).toBe('high');
    expect(formatThoughtLevelLabel('Max')).toBe('Max');
  });

  it('uses the shortened label in the model selector pill', () => {
    expect(
      composeRuntimeSelectorLabel({
        modelLabel: 'K3.1 Pro',
        thoughtLevel: {
          id: 'thought_level',
          category: 'thought_level',
          currentValue: 'max',
          options: [{ value: 'max', label: 'Thinking Max' }],
        },
      })
    ).toBe('K3.1 Pro · Max');
  });
});
