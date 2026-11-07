import { ipcBridge } from '@/common';
import AionModal from '@/renderer/components/base/AionModal';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import type { PreviewTab } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import {
  canCopyAbsolutePath,
  previewTabPaths,
} from '@/renderer/pages/conversation/Preview/components/PreviewPanel/previewTabPaths';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ConversationFileTabs.module.css';

const ConversationFileTabs: React.FC<{ agentLabel?: string; agentIcon?: React.ReactNode }> = ({
  agentLabel,
  agentIcon,
}) => {
  const { t } = useTranslation();
  const { isOpen, tabs = [], activeTabId, openPreview, closePreview, closeTab, saveContent } = usePreviewContext();
  const [pendingClose, setPendingClose] = useState<PreviewTab | null>(null);
  const [saving, setSaving] = useState(false);

  const fileTabs = tabs.filter((tab) => !tab.metadata?.sideChat);
  if (fileTabs.length === 0) return null;

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

  const copyPath = async (tab: PreviewTab) => {
    const absolute = previewTabPaths(tab).absolute;
    if (!absolute || !canCopyAbsolutePath(absolute, isElectronDesktop())) return;
    try {
      if (absolute.kind === 'projectRef') {
        await ipcBridge.fs.copyAbsolutePath.invoke({
          pe_id: absolute.pe_id,
          relative_path: absolute.relative_path,
        });
      } else {
        await copyText(absolute.value);
      }
      Message.success(t('common.copySuccess'));
    } catch {
      Message.error(t('common.copyFailed'));
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
        {fileTabs.map((tab) => {
          const active = isOpen && activeTabId === tab.id;
          const absolute = previewTabPaths(tab).absolute;
          return (
            <Dropdown
              key={tab.id}
              trigger='contextMenu'
              position='bl'
              droplist={
                <Menu>
                  <Menu.Item
                    key='copy-path'
                    disabled={!canCopyAbsolutePath(absolute, isElectronDesktop())}
                    onClick={() => void copyPath(tab)}
                  >
                    {t('preview.copyPath')}
                  </Menu.Item>
                </Menu>
              }
            >
              <div
                className={classNames('conversation-file-tab conversation-file-tab--file', styles.fileTab, {
                  'conversation-file-tab--active': active,
                })}
              >
                <Button
                  type='text'
                  role='tab'
                  aria-selected={active}
                  className={classNames('conversation-file-tab__select', styles.select)}
                  title={tab.title}
                  onClick={() => openPreview(tab.content, tab.content_type, tab.metadata)}
                >
                  <span className={styles.label}>{tab.title}</span>
                  {tab.isDirty && <span className='conversation-file-tab__dirty' aria-hidden='true' />}
                </Button>
                <Button
                  type='text'
                  size='mini'
                  aria-label={t('preview.closeTabTitle')}
                  data-testid={`conversation-file-close-${tab.id}`}
                  className={classNames('conversation-file-tab__close', styles.close)}
                  icon={<Close size={12} />}
                  onClick={() => requestClose(tab)}
                />
              </div>
            </Dropdown>
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
