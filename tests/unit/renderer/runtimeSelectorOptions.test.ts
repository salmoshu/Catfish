import { describe, expect, it } from 'vitest';
import {
  composeRuntimeSelectorLabel,
  formatThoughtLevelLabel,
  RUNTIME_SUBMENU_TRIGGER_PROPS,
} from '@/renderer/components/agent/runtimeSelectorOptions';

describe('thought level labels', () => {
  it('removes the provider Thinking prefix from compact labels', () => {
    expect(formatThoughtLevelLabel('Thinking Max')).toBe('Max');
    expect(formatThoughtLevelLabel('thinking high')).toBe('High');
    expect(formatThoughtLevelLabel('extra high')).toBe('Extra High');
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

describe('runtime selector submenu placement', () => {
  it('aligns the flyout bottom with the hovered row instead of its top', () => {
    expect(RUNTIME_SUBMENU_TRIGGER_PROPS.position).toBe('lb');
    expect(RUNTIME_SUBMENU_TRIGGER_PROPS.autoFitPosition).toBe(true);
  });
});
