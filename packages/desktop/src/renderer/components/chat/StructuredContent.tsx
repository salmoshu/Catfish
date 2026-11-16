/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import { Link } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export const parseStructuredValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null ? parsed : value;
  } catch {
    return value;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const FIELD_LABELS = {
  filepath: 'filePath',
  filename: 'fileName',
  path: 'path',
  description: 'description',
  cwd: 'workingDirectory',
  workdir: 'workingDirectory',
  workingdirectory: 'workingDirectory',
  pattern: 'pattern',
  query: 'query',
  url: 'url',
  timeout: 'timeout',
  timeoutms: 'timeout',
  exitcode: 'exitCode',
  status: 'status',
  output: 'output',
  content: 'content',
} as const;

const fallbackFieldLabel = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

const textBlock = (value: string, className = '') => (
  <pre
    className={`m-0 max-h-240px overflow-auto whitespace-pre-wrap break-words rounded-6px bg-fill-1 px-8px py-6px font-mono text-12px leading-18px ${className}`}
  >
    {value}
  </pre>
);

const StructuredContent: React.FC<{ value: unknown }> = ({ value: input }) => {
  const { t } = useTranslation();
  const value = parseStructuredValue(input);
  const fieldLabel = (key: string): string => {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    const field = Object.hasOwn(FIELD_LABELS, normalized)
      ? FIELD_LABELS[normalized as keyof typeof FIELD_LABELS]
      : undefined;
    return field
      ? t(`messages.structured.fields.${field}`, { defaultValue: fallbackFieldLabel(key) })
      : fallbackFieldLabel(key);
  };

  const renderScalar = (scalar: string | number | boolean): React.ReactNode => {
    if (typeof scalar === 'string' && /^https?:\/\/\S+$/.test(scalar)) {
      return (
        <Link href={scalar} target='_blank' rel='noreferrer' className='break-all'>
          {scalar}
        </Link>
      );
    }
    if (typeof scalar === 'string' && /[\n\r]/.test(scalar)) return textBlock(scalar);
    return <span className='[overflow-wrap:anywhere]'>{String(scalar)}</span>;
  };

  const renderValue = (current: unknown, depth: number): React.ReactNode => {
    if (current === null || current === undefined || current === '') {
      return <span className='text-t-tertiary'>—</span>;
    }
    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      return renderScalar(current);
    }
    if (Array.isArray(current)) {
      if (current.length === 0) return <span className='text-t-tertiary'>—</span>;
      return (
        <div className='flex min-w-0 flex-col gap-6px'>
          {current.map((item, index) => (
            <div key={index} className='flex min-w-0 items-start gap-8px'>
              <span className='flex size-20px shrink-0 items-center justify-center rounded-full bg-fill-2 text-11px text-t-secondary'>
                {index + 1}
              </span>
              <div className='min-w-0 flex-1'>{renderValue(item, depth + 1)}</div>
            </div>
          ))}
        </div>
      );
    }
    if (!isRecord(current)) return renderScalar(String(current));

    const entries = Object.entries(current);
    if (entries.length === 0) return <span className='text-t-tertiary'>—</span>;
    const command =
      typeof current.command === 'string' ? current.command : typeof current.cmd === 'string' ? current.cmd : undefined;
    const oldValue = current.old_string ?? current.old_text;
    const newValue = current.new_string ?? current.new_text;
    const hasEditPair = typeof oldValue === 'string' || typeof newValue === 'string';
    const consumedKeys = new Set([
      ...(command !== undefined ? [typeof current.command === 'string' ? 'command' : 'cmd'] : []),
      ...(hasEditPair ? ['old_string', 'old_text', 'new_string', 'new_text'] : []),
    ]);

    return (
      <div className='flex min-w-0 flex-col gap-6px'>
        {command !== undefined && (
          <div className='flex min-w-0 items-start gap-8px rounded-7px bg-fill-1 px-10px py-8px font-mono text-12px leading-18px'>
            <span aria-hidden='true' className='shrink-0 select-none text-t-tertiary'>
              $
            </span>
            <code className='min-w-0 whitespace-pre-wrap break-words text-t-primary'>{command}</code>
          </div>
        )}
        {hasEditPair && (
          <div className='flex min-w-0 flex-col gap-8px'>
            <div>
              <div className='mb-4px text-11px font-medium text-t-secondary'>
                {t('messages.structured.before', { defaultValue: 'Before' })}
              </div>
              {textBlock(typeof oldValue === 'string' ? oldValue : '')}
            </div>
            <div>
              <div className='mb-4px text-11px font-medium text-t-secondary'>
                {t('messages.structured.after', { defaultValue: 'After' })}
              </div>
              {textBlock(typeof newValue === 'string' ? newValue : '')}
            </div>
          </div>
        )}
        {entries
          .filter(([key]) => !consumedKeys.has(key))
          .map(([key, child]) => (
            <div key={key} className='min-w-0'>
              <div className='flex min-w-0 items-start gap-10px'>
                <span className='max-w-40% shrink-0 text-12px leading-20px text-t-secondary'>{fieldLabel(key)}</span>
                <div className='min-w-0 flex-1 text-13px leading-20px text-t-primary'>
                  {isRecord(child) || Array.isArray(child) ? null : renderValue(child, depth + 1)}
                </div>
              </div>
              {(isRecord(child) || Array.isArray(child)) && (
                <div className='mt-4px border-s border-[var(--color-border-2)] ps-10px'>
                  {renderValue(child, depth + 1)}
                </div>
              )}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className='min-w-0 text-t-primary' data-testid='structured-content'>
      {renderValue(value, 0)}
    </div>
  );
};

export default StructuredContent;
