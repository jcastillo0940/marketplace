import type { SelectHTMLAttributes } from 'react'

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  id: string
  label: string
  hint?: string
  error?: string
}

export default function SelectField({ id, label, hint, error, className = '', children, ...props }: SelectFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return <label className={`select-field ${className}`.trim()} htmlFor={id}>
    <span>{label}</span>
    <select {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy}>{children}</select>
    {hint && <small id={hintId} className="select-field__hint">{hint}</small>}
    {error && <small id={errorId} className="select-field__error">{error}</small>}
  </label>
}
