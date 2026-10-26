import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'normal' | 'small'; icon?: ReactNode; children?: ReactNode };

export function Button({ variant = 'primary', size = 'normal', icon, className = '', children, ...props }: Props) {
  return <button className={`btn btn-${variant}${size === 'small' ? ' btn-small' : ''}${className ? ` ${className}` : ''}`} {...props}>{icon}{children}</button>;
}
