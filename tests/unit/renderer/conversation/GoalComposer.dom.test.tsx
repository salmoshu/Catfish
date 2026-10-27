import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildGoalCommand, GoalComposer } from '@/renderer/components/chat/GoalComposer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('GoalComposer', () => {
  it('builds a trimmed goal command with an optional completion criterion', () => {
    expect(buildGoalCommand('  Finish the UI  ', '  Tests pass  ')).toBe(
      '/goal Finish the UI\n\nCompletion criterion: Tests pass'
    );
    expect(buildGoalCommand('Finish the UI', '')).toBe('/goal Finish the UI');
  });

  it('clears the fields after a successful start', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<GoalComposer open starting={false} onCancel={vi.fn()} onStart={onStart} />);
    const [objective, criterion] = screen.getAllByRole('textbox');
    fireEvent.change(objective, { target: { value: 'Finish the UI' } });
    fireEvent.change(criterion, { target: { value: 'Tests pass' } });
    fireEvent.click(screen.getByTestId('goal-start'));

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('Finish the UI', 'Tests pass'));
    await waitFor(() => expect(objective).toHaveValue(''));
    expect(criterion).toHaveValue('');
  });

  it('keeps the fields when a start fails', async () => {
    const onStart = vi.fn().mockRejectedValue(new Error('busy'));
    render(<GoalComposer open starting={false} onCancel={vi.fn()} onStart={onStart} />);
    const [objective, criterion] = screen.getAllByRole('textbox');
    fireEvent.change(objective, { target: { value: 'Finish the UI' } });
    fireEvent.change(criterion, { target: { value: 'Tests pass' } });
    fireEvent.click(screen.getByTestId('goal-start'));

    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(objective).toHaveValue('Finish the UI');
    expect(criterion).toHaveValue('Tests pass');
  });
});
