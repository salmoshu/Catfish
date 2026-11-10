/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */
import { Button } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@renderer/pages/conversation/explorer/currentProjectStore';
import { useWorkbenchPanelState } from '@renderer/pages/conversation/Workbench/workbenchPanelState';
import ConversationPlanBar from './ConversationPlanBar';
import styles from './ConversationPlanBar.module.css';

const PlanProgressIcon: React.FC = () => (
  <svg className='block' width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
    {[5, 12, 19].map((y) => (
      <g key={y}>
        <circle cx='7' cy={y} r='2.25' stroke='currentColor' strokeWidth='1.5' />
        <path d={`M11.5 ${y}H18`} stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      </g>
    ))}
  </svg>
);

/** Render the plan in its dock while retaining the conversation's message context. */
const ConversationPlanCard: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const projectId = useCurrentProject();
  const { state, toggle } = useWorkbenchPanelState(projectId, conversation_id);
  useEffect(() => {
    if (!state.planOpen || !state.workspaceOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') toggle('plan');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.planOpen, state.workspaceOpen, toggle]);
  const [slots, setSlots] = useState<{ trigger: Element | null; panel: Element | null }>({
    trigger: null,
    panel: null,
  });
  const floating = state.workspaceOpen || (!projectId && !slots.panel);
  useLayoutEffect(() => {
    const findSlots = () => {
      const trigger = document.querySelector(`[data-plan-card-slot="${conversation_id}"]`);
      const panel = document.querySelector(`[data-plan-panel-slot="${conversation_id}"]`);
      setSlots((current) => (current.trigger === trigger && current.panel === panel ? current : { trigger, panel }));
    };
    findSlots();
    const observer = new MutationObserver(findSlots);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [conversation_id]);

  return (
    <>
      {slots.trigger &&
        createPortal(
          <div className='flex items-center shrink-0 leading-none'>
            <Button
              type='text'
              size='mini'
              className='!inline-flex !items-center !justify-center h-28px w-28px !text-t-secondary hover:!text-t-primary hover:!bg-fill-2'
              aria-label={t('conversation.planBar.title')}
              aria-expanded={state.planOpen}
              onClick={() => toggle('plan')}
              icon={<PlanProgressIcon />}
            />
          </div>,
          slots.trigger
        )}
      {state.planOpen &&
        !floating &&
        slots.panel &&
        createPortal(<ConversationPlanBar conversation_id={conversation_id} variant='panel' />, slots.panel)}
      {state.planOpen &&
        floating &&
        createPortal(
          <div
            role='dialog'
            aria-label={t('conversation.planBar.title')}
            data-plan-presentation='floating'
            className={`${styles.floatingPlan} ${state.workspaceOpen ? styles.floatingPlanLeft : ''}`}
          >
            <Button
              type='text'
              size='mini'
              className={styles.closeFloating}
              aria-label={t('common.close')}
              icon={<Close size={14} />}
              onClick={() => toggle('plan')}
            />
            <ConversationPlanBar conversation_id={conversation_id} variant='panel' />
          </div>,
          document.body
        )}
    </>
  );
};

export default ConversationPlanCard;
