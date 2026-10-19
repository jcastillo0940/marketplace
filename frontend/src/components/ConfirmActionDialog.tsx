import { useEffect, useRef, type ReactNode } from 'react'

type ConfirmActionDialogProps = {
  title: string
  accessibleName?: string
  description: string
  confirmLabel: string
  busyLabel: string
  busy: boolean
  error?: string
  children?: ReactNode
  confirmFormId?: string
  initialFocusId?: string
  onCancel: () => void
  onConfirm?: () => void
}

export function ConfirmActionDialog({ title, accessibleName, description, confirmLabel, busyLabel, busy, error, children, confirmFormId, initialFocusId, onCancel, onConfirm }: ConfirmActionDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const onCancelRef = useRef(onCancel)

  useEffect(() => { onCancelRef.current = onCancel }, [onCancel])

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => returnFocusRef.current?.focus()
  }, [])

  useEffect(() => {
    const initialFocus = initialFocusId ? dialogRef.current?.querySelector<HTMLElement>(`#${CSS.escape(initialFocusId)}:not([disabled])`) : null
    if (busy) dialogRef.current?.focus()
    else (initialFocus ?? cancelRef.current)?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, initialFocusId])

  return <div className="confirm-action-backdrop"><section ref={dialogRef} className="confirm-action" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description" aria-label={accessibleName} aria-busy={busy} tabIndex={-1}><p className="eyebrow eyebrow--quiet">CONFIRMA LA ACCIÓN</p><h2 id="confirm-action-title">{title}</h2><p id="confirm-action-description">{description}</p>{children}{error && <p className="confirm-action__error" role="alert">{error}</p>}<div className="confirm-action__actions"><button ref={cancelRef} className="button button--outline" type="button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="button button--primary" type={confirmFormId ? 'submit' : 'button'} form={confirmFormId} disabled={busy} aria-busy={busy} onClick={confirmFormId ? undefined : onConfirm}>{busy ? busyLabel : confirmLabel}</button></div></section></div>
}
