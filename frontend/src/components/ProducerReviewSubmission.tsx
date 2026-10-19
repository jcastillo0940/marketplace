import { useEffect, useRef, useState, type FormEvent } from 'react'
import { submitProductForReview } from '../api/client'
import TextAreaField from './TextAreaField'
import ValidatedForm from './ValidatedForm'

type Props = {
  productId: number
  status: string
  disabled?: boolean
  onSubmitted: () => void
}

export function ProducerReviewSubmission({ productId, status, disabled = false, onSubmitted }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isDraft = status === 'draft'

  useEffect(() => {
    if (open) document.getElementById(`review-reason-${productId}`)?.focus()
  }, [open, productId])

  if (!['draft', 'changes_requested', 'rejected'].includes(status)) return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await submitProductForReview(productId, reason.trim())
      setOpen(false)
      setReason('')
      onSubmitted()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo enviar a revisión. Conservamos tu explicación para que puedas reintentar.')
    } finally {
      setBusy(false)
    }
  }

  function close() {
    if (busy) return
    setOpen(false)
    setError('')
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  return <div className="producer-review-submit">
    <button ref={triggerRef} className="button button--primary button--small" type="button" disabled={disabled || busy} aria-expanded={open} onClick={() => { setError(''); setOpen((current) => !current) }}>
      {open ? 'Cerrar formulario de envío' : isDraft ? 'Enviar a revisión' : 'Reenviar a revisión'}
    </button>
    {open && <ValidatedForm className="producer-review-submit__form" noValidate onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <TextAreaField id={`review-reason-${productId}`} name="reason" label="Explicación para el equipo revisor" value={reason} onChange={(value) => { setReason(value); setError('') }} hint="Indica qué debe revisar el equipo o qué corregiste en la publicación." minLength={5} maxLength={1000} rows={3} required />
      {error && <p role="alert" className="producer-review-submit__error">{error}</p>}
      <div className="producer-review-submit__actions">
        <button className="button button--outline button--small" type="button" disabled={busy} onClick={close}>Cancelar</button>
        <button className="button button--primary button--small" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Enviando…' : 'Confirmar envío a revisión'}</button>
      </div>
    </ValidatedForm>}
  </div>
}
