import type { KeyboardEvent, ReactNode } from 'react';

export interface TabOption<T extends string> { id: T; label: string; }
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function Tabs<T extends string>({ idPrefix, ariaLabel, items, selected, onChange, className = '' }: { idPrefix: string; ariaLabel: string; items: TabOption<T>[]; selected: T; onChange: (id: T) => void; className?: string }) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, currentId: T) => {
    const currentIndex = items.findIndex((item) => item.id === currentId);
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length;
    else return;
    event.preventDefault();
    const next = items[nextIndex];
    onChange(next.id);
    document.getElementById(`${idPrefix}-tab-${slug(next.id)}`)?.focus();
  };

  return <div className={`tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
    {items.map((item) => <button key={item.id} type="button" role="tab" id={`${idPrefix}-tab-${slug(item.id)}`} aria-controls={`${idPrefix}-panel-${slug(item.id)}`} aria-selected={selected === item.id} tabIndex={selected === item.id ? 0 : -1} className={`tab${selected === item.id ? ' active' : ''}`} onClick={() => onChange(item.id)} onKeyDown={(event) => moveFocus(event, item.id)}>{item.label}</button>)}
  </div>;
}

export function TabPanel<T extends string>({ idPrefix, selected, children, className = '' }: { idPrefix: string; selected: T; children: ReactNode; className?: string }) {
  return <div id={`${idPrefix}-panel-${slug(selected)}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${slug(selected)}`} tabIndex={0} className={className}>{children}</div>;
}
