import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, BarChart2, BookOpen, CheckCircle2, ChevronRight, Clock, FileText, Flag, History, LayoutDashboard, Lock, LogOut, MessageSquare, Package, Pencil, ScanFace, Search, Settings, ShieldAlert, ShieldCheck, Tag, UserPlus, Users } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import Field from '../components/Field'
import SelectField from '../components/SelectField'
import ActivityMultiSelect from '../components/ActivityMultiSelect'
import LocationPicker from '../components/LocationPicker'
import TextAreaField from '../components/TextAreaField'
import ValidatedForm from '../components/ValidatedForm'
import VerificationBadge from '../components/VerificationBadge'
import { categoryPath, categoryTreeOptions } from '../components/categoryTree'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { decideBiometricCheck, type AdminBiometricCheck, adminLogin, decideStory, getAdminStories, type OwnedProducerStory, adminLogout, completeAdminMfaChallenge, confirmAdminMfa, confirmAdminProducerContact, getAdminMe, deactivateAdminCatalogItem, decideModeration, decideModerationBulk, decideProducerAppeal, downloadAdminMetricsCsv, getAdminCategories, getAdminLocations, getAdminMetrics, getAdminMfaSetup, getAdminPermissions, getAdminProducerAppeals, getAdminProducerDetail, getAdminProducers, getAdminRoles, getAdminSecurityAlerts, getAdminUsers, getAuditLogs, getAdminMessageTemplates, updateAdminMessageTemplate, getModerationQueue, getAdminAllProducts, setAdminProductStatus, getReportCase, getReportCases, releaseReportCase, listLocations, registerProducer, reportEvidenceUrl, saveAdminCategory, saveAdminLocation, setAdminProducerStatus, setAdminProducerTrustLevel, setAdminUserRoles, updateAdminCategory, updateAdminLocation, updateAdminSecurityAlert, updateReportCase, updateReportPriority, getAdminAccounts, createAdminAccount, getAdminSmtpSettings, saveAdminSmtpSettings, testAdminSmtpSettings, type AdminAccount, type AdminCategory, type AdminLocation, type AdminMetrics, type AdminMessageTemplate, type AdminProducer, type AdminProducerDetail, type AdminProducerAppeal, type AdminProductRow, type AdminRole, type AdminUser, type ModerationItem, type Paginated, type PublicLocation, type ReportCase, type ReportCaseDetail, type RiskAlert, type ProducerVerificationLevel, type SmtpSettings } from '../api/client'
import { SiteFooter, SiteHeader } from './shared/SiteChrome'
import AdminMfaRecoveryPage from '../components/AdminMfaRecoveryPage'
import { InfoPage } from './shared/InfoPage'

const STATUS_LABELS: Record<string, string> = { draft: 'Borrador', pending: 'En revisión', published: 'Publicado', paused: 'Pausado', sold_out: 'Agotado', rejected: 'No aprobado', withdrawn: 'Retirado', changes_requested: 'Requiere cambios' }

