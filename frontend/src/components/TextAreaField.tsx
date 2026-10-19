import type { TextareaHTMLAttributes } from 'react'

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'name' | 'value' | 'onChange'> & {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
}

export default function TextAreaField({ id, name, label, value, onChange, hint, error, className = '', ...props }: TextAreaFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return <label className={`text-area-field ${className}`.trim()} htmlFor={id}>
    <span>{label}</span>
    <textarea {...props} id={id} name={name} value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={`resize-none ${className}`.trim()} />
    {hint && <small id={hintId} className="text-area-field__hint">{hint}</small>}
    {error && <small id={errorId} className="text-area-field__error">{error}</small>}
  </label>
}
