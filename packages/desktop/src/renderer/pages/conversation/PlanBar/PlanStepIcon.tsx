/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckOne } from '@icon-park/react';
import React from 'react';
import styles from './ConversationPlanBar.module.css';

const PlanStepIcon: React.FC<{
  status: 'pending' | 'in_progress' | 'completed';
  size?: number;
  processing?: boolean;
}> = ({ status, size = 16, processing = false }) => {
  if (status === 'completed') {
    return (
      <span
        data-status='completed'
        aria-hidden='true'
        className={styles.stepIconDone}
        style={{ width: size, height: size }}
      >
        <CheckOne theme='filled' size={size} />
      </span>
    );
  }

  if (status === 'in_progress') {
    return (
      <span
        data-status='in_progress'
        data-processing={processing ? 'true' : 'false'}
        aria-hidden='true'
        className={styles.stepIconRunning}
        style={{ width: size, height: size }}
      >
        <span className={styles.stepIconRunningDot} />
      </span>
    );
  }

  return (
    <span
      data-status='pending'
      aria-hidden='true'
      className={styles.stepIconPending}
      style={{ width: size, height: size }}
    />
  );
};

export default PlanStepIcon;
