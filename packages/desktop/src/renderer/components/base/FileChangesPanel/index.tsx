/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import { Button } from '@arco-design/web-react';
import { Down, Edit, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './FileChangesPanel.module.css';

export type FileChangeItem = {
  file_name: string;
  fullPath: string;
  insertions: number;
  deletions: number;
};

export type FileChangesPanelProps = {
  title: string;
  files: FileChangeItem[];
  defaultExpanded?: boolean;
  onFileClick?: (file: FileChangeItem) => void;
  onDiffClick?: (file: FileChangeItem) => void;
  className?: string;
  variant?: 'operation' | 'summary';
};

const ChangeCounts: React.FC<{ insertions: number; deletions: number }> = ({ insertions, deletions }) => (
  <span className={styles.counts}>
    {insertions > 0 && <span className={styles.additions}>+{insertions}</span>}
    {deletions > 0 && <span className={styles.deletions}>−{deletions}</span>}
  </span>
);

/** Show each edit's paths inline and keep completed-turn totals in a compact card. */
const FileChangesPanel: React.FC<FileChangesPanelProps> = ({
  title,
  files,
  defaultExpanded,
  onFileClick,
  onDiffClick,
  className,
  variant = 'operation',
}) => {
  const { t } = useTranslation();
  const summary = variant === 'summary';
  const [expanded, setExpanded] = useState(defaultExpanded ?? !summary);
  if (files.length === 0) return null;
  const insertions = files.reduce((total, file) => total + file.insertions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const visibleFiles = summary ? (expanded ? files : files.slice(0, 3)) : expanded ? files : [];

  return (
    <div
      className={classNames(styles.panel, summary ? styles.summary : styles.operation, className)}
      data-file-changes={variant}
    >
      <div className={styles.header}>
        {summary ? (
          <span className={styles.title}>
            <Edit size={15} />
            {title}
          </span>
        ) : (
          <Button
            type='text'
            className={styles.toggle}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {t('messages.editedFilesCount', { count: files.length })}
            <Down size={12} className={expanded ? undefined : '-rotate-90'} />
          </Button>
        )}
        {summary && (
          <span className={styles.totals}>
            <ChangeCounts insertions={insertions} deletions={deletions} />
            {insertions + deletions > 0 && (
              <span className={styles.changeBar} aria-hidden='true'>
                <span className={styles.additionBar} style={{ flexGrow: insertions }} />
                <span className={styles.deletionBar} style={{ flexGrow: deletions }} />
              </span>
            )}
          </span>
        )}
      </div>
      {visibleFiles.length > 0 && (
        <div className={styles.files}>
          {visibleFiles.map((file, index) => {
            const separator = Math.max(file.fullPath.lastIndexOf('/'), file.fullPath.lastIndexOf('\\'));
            const directory = separator >= 0 ? file.fullPath.slice(0, separator + 1) : '';
            return (
              <div className={styles.row} key={`${file.fullPath}-${index}`}>
                {!summary && <Edit size={14} className='shrink-0 text-t-tertiary' />}
                <Button
                  type='text'
                  className={styles.fileName}
                  title={file.fullPath}
                  aria-label={file.fullPath}
                  onClick={() => onFileClick?.(file)}
                  disabled={!onFileClick}
                >
                  {!summary && <span className={styles.editLabel}>{t('common.edit')}</span>}
                  <span className={styles.path}>
                    <span className={styles.directory}>{directory}</span>
                    <span className={styles.basename}>{file.file_name}</span>
                  </span>
                </Button>
                <Button
                  type='text'
                  className={styles.diffButton}
                  aria-label={`${t('messages.fileChanges')}: ${file.fullPath}`}
                  onClick={() => onDiffClick?.(file)}
                  disabled={!onDiffClick}
                >
                  <ChangeCounts insertions={file.insertions} deletions={file.deletions} />
                  {!summary && <Right size={14} />}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {summary && files.length > 3 && (
        <Button
          type='text'
          className={styles.more}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t('common.collapse') : t('messages.moreFiles', { count: files.length - 3 })}
          <Down size={13} className={expanded ? 'rotate-180' : undefined} />
        </Button>
      )}
    </div>
  );
};

export default FileChangesPanel;
