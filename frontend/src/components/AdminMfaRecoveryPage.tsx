import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ConfirmActionDialog } from './ConfirmActionDialog'
import TextAreaField from './TextAreaField'
import ValidatedForm from './ValidatedForm'
import { decideAdminMfaRecovery, getAdminMfaRecoveryRequests, getCurrentUserPermissions, type AdminMfaRecoveryRequest, type Paginated } from '../api/client'

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminMfaRecoveryPage() {
  const [permissions, setPermissions] = useState<string[] | null>(null)
  const [permissionError, setPermissionError] = useState('')
  const [queue, setQueue] = useState<Paginated<AdminMfaRecoveryRequest> | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [activeDecision, setActiveDecision] = useState<{ request: AdminMfaRecoveryRequest; decision: 'approve' | 'reject' } | null>(null)
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [decisionError, setDecisionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void getCurrentUserPermissions().then((value) => { if (active) setPermissions(value) })
      .catch(() => { if (active) setPermissionError('No pudimos confirmar tu permiso de revisión. Vuelve a cargar la página.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!permissions?.includes('security.mfa_recovery.review')) return
    let active = true
    setQueue(null)
    setLoadError('')
    void getAdminMfaRecoveryRequests(page).then((value) => {
      if (!active) return
      if (page > value.last_page && value.last_page > 0) { setPage(value.last_page); return }
      setQueue(value)
    }).catch((reason: unknown) => { if (active) setLoadError(reason instanceof Error ? reason.message : 'No pudimos cargar las solicitudes.') })
    return () => { active = false }
  }, [permissions, page, reload])

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeDecision || busy) return
    const reason = reasons[activeDecision.request.id]?.trim() ?? ''
    setBusy(true)
    setDecisionError('')
    try {
      await decideAdminMfaRecovery(activeDecision.request.id, activeDecision.decision, reason)
      setActiveDecision(null)
      setReasons((current) => ({ ...current, [activeDecision.request.id]: '' }))
      setNotice(activeDecision.decision === 'approve' ? 'Aprobación registrada. La segunda aprobación debe provenir de otra persona.' : 'Solicitud rechazada. El bloqueo se mantiene hasta que la persona demuestre posesión de su autenticador anterior o complete una recuperación posterior.')
      setReload((value) => value + 1)
    } catch (reason) {
      setDecisionError(reason instanceof Error ? reason.message : 'No pudimos guardar la decisión. El motivo permanece disponible para reintentar.')
    } finally { setBusy(false) }
  }

  const canReview = permissions?.includes('security.mfa_recovery.review') === true
  const decisionLabel = activeDecision?.decision === 'approve' ? 'aprobar' : 'rechazar'

  return <div className="app-shell"><main className="catalog-page page-shell admin-mfa-recovery">
    <Link className="text-link admin-mfa-recovery__back" to="/admin"><ArrowLeft size={16} /> Volver a administración</Link>
    <p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · SEGURIDAD DE CUENTAS</p>
    <h1>Recuperación de MFA</h1>
    <p className="admin-mfa-recovery__intro">Cada solicitud requiere dos revisiones independientes. Verifica la identidad fuera de esta plataforma según el procedimiento institucional y deja constancia sin incluir documentos ni números de identidad.</p>
    <div className="admin-mfa-recovery__policy"><ShieldAlert size={20} aria-hidden="true" /><p>Una aprobación individual no restablece el acceso. Después de dos aprobaciones, la persona debe registrar y confirmar un autenticador nuevo.</p></div>
    {notice && <p className="admin-mfa-recovery__notice" role="status"><CheckCircle2 size={18} />{notice}</p>}
    {permissions === null ? <p role="status">{permissionError || 'Comprobando permisos de revisión…'}</p> : !canReview ? <section className="admin-mfa-recovery__forbidden" role="alert"><ShieldAlert size={22} /><h2>No tienes permiso para revisar estas solicitudes</h2><p>{permissionError || 'La cola requiere el permiso security.mfa_recovery.review y una sesión con MFA confirmado.'}</p><Link className="button button--outline" to="/admin">Volver a administración</Link></section> : loadError ? <section className="admin-mfa-recovery__state" role="alert"><h2>No pudimos cargar la cola</h2><p>{loadError}</p><button className="button button--outline" type="button" onClick={() => setReload((value) => value + 1)}>Intentar de nuevo</button></section> : !queue ? <p className="admin-mfa-recovery__loading" role="status">Cargando solicitudes de recuperación…</p> : queue.data.length === 0 ? <section className="admin-mfa-recovery__empty"><ShieldCheck size={28} aria-hidden="true" /><h2>No hay solicitudes pendientes</h2><p>Las solicitudes nuevas aparecerán aquí después de que el personal confirme su contraseña y solicite recuperación.</p></section> : <>
      <div className="admin-mfa-recovery__summary"><strong>{queue.total}</strong><span>{queue.total === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</span></div>
      <section className="admin-mfa-recovery__list" aria-label="Solicitudes de recuperación MFA">
        {queue.data.map((item) => <article className="admin-mfa-recovery__card" key={item.id}>
          <div className="admin-mfa-recovery__card-head"><div><p className="eyebrow eyebrow--quiet">{item.status === 'awaiting_second_approval' ? 'SEGUNDA REVISIÓN' : 'PRIMERA REVISIÓN'}</p><h2>{item.target.name}</h2><p className="admin-mfa-recovery__email">{item.target.email}</p></div><span className="admin-mfa-recovery__expiry"><Clock3 size={15} aria-hidden="true" /> Vence {formatDate(item.expires_at)}</span></div>
          <p className="admin-mfa-recovery__reason"><strong>Motivo de solicitud</strong>{item.reason}</p>
          <p className="admin-mfa-recovery__dates">Registrada {formatDate(item.requested_at)}</p>
          {item.approvals.length > 0 && <section className="admin-mfa-recovery__votes" aria-label="Revisiones anteriores"><h3>Revisión anterior</h3>{item.approvals.map((approval) => <div className="admin-mfa-recovery__vote" key={`${item.id}-${approval.approver}`}><p><strong>{approval.approver}</strong> · {approval.decision === 'approve' ? 'Aprobó' : 'Rechazó'} · {formatDate(approval.decided_at)}</p><p>{approval.reason}</p></div>)}</section>}
          {item.prior_vote ? <p className="admin-mfa-recovery__prior" role="status">Ya registraste tu decisión ({item.prior_vote === 'approve' ? 'aprobaste' : 'rechazaste'}). No puedes revisar esta solicitud por segunda vez.</p> : <div className="admin-mfa-recovery__actions"><button className="button button--primary" type="button" onClick={() => { setActiveDecision({ request: item, decision: 'approve' }); setDecisionError('') }}>Aprobar</button><button className="button button--outline admin-mfa-recovery__reject" type="button" onClick={() => { setActiveDecision({ request: item, decision: 'reject' }); setDecisionError('') }}>Rechazar</button></div>}
        </article>)}
      </section>
      {queue.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de solicitudes MFA"><button className="button button--outline button--small" type="button" disabled={queue.current_page <= 1} onClick={() => setPage(queue.current_page - 1)}>Anterior</button><span aria-live="polite">Página {queue.current_page} de {queue.last_page} · {queue.total} solicitudes</span><button className="button button--outline button--small" type="button" disabled={queue.current_page >= queue.last_page} onClick={() => setPage(queue.current_page + 1)}>Siguiente</button></nav>}
    </>}
  </main>{activeDecision && <ConfirmActionDialog title={`Confirmar ${decisionLabel} solicitud`} description={`${activeDecision.decision === 'approve' ? 'La primera aprobación requiere una segunda persona distinta.' : 'El rechazo no elimina el bloqueo de la cuenta.'} Esta decisión quedará registrada en la auditoría.`} confirmLabel={activeDecision.decision === 'approve' ? 'Confirmar aprobación' : 'Confirmar rechazo'} busyLabel="Guardando decisión…" busy={busy} error={decisionError} confirmFormId="admin-mfa-recovery-decision" initialFocusId={`mfa-recovery-decision-reason-${activeDecision.request.id}`} onCancel={() => { if (!busy) setActiveDecision(null) }}>
    <ValidatedForm id="admin-mfa-recovery-decision" className="auth-form" onSubmit={(event) => void submitDecision(event)}>
      <TextAreaField id={`mfa-recovery-decision-reason-${activeDecision.request.id}`} name="reason" label="Motivo de la decisión" value={reasons[activeDecision.request.id] ?? ''} onChange={(value) => setReasons((current) => ({ ...current, [activeDecision.request.id]: value }))} hint="Describe la verificación realizada. No incluyas documentos ni números de identidad." minLength={10} maxLength={1000} rows={4} required />
    </ValidatedForm>
  </ConfirmActionDialog>}</div>
}
