import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

type BaseProps = { label: string; id: string; hint?: string; error?: string; children?: ReactNode };
type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline?: boolean };

export const Field = forwardRef<HTMLInputElement, InputProps>(function Field(
  { label, id, hint, error, className = '', ...props },
  ref
) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        ref={ref}
        id={id}
        className={`control${className ? ` ${className}` : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
      {hint && !error && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextAreaField(
  { label, id, hint, error, className = '', ...props },
  ref
) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        ref={ref}
        id={id}
        className={`control textarea${className ? ` ${className}` : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
      {hint && !error && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
});
