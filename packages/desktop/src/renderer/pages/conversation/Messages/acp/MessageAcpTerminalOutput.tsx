/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageAcpTerminalOutput } from '@/common/chat/chatLib';
import { Button, Card, Tag } from '@arco-design/web-react';
import { Down, Right, Terminal } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openWorkbenchSection } from '../../Workbench/workbenchActivityStore';

/**
 * Live card for a client-hosted terminal (ACP terminal/*): the delegated
 * command runs in OUR process tree, so output streams in real time and the
 * stop button kills just this command — the agent observes the signal exit
 * and the turn continues.
 */
const MessageAcpTerminalOutput: React.FC<{ message: IMessageAcpTerminalOutput }> = ({ message }) => {
  const { t } = useTranslation();
  const { content, conversation_id } = message;
  const outputRef = useRef<HTMLPreElement>(null);
  const [killing, setKilling] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const running = !content?.exit_status;

  useEffect(() => {
    const el = outputRef.current;
    if (el && running && expanded) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content?.output, expanded, running]);

  const handleStop = useCallback(async () => {
    if (!conversation_id || !content?.terminal_id) return;
    setKilling(true);
    try {
      await ipcBridge.conversation.killTerminal.invoke({
        conversation_id,
        terminal_id: content.terminal_id,
      });
    } catch (error) {
      console.error('[MessageAcpTerminalOutput] kill failed:', error);
      setKilling(false);
    }
  }, [conversation_id, content?.terminal_id]);

  if (!content?.terminal_id) {
    return null;
  }

  const exit = content.exit_status;
  const statusTag = running ? (
    <Tag color='arcoblue' size='small' data-testid='terminal-card-status'>
      {t('conversation.terminal.running', { defaultValue: 'Running' })}
    </Tag>
  ) : exit?.signaled ? (
    <Tag color='orange' size='small' data-testid='terminal-card-status'>
      {t('conversation.terminal.stopped', { defaultValue: 'Stopped' })}
    </Tag>
  ) : (
    <Tag color={exit?.exit_code === 0 ? 'green' : 'red'} size='small' data-testid='terminal-card-status'>
      {t('conversation.terminal.exited', { defaultValue: 'Exit {{code}}', code: exit?.exit_code ?? '?' })}
    </Tag>
  );
  const preview = running ? content.output?.trimEnd().split(/\r?\n/).slice(-3).join('\n') : '';

  return (
    <Card className='w-full mb-8px overflow-hidden' size='small' bordered>
      <div className='flex items-center gap-8px min-w-0'>
        <Button
          type='text'
          size='mini'
          className='!inline-flex flex-1 min-w-0 !items-center justify-start gap-6px !px-0 !text-start'
          aria-expanded={expanded}
          aria-label={content.command}
          data-testid='terminal-card-toggle'
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <Down size='14' className='shrink-0 inline-flex items-center justify-center' />
          ) : (
            <Right size='14' className='shrink-0 inline-flex items-center justify-center' />
          )}
          <code
            dir='ltr'
            className='min-w-0 truncate font-mono text-13px text-t-primary'
            data-testid='terminal-card-command'
          >
            $ {content.command}
          </code>
        </Button>
        {statusTag}
        {running && (
          <Button
            type='text'
            size='mini'
            className='shrink-0 !inline-flex !items-center !justify-center'
            style={{ color: 'var(--danger-emphasis)' }}
            aria-label={t('conversation.terminal.stop', { defaultValue: 'Stop' })}
            title={t('conversation.terminal.stop', { defaultValue: 'Stop' })}
            loading={killing}
            onClick={handleStop}
            data-testid='terminal-card-stop'
            icon={<span aria-hidden='true' className='block size-10px rounded-1px bg-current' />}
          />
        )}
        <Button
          type='text'
          size='mini'
          className='shrink-0 !inline-flex !items-center !justify-center !text-t-secondary'
          aria-label={t('messages.workbench.terminal', { defaultValue: 'Terminal' })}
          title={t('messages.workbench.terminal', { defaultValue: 'Terminal' })}
          data-testid='terminal-open-workbench'
          onClick={() => openWorkbenchSection('terminal')}
          icon={<Terminal size='16' />}
        />
      </div>
      {preview && !expanded && (
        <pre
          data-testid='terminal-card-preview'
          dir='ltr'
          className='m-0 mt-8px max-h-72px overflow-hidden whitespace-pre-wrap rounded-6px bg-1 p-8px font-mono text-12px leading-18px text-t-secondary'
        >
          {preview}
        </pre>
      )}
      {expanded && (
        <div className='mt-12px flex flex-col gap-12px' data-testid='terminal-card-details'>
          <section>
            <div className='mb-6px text-12px font-medium text-t-secondary'>{t('messages.toolGroup.input')}</div>
            <pre
              dir='ltr'
              data-testid='terminal-card-request'
              className='m-0 overflow-x-auto whitespace-pre-wrap rounded-6px bg-1 p-8px font-mono text-12px leading-18px'
            >
              {content.command}
            </pre>
          </section>
          <section data-testid='terminal-card-response'>
            <div className='mb-6px text-12px font-medium text-t-secondary'>{t('messages.toolGroup.output')}</div>
            <pre
              ref={outputRef}
              data-testid='terminal-card-output'
              dir='ltr'
              className='m-0 max-h-320px overflow-auto whitespace-pre-wrap rounded-6px bg-1 p-8px font-mono text-12px leading-18px'
            >
              {content.truncated
                ? `…${t('conversation.terminal.truncated', { defaultValue: '(earlier output truncated)' })}\n`
                : ''}
              {content.output || ''}
            </pre>
          </section>
        </div>
      )}
    </Card>
  );
};

export default MessageAcpTerminalOutput;
