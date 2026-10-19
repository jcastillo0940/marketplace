import { useState, type FormEvent, type FormHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'children'> & {
  children: ReactNode
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}

function messageFor(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const validity = control.validity
  if (validity.customError) return control.validationMessage
  if (validity.valueMissing) {
    if (control.type === 'checkbox') return 'Marca esta casilla para continuar.'
    if (control.type === 'email') return 'Escribe tu correo electrónico.'
    if (control.id === 'producer-appeal-reason') return 'Explica tu solicitud con al menos 20 caracteres.'
    if (control.id.startsWith('review-reason-')) return 'Explica qué cambió con al menos 5 caracteres.'
    return 'Completa este campo.'
  }
  if (validity.typeMismatch) return control.type === 'email' ? 'Escribe un correo electrónico válido.' : 'Revisa el formato de este campo.'
  if (validity.tooShort) return 'minLength' in control && control.minLength === 20 ? 'Explica tu solicitud con al menos 20 caracteres.' : `Escribe al menos ${'minLength' in control ? control.minLength : 0} caracteres.`
  if (validity.patternMismatch) return 'Revisa el formato solicitado.'
  if (validity.tooLong) return `Escribe ${'maxLength' in control ? control.maxLength : 0} caracteres o menos.`
  return 'Revisa este campo.'
}

export default function ValidatedForm({ children, onSubmit, noValidate: _noValidate, ...props }: Props) {
  const [errors, setErrors] = useState<{ id: string; label: string; message: string; target: HTMLElement }[]>([])

  function clearValidControl(event: FormEvent<HTMLFormElement>) {
    const control = event.target
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
      if (control.checkValidity()) {
        control.removeAttribute('aria-invalid')
        const errorId = `${control.id}-validation-error-inline`
        const remaining = control.getAttribute('aria-describedby')?.split(/\s+/).filter((value) => value && value !== errorId) ?? []
        if (remaining.length) control.setAttribute('aria-describedby', remaining.join(' '))
        else control.removeAttribute('aria-describedby')
        setErrors((current) => current.filter((error) => error.id !== control.id))
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget
    const invalid = Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.type !== 'file' && !element.disabled && !element.checkValidity(),
    )
    if (invalid.length) {
      event.preventDefault()
      const next = invalid.map((control, index) => {
        const id = control.id || `${props.className?.replace(/\W/g, '-') || 'form'}-${control.name || 'field'}-${index}`
        control.id = id
        control.setAttribute('aria-invalid', 'true')
        const errorId = `${id}-validation-error-inline`
        const current = control.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []
        control.setAttribute('aria-describedby', [...current.filter((value) => value !== errorId), errorId].join(' '))
        const label = control.labels?.[0]?.innerText?.replace(/\s+/g, ' ').trim() || control.getAttribute('aria-label') || control.name || 'Campo'
        return { id, label, message: messageFor(control), target: control }
      })
      setErrors(next)
      form.querySelector<HTMLElement>(`#${CSS.escape(next[0].id)}`)?.focus()
      return
    }
    setErrors([])
    onSubmit?.(event)
  }

  return <form {...props} noValidate onSubmit={submit} onInput={(event) => {
    clearValidControl(event)
    props.onInput?.(event)
  }} onChange={(event) => {
    clearValidControl(event)
    props.onChange?.(event)
  }}>
    {errors.length > 0 && <div className="form-validation-errors" role="alert" aria-live="assertive"><strong>Revisa los campos señalados:</strong><ul>{errors.map((error) => <li key={error.id}><a href={`#${error.id}`}>{error.label}: {error.message}</a></li>)}</ul></div>}
    {errors.map((error) => error.target.parentElement ? createPortal(<small id={`${error.id}-validation-error-inline`} className="form-field__error">{error.message}</small>, error.target.parentElement, `${error.id}-inline`) : null)}
    {children}
  </form>
}
