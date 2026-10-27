import { Button, Input } from '@arco-design/web-react';
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GoalComposer.module.css';

export const buildGoalCommand = (objective: string, completionCriterion: string): string => {
  const normalizedObjective = objective.trim();
  const normalizedCriterion = completionCriterion.trim();
  return `/goal ${normalizedObjective}${normalizedCriterion ? `\n\nCompletion criterion: ${normalizedCriterion}` : ''}`;
};

type GoalComposerProps = {
  open: boolean;
  starting: boolean;
  onCancel: () => void;
  onStart: (objective: string, completionCriterion: string) => Promise<void>;
};

export const GoalComposer: React.FC<GoalComposerProps> = ({ open, starting, onCancel, onStart }) => {
  const { t } = useTranslation();
  const [objective, setObjective] = useState('');
  const [completionCriterion, setCompletionCriterion] = useState('');
  const objectiveId = useId();
  const criterionId = useId();

  if (!open) return null;

  const start = (): void => {
    if (!objective.trim() || starting) return;
    void onStart(objective, completionCriterion)
      .then(() => {
        setObjective('');
        setCompletionCriterion('');
      })
      .catch((): void => undefined);
  };

  return (
    <div className={styles.goal} data-testid='goal-composer'>
      <div className={styles.field}>
        <label htmlFor={objectiveId}>{t('messages.goal.objective', { defaultValue: 'Objective' })}</label>
        <Input.TextArea
          id={objectiveId}
          value={objective}
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder={t('messages.goal.objectivePlaceholder', { defaultValue: 'What should the agent accomplish?' })}
          onChange={setObjective}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={criterionId}>
          {t('messages.goal.completionCriterion', { defaultValue: 'Completion criterion' })}
        </label>
        <Input.TextArea
          id={criterionId}
          value={completionCriterion}
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder={t('messages.goal.completionPlaceholder', {
            defaultValue: 'How will you know the goal is complete?',
          })}
          onChange={setCompletionCriterion}
        />
      </div>
      <div className={styles.actions}>
        <Button type='text' size='small' disabled={starting} onClick={onCancel}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button
          type='primary'
          size='small'
          loading={starting}
          disabled={!objective.trim()}
          onClick={start}
          data-testid='goal-start'
        >
          {t('messages.goal.start', { defaultValue: 'Start goal' })}
        </Button>
      </div>
    </div>
  );
};
