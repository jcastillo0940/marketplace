import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight, LayoutDashboard, LogOut, Menu, Package, Plus, User, X } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ActivitySelect from '../components/ActivitySelect'
import LocationPicker from '../components/LocationPicker'
import TextAreaField from '../components/TextAreaField'
import ValidatedForm from '../components/ValidatedForm'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { ProducerReviewSubmission } from '../components/ProducerReviewSubmission'
import { compressProductPhoto } from '../api/photo-optimizer'
import {
  clearSessionCache, getProducerAppeals, getProducerMetrics, getProducerDashboard,
  getProducerProduct, getSessionUser, listCategories, listLocations, logoutUser,
  renewProducerProduct, saveProductDraft, startPhoneVerification, submitProducerAppeal,
  transitionProducerProduct, updateProduct, updateProducerProfile, verifyProducerPhone,
  type ProducerAppealState, type ProducerDashboardProduct, type ProducerMetrics, type PublicLocation,
} from '../api/client'
import { SiteFooter, SiteHeader } from './shared/SiteChrome'
import { InfoPage } from './shared/InfoPage'

// ── Sidebar shell shared by all producer pages ────────────────────────────────

function ProducerShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    void getSessionUser().then((u) => { if (u) setUserName(u.name) })
  }, [])

  async function handleLogout() {
    try { await logoutUser() } catch { /* ignore network errors on logout */ }
    clearSessionCache()
    void navigate('/ingresar')
  }

  const navLinks = [
    { to: '/mi-panel', Icon: LayoutDashboard, label: 'Inicio' },
    { to: '/mis-productos', Icon: Package, label: 'Mis publicaciones' },
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
            <span className="producer-sidebar__brand-name">El Empujoncito</span>
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
          <Link to="/" className="producer-topbar__brand">El Empujoncito</Link>
          <Link to="/mis-productos/nuevo" className="button button--primary button--small producer-topbar__publish" aria-label="Publicar nuevo producto">
            <Plus size={15} aria-hidden="true" />
            <span>Publicar</span>
          </Link>
        </header>
        <main className="producer-content">
          {children}
        </main>
      </div>
    </div>
  )
}

// ── Profile / settings page ───────────────────────────────────────────────────

