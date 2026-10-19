import { Route, Routes } from 'react-router-dom'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, ArrowUpRight, ChevronRight, Search, ShieldCheck } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Field from '../components/Field'
import SelectField from '../components/SelectField'
import LocationPicker from '../components/LocationPicker'
import TextAreaField from '../components/TextAreaField'
import ValidatedForm from '../components/ValidatedForm'
import VerificationBadge from '../components/VerificationBadge'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { confirmAdminMfa, deactivateAdminCatalogItem, decideModeration, decideModerationBulk, decideProducerAppeal, downloadAdminMetricsCsv, getAdminCategories, getAdminLocations, getAdminMetrics, getAdminMfaSetup, getAdminProducerAppeals, getAdminProducerDetail, getAdminProducers, getAdminRoles, getAdminSecurityAlerts, getAdminUsers, getAuditLogs, getAdminMessageTemplates, updateAdminMessageTemplate, getCurrentUserPermissions, getModerationQueue, getReportCase, getReportCases, releaseReportCase, listLocations, registerProducer, reportEvidenceUrl, saveAdminCategory, saveAdminLocation, setAdminProducerStatus, setAdminProducerTrustLevel, setAdminUserRoles, updateAdminCategory, updateAdminLocation, updateAdminSecurityAlert, updateReportCase, updateReportPriority, type AdminCategory, type AdminLocation, type AdminMetrics, type AdminMessageTemplate, type AdminProducer, type AdminProducerDetail, type AdminProducerAppeal, type AdminRole, type AdminUser, type ModerationItem, type Paginated, type PublicLocation, type ReportCase, type ReportCaseDetail, type RiskAlert, type ProducerVerificationLevel } from '../api/client'
import { SiteFooter, SiteHeader } from './shared/SiteChrome'
import AdminMfaRecoveryPage from '../components/AdminMfaRecoveryPage'
import { InfoPage } from './shared/InfoPage'

function ModerationPage() {
  const [queue, setQueue] = useState<Paginated<ModerationItem> | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [decisionTarget, setDecisionTarget] = useState<{ item: ModerationItem; decision: 'approve' | 'reject' | 'request_changes' } | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [decisionFieldError, setDecisionFieldError] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkDecision, setBulkDecision] = useState<'approve' | 'reject' | 'request_changes'>('request_changes')
  const [bulkReason, setBulkReason] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ processed: number; failed: Array<{ id: number; message: string }> } | null>(null)
  const approvalEligibleIds = queue?.data.filter((item) => item.producer.profile_status === 'active' && item.producer.contact_verified && item.category.active && item.category.parent?.active !== false).map((item) => item.id) ?? []
  const selectableIds = bulkDecision === 'approve' ? approvalEligibleIds : queue?.data.map((item) => item.id) ?? []
  useEffect(() => {
    let current = true
    setError('')
    void getModerationQueue(page).then((result) => {
      if (!current) return
      if (page > result.last_page && result.last_page > 0) { setPage(result.last_page); return }
      setQueue(result)
      setSelectedIds((current) => current.filter((id) => result.data.some((item) => item.id === id)))
    }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'No pudimos cargar la cola.') })
    return () => { current = false }
  }, [page, reload])
  function beginDecision(item: ModerationItem, decision: 'approve' | 'reject' | 'request_changes') {
    setActionError('')
    setBulkResult(null)
    setDecisionReason('')
    setDecisionFieldError('')
    setDecisionTarget({ item, decision })
  }
  async function decide(item: ModerationItem, decision: 'approve' | 'reject' | 'request_changes', reason: string) {
    setActionError('')
    setBusyId(item.id)
    try {
      await decideModeration(item.id, decision, reason)
      setDecisionTarget(null)
      setQueue(null)
      setReload((current) => current + 1)
    }
    catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No se pudo guardar la decisión.')
      setDecisionTarget(null)
      setQueue(null)
      setReload((current) => current + 1)
    }
    finally { setBusyId(null) }
  }
  async function decideSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedIds.length) return
    setActionError('')
    setBulkBusy(true)
    try {
      const result = await decideModerationBulk(selectedIds, bulkDecision, bulkReason.trim())
      setBulkResult({ processed: result.processed.length, failed: result.failed })
      setSelectedIds(result.failed.map((item) => item.id))
      if (!result.failed.length) setBulkReason('')
      if (result.processed.length) {
        setQueue(null)
        setReload((current) => current + 1)
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No se pudieron guardar las decisiones seleccionadas.')
    } finally {
      setBulkBusy(false)
    }
  }
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Cola de moderación</h1><p>Revisa cada oferta y registra el motivo de tu decisión. Solo los moderadores autorizados pueden acceder.</p><Link className="text-link" to="/admin/apelaciones">Revisar apelaciones de productores <ArrowRight size={15} /></Link>{actionError && <p role="alert">{actionError}</p>}{bulkResult && <div className="moderation-bulk__result" role={bulkResult.failed.length ? "alert" : "status"}><strong>{bulkResult.processed} {bulkResult.processed === 1 ? "publicación actualizada" : "publicaciones actualizadas"}{bulkResult.failed.length ? `; ${bulkResult.failed.length} no se procesaron` : ""}.</strong>{bulkResult.failed.length > 0 && <ul>{bulkResult.failed.map((item) => <li key={item.id}>Publicación {item.id}: {item.message}</li>)}</ul>}</div>}{error ? <div role="alert" className="empty-products"><strong>{error}</strong><button className="button button--outline" type="button" onClick={() => { setQueue(null); setError(''); setReload((current) => current + 1) }}>Intentar de nuevo</button></div> : queue === null ? <p role="status">Cargando publicaciones pendientes…</p> : queue.data.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay publicaciones pendientes</strong><span>Las nuevas ofertas aparecerán aquí cuando un productor las envíe a revisión.</span></div> : <><section className="moderation-bulk" aria-label="Acción para publicaciones seleccionadas"><label className="moderation-bulk__select-all"><input type="checkbox" checked={selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))} disabled={bulkBusy || selectableIds.length === 0} onChange={(event) => setSelectedIds(event.currentTarget.checked ? selectableIds : [])} />{bulkDecision === 'approve' ? 'Seleccionar publicaciones aprobables de esta página' : 'Seleccionar todas las publicaciones de esta página'}</label><p>La selección se limita a estas {queue.data.length} publicaciones visibles. Cada decisión se revisará y registrará individualmente.</p><ValidatedForm className="moderation-bulk__form" noValidate onSubmit={decideSelected}><label><span>Decisión para las publicaciones seleccionadas</span><select name="decision" value={bulkDecision} disabled={bulkBusy} onChange={(event) => { const nextDecision = event.currentTarget.value as 'approve' | 'reject' | 'request_changes'; setBulkDecision(nextDecision); setBulkResult(null); if (nextDecision === 'approve') setSelectedIds((current) => current.filter((id) => approvalEligibleIds.includes(id))) }}><option value="request_changes">Solicitar cambios</option><option value="reject">Rechazar</option><option value="approve">Aprobar y publicar</option></select></label><TextAreaField id="moderation-bulk-reason" name="reason" label="Motivo común para la decisión" value={bulkReason} disabled={bulkBusy} onChange={(value) => { setBulkReason(value); setBulkResult(null) }} minLength={5} maxLength={1000} rows={3} required hint="El motivo se guardará en el historial individual de cada publicación procesada." /><div className="moderation-bulk__actions"><button className="button button--primary" type="submit" disabled={bulkBusy || selectedIds.length === 0} aria-busy={bulkBusy}>{bulkBusy ? 'Aplicando decisión…' : `${bulkDecision === 'approve' ? 'Aprobar y publicar' : bulkDecision === 'reject' ? 'Rechazar' : 'Solicitar cambios'} a ${selectedIds.length} publicaciones`}</button>{selectedIds.length > 0 && <button className="button button--outline" type="button" disabled={bulkBusy} onClick={() => setSelectedIds([])}>Limpiar selección</button>}</div>{bulkBusy && <p role="status">Registrando cada decisión…</p>}</ValidatedForm></section><section className="dashboard-list">{queue.data.map((item) => {
    const approvalBlocked = item.producer.profile_status !== 'active' || !item.producer.contact_verified || !item.category.active || item.category.parent?.active === false
    const blockedReason = item.producer.profile_status !== 'active'
      ? 'Aprobar estará disponible cuando el perfil del productor esté activo.'
      : !item.producer.contact_verified
        ? 'Aprobar estará disponible cuando el productor verifique su teléfono.'
        : 'Aprobar estará disponible cuando la categoría y su categoría padre estén activas.'
    const reinstatement = item.status_history.find((entry) => entry.from_status === 'published' && entry.to_status === 'pending' && entry.reason?.startsWith('Revisión requerida tras reactivar el perfil:'))
    return <article className="moderation-card" key={item.id}><div className="moderation-card__image">{item.images[0] && <img src={item.images[0].url} alt={item.images[0].alt_text ?? item.title} loading="lazy" decoding="async" />}</div><div className="moderation-card__body"><label className="moderation-card__select"><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={bulkBusy || (bulkDecision === 'approve' && !selectableIds.includes(item.id))} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)) }} />{bulkDecision === 'approve' && !selectableIds.includes(item.id) ? 'No aprobable con los requisitos actuales' : 'Seleccionar para acción por lote'}</label><p className="eyebrow eyebrow--quiet">{item.category.name}</p><h2>{item.title}</h2><p>{item.description}</p><p><strong>{item.producer.public_name}</strong> · {item.unit} · Perfil {item.producer.profile_status === 'active' ? 'activo' : item.producer.profile_status === 'suspended' ? 'suspendido' : 'pendiente'} · Teléfono {item.producer.contact_verified ? 'verificado' : 'sin verificar'}</p>{reinstatement && <p className="moderation-feedback"><strong>Revisión tras reactivación:</strong> {reinstatement.reason} · {reinstatement.actor?.name ?? 'Equipo autorizado'}</p>}{approvalBlocked && <p className="moderation-feedback" role="status">{blockedReason}</p>}<div className="moderation-actions"><button className="button button--primary" disabled={busyId === item.id || bulkBusy || approvalBlocked} onClick={() => beginDecision(item, 'approve')}>Aprobar y publicar</button><button className="button button--outline" disabled={busyId === item.id || bulkBusy} onClick={() => beginDecision(item, 'request_changes')}>Solicitar cambios</button><button className="text-link" disabled={busyId === item.id || bulkBusy} onClick={() => beginDecision(item, 'reject')}>Rechazar</button></div>{decisionTarget?.item.id === item.id && <ValidatedForm className="moderation-decision-form" noValidate onSubmit={(event) => { event.preventDefault(); const reason = decisionReason.trim(); if (reason.length < 5) { setDecisionFieldError('Escribe el motivo con al menos cinco caracteres.'); document.getElementById(`moderation-reason-${item.id}`)?.focus(); return } void decide(item, decisionTarget.decision, reason) }}><TextAreaField id={`moderation-reason-${item.id}`} name="reason" label={decisionTarget.decision === 'approve' ? 'Nota de revisión' : 'Motivo de la decisión'} value={decisionReason} onChange={(value) => { setDecisionReason(value); setDecisionFieldError('') }} error={decisionFieldError} minLength={5} maxLength={1000} rows={3} required hint="Este motivo quedará en el historial de moderación y será visible al productor." /><div className="moderation-decision-form__actions"><button className="button button--primary" type="submit" disabled={busyId === item.id || bulkBusy} aria-busy={busyId === item.id}>Guardar decisión</button><button className="button button--outline" type="button" onClick={() => setDecisionTarget(null)}>Cancelar</button></div>{busyId === item.id && <p role="status">Guardando decisión…</p>}</ValidatedForm>}</div></article>
  })}</section></>}{queue && queue.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de publicaciones pendientes"><button className="button button--outline button--small" disabled={queue.current_page <= 1} onClick={() => { setSelectedIds([]); setBulkResult(null); setPage(queue.current_page - 1) }}>Anterior</button><span aria-live="polite">Página {queue.current_page} de {queue.last_page} · {queue.total} pendientes</span><button className="button button--outline button--small" disabled={queue.current_page >= queue.last_page} onClick={() => { setSelectedIds([]); setBulkResult(null); setPage(queue.current_page + 1) }}>Siguiente</button></nav>}</main><SiteFooter /></div>
}

