import type { ReactNode } from 'react';

export function EmptyState({ title, message, icon, action }: { title: string; message: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon" aria-hidden="true">{icon}</div><h3>{title}</h3><p>{message}</p>{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>;
}
