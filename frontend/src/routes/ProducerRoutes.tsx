import { Route, Routes } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import LocationPicker from '../components/LocationPicker'
import TextAreaField from '../components/TextAreaField'
import ValidatedForm from '../components/ValidatedForm'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { ProducerReviewSubmission } from '../components/ProducerReviewSubmission'
import { compressProductPhoto } from '../api/photo-optimizer'
import { getProducerAppeals, getProducerMetrics, getProducerDashboard, getProducerProduct, listCategories, listLocations, renewProducerProduct, saveProductDraft, startPhoneVerification, submitProducerAppeal, transitionProducerProduct, updateProduct, updateProducerProfile, verifyProducerPhone, type ProducerAppealState, type ProducerDashboardProduct, type ProducerMetrics, type PublicLocation } from '../api/client'
import { SiteFooter, SiteHeader } from './shared/SiteChrome'
import { InfoPage } from './shared/InfoPage'

function ProducerProfilePage({ verificationOnly = false }: { verificationOnly?: boolean }) {
  const [challenge, setChallenge] = useState<{ phone: string; code?: string } | null>(null)
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getProducerDashboard>> | null>(null)
  const [locations, setLocations] = useState<PublicLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locationsError, setLocationsError] = useState(false)
  const [locationsRetry, setLocationsRetry] = useState(0)
  const [message, setMessage] = useState('')
  useEffect(() => { void getProducerDashboard().then(setDashboard).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Inicia sesión para editar tu perfil.')) }, [])
  useEffect(() => {
    let active = true
    setLocationsLoading(true)
    setLocationsError(false)
    void listLocations().then((items) => { if (active) setLocations(items) }).catch(() => { if (active) { setLocations([]); setLocationsError(true) } }).finally(() => { if (active) setLocationsLoading(false) })
    return () => { active = false }
  }, [locationsRetry])
  return <div className="app-shell"><SiteHeader /><main className="access-page page-shell"><div className="access-card"><p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p><h1>{verificationOnly ? 'Verifica tu contacto' : 'Mi perfil público'}</h1>{!dashboard ? <p role="status">{message || 'Cargando tus datos…'}</p> : dashboard.profile ? <>{!verificationOnly && <ValidatedForm className="auth-form producer-product-form" onSubmit={async (event) => { event.preventDefault(); try { await updateProducerProfile(new FormData(event.currentTarget)); setMessage('Guardamos tu perfil. Si cambiaste el teléfono, tus ofertas dejarán de aparecer en el catálogo hasta verificar el nuevo número.'); const data = await getProducerDashboard(); setDashboard(data); setChallenge(null) } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el perfil.') } }}><p className="form-help">El nombre público, actividad, descripción y ubicación general se muestran a quienes visitan tu perfil. El teléfono aparece solo después de verificarlo. No incluyas una dirección exacta en la descripción.</p><label>Nombre público<input name="public_name" defaultValue={dashboard.profile.public_name} required maxLength={120} /></label><label>Actividad<input name="activity" defaultValue={dashboard.profile.activity ?? ''} maxLength={120} placeholder="Cultivo, artesanía, emprendimiento…" /></label><label>Descripción<textarea name="description" defaultValue={dashboard.profile.description ?? ''} rows={5} maxLength={2000} className="resize-none" style={{ resize: 'none' }} /></label><fieldset className="location-fieldset"><legend>Ubicación aproximada</legend><LocationPicker locations={locations} value={dashboard.profile.location_id} idPrefix="profile-location" disabled={locationsLoading || locationsError || locations.length === 0} /><small>Elige provincia, distrito o corregimiento. No compartas una dirección exacta.</small></fieldset>{locationsLoading && <p role="status">Cargando localidades…</p>}{locationsError && <p role="alert">No pudimos cargar las localidades. Reintenta cuando quieras cambiar tu ubicación; los demás datos pueden guardarse y se conservará la localidad actual. <button className="text-link" type="button" onClick={() => setLocationsRetry((value) => value + 1)}>Reintentar localidades</button></p>}{!locationsLoading && !locationsError && locations.length === 0 && <p role="alert">No hay localidades activas para editar el perfil.</p>}<label>Teléfono privado de contacto<input name="phone_private" type="tel" autoComplete="tel" placeholder="6000-1234" maxLength={40} defaultValue={dashboard.profile.phone_private} required /><small>Panamá: ocho dígitos, por ejemplo 6000-1234. Para otro país, incluye el prefijo internacional, por ejemplo +1 202 555 0123.</small></label><p>Estado del contacto: {dashboard.profile.contact_level === 'unverified' ? 'sin verificar; no aparece en tu perfil público' : 'verificado'}</p><button className="button button--primary" type="submit">Guardar perfil</button><Link className="text-link" to={`/productores/${dashboard.profile.slug}`}>Ver mi perfil público</Link></ValidatedForm>}{verificationOnly && <p>Confirma que tienes acceso al teléfono antes de mostrarlo en tu perfil público.</p>}<section className="phone-verification"><h2>Verificación de contacto</h2><p>El número solo se muestra después de confirmar que tienes acceso a él.</p>{dashboard.profile.contact_level === 'unverified' ? <><button className="button button--outline" type="button" onClick={async () => { try { const result = await startPhoneVerification(); setChallenge({ phone: dashboard.profile!.phone_private, code: result.development_code }); setMessage(result.development_code ? `Código de desarrollo: ${result.development_code}` : 'Enviamos un código al teléfono asociado.') } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la verificación.') } }}>Solicitar código</button>{challenge && <ValidatedForm className="auth-form" onSubmit={async (event) => { event.preventDefault(); const code = String(new FormData(event.currentTarget).get('code')); try { await verifyProducerPhone(challenge.phone, code); setDashboard(await getProducerDashboard()); setMessage('Teléfono verificado. Ahora puede mostrarse en tu perfil público.'); setChallenge(null) } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo verificar el teléfono.') } }}><label>Código de seis dígitos<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label><button className="button button--primary" type="submit">Confirmar teléfono</button></ValidatedForm>}</> : <span className="status-pill status-pill--published">Teléfono confirmado</span>}{message && <p role="status">{message}</p>}</section></> : <p role="alert">No encontramos un perfil de productor asociado a esta cuenta.</p>}</div></main><SiteFooter /></div>
}

function ProducerProductForm({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams()
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
  useEffect(() => { if (editing) void getProducerProduct(id).then((product) => { setInitial(product); setSelectedCategoryId(String(product.category_id)) }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'No pudimos cargar esta publicación.')) }, [editing, id])
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

  return <div className="app-shell"><SiteHeader /><main className="access-page page-shell"><ValidatedForm className="access-card auth-form producer-product-form" onSubmit={async (event) => {
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
        setMessage(updated.status === 'pending' ? 'Guardamos los cambios y enviamos la oferta a revisión. No aparecerá en el catálogo hasta que el equipo la apruebe.' : 'Guardamos los cambios. Puedes enviar la publicación a revisión desde tu panel.')
      }
      else { await saveProductDraft(form); setMessage('Guardamos tu borrador. Se publicará después de revisión humana.'); formElement.reset(); if (photoInput) photoInput.value = '' }
    } catch (error) { const detail = error instanceof Error ? error.message : 'No se pudo guardar el borrador.'; setSaveError(detail); setMessage('No pudimos guardar los cambios. Tu información y las fotos siguen en este formulario; comprueba la conexión y reintenta.') }
    finally { setSaving(false) }
  }} aria-busy={saving}>
    <p className="eyebrow eyebrow--quiet">PUBLICACIÓN MANUAL</p><h1>{editing ? 'Edita tu producto' : 'Publica un producto'}</h1><p>Completa la información manualmente y guarda un borrador para continuar luego. La asistencia de IA es una opción futura que se cotizará por separado.</p>
    {!editing || initial ? <>
    <label>Nombre del producto<input name="title" defaultValue={initial?.title} minLength={3} maxLength={120} required /></label>
    <label>Categoría<select name="category_id" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.currentTarget.value)} disabled={categoriesLoading || Boolean(categoriesLoadError) || categoriesFromApi.length === 0} required><option value="">{categoriesLoading ? 'Cargando categorías…' : categoriesFromApi.length ? 'Selecciona una categoría' : 'No hay categorías disponibles'}</option>{categoriesFromApi.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    {categoriesLoading && <p role="status">Cargando categorías disponibles…</p>}
    {categoriesLoadError && <div className="catalog-reference-error" role="alert"><span>No pudimos cargar las categorías. {categoriesLoadError}</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((attempt) => attempt + 1)}>Reintentar</button></div>}
    {!categoriesLoading && !categoriesLoadError && categoriesFromApi.length === 0 && <div className="catalog-reference-error" role="alert"><span>No hay categorías activas para publicar todavía.</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((attempt) => attempt + 1)}>Volver a consultar</button></div>}
    <label>Descripción<textarea name="description" defaultValue={initial?.description} minLength={20} maxLength={3000} required rows={5} className="resize-none" style={{ resize: 'none' }} /></label>
    <div className="form-row"><label>Unidad de venta<input name="unit" defaultValue={initial?.unit} placeholder="libra, docena…" maxLength={40} required /></label><label>Stock disponible (opcional)<input name="stock_quantity" defaultValue={initial?.stock_quantity ?? ''} type="number" min="0" step="0.01" /><small>Déjalo vacío si prefieres no indicar cantidad.</small></label></div>
    <div className="form-row"><label>Precio (opcional)<input name="price_amount" defaultValue={initial?.price_amount ?? ''} type="number" min="0" step="0.01" /></label><label>Moneda<select name="currency" defaultValue={initial?.currency ?? 'PAB'}><option value="PAB">B/. · Balboa</option><option value="USD">US$ · Dólar estadounidense</option></select></label></div>
    <label>Tipo de precio<select name="price_type" defaultValue={initial?.price_type ?? 'contact'}><option value="contact">Consultar</option><option value="fixed">Precio fijo</option><option value="from">Desde este precio</option></select></label>
    <label>Entrega o recogida<input name="delivery_method" defaultValue={initial?.delivery_method} maxLength={120} required /></label>
    {editing && initial && ['published', 'paused', 'sold_out'].includes(initial.status) && <div className="moderation-feedback"><strong>La oferta dejará de aparecer temporalmente.</strong><p>Al guardar, el equipo revisará los cambios y la oferta volverá al catálogo solo después de aprobarla. La fecha de vigencia actual se conserva.</p><label>Motivo del cambio<textarea name="reason" minLength={5} maxLength={1000} required rows={3} className="resize-none" style={{ resize: 'none' }} onChange={(event) => event.currentTarget.setCustomValidity('')} /><small>Explica qué cambió y por qué. Mínimo 5 caracteres.</small></label></div>}
    {editing && initial && initial.images.length > 0 && <section className="existing-product-photos" aria-label="Fotografías actuales"><h2>Fotografías actuales</h2><div className="existing-product-photos__grid">{initial.images.map((image) => <figure className="existing-product-photo" key={image.id}><img src={image.url} alt={image.alt_text ?? initial.title} /><button className="button button--quiet button--small" type="button" aria-label={`Quitar fotografía ${image.position + 1}`} onClick={() => { setRemovedImageIds((ids) => [...ids, image.id]); setInitial((current) => current ? { ...current, images: current.images.filter((item) => item.id !== image.id) } : current) }}>Quitar</button></figure>)}</div><small>Conserva al menos una fotografía para enviar la publicación a revisión.</small></section>}
    <label>Fotografías {editing ? '(opcional: hasta cinco en total)' : '(1 a 5)'}<input name="images[]" type="file" accept="image/jpeg,image/png,image/webp" multiple required={!editing} aria-describedby="product-photos-help product-photos-error" onChange={(event) => { setMessage(''); validatePhotos(event.currentTarget) }} /><small id="product-photos-help">JPG, PNG o WebP · hasta cinco fotografías · máximo 5 MB por archivo. Las optimizamos al guardar.</small>{photoError && <span id="product-photos-error" role="alert">{photoError}</span>}</label>
    {!editing && <p className="form-help">La publicación se guarda como borrador privado. Envíala a revisión cuando esté lista; solo se hará pública después de la aprobación del equipo.</p>}
    </> : <p role="status">Cargando publicación…</p>}
    {saving && <p role="status" aria-live="polite">Preparando y guardando tus fotografías… Mantén esta página abierta mientras terminamos.</p>}
    {saveError && <p className="producer-product-form__error" role="alert">{message} <span className="sr-only">Detalle: {saveError}</span></p>}
    {!saveError && message && <p role="status">{message}</p>}
    <button className="button button--primary" type="submit" disabled={saving || (editing && !initial) || categoriesLoading || Boolean(categoriesLoadError) || categoriesFromApi.length === 0} aria-busy={saving}>{saving ? 'Guardando…' : saveError ? 'Reintentar guardado' : editing ? 'Guardar cambios' : 'Guardar borrador'}</button>
  </ValidatedForm></main><SiteFooter /></div>
}

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
        void getProducerMetrics().then(setProducerMetrics).catch((reason: unknown) => setMetricsError(reason instanceof Error ? reason.message : 'No pudimos cargar tus métricas.')).finally(() => setMetricsLoading(false))
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
    setWithdrawBusy(true); setWithdrawError('')
    try { await transitionProducerProduct(withdrawTarget.id, 'withdrawn'); setDashboard((current) => current ? { ...current, products: current.products.map((item) => item.id === withdrawTarget.id ? { ...item, status: 'withdrawn' } : item) } : current); setWithdrawNotice('Publicación retirada.'); setWithdrawTarget(null) }
    catch (reason) { setWithdrawError(reason instanceof Error ? `${reason.message} Puedes volver a intentarlo.` : 'No se pudo retirar la publicación. Puedes volver a intentarlo.') }
    finally { setWithdrawBusy(false) }
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

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p><h1>{dashboard ? `Hola, ${dashboard.user.name}` : 'Mi panel'}</h1>{error ? <div className="empty-products" role="alert"><strong>{error}</strong><Link className="button button--primary" to="/ingresar">Ingresar</Link></div> : !dashboard ? <p role="status">Cargando tus publicaciones…</p> : <>

    {showAppealHistory && <section className="suspension-notice" aria-labelledby="suspension-title"><p className="eyebrow eyebrow--quiet">REVISIÓN DE CUENTA</p><h2 id="suspension-title">{profileSuspended ? 'Tu perfil está suspendido' : 'Historial de revisión de suspensión'}</h2>{profileSuspended && <><p><strong>Motivo comunicado:</strong> {dashboard.profile?.suspension_reason || 'El equipo de moderación registró una suspensión para tu perfil.'}</p><p>Si consideras que hubo un error, puedes solicitar una revisión humana. La decisión quedará registrada y recibirás aquí el resultado.</p><p>Mientras esté suspendido, puedes preparar borradores o retirar ofertas, pero no enviarlas a revisión ni volver a publicarlas.</p></>}{appealLoading && <p role="status">Consultando si tienes una solicitud en revisión…</p>}{appealLoadError && <div role="alert"><p>No pudimos cargar tu historial de revisión.</p><button className="button button--outline" type="button" onClick={() => setAppealRetry((attempt) => attempt + 1)}>Intentar de nuevo</button></div>}{appealState && <>{openAppeal ? <p className="status-pill status-pill--pending">Tu solicitud está en revisión desde {new Date(openAppeal.submitted_at).toLocaleDateString('es-PA')}.</p> : appealState.appeals.map((appeal) => <article className="appeal-history" key={appeal.id}><strong>{appeal.status === 'reinstated' ? 'Perfil restablecido' : appeal.status === 'upheld' ? 'Suspensión confirmada' : 'Solicitud pendiente'}</strong><p>{appeal.resolution_note ?? appeal.reason}</p>{reinstatedAppeal?.id === appeal.id && metricsLoading && <p role="status">Consultando qué publicaciones siguen en revisión…</p>}{reinstatedAppeal?.id === appeal.id && metricsError && <p role="alert">No pudimos consultar el estado de tus publicaciones. Revisa <Link to="/mis-productos">Mis productos</Link> o vuelve a cargar el panel.</p>}{reinstatedAppeal?.id === appeal.id && producerMetrics && pendingProducts > 0 && <p className="moderation-feedback" role="status">Tu perfil está activo. {pendingProducts} {pendingProducts === 1 ? 'oferta está' : 'ofertas están'} en revisión humana antes de reaparecer. Las ofertas vencidas deberán renovarse si siguen disponibles.</p>}</article>)}{profileSuspended && !appealLoading && !appealLoadError && !openAppeal && <ValidatedForm className="auth-form" noValidate onSubmit={(event) => void sendAppeal(event)}><TextAreaField id="producer-appeal-reason" name="reason" label="Explica por qué solicitas la revisión" value={appealDraft} onChange={(value) => { setAppealDraft(value); setAppealError('') }} error={appealError} minLength={20} maxLength={2000} rows={4} required /><button className="button button--primary" type="submit" disabled={appealSaving} aria-busy={appealSaving}>Solicitar revisión</button>{appealSaving && <p role="status">Enviando tu solicitud…</p>}</ValidatedForm>}</>}{appealMessage && <p role="status">{appealMessage}</p>}</section>}

    {dashboard.profile && producerMetrics && <>
      <section className="admin-metric-grid producer-metric-grid" aria-label="Resumen de mis publicaciones">
        <article><span>Mis publicaciones</span><strong>{Object.values(producerMetrics.products).reduce((sum, count) => sum + Number(count), 0)}</strong><small>{Object.entries(producerMetrics.products).map(([status, count]) => status.replaceAll('_', ' ') + ': ' + count).join(' · ') || 'Aún no tienes publicaciones'}</small></article>
        <article><span>Intenciones de contacto</span><strong>{producerMetrics.contact_intentions_30d}</strong><small>Últimos 30 días · no representa conversaciones ni ventas</small></article>
        <article><span>Por WhatsApp</span><strong>{producerMetrics.contact_channels_30d?.whatsapp ?? '—'}</strong><small>Intenciones en los últimos 30 días</small></article>
        <article><span>Por teléfono</span><strong>{producerMetrics.contact_channels_30d?.phone ?? '—'}</strong><small>Intenciones en los últimos 30 días</small></article>
        <article><span>Desde el perfil</span><strong>{producerMetrics.profile_contact_intentions_30d ?? '—'}</strong><small>Sin seleccionar una oferta específica</small></article>
      </section>
      <section className="dashboard-list" aria-label="Ofertas con más intenciones de contacto">
        <h2>Ofertas con más intenciones de contacto</h2>
        {producerMetrics.top_products_30d ? producerMetrics.top_products_30d.length ? producerMetrics.top_products_30d.map((product) => <article className="dashboard-row" key={product.product_id}><div><h3>{product.title}</h3><p>{product.contact_intentions} intenciones · últimos 30 días</p></div></article>) : <p>Aún no hay intenciones de contacto desde tus ofertas en este periodo.</p> : <p>El desglose por oferta no está disponible.</p>}
        <p className="form-help">Los conteos son clics para abrir WhatsApp o teléfono; no confirman una conversación ni una venta.</p>
      </section>
    </>}
    {metricsError && <p role="alert">{metricsError}</p>}{withdrawNotice && <p role="status">{withdrawNotice}</p>}<Link className="button button--primary" to="/mis-productos/nuevo">Publicar producto <ArrowRight size={16} /></Link><section className="dashboard-list"><h2>Mis publicaciones</h2>{dashboard.products.length ? dashboard.products.map((product) => <article className="dashboard-row" key={product.id}><div><h3>{product.title}</h3><span className={product.listing_expired ? 'status-pill status-pill--expired' : `status-pill status-pill--${product.status}`}>{product.listing_expired ? 'Oferta vencida' : product.status.replaceAll('_', ' ')}</span>{product.listing_expired && <p className="moderation-feedback">Esta oferta dejó de aparecer en el catálogo. <Link to="/mis-productos">Renueva su vigencia</Link> si sigue disponible.</p>}</div><div className="detail-actions"><ProducerReviewSubmission productId={product.id} status={product.status} disabled={profileSuspended} onSubmitted={() => setDashboard((current) => current ? { ...current, products: current.products.map((item) => item.id === product.id ? { ...item, status: 'pending' } : item) } : current)} />{['draft', 'changes_requested', 'rejected'].includes(product.status) && <Link className="text-link" to={`/mis-productos/${product.id}/editar`}>Editar <ArrowRight size={14} /></Link>}{['draft', 'pending', 'changes_requested', 'rejected'].includes(product.status) && <button ref={withdrawTriggerRef} className="text-link" type="button" disabled={withdrawBusy} onClick={(event) => { withdrawTriggerRef.current = event.currentTarget; setWithdrawError(''); setWithdrawTarget(product) }}>Retirar</button>}</div></article>) : <p>Aún no tienes publicaciones. Puedes empezar con una oferta manual.</p>}</section></>}</main><SiteFooter />{withdrawTarget && <ConfirmActionDialog title="Retirar publicación" accessibleName={`Retirar ${withdrawTarget.title}`} description={`¿Quieres retirar “${withdrawTarget.title}”? Dejará de aparecer en el catálogo.`} confirmLabel="Confirmar retiro" busyLabel="Retirando…" busy={withdrawBusy} error={withdrawError} onCancel={() => { setWithdrawTarget(null); window.setTimeout(() => withdrawTriggerRef.current?.focus(), 0) }} onConfirm={() => void confirmDashboardWithdrawal()} />}</div>
}

