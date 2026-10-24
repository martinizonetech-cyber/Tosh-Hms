import type { ReactNode } from 'react';

type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function statusTone(label: string): Tone {
  const value = label.toLowerCase();
  if (['paid', 'completed', 'finalized'].some((term) => value.includes(term))) return 'success';
  if (['overdue', 'cancelled', 'no-show', 'due'].some((term) => value.includes(term))) return 'danger';
  if (['partial', 'queued', 'waiting', 'scheduled', 'upcoming', 'draft'].some((term) => value.includes(term))) return 'warn';
  if (['consulting', 'in progress', 'checked-in', 'skin'].some((term) => value.includes(term))) return 'info';
  return 'neutral';
}

export function DepartmentTag({ children }: { children: ReactNode }) {
  return <span className="status-badge status-info">{children}</span>;
}
