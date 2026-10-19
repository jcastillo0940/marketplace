import type { InputHTMLAttributes } from 'react'

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string
  label: string
  hint?: string
  error?: string
}

export default function Field({ id, label, hint, error, className = '', ...props }: FieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return <label className={`form-field ${className}`.trim()} htmlFor={id}>
    <span>{label}</span>
    <input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} />
    {hint && <small id={hintId} className="form-field__hint">{hint}</small>}
    {error && <small id={errorId} className="form-field__error">{error}</small>}
  </label>
}