function ProducerProductsPage() {
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getProducerDashboard>> | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [renewingId, setRenewingId] = useState<number | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<ProducerDashboardProduct | null>(null)
  const [withdrawError, setWithdrawError] = useState('')
  const withdrawTriggerRef = useRef<HTMLButtonElement | null>(null)
  const withdrawPageFocusRef = useRef(false)
  const pageHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const profileSuspended = dashboard?.profile?.profile_status === 'suspended'
  useEffect(() => { void getProducerDashboard().then(setDashboard).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No pudimos cargar tus publicaciones.')) }, [])
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
      setDashboard((current) => current ? { ...current, products: current.products.map((product) => product.id === id ? { ...product, status } : product) } : current)
      setNotice(status === 'paused' ? 'Publicación pausada.' : status === 'sold_out' ? 'Publicación marcada como agotada.' : 'Publicación volvió a estar disponible.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la publicación. El estado no cambió; vuelve a intentarlo.')
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
      setDashboard((current) => current ? { ...current, products: current.products.map((item) => item.id === product.id ? { ...item, status: 'withdrawn' } : item) } : current)
      setNotice('Publicación retirada.')
      withdrawPageFocusRef.current = true
      setWithdrawTarget(null)
    } catch (reason) {
      setWithdrawError(reason instanceof Error ? reason.message : 'No se pudo retirar la publicación. Sigue disponible en tu lista; puedes volver a intentarlo.')
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
      setDashboard((current) => current ? { ...current, products: current.products.map((item) => item.id === product.id ? { ...item, published_at: result.published_at, listing_expired: false, listing_expires_at: result.listing_expires_at } : item) } : current)
      setNotice('Oferta renovada. Volvió a aparecer en el catálogo público.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo renovar la oferta.')
    } finally {
      setRenewingId(null)
    }
  }

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p><h1 ref={pageHeadingRef} tabIndex={-1}>Mis productos</h1>{error && !dashboard ? <div className="empty-products" role="alert"><strong>{error}</strong><Link className="button button--primary" to="/ingresar">Ingresar</Link></div> : !dashboard ? <p role="status">Cargando publicaciones…</p> : <>{error && <p role="alert">{error}</p>}<p>Administra el estado de tus ofertas. Las publicaciones vencidas dejan de mostrarse hasta que renueves su vigencia.</p>{profileSuspended && <p className="moderation-feedback" role="status">Tu perfil está suspendido. Puedes conservar y editar borradores, pero no enviarlos a revisión ni volver a publicar ofertas.</p>}{notice && <p className="form-help" role="status">{notice}</p>}<Link className="button button--primary" to="/mis-productos/nuevo">Publicar producto <ArrowRight size={16} /></Link><section className="dashboard-list">{dashboard.products.length ? dashboard.products.map((product) => <article className="dashboard-row" key={product.id}><div><h2>{product.title}</h2>{product.listing_expired ? <><span className="status-pill status-pill--expired">Oferta vencida</span><p className="moderation-feedback">Dejó de aparecer en el catálogo. Renueva la vigencia cuando confirmes que sigue disponible.</p></> : <><span className={`status-pill status-pill--${product.status}`}>{product.status.replaceAll('_', ' ')}</span>{product.status === 'published' && product.listing_expires_at && <p className="moderation-feedback">Vigente hasta {new Date(product.listing_expires_at).toLocaleDateString('es-PA')}.</p>}</>}{['changes_requested', 'rejected'].includes(product.status) && <p className="moderation-feedback" role="status"><strong>{product.status === 'rejected' ? 'Motivo del rechazo:' : 'Cambios solicitados:'}</strong> {product.latest_moderation_decision?.reason ?? 'Consulta con el equipo de soporte antes de continuar.'}</p>}</div><div className="detail-actions">{['draft', 'changes_requested', 'rejected'].includes(product.status) && <Link className="text-link" to={`/mis-productos/${product.id}/editar`}>Corregir publicación</Link>}{['published', 'paused', 'sold_out'].includes(product.status) && <Link className='text-link' to={`/mis-productos/${product.id}/editar`}>Editar oferta</Link>}{['draft', 'pending', 'changes_requested', 'rejected'].includes(product.status) && <button className="text-link" type="button" onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button>}<ProducerReviewSubmission productId={product.id} status={product.status} disabled={profileSuspended} onSubmitted={() => setDashboard((current) => current ? { ...current, products: current.products.map((item) => item.id === product.id ? { ...item, status: 'pending' } : item) } : current)} />{product.status === 'published' && product.listing_expired && <><button className="button button--primary button--small" type="button" disabled={profileSuspended || renewingId === product.id || updatingId !== null} aria-busy={renewingId === product.id} onClick={() => void renew(product)}>{renewingId === product.id ? 'Renovando…' : 'Renovar oferta'}</button><button className="text-link" type="button" onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button></>}{product.status === 'published' && !product.listing_expired && <><button className="button button--outline button--small" type="button" disabled={updatingId !== null || renewingId !== null} aria-busy={updatingId === product.id} onClick={() => void changeStatus(product.id, 'paused')}>{updatingId === product.id ? 'Pausando…' : 'Pausar'}</button><button className="button button--outline button--small" type="button" disabled={updatingId !== null || renewingId !== null} aria-busy={updatingId === product.id} onClick={() => void changeStatus(product.id, 'sold_out')}>{updatingId === product.id ? 'Actualizando…' : 'Marcar agotado'}</button><button className="text-link" type="button" onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button></>}{['paused', 'sold_out'].includes(product.status) && <><button className="button button--primary button--small" type="button" disabled={profileSuspended || updatingId !== null || renewingId !== null} aria-busy={updatingId === product.id} onClick={() => void changeStatus(product.id, 'published')}>{updatingId === product.id ? 'Guardando…' : 'Volver a publicar'}</button><button className="text-link" type="button" onClick={(event) => requestWithdrawal(product, event.currentTarget)}>Retirar</button></>}</div></article>) : <p>Aún no tienes publicaciones.</p>}</section></>}</main><SiteFooter />{withdrawTarget && <ConfirmActionDialog title="Retirar publicación" accessibleName="Retirar publicación" description={`¿Quieres retirar “${withdrawTarget.title}”? Dejará de aparecer en el catálogo.`} confirmLabel="Confirmar retiro" busyLabel="Retirando…" busy={updatingId === withdrawTarget.id} error={withdrawError} onCancel={() => setWithdrawTarget(null)} onConfirm={() => void confirmWithdrawal()} />}</div>
}

function ProducerRoutes() {
  return (
    <Routes>
      <Route path="/mi-panel" element={<ProducerDashboard />} />
      <Route path="/mis-productos" element={<ProducerProductsPage />} />
      <Route path="/mis-productos/nuevo" element={<ProducerProductForm />} />
      <Route path="/mis-productos/:id/editar" element={<ProducerProductForm editing />} />
      <Route path="/mi-perfil" element={<ProducerProfilePage />} />
      <Route path="/verificar" element={<ProducerProfilePage verificationOnly />} />
      <Route path="*" element={<InfoPage title="No encontramos esta página" description="Revisa la dirección o vuelve al catálogo para explorar las ofertas." />} />
    </Routes>
  )
}

export default ProducerRoutes


