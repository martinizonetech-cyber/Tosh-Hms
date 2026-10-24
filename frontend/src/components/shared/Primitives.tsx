import type { ReactNode } from 'react';
import { initials } from '../../utils/format';

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function PatientAvatar({ name, tone = 'teal', small = false }: { name: string; tone?: 'teal' | 'blue' | 'peach'; small?: boolean }) {
  return (
    <span
      className={`avatar${small ? ' small' : ''} ${tone}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        lineHeight: 1,
        flexShrink: 0,
        margin: 0,
        padding: 0,
        boxSizing: 'border-box',
      }}
    >
      {initials(name)}
    </span>
  );
}

export function PatientCell({ name, id, tone = 'teal' }: { name: string; id: string; tone?: 'teal' | 'blue' | 'peach' }) {
  return <div className="patient-cell"><PatientAvatar name={name} tone={tone} small /><div><strong>{name}</strong><span>{id}</span></div></div>;
}
