import AionModal from '@/renderer/components/base/AionModal';
import { usePreviewContext, type PreviewTab } from '@/renderer/pages/conversation/Preview';
import { Button, Message } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ConversationFileTabs: React.FC<{ agentLabel?: string; agentIcon?: React.ReactNode }> = ({
  agentLabel,
  agentIcon,
}) => {
  const { t } = useTranslation();
  const { isOpen, tabs = [], activeTabId, openPreview, closePreview, closeTab, saveContent } = usePreviewContext();
  const [pendingClose, setPendingClose] = useState<PreviewTab | null>(null);
  const [saving, setSaving] = useState(false);

  if (tabs.length === 0) return null;

  const requestClose = (tab: PreviewTab) => {
    if (tab.isDirty) {
      setPendingClose(tab);
      return;
    }
    closeTab(tab.id);
  };

  const finishClose = () => {
    if (!pendingClose) return;
    closeTab(pendingClose.id);
    setPendingClose(null);
  };

  const saveAndClose = async () => {
    if (!pendingClose) return;
    setSaving(true);
    try {
      const saved = await saveContent(pendingClose.id);
      if (!saved) {
        Message.error(t('common.saveFailed'));
        return;
      }
      finishClose();
    } catch {
      Message.error(t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className='conversation-file-tabs'
        role='tablist'
        aria-label={t('conversation.fileTabs.label')}
        data-testid='conversation-file-tabs'
      >
        <Button
          type='text'
          role='tab'
          aria-selected={!isOpen}
          data-testid='conversation-agent-tab'
          className={classNames('conversation-file-tab conversation-file-tab--agent', {
            'conversation-file-tab--active': !isOpen,
          })}
          onClick={closePreview}
        >
          {agentIcon}
          <span className='truncate'>{agentLabel || t('conversation.fileTabs.agent')}</span>
        </Button>
        {tabs.map((tab) => {
          const active = isOpen && activeTabId === tab.id;
          return (
            <div
              key={tab.id}
              className={classNames('conversation-file-tab conversation-file-tab--file', {
                'conversation-file-tab--active': active,
              })}
            >
              <Button
                type='text'
                role='tab'
                aria-selected={active}
                className='conversation-file-tab__select'
                title={tab.title}
                onClick={() => openPreview(tab.content, tab.content_type, tab.metadata)}
              >
                <span className='truncate'>{tab.title}</span>
                {tab.isDirty && <span className='conversation-file-tab__dirty' aria-hidden='true' />}
              </Button>
              <Button
                type='text'
                size='mini'
                aria-label={t('preview.closeTabTitle')}
                data-testid={`conversation-file-close-${tab.id}`}
                className='conversation-file-tab__close'
                icon={<Close size={12} />}
                onClick={() => requestClose(tab)}
              />
            </div>
          );
        })}
      </div>
      <AionModal
        visible={pendingClose !== null}
        style={{ width: '400px' }}
        header={{ title: t('preview.closeTabTitle'), showClose: true }}
        onCancel={() => setPendingClose(null)}
        footer={
          <div className='flex justify-end gap-8px'>
            <Button onClick={() => setPendingClose(null)}>{t('common.cancel')}</Button>
            <Button onClick={finishClose}>{t('preview.closeWithoutSave')}</Button>
            <Button type='primary' loading={saving} onClick={() => void saveAndClose()}>
              {t('preview.saveAndClose')}
            </Button>
          </div>
        }
      >
        {t('preview.closeTabMessage')}
      </AionModal>
    </>
  );
};

export default ConversationFileTabs;
