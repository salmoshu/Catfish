import React from 'react';
import { KIMI_ICON_SVG, type KimiIconName } from './kimiIconDefinitions';

type KimiIconProps = Omit<React.SVGProps<SVGSVGElement>, 'name'> & {
  name: KimiIconName;
  size?: number | string;
  fill?: string;
  theme?: string;
};

export const KimiIcon: React.FC<KimiIconProps> = ({
  name,
  size = 16,
  fill,
  className,
  strokeWidth: _strokeWidth,
  theme: _theme,
  style,
  ...props
}) => {
  const svg = KIMI_ICON_SVG[name];
  const content = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));

  return (
    <svg
      {...props}
      className={className}
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      strokeLinecap='round'
      strokeLinejoin='round'
      color={fill ?? 'currentColor'}
      style={style}
      aria-hidden='true'
      focusable='false'
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};

export default KimiIcon;
