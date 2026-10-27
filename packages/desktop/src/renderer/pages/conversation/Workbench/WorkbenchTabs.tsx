import { Button } from '@arco-design/web-react';
import React, { useRef } from 'react';
import type { WorkbenchSection } from './workbenchActivity';

export type WorkbenchTabItem = {
  id: WorkbenchSection;
  label: string;
  count?: number;
};

type WorkbenchTabsProps = {
  items: WorkbenchTabItem[];
  activeSection: WorkbenchSection;
  label: string;
  onSelect: (section: WorkbenchSection) => void;
};

export const WorkbenchTabs: React.FC<WorkbenchTabsProps> = ({ items, activeSection, label, onSelect }) => {
  const buttonRefs = useRef(new Map<WorkbenchSection, HTMLButtonElement | null>());

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = items[nextIndex];
    if (!next) return;
    onSelect(next.id);
    buttonRefs.current.get(next.id)?.focus();
  };

  return (
    <div className='workbench-tabs' role='tablist' aria-label={label}>
      {items.map((item, index) => (
        <Button
          key={item.id}
          ref={(element) => {
            buttonRefs.current.set(item.id, element instanceof HTMLButtonElement ? element : null);
          }}
          type='text'
          size='small'
          role='tab'
          id={`workbench-tab-${item.id}`}
          aria-controls={`workbench-panel-${item.id}`}
          aria-label={item.count ? `${item.label} ${item.count}` : item.label}
          aria-selected={activeSection === item.id}
          tabIndex={activeSection === item.id ? 0 : -1}
          className={`workbench-tab${activeSection === item.id ? ' workbench-tab--active' : ''}`}
          onClick={() => onSelect(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          <span>{item.label}</span>
          {item.count !== undefined && item.count > 0 && <span className='workbench-tab__count'>{item.count}</span>}
        </Button>
      ))}
    </div>
  );
};