function ProducerProfilePage({ verificationOnly = false }: { verificationOnly?: boolean }) {
  const [challenge, setChallenge] = useState<{ phone: string; code?: string } | null>(null)
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getProducerDashboard>> | null>(null)
  const [locations, setLocations] = useState<PublicLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locationsError, setLocationsError] = useState(false)
  const [locationsRetry, setLocationsRetry] = useState(0)
  const [message, setMessage] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    void getProducerDashboard().then(setDashboard)
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Inicia sesión para editar tu perfil.'))
  }, [])

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

  const completionChecks = profile ? [
    { done: Boolean(profile.description?.trim()), label: 'Descripción del negocio' },
    { done: Boolean(profile.activity), label: 'Tipo de actividad' },
    { done: Boolean(profile.location_id), label: 'Ubicación aproximada' },
    { done: profile.contact_level === 'contact_confirmed', label: 'Teléfono verificado' },
  ] : []
  const doneCnt = completionChecks.filter((c) => c.done).length
  const pct = completionChecks.length ? Math.round(doneCnt / completionChecks.length * 100) : 0
  const allDone = pct === 100

  return (
    <ProducerShell>
      <div className="producer-settings">
        <div className="producer-settings__header">
          <p className="eyebrow eyebrow--quiet">CONFIGURACIÓN</p>
          <h1>Mi perfil</h1>
        </div>

        {/* ── Completion strip ── */}
        {profile && (
          <div className={`producer-completion-strip${allDone ? ' producer-completion-strip--complete' : ''}`}>
            <div className="producer-completion-strip__progress">
              <div className="producer-completion-strip__bar-wrap">
                <div className="producer-completion-strip__bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="producer-completion-strip__pct">{pct}%</span>
            </div>
            <div className="producer-completion-strip__items">
              {completionChecks.map(({ done, label }) => (
                <span key={label} className={`producer-completion-item${done ? ' producer-completion-item--done' : ''}`}>
                  {done
                    ? <CheckCircle2 size={13} aria-label="Completado" />
                    : <span className="producer-completion-dot" aria-label="Pendiente" />}
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {!dashboard ? (
          <p role="status">{message || 'Cargando tus datos…'}</p>
        ) : !profile ? (
          <p role="alert">No encontramos un perfil de productor asociado a esta cuenta.</p>
        ) : (
          <>
            {/* ── Section 1: Public info ── */}
            {!verificationOnly && (
              <section className="producer-settings__section">
                <div className="producer-settings__section-head">
                  <User size={18} aria-hidden="true" />
                  <h2>Información pública</h2>
                </div>
                <p className="producer-settings__section-help">
                  Tu nombre, actividad, descripción y ubicación se muestran en tu perfil del catálogo.
                  No incluyas una dirección exacta.
                </p>
                <ValidatedForm
                  className="auth-form producer-product-form"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setSaveSuccess(false)
                    setMessage('')
                    try {
                      await updateProducerProfile(new FormData(event.currentTarget))
                      setSaveSuccess(true)
                      const data = await getProducerDashboard()
                      setDashboard(data)
                      setChallenge(null)
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el perfil.')
                    }
                  }}
                >
                  <label>Nombre público
                    <input name="public_name" defaultValue={profile.public_name} required maxLength={120} />
                  </label>

                  <label>Actividad
                    <ActivitySelect defaultValue={profile.activity} />
                  </label>

                  <label>Historia de tu negocio
                    <textarea
                      name="description"
                      defaultValue={profile.description ?? ''}
                      rows={5}
                      maxLength={2000}
                      className="resize-none"
                      style={{ resize: 'none' }}
                      placeholder="Cuéntales a los compradores quién eres, qué produces y cómo trabajas…"
                    />
                    <small>Esta descripción aparece en tu perfil público. Máximo 2 000 caracteres.</small>
                  </label>

                  <fieldset className="location-fieldset">
                    <legend>Ubicación aproximada</legend>
                    <LocationPicker
                      locations={locations}
                      value={profile.location_id}
                      idPrefix="profile-location"
                      disabled={locationsLoading || locationsError || locations.length === 0}
                    />
                    <small>Elige provincia, distrito o corregimiento.</small>
                  </fieldset>

                  {locationsLoading && <p role="status">Cargando localidades…</p>}
                  {locationsError && (
                    <p role="alert">
                      No pudimos cargar las localidades.{' '}
                      <button className="text-link" type="button" onClick={() => setLocationsRetry((n) => n + 1)}>
                        Reintentar
                      </button>
                    </p>
                  )}

                  {saveSuccess && <p role="status" className="form-help" style={{ color: '#1a7f37' }}>✓ Perfil guardado correctamente.</p>}
                  {message && <p role="alert" className="producer-product-form__error">{message}</p>}

                  <div className="producer-settings__actions">
                    <button className="button button--primary" type="submit">Guardar perfil</button>
                    {profile.slug && (
                      <Link className="text-link" to={`/productores/${profile.slug}`} target="_blank" rel="noopener noreferrer">
                        Ver mi perfil público →
                      </Link>
                    )}
                  </div>
                </ValidatedForm>
              </section>
            )}

            {/* ── Section 2: Contact verification ── */}
            <section className="producer-settings__section" id="verificar">
              <div className="producer-settings__section-head">
                <CheckCircle2 size={18} aria-hidden="true" />
                <h2>Contacto y verificación</h2>
              </div>

              {profile.contact_level === 'contact_confirmed' ? (
                <div className="producer-settings__verified">
                  <CheckCircle2 size={22} style={{ color: '#1a7f37', flexShrink: 0 }} aria-hidden="true" />
                  <div>
                    <strong>Teléfono verificado</strong>
                    <p>Tu número está confirmado y aparece en tu perfil cuando publicas una oferta.</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="producer-settings__section-help">
                    Confirma tu número para que los compradores puedan contactarte directamente.
                    El teléfono solo aparece en tu perfil después de verificarlo.
                  </p>
                  <div className="producer-settings__phone-row">
                    <div>
                      <p style={{ margin: '0 0 .5rem', fontWeight: 600 }}>Teléfono registrado</p>
                      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.05rem' }}>{profile.phone_private}</p>
                      {!verificationOnly && (
                        <small style={{ color: 'var(--color-muted)' }}>
                          Para cambiar el número, guarda el perfil primero con el nuevo teléfono.
                        </small>
                      )}
                    </div>
                    <button
                      className="button button--outline"
                      type="button"
                      onClick={async () => {
                        setMessage('')
                        try {
                          const result = await startPhoneVerification()
                          setChallenge({ phone: profile.phone_private, code: result.development_code })
                          setMessage(result.development_code
                            ? `Código de desarrollo: ${result.development_code}`
                            : 'Enviamos un código al número registrado.')
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la verificación.')
                        }
                      }}
                    >
                      Enviar código
                    </button>
                  </div>

                  {challenge && (
                    <ValidatedForm
                      className="auth-form"
                      style={{ marginTop: '1.25rem' }}
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const code = String(new FormData(event.currentTarget).get('code'))
                        setMessage('')
                        try {
                          await verifyProducerPhone(challenge.phone, code)
                          setDashboard(await getProducerDashboard())
                          setMessage('')
                          setChallenge(null)
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : 'No se pudo verificar el teléfono.')
                        }
                      }}
                    >
                      <label>Código de seis dígitos
                        <input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus />
                      </label>
                      <button className="button button--primary" type="submit">Confirmar teléfono</button>
                    </ValidatedForm>
                  )}

                  {message && <p role="status" style={{ marginTop: '.75rem' }}>{message}</p>}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </ProducerShell>
  )
}

// ── Product form (full-page — keeps SiteHeader for space) ─────────────────────

function ProducerProductForm({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [categoriesFromApi, setCategoriesFromApi] = useState<Array<{ id: number; name: string }>>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesLoadError, setCategoriesLoadError] = useState('')
  const [categoriesRetry, setCategoriesRetry] = useState(0)
  const [initial, setInitial] = useState<Awaited<ReturnType<typeof getProducerProduct>> | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([])

  const [pvTitle, setPvTitle] = useState('')
  const [pvDesc, setPvDesc] = useState('')
  const [pvUnit, setPvUnit] = useState('')
  const [pvPrice, setPvPrice] = useState('')
  const [pvCurrency, setPvCurrency] = useState('PAB')
  const [pvPriceType, setPvPriceType] = useState('contact')
  const [pvNewImgUrls, setPvNewImgUrls] = useState<string[]>([])
  const [pvImgIdx, setPvImgIdx] = useState(0)
  const pvObjUrls = useRef<string[]>([])

  useEffect(() => {
    if (editing) {
      void getProducerProduct(id)
        .then((product) => { setInitial(product); setSelectedCategoryId(String(product.category_id)) })
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'No pudimos cargar esta publicación.'))
    }
  }, [editing, id])

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
    if (initial) {
      setPvTitle(initial.title)
      setPvDesc(initial.description ?? '')
      setPvUnit(initial.unit)
      setPvPrice(initial.price_amount != null ? String(initial.price_amount) : '')
      setPvCurrency(initial.currency ?? 'PAB')
      setPvPriceType(initial.price_type ?? 'contact')
    }
  }, [initial])

  useEffect(() => () => { pvObjUrls.current.forEach(URL.revokeObjectURL) }, [])

  function validatePhotos(input: HTMLInputElement): string {
    const files = Array.from(input.files ?? [])
    const total = (initial?.images.length ?? 0) + files.length
    const error = total > 5
      ? 'Conserva o agrega un máximo de cinco fotografías.'
      : files.find((file) => file.size > 5 * 1024 * 1024)
        ? 'Cada fotografía debe pesar 5 MB o menos.'
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

  function pvPriceLabel() {
    if (pvPriceType === 'contact' || !pvPrice) return 'Consultar'
    const n = parseFloat(pvPrice)
    if (isNaN(n)) return 'Consultar'
    const prefix = pvCurrency === 'USD' ? 'US$' : 'B/.'
    return pvPriceType === 'from' ? `Desde ${prefix} ${n.toFixed(2)}` : `${prefix} ${n.toFixed(2)}`
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
    const priceTypeSelect = formElement.elements.namedItem('price_type') as HTMLSelectElement | null
    const priceAmountInput = formElement.elements.namedItem('price_amount') as HTMLInputElement | null
    if (priceTypeSelect && priceAmountInput && ['fixed', 'from'].includes(priceTypeSelect.value)) {
      if (!priceAmountInput.value.trim()) {
        priceAmountInput.setCustomValidity('Ingresa el precio para este tipo de publicación.')
        priceAmountInput.reportValidity()
        return
      }
    }
    if (priceAmountInput) priceAmountInput.setCustomValidity('')
    setSaveError('')
    setSaving(true)
    try {
      const form = new FormData(formElement)
      if (photoInput?.files?.length) {
        setMessage('Preparando tus fotografías…')
        form.delete('images[]')
        for (const photo of Array.from(photoInput.files)) {
          form.append('images[]', await compressProductPhoto(photo))
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
          : 'Guardamos los cambios. Puedes enviar la publicación a revisión desde tu panel.')
      } else {
        await saveProductDraft(form)
        navigate('/mis-productos', { state: { notice: 'Tu anuncio fue enviado a revisión. El equipo lo aprobará pronto y aparecerá en el catálogo.' } })
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo guardar el borrador.'
      setSaveError(detail)
      setMessage('')
    } finally {
      setSaving(false)
    }
  }

  const formDisabled = saving || (editing && !initial) || categoriesLoading || Boolean(categoriesLoadError) || categoriesFromApi.length === 0

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="product-form-page page-shell">
        <div className="product-form-layout">
          <section className="product-form-col">
            <p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p>
            <h1 className="product-form-col__title">{editing ? 'Edita tu oferta' : 'Publica un producto'}</h1>
            <ValidatedForm className="auth-form producer-product-form" onSubmit={handleSubmit} aria-busy={saving}>
              {!editing || initial ? (
                <>
                  <label>Nombre del producto
                    <input name="title" defaultValue={initial?.title} minLength={3} maxLength={120} required
                      onChange={(e) => setPvTitle(e.currentTarget.value)} />
                  </label>

                  <label>Categoría
                    <select name="category_id" value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.currentTarget.value)}
                      disabled={categoriesLoading || Boolean(categoriesLoadError) || categoriesFromApi.length === 0} required>
                      <option value="">{categoriesLoading ? 'Cargando categorías…' : categoriesFromApi.length ? 'Selecciona una categoría' : 'No hay categorías disponibles'}</option>
                      {categoriesFromApi.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </label>
                  {categoriesLoading && <p role="status">Cargando categorías disponibles…</p>}
                  {categoriesLoadError && <div className="catalog-reference-error" role="alert"><span>No pudimos cargar las categorías. {categoriesLoadError}</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((n) => n + 1)}>Reintentar</button></div>}
                  {!categoriesLoading && !categoriesLoadError && categoriesFromApi.length === 0 && <div className="catalog-reference-error" role="alert"><span>No hay categorías activas para publicar todavía.</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((n) => n + 1)}>Volver a consultar</button></div>}

                  <label>Descripción
                    <textarea name="description" defaultValue={initial?.description} minLength={20} maxLength={3000} required rows={5}
                      className="resize-none" style={{ resize: 'none' }}
                      onChange={(e) => setPvDesc(e.currentTarget.value)} />
                  </label>

                  <div className="form-row">
                    <label>Unidad de venta
                      <input name="unit" defaultValue={initial?.unit} placeholder="libra, docena…" maxLength={40} required
                        onChange={(e) => setPvUnit(e.currentTarget.value)} />
                    </label>
                    <label>Stock disponible (opcional)
                      <input name="stock_quantity" defaultValue={initial?.stock_quantity ?? ''} type="number" min="0" step="0.01" />
                      <small>Déjalo vacío si prefieres no indicar cantidad.</small>
                    </label>
                  </div>

                  <div className="form-row">
                    <label>Precio (opcional)
                      <input name="price_amount" defaultValue={initial?.price_amount ?? ''} type="number" min="0" step="0.01"
                        onChange={(e) => setPvPrice(e.currentTarget.value)} />
                    </label>
                    <label>Moneda
                      <select name="currency" defaultValue={initial?.currency ?? 'PAB'}
                        onChange={(e) => setPvCurrency(e.currentTarget.value)}>
                        <option value="PAB">B/. · Balboa</option>
                        <option value="USD">US$ · Dólar estadounidense</option>
                      </select>
                    </label>
                  </div>

                  <label>Tipo de precio
                    <select name="price_type" defaultValue={initial?.price_type ?? 'contact'}
                      onChange={(e) => setPvPriceType(e.currentTarget.value)}>
                      <option value="contact">Consultar</option>
                      <option value="fixed">Precio fijo</option>
                      <option value="from">Desde este precio</option>
                    </select>
                  </label>

                  <label>Entrega o recogida
                    <input name="delivery_method" defaultValue={initial?.delivery_method} maxLength={120} required />
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
                    <small id="product-photos-help">JPG, PNG o WebP · hasta cinco fotografías · máximo 5 MB por archivo. Las optimizamos al guardar.</small>
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
              <button className="button button--primary" type="submit" disabled={formDisabled} aria-busy={saving}>
                {saving ? 'Enviando…' : saveError ? 'Reintentar' : editing ? 'Guardar cambios' : 'Enviar a revisión'}
              </button>
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
                    {pvPriceType !== 'contact' && pvPrice && pvUnit && <span>por {pvUnit}</span>}
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
      </main>
      <SiteFooter />
    </div>
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
    { done: dashboard.profile.contact_level === 'contact_confirmed', label: 'Verifica tu número de teléfono', href: '/mi-perfil#verificar' },
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

function ProducerRoutes() {
  return (
    <Routes>
      <Route path="/mi-panel" element={<ProducerDashboard />} />
      <Route path="/mis-productos" element={<ProducerProductsPage />} />
      <Route path="/mis-productos/nuevo" element={<ProducerProductForm />} />
      <Route path="/mis-productos/:id/editar" element={<ProducerProductForm editing />} />
      <Route path="/mi-perfil" element={<ProducerProfilePage />} />
      <Route path="/verificar" element={<Navigate to="/mi-perfil" replace />} />
      <Route path="*" element={<InfoPage title="No encontramos esta página" description="Revisa la dirección o vuelve al catálogo para explorar las ofertas." />} />
    </Routes>
  )
}

export default ProducerRoutes