function ReportsPage() {
  const [cases, setCases] = useState<Paginated<ReportCase> | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => {
    let current = true
    setCases(null)
    setLoadError('')
    void getReportCases(page).then((result) => {
      if (!current) return
      if (page > result.last_page && result.last_page > 0) { setPage(result.last_page); return }
      setCases(result)
    }).catch((reason: unknown) => { if (current) setLoadError(reason instanceof Error ? reason.message : 'No pudimos cargar los casos.') })
    return () => { current = false }
  }, [page, reload, loadAttempt])
  async function updateCase(item: ReportCase, status: 'reviewing' | 'resolved' | 'dismissed') {
    if (status !== 'reviewing' && item.status !== 'reviewing') { setActionError('Marca primero el caso en revisión antes de resolverlo o descartarlo.'); return }
    const note = notes[item.id]?.trim() ?? ''
    if (note.length < 5) {
      setFieldErrors((current) => ({ ...current, [item.id]: 'Escribe una nota privada de al menos cinco caracteres.' }))
      document.getElementById(`report-note-${item.id}`)?.focus()
      return
    }
    setFieldErrors((current) => ({ ...current, [item.id]: '' }))
    setActionError('')
    setBusy(item.id)
    try {
      const result = await updateReportCase(item.id, status, item.priority, note)
      if (status !== 'reviewing') {
        setCases(null)
        setReload((current) => current + 1)
      } else setCases((current) => current ? { ...current, data: current.data.map((entry) => entry.id === item.id ? { ...entry, status, assignee_id: result.assignee_id, assignee: result.assignee } : entry) } : current)
    }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'No pudimos actualizar el caso.') }
    finally { setBusy(null) }
  }
  async function updatePriority(item: ReportCase, priority: ReportCase['priority']) {
    setActionError('')
    setBusy(item.id)
    try {
      const result = await updateReportPriority(item.id, priority)
      setCases((current) => current ? { ...current, data: current.data.map((entry) => entry.id === item.id ? { ...entry, ...result } : entry) } : current)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No pudimos guardar la prioridad del caso.')
    } finally {
      setBusy(null)
    }
  }
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Casos y denuncias</h1><p>La información del reportante y las evidencias se mantienen privadas. Cada caso indica su prioridad, responsable y plazo de atención.</p><Link className="text-link" to="/admin/apelaciones">Revisar apelaciones de productores <ArrowRight size={15} /></Link>{actionError && <p role="alert">{actionError}</p>}{loadError ? <div className="empty-products" role="alert"><strong>No pudimos cargar los casos.</strong><span>{loadError}</span><button className="button button--outline" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Intentar de nuevo</button></div> : cases === null ? <p role="status">Cargando casos…</p> : cases.data.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay denuncias abiertas</strong></div> : <section className="dashboard-list" aria-label="Denuncias activas">{cases.data.map((item) => <article className="report-case" key={item.id}><div><p className="eyebrow eyebrow--quiet">{item.reason_code} · PRIORIDAD {item.priority}</p><h2>{item.resource_type === 'product' ? 'Reporte de oferta' : 'Reporte de productor'} · #{item.resource_id}</h2><Link className="text-link" to={`/admin/seguridad/casos/${item.id}`}>Abrir expediente <ArrowRight size={15} /></Link><p>{item.description}</p><small>Recibido {new Date(item.created_at).toLocaleString('es-PA')} · Responsable: {item.assignee?.name ?? 'Sin asignar'} · {item.evidence.length} evidencia(s) · ref. {item.public_reference.slice(0, 8)}</small><p className={item.sla_overdue ? 'report-case__sla report-case__sla--overdue' : 'report-case__sla'}>{item.sla_overdue ? 'Plazo vencido' : 'Vence'} {new Date(item.sla_due_at).toLocaleString('es-PA')}</p><label className="report-case__priority">Prioridad<select aria-label={`Prioridad del caso ${item.id}`} value={item.priority} disabled={busy === item.id} onChange={(event) => void updatePriority(item, event.currentTarget.value as ReportCase['priority'])}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label>{item.evidence.length > 0 && <div className="evidence-links">{item.evidence.map((evidence) => <a key={evidence.id} href={reportEvidenceUrl(item.id, evidence.id)} target="_blank" rel="noreferrer">Descargar evidencia ({evidence.mime_type})</a>)}</div>}<TextAreaField id={`report-note-${item.id}`} name={`report-note-${item.id}`} label="Nota privada para el historial" value={notes[item.id] ?? ''} onChange={(value) => { setNotes((current) => ({ ...current, [item.id]: value })); setFieldErrors((current) => ({ ...current, [item.id]: '' })) }} error={fieldErrors[item.id]} minLength={5} maxLength={1000} rows={3} required /></div><div className="moderation-actions"><button className="button button--outline" disabled={busy === item.id || item.status === 'reviewing'} aria-busy={busy === item.id} onClick={() => void updateCase(item, 'reviewing')}>{item.status === 'reviewing' ? 'Caso en revisión' : 'Tomar caso y revisar'}</button>{item.status === 'reviewing' && <><button className="button button--primary" disabled={busy === item.id} aria-busy={busy === item.id} onClick={() => void updateCase(item, 'resolved')}>Resolver</button><button className="text-link" disabled={busy === item.id} onClick={() => void updateCase(item, 'dismissed')}>Descartar</button></>}</div>{busy === item.id && <p role="status">Guardando el caso…</p>}</article>)}</section>}{cases && cases.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de casos"><button className="button button--outline button--small" disabled={cases.current_page <= 1} onClick={() => setPage(cases.current_page - 1)}>Anterior</button><span aria-live="polite">Página {cases.current_page} de {cases.last_page} · {cases.total} casos</span><button className="button button--outline button--small" disabled={cases.current_page >= cases.last_page} onClick={() => setPage(cases.current_page + 1)}>Siguiente</button></nav>}</main><SiteFooter /></div>
}

function AdminSecurityCasePage() {
  const { id: requestedId = '' } = useParams()
  const id = Number(requestedId)
  const [caseDetail, setCaseDetail] = useState<ReportCaseDetail | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [releaseTarget, setReleaseTarget] = useState(false)
  const currentCaseId = useRef(id)
  useLayoutEffect(() => { currentCaseId.current = id }, [id])
  useEffect(() => {
    let active = true
    if (!Number.isSafeInteger(id) || id < 1) { setError('El identificador del caso no es válido.'); return () => { active = false } }
    void getReportCase(id).then((result) => { if (active) { setCaseDetail(result); setError('') } }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'No pudimos cargar el expediente.') })
    return () => { active = false }
  }, [id, attempt])

  async function refreshCase() {
    const requestedId = id
    const refreshed = await getReportCase(requestedId)
    if (currentCaseId.current === requestedId) setCaseDetail(refreshed)
  }
  async function changePriority(priority: ReportCaseDetail['priority']) {
    if (!caseDetail) return
    setBusy(true); setActionError('')
    try { await updateReportPriority(id, priority); await refreshCase() }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'No pudimos guardar la prioridad del caso.') }
    finally { setBusy(false) }
  }
  async function decideCase(status: 'reviewing' | 'resolved' | 'dismissed') {
    if (!caseDetail) return
    const trimmed = note.trim()
    if (trimmed.length < 5) {
      setNoteError('Escribe una nota privada de al menos cinco caracteres.')
      document.getElementById(`case-detail-note-${id}`)?.focus()
      return
    }
    setNoteError(''); setActionError(''); setBusy(true)
    try {
      await updateReportCase(id, status, caseDetail.priority, trimmed)
      setNote('')
      await refreshCase()
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'No pudimos guardar la acción del caso.') }
    finally { setBusy(false) }
  }

  async function releaseCurrentCase() {
    if (!caseDetail || !caseDetail.can_release || busy) return
    const trimmed = note.trim()
    if (trimmed.length < 10) { setNoteError('Escribe un motivo de al menos diez caracteres para liberar el caso.'); document.getElementById(`case-detail-note-${id}`)?.focus(); setReleaseTarget(false); return }
    setBusy(true); setActionError(''); setNoteError('')
    try { await releaseReportCase(id, trimmed); setReleaseTarget(false); setNote(''); await refreshCase() }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'No pudimos liberar el caso. La nota sigue disponible para reintentar.') }
    finally { setBusy(false) }
  }

  const historyLabels: Record<string, string> = {
    'trust_safety.report_received': 'Se recibió el reporte',
    'trust_safety.report_updated': 'Se actualizó el caso',
    'trust_safety.report_released': 'Se devolvió el caso a la cola',
    'trust_safety.report_priority_changed': 'Se cambió la prioridad',
    'trust_safety.report_evidence_viewed': 'Se consultó una evidencia privada',
  }
  const statusLabels: Record<string, string> = { new: 'Nuevo', reviewing: 'En revisión', resolved: 'Resuelto', dismissed: 'Descartado' }
  const priorityLabels: Record<ReportCaseDetail['priority'], string> = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
  const changeLabels: Record<string, string> = { status: 'Estado', priority: 'Prioridad', assignee_id: 'Responsable' }

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/admin">Administración</Link><ChevronRight size={14} /><Link to="/admin/denuncias">Casos y denuncias</Link><ChevronRight size={14} /><span aria-current="page">Expediente</span></nav><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>{caseDetail ? `Expediente de seguridad · #${caseDetail.id}` : 'Expediente de seguridad'}</h1><p>Consulta el reporte, su recurso asociado y las acciones registradas. El contacto del reportante y las rutas internas de archivos permanecen privados.</p><Link className="text-link" to="/admin/denuncias">← Volver a casos</Link>{error ? <div className="empty-products" role="alert"><strong>{error}</strong>{error.includes('no tiene permiso') || error.includes('Inicia sesión') ? <Link className="button button--outline" to="/ingresar">Ingresar con una cuenta autorizada</Link> : <button className="button button--outline" type="button" onClick={() => { setError(''); setAttempt((current) => current + 1) }}>Intentar de nuevo</button>}</div> : !caseDetail ? <p role="status">Cargando expediente…</p> : <><section className="case-dossier" aria-labelledby="case-summary-title"><div className="case-dossier__summary"><div><p className="eyebrow eyebrow--quiet">REFERENCIA · {caseDetail.public_reference}</p><h2 id="case-summary-title">{caseDetail.reason_code} · {caseDetail.resource_type === 'product' ? 'Reporte de oferta' : 'Reporte de productor'}</h2><p className="case-dossier__description">{caseDetail.description}</p></div><div className="case-dossier__status"><span className={`status-pill status-pill--${caseDetail.status}`}>{statusLabels[caseDetail.status] ?? caseDetail.status}</span><span className={caseDetail.sla_overdue ? 'report-case__sla report-case__sla--overdue' : 'report-case__sla'}>{caseDetail.sla_overdue ? 'Plazo vencido' : 'Vence'} {new Date(caseDetail.sla_due_at).toLocaleString('es-PA')}</span></div></div><dl className="case-dossier__facts"><div><dt>Recibido</dt><dd>{new Date(caseDetail.created_at).toLocaleString('es-PA')}</dd></div><div><dt>Responsable</dt><dd>{caseDetail.assignee?.name ?? 'Sin asignar'}</dd></div><div><dt>Prioridad</dt><dd>{priorityLabels[caseDetail.priority]}</dd></div><div><dt>Evidencias</dt><dd>{caseDetail.evidence.length}</dd></div></dl></section>
      <section className="case-dossier__resource" aria-labelledby="case-resource-title"><p className="eyebrow eyebrow--quiet">RECURSO DENUNCIADO</p><h2 id="case-resource-title">{caseDetail.resource?.label ?? `${caseDetail.resource_type === 'product' ? 'Oferta' : 'Perfil'} · #${caseDetail.resource_id}`}</h2>{caseDetail.resource && <Link className="text-link" to={caseDetail.resource.type === 'product' ? `/productos/${caseDetail.resource.slug}` : `/productores/${caseDetail.resource.slug}`} target="_blank" rel="noreferrer">Abrir vista pública <ArrowUpRight size={15} /></Link>}{caseDetail.evidence.length > 0 && <div className="evidence-links">{caseDetail.evidence.map((evidence) => <a key={evidence.id} href={reportEvidenceUrl(id, evidence.id)} target="_blank" rel="noreferrer">Descargar evidencia ({evidence.mime_type} · {Math.ceil(evidence.size_bytes / 1024)} KB)</a>)}</div>}</section>
      <section className="case-dossier__actions" aria-labelledby="case-actions-title"><h2 id="case-actions-title">Revisión del caso</h2>{actionError && <p role="alert">{actionError}</p>}<label className="report-case__priority">Prioridad<select aria-label="Prioridad del expediente" value={caseDetail.priority} disabled={busy} onChange={(event) => void changePriority(event.currentTarget.value as ReportCaseDetail['priority'])}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label>{['new', 'reviewing'].includes(caseDetail.status) ? <><TextAreaField id={`case-detail-note-${id}`} name="resolution_note" label="Nota privada para el historial" value={note} onChange={(value) => { setNote(value); setNoteError('') }} error={noteError} minLength={releaseTarget ? 10 : 5} maxLength={1000} rows={3} required hint={releaseTarget ? 'Para devolverlo a la cola, explica el motivo con al menos diez caracteres.' : undefined} /><div className="moderation-actions"><button className="button button--outline" type="button" disabled={busy || caseDetail.status === 'reviewing'} aria-busy={busy} onClick={() => void decideCase('reviewing')}>Tomar caso y revisar</button>{caseDetail.status === 'reviewing' && <><button className="button button--primary" type="button" disabled={busy} aria-busy={busy} onClick={() => void decideCase('resolved')}>Resolver caso</button><button className="text-link" type="button" disabled={busy} onClick={() => void decideCase('dismissed')}>Descartar caso</button><button className="button button--outline" type="button" disabled={busy || !caseDetail.can_release} onClick={() => setReleaseTarget(true)}>Devolver a la cola</button></>}</div>{busy && <p role="status">Guardando la acción…</p>}</> : <p role="status">Este caso está cerrado. Puedes consultar su historial de decisiones.</p>}</section>
      <section className="case-dossier__history" aria-labelledby="case-history-title"><h2 id="case-history-title">Historial de acciones</h2>{caseDetail.history.length === 0 ? <p>Aún no hay acciones registradas para este caso.</p> : <ol className="case-timeline">{caseDetail.history.map((event, index) => <li key={`${event.action}-${event.created_at}-${index}`}><div className="case-timeline__marker" aria-hidden="true" /><div><h3>{historyLabels[event.action] ?? 'Actividad registrada'}</h3><p>{event.actor?.name ?? 'Sistema' } · {new Date(event.created_at).toLocaleString('es-PA')}</p>{event.reason && <blockquote>{event.reason}</blockquote>}{Object.entries(event.changes).map(([key, value]) => <p key={key}><strong>{changeLabels[key] ?? key}:</strong> {String(value.from ?? '—')} → {String(value.to ?? '—')}</p>)}</div></li>)}</ol>}</section>
    </>}</main><SiteFooter />{releaseTarget && <ConfirmActionDialog title="Devolver caso a la cola" accessibleName="Devolver caso a la cola" description="El caso dejará tu asignación y volverá a la cola de casos nuevos. Revisa que la nota privada explique el motivo." confirmLabel="Devolver a la cola" busyLabel="Devolviendo…" busy={busy} error={actionError} onCancel={() => setReleaseTarget(false)} onConfirm={() => void releaseCurrentCase()} />}</div>
}

