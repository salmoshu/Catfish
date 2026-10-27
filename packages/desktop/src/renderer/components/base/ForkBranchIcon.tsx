/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import KimiIcon from './KimiIcon';

const ForkBranchIcon: React.FC<{ size?: number | string; fill?: string; className?: string }> = ({
  size = 16,
  fill = 'currentColor',
  className,
}) => <KimiIcon name='git-fork' size={size} fill={fill} className={className} />;

export default ForkBranchIcon;
