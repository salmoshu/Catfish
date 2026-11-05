/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Fish, Right } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const MessageTurnWorkSummary: React.FC<{
  startedAt: number;
  endedAt: number;
  children: React.ReactNode;
}> = ({ startedAt, endedAt, children }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const durationMs = endedAt - startedAt;
  const hasDuration = startedAt > 0 && durationMs >= 0;

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const secondUnit = t('common.unit.second_short', { defaultValue: 's' });
    const minuteUnit = t('common.unit.minute_short', { defaultValue: 'm' });
    if (seconds < 60) return `${seconds}${secondUnit}`;
    return `${Math.floor(seconds / 60)}${minuteUnit} ${seconds % 60}${secondUnit}`;
  };

  const label = hasDuration
    ? t('messages.turnWork.summary', {
        duration: formatDuration(durationMs),
        defaultValue: 'Worked for {{duration}}',
      })
    : t('messages.turnWork.summaryNoDuration', { defaultValue: 'Work completed' });

  return (
    <div className='turn-work-summary min-w-0' data-testid='turn-work-summary'>
      <Button
        type='text'
        className='flex h-32px w-full items-center justify-start gap-6px px-0 text-left text-13px !text-t-secondary hover:!text-t-primary'
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <Fish
          theme='outline'
          size='16'
          fill='currentColor'
          className='shrink-0 text-t-tertiary'
          data-testid='turn-work-fish-icon'
        />
        <span className='min-w-0 truncate'>{label}</span>
        <Right
          theme='outline'
          size='12'
          fill='currentColor'
          className='shrink-0 transition-transform'
          style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
        />
      </Button>
      {expanded && <div data-testid='turn-work-summary-details'>{children}</div>}
    </div>
  );
};

export default MessageTurnWorkSummary;
