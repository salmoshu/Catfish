/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { IconProvider, DEFAULT_ICON_CONFIGS } from '@icon-park/react/es/runtime';
import { iconColors } from '@/renderer/styles/colors';
import KimiIcon from './base/KimiIcon';
import { KIMI_ICON_BY_COMPONENT } from './base/kimiIconByComponent';

type IconParkProps = {
  className?: string;
  strokeWidth?: number;
  fill?: string;
};

const IconParkHOC = <T extends object>(
  Component: React.FunctionComponent<T>,
  iconName?: string
): React.FC<T & IconParkProps> => {
  return (props) => {
    const { className, ...restProps } = props;
    const kimiName = iconName ? KIMI_ICON_BY_COMPONENT[iconName] : undefined;
    if (kimiName) {
      const customProps = restProps as T & { size?: number | string; fill?: string };
      return (
        <KimiIcon
          {...customProps}
          name={kimiName}
          size={customProps.size ?? 16}
          fill={customProps.fill ?? iconColors.secondary}
          className={`cursor-pointer ${className || ''}`}
        />
      );
    }
    return React.createElement(
      IconProvider,
      {
        value: {
          ...DEFAULT_ICON_CONFIGS,
          size: 16,
        },
      },
      [
        React.createElement(Component, {
          key: 'c3',
          strokeWidth: 3,
          fill: iconColors.secondary,
          ...(restProps as T),
          className: `cursor-pointer  ${className || ''}`,
        } as T),
      ]
    );
  };
};

export default IconParkHOC;