function AdminHomePage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState('')
  const [canReviewMfaRecovery, setCanReviewMfaRecovery] = useState(false)
  useEffect(() => { void getAdminMetrics().then(setMetrics).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar el panel.')) }, [])
  useEffect(() => { let active = true; void getCurrentUserPermissions().then((permissions) => { if (active) setCanReviewMfaRecovery(permissions.includes('security.mfa_recovery.review')) }).catch(() => { if (active) setCanReviewMfaRecovery(false) }); return () => { active = false } }, [])
  const recoveryLocked = error.includes('El acceso administrativo está bloqueado')
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">OPERACIÓN DEL MERCADO</p><h1>Administración</h1>{error ? <div className="empty-products" role="alert"><strong>{recoveryLocked ? 'El acceso administrativo está bloqueado durante la recuperación de MFA.' : error}</strong>{recoveryLocked && <p>Vuelve a ingresar para continuar con la reinscripción de tu autenticador.</p>}<Link className="button button--primary" to="/ingresar">{recoveryLocked ? 'Volver a ingresar' : 'Ingresar'}</Link></div> : !metrics ? <p role="status">Cargando métricas operativas…</p> : <><p>Indicadores agregados para orientar la operación. Las intenciones de contacto no equivalen a conversaciones ni ventas.</p><section className="admin-metric-grid"><article><span>Productores</span><strong>{Object.values(metrics.producers).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.producers).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></article><article><span>Publicaciones</span><strong>{Object.values(metrics.products).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.products).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></article><article><span>Casos abiertos</span><strong>{metrics.reports_open}</strong><small>Denuncias nuevas o en revisión</small></article><article><span>Intenciones de contacto</span><strong>{metrics.contact_intentions_30d}</strong><small>Últimos 30 días</small></article><article><span>Búsquedas sin resultados</span><strong>{metrics.searches_without_results_30d}</strong><small>Últimos 30 días</small></article><article><span>Tiempo medio de moderación</span><strong>{metrics.average_moderation_hours_30d === null ? '—' : `${metrics.average_moderation_hours_30d} h`}</strong><small>Hasta la primera decisión humana · {metrics.moderation_decisions_30d} decisiones en 30 días</small></article></section><nav className="admin-links" aria-label="Herramientas administrativas"><Link to="/admin/publicaciones">Cola de moderación <ArrowRight size={15} /></Link><Link to="/admin/denuncias">Casos y denuncias <ArrowRight size={15} /></Link><Link to="/admin/alertas">Alertas de seguridad <ArrowRight size={15} /></Link>{canReviewMfaRecovery && <Link to="/admin/seguridad/recuperacion-mfa">Recuperación de MFA <ShieldCheck size={15} /></Link>}<Link to="/admin/apelaciones">Apelaciones de productores <ArrowRight size={15} /></Link><Link to="/admin/registro-asistido">Registro asistido <ArrowRight size={15} /></Link><Link to="/admin/productores">Directorio de productores <ArrowRight size={15} /></Link><Link to="/admin/catalogos">Categorías y ubicaciones <ArrowRight size={15} /></Link><Link to="/admin/mensajes">Mensajes de contacto <ArrowRight size={15} /></Link><Link to="/admin/usuarios">Usuarios y permisos <ArrowRight size={15} /></Link><Link to="/admin/reportes">Métricas <ArrowRight size={15} /></Link><Link to="/admin/auditoria">Auditoría <ArrowRight size={15} /></Link></nav></>}</main><SiteFooter /></div>
}

function AdminProducersPage({ assistedOnly = false }: { assistedOnly?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q')?.trim() ?? ''
  const requestedStatus = searchParams.get('status') ?? ''
  const status = ['pending', 'active', 'suspended'].includes(requestedStatus) ? requestedStatus : ''
  const requestedPage = Number(searchParams.get('page') ?? 1)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [results, setResults] = useState<Paginated<AdminProducer> | null>(null)
  const [staffPermissions, setStaffPermissions] = useState<string[]>([])
  const [error, setError] = useState('')
  const [statusTarget, setStatusTarget] = useState<AdminProducer | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [assistedLocations, setAssistedLocations] = useState<PublicLocation[]>([])
  const [assistedLocationsLoading, setAssistedLocationsLoading] = useState(true)
  const [assistedLocationsError, setAssistedLocationsError] = useState(false)
  const [assistedLocationsRetry, setAssistedLocationsRetry] = useState(0)
  const [assistedSubmitting, setAssistedSubmitting] = useState(false)
  const [assistedMessage, setAssistedMessage] = useState('')
  const [assistedError, setAssistedError] = useState('')
  const [assistedFormVersion, setAssistedFormVersion] = useState(0)
  const assistedSubmittingRef = useRef(false)
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null)
  const directoryHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const canAssist = staffPermissions.includes('producers.assist')
  const canSuspend = staffPermissions.includes('producers.suspend')
  useEffect(() => { void getCurrentUserPermissions().then(setStaffPermissions).catch(() => setStaffPermissions([])) }, [])
  useEffect(() => {
    let active = true
    setAssistedLocationsLoading(true)
    setAssistedLocationsError(false)
    void listLocations().then((locations) => {
      if (active) setAssistedLocations(locations)
    }).catch(() => {
      if (active) {
        setAssistedLocations([])
        setAssistedLocationsError(true)
      }
    }).finally(() => {
      if (active) setAssistedLocationsLoading(false)
    })
    return () => { active = false }
  }, [assistedLocationsRetry])
  useEffect(() => {
    if (assistedOnly) return
    const controller = new AbortController()
    setResults(null); setError('')
    void getAdminProducers({ q: query, status: ['pending', 'active', 'suspended'].includes(status) ? status as 'pending' | 'active' | 'suspended' : undefined, page }, controller.signal)
      .then(setResults)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el directorio.') })
    return () => controller.abort()
  }, [query, status, page, reloadKey, assistedOnly])
  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    const data = new FormData(event.currentTarget)
    const nextQuery = String(data.get('q') ?? '').trim()
    const nextStatus = String(data.get('status') ?? '')
    if (nextQuery) next.set('q', nextQuery)
    if (['pending', 'active', 'suspended'].includes(nextStatus)) next.set('status', nextStatus)
    setSearchParams(next)
  }
  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(nextPage))
    setSearchParams(next)
  }
  async function submitAssistedProducer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (assistedSubmittingRef.current) return
    assistedSubmittingRef.current = true
    setAssistedSubmitting(true)
    setAssistedError('')
    setAssistedMessage('')
    const form = event.currentTarget
    const data = new FormData(form)
    try {
      await registerProducer({ name: String(data.get('name')), email: String(data.get('email')), password: String(data.get('password')), public_name: String(data.get('public_name')), activity: String(data.get('activity') ?? ''), location_id: Number(data.get('location_id')), phone: String(data.get('phone')), terms_version: 'terms-2026-10', privacy_version: 'privacy-2026-10', producer_authorized: data.get('producer_authorized') === 'on', terms_confirmed: data.get('terms_confirmed') === 'on', privacy_confirmed: data.get('privacy_confirmed') === 'on' }, true)
      setAssistedMessage('Cuenta creada con registro asistido y autorización registrada. El operador sigue en su sesión. El productor deberá iniciar su propia sesión y verificar el teléfono.')
      form.reset()
      setAssistedFormVersion((current) => current + 1)
      setReloadKey((current) => current + 1)
    } catch (reason) {
      setAssistedError(reason instanceof Error ? reason.message : 'No se pudo registrar al productor. Conservamos los datos para que puedas reintentar.')
    } finally {
      assistedSubmittingRef.current = false
      setAssistedSubmitting(false)
    }
  }
  function openStatusDialog(event: React.MouseEvent<HTMLButtonElement>, producer: AdminProducer) {
    statusTriggerRef.current = event.currentTarget
    setStatusReason(''); setStatusError(''); setStatusMessage(''); setStatusTarget(producer)
  }
  function closeStatusDialog() {
    if (statusBusy) return
    setStatusTarget(null); setStatusReason(''); setStatusError('')
    window.setTimeout(() => statusTriggerRef.current?.focus(), 0)
  }
  async function saveProducerStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!statusTarget) return
    const reason = statusReason.trim()
    if (reason.length < 5) { setStatusError('Escribe el motivo con al menos cinco caracteres.'); return }
    const next = statusTarget.profile_status === 'active' ? 'suspended' : 'active'
    setStatusBusy(true); setStatusError('')
    try {
      const result = await setAdminProducerStatus(statusTarget.id, next, reason)
      setStatusMessage(next === 'suspended' ? `Se suspendió el perfil de ${statusTarget.public_name}. Sus ofertas dejaron de estar disponibles.` : statusTarget.profile_status === 'suspended' ? `Se reactivó el perfil de ${statusTarget.public_name}.${result.products_queued_for_review ? ` ${result.products_queued_for_review} publicaciones pasaron a revisión humana.` : ''}` : `Se activó el perfil de ${statusTarget.public_name}.`)
      setStatusTarget(null); setStatusReason(''); setReloadKey((current) => current + 1)
      window.setTimeout(() => directoryHeadingRef.current?.focus(), 0)
    } catch (failure) {
      setStatusError(failure instanceof Error ? failure.message : 'No se pudo actualizar el perfil. Conservamos el motivo para que puedas reintentar.')
    } finally { setStatusBusy(false) }
  }
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · APOYO A PRODUCTORES</p><h1 ref={directoryHeadingRef} tabIndex={-1}>{assistedOnly ? 'Registro asistido de productores' : 'Directorio de productores'}</h1>{statusMessage && <p className="moderation-feedback" role="status">{statusMessage}</p>}
    {!assistedOnly && <ValidatedForm key={`${query}|${status}`} className="admin-producer-filters" onSubmit={applyFilters}>
      <label className="catalog-search"><Search size={18} /><span className="sr-only">Buscar productor</span><input type="search" role="searchbox" aria-label="Buscar productor" name="q" defaultValue={query} placeholder="Nombre o correo" /></label>
      <label className="catalog-filter"><span>Estado del perfil</span><select aria-label="Filtrar por estado del perfil" name="status" defaultValue={status}><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="active">Activo</option><option value="suspended">Suspendido</option></select></label>
      <button className="button button--outline" type="submit">Aplicar filtros</button>
    </ValidatedForm>}
    {assistedOnly && !canAssist && <p role="alert">Tu cuenta no tiene permiso para registrar productores de forma asistida.</p>}
    {canAssist && <details className="assisted-registration" open={assistedOnly}><summary>{assistedOnly ? 'Registro de productor con autorización' : 'Registrar un productor con su autorización'}</summary><p>Completa el formulario con el productor presente o con su autorización documentada. El perfil quedará atribuido a tu cuenta y sin teléfono público hasta que el productor verifique el número e inicie su propia sesión.</p>{assistedError && <p role="alert">{assistedError}</p>}{assistedMessage && <p role="status">{assistedMessage}</p>}<ValidatedForm key={assistedFormVersion} className="auth-form" aria-busy={assistedSubmitting} onSubmit={(event) => void submitAssistedProducer(event)}><label>Nombre del productor<input name="name" required maxLength={120} disabled={assistedSubmitting} /></label><label>Correo electrónico del productor<input name="email" type="email" required disabled={assistedSubmitting} /></label><label>Nombre público<input name="public_name" required maxLength={120} disabled={assistedSubmitting} /></label><label>Actividad principal<input name="activity" maxLength={120} disabled={assistedSubmitting} /></label><fieldset className="location-fieldset" disabled={assistedSubmitting}><legend>Ubicación de tu emprendimiento</legend><LocationPicker locations={assistedLocations} idPrefix="assisted-location" required disabled={assistedSubmitting || assistedLocationsLoading || assistedLocationsError || assistedLocations.length === 0} /></fieldset>{assistedLocationsError && <div role="alert"><span>No pudimos cargar las localidades. </span><button className="text-link" type="button" onClick={() => setAssistedLocationsRetry((attempt) => attempt + 1)}>Reintentar</button></div>}{!assistedLocationsLoading && !assistedLocationsError && assistedLocations.length === 0 && <p role="alert">No hay localidades disponibles para el registro asistido.</p>}<label>Teléfono privado<input name="phone" type="tel" autoComplete="tel" placeholder="6000-1234" required maxLength={40} disabled={assistedSubmitting} /><small>Panamá: ocho dígitos; otros países deben incluir el prefijo internacional.</small></label><label>Clave temporal para entrega privada<input name="password" type="password" minLength={12} required autoComplete="new-password" disabled={assistedSubmitting} /></label><label className="auth-consent"><input name="producer_authorized" type="checkbox" required disabled={assistedSubmitting} />El productor autorizó este registro y la recopilación de sus datos.</label><label className="auth-consent"><input name="terms_confirmed" type="checkbox" required disabled={assistedSubmitting} />El productor confirmó los términos del servicio (terms-2026-10).</label><label className="auth-consent"><input name="privacy_confirmed" type="checkbox" required disabled={assistedSubmitting} />El productor confirmó haber leído el aviso de privacidad (privacy-2026-10).</label><button className="button button--primary" type="submit" disabled={assistedSubmitting || assistedLocationsLoading || assistedLocationsError || assistedLocations.length === 0}>{assistedSubmitting ? 'Registrando productor…' : 'Registrar productor'}</button></ValidatedForm></details>}
    {!assistedOnly && <>{error && <p role="status">{error}</p>}{error && error.includes('cuenta creada') ? null : error ? <div className="empty-products" role="alert"><strong>{error}</strong><Link className="button button--primary" to="/ingresar">Ingresar</Link></div> : !results ? <p role="status">Cargando productores…</p> : <><p className="catalog-result-count">{results.total} {results.total === 1 ? 'productor' : 'productores'} encontrados</p>{results.data.length ? <div className="dashboard-list">{results.data.map((producer) => <article className="dashboard-row" key={producer.id}><div><h2>{producer.public_name}</h2><p>{producer.account && <>{producer.account.name} · {producer.account.email} · </>}{producer.products_count} ofertas</p><span className={`status-pill status-pill--${producer.profile_status}`}>{producer.profile_status}</span></div><div className="admin-producer-actions"><Link className="button button--quiet button--small" to={`/admin/productores/${producer.id}`}>Ver ficha</Link>{producer.profile_status === 'active' && canSuspend && <button ref={statusTriggerRef} className="button button--outline button--small" type="button" onClick={(event) => openStatusDialog(event, producer)}>Suspender</button>}{producer.profile_status !== 'active' && canAssist && <button ref={statusTriggerRef} className="button button--outline button--small" type="button" onClick={(event) => openStatusDialog(event, producer)}>{producer.profile_status === 'suspended' ? 'Reactivar' : 'Activar'}</button>}</div></article>)}</div> : <div className="empty-products"><strong>No encontramos productores con esos filtros</strong><span>Prueba con otro nombre o estado.</span></div>}{results.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de productores"><button className="button button--outline button--small" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Página anterior</button><span>Página {results.current_page} de {results.last_page}</span><button className="button button--outline button--small" disabled={page >= results.last_page} onClick={() => goToPage(page + 1)}>Página siguiente</button></nav>}</>}</>}</main>{statusTarget && <ConfirmActionDialog title={statusTarget.profile_status === 'active' ? 'Suspender perfil' : statusTarget.profile_status === 'suspended' ? 'Reactivar perfil' : 'Activar perfil'} accessibleName={`Cambiar estado de ${statusTarget.public_name}`} description={statusTarget.profile_status === 'active' ? `Al suspender a ${statusTarget.public_name}, sus ofertas dejarán de estar disponibles.` : statusTarget.profile_status === 'suspended' ? `Al reactivar a ${statusTarget.public_name}, sus ofertas publicadas volverán a revisión humana.` : `Al activar a ${statusTarget.public_name}, sus ofertas seguirán sujetas a revisión humana antes de aparecer en el catálogo.`} confirmLabel={statusTarget.profile_status === 'active' ? 'Suspender perfil' : statusTarget.profile_status === 'suspended' ? 'Reactivar perfil' : 'Activar perfil'} busyLabel={statusTarget.profile_status === 'active' ? 'Suspendiendo…' : statusTarget.profile_status === 'suspended' ? 'Reactivando…' : 'Activando…'} busy={statusBusy} error={statusError} confirmFormId="admin-producer-status-form" initialFocusId="admin-producer-status-reason" onCancel={closeStatusDialog}><ValidatedForm id="admin-producer-status-form" className="auth-form" onSubmit={(event) => void saveProducerStatus(event)}><TextAreaField id="admin-producer-status-reason" name="reason" label={statusTarget.profile_status === 'active' ? 'Motivo de suspensión' : statusTarget.profile_status === 'suspended' ? 'Motivo de reactivación' : 'Motivo de activación'} value={statusReason} onChange={setStatusReason} minLength={5} maxLength={1000} rows={3} required disabled={statusBusy} hint="El motivo se guardará en la bitácora del perfil." /></ValidatedForm></ConfirmActionDialog>}<SiteFooter /></div>
}

function AdminTrustReview({ detail, onUpdated }: { detail: AdminProducerDetail; onUpdated: (detail: AdminProducerDetail) => void }) {
  const [permissions, setPermissions] = useState<string[]>([])
  const [level, setLevel] = useState<Exclude<ProducerVerificationLevel, 'unverified'>>(detail.producer.verification_level === 'unverified' ? 'contact_confirmed' : detail.producer.verification_level)
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void getCurrentUserPermissions().then(setPermissions).catch(() => setPermissions([])) }, [])
  const canReview = permissions.includes('producers.verify')
  const options = detail.producer.verification_level === 'contact_confirmed'
    ? [{ value: 'identity_reviewed', label: 'Identidad revisada' }]
    : detail.producer.verification_level === 'identity_reviewed'
      ? [{ value: 'producer_validated', label: 'Productor validado' }, { value: 'contact_confirmed', label: 'Contacto confirmado' }]
      : detail.producer.verification_level === 'producer_validated'
        ? [{ value: 'identity_reviewed', label: 'Identidad revisada' }, { value: 'contact_confirmed', label: 'Contacto confirmado' }]
        : []
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason.trim().length < 5) { setFieldError('Explica la decisión con al menos cinco caracteres.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const updated = await setAdminProducerTrustLevel(detail.producer.id, level, reason.trim())
      setMessage('Nivel actualizado y cambio guardado en la auditoría.')
      setReason(''); setFieldError('')
      onUpdated({ ...detail, producer: { ...detail.producer, verification_level: updated.verification_level }, trust_reviews: [{ from_level: detail.producer.verification_level, to_level: updated.verification_level, reason: reason.trim(), actor: 'Tú', created_at: new Date().toISOString() }, ...detail.trust_reviews] })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el nivel.') }
    finally { setBusy(false) }
  }
  return <section className="dashboard-list admin-producer-history" aria-labelledby="trust-review-title"><h2 id="trust-review-title">Nivel de revisión</h2><p>Los niveles describen las comprobaciones realizadas; no garantizan calidad, pago ni entrega.</p><VerificationBadge level={detail.producer.verification_level} /><p>El nivel público efectivo baja a “Contacto sin confirmar” si el teléfono deja de estar verificado.</p>{canReview && <ValidatedForm className="auth-form trust-review-form" onSubmit={(event) => { void save(event) }}><SelectField id="trust-review-level" name="level" label="Nuevo nivel" value={level} disabled={busy || options.length === 0} onChange={(event) => setLevel(event.currentTarget.value as typeof level)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField><TextAreaField id="trust-review-reason" name="reason" label="Motivo de revisión" value={reason} onChange={(value) => { setReason(value); setFieldError('') }} error={fieldError} minLength={5} maxLength={1000} rows={3} required disabled={busy} hint="No adjuntes documentos ni datos sensibles; registra solo la decisión y su fundamento." /><button className="button button--primary" disabled={busy || options.length === 0} aria-busy={busy}>{busy ? 'Guardando…' : 'Guardar nivel'}</button></ValidatedForm>}{!canReview && <p>Tu cuenta puede consultar el historial, pero no cambiar el nivel de revisión.</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<h3>Historial de cambios</h3>{(detail.trust_reviews ?? []).length ? detail.trust_reviews.map((review, index) => <article className="dashboard-row" key={`${review.created_at}-${index}`}><div><strong>{review.from_level.replaceAll('_', ' ')} → {review.to_level.replaceAll('_', ' ')}</strong><p>{review.reason}</p><small>{review.actor ?? 'Sistema'} · {new Date(review.created_at).toLocaleString('es-PA')}</small></div></article>) : <p>No hay revisiones de identidad registradas.</p>}</section>

}

function AdminProducerStatusControl({ detail, onUpdated }: { detail: AdminProducerDetail; onUpdated: (detail: AdminProducerDetail) => void }) {
  const [permissions, setPermissions] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void getCurrentUserPermissions().then(setPermissions).catch(() => setPermissions([])) }, [])
  const suspended = detail.producer.profile_status === 'suspended'
  const pending = detail.producer.profile_status === 'pending'
  const canChange = permissions.includes(suspended || pending ? 'producers.assist' : 'producers.suspend')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason.trim().length < 5) { setFieldError('Explica la decisión con al menos cinco caracteres.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const nextStatus = detail.producer.profile_status === 'active' ? 'suspended' : 'active'
      const result = await setAdminProducerStatus(detail.producer.id, nextStatus, reason.trim())
      const queued = result.products_queued_for_review
      setMessage(nextStatus === 'suspended' ? 'Perfil suspendido; las publicaciones dejaron de estar disponibles.' : suspended ? `Perfil reactivado.${queued ? ` ${queued} publicaciones quedaron pendientes de revisión humana.` : ''}` : 'Perfil activado.')
      onUpdated({ ...detail, producer: { ...detail.producer, profile_status: result.profile_status, suspension_reason: result.profile_status === 'suspended' ? reason.trim() : null }, audit: [{ action: 'producer.status_changed', before_values: { profile_status: detail.producer.profile_status }, after_values: { profile_status: result.profile_status }, reason: reason.trim(), actor: 'Tú', created_at: new Date().toISOString() }, ...detail.audit] })
      setReason(''); setFieldError('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el estado del productor.') }
    finally { setBusy(false) }
  }
  return <section className="dashboard-list admin-producer-history" aria-labelledby="producer-status-title"><h2 id="producer-status-title">Estado del perfil</h2><p>Suspender oculta las publicaciones disponibles. Reactivar devuelve las ofertas publicadas a revisión humana; activar un perfil nuevo no publica sus ofertas.</p>{detail.producer.suspension_reason && <p><strong>Motivo registrado:</strong> {detail.producer.suspension_reason}</p>}{canChange && <ValidatedForm className="auth-form trust-review-form" onSubmit={(event) => { void save(event) }}><TextAreaField id="producer-status-reason" name="reason" label={suspended ? 'Motivo de reactivación' : pending ? 'Motivo de activación' : 'Motivo de suspensión'} value={reason} onChange={(value) => { setReason(value); setFieldError('') }} error={fieldError} minLength={5} maxLength={1000} rows={3} required disabled={busy} hint="El motivo se guarda en la bitácora del perfil." /><button className={suspended || pending ? 'button button--primary' : 'button button--outline'} disabled={busy} aria-busy={busy}>{busy ? suspended ? 'Reactivando…' : pending ? 'Activando…' : 'Suspendiendo…' : suspended ? 'Reactivar perfil' : pending ? 'Activar perfil' : 'Suspender perfil'}</button></ValidatedForm>}{!canChange && <p>Tu cuenta puede consultar el estado, pero no cambiarlo.</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</section>
}

