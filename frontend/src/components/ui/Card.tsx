import type { PropsWithChildren, ReactNode } from 'react';

export function Card({ children, className = '', padded = true }: PropsWithChildren<{ className?: string; padded?: boolean }>) {
  return <section className={`card${padded ? ' card-pad' : ''}${className ? ` ${className}` : ''}`}>{children}</section>;
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, hint, icon, detail }: { label: string; value: string | number; hint?: string; icon: ReactNode; detail?: ReactNode }) {
  return <article className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-icon" aria-hidden="true">{icon}</span></div><div className="stat-value">{value}</div>{detail ? <div className="stat-foot">{detail}</div> : hint && <div className="stat-foot">{hint}</div>}</article>;
}