function ModerationPage() {
  const [tab, setTab] = useState<'pending' | 'rejected' | 'changes_requested' | 'published' | 'all'>('pending')
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
  const [allList, setAllList] = useState<Paginated<AdminProductRow> | null>(null)
  const [allPage, setAllPage] = useState(1)
  const [allError, setAllError] = useState('')
  const [allSearch, setAllSearch] = useState('')
  const [allSearchInput, setAllSearchInput] = useState('')
  const approvalEligibleIds = queue?.data.filter((item) => item.producer.profile_status === 'active' && item.producer.contact_verified && item.category.active && item.category.parent?.active !== false).map((item) => item.id) ?? []
  const selectableIds = bulkDecision === 'approve' ? approvalEligibleIds : queue?.data.map((item) => item.id) ?? []
  useEffect(() => {
    if (tab !== 'pending') return
    let current = true
    setError('')
    void getModerationQueue(page).then((result) => {
      if (!current) return
      if (page > result.last_page && result.last_page > 0) { setPage(result.last_page); return }
      setQueue(result)
      setSelectedIds((current) => current.filter((id) => result.data.some((item) => item.id === id)))
    }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'No pudimos cargar la cola.') })
    return () => { current = false }
  }, [page, reload, tab])
  useEffect(() => {
    if (tab === 'pending') return
    let current = true
    setAllList(null)
    setAllError('')
    void getAdminAllProducts({ status: tab === 'all' ? undefined : tab, q: allSearch || undefined, page: allPage }).then((result) => {
      if (current) setAllList(result)
    }).catch((reason: unknown) => { if (current) setAllError(reason instanceof Error ? reason.message : 'No se pudieron cargar las publicaciones.') })
    return () => { current = false }
  }, [tab, allPage, allSearch])
  const [listActionTarget, setListActionTarget] = useState<{ id: number; title: string; currentStatus: string; nextStatus: string } | null>(null)
  const [listActionReason, setListActionReason] = useState('')
  const [listActionReasonError, setListActionReasonError] = useState('')
  const [listActionBusy, setListActionBusy] = useState(false)
  const [listActionError, setListActionError] = useState('')

  async function handleListAction(event: React.FormEvent) {
    event.preventDefault()
    if (!listActionTarget) return
    const reason = listActionReason.trim()
    if (reason.length < 5) { setListActionReasonError('Escribe el motivo con al menos cinco caracteres.'); return }
    setListActionBusy(true)
    setListActionError('')
    try {
      const result = await setAdminProductStatus(listActionTarget.id, listActionTarget.nextStatus, reason)
      setAllList((prev) => prev ? { ...prev, data: prev.data.map((p) => p.id === result.id ? { ...p, status: result.status } : p) } : prev)
      setListActionTarget(null)
      setListActionReason('')
    } catch (err) {
      setListActionError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
    } finally {
      setListActionBusy(false)
    }
  }

  function openListAction(product: AdminProductRow, nextStatus: string) {
    setListActionTarget({ id: product.id, title: product.title, currentStatus: product.status, nextStatus })
    setListActionReason('')
    setListActionReasonError('')
    setListActionError('')
  }

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
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Publicaciones</h1><p>Revisa cada oferta y registra el motivo de tu decisión. Solo los moderadores autorizados pueden acceder.</p><Link className="text-link" to="/admin/apelaciones">Revisar apelaciones de productores <ArrowRight size={15} /></Link>
  <nav className="admin-tabs" aria-label="Filtrar publicaciones" style={{ display: 'flex', gap: '0.25rem', margin: '1.5rem 0 1rem', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
    {([['pending','En revisión'],['rejected','Rechazadas'],['changes_requested','Con cambios'],['published','Publicadas'],['all','Todas']] as const).map(([value, label]) => (
      <button key={value} type="button" className={`admin-tab${tab === value ? ' admin-tab--active' : ''}`} onClick={() => { setTab(value); setAllPage(1); setAllList(null); setAllSearch(''); setAllSearchInput('') }}>{label}</button>
    ))}
  </nav>
  {tab !== 'pending' ? (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input className="input" style={{ flex: 1 }} type="search" placeholder="Buscar por título…" value={allSearchInput} onChange={(e) => setAllSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setAllSearch(allSearchInput); setAllPage(1); setAllList(null) } }} />
        <button className="button button--outline" type="button" onClick={() => { setAllSearch(allSearchInput); setAllPage(1); setAllList(null) }}>Buscar</button>
      </div>
      {allError ? <p role="alert">{allError}</p> : !allList ? <p role="status">Cargando…</p> : allList.data.length === 0 ? <p>No hay publicaciones en esta categoría.</p> : <>
        <p className="catalog-result-count">{allList.total} publicaciones encontradas</p>
        {listActionError && <p role="alert" style={{ marginBottom: '0.5rem' }}>{listActionError}</p>}
        <div className="dashboard-list">{allList.data.map((product) => {
          const isTarget = listActionTarget?.id === product.id
          const STATUS_OPTIONS: { value: string; label: string }[] = [
            { value: 'published', label: 'Aprobar y publicar' },
            { value: 'pending', label: 'Enviar a revisión' },
            { value: 'changes_requested', label: 'Solicitar cambios' },
            { value: 'rejected', label: 'Rechazar' },
            { value: 'paused', label: 'Pausar' },
            { value: 'withdrawn', label: 'Retirar' },
          ].filter((opt) => opt.value !== product.status)
          return (
            <article className="dashboard-row" key={product.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <strong>{product.title}</strong>
                  <p style={{ margin: '0.1rem 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{product.producer.public_name} · {product.category.name} · {new Date(product.updated_at).toLocaleDateString('es-PA')}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`status-pill status-pill--${product.status}`}>{STATUS_LABELS[product.status] ?? product.status.replaceAll('_', ' ')}</span>
                  {!isTarget && <button className="button button--outline button--small" type="button" disabled={listActionBusy} onClick={() => openListAction(product, STATUS_OPTIONS[0]?.value ?? 'pending')}>Cambiar estado</button>}
                  <Link className="button button--quiet button--small" to={`/admin/productores/${product.producer.id}`}>Ver productor</Link>
                </div>
              </div>
              {isTarget && (
                <ValidatedForm className="moderation-decision-form" style={{ width: '100%' }} noValidate onSubmit={(e) => void handleListAction(e)}>
                  <label style={{ display: 'grid', gap: '0.3rem', fontWeight: 650 }}>
                    <span>Nuevo estado</span>
                    <select className="input" value={listActionTarget.nextStatus} onChange={(e) => setListActionTarget({ ...listActionTarget, nextStatus: e.target.value })} disabled={listActionBusy}>
                      {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </label>
                  <TextAreaField id={`list-action-reason-${product.id}`} name="reason" label="Motivo del cambio" value={listActionReason} onChange={(value) => { setListActionReason(value); setListActionReasonError('') }} error={listActionReasonError} minLength={5} maxLength={1000} rows={3} required hint="El motivo quedará registrado en el historial de la publicación." />
                  <div className="moderation-decision-form__actions">
                    <button className="button button--primary" type="submit" disabled={listActionBusy} aria-busy={listActionBusy}>Guardar cambio</button>
                    <button className="button button--outline" type="button" onClick={() => setListActionTarget(null)}>Cancelar</button>
                  </div>
                </ValidatedForm>
              )}
            </article>
          )
        })}</div>
        {allList.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación"><button className="button button--outline button--small" disabled={allPage <= 1} onClick={() => { setAllPage(allPage - 1); setAllList(null) }}>Anterior</button><span>Página {allList.current_page} de {allList.last_page}</span><button className="button button--outline button--small" disabled={allPage >= allList.last_page} onClick={() => { setAllPage(allPage + 1); setAllList(null) }}>Siguiente</button></nav>}
      </>}
    </div>
  ) : <>{actionError && <p role="alert">{actionError}</p>}{bulkResult && <div className="moderation-bulk__result" role={bulkResult.failed.length ? "alert" : "status"}><strong>{bulkResult.processed} {bulkResult.processed === 1 ? "publicación actualizada" : "publicaciones actualizadas"}{bulkResult.failed.length ? `; ${bulkResult.failed.length} no se procesaron` : ""}.</strong>{bulkResult.failed.length > 0 && <ul>{bulkResult.failed.map((item) => <li key={item.id}>Publicación {item.id}: {item.message}</li>)}</ul>}</div>}{error ? <div role="alert" className="empty-products"><strong>{error}</strong><button className="button button--outline" type="button" onClick={() => { setQueue(null); setError(''); setReload((current) => current + 1) }}>Intentar de nuevo</button></div> : queue === null ? <p role="status">Cargando publicaciones pendientes…</p> : queue.data.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay publicaciones pendientes</strong><span>Las nuevas ofertas aparecerán aquí cuando un productor las envíe a revisión.</span></div> : <><section className="moderation-bulk" aria-label="Acción para publicaciones seleccionadas"><label className="moderation-bulk__select-all"><input type="checkbox" checked={selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))} disabled={bulkBusy || selectableIds.length === 0} onChange={(event) => setSelectedIds(event.currentTarget.checked ? selectableIds : [])} />{bulkDecision === 'approve' ? 'Seleccionar publicaciones aprobables de esta página' : 'Seleccionar todas las publicaciones de esta página'}</label><p>La selección se limita a estas {queue.data.length} publicaciones visibles. Cada decisión se revisará y registrará individualmente.</p><ValidatedForm className="moderation-bulk__form" noValidate onSubmit={decideSelected}><label><span>Decisión para las publicaciones seleccionadas</span><select name="decision" value={bulkDecision} disabled={bulkBusy} onChange={(event) => { const nextDecision = event.currentTarget.value as 'approve' | 'reject' | 'request_changes'; setBulkDecision(nextDecision); setBulkResult(null); if (nextDecision === 'approve') setSelectedIds((current) => current.filter((id) => approvalEligibleIds.includes(id))) }}><option value="request_changes">Solicitar cambios</option><option value="reject">Rechazar</option><option value="approve">Aprobar y publicar</option></select></label><TextAreaField id="moderation-bulk-reason" name="reason" label="Motivo común para la decisión" value={bulkReason} disabled={bulkBusy} onChange={(value) => { setBulkReason(value); setBulkResult(null) }} minLength={5} maxLength={1000} rows={3} required hint="El motivo se guardará en el historial individual de cada publicación procesada." /><div className="moderation-bulk__actions"><button className="button button--primary" type="submit" disabled={bulkBusy || selectedIds.length === 0} aria-busy={bulkBusy}>{bulkBusy ? 'Aplicando decisión…' : `${bulkDecision === 'approve' ? 'Aprobar y publicar' : bulkDecision === 'reject' ? 'Rechazar' : 'Solicitar cambios'} a ${selectedIds.length} publicaciones`}</button>{selectedIds.length > 0 && <button className="button button--outline" type="button" disabled={bulkBusy} onClick={() => setSelectedIds([])}>Limpiar selección</button>}</div>{bulkBusy && <p role="status">Registrando cada decisión…</p>}</ValidatedForm></section><section className="dashboard-list">{queue.data.map((item) => {
    const approvalBlocked = item.producer.profile_status !== 'active' || !item.category.active || item.category.parent?.active === false
    const blockedReason = item.producer.profile_status !== 'active'
      ? 'Aprobar estará disponible cuando el perfil del productor esté activo.'
      : 'Aprobar estará disponible cuando la categoría y su categoría padre estén activas.'
    const reinstatement = item.status_history.find((entry) => entry.from_status === 'published' && entry.to_status === 'pending' && entry.reason?.startsWith('Revisión requerida tras reactivar el perfil:'))
    return <article className="moderation-card" key={item.id}><div className="moderation-card__image">{item.images[0] && <img src={item.images[0].url} alt={item.images[0].alt_text ?? item.title} loading="lazy" decoding="async" />}</div><div className="moderation-card__body"><label className="moderation-card__select"><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={bulkBusy || (bulkDecision === 'approve' && !selectableIds.includes(item.id))} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedIds((current) => checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)) }} />{bulkDecision === 'approve' && !selectableIds.includes(item.id) ? 'No aprobable con los requisitos actuales' : 'Seleccionar para acción por lote'}</label><p className="eyebrow eyebrow--quiet">{item.category.name}</p><h2>{item.title}</h2><p>{item.description}</p><p><strong>{item.producer.public_name}</strong> · {item.unit} · Perfil {item.producer.profile_status === 'active' ? 'activo' : item.producer.profile_status === 'suspended' ? 'suspendido' : 'pendiente'} · Teléfono {item.producer.contact_verified ? 'verificado' : 'sin verificar'}</p>{reinstatement && <p className="moderation-feedback"><strong>Revisión tras reactivación:</strong> {reinstatement.reason} · {reinstatement.actor?.name ?? 'Equipo autorizado'}</p>}{approvalBlocked && <p className="moderation-feedback" role="status">{blockedReason}</p>}<div className="moderation-actions"><button className="button button--primary" disabled={busyId === item.id || bulkBusy || approvalBlocked} onClick={() => beginDecision(item, 'approve')}>Aprobar y publicar</button><button className="button button--outline" disabled={busyId === item.id || bulkBusy} onClick={() => beginDecision(item, 'request_changes')}>Solicitar cambios</button><button className="text-link" disabled={busyId === item.id || bulkBusy} onClick={() => beginDecision(item, 'reject')}>Rechazar</button></div>{decisionTarget?.item.id === item.id && <ValidatedForm className="moderation-decision-form" noValidate onSubmit={(event) => { event.preventDefault(); const reason = decisionReason.trim(); if (reason.length < 5) { setDecisionFieldError('Escribe el motivo con al menos cinco caracteres.'); document.getElementById(`moderation-reason-${item.id}`)?.focus(); return } void decide(item, decisionTarget.decision, reason) }}><TextAreaField id={`moderation-reason-${item.id}`} name="reason" label={decisionTarget.decision === 'approve' ? 'Nota de revisión' : 'Motivo de la decisión'} value={decisionReason} onChange={(value) => { setDecisionReason(value); setDecisionFieldError('') }} error={decisionFieldError} minLength={5} maxLength={1000} rows={3} required hint="Este motivo quedará en el historial de moderación y será visible al productor." /><div className="moderation-decision-form__actions"><button className="button button--primary" type="submit" disabled={busyId === item.id || bulkBusy} aria-busy={busyId === item.id}>Guardar decisión</button><button className="button button--outline" type="button" onClick={() => setDecisionTarget(null)}>Cancelar</button></div>{busyId === item.id && <p role="status">Guardando decisión…</p>}</ValidatedForm>}</div></article>
  })}</section></>}{queue && queue.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de publicaciones pendientes"><button className="button button--outline button--small" disabled={queue.current_page <= 1} onClick={() => { setSelectedIds([]); setBulkResult(null); setPage(queue.current_page - 1) }}>Anterior</button><span aria-live="polite">Página {queue.current_page} de {queue.last_page} · {queue.total} pendientes</span><button className="button button--outline button--small" disabled={queue.current_page >= queue.last_page} onClick={() => { setSelectedIds([]); setBulkResult(null); setPage(queue.current_page + 1) }}>Siguiente</button></nav>}</>}</main></AdminShell>
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
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Casos y denuncias</h1><p>La información del reportante y las evidencias se mantienen privadas. Cada caso indica su prioridad, responsable y plazo de atención.</p><Link className="text-link" to="/admin/apelaciones">Revisar apelaciones de productores <ArrowRight size={15} /></Link>{actionError && <p role="alert">{actionError}</p>}{loadError ? <div className="empty-products" role="alert"><strong>No pudimos cargar los casos.</strong><span>{loadError}</span><button className="button button--outline" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Intentar de nuevo</button></div> : cases === null ? <p role="status">Cargando casos…</p> : cases.data.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay denuncias abiertas</strong></div> : <section className="dashboard-list" aria-label="Denuncias activas">{cases.data.map((item) => <article className="report-case" key={item.id}><div><p className="eyebrow eyebrow--quiet">{item.reason_code} · PRIORIDAD {item.priority}</p><h2>{item.resource_type === 'product' ? 'Reporte de oferta' : 'Reporte de productor'} · #{item.resource_id}</h2><Link className="text-link" to={`/admin/seguridad/casos/${item.id}`}>Abrir expediente <ArrowRight size={15} /></Link><p>{item.description}</p><small>Recibido {new Date(item.created_at).toLocaleString('es-PA')} · Responsable: {item.assignee?.name ?? 'Sin asignar'} · {item.evidence.length} evidencia(s) · ref. {item.public_reference.slice(0, 8)}</small><p className={item.sla_overdue ? 'report-case__sla report-case__sla--overdue' : 'report-case__sla'}>{item.sla_overdue ? 'Plazo vencido' : 'Vence'} {new Date(item.sla_due_at).toLocaleString('es-PA')}</p><label className="report-case__priority">Prioridad<select aria-label={`Prioridad del caso ${item.id}`} value={item.priority} disabled={busy === item.id} onChange={(event) => void updatePriority(item, event.currentTarget.value as ReportCase['priority'])}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label>{item.evidence.length > 0 && <div className="evidence-links">{item.evidence.map((evidence) => <a key={evidence.id} href={reportEvidenceUrl(item.id, evidence.id)} target="_blank" rel="noreferrer">Descargar evidencia ({evidence.mime_type})</a>)}</div>}<TextAreaField id={`report-note-${item.id}`} name={`report-note-${item.id}`} label="Nota privada para el historial" value={notes[item.id] ?? ''} onChange={(value) => { setNotes((current) => ({ ...current, [item.id]: value })); setFieldErrors((current) => ({ ...current, [item.id]: '' })) }} error={fieldErrors[item.id]} minLength={5} maxLength={1000} rows={3} required /></div><div className="moderation-actions"><button className="button button--outline" disabled={busy === item.id || item.status === 'reviewing'} aria-busy={busy === item.id} onClick={() => void updateCase(item, 'reviewing')}>{item.status === 'reviewing' ? 'Caso en revisión' : 'Tomar caso y revisar'}</button>{item.status === 'reviewing' && <><button className="button button--primary" disabled={busy === item.id} aria-busy={busy === item.id} onClick={() => void updateCase(item, 'resolved')}>Resolver</button><button className="text-link" disabled={busy === item.id} onClick={() => void updateCase(item, 'dismissed')}>Descartar</button></>}</div>{busy === item.id && <p role="status">Guardando el caso…</p>}</article>)}</section>}{cases && cases.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de casos"><button className="button button--outline button--small" disabled={cases.current_page <= 1} onClick={() => setPage(cases.current_page - 1)}>Anterior</button><span aria-live="polite">Página {cases.current_page} de {cases.last_page} · {cases.total} casos</span><button className="button button--outline button--small" disabled={cases.current_page >= cases.last_page} onClick={() => setPage(cases.current_page + 1)}>Siguiente</button></nav>}</main></AdminShell>
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

  return <AdminShell><main className="admin-content"><nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/admin">Administración</Link><ChevronRight size={14} /><Link to="/admin/denuncias">Casos y denuncias</Link><ChevronRight size={14} /><span aria-current="page">Expediente</span></nav><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>{caseDetail ? `Expediente de seguridad · #${caseDetail.id}` : 'Expediente de seguridad'}</h1><p>Consulta el reporte, su recurso asociado y las acciones registradas. El contacto del reportante y las rutas internas de archivos permanecen privados.</p><Link className="text-link" to="/admin/denuncias">← Volver a casos</Link>{error ? <div className="empty-products" role="alert"><strong>{error}</strong>{error.includes('no tiene permiso') || error.includes('Inicia sesión') ? <Link className="button button--outline" to="/adminsc1car">Ingresar con una cuenta autorizada</Link> : <button className="button button--outline" type="button" onClick={() => { setError(''); setAttempt((current) => current + 1) }}>Intentar de nuevo</button>}</div> : !caseDetail ? <p role="status">Cargando expediente…</p> : <><section className="case-dossier" aria-labelledby="case-summary-title"><div className="case-dossier__summary"><div><p className="eyebrow eyebrow--quiet">REFERENCIA · {caseDetail.public_reference}</p><h2 id="case-summary-title">{caseDetail.reason_code} · {caseDetail.resource_type === 'product' ? 'Reporte de oferta' : 'Reporte de productor'}</h2><p className="case-dossier__description">{caseDetail.description}</p></div><div className="case-dossier__status"><span className={`status-pill status-pill--${caseDetail.status}`}>{statusLabels[caseDetail.status] ?? caseDetail.status}</span><span className={caseDetail.sla_overdue ? 'report-case__sla report-case__sla--overdue' : 'report-case__sla'}>{caseDetail.sla_overdue ? 'Plazo vencido' : 'Vence'} {new Date(caseDetail.sla_due_at).toLocaleString('es-PA')}</span></div></div><dl className="case-dossier__facts"><div><dt>Recibido</dt><dd>{new Date(caseDetail.created_at).toLocaleString('es-PA')}</dd></div><div><dt>Responsable</dt><dd>{caseDetail.assignee?.name ?? 'Sin asignar'}</dd></div><div><dt>Prioridad</dt><dd>{priorityLabels[caseDetail.priority]}</dd></div><div><dt>Evidencias</dt><dd>{caseDetail.evidence.length}</dd></div></dl></section>
      <section className="case-dossier__resource" aria-labelledby="case-resource-title"><p className="eyebrow eyebrow--quiet">RECURSO DENUNCIADO</p><h2 id="case-resource-title">{caseDetail.resource?.label ?? `${caseDetail.resource_type === 'product' ? 'Oferta' : 'Perfil'} · #${caseDetail.resource_id}`}</h2>{caseDetail.resource && <Link className="text-link" to={caseDetail.resource.type === 'product' ? `/productos/${caseDetail.resource.slug}` : `/productores/${caseDetail.resource.slug}`} target="_blank" rel="noreferrer">Abrir vista pública <ArrowUpRight size={15} /></Link>}{caseDetail.evidence.length > 0 && <div className="evidence-links">{caseDetail.evidence.map((evidence) => <a key={evidence.id} href={reportEvidenceUrl(id, evidence.id)} target="_blank" rel="noreferrer">Descargar evidencia ({evidence.mime_type} · {Math.ceil(evidence.size_bytes / 1024)} KB)</a>)}</div>}</section>
      <section className="case-dossier__actions" aria-labelledby="case-actions-title"><h2 id="case-actions-title">Revisión del caso</h2>{actionError && <p role="alert">{actionError}</p>}<label className="report-case__priority">Prioridad<select aria-label="Prioridad del expediente" value={caseDetail.priority} disabled={busy} onChange={(event) => void changePriority(event.currentTarget.value as ReportCaseDetail['priority'])}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label>{['new', 'reviewing'].includes(caseDetail.status) ? <><TextAreaField id={`case-detail-note-${id}`} name="resolution_note" label="Nota privada para el historial" value={note} onChange={(value) => { setNote(value); setNoteError('') }} error={noteError} minLength={releaseTarget ? 10 : 5} maxLength={1000} rows={3} required hint={releaseTarget ? 'Para devolverlo a la cola, explica el motivo con al menos diez caracteres.' : undefined} /><div className="moderation-actions"><button className="button button--outline" type="button" disabled={busy || caseDetail.status === 'reviewing'} aria-busy={busy} onClick={() => void decideCase('reviewing')}>Tomar caso y revisar</button>{caseDetail.status === 'reviewing' && <><button className="button button--primary" type="button" disabled={busy} aria-busy={busy} onClick={() => void decideCase('resolved')}>Resolver caso</button><button className="text-link" type="button" disabled={busy} onClick={() => void decideCase('dismissed')}>Descartar caso</button><button className="button button--outline" type="button" disabled={busy || !caseDetail.can_release} onClick={() => setReleaseTarget(true)}>Devolver a la cola</button></>}</div>{busy && <p role="status">Guardando la acción…</p>}</> : <p role="status">Este caso está cerrado. Puedes consultar su historial de decisiones.</p>}</section>
      <section className="case-dossier__history" aria-labelledby="case-history-title"><h2 id="case-history-title">Historial de acciones</h2>{caseDetail.history.length === 0 ? <p>Aún no hay acciones registradas para este caso.</p> : <ol className="case-timeline">{caseDetail.history.map((event, index) => <li key={`${event.action}-${event.created_at}-${index}`}><div className="case-timeline__marker" aria-hidden="true" /><div><h3>{historyLabels[event.action] ?? 'Actividad registrada'}</h3><p>{event.actor?.name ?? 'Sistema' } · {new Date(event.created_at).toLocaleString('es-PA')}</p>{event.reason && <blockquote>{event.reason}</blockquote>}{Object.entries(event.changes).map(([key, value]) => <p key={key}><strong>{changeLabels[key] ?? key}:</strong> {String(value.from ?? '—')} → {String(value.to ?? '—')}</p>)}</div></li>)}</ol>}</section>
    </>}</main>{releaseTarget && <ConfirmActionDialog title="Devolver caso a la cola" accessibleName="Devolver caso a la cola" description="El caso dejará tu asignación y volverá a la cola de casos nuevos. Revisa que la nota privada explique el motivo." confirmLabel="Devolver a la cola" busyLabel="Devolviendo…" busy={busy} error={actionError} onCancel={() => setReleaseTarget(false)} onConfirm={() => void releaseCurrentCase()} />}</AdminShell>
}

function AdminHomePage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState('')
  const [canReviewMfaRecovery, setCanReviewMfaRecovery] = useState(false)
  useEffect(() => { void getAdminMetrics().then(setMetrics).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar el panel.')) }, [])
  useEffect(() => { let active = true; void getAdminPermissions().then((permissions) => { if (active) setCanReviewMfaRecovery(permissions.includes('security.mfa_recovery.review')) }).catch(() => { if (active) setCanReviewMfaRecovery(false) }); return () => { active = false } }, [])
  const recoveryLocked = error.includes('El acceso administrativo está bloqueado')
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">OPERACIÓN DEL MERCADO</p><h1>Administración</h1>{error ? <div className="empty-products" role="alert"><strong>{recoveryLocked ? 'El acceso administrativo está bloqueado durante la recuperación de MFA.' : error}</strong>{recoveryLocked && <p>Vuelve a ingresar para continuar con la reinscripción de tu autenticador.</p>}<Link className="button button--primary" to="/adminsc1car">{recoveryLocked ? 'Volver a ingresar' : 'Ingresar'}</Link></div> : !metrics ? <p role="status">Cargando métricas operativas…</p> : <><p>Indicadores agregados para orientar la operación. Las intenciones de contacto no equivalen a conversaciones ni ventas.</p><section className="admin-metric-grid"><article><span>Productores</span><strong>{Object.values(metrics.producers).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.producers).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></article><article><span>Publicaciones</span><strong>{Object.values(metrics.products).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.products).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></article><article><span>Casos abiertos</span><strong>{metrics.reports_open}</strong><small>Denuncias nuevas o en revisión</small></article><article><span>Intenciones de contacto</span><strong>{metrics.contact_intentions_30d}</strong><small>Últimos 30 días</small></article><article><span>Búsquedas sin resultados</span><strong>{metrics.searches_without_results_30d}</strong><small>Últimos 30 días</small></article><article><span>Tiempo medio de moderación</span><strong>{metrics.average_moderation_hours_30d === null ? '—' : `${metrics.average_moderation_hours_30d} h`}</strong><small>Hasta la primera decisión humana · {metrics.moderation_decisions_30d} decisiones en 30 días</small></article></section><nav className="admin-links" aria-label="Herramientas administrativas"><Link to="/admin/publicaciones">Cola de moderación <ArrowRight size={15} /></Link><Link to="/admin/denuncias">Casos y denuncias <ArrowRight size={15} /></Link><Link to="/admin/alertas">Alertas de seguridad <ArrowRight size={15} /></Link>{canReviewMfaRecovery && <Link to="/admin/seguridad/recuperacion-mfa">Recuperación de MFA <ShieldCheck size={15} /></Link>}<Link to="/admin/apelaciones">Apelaciones de productores <ArrowRight size={15} /></Link><Link to="/admin/historias">Historias de productores <ArrowRight size={15} /></Link><Link to="/admin/registro-asistido">Registro asistido <ArrowRight size={15} /></Link><Link to="/admin/productores">Directorio de productores <ArrowRight size={15} /></Link><Link to="/admin/catalogos">Categorías y ubicaciones <ArrowRight size={15} /></Link><Link to="/admin/mensajes">Mensajes de contacto <ArrowRight size={15} /></Link><Link to="/admin/usuarios">Usuarios y permisos <ArrowRight size={15} /></Link><Link to="/admin/reportes">Métricas <ArrowRight size={15} /></Link><Link to="/admin/auditoria">Auditoría <ArrowRight size={15} /></Link><Link to="/admin/correo">Ajustes de correo <ArrowRight size={15} /></Link></nav></>}</main></AdminShell>
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
  useEffect(() => { void getAdminPermissions().then(setStaffPermissions).catch(() => setStaffPermissions([])) }, [])
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
      await registerProducer({ name: String(data.get('name')), email: String(data.get('email')), password: String(data.get('password')), public_name: String(data.get('public_name')), activities: data.getAll('activities[]').map(String), location_id: Number(data.get('location_id')), phone: String(data.get('phone')), terms_version: 'terms-2026-10', privacy_version: 'privacy-2026-10', producer_authorized: data.get('producer_authorized') === 'on', terms_confirmed: data.get('terms_confirmed') === 'on', privacy_confirmed: data.get('privacy_confirmed') === 'on' }, true)
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
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · APOYO A PRODUCTORES</p><h1 ref={directoryHeadingRef} tabIndex={-1}>{assistedOnly ? 'Registro asistido de productores' : 'Directorio de productores'}</h1>{statusMessage && <p className="moderation-feedback" role="status">{statusMessage}</p>}
    {!assistedOnly && <ValidatedForm key={`${query}|${status}`} className="admin-producer-filters" onSubmit={applyFilters}>
      <label className="catalog-search"><Search size={18} /><span className="sr-only">Buscar productor</span><input type="search" role="searchbox" aria-label="Buscar productor" name="q" defaultValue={query} placeholder="Nombre o correo" /></label>
      <label className="catalog-filter"><span>Estado del perfil</span><select aria-label="Filtrar por estado del perfil" name="status" defaultValue={status}><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="active">Activo</option><option value="suspended">Suspendido</option></select></label>
      <button className="button button--outline" type="submit">Aplicar filtros</button>
    </ValidatedForm>}
    {assistedOnly && !canAssist && <p role="alert">Tu cuenta no tiene permiso para registrar productores de forma asistida.</p>}
    {canAssist && <details className="assisted-registration" open={assistedOnly}><summary>{assistedOnly ? 'Registro de productor con autorización' : 'Registrar un productor con su autorización'}</summary><p>Completa el formulario con el productor presente o con su autorización documentada. El perfil quedará atribuido a tu cuenta y sin teléfono público hasta que el productor verifique el número e inicie su propia sesión.</p>{assistedError && <p role="alert">{assistedError}</p>}{assistedMessage && <p role="status">{assistedMessage}</p>}<ValidatedForm key={assistedFormVersion} className="auth-form" aria-busy={assistedSubmitting} onSubmit={(event) => void submitAssistedProducer(event)}><label>Nombre del productor<input name="name" required maxLength={120} disabled={assistedSubmitting} /></label><label>Correo electrónico del productor<input name="email" type="email" required disabled={assistedSubmitting} /></label><label>Nombre público<input name="public_name" required maxLength={120} disabled={assistedSubmitting} /></label><div className="activity-field"><span>Actividades principales</span><ActivityMultiSelect disabled={assistedSubmitting} /></div><fieldset className="location-fieldset" disabled={assistedSubmitting}><legend>Ubicación de tu emprendimiento</legend><LocationPicker locations={assistedLocations} idPrefix="assisted-location" required disabled={assistedSubmitting || assistedLocationsLoading || assistedLocationsError || assistedLocations.length === 0} /></fieldset>{assistedLocationsError && <div role="alert"><span>No pudimos cargar las localidades. </span><button className="text-link" type="button" onClick={() => setAssistedLocationsRetry((attempt) => attempt + 1)}>Reintentar</button></div>}{!assistedLocationsLoading && !assistedLocationsError && assistedLocations.length === 0 && <p role="alert">No hay localidades disponibles para el registro asistido.</p>}<label>Teléfono privado<input name="phone" type="tel" autoComplete="tel" placeholder="6000-1234" required maxLength={40} disabled={assistedSubmitting} /><small>Panamá: ocho dígitos; otros países deben incluir el prefijo internacional.</small></label><label>Clave temporal para entrega privada<input name="password" type="password" minLength={12} required autoComplete="new-password" disabled={assistedSubmitting} /></label><label className="auth-consent"><input name="producer_authorized" type="checkbox" required disabled={assistedSubmitting} />El productor autorizó este registro y la recopilación de sus datos.</label><label className="auth-consent"><input name="terms_confirmed" type="checkbox" required disabled={assistedSubmitting} />El productor confirmó los términos del servicio (terms-2026-10).</label><label className="auth-consent"><input name="privacy_confirmed" type="checkbox" required disabled={assistedSubmitting} />El productor confirmó haber leído el aviso de privacidad (privacy-2026-10).</label><button className="button button--primary" type="submit" disabled={assistedSubmitting || assistedLocationsLoading || assistedLocationsError || assistedLocations.length === 0}>{assistedSubmitting ? 'Registrando productor…' : 'Registrar productor'}</button></ValidatedForm></details>}
    {!assistedOnly && <>{error && <p role="status">{error}</p>}{error && error.includes('cuenta creada') ? null : error ? <div className="empty-products" role="alert"><strong>{error}</strong><Link className="button button--primary" to="/adminsc1car">Ingresar</Link></div> : !results ? <p role="status">Cargando productores…</p> : <><p className="catalog-result-count">{results.total} {results.total === 1 ? 'productor' : 'productores'} encontrados</p>{results.data.length ? <div className="dashboard-list">{results.data.map((producer) => <article className="dashboard-row" key={producer.id}><div><h2>{producer.public_name}</h2><p>{producer.account && <>{producer.account.name} · {producer.account.email} · </>}{producer.products_count} ofertas</p><span className={`status-pill status-pill--${producer.profile_status}`}>{producer.profile_status}</span></div><div className="admin-producer-actions"><Link className="button button--quiet button--small" to={`/admin/productores/${producer.id}`}>Ver ficha</Link>{producer.profile_status === 'active' && canSuspend && <button ref={statusTriggerRef} className="button button--outline button--small" type="button" onClick={(event) => openStatusDialog(event, producer)}>Suspender</button>}{producer.profile_status !== 'active' && canAssist && <button ref={statusTriggerRef} className="button button--outline button--small" type="button" onClick={(event) => openStatusDialog(event, producer)}>{producer.profile_status === 'suspended' ? 'Reactivar' : 'Activar'}</button>}</div></article>)}</div> : <div className="empty-products"><strong>No encontramos productores con esos filtros</strong><span>Prueba con otro nombre o estado.</span></div>}{results.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de productores"><button className="button button--outline button--small" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Página anterior</button><span>Página {results.current_page} de {results.last_page}</span><button className="button button--outline button--small" disabled={page >= results.last_page} onClick={() => goToPage(page + 1)}>Página siguiente</button></nav>}</>}</>}</main>{statusTarget && <ConfirmActionDialog title={statusTarget.profile_status === 'active' ? 'Suspender perfil' : statusTarget.profile_status === 'suspended' ? 'Reactivar perfil' : 'Activar perfil'} accessibleName={`Cambiar estado de ${statusTarget.public_name}`} description={statusTarget.profile_status === 'active' ? `Al suspender a ${statusTarget.public_name}, sus ofertas dejarán de estar disponibles.` : statusTarget.profile_status === 'suspended' ? `Al reactivar a ${statusTarget.public_name}, sus ofertas publicadas volverán a revisión humana.` : `Al activar a ${statusTarget.public_name}, sus ofertas seguirán sujetas a revisión humana antes de aparecer en el catálogo.`} confirmLabel={statusTarget.profile_status === 'active' ? 'Suspender perfil' : statusTarget.profile_status === 'suspended' ? 'Reactivar perfil' : 'Activar perfil'} busyLabel={statusTarget.profile_status === 'active' ? 'Suspendiendo…' : statusTarget.profile_status === 'suspended' ? 'Reactivando…' : 'Activando…'} busy={statusBusy} error={statusError} confirmFormId="admin-producer-status-form" initialFocusId="admin-producer-status-reason" onCancel={closeStatusDialog}><ValidatedForm id="admin-producer-status-form" className="auth-form" onSubmit={(event) => void saveProducerStatus(event)}><TextAreaField id="admin-producer-status-reason" name="reason" label={statusTarget.profile_status === 'active' ? 'Motivo de suspensión' : statusTarget.profile_status === 'suspended' ? 'Motivo de reactivación' : 'Motivo de activación'} value={statusReason} onChange={setStatusReason} minLength={5} maxLength={1000} rows={3} required disabled={statusBusy} hint="El motivo se guardará en la bitácora del perfil." /></ValidatedForm></ConfirmActionDialog>}</AdminShell>
}

// Reference value for the 128-dimension face descriptor: lower means more alike.
const FACE_MATCH_REFERENCE = 0.6
const SERVER_MATCH_LABELS = { strong: 'coincidencia alta', possible: 'coincidencia posible', no_match: 'no coincide', unavailable: 'no disponible' } as const

function AdminBiometricReview({ detail, check, onUpdated }: { detail: AdminProducerDetail; check: AdminBiometricCheck; onUpdated: (detail: AdminProducerDetail) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const statusLabel = { pending: 'Pendiente de revisión', approved: 'Aprobada', rejected: 'Rechazada' }[check.status]

  async function decide(decision: 'approve' | 'reject') {
    if (reason.trim().length < 10) { setError('Explica la decisión con al menos diez caracteres.'); return }
    setBusy(true); setError('')
    try {
      await decideBiometricCheck(detail.producer.id, check.id, decision, reason.trim())
      onUpdated({
        ...detail,
        biometric_check: { ...check, status: decision === 'approve' ? 'approved' : 'rejected', selfie_url: null, cedula_url: null, review_reason: reason.trim(), reviewed_at: new Date().toISOString() },
        producer: decision === 'approve' ? { ...detail.producer, verification_level: 'biometric_verified' } : detail.producer,
      })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar la decisión.') }
    finally { setBusy(false) }
  }

  return (
    <section className="ap-card ap-biometric" aria-labelledby="biometric-review-title">
      <h2 id="biometric-review-title" className="ap-card__title"><ScanFace size={19} aria-hidden="true" />Verificación facial (Verificado Pro)</h2>
      <p><strong>{statusLabel}{check.decision_source === 'automatic' ? ' automáticamente' : ''}.</strong> {check.status === 'pending' ? 'El sistema no pudo confirmar la coincidencia con certeza: compara tú las dos fotos y decide.' : ''}</p>
      {check.server_result && <p>Comparación del servidor: <strong>{SERVER_MATCH_LABELS[check.server_result]}</strong>{check.server_similarity !== null && <> (similitud {check.server_similarity.toFixed(2)}; aprobación automática desde 0.55, posible desde 0.36)</>}.</p>}
      {check.match_distance !== null && <p>Referencia del navegador: {check.match_distance.toFixed(3)} ({check.match_distance <= FACE_MATCH_REFERENCE ? 'dentro' : 'fuera'} del valor {FACE_MATCH_REFERENCE}). Menos fiable que la del servidor.</p>}
      {check.review_reason && <p>Motivo: {check.review_reason}</p>}
      {check.status === 'pending' && (
        <>
          <div className="admin-biometric-photos">
            {check.selfie_url && <figure><img src={check.selfie_url} alt="Foto en vivo del productor" /><figcaption>Foto en vivo</figcaption></figure>}
            {check.cedula_url && <figure><img src={check.cedula_url} alt="Cédula del productor" /><figcaption>Cédula</figcaption></figure>}
          </div>
          <TextAreaField id="biometric-review-reason" name="reason" label="Motivo de la decisión" value={reason} onChange={setReason} />
          {error && <p role="alert">{error}</p>}
          <div className="catalog-admin-actions">
            <button className="button button--primary" type="button" disabled={busy} onClick={() => void decide('approve')}>Aprobar Verificado Pro</button>
            <button className="button button--outline" type="button" disabled={busy} onClick={() => void decide('reject')}>Rechazar</button>
          </div>
          <p>Al decidir, las fotos se borran y solo queda el resultado.</p>
        </>
      )}
    </section>
  )
}

// ── Producer file (ficha) ─────────────────────────────────────────────────────

type ProducerFileTab = 'resumen' | 'publicaciones' | 'verificacion' | 'actividad'

const PROFILE_STATUS_LABELS: Record<string, string> = { active: 'Perfil activo', pending: 'Perfil pendiente', suspended: 'Perfil suspendido' }
const PRODUCT_STATUS_LABELS: Record<string, string> = { pending: 'En revisión', published: 'Publicado', changes_requested: 'Cambios solicitados', rejected: 'Rechazado', draft: 'Borrador', expired: 'Vencido', paused: 'Pausado', unavailable: 'No disponible', archived: 'Archivado' }
const VENDOR_TYPE_LABELS: Record<string, string> = { productor: 'Productor individual', cooperativa: 'Cooperativa', distribuidor: 'PYME / Empresa' }
const PAYMENT_LABELS: Record<string, string> = { efectivo: 'Efectivo', yappy: 'Yappy', transferencia: 'Transferencia bancaria', tarjeta: 'Tarjeta de crédito/débito', cheque: 'Cheque', credito: 'Crédito / Cuenta abierta' }
const CONSENT_LABELS: Record<string, string> = { privacy: 'Política de privacidad', terms: 'Términos de uso', biometric: 'Tratamiento biométrico', assisted_registration_authorization: 'Autorización de registro asistido' }
const LEVEL_LABELS: Record<string, string> = { unverified: 'Contacto sin confirmar', contact_confirmed: 'Teléfono confirmado', identity_reviewed: 'Verificado', biometric_verified: 'Verificado Pro', producer_validated: 'Productor Super Carnes' }
const AUDIT_LABELS: Record<string, string> = {
  'producer.status_changed': 'Estado del perfil cambiado',
  'producer.trust_level_changed': 'Nivel de verificación cambiado',
  'producer.contact_confirmed_manually': 'Teléfono confirmado por llamada',
  'producer.phone_verified': 'Teléfono verificado',
  'producer.phone_changed': 'Teléfono cambiado',
  'producer.profile_updated': 'Perfil actualizado',
  'producer.document_viewed': 'Documento consultado',
  'producer.biometric_submitted': 'Verificación facial enviada',
  'producer.biometric_auto_approved': 'Verificación facial aprobada automáticamente',
  'producer.biometric_reviewed': 'Verificación facial revisada',
  'producer.biometric_viewed': 'Fotos biométricas consultadas',
  'producer.assisted_registration_created': 'Registro asistido',
  'producer.appeal_submitted': 'Apelación enviada',
  'producer.appeal_decided': 'Apelación resuelta',
  'producer.product_images_removed': 'Imágenes de producto retiradas',
}

const shortDate = (value: string) => new Date(value).toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric' })
const longDateTime = (value: string) => new Date(value).toLocaleString('es-PA', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

type ActivityEntry = { key: string; title: string; detail: string | null; actor: string | null; at: string; tone: 'ok' | 'info' | 'warn' }

function producerActivity(detail: AdminProducerDetail): ActivityEntry[] {
  const audit = detail.audit.map((entry, index): ActivityEntry => ({
    key: `a-${index}`, title: AUDIT_LABELS[entry.action] ?? entry.action, detail: entry.reason, actor: entry.actor, at: entry.created_at,
    tone: /approved|confirmed|verified/.test(entry.action) ? 'ok' : /status_changed|removed/.test(entry.action) ? 'warn' : 'info',
  }))
  const products = detail.product_history.map((entry, index): ActivityEntry => ({
    key: `p-${index}`, title: `${entry.product_title}: ${PRODUCT_STATUS_LABELS[entry.to_status] ?? entry.to_status}`, detail: entry.reason, actor: entry.actor, at: entry.created_at,
    tone: entry.to_status === 'published' ? 'ok' : entry.to_status === 'rejected' ? 'warn' : 'info',
  }))
  return [...audit, ...products].sort((a, b) => b.at.localeCompare(a.at))
}

function DataItem({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`ap-data__item${wide ? ' ap-data__item--wide' : ''}`}><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

function CardHead({ Icon, title, aside }: { Icon: typeof Users; title: string; aside?: ReactNode }) {
  return <div className="ap-card__head"><h2><Icon size={19} aria-hidden="true" />{title}</h2>{aside}</div>
}

/** Guided verification: shows what is missing and offers only the next valid step. */
function AdminVerificationCard({ detail, canVerify, onUpdated, onConfirmContact, contactBusy, contactError }: { detail: AdminProducerDetail; canVerify: boolean; onUpdated: (detail: AdminProducerDetail) => void; onConfirmContact: () => void; contactBusy: boolean; contactError: string }) {
  const p = detail.producer
  const level = p.verification_level
  const phoneOk = p.contact_level === 'contact_confirmed'
  const coop = p.vendor_type === 'cooperativa'
  const hasDoc = p.has_cedula_photo || p.has_aviso_operacion || p.has_pacto_social
  const docsOk = coop ? p.has_pacto_social : Boolean(p.ruc) && hasDoc
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<Exclude<ProducerVerificationLevel, 'unverified'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const docs: Array<{ label: string; ok: boolean; url: string | null; show: boolean }> = [
    { label: 'Foto de cédula', ok: p.has_cedula_photo, url: p.cedula_photo_url, show: p.vendor_type === 'productor' || p.has_cedula_photo },
    { label: 'Aviso de operación', ok: p.has_aviso_operacion, url: p.aviso_operacion_url, show: !coop || p.has_aviso_operacion },
    { label: 'Pacto social', ok: p.has_pacto_social, url: p.pacto_social_url, show: p.vendor_type !== 'productor' || p.has_pacto_social },
  ]

  function begin(next: Exclude<ProducerVerificationLevel, 'unverified'>) {
    setTarget(next); setError(''); setMessage('')
    setReason(next === 'identity_reviewed'
      ? (coop ? 'Pacto social revisado; los datos coinciden con el registro.' : `RUC ${p.ruc ?? ''} revisado; el nombre coincide con ${detail.account.name} y con el documento.`)
      : next === 'producer_validated' ? 'Proveedor confirmado de Super Carnes.' : '')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!target) return
    if (reason.trim().length < 5) { setError('Explica la decisión con al menos cinco caracteres.'); return }
    setBusy(true); setError('')
    try {
      const updated = await setAdminProducerTrustLevel(p.id, target, reason.trim())
      setMessage(`Nivel actualizado a ${LEVEL_LABELS[updated.verification_level]}.${updated.auto_activated ? ' El perfil se activó automáticamente.' : ''}`)
      onUpdated({ ...detail, producer: { ...p, verification_level: updated.verification_level, ...(updated.profile_status ? { profile_status: updated.profile_status, suspension_reason: null } : {}) }, trust_reviews: [{ from_level: level, to_level: updated.verification_level, reason: reason.trim(), actor: 'Tú', created_at: new Date().toISOString() }, ...detail.trust_reviews] })
      setTarget(null); setReason('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el nivel.') }
    finally { setBusy(false) }
  }

  const pill = level === 'unverified' ? <span className="ap-pill ap-pill--warn">Teléfono pendiente</span>
    : level === 'contact_confirmed' ? <span className={`ap-pill ${docsOk ? 'ap-pill--info' : 'ap-pill--warn'}`}>{docsOk ? 'Lista para revisar' : 'Faltan documentos'}</span>
      : <span className="ap-pill ap-pill--ok">{LEVEL_LABELS[level]}</span>

  const checklist: Array<{ ok: boolean; label: string; extra?: ReactNode }> = [
    { ok: phoneOk, label: phoneOk ? 'Teléfono confirmado' : 'Teléfono sin confirmar' },
    ...(!coop ? [{ ok: Boolean(p.ruc), label: p.ruc ? `RUC registrado: ${p.ruc}${p.ruc_dv ? ` DV ${p.ruc_dv}` : ''}` : p.vendor_type === 'distribuidor' ? 'RUC no registrado' : 'RUC no registrado (necesario para Verificado)' }] : []),
    ...docs.filter((doc) => doc.show).map((doc) => ({ ok: doc.ok, label: doc.ok ? `${doc.label} cargada` : `${doc.label} no adjuntada`, extra: doc.ok && doc.url ? <a href={doc.url} target="_blank" rel="noopener noreferrer">Ver <ArrowUpRight size={13} aria-hidden="true" /></a> : null })),
  ]

  let next: ReactNode
  if (!phoneOk) {
    next = <div className="ap-next"><div><strong>Siguiente paso: confirmar el teléfono</strong><p>Llama al {p.phone_private ?? 'número registrado'} y confirma que habla {detail.account.name}. Al confirmarlo, el número se vuelve visible en el catálogo.</p></div><button className="button button--primary" type="button" disabled={contactBusy} aria-busy={contactBusy} onClick={onConfirmContact}><CheckCircle2 size={16} aria-hidden="true" />{contactBusy ? 'Confirmando…' : 'Ya lo llamé: confirmar'}</button>{contactError && <p role="alert">{contactError}</p>}</div>
  } else if (level === 'contact_confirmed') {
    next = docsOk
      ? <div className="ap-next ap-next--ready"><div><strong>Siguiente paso: otorgar Verificado</strong><p>Abre {coop ? 'el pacto social' : 'el documento'} y comprueba que {coop ? 'los datos coinciden con el registro' : `el RUC y el nombre coinciden con ${detail.account.name}`}.</p></div>{canVerify && target === null && <button className="button button--primary" type="button" onClick={() => begin('identity_reviewed')}><ShieldCheck size={16} aria-hidden="true" />Revisar y otorgar</button>}</div>
      : <div className="ap-next ap-next--blocked"><div><strong>Esperando al productor</strong><p>Para otorgar Verificado necesita {coop ? 'subir su pacto social' : `${p.ruc ? '' : 'registrar su RUC'}${!p.ruc && !hasDoc ? ' y ' : ''}${hasDoc ? '' : 'subir un documento (cédula o aviso de operación)'}`} desde Mi perfil → Verificación.</p></div></div>
  } else if (level === 'identity_reviewed') {
    next = <div className="ap-next"><div><strong>Verificado otorgado</strong><p>El siguiente nivel, Verificado Pro, lo inicia el productor con su verificación facial. Si coincide con claridad se aprueba solo; si no, aparecerá aquí para que lo revises.</p></div></div>
  } else {
    next = <div className="ap-next ap-next--ready"><div><strong>{LEVEL_LABELS[level]}</strong><p>No hay pasos pendientes de verificación.</p></div></div>
  }

  const secondary = canVerify ? ({
    unverified: [],
    contact_confirmed: [],
    identity_reviewed: [{ value: 'producer_validated' as const, label: 'Marcar como Productor Super Carnes' }, { value: 'contact_confirmed' as const, label: 'Retirar Verificado' }],
    biometric_verified: [{ value: 'producer_validated' as const, label: 'Marcar como Productor Super Carnes' }, { value: 'identity_reviewed' as const, label: 'Bajar a Verificado' }, { value: 'contact_confirmed' as const, label: 'Retirar verificación' }],
    producer_validated: [{ value: 'identity_reviewed' as const, label: 'Bajar a Verificado' }, { value: 'contact_confirmed' as const, label: 'Retirar verificación' }],
  }[level]) : []

  return (
    <section className="ap-card" aria-labelledby="ap-verification-title">
      <div className="ap-card__head"><h2 id="ap-verification-title"><ShieldCheck size={19} aria-hidden="true" />Verificación de identidad</h2>{pill}</div>
      <div className="ap-verify">
        <div>
          <ul className="ap-checklist">
            {checklist.map((item) => <li key={item.label} className={item.ok ? 'is-ok' : 'is-missing'}>{item.ok ? <CheckCircle2 size={17} aria-hidden="true" /> : <Clock size={17} aria-hidden="true" />}<span>{item.label}</span>{item.extra}</li>)}
          </ul>
          <ol className="ap-ladder" aria-label="Niveles">
            {(['contact_confirmed', 'identity_reviewed', 'biometric_verified'] as const).map((step) => {
              const rank = { unverified: 0, contact_confirmed: 1, identity_reviewed: 2, biometric_verified: 3, producer_validated: 3 }
              return <li key={step} className={rank[level] >= rank[step] ? 'is-done' : ''}>{LEVEL_LABELS[step]}</li>
            })}
          </ol>
        </div>
        <div className="ap-verify__action">
          {next}
          {target && (
            <ValidatedForm className="ap-decision" onSubmit={(event) => void save(event)}>
              <TextAreaField id="ap-trust-reason" name="reason" label={`Fundamento para ${target === 'contact_confirmed' ? 'retirar la verificación' : `“${LEVEL_LABELS[target]}”`}`} value={reason} onChange={(value) => { setReason(value); setError('') }} minLength={5} maxLength={1000} rows={3} required disabled={busy} hint="Queda en la bitácora. No pegues números de documentos completos." />
              <div className="ap-actions">
                <button className={`button ${target === 'contact_confirmed' || (target === 'identity_reviewed' && level !== 'contact_confirmed') ? 'button--danger' : 'button--primary'}`} type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Guardando…' : target === 'contact_confirmed' ? 'Retirar' : `Confirmar ${LEVEL_LABELS[target]}`}</button>
                <button className="button button--outline" type="button" disabled={busy} onClick={() => setTarget(null)}>Cancelar</button>
              </div>
            </ValidatedForm>
          )}
          {error && <p role="alert" className="ap-alert ap-alert--error">{error}</p>}
          {message && <p role="status" className="ap-alert ap-alert--ok">{message}</p>}
          {secondary.length > 0 && target === null && (
            <div className="ap-more"><span>Otras acciones</span>{secondary.map((option) => <button key={option.value} type="button" className="ap-link-button" onClick={() => begin(option.value)}>{option.label}</button>)}</div>
          )}
          {!canVerify && <p className="ap-muted">Tu cuenta puede consultar la verificación, pero no cambiarla.</p>}
        </div>
      </div>
    </section>
  )
}

function AdminProducerDetailPage() {
  const { id = '' } = useParams()
  const [detail, setDetail] = useState<AdminProducerDetail | null>(null)
  const [error, setError] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [tab, setTab] = useState<ProducerFileTab>('resumen')
  const [contactBusy, setContactBusy] = useState(false)
  const [contactError, setContactError] = useState('')
  const [notice, setNotice] = useState('')
  const [moderateTarget, setModerateTarget] = useState<{ id: number; title: string; decision: 'approve' | 'reject' | 'request_changes' } | null>(null)
  const [moderateReason, setModerateReason] = useState('')
  const [moderateReasonError, setModerateReasonError] = useState('')
  const [moderateBusy, setModerateBusy] = useState(false)
  const [moderateError, setModerateError] = useState('')
  const [moderateSuccess, setModerateSuccess] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusReason, setStatusReason] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')

  useEffect(() => { void getAdminProducerDetail(id).then(setDetail).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar la ficha.')) }, [id])
  useEffect(() => { void getAdminPermissions().then(setPermissions).catch(() => setPermissions([])) }, [])

  async function handleModerateProduct(event: React.FormEvent) {
    event.preventDefault()
    if (!moderateTarget) return
    const reason = moderateReason.trim()
    if (reason.length < 5) { setModerateReasonError('Escribe el motivo con al menos cinco caracteres.'); return }
    setModerateBusy(true); setModerateError('')
    try {
      await decideModeration(moderateTarget.id, moderateTarget.decision, reason)
      const newStatus = moderateTarget.decision === 'approve' ? 'published' : moderateTarget.decision === 'reject' ? 'rejected' : 'changes_requested'
      setDetail((prev) => prev ? { ...prev, products: prev.products.map((p) => p.id === moderateTarget.id ? { ...p, status: newStatus } : p), product_history: [{ product_title: moderateTarget.title, from_status: 'pending', to_status: newStatus, reason, actor: 'Tú', created_at: new Date().toISOString() }, ...prev.product_history] } : prev)
      setModerateSuccess(`“${moderateTarget.title}” ${moderateTarget.decision === 'approve' ? 'aprobado y publicado' : moderateTarget.decision === 'reject' ? 'rechazado' : 'devuelto con cambios solicitados'}.`)
      setModerateTarget(null); setModerateReason('')
    } catch (err) { setModerateError(err instanceof Error ? err.message : 'No se pudo guardar la decisión.') }
    finally { setModerateBusy(false) }
  }

  function openModerate(product: { id: number; title: string }, decision: 'approve' | 'reject' | 'request_changes') {
    setModerateTarget({ id: product.id, title: product.title, decision })
    // Approving rarely needs prose; a ready note keeps it to one click while still leaving a trace.
    setModerateReason(decision === 'approve' ? 'Publicación revisada: fotos, precio y categoría correctos.' : '')
    setModerateReasonError(''); setModerateSuccess(''); setModerateError('')
  }

  async function handleConfirmContact() {
    if (!detail || contactBusy) return
    setContactBusy(true); setContactError('')
    try {
      const result = await confirmAdminProducerContact(detail.producer.id)
      setDetail((prev) => prev ? { ...prev, producer: { ...prev.producer, contact_level: result.contact_level, phone_verified_at: result.phone_verified_at, verification_level: prev.producer.verification_level === 'unverified' ? 'contact_confirmed' : prev.producer.verification_level }, audit: [{ action: 'producer.contact_confirmed_manually', before_values: null, after_values: null, reason: 'Confirmación telefónica', actor: 'Tú', created_at: new Date().toISOString() }, ...prev.audit] } : prev)
      setNotice('Teléfono confirmado. El número del productor ya es visible en el catálogo.')
    } catch (reason) { setContactError(reason instanceof Error ? reason.message : 'No se pudo confirmar el contacto.') }
    finally { setContactBusy(false) }
  }

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    const reason = statusReason.trim()
    if (reason.length < 5) { setStatusError('Explica la decisión con al menos cinco caracteres.'); return }
    const current = detail.producer.profile_status
    const nextStatus = current === 'active' ? 'suspended' : 'active'
    setStatusBusy(true); setStatusError('')
    try {
      const result = await setAdminProducerStatus(detail.producer.id, nextStatus, reason)
      setDetail({ ...detail, producer: { ...detail.producer, profile_status: result.profile_status, suspension_reason: result.profile_status === 'suspended' ? reason : null }, audit: [{ action: 'producer.status_changed', before_values: { profile_status: current }, after_values: { profile_status: result.profile_status }, reason, actor: 'Tú', created_at: new Date().toISOString() }, ...detail.audit] })
      setNotice(nextStatus === 'suspended' ? 'Perfil suspendido. Sus publicaciones dejaron de estar disponibles.' : current === 'suspended' ? `Perfil reactivado.${result.products_queued_for_review ? ` ${result.products_queued_for_review} publicaciones volvieron a revisión.` : ''}` : 'Perfil activado. Sus publicaciones aprobadas ya son visibles.')
      setStatusOpen(false); setStatusReason('')
    } catch (failure) { setStatusError(failure instanceof Error ? failure.message : 'No se pudo actualizar el estado del perfil.') }
    finally { setStatusBusy(false) }
  }

  if (error || !detail) {
    return <AdminShell><main className="admin-content ap-file">
      <Link className="ap-back" to="/admin/productores"><ArrowLeft size={15} aria-hidden="true" />Volver al directorio</Link>
      {error ? <div role="alert" className="empty-products"><strong>{error}</strong><Link className="button button--primary" to="/admin/productores">Volver al directorio</Link></div> : <p role="status">Cargando ficha e historial…</p>}
    </main></AdminShell>
  }

  const p = detail.producer
  const activities = p.activities?.length ? p.activities : p.activity ? [p.activity] : []
  const place = [p.location?.name, p.location?.parent?.name].filter(Boolean).join(', ')
  const pending = detail.products.filter((product) => product.status === 'pending')
  const pendingTotal = detail.product_status_counts.pending ?? pending.length
  const productTotal = Object.values(detail.product_status_counts).reduce((sum, value) => sum + value, 0)
  const publishedTotal = detail.product_status_counts.published ?? 0
  const phoneOk = p.contact_level === 'contact_confirmed'
  const status = p.profile_status
  const canVerify = permissions.includes('producers.verify')
  const canChangeStatus = permissions.includes(status === 'active' ? 'producers.suspend' : 'producers.assist')
  const activity = producerActivity(detail)
  const bioPending = detail.biometric_check?.status === 'pending'
  const initials = p.public_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('es-PA')

  const productList = (items: typeof detail.products) => items.length ? (
    <ul className="ap-products">
      {items.map((product) => (
        <li key={product.id} className="ap-product">
          <span className="ap-product__icon"><Package size={20} aria-hidden="true" /></span>
          <div className="ap-product__body">
            <strong>{product.title}</strong>
            <small>Actualizado {shortDate(product.updated_at)}</small>
            <span className={`ap-pill ap-pill--${product.status === 'published' ? 'ok' : product.status === 'pending' ? 'warn' : product.status === 'rejected' ? 'danger' : 'info'}`}>{PRODUCT_STATUS_LABELS[product.status] ?? product.status}</span>
          </div>
          {product.status === 'pending' && moderateTarget?.id !== product.id && (
            <div className="ap-actions ap-product__actions">
              <button className="button button--primary button--small" type="button" disabled={moderateBusy} onClick={() => openModerate(product, 'approve')}><CheckCircle2 size={15} aria-hidden="true" />Aprobar</button>
              <button className="button button--outline button--small" type="button" disabled={moderateBusy} onClick={() => openModerate(product, 'request_changes')}><Pencil size={14} aria-hidden="true" />Solicitar cambios</button>
              <button className="button button--danger-soft button--small" type="button" disabled={moderateBusy} onClick={() => openModerate(product, 'reject')}>Rechazar</button>
            </div>
          )}
          {moderateTarget?.id === product.id && (
            <ValidatedForm className="ap-decision" onSubmit={(event) => void handleModerateProduct(event)}>
              <TextAreaField id={`detail-mod-reason-${product.id}`} name="reason" label={moderateTarget.decision === 'approve' ? 'Nota de aprobación' : moderateTarget.decision === 'reject' ? 'Motivo del rechazo (lo verá el productor)' : '¿Qué debe cambiar? (lo verá el productor)'} value={moderateReason} onChange={(value) => { setModerateReason(value); setModerateReasonError('') }} error={moderateReasonError} minLength={5} maxLength={1000} rows={3} required disabled={moderateBusy} />
              <div className="ap-actions">
                <button className={`button ${moderateTarget.decision === 'reject' ? 'button--danger' : 'button--primary'}`} type="submit" disabled={moderateBusy} aria-busy={moderateBusy}>{moderateBusy ? 'Guardando…' : moderateTarget.decision === 'approve' ? 'Aprobar y publicar' : moderateTarget.decision === 'reject' ? 'Rechazar publicación' : 'Enviar cambios'}</button>
                <button className="button button--outline" type="button" disabled={moderateBusy} onClick={() => setModerateTarget(null)}>Cancelar</button>
              </div>
              {moderateError && <p role="alert" className="ap-alert ap-alert--error">{moderateError}</p>}
            </ValidatedForm>
          )}
        </li>
      ))}
    </ul>
  ) : null

  const activityList = (items: ActivityEntry[]) => items.length ? (
    <ol className="ap-timeline">
      {items.map((entry) => (
        <li key={entry.key} className={`ap-timeline__item ap-timeline__item--${entry.tone}`}>
          <span className="ap-timeline__dot" aria-hidden="true">{entry.tone === 'ok' ? <CheckCircle2 size={15} /> : entry.tone === 'warn' ? <AlertTriangle size={15} /> : <History size={15} />}</span>
          <div><strong>{entry.title}</strong><small>{longDateTime(entry.at)} · {entry.actor ?? 'Sistema'}</small>{entry.detail && <p>{entry.detail}</p>}</div>
        </li>
      ))}
    </ol>
  ) : <p className="ap-muted">Sin actividad registrada.</p>

  return <AdminShell><main className="admin-content ap-file">
    <div className="ap-top">
      <div>
        <Link className="ap-back" to="/admin/productores"><ArrowLeft size={15} aria-hidden="true" />Volver al directorio <span aria-hidden="true">·</span> Gestión de productores</Link>
        <h1>Ficha del productor</h1>
      </div>
      <div className="ap-actions">
        <button className="button button--outline" type="button" onClick={() => setTab('actividad')}><History size={16} aria-hidden="true" />Ver historial completo</button>
        {p.slug && <a className="button button--outline" href={`/productores/${p.slug}`} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={16} aria-hidden="true" />Ver perfil público</a>}
      </div>
    </div>

    <section className="ap-card ap-hero">
      <span className="ap-hero__avatar" aria-hidden="true">{initials}</span>
      <div className="ap-hero__body">
        <h2>{p.public_name}</h2>
        <p>{activities.length ? activities.join(' · ') : 'Sin actividades'}{place && <> <span aria-hidden="true">|</span> {place}</>}</p>
        <div className="ap-hero__pills">
          <span className={`ap-pill ap-pill--${status === 'active' ? 'ok' : status === 'suspended' ? 'danger' : 'warn'}`}>{PROFILE_STATUS_LABELS[status] ?? status}</span>
          <span className={`ap-pill ap-pill--${phoneOk ? 'ok' : 'warn'}`}>{phoneOk ? 'Teléfono confirmado' : 'Teléfono sin confirmar'}</span>
          <span className="ap-pill ap-pill--info">{p.registration_method === 'assisted' ? 'Registro asistido' : 'Registro directo'}</span>
          {['identity_reviewed', 'biometric_verified', 'producer_validated'].includes(p.verification_level) ? <VerificationBadge level={p.verification_level} /> : <span className="ap-pill ap-pill--warn">Identidad pendiente</span>}
        </div>
      </div>
    </section>

    {notice && <p role="status" className="ap-alert ap-alert--ok">{notice}</p>}
    {bioPending && <button type="button" className="ap-alert ap-alert--warn ap-alert--action" onClick={() => setTab('verificacion')}><ScanFace size={18} aria-hidden="true" />Tiene una verificación facial pendiente de tu revisión. <strong>Revisar ahora</strong></button>}

    <div className="ap-stats">
      <div className="ap-card ap-stat"><span className="ap-stat__icon ap-stat__icon--blue"><Package size={20} aria-hidden="true" /></span><div><small>Publicaciones totales</small><strong>{productTotal}</strong></div></div>
      <div className="ap-card ap-stat"><span className="ap-stat__icon ap-stat__icon--amber"><Clock size={20} aria-hidden="true" /></span><div><small>Pendientes de revisión</small><strong>{pendingTotal}</strong></div></div>
      <div className="ap-card ap-stat"><span className={`ap-stat__icon ${phoneOk ? 'ap-stat__icon--green' : 'ap-stat__icon--amber'}`}><ShieldCheck size={20} aria-hidden="true" /></span><div><small>Estado de contacto</small><strong>{phoneOk ? 'Confirmado' : 'Sin confirmar'}</strong></div></div>
      <div className="ap-card ap-stat"><span className="ap-stat__icon ap-stat__icon--violet"><History size={20} aria-hidden="true" /></span><div><small>Fecha de registro</small><strong>{shortDate(detail.account.created_at)}</strong></div></div>
    </div>

    <div className="ap-tabs" role="tablist" aria-label="Secciones de la ficha">
      {([['resumen', 'Resumen', LayoutDashboard], ['publicaciones', 'Publicaciones', Package], ['verificacion', 'Verificación y documentos', ShieldCheck], ['actividad', 'Actividad y auditoría', History]] as const).map(([value, label, Icon]) => (
        <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>
          <Icon size={17} aria-hidden="true" />{label}{value === 'publicaciones' && <span className="ap-count">{productTotal}</span>}{value === 'verificacion' && bioPending && <span className="ap-count ap-count--warn">1</span>}
        </button>
      ))}
    </div>

    <div className="ap-layout">
      <div className="ap-main">
        {tab === 'resumen' && <>
          <section className="ap-card">
            <CardHead Icon={Users} title="Datos del productor" />
            <dl className="ap-data">
              <DataItem label="Nombre completo">{detail.account.name}</DataItem>
              <DataItem label="Nombre comercial">{p.public_name}</DataItem>
              <DataItem label="Tipo de negocio">{VENDOR_TYPE_LABELS[p.vendor_type ?? 'productor'] ?? p.vendor_type}</DataItem>
              <DataItem label="Correo electrónico">{detail.account.email}</DataItem>
              <DataItem label="Teléfono">{p.phone_private}</DataItem>
              <DataItem label="Ubicación">{place}</DataItem>
              <DataItem label="Cédula de identidad">{p.cedula}</DataItem>
              <DataItem label="RUC / DV">{p.ruc ? `${p.ruc}${p.ruc_dv ? ` / ${p.ruc_dv}` : ''}` : null}</DataItem>
              <DataItem label="Métodos de pago">{(p.payment_methods ?? []).map((method) => PAYMENT_LABELS[method] ?? method).join(' · ')}</DataItem>
              <DataItem label="Actividades principales" wide>{activities.join(', ')}</DataItem>
              {p.registered_by && <DataItem label="Registrado por">{p.registered_by}</DataItem>}
              {p.description && <DataItem label="Historia del negocio" wide>{p.description}</DataItem>}
            </dl>
            <p className={`ap-alert ${phoneOk ? 'ap-alert--ok' : 'ap-alert--warn'}`}>{phoneOk ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}{phoneOk ? 'El número de contacto está confirmado y es visible en el catálogo. Los datos de identidad y documentos son de uso administrativo.' : 'El número aún no está confirmado: los compradores no pueden ver el contacto.'}</p>
          </section>
          <AdminVerificationCard detail={detail} canVerify={canVerify} onUpdated={setDetail} onConfirmContact={() => void handleConfirmContact()} contactBusy={contactBusy} contactError={contactError} />
          <section className="ap-card">
            <CardHead Icon={FileText} title="Consentimientos registrados" aside={<span className="ap-muted">{detail.consents.length} {detail.consents.length === 1 ? 'registro' : 'registros'}</span>} />
            {detail.consents.length ? <ul className="ap-rows">{detail.consents.map((consent) => <li key={consent.id}><span><strong>{CONSENT_LABELS[consent.consent_type] ?? consent.consent_type}</strong><small>Versión {consent.version} · {shortDate(consent.accepted_at)}</small></span><span className="ap-pill ap-pill--ok">Aceptado</span></li>)}</ul> : <p className="ap-muted">No hay consentimientos registrados.</p>}
          </section>
        </>}

        {tab === 'publicaciones' && (
          <section className="ap-card">
            <CardHead Icon={Package} title={`Publicaciones (${productTotal})`} aside={productTotal > detail.products.length ? <span className="ap-muted">Mostrando las {detail.products.length} más recientes</span> : undefined} />
            {status !== 'active' && publishedTotal > 0 && <p className="ap-alert ap-alert--warn"><AlertTriangle size={17} aria-hidden="true" />Hay publicaciones aprobadas, pero el perfil está {PROFILE_STATUS_LABELS[status]?.toLowerCase() ?? status}: no se ven en el catálogo hasta activarlo.</p>}
            {moderateSuccess && <p role="status" className="ap-alert ap-alert--ok">{moderateSuccess}</p>}
            {productList(detail.products) ?? <p className="ap-muted">Sin publicaciones.</p>}
          </section>
        )}

        {tab === 'verificacion' && <>
          {detail.biometric_check && <AdminBiometricReview detail={detail} check={detail.biometric_check} onUpdated={setDetail} />}
          <AdminVerificationCard detail={detail} canVerify={canVerify} onUpdated={setDetail} onConfirmContact={() => void handleConfirmContact()} contactBusy={contactBusy} contactError={contactError} />
          <section className="ap-card">
            <CardHead Icon={History} title="Historial de verificación" />
            {detail.trust_reviews.length ? <ol className="ap-timeline">{detail.trust_reviews.map((review, index) => <li key={`${review.created_at}-${index}`} className="ap-timeline__item ap-timeline__item--info"><span className="ap-timeline__dot" aria-hidden="true"><ShieldCheck size={15} /></span><div><strong>{LEVEL_LABELS[review.from_level] ?? review.from_level} → {LEVEL_LABELS[review.to_level] ?? review.to_level}</strong><small>{longDateTime(review.created_at)} · {review.actor ?? 'Sistema'}</small><p>{review.reason}</p></div></li>)}</ol> : <p className="ap-muted">Todavía no hay cambios de nivel.</p>}
          </section>
        </>}

        {tab === 'actividad' && (
          <section className="ap-card">
            <CardHead Icon={History} title="Actividad y auditoría" />
            {activityList(activity)}
          </section>
        )}
      </div>

      <aside className="ap-side">
        <section className="ap-card">
          <CardHead Icon={FileText} title="Moderación de publicaciones" aside={pendingTotal > 0 ? <span className="ap-pill ap-pill--warn">{pendingTotal} {pendingTotal === 1 ? 'pendiente' : 'pendientes'}</span> : <span className="ap-pill ap-pill--ok">Al día</span>} />
          {moderateSuccess && tab !== 'publicaciones' && <p role="status" className="ap-alert ap-alert--ok">{moderateSuccess}</p>}
          {pending.length > 0 ? <>
            <p className="ap-alert ap-alert--warn"><AlertTriangle size={17} aria-hidden="true" />{pending.length === 1 ? 'Este productor tiene una publicación por revisar.' : `Este productor tiene ${pending.length} publicaciones por revisar.`}</p>
            {tab !== 'publicaciones' && productList(pending)}
            <p className="ap-muted ap-small">Revisa la información antes de aprobar. Las decisiones quedan registradas en la bitácora.</p>
          </> : <p className="ap-muted">No hay publicaciones esperando revisión.</p>}
        </section>

        <section className="ap-card">
          <CardHead Icon={Settings} title="Estado y acciones de cuenta" aside={<span className={`ap-pill ap-pill--${status === 'active' ? 'ok' : status === 'suspended' ? 'danger' : 'warn'}`}>{status === 'active' ? 'Activo' : status === 'suspended' ? 'Suspendido' : 'Pendiente'}</span>} />
          <ul className="ap-rows">
            <li><span><strong>Visibilidad en catálogo</strong><small>{status === 'active' ? 'El perfil puede recibir contactos' : 'Sus publicaciones no se muestran'}</small></span><span className={`ap-pill ap-pill--${status === 'active' ? 'ok' : 'warn'}`}>{status === 'active' ? 'Visible' : 'Oculto'}</span></li>
            <li><span><strong>Publicaciones aprobadas</strong><small>Visibles mientras el perfil esté activo</small></span><span className="ap-pill ap-pill--info">{publishedTotal}</span></li>
          </ul>
          {p.suspension_reason && <p className="ap-alert ap-alert--warn"><strong>Motivo registrado:</strong> {p.suspension_reason}</p>}
          {canChangeStatus && !statusOpen && (
            <div className="ap-status-action">
              {status === 'active'
                ? <><span className="ap-muted ap-small">Acciones sensibles con confirmación</span><button type="button" className="ap-link-button ap-link-button--danger" onClick={() => { setStatusOpen(true); setStatusError('') }}><Lock size={15} aria-hidden="true" />Suspender perfil</button></>
                : <button type="button" className="button button--primary" onClick={() => { setStatusOpen(true); setStatusError('') }}>{status === 'suspended' ? 'Reactivar perfil' : 'Activar perfil'}</button>}
            </div>
          )}
          {statusOpen && (
            <ValidatedForm className="ap-decision" onSubmit={(event) => void saveStatus(event)}>
              <TextAreaField id="ap-status-reason" name="reason" label={status === 'active' ? 'Motivo de la suspensión' : status === 'suspended' ? 'Motivo de la reactivación' : 'Motivo de la activación'} value={statusReason} onChange={(value) => { setStatusReason(value); setStatusError('') }} minLength={5} maxLength={1000} rows={3} required disabled={statusBusy} hint={status === 'active' ? 'Sus publicaciones dejarán de estar disponibles.' : status === 'suspended' ? 'Sus ofertas publicadas volverán a revisión humana.' : 'Sus publicaciones aprobadas se harán visibles.'} />
              <div className="ap-actions">
                <button className={`button ${status === 'active' ? 'button--danger' : 'button--primary'}`} type="submit" disabled={statusBusy} aria-busy={statusBusy}>{statusBusy ? 'Guardando…' : status === 'active' ? 'Suspender' : status === 'suspended' ? 'Reactivar' : 'Activar'}</button>
                <button className="button button--outline" type="button" disabled={statusBusy} onClick={() => setStatusOpen(false)}>Cancelar</button>
              </div>
              {statusError && <p role="alert" className="ap-alert ap-alert--error">{statusError}</p>}
            </ValidatedForm>
          )}
        </section>

        <section className="ap-card">
          <CardHead Icon={History} title="Actividad reciente" aside={activity.length > 4 ? <button type="button" className="ap-link-button" onClick={() => setTab('actividad')}>Ver toda <ArrowRight size={14} aria-hidden="true" /></button> : undefined} />
          {activityList(activity.slice(0, 4))}
        </section>
      </aside>
    </div>
  </main></AdminShell>
}

const STORY_QUEUE_TABS: Array<{ status: 'pending' | 'published' | 'rejected'; label: string }> = [
  { status: 'pending', label: 'Pendientes' },
  { status: 'published', label: 'Publicadas' },
  { status: 'rejected', label: 'Devueltas' },
]

function AdminStoriesPage() {
  const [status, setStatus] = useState<'pending' | 'published' | 'rejected'>('pending')
  const [stories, setStories] = useState<OwnedProducerStory[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let current = true
    setStories(null)
    setLoadError('')
    void getAdminStories(status).then((result) => { if (current) { setStories(result.data); setTotal(result.total) } })
      .catch((reason: unknown) => { if (current) setLoadError(reason instanceof Error ? reason.message : 'No pudimos cargar las historias.') })
    return () => { current = false }
  }, [status])

  async function decide(story: OwnedProducerStory, decision: 'approve' | 'reject' | 'unpublish') {
    const note = notes[story.id]?.trim() ?? ''
    if (decision !== 'approve' && note.length < 5) {
      setFieldErrors((current) => ({ ...current, [story.id]: 'Explica al productor qué debe cambiar (mínimo cinco caracteres).' }))
      document.getElementById(`story-note-${story.id}`)?.focus()
      return
    }
    setFieldErrors((current) => ({ ...current, [story.id]: '' }))
    setBusy(story.id)
    setError('')
    try {
      await decideStory(story.id, decision, note)
      setStories((current) => current?.filter((item) => item.id !== story.id) ?? [])
      setTotal((value) => Math.max(0, value - 1))
      setMessage(decision === 'approve' ? `"${story.title}" ya es pública en /historias.` : decision === 'reject' ? `"${story.title}" fue devuelta al productor con tu comentario.` : `"${story.title}" se retiró de la página pública.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos guardar la decisión.') }
    finally { setBusy(null) }
  }

  return (
    <AdminShell>
      <main className="admin-content admin-stories">
        <p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · MODERACIÓN</p>
        <h1>Historias de productores</h1>
        <p>Revisa cada historia antes de que sea pública: que sea respetuosa, que no incluya datos personales sensibles y que el video o la foto correspondan al productor.</p>
        <div className="admin-stories__tabs" role="tablist" aria-label="Estado de las historias">
          {STORY_QUEUE_TABS.map((tab) => <button key={tab.status} type="button" role="tab" aria-selected={status === tab.status} onClick={() => { setMessage(''); setStatus(tab.status) }}>{tab.label}{status === tab.status && stories ? ` (${total})` : ''}</button>)}
        </div>
        {message && <p className="admin-stories__message" role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        {loadError ? <p role="alert">{loadError}</p> : stories === null ? <p role="status">Cargando historias…</p> : stories.length === 0 ? (
          <div className="empty-products"><strong>{status === 'pending' ? 'No hay historias pendientes' : 'No hay historias en esta lista'}</strong><span>{status === 'pending' ? 'Cuando un productor comparta su historia aparecerá aquí para revisión.' : 'Cambia de pestaña para ver otras historias.'}</span></div>
        ) : (
          <ul className="admin-stories__list">
            {stories.map((story) => (
              <li key={story.id} className="admin-stories__item">
                <div className="admin-stories__media">
                  {story.thumbnail_url ? <img src={story.thumbnail_url} alt={`Foto de la historia ${story.title}`} /> : <span>Sin foto</span>}
                  {story.video && <a className="text-link" href={story.video.provider === 'youtube' ? `https://www.youtube.com/watch?v=${story.video.id}` : `https://vimeo.com/${story.video.id}`} target="_blank" rel="noreferrer">Ver video en {story.video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} <ArrowUpRight size={14} aria-hidden="true" /></a>}
                </div>
                <div className="admin-stories__copy">
                  <p className="admin-stories__producer">{story.producer ? <Link to={`/productores/${story.producer.slug}`} target="_blank" rel="noreferrer">{story.producer.public_name}</Link> : 'Productor'}{story.producer?.profile_status && story.producer.profile_status !== 'active' ? ` · perfil ${story.producer.profile_status}` : ''}{story.submitted_at ? ` · enviada el ${new Date(story.submitted_at).toLocaleString('es-PA')}` : ''}</p>
                  <h2>{story.title}</h2>
                  {story.quote && <p className="admin-stories__quote">“{story.quote}”</p>}
                  <p className="admin-stories__body">{story.body}</p>
                  {story.review_note && status !== 'pending' && <p className="admin-stories__note">Nota de revisión: {story.review_note}</p>}
                  <label className="admin-stories__field" htmlFor={`story-note-${story.id}`}>Comentario para el productor {status === 'pending' ? '(obligatorio para devolver)' : '(obligatorio para retirar)'}</label>
                  <textarea id={`story-note-${story.id}`} rows={2} value={notes[story.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [story.id]: event.target.value }))} aria-invalid={Boolean(fieldErrors[story.id])} aria-describedby={fieldErrors[story.id] ? `story-note-error-${story.id}` : undefined} />
                  {fieldErrors[story.id] && <p id={`story-note-error-${story.id}`} className="form-field__error" role="alert">{fieldErrors[story.id]}</p>}
                  <div className="admin-stories__actions">
                    {status === 'pending' && <>
                      <button className="button button--primary" type="button" disabled={busy === story.id} onClick={() => void decide(story, 'approve')}>Aprobar y publicar</button>
                      <button className="button button--outline" type="button" disabled={busy === story.id} onClick={() => void decide(story, 'reject')}>Devolver con comentario</button>
                    </>}
                    {status === 'published' && <>
                      <Link className="button button--outline" to={`/historias/${story.id}`} target="_blank" rel="noreferrer">Ver publicada <ArrowUpRight size={15} aria-hidden="true" /></Link>
                      <button className="button button--outline" type="button" disabled={busy === story.id} onClick={() => void decide(story, 'unpublish')}>Retirar de la página</button>
                    </>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AdminShell>
  )
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

  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Apelaciones de productores</h1><p>Revisa el motivo de suspensión y la respuesta del productor. Toda resolución queda auditada y debe incluir una explicación.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{loadError ? <div role="alert" className="empty-products"><strong>No pudimos cargar las apelaciones.</strong><span>{loadError}</span><button className="button button--outline" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Intentar de nuevo</button></div> : appeals === null ? <p role="status">Cargando apelaciones…</p> : appeals.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay apelaciones pendientes</strong></div> : <section className="dashboard-list">{appeals.map((appeal) => <article className="appeal-card" key={appeal.id}><p className="eyebrow eyebrow--quiet">RECIBIDA {new Date(appeal.submitted_at).toLocaleString('es-PA')} · SOLICITADA POR {appeal.submitter.name}</p><h2>{appeal.producer.public_name}</h2><p><strong>Motivo de suspensión:</strong> {appeal.producer.suspension_reason ?? 'No hay motivo guardado en el perfil.'}</p><p className="appeal-card__reason"><strong>Solicitud del productor:</strong> {appeal.reason}</p>{appeal.published_products_count > 0 && <p className="moderation-feedback" role="note">Si aceptas la apelación, el perfil se restablecerá y {appeal.published_products_count} {appeal.published_products_count === 1 ? 'oferta publicada pasará' : 'ofertas publicadas pasarán'} a revisión humana antes de volver al catálogo.</p>}<TextAreaField id={`appeal-resolution-${appeal.id}`} name={`appeal-resolution-${appeal.id}`} label="Resolución y motivo" value={notes[appeal.id] ?? ''} onChange={(value) => { setNotes((current) => ({ ...current, [appeal.id]: value })); setFieldErrors((current) => ({ ...current, [appeal.id]: '' })) }} error={fieldErrors[appeal.id]} minLength={10} maxLength={1000} rows={3} required /><div className="detail-actions"><button className="button button--primary button--small" disabled={busy === appeal.id} aria-busy={busy === appeal.id} onClick={() => void decide(appeal, 'reinstated')}>Aceptar y restablecer perfil</button><button className="button button--outline button--small" disabled={busy === appeal.id} aria-busy={busy === appeal.id} onClick={() => void decide(appeal, 'upheld')}>Mantener suspensión</button></div>{busy === appeal.id && <p role="status">Guardando la resolución…</p>}</article>)}</section>}</main></AdminShell>
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
    void getAdminPermissions()
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

  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · TRUST & SAFETY</p><h1>Alertas de seguridad</h1><p>Señales explicables para priorizar revisiones humanas. Una señal no confirma fraude ni puede suspender una cuenta por sí sola.</p><Link className="text-link" to="/admin/denuncias">Abrir casos y denuncias <ArrowRight size={15} /></Link>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{loadError ? <div role="alert" className="empty-products"><strong>No pudimos cargar las alertas.</strong><span>{loadError}</span><button className="button button--outline" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Intentar de nuevo</button></div> : alerts === null ? <p role="status">Cargando alertas…</p> : alerts.data.length === 0 ? <div className="empty-products"><ShieldCheck size={24} /><strong>No hay señales abiertas</strong></div> : <section className="dashboard-list" aria-label="Señales abiertas">{alerts.data.map((alert) => <article className="appeal-card" key={alert.id}><p className="eyebrow eyebrow--quiet">{alert.severity.toUpperCase()} · {alert.status === 'reviewing' ? 'EN REVISIÓN' : 'PENDIENTE DE REVISIÓN'}</p><h2>{alert.resource_type === 'product' ? 'Oferta' : 'Perfil de productor'} · #{alert.resource_id}</h2><p>{alert.explanation}</p>{alert.signal_type === 'repeated_reports' && <p>Reportes recibidos en 24 horas: <strong>{alert.evidence.report_count_24h ?? '—'}</strong></p>}<p className="form-help">Responsable: <strong>{alert.assignee?.name ?? 'Sin asignar'}</strong></p><small>Primera señal: {new Date(alert.first_seen_at).toLocaleString('es-PA')} · Actualizada: {new Date(alert.last_seen_at).toLocaleString('es-PA')}</small>{canManage ? <><TextAreaField id={`risk-alert-note-${alert.id}`} name={`risk-alert-note-${alert.id}`} label="Nota de revisión" value={notes[alert.id] ?? ''} onChange={(value) => { setNotes((current) => ({ ...current, [alert.id]: value })); setFieldErrors((current) => ({ ...current, [alert.id]: '' })) }} error={fieldErrors[alert.id]} minLength={10} maxLength={1000} rows={3} required /><div className="detail-actions">{alert.status === 'open' ? <button className="button button--primary button--small" disabled={busy === alert.id} aria-busy={busy === alert.id} onClick={() => void decide(alert, 'reviewing')}>Tomar y revisar</button> : <button className="button button--primary button--small" disabled={busy === alert.id} aria-busy={busy === alert.id} onClick={() => void decide(alert, 'resolved')}>Cerrar revisión</button>}<button className="button button--outline button--small" disabled={busy === alert.id} aria-busy={busy === alert.id} onClick={() => void decide(alert, 'dismissed')}>Descartar señal</button></div></> : <p role="status">{!permissionsLoaded ? 'Comprobando permisos de gestión…' : permissionsError || 'Tienes acceso de solo lectura a las alertas.'}</p>}{busy === alert.id && <p role="status">Guardando la revisión…</p>}</article>)}</section>}{alerts && alerts.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de alertas"><button className="button button--outline button--small" disabled={alerts.current_page <= 1} onClick={() => setPage(alerts.current_page - 1)}>Anterior</button><span aria-live="polite">Página {alerts.current_page} de {alerts.last_page} · {alerts.total} alertas</span><button className="button button--outline button--small" disabled={alerts.current_page >= alerts.last_page} onClick={() => setPage(alerts.current_page + 1)}>Siguiente</button></nav>}</main></AdminShell>
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

  const parentCategoryOptions = categoryTreeOptions(categories ?? []).filter((category) => category.active && categoryPath(categories ?? [], category.id).length < 3)
  const expectedLocationParentLevel = locationLevel === 'district' ? 'province' : locationLevel === 'corregimiento' ? 'district' : null
  const validLocationParents = locations?.filter((place) => place.active && place.level === expectedLocationParentLevel) ?? []

  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN</p><h1>Categorías y ubicaciones</h1>{error && <p role="alert">{error}</p>}{!categories || !locations ? <p role="status">Cargando catálogos…</p> : <div className="catalog-admin-grid"><section className="dashboard-list"><h2>Categorías y subcategorías</h2><p>Organiza las ofertas en dos niveles. Una subcategoría debe depender de una categoría principal activa.</p>{categories.length ? categories.map((category) => {
    const parent = categories.find((item) => item.id === category.parent_id)
    const canActivate = !parent || parent.active
    if (editingCategoryId === category.id) return <article className="catalog-admin-row catalog-admin-row--editing" key={category.id}><ValidatedForm className="admin-category-edit-form auth-form" onSubmit={(event) => void editCategory(event)}><Field id={`admin-category-edit-${category.id}`} name="name" label="Nombre de categoría" type="text" value={categoryEditName} onChange={(event) => { setCategoryEditName(event.currentTarget.value); setCategoryEditError('') }} minLength={2} maxLength={100} required autoFocus disabled={catalogBusy !== null} error={categoryEditError} />{categoryEditError && <p role="alert">{categoryEditError}</p>}<div className="catalog-admin-actions"><button className="button button--primary button--small" type="submit" disabled={catalogBusy !== null} aria-busy={catalogBusy === 'category'}>{catalogBusy === 'category' ? 'Guardando…' : 'Guardar nombre'}</button><button className="button button--outline button--small" type="button" disabled={catalogBusy !== null} onClick={cancelEditCategory}>Cancelar</button></div></ValidatedForm></article>
    return <article className="catalog-admin-row" key={category.id}><span><strong>{categoryPath(categories, category.id).map((item) => item.name).join(' › ')}</strong><small> · {category.products_count} ofertas · {category.active ? 'activa' : 'inactiva'}</small></span><span className="catalog-admin-actions"><button ref={categoryEditTriggerRef} className="text-link" type="button" disabled={catalogBusy !== null} onClick={(event) => { categoryEditTriggerRef.current = event.currentTarget; startEditCategory(category) }}>Editar</button>{category.active ? <button className="text-link" type="button" disabled={catalogBusy !== null} onClick={() => void deactivate('categories', category.id)}>Desactivar</button> : <button className="text-link" type="button" disabled={catalogBusy !== null || !canActivate} title={!canActivate ? 'Activa primero la categoría principal.' : undefined} onClick={() => void activateCategory(category)}>Reactivar</button>}</span></article>  }) : <p>No hay categorías todavía. Agrega una categoría principal para habilitar el catálogo.</p>}<ValidatedForm className="auth-form" noValidate onSubmit={(event) => void addCategory(event)}><h3>Agregar categoría</h3><Field id="admin-category-name" name="name" label="Nombre" type="text" minLength={2} maxLength={100} required error={categoryNameError} onChange={() => setCategoryNameError('')} /><SelectField id="admin-category-parent" name="parent_id" label="Categoría principal" defaultValue="" hint="Sin padre, crearás una categoría principal. Si eliges una, crearás una subcategoría. El árbol admite hasta tres niveles."><option value="">Ninguna · categoría principal</option>{parentCategoryOptions.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</SelectField><button className="button button--primary" type="submit" disabled={catalogBusy !== null} aria-busy={catalogBusy === 'category'}>{catalogBusy === 'category' ? 'Guardando…' : 'Agregar categoría'}</button></ValidatedForm></section><section className="dashboard-list"><h2>Ubicaciones</h2>{locations.length ? locations.map((place) => {
    const parent = locations.find((item) => item.id === place.parent_id)
    const canActivate = !parent || parent.active
    return <article className="catalog-admin-row" key={place.id}><span><strong>{place.name}</strong><small>{parent ? ` · ${parent.name}` : ''} · {place.level} · {place.active ? 'activa' : 'inactiva'}</small></span><span className="catalog-admin-actions"><AdminLocationEditor place={place} locations={locations} busy={catalogBusy !== null} onSave={(name, parentId) => editLocation(place, name, parentId)} />{place.active ? <button className="text-link" type="button" disabled={catalogBusy !== null} onClick={() => void deactivate('locations', place.id)}>Desactivar</button> : <button className="text-link" type="button" disabled={catalogBusy !== null || !canActivate} title={!canActivate ? 'Activa primero la ubicación padre.' : undefined} onClick={() => void activateLocation(place)}>Reactivar</button>}</span></article>
  }) : <p>No hay ubicaciones todavía. Agrega una provincia para completar el registro de productores.</p>}<ValidatedForm className="auth-form" noValidate onSubmit={(event) => void addLocation(event)}><h3>Agregar ubicación</h3><Field id="admin-location-name" name="name" label="Nombre" type="text" minLength={2} maxLength={100} required error={locationNameError} onChange={() => setLocationNameError('')} /><SelectField id="admin-location-level" name="level" label="Nivel" value={locationLevel} onChange={(event) => { setLocationLevel(event.currentTarget.value as AdminLocation['level']); setLocationParentId(''); setLocationParentError('') }}><option value="province">Provincia</option><option value="district">Distrito</option><option value="corregimiento">Corregimiento</option></SelectField><SelectField id="admin-location-parent" name="parent_id" label="Ubicación padre" value={locationParentId} required={locationLevel !== 'province'} error={locationParentError} hint={locationLevel === 'province' ? 'Las provincias no llevan ubicación padre.' : `Selecciona una ubicación activa de nivel ${expectedLocationParentLevel === 'province' ? 'provincia' : 'distrito'}.`} onChange={(event) => { setLocationParentId(event.currentTarget.value); setLocationParentError('') }}><option value="">{locationLevel === 'province' ? 'Sin padre' : 'Selecciona la ubicación padre'}</option>{validLocationParents.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</SelectField><button className="button button--primary" type="submit" disabled={catalogBusy !== null} aria-busy={catalogBusy === 'location'}>{catalogBusy === 'location' ? 'Guardando…' : 'Agregar ubicación'}</button></ValidatedForm></section></div>}</main></AdminShell>
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
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · CONFIGURACIÓN</p><h1>Mensajes de contacto</h1><p>Configura el texto que se abre al iniciar contacto por WhatsApp. La persona puede editarlo antes de enviarlo. Cada cambio queda versionado y auditado.</p><Link className="text-link" to="/admin">Volver a administración <ArrowRight size={15} /></Link>{error && <div role="alert" className="empty-products"><strong>{error}</strong><button type="button" className="button button--outline" onClick={() => setAttempt((value) => value + 1)}>Intentar de nuevo</button></div>}{message && <p role="status">{message}</p>}{templates === null && !error && <p role="status">Cargando plantillas…</p>}{templates && <section className="dashboard-list" aria-label="Plantillas WhatsApp">{templates.map((template) => {
    const allowed = template.key === 'product' ? '{product_title}, {producer_name}' : '{producer_name}'
    return <article className="appeal-card" key={template.key}><h2>Contacto de {template.label}</h2><p>Variables disponibles: <code>{allowed}</code>. La plantilla debe conservar {template.key === 'product' ? <code>{'{product_title}'}</code> : <code>{'{producer_name}'}</code>}.</p><ValidatedForm className="auth-form" noValidate onSubmit={(event) => { event.preventDefault(); if (busy !== template.key) void save(template) }}><TextAreaField id={`message-template-${template.key}`} name="body" label="Mensaje prellenado" value={drafts[template.key] ?? template.body} onChange={(value) => setDrafts((current) => ({ ...current, [template.key]: value }))} minLength={10} maxLength={500} rows={3} required hint="Entre 10 y 500 caracteres. El texto se codifica para el enlace de WhatsApp." /><button className="button button--primary" type="submit" disabled={busy !== null || drafts[template.key] === template.body} aria-busy={busy === template.key}>{busy === template.key ? 'Guardando…' : 'Guardar plantilla'}</button></ValidatedForm><p className="form-help">Versión {template.version}{template.updated_by ? ` · Actualizó ${template.updated_by.name}` : ' · Texto inicial del sistema'}{template.updated_at ? ` · ${new Date(template.updated_at).toLocaleString('es-PA')}` : ''}</p>{template.history.length > 0 && <details><summary>Historial reciente ({template.history.length})</summary><ol>{template.history.map((entry) => <li key={entry.version}>Versión {entry.version} · {entry.updated_by ?? 'Cuenta eliminada'} · {new Date(entry.updated_at).toLocaleString('es-PA')}<blockquote>{entry.body}</blockquote></li>)}</ol></details>}</article>
  })}</section>}</main></AdminShell>
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
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN</p><h1>Métricas operativas</h1>{error ? <div role="alert"><p>{error}</p>{error.includes('bloqueado mientras se recupera el autenticador') && <><p>Vuelve a ingresar para continuar con la reinscripción del autenticador.</p><Link className="button button--outline" to="/adminsc1car">Volver a ingresar</Link></>}</div> : !metrics ? <p role="status">Cargando métricas…</p> : <><p>Datos agregados para analizar la operación. No incluyen información personal; las intenciones de contacto no equivalen a ventas.</p><button className="button button--primary" type="button" onClick={() => void exportCsv()} disabled={exporting} aria-busy={exporting}>{exporting ? 'Preparando CSV…' : 'Descargar CSV agregado'}</button>{exportError && <p role="alert">{exportError}</p>}<section className="admin-metric-grid" aria-label="Resumen de métricas"><article><span>Productores registrados</span><strong>{Object.values(metrics.producers).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.producers).map(([status, count]) => `${status}: ${count}`).join(' · ')}</small></article><article><span>Publicaciones</span><strong>{Object.values(metrics.products).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(metrics.products).map(([status, count]) => `${status.replaceAll('_', ' ')}: ${count}`).join(' · ')}</small></article><article><span>Denuncias abiertas</span><strong>{metrics.reports_open}</strong><small>Casos nuevos o en revisión</small></article><article><span>Intenciones de contacto</span><strong>{metrics.contact_intentions_30d}</strong><small>Últimos 30 días · no representa ventas</small></article><article><span>Búsquedas sin resultados</span><strong>{metrics.searches_without_results_30d}</strong><small>Últimos 30 días</small></article><article><span>Tiempo medio de moderación</span><strong>{metrics.average_moderation_hours_30d === null ? '—' : `${metrics.average_moderation_hours_30d} h`}</strong><small>Hasta la primera decisión humana · {metrics.moderation_decisions_30d} decisiones en 30 días</small></article></section></>}</main></AdminShell>
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
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void Promise.all([getAdminUsers(search, page), getAdminRoles(), getAdminAccounts()])
      .then(([accounts, availableRoles, adminAccs]) => { if (active) { setUsers(accounts); setRoles(availableRoles); setAdminAccounts(adminAccs) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los usuarios.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, page, reload])
  function searchUsers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(searchDraft.trim())
  }
  async function submitCreateAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError('')
    setCreateSuccess('')
    setCreateBusy(true)
    try {
      const account = await createAdminAccount(createName, createEmail, createPassword, createPasswordConfirm)
      setAdminAccounts((current) => [account, ...current])
      setCreateName(''); setCreateEmail(''); setCreatePassword(''); setCreatePasswordConfirm('')
      setShowCreateForm(false)
      setCreateSuccess(`Cuenta creada: ${account.name} (${account.email}). Debe configurar MFA al iniciar sesión.`)
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'No se pudo crear la cuenta.') }
    finally { setCreateBusy(false) }
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
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN · ACCESO</p><h1>Usuarios y permisos</h1>
    <section className="admin-accounts-section" aria-label="Cuentas del panel de administración">
      <div className="admin-accounts-header"><h2>Cuentas de administración</h2><button className="button button--primary button--small" type="button" onClick={() => { setShowCreateForm((v) => !v); setCreateError(''); setCreateSuccess('') }}>{showCreateForm ? 'Cancelar' : 'Crear cuenta'}</button></div>
      {createSuccess && <p className="moderation-feedback moderation-feedback--success" role="status">{createSuccess}</p>}
      {showCreateForm && <ValidatedForm className="auth-form admin-create-account-form" onSubmit={(event) => void submitCreateAdmin(event)}>
        <h3>Nueva cuenta de administrador</h3>
        <Field id="create-admin-name" name="name" label="Nombre completo" value={createName} onChange={(event) => setCreateName(event.currentTarget.value)} minLength={2} maxLength={255} required autoComplete="off" />
        <Field id="create-admin-email" name="email" label="Correo electrónico" type="email" value={createEmail} onChange={(event) => setCreateEmail(event.currentTarget.value)} maxLength={255} required autoComplete="off" />
        <Field id="create-admin-password" name="password" label="Contraseña (mínimo 14 caracteres)" type="password" value={createPassword} onChange={(event) => setCreatePassword(event.currentTarget.value)} minLength={14} maxLength={255} required autoComplete="new-password" hint="La persona debe configurar MFA al iniciar sesión por primera vez." />
        <Field id="create-admin-password-confirm" name="password_confirmation" label="Confirmar contraseña" type="password" value={createPasswordConfirm} onChange={(event) => setCreatePasswordConfirm(event.currentTarget.value)} minLength={14} maxLength={255} required autoComplete="new-password" />
        {createError && <p className="field-error" role="alert">{createError}</p>}
        <button className="button button--primary" type="submit" disabled={createBusy} aria-busy={createBusy}>{createBusy ? 'Creando…' : 'Crear cuenta de administrador'}</button>
      </ValidatedForm>}
      {adminAccounts.length > 0 && <ul className="admin-accounts-list">{adminAccounts.map((acc) => <li key={acc.id} className="admin-accounts-list__item"><strong>{acc.name}</strong><span>{acc.email}</span><span className="admin-accounts-list__date">Creada {new Date(acc.created_at).toLocaleDateString('es-PA')}</span></li>)}</ul>}
    </section>
    <hr className="admin-section-divider" />
    <p>Roles operativos de productores. Solo el Superadministrador puede asignar o modificar los roles Admin y Superadministrador. Cada cambio queda auditado con su motivo.</p><ValidatedForm className="producer-directory__filters" role="search" onSubmit={searchUsers}><label className="catalog-search"><Search size={17} aria-hidden="true" /><input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.currentTarget.value)} aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" maxLength={120} /></label><button className="button button--primary" type="submit">Buscar</button></ValidatedForm>{error ? <div className="empty-products" role="alert"><strong>{error}</strong><button className="button button--outline" type="button" onClick={() => setReload((value) => value + 1)}>Reintentar</button></div> : loading ? <p role="status">Cargando usuarios…</p> : !users || users.data.length === 0 ? <div className="empty-products"><strong>No se encontraron usuarios</strong><span>Prueba con otro nombre o correo.</span></div> : <><section className="dashboard-list" aria-label="Cuentas internas">{users.data.map((user) => { const canEditRoles = user.roles.every((assigned) => roles.some((available) => available.name === assigned.name)); return <article className="dashboard-row admin-user-row" key={user.id}><div><h2>{user.name}</h2><p>{user.email}</p><p>Roles actuales: {user.roles.map((role) => role.display_name).join(', ')}</p></div>{canEditRoles ? <ValidatedForm className="admin-role-form auth-form" onSubmit={(event) => void updateRoles(user, event)}><fieldset><legend>Roles</legend>{roles.map((role) => { const selectedRoles = roleDrafts[user.id] ?? user.roles.map((assigned) => assigned.name); return <label className="auth-consent" key={role.id}><input type="checkbox" name="roles" value={role.name} checked={selectedRoles.includes(role.name)} disabled={busy === user.id} onChange={(event) => { const next = event.currentTarget.checked ? [...selectedRoles, role.name] : selectedRoles.filter((name) => name !== role.name); setRoleDrafts((current) => ({ ...current, [user.id]: next })); setRoleErrors((current) => ({ ...current, [user.id]: '' })) }} />{role.display_name}</label> })}</fieldset><TextAreaField id={`admin-role-reason-${user.id}`} name="reason" label="Motivo del cambio de permisos" value={roleReasons[user.id] ?? ''} onChange={(value) => { setRoleReasons((current) => ({ ...current, [user.id]: value })); setRoleFieldErrors((current) => ({ ...current, [user.id]: '' })); setRoleErrors((current) => ({ ...current, [user.id]: '' })) }} error={roleFieldErrors[user.id]} minLength={5} maxLength={1000} rows={2} required disabled={busy === user.id} hint="El motivo se registrará en la auditoría." />{roleErrors[user.id] && <p role="alert">{roleErrors[user.id]}</p>}<button className="button button--outline" type="submit" disabled={busy === user.id} aria-busy={busy === user.id}>{busy === user.id ? 'Guardando…' : 'Guardar roles'}</button></ValidatedForm> : <p className="moderation-feedback">Los roles administrativos solo los puede modificar un Superadministrador.</p>}</article> })}</section>{users.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de usuarios"><button className="button button--outline button--small" disabled={users.current_page <= 1} onClick={() => setPage(users.current_page - 1)}>Anterior</button><span aria-live="polite">Página {users.current_page} de {users.last_page} · {users.total} cuentas</span><button className="button button--outline button--small" disabled={users.current_page >= users.last_page} onClick={() => setPage(users.current_page + 1)}>Siguiente</button></nav>}</>}</main></AdminShell>
}

function AdminLoginPage() {
  const [formMessage, setFormMessage] = useState('')
  const [mfaChallenge, setMfaChallenge] = useState(false)
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="access-page page-shell">
        <div className="access-card">
          <p className="eyebrow eyebrow--quiet">ACCESO RESTRINGIDO</p>
          <h1>Panel de administración</h1>
          {mfaChallenge
            ? <ValidatedForm key="admin-mfa" className="auth-form" onSubmit={async (event) => {
                event.preventDefault()
                const code = String(new FormData(event.currentTarget).get('code'))
                try {
                  await completeAdminMfaChallenge(code)
                  window.location.assign('/admin')
                } catch (error) {
                  if (error instanceof Error && 'status' in error && ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 429)) setMfaChallenge(false)
                  setFormMessage(error instanceof Error ? error.message : 'No se pudo completar la verificación.')
                }
              }}>
                <h2>Verificación en dos pasos</h2>
                <label>Código de autenticación<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required /></label>
                {formMessage && <p role="alert">{formMessage}</p>}
                <button className="button button--primary" type="submit">Verificar e ingresar</button>
                <button className="button button--quiet" type="button" onClick={() => { setMfaChallenge(false); setFormMessage('') }}>Volver al inicio de sesión</button>
              </ValidatedForm>
            : <ValidatedForm key="admin-login" className="auth-form" onSubmit={async (event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                try {
                  const result = await adminLogin(String(data.get('email')), String(data.get('password')))
                  if (result.mfa_required) { setMfaChallenge(true); setFormMessage('Ingresa el código actual de tu aplicación autenticadora.'); return }
                  if (result.mfa_setup_required) { window.location.assign('/admin/mfa'); return }
                  window.location.assign('/admin')
                } catch (error) {
                  setFormMessage(error instanceof Error ? error.message : 'No pudimos conectar con el servicio. Inténtalo de nuevo.')
                }
              }}>
                <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
                <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
                {formMessage && <p role="alert">{formMessage}</p>}
                <button className="button button--primary" type="submit">Ingresar</button>
              </ValidatedForm>
          }
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function AdminMfaSetupPage() {
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof getAdminMfaSetup>> | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void getAdminMfaSetup()
      .then(async (result) => {
        setSetup(result)
        if (result.enabled) { window.location.assign('/admin'); return }
        if (result.otpauth_uri) {
          const QRCode = await import('qrcode')
          const dataUrl = await QRCode.toDataURL(result.otpauth_uri, { width: 220, margin: 2 })
          setQrDataUrl(dataUrl)
        }
      })
      .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'No se pudo iniciar la configuración de MFA.'))
  }, [])

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="access-page page-shell">
        <section className="access-card">
          <p className="eyebrow eyebrow--quiet">SEGURIDAD ADMINISTRATIVA</p>
          <h1>Configura la verificación en dos pasos</h1>
          {message && <p role="alert">{message}</p>}
          {!setup
            ? <p role="status">Preparando configuración…</p>
            : setup.secret && <>
                <p>Escanea el código QR con <strong>Google Authenticator</strong> u otra app compatible. La clave queda cifrada en el servidor y no vuelve a mostrarse después de confirmar.</p>
                {qrDataUrl
                  ? <div style={{ textAlign: 'center', margin: '1.25rem 0' }}>
                      <img src={qrDataUrl} alt="Código QR para configurar MFA" width={220} height={220} style={{ borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)' }} />
                    </div>
                  : <p role="status">Generando QR…</p>
                }
                <details style={{ marginBottom: '1rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.875rem' }}>¿No puedes escanear? Ingresa la clave manualmente</summary>
                  <label style={{ display: 'block', marginTop: '0.5rem' }}>
                    Clave de configuración
                    <input readOnly value={setup.secret} onFocus={(event) => event.currentTarget.select()} style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
                  </label>
                </details>
                <ValidatedForm className="auth-form" onSubmit={async (event) => {
                  event.preventDefault()
                  const code = String(new FormData(event.currentTarget).get('code'))
                  try {
                    await confirmAdminMfa(code)
                    window.location.assign('/admin')
                  } catch (reason) {
                    setMessage(reason instanceof Error ? reason.message : 'No se pudo confirmar la configuración.')
                  }
                }}>
                  <label>
                    Código de seis dígitos
                    <input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required placeholder="000000" />
                  </label>
                  {message && <p role="alert">{message}</p>}
                  <button className="button button--primary" type="submit">Confirmar y continuar</button>
                </ValidatedForm>
              </>
          }
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function AuditPage() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getAuditLogs>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void getAuditLogs().then(setEntries).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar la auditoría.')) }, [])
  return <AdminShell><main className="admin-content"><p className="eyebrow eyebrow--quiet">ADMINISTRACIÓN</p><h1>Registro de auditoría</h1>{error ? <p role="alert">{error}</p> : !entries ? <p role="status">Cargando eventos…</p> : <div className="dashboard-list">{entries.map((entry) => <article className="dashboard-row" key={entry.id}><div><strong>{entry.action}</strong><p>{entry.resource_type} #{entry.resource_id ?? '—'} · {entry.actor?.name ?? 'Sistema'}</p>{entry.reason && <small>{entry.reason}</small>}</div><time>{new Date(entry.created_at).toLocaleString('es-PA')}</time></article>)}</div>}</main></AdminShell>
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [adminName, setAdminName] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    void getAdminMe().then((result) => { if (result) setAdminName(result.name.split(' ')[0]) })
  }, [])

  async function handleLogout() {
    try { await adminLogout() } finally { navigate('/adminsc1car') }
  }

  function navClass({ isActive }: { isActive: boolean }) {
    return isActive ? 'admin-nav-item admin-nav-item--active' : 'admin-nav-item'
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <span className="brand"><BrandLogo light tagline={false} /></span>
          <span className="admin-sidebar__badge">Admin</span>
        </div>
        <nav className="admin-sidebar__nav" aria-label="Panel de administración">
          <NavLink to="/admin" end className={navClass}><LayoutDashboard size={16} /><span>Dashboard</span></NavLink>

          <p className="admin-nav-label">MODERACIÓN</p>
          <NavLink to="/admin/publicaciones" className={navClass}><ShieldCheck size={16} /><span>Cola de publicaciones</span></NavLink>
          <NavLink to="/admin/apelaciones" className={navClass}><MessageSquare size={16} /><span>Apelaciones</span></NavLink>
          <NavLink to="/admin/historias" className={navClass}><BookOpen size={16} /><span>Historias</span></NavLink>

          <p className="admin-nav-label">TRUST & SAFETY</p>
          <NavLink to="/admin/denuncias" className={navClass}><Flag size={16} /><span>Casos y denuncias</span></NavLink>
          <NavLink to="/admin/alertas" className={navClass}><ShieldAlert size={16} /><span>Alertas</span></NavLink>

          <p className="admin-nav-label">PRODUCTORES</p>
          <NavLink to="/admin/productores" className={({ isActive }) => isActive ? 'admin-nav-item admin-nav-item--active' : 'admin-nav-item'}><Users size={16} /><span>Directorio</span></NavLink>
          <NavLink to="/admin/registro-asistido" className={navClass}><UserPlus size={16} /><span>Registro asistido</span></NavLink>

          <p className="admin-nav-label">CONFIGURACIÓN</p>
          <NavLink to="/admin/catalogos" className={navClass}><Tag size={16} /><span>Categorías</span></NavLink>
          <NavLink to="/admin/mensajes" className={navClass}><MessageSquare size={16} /><span>Mensajes WhatsApp</span></NavLink>
          <NavLink to="/admin/usuarios" className={navClass}><Users size={16} /><span>Usuarios y permisos</span></NavLink>
          <NavLink to="/admin/correo" className={navClass}><MessageSquare size={16} /><span>Correo SMTP</span></NavLink>

          <p className="admin-nav-label">DATOS</p>
          <NavLink to="/admin/reportes" className={navClass}><BarChart2 size={16} /><span>Métricas</span></NavLink>
          <NavLink to="/admin/auditoria" className={navClass}><FileText size={16} /><span>Auditoría</span></NavLink>
        </nav>
        <div className="admin-sidebar__footer">
          {adminName && <span className="admin-sidebar__user">{adminName}</span>}
          <button className="admin-sidebar__logout" type="button" onClick={() => void handleLogout()}>
            <LogOut size={14} /> Salir
          </button>
        </div>
      </aside>
      <div className="admin-main">
        {children}
      </div>
    </div>
  )
}

function AdminEmailSettingsPage() {
  const [settings, setSettings] = useState<SmtpSettings | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [passwordChanged, setPasswordChanged] = useState(false)

  useEffect(() => {
    void getAdminSmtpSettings()
      .then((data) => { setSettings(data); setTestEmail(data.username || '') })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar la configuración.'))
  }, [])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings) return
    setSaving(true); setSaveMsg(''); setError('')
    try {
      const payload: Partial<SmtpSettings> = { ...settings }
      if (!passwordChanged) delete payload.password
      await saveAdminSmtpSettings(payload)
      setSaveMsg('Configuración guardada correctamente.')
      setPasswordChanged(false)
      const fresh = await getAdminSmtpSettings()
      setSettings(fresh)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTesting(true); setTestResult(null)
    try {
      const result = await testAdminSmtpSettings(testEmail)
      setTestResult(result)
    } catch (reason: unknown) {
      setTestResult({ ok: false, error: reason instanceof Error ? reason.message : 'Error desconocido' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <AdminShell>
      <main className="admin-content">
        <p className="eyebrow eyebrow--quiet">CONFIGURACIÓN · CORREO</p>
        <h1>Ajustes de correo SMTP</h1>
        <p>Configura el servidor de salida para las notificaciones automáticas: bienvenida al registrarse, perfil aprobado, publicación aprobada y similares.</p>
        {error && <div className="empty-products" role="alert"><strong>{error}</strong></div>}
        {!settings && !error && <p role="status">Cargando configuración…</p>}
        {settings && (
          <ValidatedForm className="auth-form" style={{ maxWidth: '520px' }} onSubmit={(e) => void handleSave(e)}>
            <Field id="smtp-host" name="host" label="Servidor SMTP" value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.currentTarget.value })} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field id="smtp-port" name="port" label="Puerto" type="number" value={String(settings.port)} onChange={(e) => setSettings({ ...settings, port: Number(e.currentTarget.value) })} required />
              <SelectField id="smtp-encryption" name="encryption" label="Cifrado" value={settings.encryption} onChange={(e) => setSettings({ ...settings, encryption: e.currentTarget.value as SmtpSettings['encryption'] })}>
                <option value="ssl">SSL (465)</option>
                <option value="tls">TLS / STARTTLS (587)</option>
                <option value="none">Sin cifrado</option>
              </SelectField>
            </div>
            <Field id="smtp-username" name="username" label="Usuario (correo de envío)" type="email" value={settings.username} onChange={(e) => setSettings({ ...settings, username: e.currentTarget.value })} required />
            <Field id="smtp-password" name="password" label={settings.password === '••••••••' && !passwordChanged ? 'Contraseña (guardada — escribe para cambiar)' : 'Contraseña'} type="password" value={passwordChanged ? settings.password : (settings.password === '••••••••' ? '' : settings.password)} onChange={(e) => { setPasswordChanged(true); setSettings({ ...settings, password: e.currentTarget.value }) }} autoComplete="new-password" />
            <Field id="smtp-from-address" name="from_address" label="Dirección remitente" type="email" value={settings.from_address} onChange={(e) => setSettings({ ...settings, from_address: e.currentTarget.value })} required />
            <Field id="smtp-from-name" name="from_name" label="Nombre remitente" value={settings.from_name} onChange={(e) => setSettings({ ...settings, from_name: e.currentTarget.value })} required />
            {saveMsg && <p role="status" style={{ color: 'var(--color-success, green)' }}>{saveMsg}</p>}
            <button className="button button--primary" type="submit" disabled={saving} aria-busy={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
          </ValidatedForm>
        )}

        <h2 style={{ marginTop: '2.5rem' }}>Probar configuración</h2>
        <p>Envía un correo de prueba para verificar que la configuración funciona.</p>
        <ValidatedForm className="auth-form" style={{ maxWidth: '520px' }} onSubmit={(e) => void handleTest(e)}>
          <Field id="smtp-test-to" name="to" label="Enviar a" type="email" value={testEmail} onChange={(e) => setTestEmail(e.currentTarget.value)} required />
          {testResult && (
            testResult.ok
              ? <p role="status" style={{ color: 'var(--color-success, green)' }}>✓ Correo enviado correctamente.</p>
              : <p role="alert" style={{ color: 'var(--color-danger, red)' }}>✗ {testResult.error ?? 'Error al enviar.'}</p>
          )}
          <button className="button button--outline" type="submit" disabled={testing || !settings} aria-busy={testing}>{testing ? 'Enviando…' : 'Enviar correo de prueba'}</button>
        </ValidatedForm>

        <h2 style={{ marginTop: '2.5rem' }}>Correos que se envían automáticamente</h2>
        <ul style={{ lineHeight: '2' }}>
          <li><strong>Cuenta creada</strong> — al registrarse un productor nuevo</li>
          <li><strong>Perfil aprobado</strong> — cuando el admin activa el perfil</li>
          <li><strong>Perfil suspendido</strong> — cuando el admin suspende el perfil</li>
          <li><strong>Publicación aprobada</strong> — cuando el admin publica una oferta</li>
          <li><strong>Publicación necesita cambios</strong> — cuando el admin pide cambios</li>
          <li><strong>Publicación rechazada</strong> — cuando el admin rechaza una oferta</li>
        </ul>
      </main>
    </AdminShell>
  )
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/adminsc1car" element={<AdminLoginPage />} />
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
      <Route path="/admin/historias" element={<AdminStoriesPage />} />
      <Route path="/admin/catalogos" element={<AdminCatalogsPage />} />
      <Route path="/admin/mensajes" element={<AdminMessageTemplatesPage />} />
      <Route path="/admin/reportes" element={<AdminMetricsPage />} />
      <Route path="/admin/metricas" element={<AdminMetricsPage />} />
      <Route path="/admin/auditoria" element={<AuditPage />} />
      <Route path="/admin/usuarios" element={<AdminUsersPage />} />
      <Route path="/admin/correo" element={<AdminEmailSettingsPage />} />
      <Route path="/admin/mfa" element={<AdminMfaSetupPage />} />
      <Route path="/admin/seguridad/recuperacion-mfa" element={<AdminMfaRecoveryPage />} />
      <Route path="*" element={<InfoPage title="No encontramos esta página" description="Revisa la dirección o vuelve al catálogo para explorar las ofertas." />} />
    </Routes>
  )
}

export default AdminRoutes