function AdminProducerDetailPage() {
  const { id = '' } = useParams()
  const [detail, setDetail] = useState<AdminProducerDetail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void getAdminProducerDetail(id).then(setDetail).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar la ficha.')) }, [id])
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell">
    <Link className="back-link" to="/admin/productores">← Volver al directorio</Link><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · FICHA DE PRODUCTOR</p>
    {error ? <div role="alert" className="empty-products"><strong>{error}</strong><Link className="button button--primary" to="/admin/productores">Volver al directorio</Link></div> : !detail ? <p role="status">Cargando ficha e historial…</p> : <>
      <h1>{detail.producer.public_name}</h1><p className="producer-detail-subtitle">{detail.producer.activity ?? 'Actividad no indicada'} · {detail.producer.location?.name ?? 'Ubicación no indicada'}</p>
      <AdminProducerStatusControl detail={detail} onUpdated={setDetail} />
      <AdminTrustReview detail={detail} onUpdated={setDetail} />
      <div className="admin-producer-summary">
        <section className="guide-card"><span className="guide-card__step">CUENTA</span><h2>{detail.account.name}</h2><p>{detail.account.email}</p><p>Registro: {detail.producer.registration_method === 'assisted' ? 'Asistido' : 'Directo'}{detail.producer.registered_by ? ` · ${detail.producer.registered_by}` : ''}</p><span className={`status-pill status-pill--${detail.producer.profile_status}`}>{detail.producer.profile_status}</span></section>
        <section className="guide-card"><span className="guide-card__step">VERIFICACIÓN DE CONTACTO</span><h2>{detail.producer.contact_level === 'unverified' ? 'Contacto sin confirmar' : 'Contacto confirmado'}</h2><p>{detail.producer.phone_verified_at ? `Confirmado ${new Date(detail.producer.phone_verified_at).toLocaleDateString('es-PA')}` : 'El productor aún no confirmó control del teléfono.'}</p><p>El indicador confirma control del teléfono; no certifica identidad, calidad ni transacción.</p></section>
        <section className="guide-card"><span className="guide-card__step">CONSENTIMIENTOS</span>{detail.consents.length ? detail.consents.map((consent) => <p key={consent.id}>{consent.consent_type} · {consent.version} · {new Date(consent.accepted_at).toLocaleDateString('es-PA')}</p>) : <p>No hay consentimientos registrados.</p>}</section>
      </div>
      <section className="dashboard-list admin-producer-history"><h2>Publicaciones recientes</h2>{detail.products.length ? detail.products.map((product) => <article className="dashboard-row" key={product.id}><strong>{product.title}</strong><span className={`status-pill status-pill--${product.status}`}>{product.status.replaceAll('_', ' ')}</span></article>) : <p>Este productor aún no tiene publicaciones.</p>}</section>
      <section className="dashboard-list admin-producer-history"><h2>Verificaciones de contacto</h2>{detail.verifications.length ? detail.verifications.map((verification) => <article className="dashboard-row" key={verification.id}><div><strong>{verification.channel.toLocaleUpperCase('es-PA')} · {verification.status}</strong><p>{verification.verified_at ? `Confirmada ${new Date(verification.verified_at).toLocaleString('es-PA')}` : `Intentos registrados: ${verification.attempts_count}`}</p></div></article>) : <p>No hay intentos de verificación registrados.</p>}</section>
      <section className="dashboard-list admin-producer-history"><h2>Historial de publicaciones</h2>{detail.product_history.length ? detail.product_history.map((entry, index) => <article className="dashboard-row" key={`${entry.product_title}-${entry.created_at}-${index}`}><div><strong>{entry.product_title}: {entry.from_status ? entry.from_status.replaceAll('_', ' ') : 'inicio'} → {entry.to_status.replaceAll('_', ' ')}</strong><p>{entry.reason}</p><small>{entry.actor ?? 'Sistema'} · {new Date(entry.created_at).toLocaleString('es-PA')}</small></div></article>) : <p>No hay cambios de estado registrados.</p>}</section>
      <section className="dashboard-list admin-producer-history"><h2>Bitácora del perfil</h2>{detail.audit.length ? detail.audit.map((entry, index) => <article className="dashboard-row" key={`${entry.action}-${entry.created_at}-${index}`}><div><strong>{entry.action}</strong><p>{entry.reason}</p><small>{entry.actor ?? 'Sistema'} · {new Date(entry.created_at).toLocaleString('es-PA')}</small></div></article>) : <p>No hay eventos administrativos del perfil.</p>}</section>
    </>}</main><SiteFooter /></div>
}

