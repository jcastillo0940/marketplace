import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Banknote, BookOpen, Camera, Check, CheckCircle2, ChevronRight, Clock, CreditCard, ExternalLink, Eye, FileText, Handshake, Info, Landmark, LayoutDashboard, Lock, LogOut, MapPin, Menu, Package, Plus, Receipt, ScanFace, Settings, ShieldCheck, Smartphone, Store, Upload, User, X } from 'lucide-react'
import profileCover from '../assets/mercapro/hero/campo-mercapro-960.webp'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import ActivityMultiSelect from '../components/ActivityMultiSelect'
import LocationPicker from '../components/LocationPicker'
import TextAreaField from '../components/TextAreaField'
import ValidatedForm from '../components/ValidatedForm'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { ProducerReviewSubmission } from '../components/ProducerReviewSubmission'
import { compressDocumentFile, compressProductPhoto, MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE } from '../api/photo-optimizer'
import {
  clearSessionCache, getProducerAppeals, getProducerMetrics, getProducerDashboard,
  getBiometricStatus, getProducerProduct, getSessionUser, listCategories, listLocations, listUnits, logoutUser,
  renewProducerProduct, saveProductDraft, getMyStories, saveMyStory, deleteMyStory, submitProducerAppeal,
  transitionProducerProduct, updateProduct, updateProducerProfile,
  uploadProducerDocument, getProducerDocuments, getMissingProducerDocuments, DOCUMENTS_UPDATED_EVENT, type ProducerDocumentType,
  type OwnedProducerStory, type ProducerAppealState, type ProducerDashboardProduct, type ProducerMetrics, type PublicLocation,
} from '../api/client'
import VerificationBadge from '../components/VerificationBadge'
import { categoryPath } from '../components/categoryTree'
import type { BiometricStatus } from '../api/client'

const BiometricCapture = lazy(() => import('../components/BiometricCapture'))

import { InfoPage } from './shared/InfoPage'

const MISSING_DOC_LABELS: Record<ProducerDocumentType, string> = { cedula_photo: 'la foto de tu cédula', aviso_operacion: 'el aviso de operación', pacto_social: 'el pacto social' }

// ── Sidebar shell shared by all producer pages ────────────────────────────────

function ProducerShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    void getSessionUser().then((u) => { if (u) setUserName(u.name) })
  }, [])

  const [missingDocs, setMissingDocs] = useState<ProducerDocumentType[]>([])
  useEffect(() => {
    const load = () => { getMissingProducerDocuments().then(setMissingDocs).catch(() => setMissingDocs([])) }
    load()
    window.addEventListener(DOCUMENTS_UPDATED_EVENT, load)
    return () => window.removeEventListener(DOCUMENTS_UPDATED_EVENT, load)
  }, [])

  async function handleLogout() {
    try { await logoutUser() } catch { /* ignore network errors on logout */ }
    clearSessionCache()
    void navigate('/ingresar')
  }

  const navLinks = [
    { to: '/mi-panel', Icon: LayoutDashboard, label: 'Inicio' },
    { to: '/mis-productos', Icon: Package, label: 'Mis publicaciones' },
    { to: '/mis-historias', Icon: BookOpen, label: 'Mis historias' },
    { to: '/mi-perfil', Icon: User, label: 'Mi perfil' },
  ]

  return (
    <div className="producer-backoffice">
      {sidebarOpen && (
        <div
          className="producer-sidebar-overlay"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`producer-sidebar${sidebarOpen ? ' producer-sidebar--open' : ''}`} aria-label="Menú del panel">
        <div className="producer-sidebar__header">
          <Link to="/" className="producer-sidebar__brand">
            <span className="brand producer-sidebar__brand-name"><BrandLogo tagline={false} /></span>
            <span className="producer-sidebar__brand-sub">Panel del productor</span>
          </Link>
          <button className="producer-sidebar__close" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="producer-sidebar__nav" aria-label="Navegación del panel">
          {navLinks.map(({ to, Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`producer-sidebar__link${location.pathname === to ? ' producer-sidebar__link--active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="producer-sidebar__cta">
          <Link
            to="/mis-productos/nuevo"
            className="button button--primary button--small producer-sidebar__cta-btn"
            onClick={() => setSidebarOpen(false)}
          >
            <Plus size={15} aria-hidden="true" />
            Publicar producto
          </Link>
        </div>

        <div className="producer-sidebar__footer">
          {userName && (
            <div className="producer-sidebar__user">
              <div className="producer-sidebar__avatar" aria-hidden="true">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="producer-sidebar__user-info">
                <p className="producer-sidebar__username">{userName}</p>
                <p className="producer-sidebar__role">Productor</p>
              </div>
            </div>
          )}
          <button className="producer-sidebar__logout" type="button" onClick={() => void handleLogout()}>
            <LogOut size={15} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="producer-main">
        <header className="producer-topbar" aria-label="Barra superior">
          <button className="producer-topbar__menu" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <Link to="/" className="brand producer-topbar__brand" aria-label="Mercapro, inicio"><BrandLogo tagline={false} /></Link>
          <Link to="/mis-productos/nuevo" className="button button--primary button--small producer-topbar__publish" aria-label="Publicar nuevo producto">
            <Plus size={15} aria-hidden="true" />
            <span>Publicar</span>
          </Link>
        </header>
        {missingDocs.length > 0 && (
          <div className="producer-doc-alert" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <p><strong>Para publicar productos debes subir {missingDocs.map((type) => MISSING_DOC_LABELS[type]).join(' y ')}.</strong> <span>Puedes preparar tu perfil mientras tanto, pero tus productos no se publicarán hasta completarlo.</span></p>
            <Link className="producer-doc-alert__cta" to="/mi-perfil#verificar">Subir ahora <ChevronRight size={16} aria-hidden="true" /></Link>
          </div>
        )}
        <main className="producer-content">
          {children}
        </main>
      </div>
    </div>
  )
}

// ── Profile / settings page ───────────────────────────────────────────────────

type ProfileTab = 'negocio' | 'ubicacion' | 'verificacion' | 'cuenta'

const PROFILE_TABS: Array<{ id: ProfileTab; label: string; Icon: typeof Store }> = [
  { id: 'negocio', label: 'Mi negocio', Icon: Store },
  { id: 'ubicacion', label: 'Ubicación y contacto', Icon: MapPin },
  { id: 'verificacion', label: 'Verificación', Icon: ShieldCheck },
  { id: 'cuenta', label: 'Cuenta', Icon: Settings },
]

const PAYMENT_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { value: 'yappy', label: 'Yappy', Icon: Smartphone },
  { value: 'transferencia', label: 'Transferencia bancaria', Icon: Landmark },
  { value: 'tarjeta', label: 'Tarjeta de crédito/débito', Icon: CreditCard },
  { value: 'cheque', label: 'Cheque', Icon: Receipt },
  { value: 'credito', label: 'Crédito / Cuenta abierta', Icon: Handshake },
] as const

const LEVEL_RANK: Record<string, number> = { unverified: 0, contact_confirmed: 1, identity_reviewed: 2, biometric_verified: 3, producer_validated: 3 }

function tabFromHash(hash: string): ProfileTab {
  if (hash === '#verificar' || hash === '#verificacion') return 'verificacion'
  if (hash === '#ubicacion') return 'ubicacion'
  if (hash === '#cuenta') return 'cuenta'
  return 'negocio'
}

function locationLabel(locations: PublicLocation[], id: number | null): string {
  const parts: string[] = []
  let current = locations.find((location) => location.id === id)
  while (current && parts.length < 4) {
    parts.push(current.name)
    const parentId: number | null = current.parent_id
    current = locations.find((location) => location.id === parentId)
  }
  return parts.join(', ')
}

type ProfilePreview = { name: string; activities: string[]; payments: string[]; description: string; locationId: number | null }

function ProducerProfilePage() {
  const location = useLocation()
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getProducerDashboard>> | null>(null)
  const [locations, setLocations] = useState<PublicLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locationsError, setLocationsError] = useState(false)
  const [locationsRetry, setLocationsRetry] = useState(0)
  const [message, setMessage] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<ProfileTab>(() => tabFromHash(location.hash))
  const [preview, setPreview] = useState<ProfilePreview | null>(null)
  const focusInvalid = useRef(false)

  const loadDashboard = useCallback(async () => {
    const data = await getProducerDashboard()
    setDashboard(data)
    if (data.profile) setPreview({ name: data.profile.public_name, activities: data.profile.activities ?? [], payments: data.profile.payment_methods ?? [], description: data.profile.description ?? '', locationId: data.profile.location_id })
  }, [])

  useEffect(() => {
    loadDashboard().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Inicia sesión para editar tu perfil.'))
  }, [loadDashboard])

  useEffect(() => { setTab(tabFromHash(location.hash)) }, [location.hash])

  useEffect(() => {
    // Leaflet measures its container; it needs a resize once the location tab becomes visible.
    if (tab === 'ubicacion') window.dispatchEvent(new Event('resize'))
    if (focusInvalid.current) {
      focusInvalid.current = false
      document.getElementById('producer-profile-form')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }, [tab])

  useEffect(() => {
    let active = true
    setLocationsLoading(true)
    setLocationsError(false)
    void listLocations()
      .then((items) => { if (active) setLocations(items) })
      .catch(() => { if (active) { setLocations([]); setLocationsError(true) } })
      .finally(() => { if (active) setLocationsLoading(false) })
    return () => { active = false }
  }, [locationsRetry])

  const profile = dashboard?.profile

  function chooseTab(next: ProfileTab) {
    setTab(next)
    window.history.replaceState(null, '', next === 'negocio' ? location.pathname : `${location.pathname}#${next === 'verificacion' ? 'verificar' : next}`)
  }

  function readPreview() {
    const form = document.getElementById('producer-profile-form')
    if (!(form instanceof HTMLFormElement)) return
    const data = new FormData(form)
    setPreview((current) => ({
      name: String(data.get('public_name') ?? ''),
      activities: data.getAll('activities[]').map(String),
      payments: data.getAll('payment_methods[]').map(String),
      description: String(data.get('description') ?? ''),
      locationId: current?.locationId ?? null,
    }))
  }

  const phoneConfirmed = profile?.contact_level === 'contact_confirmed'
  const level = profile?.verification_level ?? 'unverified'
  const rank = LEVEL_RANK[level] ?? 0
  const completionChecks: Array<{ done: boolean; label: string; tab: ProfileTab }> = profile ? [
    { done: Boolean(profile.description?.trim()), label: 'Agregar descripción', tab: 'negocio' },
    { done: (profile.activities ?? []).length > 0, label: 'Elegir actividades', tab: 'negocio' },
    { done: Boolean(profile.location_id), label: 'Completar ubicación', tab: 'ubicacion' },
    { done: phoneConfirmed, label: 'Confirmar teléfono', tab: 'verificacion' },
  ] : []
  const doneCount = completionChecks.filter((check) => check.done).length
  const pct = completionChecks.length ? Math.round(doneCount / completionChecks.length * 100) : 0
  const rucEditable = level === 'unverified' || level === 'contact_confirmed'

  return (
    <ProducerShell>
      <div className="mp-profile">
        <header className="mp-profile__header">
          <h1>Mi perfil</h1>
          <p>Configura cómo te verán los compradores</p>
        </header>

        {!dashboard ? (
          <p role="status">{message || 'Cargando tus datos…'}</p>
        ) : !profile || !preview ? (
          <p role="alert">No encontramos un perfil de productor asociado a esta cuenta.</p>
        ) : (
          <div className="mp-profile__layout">
            <div className="mp-profile__main">
              {/* ── Completion ── */}
              <section className="mp-card mp-completion" aria-label="Avance del perfil">
                <div className="mp-completion__ring" style={{ '--pct': `${pct}%` } as React.CSSProperties} role="img" aria-label={`Perfil ${pct}% completado`}>
                  <span><strong>{pct}%</strong><small>Completado</small></span>
                </div>
                <div className="mp-completion__body">
                  <h2>{pct === 100 ? '¡Tu perfil está completo!' : 'Completa tu perfil para ganar más visibilidad'}</h2>
                  <p>Aumenta la confianza de los compradores y recibe más oportunidades de venta.</p>
                  <ul className="mp-completion__steps">
                    {completionChecks.map((check) => (
                      <li key={check.label}>
                        <button type="button" className={check.done ? 'is-done' : ''} onClick={() => chooseTab(check.tab)}>
                          <span className="mp-completion__check" aria-hidden="true">{check.done && <Check size={14} strokeWidth={3} />}</span>
                          {check.label}
                          <span className="sr-only">{check.done ? ' (listo)' : ' (pendiente)'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* ── Tabs ── */}
              <div className="mp-card mp-tabs" role="tablist" aria-label="Secciones del perfil">
                {PROFILE_TABS.map(({ id, label, Icon }) => (
                  <button key={id} id={`profile-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`profile-panel-${id}`} className={tab === id ? 'is-active' : ''} onClick={() => chooseTab(id)}>
                    <Icon size={18} aria-hidden="true" /><span>{label}</span>
                  </button>
                ))}
              </div>

              {/* One form spans the business, location and RUC fields; the RUC inputs join it through the form attribute. */}
              <ValidatedForm
                id="producer-profile-form"
                className="mp-profile-form"
                onChange={readPreview}
                onInvalidCapture={(event) => {
                  const panel = (event.target as HTMLElement).closest<HTMLElement>('[data-profile-tab]')
                  const owner = panel?.dataset.profileTab as ProfileTab | undefined
                  if (owner && owner !== tab) { focusInvalid.current = true; setTab(owner) }
                }}
                onSubmit={async (event) => {
                  event.preventDefault()
                  setSaveSuccess(false)
                  setMessage('')
                  setSaving(true)
                  try {
                    await updateProducerProfile(new FormData(event.currentTarget))
                    await loadDashboard()
                    setSaveSuccess(true)
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'No se pudo guardar el perfil.')
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                <section className="mp-card mp-panel" id="profile-panel-negocio" role="tabpanel" aria-labelledby="profile-tab-negocio" data-profile-tab="negocio" hidden={tab !== 'negocio'}>
                  <PanelHead Icon={Store} title="Información del negocio" text="Cuéntales a los compradores quién eres, qué produces y cómo trabajas." />

                  <div className="mp-field">
                    <div className="mp-field__label"><label htmlFor="profile-public-name">Nombre público <em aria-hidden="true">*</em></label><p>Así aparecerá tu emprendimiento en el catálogo de Mercapro.</p></div>
                    <div className="mp-field__control"><input id="profile-public-name" name="public_name" defaultValue={profile.public_name} required maxLength={120} /></div>
                  </div>

                  <div className="mp-field">
                    <div className="mp-field__label"><span className="mp-field__title">Actividades principales <em aria-hidden="true">*</em></span><p>Selecciona las actividades que mejor describen tu producción.</p></div>
                    <div className="mp-field__control"><ActivityMultiSelect defaultValue={profile.activities} onChange={(activities) => setPreview((current) => current && { ...current, activities })} /></div>
                  </div>

                  <div className="mp-field">
                    <div className="mp-field__label"><label htmlFor="profile-vendor-type">Tipo de emprendimiento <em aria-hidden="true">*</em></label><p>Indica si eres un productor individual, una cooperativa o una empresa.</p></div>
                    <div className="mp-field__control">
                      <select id="profile-vendor-type" name="vendor_type" defaultValue={profile.vendor_type ?? 'productor'}>
                        <option value="productor">Personal / Productor individual</option>
                        <option value="cooperativa">Cooperativa</option>
                        <option value="distribuidor">PYME / Empresa</option>
                      </select>
                    </div>
                  </div>

                  <fieldset className="mp-field">
                    <div className="mp-field__label"><legend className="mp-field__title">Métodos de pago que aceptas</legend><p>Selecciona los medios por los que puedes recibir pagos.</p></div>
                    <ul className="mp-field__control mp-payments">
                      {PAYMENT_OPTIONS.map(({ value, label, Icon }) => (
                        <li key={value}>
                          <input id={`prof-pm-${value}`} type="checkbox" name="payment_methods[]" value={value} defaultChecked={(profile.payment_methods ?? []).includes(value)} />
                          <label htmlFor={`prof-pm-${value}`}><Icon size={18} aria-hidden="true" /><span>{label}</span><span className="mp-payments__tick" aria-hidden="true"><Check size={12} strokeWidth={3} /></span></label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>

                  <div className="mp-field">
                    <div className="mp-field__label"><label htmlFor="profile-description">Historia del negocio</label><p>Cuéntales a los compradores quién eres, qué produces y cómo trabajas.</p></div>
                    <div className="mp-field__control">
                      <textarea id="profile-description" name="description" defaultValue={profile.description ?? ''} rows={5} maxLength={2000} style={{ resize: 'none' }} placeholder="Ej. Somos un emprendimiento familiar dedicado a la producción artesanal…" />
                      <small className="mp-field__counter">{preview.description.length.toLocaleString('es-PA')} / 2 000</small>
                    </div>
                  </div>
                </section>

                <section className="mp-card mp-panel" id="profile-panel-ubicacion" role="tabpanel" aria-labelledby="profile-tab-ubicacion" data-profile-tab="ubicacion" hidden={tab !== 'ubicacion'}>
                  <PanelHead Icon={MapPin} title="Ubicación y contacto" text="Tu zona aproximada aparece en tu perfil. Nunca mostramos tu dirección exacta." />

                  <fieldset className="mp-field mp-field--stack">
                    <div className="mp-field__label"><legend className="mp-field__title">Ubicación aproximada</legend><p>Elige provincia, distrito o corregimiento, o márcalo en el mapa.</p></div>
                    <div className="mp-field__control">
                      <LocationPicker locations={locations} value={profile.location_id} idPrefix="profile-location" disabled={locationsLoading || locationsError || locations.length === 0} onChange={(locationId) => setPreview((current) => current && { ...current, locationId })} />
                      {locationsLoading && <p role="status">Cargando localidades…</p>}
                      {locationsError && <p role="alert">No pudimos cargar las localidades. <button className="text-link" type="button" onClick={() => setLocationsRetry((n) => n + 1)}>Reintentar</button></p>}
                    </div>
                  </fieldset>

                  <div className="mp-field">
                    <div className="mp-field__label"><label htmlFor="profile-phone">Teléfono de contacto <em aria-hidden="true">*</em></label><p>Lo usamos para confirmar tu cuenta. Si lo cambias, tendremos que confirmarlo de nuevo.</p></div>
                    <div className="mp-field__control"><input id="profile-phone" name="phone_private" type="tel" defaultValue={profile.phone_private} required maxLength={40} placeholder="+507 6000-0000" /></div>
                  </div>
                </section>

                {(saveSuccess || message) && tab !== 'verificacion' && tab !== 'cuenta' && (
                  <p role={message ? 'alert' : 'status'} className={`mp-notice ${message ? 'mp-notice--error' : 'mp-notice--ok'}`}>{message || 'Perfil guardado correctamente.'}</p>
                )}

                <div className="mp-profile__actions" hidden={tab === 'verificacion' || tab === 'cuenta'}>
                  <button className="button button--primary" type="submit" disabled={saving} aria-busy={saving}><Check size={17} aria-hidden="true" />{saving ? 'Guardando…' : 'Guardar cambios'}</button>
                  {profile.slug && <Link className="button button--outline" to={`/productores/${profile.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />Vista pública</Link>}
                </div>
              </ValidatedForm>

              <section className="mp-card mp-panel" id="profile-panel-verificacion" role="tabpanel" aria-labelledby="profile-tab-verificacion" data-profile-tab="verificacion" hidden={tab !== 'verificacion'}>
                <span id="verificar" />
                <PanelHead Icon={ShieldCheck} title="Verificación" text="Cada paso suma confianza. Los compradores ven tu etiqueta en tu perfil y en todos tus anuncios." />

                <ol className="mp-steps">
                  <li className={`mp-step ${phoneConfirmed ? 'is-done' : 'is-current'}`}>
                    <StepMarker done={phoneConfirmed} n={1} />
                    <div className="mp-step__body">
                      <h3>Confirmar teléfono {phoneConfirmed ? <span className="mp-pill mp-pill--ok">Listo</span> : <span className="mp-pill mp-pill--wait">Pendiente</span>}</h3>
                      <p>{phoneConfirmed
                        ? `Tu teléfono ${profile.phone_private} está confirmado. Los compradores ya pueden contactarte.`
                        : `Un operador de Mercapro te llamará al ${profile.phone_private} para confirmar tu cuenta. Si el número no es correcto, cámbialo en la pestaña Ubicación y contacto.`}</p>
                    </div>
                  </li>

                  <li className={`mp-step ${rank >= 2 ? 'is-done' : phoneConfirmed ? 'is-current' : 'is-next'}`}>
                    <StepMarker done={rank >= 2} n={2} />
                    <div className="mp-step__body">
                      <h3>Etiqueta Verificado {rank >= 2 ? <span className="mp-pill mp-pill--ok">Listo</span> : <span className="mp-pill">{profile.vendor_type === 'cooperativa' ? 'Pacto social' : 'RUC + documento'}</span>}</h3>
                      <p>{rank >= 2
                        ? 'Un administrador revisó tus documentos. Ya puedes publicar sin esperar revisión.'
                        : profile.vendor_type === 'cooperativa'
                          ? 'Sube el pacto social de tu cooperativa. Un administrador lo revisará cuando tu teléfono esté confirmado.'
                          : 'Agrega tu RUC y sube un documento que lo respalde. Un administrador los revisará cuando tu teléfono esté confirmado. Solo el equipo de Mercapro los ve.'}</p>

                      {profile.vendor_type !== 'cooperativa' && (
                        <div className="mp-ruc">
                          <label>{profile.vendor_type === 'distribuidor' ? 'RUC de la empresa' : 'Número de RUC'}
                            <input form="producer-profile-form" name="ruc" onInvalid={() => setTab('verificacion')} required={profile.vendor_type === 'distribuidor'} defaultValue={profile.ruc ?? ''} maxLength={30} autoComplete="off" placeholder="8-123-4567" readOnly={!rucEditable} />
                          </label>
                          <label>DV
                            <input form="producer-profile-form" name="ruc_dv" defaultValue={profile.ruc_dv ?? ''} maxLength={2} inputMode="numeric" autoComplete="off" pattern="[0-9]{1,2}" readOnly={!rucEditable} />
                          </label>
                          {rucEditable && <button className="button button--outline" type="submit" form="producer-profile-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar RUC'}</button>}
                        </div>
                      )}
                      {(saveSuccess || message) && tab === 'verificacion' && <p role={message ? 'alert' : 'status'} className={`mp-notice ${message ? 'mp-notice--error' : 'mp-notice--ok'}`}>{message || 'Datos guardados.'}</p>}

                      <ProducerDocumentsSection
                        hasCedulaPhoto={profile.has_cedula_photo}
                        hasPactoSocial={profile.has_pacto_social}
                        hasAvisoOperacion={profile.has_aviso_operacion}
                        vendorType={profile.vendor_type ?? 'productor'}
                      />
                    </div>
                  </li>

                  <li className={`mp-step ${level === 'biometric_verified' || level === 'producer_validated' ? 'is-done' : rank === 2 ? 'is-current' : 'is-next'}`}>
                    <StepMarker done={level === 'biometric_verified' || level === 'producer_validated'} n={3} />
                    <div className="mp-step__body">
                      <h3>Verificado Pro <span className="mp-pill"><ScanFace size={13} aria-hidden="true" /> Facial + cédula</span></h3>
                      {rank === 2 ? (
                        <ProducerBiometricSection />
                      ) : rank >= 3 ? (
                        <p>¡Listo! Tu identidad está confirmada y tienes la etiqueta Verificado Pro.</p>
                      ) : (
                        <p className="mp-step__locked"><Lock size={14} aria-hidden="true" /> Se activa cuando tengas la etiqueta Verificado. Tomarás una foto de tu cédula y una foto en vivo desde tu celular; es gratis y toma un par de minutos.</p>
                      )}
                    </div>
                  </li>
                </ol>
              </section>

              <section className="mp-card mp-panel" id="profile-panel-cuenta" role="tabpanel" aria-labelledby="profile-tab-cuenta" data-profile-tab="cuenta" hidden={tab !== 'cuenta'}>
                <PanelHead Icon={Settings} title="Datos de la cuenta" text="Se registraron al crear tu cuenta. Si necesitas cambiarlos, escríbenos." />
                <dl className="mp-account">
                  <div><dt>Nombre completo</dt><dd>{dashboard.user.name}</dd></div>
                  <div><dt>Correo electrónico</dt><dd>{dashboard.user.email}</dd></div>
                  <div><dt>Teléfono</dt><dd>{profile.phone_private}</dd></div>
                  {profile.cedula && <div><dt>Cédula</dt><dd>{profile.cedula}</dd></div>}
                  <div><dt>Nivel actual</dt><dd><VerificationBadge level={level} internal /></dd></div>
                </dl>
              </section>
            </div>

            <aside className="mp-profile__side">
              <section className="mp-card mp-preview" aria-labelledby="profile-preview-title">
                <div className="mp-side-head">
                  <span className="mp-side-head__icon"><Eye size={20} aria-hidden="true" /></span>
                  <div><h2 id="profile-preview-title">Vista previa del perfil público</h2><p>Así verán tu perfil los compradores en Mercapro.</p></div>
                </div>
                <div className="mp-preview__card">
                  <div className="mp-preview__cover"><img src={profileCover} alt="" loading="lazy" decoding="async" /></div>
                  <span className="mp-preview__avatar" aria-hidden="true">{(preview.name.trim() || profile.public_name).charAt(0).toUpperCase()}</span>
                  <div className="mp-preview__body">
                    <h3>{preview.name.trim() || 'Tu emprendimiento'}</h3>
                    {preview.activities.length > 0 && <ul className="mp-preview__tags">{preview.activities.map((activity) => <li key={activity}>{activity}</li>)}</ul>}
                    {preview.locationId && locationLabel(locations, preview.locationId) && <p className="mp-preview__place"><MapPin size={15} aria-hidden="true" />{locationLabel(locations, preview.locationId)}</p>}
                    {preview.payments.length > 0 && (
                      <ul className="mp-preview__pay">
                        {PAYMENT_OPTIONS.filter((option) => preview.payments.includes(option.value)).map(({ value, label, Icon }) => <li key={value}><Icon size={15} aria-hidden="true" />{label}</li>)}
                      </ul>
                    )}
                    <p className="mp-preview__text">{preview.description.trim() || 'Aquí aparecerá la historia de tu negocio.'}</p>
                  </div>
                </div>
              </section>

              <section className="mp-card mp-status" aria-labelledby="profile-status-title">
                <div className="mp-side-head">
                  <span className="mp-side-head__icon"><ShieldCheck size={20} aria-hidden="true" /></span>
                  <div><h2 id="profile-status-title">Estado de verificación</h2><p>Revisa el estado de tu información y verificación.</p></div>
                </div>
                <ul className="mp-status__list">
                  <StatusRow tone={phoneConfirmed ? 'ok' : 'wait'} title={phoneConfirmed ? 'Teléfono confirmado' : 'Teléfono por confirmar'} detail={profile.phone_private} onClick={() => chooseTab('verificacion')} />
                  <StatusRow tone={rank >= 2 ? 'ok' : phoneConfirmed ? 'wait' : 'off'} title={rank >= 2 ? 'Verificado' : 'Verificación pendiente'} detail={rank >= 2 ? 'Documentos revisados.' : 'Confirma tu cuenta para mayor confianza.'} onClick={() => chooseTab('verificacion')} />
                  <StatusRow tone={rank >= 3 ? 'ok' : rank === 2 ? 'wait' : 'off'} title="Verificado Pro" detail={rank >= 3 ? 'Identidad confirmada.' : rank === 2 ? 'Disponible: verifica tu rostro y cédula.' : 'Requiere la etiqueta Verificado.'} onClick={() => chooseTab('verificacion')} />
                  {profile.vendor_type !== 'cooperativa' && <StatusRow tone="info" title={profile.vendor_type === 'distribuidor' ? 'RUC' : 'RUC (opcional)'} detail={profile.ruc ? `${profile.ruc}${profile.ruc_dv ? ` DV ${profile.ruc_dv}` : ''}` : 'Sin registrar'} onClick={() => chooseTab('verificacion')} />}
                </ul>
              </section>
            </aside>
          </div>
        )}
      </div>
    </ProducerShell>
  )
}

function PanelHead({ Icon, title, text }: { Icon: typeof Store; title: string; text: string }) {
  return (
    <div className="mp-panel__head">
      <span className="mp-panel__icon"><Icon size={20} aria-hidden="true" /></span>
      <div><h2>{title}</h2><p>{text}</p></div>
    </div>
  )
}

function StepMarker({ done, n }: { done: boolean; n: number }) {
  return <span className="mp-step__marker" aria-hidden="true">{done ? <Check size={16} strokeWidth={3} /> : n}</span>
}

function StatusRow({ tone, title, detail, onClick }: { tone: 'ok' | 'wait' | 'off' | 'info'; title: string; detail: string; onClick: () => void }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'wait' ? Clock : tone === 'off' ? Lock : Info
  return (
    <li>
      <button type="button" className={`mp-status__row mp-status__row--${tone}`} onClick={onClick}>
        <span className="mp-status__icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="mp-status__text"><strong>{title}</strong><small>{detail}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Verificado Pro (face + cédula) ────────────────────────────────────────────

function ProducerBiometricSection() {
  const [status, setStatus] = useState<BiometricStatus | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(() => {
    getBiometricStatus().then(setStatus).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'No pudimos consultar tu verificación.'))
  }, [])
  useEffect(refresh, [refresh])

  if (loadError) return <p role="alert">{loadError}</p>
  if (!status) return <p role="status">Consultando tu verificación…</p>
  if (!status.eligible) return status.latest?.status === 'approved' ? <p role="status">¡Listo! Tu identidad está confirmada y ya tienes la etiqueta Verificado Pro.</p> : <p>Se activa cuando tengas la etiqueta Verificado.</p>
  if (status.latest?.status === 'pending') return <p role="status">Tu verificación Pro está en revisión. Te avisaremos cuando el equipo termine.</p>

  return (
    <div className="producer-biometric">
      {status.latest?.status === 'rejected' && <p role="alert">No pudimos aprobar tu verificación: {status.latest.review_reason}</p>}
      {capturing ? (
        <Suspense fallback={<p role="status">Cargando…</p>}>
          <BiometricCapture onCancel={() => setCapturing(false)} onDone={() => { setCapturing(false); refresh() }} />
        </Suspense>
      ) : (
        <>
          <p>Confirma tu identidad con una foto de tu cédula y una foto en vivo. Es opcional y gratis.</p>
          <button className="button button--primary" type="button" onClick={() => setCapturing(true)}><ScanFace size={17} aria-hidden="true" /> Empezar verificación facial</button>
        </>
      )}
    </div>
  )
}

// ── Documents ─────────────────────────────────────────────────────────────────


function ProducerDocumentsSection({ hasCedulaPhoto, hasPactoSocial, hasAvisoOperacion, vendorType }: { hasCedulaPhoto: boolean; hasPactoSocial: boolean; hasAvisoOperacion: boolean; vendorType: string }) {
  const [uploaded, setUploaded] = useState<Record<ProducerDocumentType, boolean>>({ cedula_photo: hasCedulaPhoto, pacto_social: hasPactoSocial, aviso_operacion: hasAvisoOperacion })
  const [status, setStatus] = useState<Partial<Record<ProducerDocumentType, string>>>({})

  const documents: Array<{ type: ProducerDocumentType; title: string; hint: string }> = [
    ...(vendorType === 'productor' ? [{ type: 'cedula_photo' as const, title: 'Foto de cédula', hint: 'Obligatoria para publicar · frente legible' }] : []),
    ...(vendorType !== 'cooperativa' ? [{ type: 'aviso_operacion' as const, title: 'Aviso de operación', hint: vendorType === 'distribuidor' ? 'Obligatorio para publicar' : 'Opcional · respalda tu RUC' }] : []),
    ...(vendorType !== 'productor' ? [{ type: 'pacto_social' as const, title: 'Pacto social / personería', hint: vendorType === 'cooperativa' ? 'Obligatorio para publicar' : 'Documento de constitución' }] : []),
  ]

  async function upload(type: ProducerDocumentType, file: File) {
    setStatus((current) => ({ ...current, [type]: 'Subiendo…' }))
    try {
      const optimized = await compressDocumentFile(file)
      if (optimized.size > MAX_UPLOAD_BYTES) throw new Error(MAX_UPLOAD_MESSAGE)
      await uploadProducerDocument(type, optimized)
      const docs = await getProducerDocuments()
      setUploaded({ cedula_photo: docs.has_cedula_photo, pacto_social: docs.has_pacto_social, aviso_operacion: docs.has_aviso_operacion })
      setStatus((current) => ({ ...current, [type]: 'Subido correctamente.' }))
      window.dispatchEvent(new Event(DOCUMENTS_UPDATED_EVENT))
    } catch (error) {
      setStatus((current) => ({ ...current, [type]: error instanceof Error ? error.message : 'No se pudo subir el archivo.' }))
    }
  }

  return (
    <div className="mp-docs">
      <p className="mp-docs__help">Sube al menos uno. JPG, PNG o PDF: las fotos las optimizamos por ti; los PDF deben pesar 2 MB o menos.</p>
      <ul className="mp-docs__list">
        {documents.map((document) => (
          <li key={document.type} className={uploaded[document.type] ? 'is-done' : ''}>
            <span className="mp-docs__icon">{uploaded[document.type] ? <CheckCircle2 size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}</span>
            <span className="mp-docs__text"><strong>{document.title}</strong><small>{status[document.type] ?? (uploaded[document.type] ? 'Recibido' : document.hint)}</small></span>
            <label className="button button--outline button--small mp-docs__upload">
              <Upload size={15} aria-hidden="true" />{uploaded[document.type] ? 'Reemplazar' : 'Subir'}
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="sr-only" aria-label={`Subir ${document.title}`}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (file) void upload(document.type, file)
                  event.currentTarget.value = ''
                }} />
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Product form ──────────────────────────────────────────────────────────────

/** Shown until the list from the units table arrives. */
const DEFAULT_UNITS = [
  { code: 'lb', name: 'Libra (lb)' }, { code: 'kg', name: 'Kilogramo (kg)' }, { code: 'unidad', name: 'Unidad' },
  { code: 'docena', name: 'Docena' }, { code: 'caja', name: 'Caja' }, { code: 'quintal', name: 'Quintal' },
  { code: 'saco', name: 'Saco' }, { code: 'galón', name: 'Galón' }, { code: 'litro', name: 'Litro' },
]

/** Older products hold free text; the form asks again for anything that is not in the units table. */
function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase()
}

const PRODUCT_DRAFT_KEY = 'mercapro.product-draft'
const PRODUCT_DRAFT_FIELDS = ['title', 'description', 'unit', 'minimum_order', 'stock_quantity', 'price_type', 'price_amount', 'price_max', 'currency', 'delivery_method'] as const

type ProductDraft = Partial<Record<(typeof PRODUCT_DRAFT_FIELDS)[number], string>> & { category_id?: number }
type ProductFormSeed = ProductDraft & { minimum_order?: string | null; stock_quantity?: string | number | null; price_amount?: string | null; price_max?: string | null }

function readProductDraft(): ProductDraft | null {
  try {
    const stored = window.localStorage.getItem(PRODUCT_DRAFT_KEY)
    return stored ? JSON.parse(stored) as ProductDraft : null
  } catch {
    return null
  }
}

function writeProductDraft(draft: ProductDraft): boolean {
  try {
    window.localStorage.setItem(PRODUCT_DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

function clearProductDraft() {
  try {
    window.localStorage.removeItem(PRODUCT_DRAFT_KEY)
  } catch {
    // Storage can be blocked; there is nothing to clear then.
  }
}

function ProducerProductForm({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [units, setUnits] = useState(DEFAULT_UNITS)
  const [categoriesFromApi, setCategoriesFromApi] = useState<Array<{ id: number; name: string; parent_id: number | null }>>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesLoadError, setCategoriesLoadError] = useState('')
  const [categoriesRetry, setCategoriesRetry] = useState(0)
  const [selectedParentId, setSelectedParentId] = useState('')
  const [initial, setInitial] = useState<Awaited<ReturnType<typeof getProducerProduct>> | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubId, setSelectedSubId] = useState('')
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([])

  const [draft, setDraft] = useState<ProductDraft | null>(() => editing ? null : readProductDraft())
  const [draftRestored, setDraftRestored] = useState(() => draft !== null)
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [addedCount, setAddedCount] = useState(0)
  const draftTimer = useRef<number | undefined>(undefined)
  const seed = (initial ?? draft ?? {}) as ProductFormSeed
  const seedCategoryId = initial?.category_id ?? draft?.category_id

  const [pvTitle, setPvTitle] = useState(draft?.title ?? '')
  const [pvDesc, setPvDesc] = useState(draft?.description ?? '')
  const [pvUnit, setPvUnit] = useState(draft?.unit ?? 'lb')
  const knownUnit = units.some((unit) => unit.code === pvUnit)
  const [pvPrice, setPvPrice] = useState(draft?.price_amount ?? '')
  const [pvCurrency, setPvCurrency] = useState(draft?.currency ?? 'PAB')
  const [pvPriceType, setPvPriceType] = useState<'fixed' | 'range'>(draft?.price_type === 'range' ? 'range' : 'fixed')
  const [pvPriceMax, setPvPriceMax] = useState(draft?.price_max ?? '')
  const [pvNewImgUrls, setPvNewImgUrls] = useState<string[]>([])
  const [pvImgIdx, setPvImgIdx] = useState(0)
  const pvObjUrls = useRef<string[]>([])
  const [profileStatus, setProfileStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) {
      void getProducerDashboard().then((d) => setProfileStatus(d.profile?.profile_status ?? null))
    }
  }, [editing])

  useEffect(() => {
    if (editing) {
      void getProducerProduct(id)
        .then((product) => { setInitial(product) })
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'No pudimos cargar esta publicación.'))
    }
  }, [editing, id])

  useEffect(() => {
    let current = true
    void listUnits().then((loaded) => {
      if (current && loaded.length > 0) setUnits(loaded)
    }).catch(() => undefined)
    return () => { current = false }
  }, [])

  useEffect(() => {
    let current = true
    setCategoriesLoading(true)
    setCategoriesLoadError('')
    void listCategories().then((categories) => {
      if (current) setCategoriesFromApi(categories)
    }).catch((error: unknown) => {
      if (current) setCategoriesLoadError(error instanceof Error ? error.message : 'No pudimos cargar las categorías.')
    }).finally(() => {
      if (current) setCategoriesLoading(false)
    })
    return () => { current = false }
  }, [categoriesRetry])

  useEffect(() => {
    if (!seedCategoryId || categoriesFromApi.length === 0) return
    const path = categoryPath(categoriesFromApi, seedCategoryId)
    if (path.length === 0) return
    setSelectedParentId(String(path[0].id))
    setSelectedSubId(path[1] ? String(path[1].id) : '')
    setSelectedCategoryId(String(path[path.length - 1].id))
  }, [seedCategoryId, categoriesFromApi])

  useEffect(() => {
    if (initial) {
      setPvTitle(initial.title)
      setPvDesc(initial.description ?? '')
      setPvUnit(normalizeUnit(initial.unit))
      setPvPrice(initial.price_amount != null ? String(initial.price_amount) : '')
      setPvCurrency(initial.currency ?? 'PAB')
      setPvPriceType(initial.price_type === 'range' ? 'range' : 'fixed')
      setPvPriceMax(initial.price_max != null ? String(initial.price_max) : '')
    }
  }, [initial])

  useEffect(() => () => { pvObjUrls.current.forEach(URL.revokeObjectURL) }, [])
  useEffect(() => () => { window.clearTimeout(draftTimer.current) }, [])

  function scheduleDraftSave(event: React.FormEvent<HTMLElement>) {
    if (editing) return
    const form = (event.target as HTMLInputElement).form
    if (!form) return
    window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => {
      const values = new FormData(form)
      const next: ProductDraft = {}
      PRODUCT_DRAFT_FIELDS.forEach((field) => {
        const value = values.get(field)
        if (typeof value === 'string' && value !== '') next[field] = value
      })
      const categoryId = Number(values.get('category_id'))
      if (categoryId > 0) next.category_id = categoryId
      if (writeProductDraft(next)) setDraftSavedAt(new Date().toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' }))
    }, 600)
  }

  function discardDraft() {
    window.clearTimeout(draftTimer.current)
    clearProductDraft()
    setDraft(null)
    setDraftRestored(false)
    setDraftSavedAt('')
    resetForNextProduct()
    setSelectedParentId('')
    setSelectedSubId('')
    setSelectedCategoryId('')
    setPvUnit('lb')
    setPvCurrency('PAB')
  }

  function resetForNextProduct() {
    setFormKey((key) => key + 1)
    setPvTitle('')
    setPvDesc('')
    setPvPrice('')
    setPvPriceMax('')
    setPvPriceType('fixed')
    pvObjUrls.current.forEach(URL.revokeObjectURL)
    pvObjUrls.current = []
    setPvNewImgUrls([])
    setPvImgIdx(0)
  }

  function validatePhotos(input: HTMLInputElement): string {
    const files = Array.from(input.files ?? [])
    const total = (initial?.images.length ?? 0) + files.length
    const error = total > 5
      ? 'Conserva o agrega un máximo de cinco fotografías.'
      : files.find((file) => file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        ? 'Adjunta fotografías JPG, PNG o WebP.'
        : ''
    input.setCustomValidity(error)
    setPhotoError(error)
    return error
  }

  function handlePhotosChange(input: HTMLInputElement) {
    pvObjUrls.current.forEach(URL.revokeObjectURL)
    const urls = Array.from(input.files ?? []).map((f) => URL.createObjectURL(f))
    pvObjUrls.current = urls
    setPvNewImgUrls(urls)
    setPvImgIdx(0)
    setMessage('')
    validatePhotos(input)
  }

  const existingImgUrls = (initial?.images ?? []).map((img) => img.url)
  const allPvImgs = [...existingImgUrls, ...pvNewImgUrls]
  const clampedIdx = Math.min(pvImgIdx, Math.max(0, allPvImgs.length - 1))
  const currentPvImg = allPvImgs[clampedIdx] ?? null
  const pvCategoryName = categoriesFromApi.find((c) => String(c.id) === selectedCategoryId)?.name ?? ''
  const parentCategories = categoriesFromApi.filter((c) => c.parent_id === null)
  const subcategories = selectedParentId
    ? categoriesFromApi.filter((c) => String(c.parent_id) === selectedParentId)
    : []
  const varieties = selectedSubId
    ? categoriesFromApi.filter((c) => String(c.parent_id) === selectedSubId)
    : []

  function pvPriceLabel() {
    const n = parseFloat(pvPrice)
    if (isNaN(n)) return 'Precio pendiente'
    const prefix = pvCurrency === 'USD' ? 'US$' : 'B/.'
    const max = parseFloat(pvPriceMax)
    return pvPriceType === 'range' && !isNaN(max) ? `${prefix} ${n.toFixed(2)} – ${max.toFixed(2)}` : `${prefix} ${n.toFixed(2)}`
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const addAnother = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'another'
    if (!selectedCategoryId) { setSaveError('Selecciona una categoría antes de continuar.'); return }
    const formElement = event.currentTarget
    const photoInput = formElement.elements.namedItem('images[]') as HTMLInputElement | null
    if (photoInput) {
      const photoValidation = validatePhotos(photoInput)
      if (photoValidation) { photoInput.reportValidity(); return }
      if ((initial?.images.length ?? 0) + (photoInput.files?.length ?? 0) < 1) {
        const error = 'Conserva o agrega al menos una fotografía.'
        photoInput.setCustomValidity(error)
        setPhotoError(error)
        photoInput.reportValidity()
        return
      }
    }
    const priceAmountInput = formElement.elements.namedItem('price_amount') as HTMLInputElement | null
    const priceMaxInput = formElement.elements.namedItem('price_max') as HTMLInputElement | null
    if (priceAmountInput) priceAmountInput.setCustomValidity('')
    if (priceMaxInput) priceMaxInput.setCustomValidity('')
    if (priceAmountInput && !(Number(priceAmountInput.value) > 0)) {
      priceAmountInput.setCustomValidity('Ingresa un precio mayor que cero.')
      priceAmountInput.reportValidity()
      return
    }
    if (priceAmountInput && priceMaxInput && !(Number(priceMaxInput.value) > Number(priceAmountInput.value))) {
      priceMaxInput.setCustomValidity('El precio máximo debe ser mayor que el precio mínimo.')
      priceMaxInput.reportValidity()
      return
    }
    setSaveError('')
    setSaving(true)
    try {
      const form = new FormData(formElement)
      if (photoInput?.files?.length) {
        setMessage('Preparando tus fotografías…')
        form.delete('images[]')
        for (const photo of Array.from(photoInput.files)) {
          const optimized = await compressProductPhoto(photo)
          if (optimized.size > MAX_UPLOAD_BYTES) throw new Error(MAX_UPLOAD_MESSAGE)
          form.append('images[]', optimized)
        }
      }
      if (editing) {
        const requiresReview = ['published', 'paused', 'sold_out'].includes(initial?.status ?? '')
        if (requiresReview && String(form.get('reason') ?? '').trim().length < 5) {
          const reasonInput = formElement.elements.namedItem('reason') as HTMLTextAreaElement | null
          reasonInput?.setCustomValidity('Explica el motivo con al menos 5 caracteres.')
          reasonInput?.reportValidity()
          return
        }
        removedImageIds.forEach((imageId) => form.append('remove_image_ids[]', String(imageId)))
        await updateProduct(id, form)
        const updated = await getProducerProduct(id)
        setInitial(updated)
        setRemovedImageIds([])
        setMessage(updated.status === 'pending'
          ? 'Guardamos los cambios y enviamos la oferta a revisión. No aparecerá en el catálogo hasta que el equipo la apruebe.'
          : updated.status === 'published'
            ? 'Guardamos los cambios. Tu oferta sigue publicada en el catálogo.'
            : 'Guardamos los cambios. Puedes enviar la publicación a revisión desde tu panel.')
      } else {
        const saved = await saveProductDraft(form)
        const published = saved.status === 'published'
        window.clearTimeout(draftTimer.current)
        clearProductDraft()
        setDraftRestored(false)
        setDraftSavedAt('')
        if (addAnother) {
          const title = String(form.get('title') ?? '')
          setDraft({ unit: pvUnit, currency: pvCurrency, delivery_method: String(form.get('delivery_method') ?? ''), category_id: Number(selectedCategoryId) })
          resetForNextProduct()
          setAddedCount((count) => count + 1)
          setMessage(`“${title}” ${published ? 'ya está publicado' : 'se envió a revisión'}. Agrega el siguiente producto; dejamos la categoría y la entrega para ahorrarte tiempo.`)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        const notice = published
          ? 'Tu oferta ya está publicada en el catálogo.'
          : profileStatus === 'pending'
          ? 'Tu oferta quedó en revisión. Aparecerá en el catálogo cuando tu perfil y tu oferta sean aprobados.'
          : 'Tu anuncio fue enviado a revisión. El equipo lo aprobará pronto y aparecerá en el catálogo.'
        navigate('/mis-productos', { state: { notice } })
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo guardar el borrador.'
      setSaveError(detail)
      setMessage('')
    } finally {
      setSaving(false)
    }
  }

  const formDisabled = saving || (editing && !initial) || categoriesLoading || Boolean(categoriesLoadError) || parentCategories.length === 0

  return (
    <ProducerShell>
      <div className="product-form-page">
        <div className="product-form-layout">
          <section className="product-form-col" onChange={scheduleDraftSave}>
            <p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p>
            <h1 className="product-form-col__title">{editing ? 'Edita tu oferta' : 'Publica un producto'}</h1>
            {!editing && profileStatus === 'pending' && (
              <div className="profile-completion-card" role="note" style={{ marginBottom: '1.5rem' }}>
                <div className="profile-completion-card__head">
                  <AlertCircle size={19} className="profile-completion-card__icon" aria-hidden="true" />
                  <div>
                    <strong>Tu perfil está en revisión</strong>
                    <p>Podés crear ofertas ahora, pero aparecerán en el catálogo público solo cuando tanto tu perfil como cada oferta sean aprobados por el equipo.</p>
                  </div>
                </div>
              </div>
            )}
            {!editing && draftRestored && (
              <div className="product-draft-note" role="status">
                <span>Recuperamos tu borrador. Vuelve a elegir las fotos antes de enviar.</span>
                <button className="text-link" type="button" onClick={discardDraft}>Descartar borrador</button>
              </div>
            )}
            <ValidatedForm key={formKey} className="auth-form producer-product-form" onSubmit={handleSubmit} aria-busy={saving}>
              {!editing || initial ? (
                <>
                  <label>Nombre del producto
                    <input name="title" defaultValue={seed.title} minLength={3} maxLength={120} required
                      onChange={(e) => setPvTitle(e.currentTarget.value)} />
                  </label>

                  <label>Categoría
                    <select
                      value={selectedParentId}
                      onChange={(e) => {
                        const pid = e.currentTarget.value
                        setSelectedParentId(pid)
                        setSelectedSubId('')
                        const subs = categoriesFromApi.filter((c) => String(c.parent_id) === pid)
                        setSelectedCategoryId(subs.length === 0 ? pid : '')
                      }}
                      disabled={categoriesLoading || Boolean(categoriesLoadError) || parentCategories.length === 0}
                    >
                      <option value="">{categoriesLoading ? 'Cargando categorías…' : parentCategories.length ? 'Selecciona una categoría' : 'No hay categorías disponibles'}</option>
                      {parentCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </label>
                  {selectedParentId && subcategories.length > 0 && (
                    <label>Subcategoría
                      <select
                        value={selectedSubId}
                        onChange={(e) => {
                          const subId = e.currentTarget.value
                          setSelectedSubId(subId)
                          setSelectedCategoryId(categoriesFromApi.some((c) => String(c.parent_id) === subId) ? '' : subId)
                        }}
                        required
                      >
                        <option value="">Selecciona una subcategoría</option>
                        {subcategories.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                      </select>
                    </label>
                  )}
                  {selectedSubId && varieties.length > 0 && (
                    <label>Tipo específico
                      <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.currentTarget.value)} required>
                        <option value="">Selecciona el tipo</option>
                        {varieties.map((variety) => <option key={variety.id} value={variety.id}>{variety.name}</option>)}
                      </select>
                    </label>
                  )}
                  {selectedParentId && subcategories.length > 0 && <input type="hidden" name="category_id" value={selectedCategoryId} />}
                  {selectedParentId && subcategories.length === 0 && (
                    <input type="hidden" name="category_id" value={selectedCategoryId} />
                  )}
                  {categoriesLoading && <p role="status">Cargando categorías disponibles…</p>}
                  {categoriesLoadError && <div className="catalog-reference-error" role="alert"><span>No pudimos cargar las categorías. {categoriesLoadError}</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((n) => n + 1)}>Reintentar</button></div>}
                  {!categoriesLoading && !categoriesLoadError && parentCategories.length === 0 && <div className="catalog-reference-error" role="alert"><span>No hay categorías activas para publicar todavía.</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((n) => n + 1)}>Volver a consultar</button></div>}

                  <label>Descripción
                    <textarea name="description" defaultValue={seed.description} minLength={20} maxLength={3000} required rows={5}
                      className="resize-none" style={{ resize: 'none' }}
                      onChange={(e) => setPvDesc(e.currentTarget.value)} />
                  </label>

                  <div className="form-row">
                    <label>Unidad de venta
                      <select name="unit" value={knownUnit ? pvUnit : ''} required onChange={(e) => setPvUnit(e.currentTarget.value)}>
                        {!knownUnit && <option value="">Selecciona una unidad</option>}
                        {units.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
                      </select>
                    </label>
                    <label>Pedido mínimo (opcional)
                      <input name="minimum_order" defaultValue={seed.minimum_order ?? ''} placeholder="Ej: 5 lb, 1 caja" maxLength={100} />
                      <small>Cantidad mínima que aceptas por pedido.</small>
                    </label>
                  </div>
                  <div className="form-row">
                    <label>Stock disponible (opcional)
                      <input name="stock_quantity" defaultValue={seed.stock_quantity ?? ''} type="number" min="0" step="0.01" />
                      <small>Déjalo vacío si prefieres no indicar cantidad.</small>
                    </label>
                  </div>

                  <label>Tipo de precio
                    <select name="price_type" value={pvPriceType} onChange={(e) => setPvPriceType(e.currentTarget.value === 'range' ? 'range' : 'fixed')}>
                      <option value="fixed">Precio específico</option>
                      <option value="range">Rango de precio</option>
                    </select>
                  </label>

                  <div className="form-row">
                    <label>{pvPriceType === 'range' ? 'Precio mínimo' : 'Precio'}
                      <input name="price_amount" defaultValue={seed.price_amount ?? ''} type="number" min="0.01" step="0.01" required
                        onChange={(e) => { e.currentTarget.setCustomValidity(''); setPvPrice(e.currentTarget.value) }} />
                    </label>
                    {pvPriceType === 'range' && (
                      <label>Precio máximo
                        <input name="price_max" defaultValue={seed.price_max ?? ''} type="number" min="0.01" step="0.01" required
                          onChange={(e) => { e.currentTarget.setCustomValidity(''); setPvPriceMax(e.currentTarget.value) }} />
                      </label>
                    )}
                    <label>Moneda
                      <select name="currency" defaultValue={seed.currency ?? 'PAB'}
                        onChange={(e) => setPvCurrency(e.currentTarget.value)}>
                        <option value="PAB">B/. · Balboa</option>
                        <option value="USD">US$ · Dólar estadounidense</option>
                      </select>
                    </label>
                  </div>

                  <label>Entrega o recogida
                    <input name="delivery_method" defaultValue={seed.delivery_method} maxLength={120} required />
                  </label>

                  {editing && initial && ['published', 'paused', 'sold_out'].includes(initial.status) && (
                    <div className="moderation-feedback">
                      <strong>La oferta dejará de aparecer temporalmente.</strong>
                      <p>Al guardar, el equipo revisará los cambios y la oferta volverá al catálogo solo después de aprobarla. La fecha de vigencia actual se conserva.</p>
                      <label>Motivo del cambio
                        <textarea name="reason" minLength={5} maxLength={1000} required rows={3}
                          className="resize-none" style={{ resize: 'none' }}
                          onChange={(e) => e.currentTarget.setCustomValidity('')} />
                        <small>Explica qué cambió y por qué. Mínimo 5 caracteres.</small>
                      </label>
                    </div>
                  )}

                  {editing && initial && initial.images.length > 0 && (
                    <section className="existing-product-photos" aria-label="Fotografías actuales">
                      <h2>Fotografías actuales</h2>
                      <div className="existing-product-photos__grid">
                        {initial.images.map((image) => (
                          <figure className="existing-product-photo" key={image.id}>
                            <img src={image.url} alt={image.alt_text ?? initial.title} />
                            <button className="button button--quiet button--small" type="button"
                              aria-label={`Quitar fotografía ${image.position + 1}`}
                              onClick={() => {
                                setRemovedImageIds((ids) => [...ids, image.id])
                                setInitial((cur) => cur ? { ...cur, images: cur.images.filter((item) => item.id !== image.id) } : cur)
                              }}>Quitar</button>
                          </figure>
                        ))}
                      </div>
                      <small>Conserva al menos una fotografía para enviar la publicación a revisión.</small>
                    </section>
                  )}

                  <label>Fotografías {editing ? '(opcional: hasta cinco en total)' : '(1 a 5)'}
                    <input name="images[]" type="file" accept="image/jpeg,image/png,image/webp" multiple required={!editing}
                      aria-describedby="product-photos-help product-photos-error"
                      onChange={(e) => handlePhotosChange(e.currentTarget)} />
                    <small id="product-photos-help">JPG, PNG o WebP · hasta cinco fotografías. Las optimizamos al guardar, pesen lo que pesen.</small>
                    {photoError && <span id="product-photos-error" role="alert">{photoError}</span>}
                  </label>

                  {!editing && <p className="form-help">Al enviar, el equipo revisará tu anuncio. Solo aparecerá en el catálogo después de ser aprobado.</p>}
                </>
              ) : (
                <p role="status">Cargando publicación…</p>
              )}

              {saving && <p role="status" aria-live="polite">Preparando y guardando tus fotografías… Mantén esta página abierta mientras terminamos.</p>}
              {saveError && <p className="producer-product-form__error" role="alert">No pudimos guardar. <strong>{saveError}</strong></p>}
              {!saveError && message && <p role="status">{message}</p>}
              {!editing && draftSavedAt && <p className="product-draft-saved" role="status">Guardado automáticamente ({draftSavedAt}). Las fotos no se guardan.</p>}
              <div className="product-form-submit">
                <button className="button button--primary" type="submit" disabled={formDisabled} aria-busy={saving}>
                  {saving ? 'Enviando…' : saveError ? 'Reintentar' : editing ? 'Guardar cambios' : 'Enviar a revisión'}
                </button>
                {!editing && <button className="button button--outline" type="submit" value="another" disabled={formDisabled}>Enviar y añadir otro</button>}
                {!editing && addedCount > 0 && <Link className="text-link" to="/mis-productos">Terminar ({addedCount} {addedCount === 1 ? 'enviado' : 'enviados'})</Link>}
              </div>
            </ValidatedForm>
          </section>

          <aside className="product-preview-col" aria-label="Vista previa del anuncio">
            <p className="eyebrow eyebrow--quiet">VISTA PREVIA</p>
            <p className="product-preview-intro">Así verán tu anuncio los compradores</p>

            <div className="product-preview-card">
              <div className="product-preview-card__image">
                {currentPvImg ? (
                  <img src={currentPvImg} alt="Vista previa de la fotografía del producto" />
                ) : (
                  <div className="product-preview-card__placeholder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                    <span>Agrega una foto</span>
                  </div>
                )}
                <span className="harvest-label" aria-hidden="true">Cosecha local</span>
                {allPvImgs.length > 1 && (
                  <div className="product-preview-card__thumbs">
                    {allPvImgs.map((url, i) => (
                      <button key={i} type="button" aria-label={`Ver foto ${i + 1}`}
                        className={i === clampedIdx ? 'active' : ''}
                        onClick={() => setPvImgIdx(i)}>
                        <img src={url} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="product-preview-card__body">
                {pvCategoryName && <div className="product-card__category">{pvCategoryName}</div>}
                <h3 className="product-preview-card__title">
                  {pvTitle || <span className="product-preview-card__empty">Nombre del producto</span>}
                </h3>
                {pvDesc && (
                  <p className="product-preview-card__desc">
                    {pvDesc.length > 140 ? pvDesc.slice(0, 140) + '…' : pvDesc}
                  </p>
                )}
                <div className="product-card__footer" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e4eaf5' }}>
                  <p className="product-price">
                    <strong>{pvPriceLabel()}</strong>
                    {pvPrice && pvUnit && <span>por {pvUnit}</span>}
                  </p>
                  <span className="text-link" aria-hidden="true">Ver oferta →</span>
                </div>
              </div>
            </div>

            <p className="product-preview-hint">
              La vista previa es orientativa. Tu publicación deberá ser aprobada antes de aparecer en el catálogo.
            </p>
          </aside>
        </div>
      </div>
    </ProducerShell>
  )
}

// ── Status labels ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', pending: 'En revisión', published: 'Publicado',
  paused: 'Pausado', sold_out: 'Agotado', rejected: 'No aprobado',
  withdrawn: 'Retirado', changes_requested: 'Requiere cambios',
}

// ── Dashboard home ────────────────────────────────────────────────────────────

function ProducerDashboard() {
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getProducerDashboard>> | null>(null)
  const [producerMetrics, setProducerMetrics] = useState<ProducerMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState('')
  const [appealState, setAppealState] = useState<ProducerAppealState | null>(null)
  const [appealLoading, setAppealLoading] = useState(false)
  const [appealLoadError, setAppealLoadError] = useState('')
  const [appealRetry, setAppealRetry] = useState(0)
  const [error, setError] = useState('')
  const [appealMessage, setAppealMessage] = useState('')
  const [appealDraft, setAppealDraft] = useState('')
  const [appealError, setAppealError] = useState('')
  const [appealSaving, setAppealSaving] = useState(false)
  const [withdrawTarget, setWithdrawTarget] = useState<ProducerDashboardProduct | null>(null)
  const [withdrawError, setWithdrawError] = useState('')
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [withdrawNotice, setWithdrawNotice] = useState('')
  const withdrawTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    void getProducerDashboard().then((result) => {
      setDashboard(result)
      if (result.profile) {
        setMetricsLoading(true)
        void getProducerMetrics()
          .then(setProducerMetrics)
          .catch((reason: unknown) => setMetricsError(reason instanceof Error ? reason.message : 'No pudimos cargar tus métricas.'))
          .finally(() => setMetricsLoading(false))
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar tu panel.'))
  }, [])

  useEffect(() => {
    if (!dashboard?.profile?.slug) return
    let active = true
    setAppealLoading(true)
    setAppealLoadError('')
    void getProducerAppeals().then((state) => {
      if (active) setAppealState(state)
    }).catch((reason: unknown) => {
      if (active) setAppealLoadError(reason instanceof Error ? reason.message : 'No pudimos cargar la revisión.')
    }).finally(() => {
      if (active) setAppealLoading(false)
    })
    return () => { active = false }
  }, [dashboard?.profile?.slug, appealRetry])

  async function confirmDashboardWithdrawal() {
    if (!withdrawTarget || withdrawBusy) return
    setWithdrawBusy(true)
    setWithdrawError('')
    try {
      await transitionProducerProduct(withdrawTarget.id, 'withdrawn')
      setDashboard((current) => current ? {
        ...current,
        products: current.products.map((item) => item.id === withdrawTarget.id ? { ...item, status: 'withdrawn' } : item),
      } : current)
      setWithdrawNotice('Publicación retirada.')
      setWithdrawTarget(null)
    } catch (reason) {
      setWithdrawError(reason instanceof Error ? `${reason.message} Puedes volver a intentarlo.` : 'No se pudo retirar la publicación.')
    } finally {
      setWithdrawBusy(false)
    }
  }

  async function sendAppeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (appealDraft.trim().length < 20) {
      setAppealError('Explica tu solicitud con al menos 20 caracteres.')
      document.getElementById('producer-appeal-reason')?.focus()
      return
    }
    setAppealError('')
    setAppealSaving(true)
    try {
      await submitProducerAppeal(appealDraft.trim())
      setAppealState(await getProducerAppeals())
      setAppealDraft('')
      setAppealMessage('Recibimos tu solicitud. El equipo la revisará y dejará aquí la resolución.')
    } catch (reason) {
      setAppealError(reason instanceof Error ? reason.message : 'No se pudo enviar la solicitud. Conservamos tu texto para que puedas volver a intentarlo.')
    } finally {
      setAppealSaving(false)
    }
  }

  const openAppeal = appealState?.appeals.find((appeal) => appeal.status === 'pending')
  const profileSuspended = dashboard?.profile?.profile_status === 'suspended'
  const showAppealHistory = profileSuspended || (appealState?.appeals.length ?? 0) > 0
  const reinstatedAppeal = appealState?.appeals.find((appeal) => appeal.status === 'reinstated')
  const pendingProducts = Number(producerMetrics?.products.pending ?? 0)
  const contactsByProduct = new Map(
    producerMetrics?.top_products_30d?.map((p) => [p.product_id, p.contact_intentions]) ?? []
  )

  // Profile completion
  const profileChecks = dashboard?.profile ? [
    { done: Boolean(dashboard.profile.description?.trim()), label: 'Agrega una descripción de tu negocio', href: '/mi-perfil' },
    { done: Boolean(dashboard.profile.activity), label: 'Indica tu tipo de actividad', href: '/mi-perfil' },
    { done: Boolean(dashboard.profile.location_id), label: 'Elige tu ubicación aproximada', href: '/mi-perfil' },
    { done: dashboard.profile.contact_level === 'contact_confirmed', label: 'Confirma tu teléfono', href: '/mi-perfil#verificar' },
  ] : []
  const incompleteChecks = profileChecks.filter((c) => !c.done)
  const completionPct = profileChecks.length
    ? Math.round((profileChecks.length - incompleteChecks.length) / profileChecks.length * 100)
    : 0

  const firstName = dashboard?.user.name.split(' ')[0] ?? ''

  return (
    <ProducerShell>
      <div className="producer-dash">

        {/* Greeting */}
        <div className="producer-dash__greeting">
          <div>
            <p className="eyebrow eyebrow--quiet">MI PANEL</p>
            <h1>{firstName ? `Hola, ${firstName}` : 'Mi panel'}</h1>
          </div>
        </div>

        {error && (
          <div className="empty-products" role="alert">
            <strong>{error}</strong>
            <Link className="button button--primary" to="/ingresar">Ingresar</Link>
          </div>
        )}

        {!error && !dashboard && <p role="status">Cargando tu panel…</p>}

        {!error && dashboard && (
          <>
            {/* Suspension notice */}
            {showAppealHistory && (
              <section className="suspension-notice" aria-labelledby="suspension-title">
                <p className="eyebrow eyebrow--quiet">REVISIÓN DE CUENTA</p>
                <h2 id="suspension-title">{profileSuspended ? 'Tu perfil está suspendido' : 'Historial de revisión de suspensión'}</h2>
                {profileSuspended && (
                  <>
                    <p><strong>Motivo comunicado:</strong> {dashboard.profile?.suspension_reason || 'El equipo de moderación registró una suspensión para tu perfil.'}</p>
                    <p>Si consideras que hubo un error, puedes solicitar una revisión humana. La decisión quedará registrada y recibirás aquí el resultado.</p>
                    <p>Mientras esté suspendido, puedes preparar borradores o retirar ofertas, pero no enviarlas a revisión ni volver a publicarlas.</p>
                  </>
                )}
                {appealLoading && <p role="status">Consultando si tienes una solicitud en revisión…</p>}
                {appealLoadError && (
                  <div role="alert">
                    <p>No pudimos cargar tu historial de revisión.</p>
                    <button className="button button--outline" type="button" onClick={() => setAppealRetry((attempt) => attempt + 1)}>Intentar de nuevo</button>
                  </div>
                )}
                {appealState && (
                  <>
                    {openAppeal ? (
                      <p className="status-pill status-pill--pending">Tu solicitud está en revisión desde {new Date(openAppeal.submitted_at).toLocaleDateString('es-PA')}.</p>
                    ) : (
                      appealState.appeals.map((appeal) => (
                        <article className="appeal-history" key={appeal.id}>
                          <strong>{appeal.status === 'reinstated' ? 'Perfil restablecido' : appeal.status === 'upheld' ? 'Suspensión confirmada' : 'Solicitud pendiente'}</strong>
                          <p>{appeal.resolution_note ?? appeal.reason}</p>
                          {reinstatedAppeal?.id === appeal.id && metricsLoading && <p role="status">Consultando qué publicaciones siguen en revisión…</p>}
                          {reinstatedAppeal?.id === appeal.id && metricsError && <p role="alert">No pudimos consultar el estado de tus publicaciones. Revisa <Link to="/mis-productos">Mis productos</Link> o vuelve a cargar el panel.</p>}
                          {reinstatedAppeal?.id === appeal.id && producerMetrics && pendingProducts > 0 && (
                            <p className="moderation-feedback" role="status">
                              Tu perfil está activo. {pendingProducts} {pendingProducts === 1 ? 'oferta está' : 'ofertas están'} en revisión humana antes de reaparecer.
                            </p>
                          )}
                        </article>
                      ))
                    )}
                    {profileSuspended && !appealLoading && !appealLoadError && !openAppeal && (
                      <ValidatedForm className="auth-form" noValidate onSubmit={(event) => void sendAppeal(event)}>
                        <TextAreaField id="producer-appeal-reason" name="reason" label="Explica por qué solicitas la revisión" value={appealDraft}
                          onChange={(value) => { setAppealDraft(value); setAppealError('') }}
                          error={appealError} minLength={20} maxLength={2000} rows={4} required />
                        <button className="button button--primary" type="submit" disabled={appealSaving} aria-busy={appealSaving}>Solicitar revisión</button>
                        {appealSaving && <p role="status">Enviando tu solicitud…</p>}
                      </ValidatedForm>
                    )}
                  </>
                )}
                {appealMessage && <p role="status">{appealMessage}</p>}
              </section>
            )}

            {/* Pending profile notice */}
            {dashboard.profile?.profile_status === 'pending' && !profileSuspended && (
              <div className="profile-completion-card" role="note">
                <div className="profile-completion-card__head">
                  <AlertCircle size={19} className="profile-completion-card__icon" aria-hidden="true" />
                  <div>
                    <strong>Tu perfil está en revisión</strong>
                    <p>El equipo de MercaPRO está revisando tu cuenta. Podés crear y enviar ofertas mientras tanto — aparecerán en el catálogo público cuando tu perfil y cada oferta sean aprobados.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Profile completion card */}
            {dashboard.profile && incompleteChecks.length > 0 && (
              <div className="profile-completion-card">
                <div className="profile-completion-card__head">
                  <AlertCircle size={19} className="profile-completion-card__icon" aria-hidden="true" />
                  <div>
                    <strong>Completa tu perfil — {completionPct}%</strong>
                    <p>Un perfil completo aparece mejor en el catálogo y genera más contactos.</p>
                  </div>
                </div>
                <div className="profile-completion-card__bar-wrap">
                  <div className="profile-completion-card__bar" style={{ width: `${completionPct}%` }} />
                </div>
                <ul className="profile-completion-card__list">
                  {incompleteChecks.map(({ label, href }) => (
                    <li key={label}>
                      <Link to={href} className="profile-completion-card__item">
                        <span className="profile-completion-dot" aria-hidden="true" />
                        {label}
                        <ChevronRight size={13} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stats */}
            {dashboard.profile && (
              <div className="producer-stat-row" aria-label="Resumen de actividad">
                <div className="producer-stat">
                  <strong>{metricsLoading ? '—' : (producerMetrics?.products.published ?? 0)}</strong>
                  <span>Publicaciones activas</span>
                </div>
                <div className="producer-stat">
                  <strong>{metricsLoading ? '—' : (producerMetrics?.contact_intentions_30d ?? '—')}</strong>
                  <span>Contactos este mes</span>
                </div>
                <div className="producer-stat">
                  <strong>{metricsLoading ? '—' : (producerMetrics?.contact_channels_30d?.whatsapp ?? '—')}</strong>
                  <span>WhatsApp</span>
                  <small>últimos 30 días</small>
                </div>
                <div className="producer-stat">
                  <strong>{metricsLoading ? '—' : (producerMetrics?.contact_channels_30d?.phone ?? '—')}</strong>
                  <span>Teléfono</span>
                  <small>últimos 30 días</small>
                </div>
              </div>
            )}
            {metricsError && <p role="alert" style={{ marginBottom: '1rem' }}>{metricsError}</p>}

            {/* Publications */}
            {withdrawNotice && <p role="status" className="form-help">{withdrawNotice}</p>}
            <section className="producer-products-section">
              <div className="producer-products-section__header">
                <h2>Mis publicaciones</h2>
                <Link className="text-link" to="/mis-productos">Administrar <ArrowRight size={14} /></Link>
              </div>
              {dashboard.products.length ? (
                dashboard.products.map((product) => {
                  const contacts = contactsByProduct.get(product.id) ?? 0
                  const isExpired = product.listing_expired
                  const daysLeft = product.listing_expires_at
                    ? Math.ceil((new Date(product.listing_expires_at).getTime() - Date.now()) / 86400000)
                    : null
                  return (
                    <article className="producer-product-card" key={product.id}>
                      <div className="producer-product-card__main">
                        <div className="producer-product-card__status-row">
                          <span className={`status-pill status-pill--${isExpired ? 'expired' : product.status}`}>
                            {isExpired ? 'Oferta vencida' : (STATUS_LABEL[product.status] ?? product.status.replaceAll('_', ' '))}
                          </span>
                          {producerMetrics !== null && (
                            <span className={`producer-product-card__contacts${contacts > 0 ? ' producer-product-card__contacts--active' : ''}`}>
                              {contacts > 0 ? `${contacts} contacto${contacts !== 1 ? 's' : ''} este mes` : 'Sin contactos este mes'}
                            </span>
                          )}
                        </div>
                        <h3 className="producer-product-card__title">{product.title}</h3>
                        {!isExpired && daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
                          <p className="producer-product-card__expiry-warning">Vence en {daysLeft} {daysLeft === 1 ? 'día' : 'días'}</p>
                        )}
                        {isExpired && (
                          <p className="moderation-feedback">
                            Dejó de aparecer en el catálogo.{' '}
                            <Link to="/mis-productos">Renueva la vigencia</Link> si sigue disponible.
                          </p>
                        )}
                        {['changes_requested', 'rejected'].includes(product.status) && product.latest_moderation_decision?.reason && (
                          <p className="moderation-feedback">
                            <strong>{product.status === 'rejected' ? 'Motivo del rechazo:' : 'Cambios pedidos:'}</strong>{' '}
                            {product.latest_moderation_decision.reason}
                          </p>
                        )}
                      </div>
                      <div className="detail-actions">
                        <ProducerReviewSubmission
                          productId={product.id}
                          status={product.status}
                          disabled={profileSuspended}
                          onSubmitted={() => setDashboard((current) => current ? {
                            ...current,
                            products: current.products.map((item) => item.id === product.id ? { ...item, status: 'pending' } : item),
                          } : current)}
                        />
                        {['draft', 'changes_requested', 'rejected', 'published', 'paused', 'sold_out'].includes(product.status) && (
                          <Link className="text-link" to={`/mis-productos/${product.id}/editar`}>Editar <ArrowRight size={14} /></Link>
                        )}
                        {['draft', 'pending', 'changes_requested', 'rejected'].includes(product.status) && (
                          <button
                            ref={withdrawTriggerRef}
                            className="text-link"
                            type="button"
                            disabled={withdrawBusy}
                            onClick={(event) => {
                              withdrawTriggerRef.current = event.currentTarget
                              setWithdrawError('')
                              setWithdrawTarget(product)
                            }}
                          >
                            Retirar
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="producer-empty-state">
                  <p>Aún no tienes publicaciones.</p>
                  <Link className="button button--primary" to="/mis-productos/nuevo">Publicar mi primer producto</Link>
                </div>
              )}
              <p className="form-help" style={{ marginTop: '1rem' }}>
                Los contactos muestran clics para abrir WhatsApp o teléfono; no confirman conversaciones ni ventas.
              </p>
            </section>
          </>
        )}
      </div>

      {withdrawTarget && (
        <ConfirmActionDialog
          title="Retirar publicación"
          accessibleName={`Retirar ${withdrawTarget.title}`}
          description={`¿Quieres retirar "${withdrawTarget.title}"? Dejará de aparecer en el catálogo.`}
          confirmLabel="Confirmar retiro"
          busyLabel="Retirando…"
          busy={withdrawBusy}
          error={withdrawError}
          onCancel={() => { setWithdrawTarget(null); window.setTimeout(() => withdrawTriggerRef.current?.focus(), 0) }}
          onConfirm={() => void confirmDashboardWithdrawal()}
        />
      )}
    </ProducerShell>
  )
}

// ── Products management page ──────────────────────────────────────────────────

function ProducerProductsPage() {
  const location = useLocation()
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getProducerDashboard>> | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<string>(() => (location.state as { notice?: string } | null)?.notice ?? '')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [renewingId, setRenewingId] = useState<number | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<ProducerDashboardProduct | null>(null)
  const [withdrawError, setWithdrawError] = useState('')
  const withdrawTriggerRef = useRef<HTMLButtonElement | null>(null)
  const withdrawPageFocusRef = useRef(false)
  const pageHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const profileSuspended = dashboard?.profile?.profile_status === 'suspended'

  useEffect(() => {
    void getProducerDashboard().then(setDashboard)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar tus publicaciones.'))
  }, [])

  useEffect(() => {
    if (withdrawTarget) return
    if (withdrawPageFocusRef.current) {
      withdrawPageFocusRef.current = false
      pageHeadingRef.current?.focus()
      return
    }
    withdrawTriggerRef.current?.focus()
    withdrawTriggerRef.current = null
  }, [withdrawTarget])

  async function changeStatus(id: number, status: 'paused' | 'sold_out' | 'published') {
    if (updatingId !== null || renewingId !== null) return
    setUpdatingId(id)
    setError('')
    setNotice('')
    try {
      await transitionProducerProduct(id, status)
      setDashboard((current) => current ? {
        ...current,
        products: current.products.map((product) => product.id === id ? { ...product, status } : product),
      } : current)
      setNotice(status === 'paused' ? 'Publicación pausada.' : status === 'sold_out' ? 'Publicación marcada como agotada.' : 'Publicación volvió a estar disponible.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la publicación.')
    } finally {
      setUpdatingId(null)
    }
  }

  function requestWithdrawal(product: ProducerDashboardProduct, trigger: HTMLButtonElement) {
    if (updatingId !== null || renewingId !== null) return
    withdrawTriggerRef.current = trigger
    setWithdrawError('')
    setError('')
    setWithdrawTarget(product)
  }

  async function confirmWithdrawal() {
    if (!withdrawTarget || updatingId !== null) return
    const product = withdrawTarget
    setUpdatingId(product.id)
    setWithdrawError('')
    try {
      await transitionProducerProduct(product.id, 'withdrawn')
      setDashboard((current) => current ? {
        ...current,
        products: current.products.map((item) => item.id === product.id ? { ...item, status: 'withdrawn' } : item),
      } : current)
      setNotice('Publicación retirada.')
      withdrawPageFocusRef.current = true
      setWithdrawTarget(null)
    } catch (reason) {
      setWithdrawError(reason instanceof Error ? reason.message : 'No se pudo retirar la publicación. Puedes volver a intentarlo.')
    } finally {
      setUpdatingId(null)
    }
  }

  async function renew(product: ProducerDashboardProduct) {
    setRenewingId(product.id)
    setError('')
    setNotice('')
    try {
      const result = await renewProducerProduct(product.id)
      setDashboard((current) => current ? {
        ...current,
        products: current.products.map((item) => item.id === product.id
          ? { ...item, published_at: result.published_at, listing_expired: false, listing_expires_at: result.listing_expires_at }
          : item),
      } : current)
      setNotice('Oferta renovada. Volvió a aparecer en el catálogo público.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo renovar la oferta.')
    } finally {
      setRenewingId(null)
    }
  }

  return (
    <ProducerShell>
      <div className="producer-dash">
        <div className="producer-dash__greeting">
          <p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p>
          <h1 ref={pageHeadingRef} tabIndex={-1}>Mis publicaciones</h1>
        </div>

        {error && !dashboard ? (
          <div className="empty-products" role="alert">
            <strong>{error}</strong>
            <Link className="button button--primary" to="/ingresar">Ingresar</Link>
          </div>
        ) : !dashboard ? (
          <p role="status">Cargando publicaciones…</p>
        ) : (
          <>
            {error && <p role="alert">{error}</p>}
            {profileSuspended && (
              <p className="moderation-feedback" role="status">
                Tu perfil está suspendido. Puedes conservar y editar borradores, pero no enviarlos a revisión ni volver a publicar ofertas.
              </p>
            )}
            {notice && <p className="form-help" role="status">{notice}</p>}

            <div style={{ marginBottom: '1.5rem' }}>
              <Link className="button button--primary" to="/mis-productos/nuevo">
                <Plus size={16} aria-hidden="true" /> Publicar producto
              </Link>
            </div>

            <section className="dashboard-list">
              {dashboard.products.length ? (
                dashboard.products.map((product) => (
                  <article className="dashboard-row" key={product.id}>
                    <div>
                      <h2>{product.title}</h2>
                      {product.listing_expired ? (
                        <>
                          <span className="status-pill status-pill--expired">Oferta vencida</span>
                          <p className="moderation-feedback">Dejó de aparecer en el catálogo. Renueva la vigencia cuando confirmes que sigue disponible.</p>
                        </>
                      ) : (
                        <>
                          <span className={`status-pill status-pill--${product.status}`}>{STATUS_LABEL[product.status] ?? product.status.replaceAll('_', ' ')}</span>
                          {product.status === 'published' && product.listing_expires_at && (
                            <p className="moderation-feedback">Vigente hasta {new Date(product.listing_expires_at).toLocaleDateString('es-PA')}.</p>
                          )}
                        </>
                      )}
                      {['changes_requested', 'rejected'].includes(product.status) && (
                        <p className="moderation-feedback" role="status">
                          <strong>{product.status === 'rejected' ? 'Motivo del rechazo:' : 'Cambios solicitados:'}</strong>{' '}
                          {product.latest_moderation_decision?.reason ?? 'Consulta con el equipo de soporte antes de continuar.'}
                        </p>
                      )}
                    </div>
                    <div className="detail-actions">
                      {['draft', 'changes_requested', 'rejected'].includes(product.status) && (
                        <Link className="text-link" to={`/mis-productos/${product.id}/editar`}>Corregir publicación</Link>
                      )}
                      {['published', 'paused', 'sold_out'].includes(product.status) && (
                        <Link className="text-link" to={`/mis-productos/${product.id}/editar`}>Editar oferta</Link>
                      )}
                      {['draft', 'pending', 'changes_requested', 'rejected'].includes(product.status) && (
                        <button className="text-link" type="button"
                          onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button>
                      )}
                      <ProducerReviewSubmission
                        productId={product.id}
                        status={product.status}
                        disabled={profileSuspended}
                        onSubmitted={() => setDashboard((current) => current ? {
                          ...current,
                          products: current.products.map((item) => item.id === product.id ? { ...item, status: 'pending' } : item),
                        } : current)}
                      />
                      {product.status === 'published' && product.listing_expired && (
                        <>
                          <button className="button button--primary button--small" type="button"
                            disabled={profileSuspended || renewingId === product.id || updatingId !== null}
                            aria-busy={renewingId === product.id}
                            onClick={() => void renew(product)}>
                            {renewingId === product.id ? 'Renovando…' : 'Renovar oferta'}
                          </button>
                          <button className="text-link" type="button"
                            onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button>
                        </>
                      )}
                      {product.status === 'published' && !product.listing_expired && (
                        <>
                          <button className="button button--outline button--small" type="button"
                            disabled={updatingId !== null || renewingId !== null}
                            aria-busy={updatingId === product.id}
                            onClick={() => void changeStatus(product.id, 'paused')}>
                            {updatingId === product.id ? 'Pausando…' : 'Pausar'}
                          </button>
                          <button className="button button--outline button--small" type="button"
                            disabled={updatingId !== null || renewingId !== null}
                            aria-busy={updatingId === product.id}
                            onClick={() => void changeStatus(product.id, 'sold_out')}>
                            {updatingId === product.id ? 'Actualizando…' : 'Marcar agotado'}
                          </button>
                          <button className="text-link" type="button"
                            onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button>
                        </>
                      )}
                      {['paused', 'sold_out'].includes(product.status) && (
                        <>
                          <button className="button button--primary button--small" type="button"
                            disabled={profileSuspended || updatingId !== null || renewingId !== null}
                            aria-busy={updatingId === product.id}
                            onClick={() => void changeStatus(product.id, 'published')}>
                            {updatingId === product.id ? 'Guardando…' : 'Volver a publicar'}
                          </button>
                          <button className="text-link" type="button"
                            onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button>
                        </>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p>Aún no tienes publicaciones.</p>
              )}
            </section>
          </>
        )}
      </div>

      {withdrawTarget && (
        <ConfirmActionDialog
          title="Retirar publicación"
          accessibleName="Retirar publicación"
          description={`¿Quieres retirar "${withdrawTarget.title}"? Dejará de aparecer en el catálogo.`}
          confirmLabel="Confirmar retiro"
          busyLabel="Retirando…"
          busy={updatingId === withdrawTarget.id}
          error={withdrawError}
          onCancel={() => setWithdrawTarget(null)}
          onConfirm={() => void confirmWithdrawal()}
        />
      )}
    </ProducerShell>
  )
}

// ── Router ────────────────────────────────────────────────────────────────────

// ── Historias del productor ───────────────────────────────────────────────────

const STORY_STATUS: Record<OwnedProducerStory['status'], { label: string; tone: string }> = {
  pending: { label: 'En revisión', tone: 'pending' },
  published: { label: 'Publicada', tone: 'published' },
  rejected: { label: 'Requiere cambios', tone: 'rejected' },
}
const STORY_BODY_MIN = 80
const STORY_BODY_MAX = 4000

function ProducerStoryForm({ story, onSaved, onCancel }: { story: OwnedProducerStory | null; onSaved: (story: OwnedProducerStory) => void; onCancel?: () => void }) {
  const [title, setTitle] = useState(story?.title ?? '')
  const [quote, setQuote] = useState(story?.quote ?? '')
  const [body, setBody] = useState(story?.body ?? '')
  const [videoUrl, setVideoUrl] = useState(story?.video ? (story.video.provider === 'youtube' ? `https://youtu.be/${story.video.id}` : `https://vimeo.com/${story.video.id}`) : '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(story?.thumbnail_url ?? null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (photo && photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview) }, [photo, photoPreview])

  async function choosePhoto(file: File | undefined) {
    if (!file) return
    const optimized = await compressProductPhoto(file)
    setPhoto(optimized)
    setRemovePhoto(false)
    setPhotoPreview(URL.createObjectURL(optimized))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (body.trim().length < STORY_BODY_MIN) { setError(`Cuéntanos un poco más: la historia necesita al menos ${STORY_BODY_MIN} caracteres.`); return }
    setSaving(true)
    setError('')
    const form = new FormData()
    form.set('title', title)
    form.set('quote', quote)
    form.set('body', body)
    form.set('video_url', videoUrl)
    if (photo) form.set('image', photo)
    if (removePhoto) form.set('remove_image', '1')
    try {
      onSaved(await saveMyStory(form, story?.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar tu historia.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ValidatedForm className="auth-form story-form" onSubmit={(event) => void submit(event)} aria-busy={saving}>
      <label className="form-field"><span className="form-field__label">Título de tu historia</span>
        <input name="title" required minLength={5} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Tres generaciones sembrando café en Boquete" />
      </label>
      <label className="form-field"><span className="form-field__label">Una frase que te represente <small>(opcional)</small></span>
        <input name="quote" maxLength={220} value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="Ej. Lo que sembramos con cariño se nota en cada taza." />
        <span className="form-field__hint">Se muestra destacada, como una cita.</span>
      </label>
      <label className="form-field"><span className="form-field__label">Tu historia</span>
        <textarea name="body" required minLength={STORY_BODY_MIN} maxLength={STORY_BODY_MAX} rows={10} value={body} onChange={(event) => setBody(event.target.value)} placeholder="¿Cómo empezaste? ¿Qué hace especial lo que produces? ¿Qué retos has superado y cómo sigues adelante?" />
        <span className="form-field__hint">{body.trim().length}/{STORY_BODY_MAX} caracteres · mínimo {STORY_BODY_MIN}. Deja una línea en blanco para separar párrafos.</span>
      </label>
      <label className="form-field"><span className="form-field__label">Video <small>(opcional)</small></span>
        <input name="video_url" type="url" inputMode="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtu.be/… o https://vimeo.com/…" />
        <span className="form-field__hint">Sube tu video a YouTube o Vimeo y pega aquí el enlace.</span>
      </label>
      <div className="form-field">
        <span className="form-field__label">Foto <small>(opcional)</small></span>
        <div className="story-form__photo">
          {photoPreview && !removePhoto ? <img src={photoPreview} alt="Vista previa de la foto de tu historia" /> : <span className="story-form__photo-empty"><Camera size={26} aria-hidden="true" /></span>}
          <div className="story-form__photo-actions">
            <label className="button button--outline button--small">{photoPreview && !removePhoto ? 'Cambiar foto' : 'Elegir foto'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void choosePhoto(event.target.files?.[0])} /></label>
            {photoPreview && !removePhoto && <button className="text-link" type="button" onClick={() => { setPhoto(null); setPhotoPreview(null); setRemovePhoto(Boolean(story?.thumbnail_url)) }}>Quitar foto</button>}
            <small>JPG, PNG o WEBP de al menos 300 × 300 px.</small>
          </div>
        </div>
      </div>
      {error && <p className="form-field__error" role="alert">{error}</p>}
      <p className="story-form__notice"><AlertCircle size={16} aria-hidden="true" /> Revisaremos tu historia antes de publicarla. Si editas una historia publicada, volverá a revisión.</p>
      <div className="reg-step-nav">
        {onCancel && <button className="button button--quiet" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>}
        <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Enviando…' : story ? 'Guardar y enviar a revisión' : 'Enviar a revisión'} {!saving && <ArrowRight size={16} aria-hidden="true" />}</button>
      </div>
    </ValidatedForm>
  )
}

function ProducerStoriesPage() {
  const [stories, setStories] = useState<OwnedProducerStory[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<OwnedProducerStory | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OwnedProducerStory | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    void getMyStories().then((items) => { setStories(items); if (!items.length) setEditing('new') })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar tus historias.'))
  }, [])

  function saved(story: OwnedProducerStory) {
    setStories((current) => current ? [story, ...current.filter((item) => item.id !== story.id)] : [story])
    setEditing(null)
    setNotice('¡Gracias por compartir! Tu historia quedó en revisión y te avisaremos cuando se publique.')
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteMyStory(deleteTarget.id)
      setStories((current) => current?.filter((item) => item.id !== deleteTarget.id) ?? null)
      setNotice('Historia retirada.')
      setDeleteTarget(null)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'No pudimos retirar la historia.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ProducerShell>
      <div className="producer-dash producer-stories">
        <div className="producer-dash__greeting">
          <div>
            <p className="eyebrow eyebrow--quiet">MIS HISTORIAS</p>
            <h1>Comparte tu historia</h1>
            <p className="producer-stories__lead">Cuéntale a los compradores quién eres, cómo trabajas y qué te mueve. Las historias aparecen en la página <Link to="/historias">Historias</Link> y en tu perfil.</p>
          </div>
          {editing === null && <button className="button button--primary" type="button" onClick={() => { setNotice(''); setEditing('new') }}><Plus size={16} aria-hidden="true" /> Nueva historia</button>}
        </div>

        {notice && <p className="producer-stories__notice" role="status"><CheckCircle2 size={18} aria-hidden="true" /> {notice}</p>}
        {error && <div className="empty-products" role="alert"><strong>{error}</strong></div>}

        {editing !== null && (
          <div className="producer-stories__editor">
            <section className="producer-card">
              <h2>{editing === 'new' ? 'Nueva historia' : 'Editar historia'}</h2>
              <ProducerStoryForm key={editing === 'new' ? 'new' : editing.id} story={editing === 'new' ? null : editing} onSaved={saved} onCancel={stories?.length ? () => setEditing(null) : undefined} />
            </section>
            <aside className="producer-stories__tips">
              <h3>Ideas para tu historia</h3>
              <ul>
                <li>¿Cómo y cuándo empezaste? ¿Quién te enseñó?</li>
                <li>¿Qué hace especial tu producto o tu forma de trabajar?</li>
                <li>¿Qué retos has vivido y cómo sigues adelante?</li>
                <li>¿Qué te gustaría que supieran quienes te compran?</li>
              </ul>
              <p>Un video corto grabado con el celular funciona muy bien: muéstranos tu finca, tu taller o tu cosecha.</p>
            </aside>
          </div>
        )}

        {stories === null && !error ? <p role="status">Cargando tus historias…</p> : stories && stories.length > 0 && (
          <ul className="producer-stories__list">
            {stories.map((story) => (
              <li key={story.id} className="producer-stories__item">
                {story.thumbnail_url ? <img src={story.thumbnail_url} alt="" /> : <span className="producer-stories__thumb" aria-hidden="true"><Package size={22} /></span>}
                <div className="producer-stories__item-copy">
                  <span className={`status-pill producer-stories__status producer-stories__status--${STORY_STATUS[story.status].tone}`}>{STORY_STATUS[story.status].label}</span>
                  <h3>{story.title}</h3>
                  <p>{story.body.slice(0, 140)}{story.body.length > 140 ? '…' : ''}</p>
                  {story.status === 'rejected' && story.review_note && <p className="producer-stories__review"><AlertCircle size={15} aria-hidden="true" /> Comentario del equipo: {story.review_note}</p>}
                </div>
                <div className="producer-stories__item-actions">
                  {story.status === 'published' && <Link className="text-link" to={`/historias/${story.id}`}>Ver publicada <ChevronRight size={15} aria-hidden="true" /></Link>}
                  <button className="button button--outline button--small" type="button" onClick={() => { setNotice(''); setEditing(story) }}>Editar</button>
                  <button className="text-link producer-stories__delete" type="button" onClick={() => { setDeleteError(''); setDeleteTarget(story) }}>Retirar</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {deleteTarget && (
          <ConfirmActionDialog
            title="¿Retirar esta historia?"
            description={`"${deleteTarget.title}" dejará de mostrarse y se eliminará de tu cuenta.`}
            confirmLabel="Sí, retirar"
            busyLabel="Retirando…"
            busy={deleting}
            error={deleteError}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => void confirmDelete()}
          />
        )}
      </div>
    </ProducerShell>
  )
}

function ProducerRoutes() {
  return (
    <Routes>
      <Route path="/mi-panel" element={<ProducerDashboard />} />
      <Route path="/mis-productos" element={<ProducerProductsPage />} />
      <Route path="/mis-productos/nuevo" element={<ProducerProductForm />} />
      <Route path="/mis-productos/:id/editar" element={<ProducerProductForm editing />} />
      <Route path="/mi-perfil" element={<ProducerProfilePage />} />
      <Route path="/mis-historias" element={<ProducerStoriesPage />} />
      <Route path="/verificar" element={<Navigate to="/mi-perfil" replace />} />
      <Route path="*" element={<InfoPage title="No encontramos esta página" description="Revisa la dirección o vuelve al catálogo para explorar las ofertas." />} />
    </Routes>
  )
}

export default ProducerRoutes
