/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Checklist, CheckOne, Down, Up } from '@icon-park/react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import type { WorkbenchSection } from '@renderer/pages/conversation/Workbench/workbenchActivity';
import {
  openWorkbenchSection,
  WORKBENCH_OPEN_EVENT,
  WORKBENCH_SECTION_EVENT,
} from '@renderer/pages/conversation/Workbench/workbenchActivityStore';
import { WORKSPACE_STATE_EVENT } from '@renderer/utils/workspace/workspaceEvents';
import ConversationPlanBar from './ConversationPlanBar';
import { useLatestPlan } from './useLatestPlan';

const readWorkbenchPresentation = (): { collapsed: boolean; section: WorkbenchSection | null } => {
  if (typeof document === 'undefined') return { collapsed: true, section: null };
  const panel = document.querySelector<HTMLElement>('[data-project-panel-host]');
  const workbench = document.querySelector<HTMLElement>('[data-workbench]');
  return {
    collapsed: panel?.dataset.collapsed !== 'false',
    section: (workbench?.dataset.activeSection as WorkbenchSection | undefined) ?? null,
  };
};

/** The plan remains in its conversation context when portalled into the Workbench. */
const ConversationPlanCard: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>();
  const [presentation, setPresentation] = useState(readWorkbenchPresentation);
  const triggerRef = useRef<HTMLDivElement>(null);
  const plan = useLatestPlan();
  const { isProcessing, activeTurnId } = useConversationRuntimeView(conversation_id);
  const entries = useMemo(() => plan?.content.entries ?? [], [plan]);
  const completed = useMemo(() => entries.filter((entry) => entry.status === 'completed').length, [entries]);
  const planVisible = Boolean(
    plan && entries.length > 0 && isProcessing && (!plan.content.turn_id || plan.content.turn_id === activeTurnId)
  );
  const slot =
    typeof document === 'undefined' ? null : document.querySelector(`[data-plan-card-slot="${conversation_id}"]`);
  const panelSlot =
    presentation.section === 'plan' && !presentation.collapsed
      ? document.querySelector(`[data-plan-panel-slot="${conversation_id}"]`)
      : null;

  useEffect(() => {
    const syncPresentation = () => {
      const next = readWorkbenchPresentation();
      setPresentation(next);
      if (!next.collapsed) setOpen(false);
    };
    window.addEventListener(WORKBENCH_OPEN_EVENT, syncPresentation);
    window.addEventListener(WORKBENCH_SECTION_EVENT, syncPresentation);
    window.addEventListener(WORKSPACE_STATE_EVENT, syncPresentation);
    return () => {
      window.removeEventListener(WORKBENCH_OPEN_EVENT, syncPresentation);
      window.removeEventListener(WORKBENCH_SECTION_EVENT, syncPresentation);
      window.removeEventListener(WORKSPACE_STATE_EVENT, syncPresentation);
    };
  }, []);

  useEffect(() => {
    if (!planVisible && presentation.section === 'plan' && !presentation.collapsed) {
      openWorkbenchSection('files');
    }
  }, [planVisible, presentation]);

  useLayoutEffect(() => {
    if (!open || !slot) return;
    const panel = document.querySelector<HTMLElement>('[data-project-panel-host][data-collapsed="false"]');
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(340, window.innerWidth - 32);
      const panelRect = panel?.getBoundingClientRect();
      const left = panelRect && panelRect.width > 0 ? panelRect.left - width - 16 : window.innerWidth - width - 16;
      const top = Math.min(trigger.bottom + 8, Math.max(16, window.innerHeight - 120));
      setPopupStyle({
        position: 'fixed',
        boxSizing: 'border-box',
        top,
        left: Math.max(16, left),
        width,
        maxHeight: `calc(100vh - ${Math.ceil(top + 16)}px)`,
        overflowY: 'auto',
      });
    };
    updatePosition();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (panel) observer?.observe(panel);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, slot]);

  if (!slot || !planVisible) return null;

  const visibleEntries = showAll ? entries : entries.slice(0, 3);
  return createPortal(
    <div ref={triggerRef} className='inline-flex shrink-0'>
      <Button
        type='text'
        size='mini'
        className='h-28px w-28px !text-t-secondary hover:!text-t-primary hover:!bg-fill-2'
        aria-label={t('conversation.planBar.title')}
        aria-expanded={open || Boolean(panelSlot)}
        onClick={() => {
          const current = readWorkbenchPresentation();
          if (current.section === 'plan' && !current.collapsed) {
            openWorkbenchSection('files');
          } else if (current.collapsed && current.section !== null) {
            setOpen(false);
            openWorkbenchSection('plan');
          } else {
            setOpen((value) => !value);
          }
        }}
        icon={<Checklist theme='outline' size='16' fill='currentColor' />}
      />
      {panelSlot && createPortal(<ConversationPlanBar conversation_id={conversation_id} variant='panel' />, panelSlot)}
      {open &&
        createPortal(
          <div
            role='dialog'
            data-testid='conversation-plan-popup'
            aria-label={t('conversation.planBar.title')}
            style={popupStyle}
            className='z-70 rounded-16px border border-[var(--color-border-2)] bg-[var(--color-bg-popup)] p-16px shadow-lg'
          >
            <div className='mb-14px flex items-center gap-8px text-14px font-medium text-t-primary'>
              <span>{t('conversation.planBar.title')}</span>
              <span className='text-12px font-normal text-t-tertiary'>
                {t('conversation.planBar.progress', { completed, total: entries.length })}
              </span>
            </div>
            <div className='flex flex-col gap-14px'>
              {visibleEntries.map((entry, index) => (
                <div key={`${index}-${entry.content}`} className='flex items-start gap-10px text-13px leading-20px'>
                  {entry.status === 'completed' ? (
                    <CheckOne theme='filled' size='17' className='mt-2px shrink-0 text-t-primary' />
                  ) : (
                    <span className='mt-5px size-12px shrink-0 rounded-full border-2 border-solid border-[var(--color-border-2)]' />
                  )}
                  <span className={entry.status === 'completed' ? 'text-t-tertiary line-through' : 'text-t-primary'}>
                    {entry.content}
                  </span>
                </div>
              ))}
            </div>
            {entries.length > 3 && (
              <Button
                type='text'
                size='mini'
                className='mt-14px !px-0 !text-12px !text-t-secondary hover:!text-t-primary'
                onClick={() => setShowAll((value) => !value)}
                icon={showAll ? <Up size='12' /> : <Down size='12' />}
              >
                {showAll ? t('conversation.planBar.collapse') : t('conversation.planBar.expand')}
              </Button>
            )}
          </div>,
          document.body
        )}
    </div>,
    slot
  );
};

export default ConversationPlanCard;