function AdminProducerAppealsPage() {
  const [appeals, setAppeals] = useState<AdminProducerAppeal[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let current = true
    setAppeals(null)
    setLoadError('')
    void getAdminProducerAppeals().then((result) => { if (current) setAppeals(result) }).catch((reason: unknown) => { if (current) setLoadError(reason instanceof Error ? reason.message : 'No pudimos cargar las apelaciones.') })
    return () => { current = false }
  }, [loadAttempt])

  async function decide(appeal: AdminProducerAppeal, decision: 'reinstated' | 'upheld') {
    const resolution = notes[appeal.id]?.trim() ?? ''
    if (resolution.length < 10) {
      setFieldErrors((current) => ({ ...current, [appeal.id]: 'Escribe una resolución de al menos diez caracteres.' }))
      document.getElementById(`appeal-resolution-${appeal.id}`)?.focus()
      return
    }
    setFieldErrors((current) => ({ ...current, [appeal.id]: '' }))
    setBusy(appeal.id)
    setError('')
    try {
      const result = await decideProducerAppeal(appeal.id, decision, resolution)
      setAppeals((current) => current?.filter((item) => item.id !== appeal.id) ?? [])
      setMessage(decision === 'reinstated' ? `Apelación aceptada; perfil restablecido y ${result.products_queued_for_review} ofertas enviadas a revisión humana.` : 'Apelación revisada; la suspensión se mantiene.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos guardar la resolución.') }
    finally { setBusy(null) }
  }

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Apelaciones de productores</h1><p>Revisa el motivo de suspensión y la respuesta del productor. Toda resolución queda auditada y debe incluir una explicación.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{loadError ? <div role="alert" className="empty-products"><strong>No pudimos cargar las apelaciones.</strong><span>{loadError}</span><button className="button button--outline" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Intentar de nuevo</button></div> : appeals === null ? <p role="status">Cargando apelaciones…</p> : appeals.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay apelaciones pendientes</strong></div> : <section className="dashboard-list">{appeals.map((appeal) => <article className="appeal-card" key={appeal.id}><p className="eyebrow eyebrow--quiet">RECIBIDA {new Date(appeal.submitted_at).toLocaleString('es-PA')} · SOLICITADA POR {appeal.submitter.name}</p><h2>{appeal.producer.public_name}</h2><p><strong>Motivo de suspensión:</strong> {appeal.producer.suspension_reason ?? 'No hay motivo guardado en el perfil.'}</p><p className="appeal-card__reason"><strong>Solicitud del productor:</strong> {appeal.reason}</p>{appeal.published_products_count > 0 && <p className="moderation-feedback" role="note">Si aceptas la apelación, el perfil se restablecerá y {appeal.published_products_count} {appeal.published_products_count === 1 ? 'oferta publicada pasará' : 'ofertas publicadas pasarán'} a revisión humana antes de volver al catálogo.</p>}<TextAreaField id={`appeal-resolution-${appeal.id}`} name={`appeal-resolution-${appeal.id}`} label="Resolución y motivo" value={notes[appeal.id] ?? ''} onChange={(value) => { setNotes((current) => ({ ...current, [appeal.id]: value })); setFieldErrors((current) => ({ ...current, [appeal.id]: '' })) }} error={fieldErrors[appeal.id]} minLength={10} maxLength={1000} rows={3} required /><div className="detail-actions"><button className="button button--primary button--small" disabled={busy === appeal.id} aria-busy={busy === appeal.id} onClick={() => void decide(appeal, 'reinstated')}>Aceptar y restablecer perfil</button><button className="button button--outline button--small" disabled={busy === appeal.id} aria-busy={busy === appeal.id} onClick={() => void decide(appeal, 'upheld')}>Mantener suspensión</button></div>{busy === appeal.id && <p role="status">Guardando la resolución…</p>}</article>)}</section>}</main><SiteFooter /></div>
}

