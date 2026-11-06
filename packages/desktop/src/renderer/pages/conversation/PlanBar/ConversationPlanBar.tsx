/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge } from '@arco-design/web-react';
import { getChatSurfaceWidthClass } from '@renderer/pages/conversation/utils/chatSurfaceWidth';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestPlan } from './useLatestPlan';
import PlanStepIcon from './PlanStepIcon';
import styles from './ConversationPlanBar.module.css';

const ConversationPlanBar: React.FC<{
  conversation_id: string;
  variant?: 'composer' | 'panel';
}> = ({ conversation_id, variant = 'composer' }) => {
  const { t } = useTranslation();
  const plan = useLatestPlan();
  const { isProcessing } = useConversationRuntimeView(conversation_id);

  const entries = useMemo(() => plan?.content.entries ?? [], [plan]);
  const completed = useMemo(() => entries.filter((entry) => entry.status === 'completed').length, [entries]);

  return (
    <div
      data-testid='conversation-plan-bar'
      data-variant={variant}
      className={variant === 'panel' ? styles.planPanel : `${getChatSurfaceWidthClass()} ${styles.planBar}`}
    >
      <div className={styles.header}>
        <Badge status='default' text={t('conversation.planBar.title')} />
        {entries.length > 0 && (
          <span className='text-12px'>{t('conversation.planBar.progress', { completed, total: entries.length })}</span>
        )}
      </div>
      <div
        className={`flex flex-col gap-6px overflow-y-auto overscroll-contain ${variant === 'panel' ? 'flex-1 min-h-0' : ''}`}
        style={variant === 'panel' ? undefined : { maxHeight: 'min(22vh, 180px)' }}
      >
        {plan?.content.explanation && (
          <p className='px-8px text-13px leading-20px text-t-secondary whitespace-pre-wrap break-words'>
            {plan.content.explanation}
          </p>
        )}
        {entries.length > 0 ? (
          <div className='flex flex-col gap-6px pt-6px pl-30px pr-8px'>
            {entries.map((entry, index) => (
              <div
                key={`${index}-${entry.content}`}
                className={styles.step}
                data-status={entry.status}
                aria-current={entry.status === 'in_progress' ? 'step' : undefined}
              >
                <PlanStepIcon status={entry.status} processing={isProcessing} />
                {entry.priority === 'high' && (
                  <span className='text-11px text-t-tertiary shrink-0'>{t('conversation.planBar.priorityHigh')}</span>
                )}
                <span
                  className={
                    entry.status === 'completed'
                      ? styles.stepCompleted
                      : entry.status === 'in_progress'
                        ? styles.stepActive
                        : undefined
                  }
                >
                  {entry.content}
                </span>
              </div>
            ))}
          </div>
        ) : !plan?.content.explanation ? (
          <div className={styles.empty}>{t('conversation.planBar.empty')}</div>
        ) : null}
      </div>
    </div>
  );
};

export default ConversationPlanBar;
