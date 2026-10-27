/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge, Button } from '@arco-design/web-react';
import { CheckOne, Down, Right } from '@icon-park/react';
import { getChatSurfaceWidthClass } from '@renderer/pages/conversation/utils/chatSurfaceWidth';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestPlan } from './useLatestPlan';
import styles from './ConversationPlanBar.module.css';

const ConversationPlanBar: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const plan = useLatestPlan();
  const { isProcessing, activeTurnId } = useConversationRuntimeView(conversation_id);

  const entries = useMemo(() => plan?.content.entries ?? [], [plan]);
  const completed = useMemo(() => entries.filter((entry) => entry.status === 'completed').length, [entries]);

  if (!plan || !entries.length || !isProcessing) return null;
  if (plan.content.turn_id && plan.content.turn_id !== activeTurnId) return null;

  return (
    <div data-testid='conversation-plan-bar' className={`${getChatSurfaceWidthClass()} ${styles.planBar}`}>
      <Button
        type='text'
        className={styles.header}
        aria-expanded={expanded}
        aria-label={expanded ? t('conversation.planBar.collapse') : t('conversation.planBar.expand')}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <Down size={14} /> : <Right size={14} />}
        <Badge status='default' text={t('conversation.planBar.title')} />
        <span className='text-12px'>{t('conversation.planBar.progress', { completed, total: entries.length })}</span>
      </Button>
      {expanded && (
        <div
          className='flex flex-col gap-6px pt-6px pl-30px pr-8px overflow-y-auto overscroll-contain'
          style={{ maxHeight: 'min(22vh, 180px)' }}
        >
          {entries.map((entry, index) => (
            <div key={`${index}-${entry.content}`} className={styles.step}>
              {entry.status === 'completed' ? (
                <CheckOne size={16} theme='filled' className='flex text-success shrink-0' />
              ) : (
                <div className='size-14px rd-full b-2px b-solid border-3 shrink-0' />
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
      )}
    </div>
  );
};

export default ConversationPlanBar;