function AdminSecurityAlertsPage() {
  const [alerts, setAlerts] = useState<Paginated<RiskAlert> | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [permissionsError, setPermissionsError] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let current = true
    void getCurrentUserPermissions()
      .then((permissions) => { if (current) setCanManage(permissions.includes('security.alerts.manage')) })
      .catch(() => { if (current) setPermissionsError('No pudimos confirmar el permiso de gestión; las acciones permanecen ocultas.') })
      .finally(() => { if (current) setPermissionsLoaded(true) })
    return () => { current = false }
  }, [])
  useEffect(() => {
    let current = true
    setAlerts(null)
    setLoadError('')
    void getAdminSecurityAlerts(page).then((result) => {
      if (!current) return
      if (page > result.last_page && result.last_page > 0) { setPage(result.last_page); return }
      setAlerts(result)
    }).catch((reason: unknown) => { if (current) setLoadError(reason instanceof Error ? reason.message : 'No pudimos cargar las alertas.') })
    return () => { current = false }
  }, [page, reload, loadAttempt])

  async function decide(alert: RiskAlert, status: 'reviewing' | 'resolved' | 'dismissed') {
    if (!canManage) return
    const note = notes[alert.id]?.trim() ?? ''
    if (note.length < 10) {
      setFieldErrors((current) => ({ ...current, [alert.id]: 'Escribe una nota de al menos diez caracteres.' }))
      document.getElementById(`risk-alert-note-${alert.id}`)?.focus()
      return
    }
    setFieldErrors((current) => ({ ...current, [alert.id]: '' }))
    setBusy(alert.id)
    setError('')
    try {
      await updateAdminSecurityAlert(alert.id, status, note)
      setAlerts(null)
      setReload((current) => current + 1)
      setMessage(status === 'reviewing' ? 'Alerta asignada a tu revisión.' : status === 'resolved' ? 'Revisión cerrada y auditada.' : 'Alerta descartada y auditada.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la revisión.') }
    finally { setBusy(null) }
  }

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Alertas de seguridad</h1><p>Señales explicables para priorizar revisiones humanas. Una señal no confirma fraude ni puede suspender una cuenta por sí sola.</p><Link className="text-link" to="/admin/denuncias">Abrir casos y denuncias <ArrowRight size={15} /></Link>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{loadError ? <div role="alert" className="empty-products"><strong>No pudimos cargar las alertas.</strong><span>{loadError}</span><button className="button button--outline" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Intentar de nuevo</button></div> : alerts === null ? <p role="status">Cargando alertas…</p> : alerts.data.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay señales abiertas</strong></div> : <section className="dashboard-list" aria-label="Señales abiertas">{alerts.data.map((alert) => <article className="appeal-card" key={alert.id}><p className="eyebrow eyebrow--quiet">{alert.severity.toUpperCase()} · {alert.status === 'reviewing' ? 'EN REVISIÓN' : 'PENDIENTE DE REVISIÓN'}</p><h2>{alert.resource_type === 'product' ? 'Oferta' : 'Perfil de productor'} · #{alert.resource_id}</h2><p>{alert.explanation}</p>{alert.signal_type === 'repeated_reports' && <p>Reportes recibidos en 24 horas: <strong>{alert.evidence.report_count_24h ?? '—'}</strong></p>}<p className="form-help">Responsable: <strong>{alert.assignee?.name ?? 'Sin asignar'}</strong></p><small>Primera señal: {new Date(alert.first_seen_at).toLocaleString('es-PA')} · Actualizada: {new Date(alert.last_seen_at).toLocaleString('es-PA')}</small>{canManage ? <><TextAreaField id={`risk-alert-note-${alert.id}`} name={`risk-alert-note-${alert.id}`} label="Nota de revisión" value={notes[alert.id] ?? ''} onChange={(value) => { setNotes((current) => ({ ...current, [alert.id]: value })); setFieldErrors((current) => ({ ...current, [alert.id]: '' })) }} error={fieldErrors[alert.id]} minLength={10} maxLength={1000} rows={3} required /><div className="detail-actions">{alert.status === 'open' ? <button className="button button--primary button--small" disabled={busy === alert.id} aria-busy={busy === alert.id} onClick={() => void decide(alert, 'reviewing')}>Tomar y revisar</button> : <button className="button button--primary button--small" disabled={busy === alert.id} aria-busy={busy === alert.id} onClick={() => void decide(alert, 'resolved')}>Cerrar revisión</button>}<button className="button button--outline button--small" disabled={busy === alert.id} aria-busy={busy === alert.id} onClick={() => void decide(alert, 'dismissed')}>Descartar señal</button></div></> : <p role="status">{!permissionsLoaded ? 'Comprobando permisos de gestión…' : permissionsError || 'Tienes acceso de solo lectura a las alertas.'}</p>}{busy === alert.id && <p role="status">Guardando la revisión…</p>}</article>)}</section>}{alerts && alerts.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de alertas"><button className="button button--outline button--small" disabled={alerts.current_page <= 1} onClick={() => setPage(alerts.current_page - 1)}>Anterior</button><span aria-live="polite">Página {alerts.current_page} de {alerts.last_page} · {alerts.total} alertas</span><button className="button button--outline button--small" disabled={alerts.current_page >= alerts.last_page} onClick={() => setPage(alerts.current_page + 1)}>Siguiente</button></nav>}</main><SiteFooter /></div>
}

function AdminLocationEditor({ place, locations, busy, onSave }: { place: AdminLocation; locations: AdminLocation[]; busy: boolean; onSave: (name: string, parentId: number | null) => Promise<void> }) {
  const [name, setName] = useState(place.name)
  const [parentId, setParentId] = useState(place.parent_id?.toString() ?? '')
  const [error, setError] = useState('')
  const expectedParentLevel = place.level === 'district' ? 'province' : place.level === 'corregimiento' ? 'district' : null
  const parents = expectedParentLevel ? locations.filter((item) => item.active && item.level === expectedParentLevel && item.id !== place.id) : []

  return <details className="catalog-location-editor"><summary>Editar</summary><ValidatedForm className="auth-form" onSubmit={async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 100) { setError('Escribe un nombre de entre 2 y 100 caracteres.'); return }
    if (expectedParentLevel && !parents.some((item) => String(item.id) === parentId)) { setError('Selecciona una ubicación padre activa del nivel correcto.'); return }
    setError('')
    try { await onSave(cleanName, parentId ? Number(parentId) : null) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la ubicación.') }
  }}><label>Nombre<input value={name} onChange={(event) => setName(event.currentTarget.value)} minLength={2} maxLength={100} required /></label><label>Ubicación padre<select value={parentId} disabled={!expectedParentLevel} required={Boolean(expectedParentLevel)} onChange={(event) => setParentId(event.currentTarget.value)}><option value="">{expectedParentLevel ? 'Selecciona una ubicación padre' : 'Sin padre · provincia'}</option>{parents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{error && <p role="alert">{error}</p>}<button className="button button--outline button--small" type="submit" disabled={busy} aria-busy={busy}>Guardar cambios</button></ValidatedForm></details>
}

function AdminCatalogsPage() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null)
  const [locations, setLocations] = useState<AdminLocation[] | null>(null)
  const [error, setError] = useState('')
  const [catalogBusy, setCatalogBusy] = useState<'category' | 'location' | null>(null)
  const [categoryNameError, setCategoryNameError] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [categoryEditName, setCategoryEditName] = useState('')
  const [categoryEditError, setCategoryEditError] = useState('')
  const [locationNameError, setLocationNameError] = useState('')
  const [locationParentError, setLocationParentError] = useState('')
  const [locationLevel, setLocationLevel] = useState<AdminLocation['level']>('province')
  const [locationParentId, setLocationParentId] = useState('')
  const categoryEditTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    void Promise.all([getAdminCategories(), getAdminLocations()])
      .then(([cats, places]) => { setCategories(cats); setLocations(places) })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los catálogos.'))
  }, [])

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (name.length < 2 || name.length > 100) {
      setCategoryNameError('Escribe un nombre de entre 2 y 100 caracteres.')
      document.getElementById('admin-category-name')?.focus()
      return
    }
    setCategoryNameError('')
    const parentValue = String(data.get('parent_id') ?? '')
    const parentId = parentValue ? Number(parentValue) : null
    setError('')
    setCatalogBusy('category')
    try {
      const siblingCount = categories?.filter((category) => category.parent_id === parentId).length ?? 0
      await saveAdminCategory({ name, parent_id: parentId, active: true, position: siblingCount })
      setCategories(await getAdminCategories())
      form.reset()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la categoría.') }
    finally { setCatalogBusy(null) }
  }

  async function addLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (name.length < 2 || name.length > 100) {
      setLocationNameError('Escribe un nombre de entre 2 y 100 caracteres.')
      document.getElementById('admin-location-name')?.focus()
      return
    }
    const parentId = locationParentId ? Number(locationParentId) : null
    const parent = locations?.find((place) => place.id === parentId)
    const expectedParentLevel = locationLevel === 'district' ? 'province' : locationLevel === 'corregimiento' ? 'district' : null
    if ((locationLevel === 'province' && parentId !== null) || (locationLevel !== 'province' && (!parent || parent.level !== expectedParentLevel))) {
      setLocationParentError(locationLevel === 'province' ? 'Una provincia no lleva ubicación padre.' : `Selecciona una ubicación padre de nivel ${expectedParentLevel === 'province' ? 'provincia' : 'distrito'}.`)
      document.getElementById('admin-location-parent')?.focus()
      return
    }
    setLocationNameError('')
    setLocationParentError('')
    setError('')
    setCatalogBusy('location')
    try {
      await saveAdminLocation({ name, level: locationLevel, parent_id: parentId, active: true })
      setLocations(await getAdminLocations())
      form.reset()
      setLocationLevel('province')
      setLocationParentId('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la ubicación.') }
    finally { setCatalogBusy(null) }
  }

  function startEditCategory(category: AdminCategory) {
    setEditingCategoryId(category.id)
    setCategoryEditName(category.name)
    setCategoryEditError('')
    setError('')
  }

  function cancelEditCategory() {
    if (catalogBusy) return
    setEditingCategoryId(null)
    setCategoryEditName('')
    setCategoryEditError('')
    window.setTimeout(() => categoryEditTriggerRef.current?.focus(), 0)
  }

  async function editCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const category = categories?.find((item) => item.id === editingCategoryId)
    if (!category) return
    const name = categoryEditName.trim()
    if (name.length < 2 || name.length > 100) {
      setCategoryEditError('Escribe un nombre de entre 2 y 100 caracteres.')
      document.getElementById(`admin-category-edit-${category.id}`)?.focus()
      return
    }
    if (name === category.name) { cancelEditCategory(); return }
    setCategoryEditError('')
    setError('')
    setCatalogBusy('category')
    try {
      await updateAdminCategory(category.id, { name, parent_id: category.parent_id, active: category.active, position: category.position })
      setCategories((current) => current?.map((item) => item.id === category.id ? { ...item, name } : item) ?? null)
      setEditingCategoryId(null)
      setCategoryEditName('')
      window.setTimeout(() => categoryEditTriggerRef.current?.focus(), 0)
      try { setCategories(await getAdminCategories()) }
      catch { setError('Guardamos el nombre, pero no pudimos actualizar la lista. Recarga la página para ver los datos más recientes.') }
    } catch (reason) {
      setCategoryEditError(reason instanceof Error ? reason.message : 'No se pudo actualizar la categoría.')
    } finally { setCatalogBusy(null) }
  }

  async function activateCategory(category: AdminCategory) {
    setError('')
    setCatalogBusy('category')
    try {
      await updateAdminCategory(category.id, { name: category.name, parent_id: category.parent_id, active: true, position: category.position })
      setCategories(await getAdminCategories())
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo activar la categoría.') }
    finally { setCatalogBusy(null) }
  }

  async function editLocation(place: AdminLocation, name: string, parentId: number | null) {
    setError('')
    setCatalogBusy('location')
    try {
      await updateAdminLocation(place.id, { name, level: place.level, parent_id: parentId, active: place.active })
      setLocations(await getAdminLocations())
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la ubicación.'); throw reason }
    finally { setCatalogBusy(null) }
  }

  async function activateLocation(place: AdminLocation) {
    setError('')
    setCatalogBusy('location')
    try {
      await updateAdminLocation(place.id, { name: place.name, level: place.level, parent_id: place.parent_id, active: true })
      setLocations(await getAdminLocations())
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo activar la ubicación.') }
    finally { setCatalogBusy(null) }
  }

  async function deactivate(kind: 'categories' | 'locations', id: number) {
    setError('')
    setCatalogBusy(kind === 'categories' ? 'category' : 'location')
    try {
      await deactivateAdminCatalogItem(kind, id)
      if (kind === 'categories') setCategories(await getAdminCategories())
      else setLocations(await getAdminLocations())
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo desactivar el elemento.') }
    finally { setCatalogBusy(null) }
  }

  const rootCategories = categories?.filter((category) => category.active && category.parent_id === null) ?? []
  const expectedLocationParentLevel = locationLevel === 'district' ? 'province' : locationLevel === 'corregimiento' ? 'district' : null
  const validLocationParents = locations?.filter((place) => place.active && place.level === expectedLocationParentLevel) ?? []

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN</p><h1>Categorías y ubicaciones</h1>{error && <p role="alert">{error}</p>}{!categories || !locations ? <p role="status">Cargando catálogos…</p> : <div className="catalog-admin-grid"><section className="dashboard-list"><h2>Categorías y subcategorías</h2><p>Organiza las ofertas en dos niveles. Una subcategoría debe depender de una categoría principal activa.</p>{categories.length ? categories.map((category) => {
    const parent = categories.find((item) => item.id === category.parent_id)
    const canActivate = !parent || parent.active
    if (editingCategoryId === category.id) return <article className="catalog-admin-row catalog-admin-row--editing" key={category.id}><ValidatedForm className="admin-category-edit-form auth-form" onSubmit={(event) => void editCategory(event)}><Field id={`admin-category-edit-${category.id}`} name="name" label="Nombre de categoría" type="text" value={categoryEditName} onChange={(event) => { setCategoryEditName(event.currentTarget.value); setCategoryEditError('') }} minLength={2} maxLength={100} required autoFocus disabled={catalogBusy !== null} error={categoryEditError} />{categoryEditError && <p role="alert">{categoryEditError}</p>}<div className="catalog-admin-actions"><button className="button button--primary button--small" type="submit" disabled={catalogBusy !== null} aria-busy={catalogBusy === 'category'}>{catalogBusy === 'category' ? 'Guardando…' : 'Guardar nombre'}</button><button className="button button--outline button--small" type="button" disabled={catalogBusy !== null} onClick={cancelEditCategory}>Cancelar</button></div></ValidatedForm></article>
    return <article className="catalog-admin-row" key={category.id}><span><strong>{parent ? `${parent.name} › ${category.name}` : category.name}</strong><small> · {category.products_count} ofertas · {category.active ? 'activa' : 'inactiva'}</small></span><span className="catalog-admin-actions"><button ref={categoryEditTriggerRef} className="text-link" type="button" disabled={catalogBusy !== null} onClick={(event) => { categoryEditTriggerRef.current = event.currentTarget; startEditCategory(category) }}>Editar</button>{category.active ? <button className="text-link" type="button" disabled={catalogBusy !== null} onClick={() => void deactivate('categories', category.id)}>Desactivar</button> : <button className="text-link" type="button" disabled={catalogBusy !== null || !canActivate} title={!canActivate ? 'Activa primero la categoría principal.' : undefined} onClick={() => void activateCategory(category)}>Reactivar</button>}</span></article>  }) : <p>No hay categorías todavía. Agrega una categoría principal para habilitar el catálogo.</p>}<ValidatedForm className="auth-form" noValidate onSubmit={(event) => void addCategory(event)}><h3>Agregar categoría</h3><Field id="admin-category-name" name="name" label="Nombre" type="text" minLength={2} maxLength={100} required error={categoryNameError} onChange={() => setCategoryNameError('')} /><SelectField id="admin-category-parent" name="parent_id" label="Categoría principal" defaultValue="" hint="Sin padre, crearás una categoría principal. Si eliges una, crearás una subcategoría."><option value="">Ninguna · categoría principal</option>{rootCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField><button className="button button--primary" type="submit" disabled={catalogBusy !== null} aria-busy={catalogBusy === 'category'}>{catalogBusy === 'category' ? 'Guardando…' : 'Agregar categoría'}</button></ValidatedForm></section><section className="dashboard-list"><h2>Ubicaciones</h2>{locations.length ? locations.map((place) => {
    const parent = locations.find((item) => item.id === place.parent_id)
    const canActivate = !parent || parent.active
    return <article className="catalog-admin-row" key={place.id}><span><strong>{place.name}</strong><small>{parent ? ` · ${parent.name}` : ''} · {place.level} · {place.active ? 'activa' : 'inactiva'}</small></span><span className="catalog-admin-actions"><AdminLocationEditor place={place} locations={locations} busy={catalogBusy !== null} onSave={(name, parentId) => editLocation(place, name, parentId)} />{place.active ? <button className="text-link" type="button" disabled={catalogBusy !== null} onClick={() => void deactivate('locations', place.id)}>Desactivar</button> : <button className="text-link" type="button" disabled={catalogBusy !== null || !canActivate} title={!canActivate ? 'Activa primero la ubicación padre.' : undefined} onClick={() => void activateLocation(place)}>Reactivar</button>}</span></article>
  }) : <p>No hay ubicaciones todavía. Agrega una provincia para completar el registro de productores.</p>}<ValidatedForm className="auth-form" noValidate onSubmit={(event) => void addLocation(event)}><h3>Agregar ubicación</h3><Field id="admin-location-name" name="name" label="Nombre" type="text" minLength={2} maxLength={100} required error={locationNameError} onChange={() => setLocationNameError('')} /><SelectField id="admin-location-level" name="level" label="Nivel" value={locationLevel} onChange={(event) => { setLocationLevel(event.currentTarget.value as AdminLocation['level']); setLocationParentId(''); setLocationParentError('') }}><option value="province">Provincia</option><option value="district">Distrito</option><option value="corregimiento">Corregimiento</option></SelectField><SelectField id="admin-location-parent" name="parent_id" label="Ubicación padre" value={locationParentId} required={locationLevel !== 'province'} error={locationParentError} hint={locationLevel === 'province' ? 'Las provincias no llevan ubicación padre.' : `Selecciona una ubicación activa de nivel ${expectedLocationParentLevel === 'province' ? 'provincia' : 'distrito'}.`} onChange={(event) => { setLocationParentId(event.currentTarget.value); setLocationParentError('') }}><option value="">{locationLevel === 'province' ? 'Sin padre' : 'Selecciona la ubicación padre'}</option>{validLocationParents.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</SelectField><button className="button button--primary" type="submit" disabled={catalogBusy !== null} aria-busy={catalogBusy === 'location'}>{catalogBusy === 'location' ? 'Guardando…' : 'Agregar ubicación'}</button></ValidatedForm></section></div>}</main><SiteFooter /></div>
}

function AdminMessageTemplatesPage() {
  const [templates, setTemplates] = useState<AdminMessageTemplate[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { let active = true; void getAdminMessageTemplates().then((items) => { if (!active) return; setTemplates(items); setDrafts(Object.fromEntries(items.map((item) => [item.key, item.body]))); setError('') }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'No pudimos cargar las plantillas.') }); return () => { active = false } }, [attempt])
  async function save(template: AdminMessageTemplate) {
    setBusy(template.key); setError(''); setMessage('')
    try {
      const saved = await updateAdminMessageTemplate(template.key, drafts[template.key] ?? template.body)
      setTemplates((current) => current?.map((item) => item.key === template.key ? saved : item) ?? null)
      setDrafts((current) => ({ ...current, [template.key]: saved.body }))
      setMessage(`Guardamos la plantilla de ${template.label}.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la plantilla.') }
    finally { setBusy(null) }
  }
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · CONFIGURACIÓN</p><h1>Mensajes de contacto</h1><p>Configura el texto que se abre al iniciar contacto por WhatsApp. La persona puede editarlo antes de enviarlo. Cada cambio queda versionado y auditado.</p><Link className="text-link" to="/admin">Volver a administración <ArrowRight size={15} /></Link>{error && <div role="alert" className="empty-products"><strong>{error}</strong><button type="button" className="button button--outline" onClick={() => setAttempt((value) => value + 1)}>Intentar de nuevo</button></div>}{message && <p role="status">{message}</p>}{templates === null && !error && <p role="status">Cargando plantillas…</p>}{templates && <section className="dashboard-list" aria-label="Plantillas WhatsApp">{templates.map((template) => {
    const allowed = template.key === 'product' ? '{product_title}, {producer_name}' : '{producer_name}'
    return <article className="appeal-card" key={template.key}><h2>Contacto de {template.label}</h2><p>Variables disponibles: <code>{allowed}</code>. La plantilla debe conservar {template.key === 'product' ? <code>{'{product_title}'}</code> : <code>{'{producer_name}'}</code>}.</p><ValidatedForm className="auth-form" noValidate onSubmit={(event) => { event.preventDefault(); if (busy !== template.key) void save(template) }}><TextAreaField id={`message-template-${template.key}`} name="body" label="Mensaje prellenado" value={drafts[template.key] ?? template.body} onChange={(value) => setDrafts((current) => ({ ...current, [template.key]: value }))} minLength={10} maxLength={500} rows={3} required hint="Entre 10 y 500 caracteres. El texto se codifica para el enlace de WhatsApp." /><button className="button button--primary" type="submit" disabled={busy !== null || drafts[template.key] === template.body} aria-busy={busy === template.key}>{busy === template.key ? 'Guardando…' : 'Guardar plantilla'}</button></ValidatedForm><p className="form-help">Versión {template.version}{template.updated_by ? ` · Actualizó ${template.updated_by.name}` : ' · Texto inicial del sistema'}{template.updated_at ? ` · ${new Date(template.updated_at).toLocaleString('es-PA')}` : ''}</p>{template.history.length > 0 && <details><summary>Historial reciente ({template.history.length})</summary><ol>{template.history.map((entry) => <li key={entry.version}>Versión {entry.version} · {entry.updated_by ?? 'Cuenta eliminada'} · {new Date(entry.updated_at).toLocaleString('es-PA')}<blockquote>{entry.body}</blockquote></li>)}</ol></details>}</article>
  })}</section>}</main><SiteFooter /></div>
}

function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  useEffect(() => { void getAdminMetrics().then(setMetrics).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las métricas.')) }, [])
  async function exportCsv() {
    setExporting(true); setExportError('')
    try {
      const blob = await downloadAdminMetricsCsv()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = 'metricas-mercado.csv'; link.click()
      URL.revokeObjectURL(url)
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'No pudimos descargar el CSV.') }
    finally { setExporting(false) }
  }
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN</p><h1>Métricas operativas</h1>{error ? <div role="alert"><p>{error}</p>{error.includes('bloqueado mientras se recupera el autenticador') && <><p>Vuelve a ingresar para continuar con la reinscripción del autenticador.</p><Link className="button button--outline" to="/ingresar">Volver a ingresar</Link></>}</div> : !metrics ? <p role="status">Cargando métricas…</p> : <><p>Datos agregados para analizar la operación. No incluyen información personal; las intenciones de contacto no equivalen a ventas.</p><button className="button button--primary" type="button" onClick={() => void exportCsv()} disabled={exporting} aria-busy={exporting}>{exporting ? 'Preparando CSV…' : 'Descargar CSV agregado'}</button>{exportError && <p role="alert">{exportError}</p>}<section className="admin-metric-grid" aria-label="Resumen de métricas"><article><span>Productores registrados</span><strong>{Object.values(metrics.producers).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.producers).map(([status, count]) => `${status}: ${count}`).join(' · ')}</small></article><article><span>Publicaciones</span><strong>{Object.values(metrics.products).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.products).map(([status, count]) => `${status.replaceAll('_', ' ')}: ${count}`).join(' · ')}</small></article><article><span>Denuncias abiertas</span><strong>{metrics.reports_open}</strong><small>Casos nuevos o en revisión</small></article><article><span>Intenciones de contacto</span><strong>{metrics.contact_intentions_30d}</strong><small>Últimos 30 días · no representa ventas</small></article><article><span>Búsquedas sin resultados</span><strong>{metrics.searches_without_results_30d}</strong><small>Últimos 30 días</small></article><article><span>Tiempo medio de moderación</span><strong>{metrics.average_moderation_hours_30d === null ? '—' : `${metrics.average_moderation_hours_30d} h`}</strong><small>Hasta la primera decisión humana · {metrics.moderation_decisions_30d} decisiones en 30 días</small></article></section></>}</main><SiteFooter /></div>
}

function AdminUsersPage() {
  const [users, setUsers] = useState<Paginated<AdminUser> | null>(null)
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [error, setError] = useState('')
  const [roleReasons, setRoleReasons] = useState<Record<number, string>>({})
  const [roleErrors, setRoleErrors] = useState<Record<number, string>>({})
  const [roleFieldErrors, setRoleFieldErrors] = useState<Record<number, string>>({})
  const [roleDrafts, setRoleDrafts] = useState<Record<number, string[]>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void Promise.all([getAdminUsers(search, page), getAdminRoles()])
      .then(([accounts, availableRoles]) => { if (active) { setUsers(accounts); setRoles(availableRoles) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los usuarios.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, page, reload])
  function searchUsers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(searchDraft.trim())
  }
  async function updateRoles(user: AdminUser, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const selected = data.getAll('roles').map(String)
    if (!selected.length) {
      setRoleErrors((current) => ({ ...current, [user.id]: 'Cada cuenta debe conservar al menos un rol.' }))
      event.currentTarget.querySelector<HTMLInputElement>('input[name="roles"]')?.focus()
      return
    }
    const reason = String(data.get('reason') ?? '').trim()
    if (reason.length < 5) {
      setRoleFieldErrors((current) => ({ ...current, [user.id]: 'Explica el cambio con al menos cinco caracteres.' }))
      document.getElementById(`admin-role-reason-${user.id}`)?.focus()
      return
    }
    setRoleFieldErrors((current) => ({ ...current, [user.id]: '' }))
    setRoleErrors((current) => ({ ...current, [user.id]: '' }))
    setBusy(user.id)
    try {
      await setAdminUserRoles(user.id, selected, reason)
      setUsers((current) => current ? { ...current, data: current.data.map((account) => account.id === user.id ? { ...account, roles: roles.filter((role) => selected.includes(role.name)) } : account) } : current)
      setRoleDrafts((current) => ({ ...current, [user.id]: selected }))
      setRoleReasons((current) => ({ ...current, [user.id]: '' }))
      setRoleErrors((current) => ({ ...current, [user.id]: '' }))
      setRoleFieldErrors((current) => ({ ...current, [user.id]: '' }))
    }
    catch (failure) { setRoleErrors((current) => ({ ...current, [user.id]: failure instanceof Error ? failure.message : 'No se pudieron guardar los roles.' })) }
    finally { setBusy(null) }
  }
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · ACCESO</p><h1>Usuarios y permisos</h1><p>El Admin gestiona roles operativos. Solo el Superadministrador puede asignar o modificar los roles Admin y Superadministrador. Cada cambio queda auditado con su motivo.</p><ValidatedForm className="producer-directory__filters" role="search" onSubmit={searchUsers}><label className="catalog-search"><Search size={17} aria-hidden="true" /><input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.currentTarget.value)} aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" maxLength={120} /></label><button className="button button--primary" type="submit">Buscar</button></ValidatedForm>{error ? <div className="empty-products" role="alert"><strong>{error}</strong><button className="button button--outline" type="button" onClick={() => setReload((value) => value + 1)}>Reintentar</button></div> : loading ? <p role="status">Cargando usuarios…</p> : !users || users.data.length === 0 ? <div className="empty-products"><strong>No se encontraron usuarios</strong><span>Prueba con otro nombre o correo.</span></div> : <><section className="dashboard-list" aria-label="Cuentas internas">{users.data.map((user) => { const canEditRoles = user.roles.every((assigned) => roles.some((available) => available.name === assigned.name)); return <article className="dashboard-row admin-user-row" key={user.id}><div><h2>{user.name}</h2><p>{user.email}</p><p>Roles actuales: {user.roles.map((role) => role.display_name).join(', ')}</p></div>{canEditRoles ? <ValidatedForm className="admin-role-form auth-form" onSubmit={(event) => void updateRoles(user, event)}><fieldset><legend>Roles</legend>{roles.map((role) => { const selectedRoles = roleDrafts[user.id] ?? user.roles.map((assigned) => assigned.name); return <label className="auth-consent" key={role.id}><input type="checkbox" name="roles" value={role.name} checked={selectedRoles.includes(role.name)} disabled={busy === user.id} onChange={(event) => { const next = event.currentTarget.checked ? [...selectedRoles, role.name] : selectedRoles.filter((name) => name !== role.name); setRoleDrafts((current) => ({ ...current, [user.id]: next })); setRoleErrors((current) => ({ ...current, [user.id]: '' })) }} />{role.display_name}</label> })}</fieldset><TextAreaField id={`admin-role-reason-${user.id}`} name="reason" label="Motivo del cambio de permisos" value={roleReasons[user.id] ?? ''} onChange={(value) => { setRoleReasons((current) => ({ ...current, [user.id]: value })); setRoleFieldErrors((current) => ({ ...current, [user.id]: '' })); setRoleErrors((current) => ({ ...current, [user.id]: '' })) }} error={roleFieldErrors[user.id]} minLength={5} maxLength={1000} rows={2} required disabled={busy === user.id} hint="El motivo se registrará en la auditoría." />{roleErrors[user.id] && <p role="alert">{roleErrors[user.id]}</p>}<button className="button button--outline" type="submit" disabled={busy === user.id} aria-busy={busy === user.id}>{busy === user.id ? 'Guardando…' : 'Guardar roles'}</button></ValidatedForm> : <p className="moderation-feedback">Los roles administrativos solo los puede modificar un Superadministrador.</p>}</article> })}</section>{users.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de usuarios"><button className="button button--outline button--small" disabled={users.current_page <= 1} onClick={() => setPage(users.current_page - 1)}>Anterior</button><span aria-live="polite">Página {users.current_page} de {users.last_page} · {users.total} cuentas</span><button className="button button--outline button--small" disabled={users.current_page >= users.last_page} onClick={() => setPage(users.current_page + 1)}>Siguiente</button></nav>}</>}</main><SiteFooter /></div>
}

function AdminMfaSetupPage() {
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof getAdminMfaSetup>> | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { void getAdminMfaSetup().then((result) => { setSetup(result); if (result.enabled) window.location.assign('/admin') }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'No se pudo iniciar la configuración de MFA.')) }, [])
  return <div className="app-shell"><SiteHeader /><main className="access-page page-shell"><section className="access-card"><p className="eyebrow eyebrow--quiet">SEGURIDAD ADMINISTRATIVA</p><h1>Configura la verificación en dos pasos</h1>{message && <p role="alert">{message}</p>}{!setup ? <p role="status">Preparando configuración…</p> : setup.secret && <><p>En tu aplicación autenticadora, agrega una cuenta con esta clave. La clave queda cifrada en el servidor y no vuelve a mostrarse después de confirmar.</p><label>Clave de configuración<input readOnly value={setup.secret} onFocus={(event) => event.currentTarget.select()} /></label><details><summary>URI para importar</summary><code className="mfa-uri">{setup.otpauth_uri}</code></details><ValidatedForm className="auth-form" onSubmit={async (event) => { event.preventDefault(); const code = String(new FormData(event.currentTarget).get('code')); try { await confirmAdminMfa(code); window.location.assign('/admin') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'No se pudo confirmar la configuración.') } }}><label>Código de seis dígitos<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required /></label><button className="button button--primary" type="submit">Confirmar y continuar</button></ValidatedForm></>}</section></main><SiteFooter /></div>
}

function AuditPage() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getAuditLogs>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void getAuditLogs().then(setEntries).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar la auditoría.')) }, [])
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN</p><h1>Registro de auditoría</h1>{error ? <p role="alert">{error}</p> : !entries ? <p role="status">Cargando eventos…</p> : <div className="dashboard-list">{entries.map((entry) => <article className="dashboard-row" key={entry.id}><div><strong>{entry.action}</strong><p>{entry.resource_type} #{entry.resource_id ?? '—'} · {entry.actor?.name ?? 'Sistema'}</p>{entry.reason && <small>{entry.reason}</small>}</div><time>{new Date(entry.created_at).toLocaleString('es-PA')}</time></article>)}</div>}</main><SiteFooter /></div>
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminHomePage />} />
      <Route path="/admin/publicaciones" element={<ModerationPage />} />
      <Route path="/admin/moderacion" element={<ModerationPage />} />
      <Route path="/admin/denuncias" element={<ReportsPage />} />
      <Route path="/admin/seguridad/casos/:id" element={<AdminSecurityCasePage />} />
      <Route path="/admin/alertas" element={<AdminSecurityAlertsPage />} />
      <Route path="/admin/productores" element={<AdminProducersPage />} />
      <Route path="/admin/registro-asistido" element={<AdminProducersPage assistedOnly />} />
      <Route path="/admin/productores/:id" element={<AdminProducerDetailPage />} />
      <Route path="/admin/apelaciones" element={<AdminProducerAppealsPage />} />
      <Route path="/admin/catalogos" element={<AdminCatalogsPage />} />
      <Route path="/admin/mensajes" element={<AdminMessageTemplatesPage />} />
      <Route path="/admin/reportes" element={<AdminMetricsPage />} />
      <Route path="/admin/metricas" element={<AdminMetricsPage />} />
      <Route path="/admin/auditoria" element={<AuditPage />} />
      <Route path="/admin/usuarios" element={<AdminUsersPage />} />
      <Route path="/admin/mfa" element={<AdminMfaSetupPage />} />
      <Route path="/admin/seguridad/recuperacion-mfa" element={<AdminMfaRecoveryPage />} />
      <Route path="*" element={<InfoPage title="No encontramos esta página" description="Revisa la dirección o vuelve al catálogo para explorar las ofertas." />} />
    </Routes>
  )
}

export default AdminRoutes


