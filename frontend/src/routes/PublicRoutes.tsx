import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleHelp, Leaf, Search, ShieldCheck, Sprout, X } from 'lucide-react';

import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom';

import heroPhoto from '../assets/azuero-harvest.webp';

import yucaImage from '../assets/yuca.svg';
import termsText from '../legal-terms.md?raw';
import privacyText from '../legal-privacy.md?raw';

import ActivitySelect from '../components/ActivitySelect';
import LocationPicker from '../components/LocationPicker';

import ValidatedForm from '../components/ValidatedForm';

import VerificationBadge from '../components/VerificationBadge';

import { completeAdminMfaChallenge, csrfToken, getContactMessageTemplates, DEFAULT_CONTACT_MESSAGE_TEMPLATES, getPublicProducer, getPublicProducers, getProduct, listCategories, listLocations, listProducts, recordContact, recordNoResultSearch, requestAdminMfaRecovery, requestPasswordReset, resetPassword, submitReport, type ApiProduct, type ProducerPublicProfile, type PublicLocation, type PublicProducerSummary, type ProducerVerificationLevel } from '../api/client';

import { SiteFooter, SiteHeader } from './shared/SiteChrome';

import { useSeoMetadata } from './shared/SeoMetadata';
import { InfoPage } from './shared/InfoPage';

type FeaturedProduct = {
  id: string
  title: string
  producer: string
  location: string
  category: string
  price: string
  unit: string
  availability: string
  image: string
  imageAlt: string
  initials: string
  imageClass: string
  verified: boolean
  verificationLevel?: ProducerVerificationLevel
  verificationLabel?: string
}

export function ProductCard({ product }: { product: FeaturedProduct }) {
  return (
    <article className="product-card">
      <Link className="product-card__image-link" to={`/productos/${product.id}`} aria-label={`Ver ${product.title}`}>
        <div className={`product-card__image ${product.imageClass}`}>
          <img src={product.image} alt={product.imageAlt} loading="lazy" decoding="async" />
          <span className="harvest-label">Cosecha local</span>
          <span className="product-card__arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
        </div>
      </Link>
      <div className="product-card__body">
        <div className="product-card__category">{product.category}</div>
        <h3><Link to={`/productos/${product.id}`}>{product.title}</Link></h3>
        <div className="producer-line">
          <span className="producer-avatar" aria-hidden="true">{product.initials}</span>
          <span className="producer-line__name">{product.producer}</span>
          {product.verified && product.verificationLevel && <VerificationBadge level={product.verificationLevel} label={product.verificationLabel} />}
        </div>
        <p className="product-card__location"><span aria-hidden="true">·</span> {product.location}</p>
        <p className="product-card__availability">{product.availability}</p>
        <div className="product-card__footer">
          <p className="product-price">
            <strong>{product.price}</strong>
            {product.price !== 'Consultar' && <span>{product.unit}</span>}
          </p>
          <Link className="text-link" to={`/productos/${product.id}`}>
            Ver oferta <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  )
}

export function productPrice(product: Pick<ApiProduct, 'price_type' | 'price_amount' | 'currency'>): string {
  if (product.price_type === 'contact' || product.price_amount === null) return 'Consultar'
  const prefix = product.currency === 'USD' ? 'US$' : 'B/.'
  return `${prefix} ${Number(product.price_amount).toFixed(2)}`
}

export function publicLocationLabel(location?: { name: string; parent?: { name: string; parent?: { name: string } } } | null): string {
  return [location?.name, location?.parent?.name, location?.parent?.parent?.name].filter(Boolean).join(', ')
}

export function useContactTemplates() {
  const [templates, setTemplates] = useState(DEFAULT_CONTACT_MESSAGE_TEMPLATES)
  useEffect(() => { let active = true; void getContactMessageTemplates().then((value) => { if (active) setTemplates(value) }); return () => { active = false } }, [])
  return templates
}

export function ApiProductCard({ product }: { product: ApiProduct }) {
  const image = product.images[0]
  const imageUrl = image?.thumbnail_url ?? image?.url ?? yucaImage
  const location = publicLocationLabel(product.producer.location) || 'Panamá'
  const price = productPrice(product)
  const availability = product.stock_quantity === null ? 'Consulta disponibilidad' : `Stock indicado: ${Number(product.stock_quantity).toLocaleString('es-PA')} ${product.unit}`
  return <ProductCard product={{ id: product.slug, title: product.title, producer: product.producer.public_name, location, category: product.category.name, price, unit: product.unit, availability, image: imageUrl, imageAlt: image?.alt_text ?? product.title, initials: product.producer.public_name.slice(0, 2).toLocaleUpperCase('es-PA'), imageClass: '', verified: product.producer.contact_level !== 'unverified', verificationLevel: product.producer.verification_level, verificationLabel: product.producer.verification_label }} />
}

type DirectContactChannel = 'whatsapp' | 'phone'

export function DirectContactConfirmation({ channel, href, message, onCancel, onContinue }: { channel: DirectContactChannel; href: string; message?: string; onCancel: () => void; onContinue: () => void }) {
  const [editableMessage, setEditableMessage] = useState(message ?? '')
  const outgoingHref = channel === 'whatsapp' && message ? `${href.slice(0, href.indexOf('?'))}?text=${encodeURIComponent(editableMessage)}` : href
  const dialogRef = useRef<HTMLElement>(null)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancelRef.current(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return <div className="contact-confirmation-backdrop"><section ref={dialogRef} className="contact-confirmation" role="dialog" aria-modal="true" aria-labelledby="contact-confirmation-title" tabIndex={-1}><p className="eyebrow eyebrow--quiet">CONTACTO DIRECTO</p><h2 id="contact-confirmation-title">{channel === 'whatsapp' ? 'Antes de continuar a WhatsApp' : 'Antes de iniciar la llamada'}</h2><p>Confirma disponibilidad, precio y entrega directamente con el productor. No compartas contraseñas ni códigos de verificación.</p><ul className="contact-confirmation__safety"><li>No envíes dinero por adelantado sin verificar al productor y acordar las condiciones.</li><li>Antes de abrir un enlace de pago, confirma la solicitud por un canal independiente. Nunca compartas contraseñas ni OTP.</li><li>Confirma el pago directamente en tu cuenta; no confíes solo en capturas o comprobantes enviados por otra persona.</li><li>Acuerda entrega y lugar de encuentro directamente. No compartas códigos de acceso ni OTP.</li></ul>{channel === 'whatsapp' && message && <label className="text-area-field"><span>Mensaje para el productor · puedes editarlo</span><textarea rows={3} maxLength={1000} className="resize-none" style={{ resize: 'none' }} value={editableMessage} onChange={(event) => setEditableMessage(event.currentTarget.value)} /></label>}<p>El marketplace no procesa pagos ni organiza entregas. Registraremos este clic como intención de contacto, no como una venta.</p><div className="contact-confirmation__actions"><button className="button button--quiet" type="button" onClick={onCancel}>Volver</button><a className="button button--primary" href={outgoingHref} target={channel === 'whatsapp' ? '_blank' : undefined} rel={channel === 'whatsapp' ? 'noreferrer' : undefined} onClick={onContinue}>{channel === 'whatsapp' ? 'Continuar a WhatsApp' : 'Iniciar llamada'} <ArrowUpRight size={16} /></a></div></section></div>
}

export function ApiProductDetail({ product }: { product: ApiProduct }) {
  const templates = useContactTemplates()
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const image = product.images[activeImageIndex] ?? product.images[0]
  const imageUrl = image?.url ?? yucaImage
  const price = productPrice(product)
  const [contactError, setContactError] = useState('')
  const [contactConfirmation, setContactConfirmation] = useState<DirectContactChannel | null>(null)
  const [shareStatus, setShareStatus] = useState('')
  const contactLinkRef = useRef<HTMLAnchorElement>(null)
  const telephoneLinkRef = useRef<HTMLAnchorElement>(null)
  const lastContactChannel = useRef<DirectContactChannel | null>(null)
  useSeoMetadata(`${product.title} · El Empujoncito`, `${product.description} · ${product.producer.public_name}, ${publicLocationLabel(product.producer.location) || 'Panamá'}.`, image?.url, 'product')
  const phone = product.producer.contact_level === 'unverified' ? null : product.producer.phone_public
  const whatsappMessage = templates.product.replaceAll('{product_title}', product.title).replaceAll('{producer_name}', product.producer.public_name)
  const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}` : undefined
  const telephoneUrl = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined
  const availability = product.stock_quantity === null ? 'Consulta disponibilidad directamente con el productor.' : `Stock indicado: ${Number(product.stock_quantity).toLocaleString('es-PA')} ${product.unit}. Confirma que siga disponible.`
  async function shareProduct() {
    const url = new URL(`/compartir/producto/${encodeURIComponent(product.slug)}`, window.location.origin).toString()
    try {
      if (navigator.share) {
        await navigator.share({ title: product.title, text: `Oferta de ${product.producer.public_name} en El Empujoncito`, url })
        setShareStatus('Oferta compartida.')
      } else {
        await navigator.clipboard.writeText(url)
        setShareStatus('Enlace copiado. Ya puedes compartirlo.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        setShareStatus('Enlace copiado. Ya puedes compartirlo.')
      } catch {
        setShareStatus(`Copia este enlace para compartir: ${url}`)
      }
    }
  }
  useEffect(() => {
    if (contactConfirmation || !lastContactChannel.current) return
    const trigger = lastContactChannel.current === 'whatsapp' ? contactLinkRef.current : telephoneLinkRef.current
    trigger?.focus()
    lastContactChannel.current = null
  }, [contactConfirmation])
  const cancelContactConfirmation = () => setContactConfirmation(null)
  const confirmContact = () => {
    if (!contactConfirmation) return
    void recordContact({ product_id: product.id }, contactConfirmation).catch(() => setContactError('No pudimos registrar el clic; puedes continuar el contacto.'))
    setContactConfirmation(null)
  }
  useEffect(() => setActiveImageIndex(0), [product.id])
  return <div className="app-shell"><SiteHeader /><main className="detail-page page-shell"><Link className="back-link" to="/productos">← Volver a productos</Link><div className="detail-card"><div className="product-gallery"><img className="product-gallery__main" src={imageUrl} alt={image?.alt_text ?? product.title} fetchPriority="high" decoding="async" />{product.images.length > 1 && <><div className="product-gallery__controls"><button className="button button--outline button--small" type="button" aria-label="Ver foto anterior" onClick={() => setActiveImageIndex((index) => (index - 1 + product.images.length) % product.images.length)}><ChevronLeft size={17} /> Anterior</button><span aria-live="polite">Foto {activeImageIndex + 1} de {product.images.length}</span><button className="button button--outline button--small" type="button" aria-label="Ver foto siguiente" onClick={() => setActiveImageIndex((index) => (index + 1) % product.images.length)}>Siguiente <ChevronRight size={17} /></button></div><div className="product-gallery__thumbnails" role="group" aria-label="Seleccionar fotografía">{product.images.map((photo, index) => <button key={photo.id} type="button" aria-label={`Ver foto ${index + 1}`} aria-pressed={activeImageIndex === index} onClick={() => setActiveImageIndex(index)}><img src={photo.thumbnail_url ?? photo.url} alt="" loading="lazy" decoding="async" /></button>)}</div></>}</div><div><p className="eyebrow eyebrow--quiet">{product.category.name}</p><h1>{product.title}</h1><p className="detail-producer">Publicado por <Link to={`/productores/${product.producer.slug}`}>{product.producer.public_name}</Link></p><p className="detail-price">{price} {price !== 'Consultar' && <span>por {product.unit}</span>}</p><p className="detail-availability">{availability}</p><p className="detail-availability"><strong>Entrega o recogida:</strong> {product.delivery_method}</p><p className="detail-description">{product.description}</p>{contactError && <p role="status">{contactError}</p>}<div className="detail-actions"><a ref={contactLinkRef} className="button button--primary" href={whatsappUrl} aria-disabled={!phone} onClick={(event) => { if (!phone) { event.preventDefault(); return } event.preventDefault(); lastContactChannel.current = 'whatsapp'; setContactConfirmation('whatsapp') }}>{phone ? 'Consultar por WhatsApp' : 'Contacto disponible pronto'}</a>{phone && <a ref={telephoneLinkRef} className="button button--outline" href={telephoneUrl} onClick={(event) => { event.preventDefault(); lastContactChannel.current = 'phone'; setContactConfirmation('phone') }}>Llamar por teléfono</a>}<button className="button button--outline" type="button" onClick={() => void shareProduct()}>Compartir oferta</button><Link className="button button--outline" to={`/reportar/producto/${product.id}`}>Reportar esta oferta</Link><Link className="text-link" to="/seguridad">Recomendaciones de seguridad <ArrowRight size={15} /></Link></div>{shareStatus && <p role="status">{shareStatus}</p>}</div></div>{contactConfirmation && <DirectContactConfirmation channel={contactConfirmation} href={contactConfirmation === 'whatsapp' ? whatsappUrl! : telephoneUrl!} message={contactConfirmation === 'whatsapp' ? whatsappMessage : undefined} onCancel={cancelContactConfirmation} onContinue={confirmContact} />}</main><SiteFooter /></div>
}

export function HomePage() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [homeProducts, setHomeProducts] = useState<ApiProduct[] | null>(null)
  const [homeCategories, setHomeCategories] = useState<Array<{ id: number; name: string; slug: string }>>([])
  const [homeError, setHomeError] = useState('')
  const [homeRetry, setHomeRetry] = useState(0)

  useEffect(() => {
    void listCategories().then(setHomeCategories).catch(() => setHomeCategories([]))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ per_page: '3' })
    if (activeCategory) params.set('category', activeCategory)
    listProducts(params, controller.signal)
      .then((result) => { setHomeProducts(result.data); setHomeError('') })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setHomeProducts([])
          setHomeError(error.message)
        }
      })
    return () => controller.abort()
  }, [activeCategory, homeRetry])

  return (
    <div className="app-shell">
      <SiteHeader />
      <main>
        <section className="hero page-shell" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="eyebrow"><span className="eyebrow__line" />El interior produce, Panamá conecta</p>
            <h1 id="hero-title">El mercado de <em>nuestra tierra.</em></h1>
            <p className="hero__description">
              Encuentra productos y el trabajo de productores locales. Pregunta directamente, conoce su historia y acuerda con ellos.
            </p>
            <div className="hero__actions">
              <Link className="button button--primary" to="/productos">
                Explorar productos <ArrowRight size={17} />
              </Link>
              <Link className="button button--quiet" to="/registro">Publica tu oferta</Link>
            </div>
            <div className="hero__note">
              <span className="hero__note-icon"><Leaf size={16} /></span>
              <span>Contacto directo. Sin intermediarios ni pagos en la plataforma.</span>
            </div>
          </div>
          <div className="hero__visual">
            <img src={heroPhoto} alt="Productor del interior de Panamá con yuca, plátanos y tomates cosechados en su finca" fetchPriority="high" decoding="async" />
            <div className="hero-photo-caption">
              <span>Manos que cultivan futuro</span>
            </div>
            <div className="hero-seal" aria-label="Cosecha y emprendimiento local">
              <Sprout size={21} />
              <span>COSECHA<br />LOCAL</span>
            </div>
          </div>
        </section>

        <section className="search-band" aria-label="Busca ofertas locales">
          <ValidatedForm className="search-panel page-shell" role="search" noValidate onSubmit={(event) => event.preventDefault()}>
            <div className="search-panel__intro">
              <span className="search-panel__icon"><Search size={18} /></span>
              <div>
                <label htmlFor="product-search">¿Qué te gustaría encontrar?</label>
                <span>Busca por producto, productor o lugar</span>
              </div>
            </div>
            <div className="search-panel__input-wrap">
              <input
                id="product-search"
                type="search"
                role="searchbox"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ej. yuca, huevos, artesanías…"
                aria-label="Buscar productos"
                autoComplete="off"
              />
              {query && (
                <button className="search-clear" type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}>
                  <X size={16} />
                </button>
              )}
            </div>
            <Link className="button button--primary search-panel__submit" to={`/productos${query ? `?q=${encodeURIComponent(query)}` : ''}`}>
              Buscar <ArrowRight size={16} />
            </Link>
            <div className="search-panel__location"><span aria-hidden="true">◉</span> Coclé, Veraguas, Herrera y Los Santos</div>
          </ValidatedForm>
        </section>

        <section className="category-section page-shell" aria-labelledby="category-title">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow eyebrow--quiet">LO QUE SE PRODUCE AQUÍ</p>
              <h2 id="category-title">Busca por categoría</h2>
            </div>
            <Link className="text-link text-link--large" to="/productos">Ver todas <ArrowRight size={16} /></Link>
          </div>
          <div className="category-grid">
            {homeCategories.map((category, index) => (
              <button
                type="button"
                className={`category-tile${activeCategory === category.slug ? ' category-tile--active' : ''}`}
                aria-pressed={activeCategory === category.slug}
                key={category.id}
                onClick={() => setActiveCategory((current) => current === category.slug ? '' : category.slug)}
              >
                <span className={`category-icon ${['category-icon--leaf', 'category-icon--sun', 'category-icon--craft', 'category-icon--other'][index % 4]}`} aria-hidden="true">
                  {index === 2 ? <Sprout size={21} /> : <Leaf size={21} />}
                </span>
                <span className="category-tile__text">
                  <strong>{category.name}</strong>
                  <small>Explorar ofertas</small>
                </span>
                <ChevronRight className="category-tile__arrow" size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className="featured-section page-shell" aria-labelledby="featured-title">
          <div className="section-heading">
            <div>
            <p className="eyebrow eyebrow--quiet">OFERTAS LOCALES</p>
              <h2 id="featured-title">De aquí, para compartir</h2>
              <p className="section-heading__description">Ofertas revisadas y disponibles para consultar directamente.</p>
            </div>
            <Link className="button button--outline featured-all" to="/productos">
              Explorar el mercado <ArrowRight size={16} />
            </Link>
          </div>
          {homeError ? (
            <div className="empty-products" role="alert"><strong>No pudimos cargar las ofertas</strong><span>{homeError}</span><button className="text-link" type="button" onClick={() => { setHomeError(''); setHomeProducts(null); setHomeRetry((attempt) => attempt + 1) }}>Intentar de nuevo</button><Link className="text-link" to="/productos">Explorar el catálogo <ArrowRight size={15} /></Link></div>
          ) : homeProducts === null ? (
            <p role="status">Cargando ofertas locales…</p>
          ) : homeProducts.length ? (
            <div className="product-grid">
              {homeProducts.map((product) => <ApiProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="empty-products" role="status">
              <Sprout size={21} />
              <strong>{activeCategory ? 'Aún no hay ofertas en esta categoría' : 'Pronto encontrarás ofertas locales'}</strong>
              <span>Cuando una publicación sea revisada y aprobada aparecerá aquí.</span>
              {activeCategory && <button className="text-link" type="button" onClick={() => setActiveCategory('')}>Ver todas las ofertas <ArrowRight size={15} /></button>}
            </div>
          )}
        </section>

        <section className="trust-band" id="como-funciona">
          <div className="trust-band__inner page-shell">
            <div className="trust-band__intro">
              <p className="eyebrow eyebrow--light">UN ENCUENTRO MÁS CERCANO</p>
              <h2>Conoce. Conecta.<br /><em>Apoya lo local.</em></h2>
              <p>El productor ofrece. Tú preguntas y acuerdas directamente con él.</p>
            </div>
            <div className="trust-steps">
              <div className="trust-step">
                <span className="trust-step__icon"><Search size={20} /></span>
                <div><strong>Encuentra</strong><p>Explora ofertas y conoce quién las produce.</p></div>
              </div>
              <div className="trust-step">
                <span className="trust-step__icon"><ArrowUpRight size={20} /></span>
                <div><strong>Conversa directo</strong><p>Consulta por WhatsApp o teléfono al productor.</p></div>
              </div>
              <div className="trust-step">
                <span className="trust-step__icon"><ShieldCheck size={20} /></span>
                <div><strong>Decide con cuidado</strong><p>Acuerda precio, pago y entrega entre ustedes.</p></div>
              </div>
            </div>
            <Link className="trust-band__link" to="/seguridad">Consejos para comprar con confianza <ArrowRight size={16} /></Link>
          </div>
        </section>

        <section className="producer-cta page-shell">
          <div className="producer-cta__mark" aria-hidden="true"><Sprout size={27} /></div>
          <div className="producer-cta__copy">
            <p className="eyebrow eyebrow--quiet">¿PRODUCES, CULTIVAS O CREAS?</p>
            <h2>Tu trabajo merece ser visto.</h2>
            <p>Publica tus productos gratis. Puedes hacerlo todo a mano, paso a paso y a tu ritmo.</p>
          </div>
          <Link className="button button--primary" to="/registro">Quiero publicar <ArrowRight size={16} /></Link>
        </section>

        <section className="help-strip page-shell">
          <div className="help-strip__icon"><CircleHelp size={20} /></div>
          <p>¿Necesitas una mano para publicar? <Link to="/ayuda-productor">Conoce las opciones de apoyo</Link></p>
          <span>Estamos para orientarte</span>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const sort = searchParams.get('sort') === 'newest' ? 'newest' : 'relevance'
  const province = searchParams.get('province') ?? ''
  const district = searchParams.get('district') ?? ''
  const corregimiento = searchParams.get('corregimiento') ?? ''
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [apiProducts, setApiProducts] = useState<ApiProduct[] | null>(null)
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [apiError, setApiError] = useState('')
  const [loadedQueryKey, setLoadedQueryKey] = useState('')
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [categoriesFromApi, setCategoriesFromApi] = useState<Array<{ id: number; name: string; slug: string }>>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesLoadError, setCategoriesLoadError] = useState(false)
  const [categoriesRetry, setCategoriesRetry] = useState(0)
  const [locationsFromApi, setLocationsFromApi] = useState<PublicLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locationsLoadError, setLocationsLoadError] = useState(false)
  const [locationsRetry, setLocationsRetry] = useState(0)
  const queryKey = searchParams.toString()
  const catalogRequestKey = `${queryKey}::${catalogRetry}`
  const catalogLoading = loadedQueryKey !== catalogRequestKey
  const visibleApiProducts = catalogLoading ? null : apiProducts
  const visibleApiError = catalogLoading ? '' : apiError
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams(queryKey)
    if (params.has('sort') && !['relevance', 'newest'].includes(params.get('sort') ?? '')) params.delete('sort')
    if (!params.has('per_page')) params.set('per_page', '12')
    listProducts(params, controller.signal).then((result) => {
      setApiProducts(result.data)
      setPagination({ current_page: result.current_page, last_page: result.last_page, total: result.total })
      setApiError('')
      setLoadedQueryKey(catalogRequestKey)
      if (result.total === 0) void recordNoResultSearch(params).catch(() => undefined)
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') {
        setApiProducts(null)
        setApiError(error.message)
        setLoadedQueryKey(catalogRequestKey)
      }
    })
    return () => controller.abort()
  }, [queryKey, catalogRetry, catalogRequestKey])
  useEffect(() => {
    let active = true
    setCategoriesLoading(true)
    setCategoriesLoadError(false)
    void listCategories().then((result) => {
      if (active) setCategoriesFromApi(Array.isArray(result) ? result : [])
    }).catch(() => {
      if (active) {
        setCategoriesFromApi([])
        setCategoriesLoadError(true)
      }
    }).finally(() => {
      if (active) setCategoriesLoading(false)
    })
    return () => { active = false }
  }, [categoriesRetry])
  useEffect(() => {
    let active = true
    setLocationsLoading(true)
    setLocationsLoadError(false)
    void listLocations().then((result) => {
      if (active) setLocationsFromApi(Array.isArray(result) ? result : [])
    }).catch(() => {
      if (active) {
        setLocationsFromApi([])
        setLocationsLoadError(true)
      }
    }).finally(() => {
      if (active) setLocationsLoading(false)
    })
    return () => { active = false }
  }, [locationsRetry])
  const selectedProvince = locationsFromApi.find((location) => location.slug === province)
  const selectedDistrict = locationsFromApi.find((location) => location.slug === district)
  const availableDistricts = locationsFromApi.filter((location) => location.level === 'district' && (!selectedProvince || location.parent_id === selectedProvince.id))
  const availableCorregimientos = locationsFromApi.filter((location) => location.level === 'corregimiento' && (!selectedDistrict || location.parent_id === selectedDistrict.id))
  function commitSearch(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('q', value.trim())
    else next.delete('q')
    next.delete('page')
    setSearchParams(next)
  }

  function setLocationFilter(key: 'province' | 'district' | 'corregimiento', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'province') { next.delete('district'); next.delete('corregimiento') }
    if (key === 'district') next.delete('corregimiento')
    next.delete('page')
    setSearchParams(next)
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="catalog-page page-shell">
        <nav className="breadcrumbs" aria-label="Ruta de navegación">
          <Link to="/">Inicio</Link><ChevronRight size={14} /><span aria-current="page">Productos</span>
        </nav>
        <div className="catalog-heading">
          <div>
            <p className="eyebrow eyebrow--quiet">EL MERCADO LOCAL</p>
            <h1>Productos locales</h1>
            <p>Encuentra ofertas y conversa directamente con quien las produce.</p>
          </div>
          {visibleApiProducts === null && !visibleApiError && <span className="catalog-sample-note" role="status">Cargando ofertas…</span>}
        </div>
        <ValidatedForm className="catalog-toolbar" role="search" noValidate onSubmit={(event) => { event.preventDefault(); commitSearch(searchInputRef.current?.value ?? '') }}>
          <label className="catalog-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Buscar productos</span>
            <input
              type="search"
              role="searchbox"
              aria-label="Buscar productos"
              placeholder="Producto, productor o lugar"
              key={query}
              defaultValue={query}
              ref={searchInputRef}
            />
            <button type="button" aria-label="Limpiar búsqueda" onClick={() => { if (searchInputRef.current) searchInputRef.current.value = ''; commitSearch('') }}><X size={16} /></button>
          </label>
          <label className="catalog-filter">
            <span>Categoría</span>
            <select
              aria-label="Filtrar por categoría"
              value={category}
              disabled={categoriesLoading || categoriesLoadError || categoriesFromApi.length === 0}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams)
                if (event.target.value) next.set('category', event.target.value)
                else next.delete('category')
                next.delete('page')
                setSearchParams(next)
              }}
            >
              <option value="">{categoriesLoading ? 'Cargando…' : categoriesLoadError ? 'No disponibles' : categoriesFromApi.length ? 'Todas' : 'Sin opciones'}</option>
              {categoriesFromApi.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label className="catalog-filter catalog-sort">
            <span>Ordenar por</span>
            <select aria-label="Ordenar por" value={sort} onChange={(event) => {
              const next = new URLSearchParams(searchParams)
              next.set('sort', event.target.value)
              next.delete('page')
              setSearchParams(next)
            }}>
              <option value="relevance">Más relevantes</option>
              <option value="newest">Más recientes</option>
            </select>
          </label>
          {categoriesLoadError && <div role="alert" className="catalog-reference-error"><span>No pudimos cargar las categorías.</span><button className="text-link" type="button" onClick={() => setCategoriesRetry((attempt) => attempt + 1)}>Reintentar</button></div>}
          <label className="catalog-filter"><span>Provincia</span><select aria-label="Filtrar por provincia" value={province} onChange={(event) => setLocationFilter('province', event.target.value)} disabled={locationsLoading || locationsLoadError || locationsFromApi.length === 0}><option value="">{locationsLoading ? 'Cargando…' : locationsLoadError ? 'No disponibles' : locationsFromApi.length ? 'Todas' : 'Sin opciones'}</option>{locationsFromApi.filter((item) => item.level === 'province').map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
          <label className="catalog-filter"><span>Distrito</span><select aria-label="Filtrar por distrito" value={district} onChange={(event) => setLocationFilter('district', event.target.value)} disabled={!province}><option value="">Todos</option>{availableDistricts.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
          <label className="catalog-filter"><span>Corregimiento</span><select aria-label="Filtrar por corregimiento" value={corregimiento} onChange={(event) => setLocationFilter('corregimiento', event.target.value)} disabled={!district}><option value="">Todos</option>{availableCorregimientos.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
          {locationsLoadError && <div role="alert" className="catalog-reference-error"><span>No pudimos cargar las localidades.</span><button className="text-link" type="button" onClick={() => setLocationsRetry((attempt) => attempt + 1)}>Reintentar</button></div>}
          <button className="button button--primary" type="submit">Buscar <ArrowRight size={16} /></button>
        </ValidatedForm>
        <div className="catalog-result-line" aria-live="polite">
          <span>{visibleApiError ? 'No pudimos consultar el catálogo' : visibleApiProducts ? `${pagination.total} ${pagination.total === 1 ? 'oferta publicada' : 'ofertas publicadas'}` : 'Consultando el catálogo…'}</span>
          <span>{province ? selectedProvince?.name ?? 'Provincia seleccionada' : 'Todas las provincias'}{district ? ` · ${selectedDistrict?.name ?? 'Distrito seleccionado'}` : ''}{corregimiento ? ` · ${locationsFromApi.find((item) => item.slug === corregimiento)?.name ?? 'Corregimiento seleccionado'}` : ''}</span>
        </div>
        {visibleApiError ? (
          <div className="empty-products catalog-empty" role="alert"><strong>No pudimos cargar las ofertas publicadas</strong><span>{visibleApiError}</span><div className="detail-actions"><button className="button button--outline" type="button" onClick={() => setCatalogRetry((attempt) => attempt + 1)}>Intentar de nuevo</button><button className="text-link" type="button" onClick={() => { if (searchInputRef.current) searchInputRef.current.value = ''; setSearchParams({}) }}>Limpiar búsqueda y filtros</button></div></div>
        ) : visibleApiProducts?.length ? (
          <div className="product-grid">{visibleApiProducts.map((product) => <ApiProductCard key={product.id} product={product} />)}</div>
        ) : visibleApiProducts && visibleApiProducts.length === 0 ? (
          <div className="empty-products catalog-empty" role="status"><Search size={21} /><strong>Todavía no hay ofertas publicadas que coincidan</strong><span>Prueba otra búsqueda o vuelve más adelante.</span></div>
        ) : visibleApiProducts === null ? (
          <p role="status">Buscando ofertas disponibles…</p>
        ) : (
          <div className="empty-products catalog-empty" role="status">
            <Search size={21} />
            <strong>No encontramos ofertas con esa búsqueda</strong>
            <span>Prueba con otra palabra o elimina los filtros.</span>
            <button className="text-link" type="button" onClick={() => { if (searchInputRef.current) searchInputRef.current.value = ''; setSearchParams({}) }}>
              Limpiar filtros <ArrowRight size={15} />
            </button>
          </div>
        )}
        {visibleApiProducts && pagination.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de ofertas"><button className="button button--outline button--small" disabled={pagination.current_page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(pagination.current_page - 1)); setSearchParams(next) }}>Anterior</button><span aria-live="polite">Página {pagination.current_page} de {pagination.last_page}</span><button className="button button--outline button--small" disabled={pagination.current_page >= pagination.last_page} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(pagination.current_page + 1)); setSearchParams(next) }}>Siguiente</button></nav>}
        <aside className="catalog-safety-note"><ShieldCheck size={18} /><p>Acuerda directamente con el productor. Antes de pagar, verifica el producto, el precio y la forma de entrega.</p><Link to="/seguridad">Consejos de seguridad</Link></aside>
      </main>
      <SiteFooter />
    </div>
  )
}

export function ProductDetailPage() {
  const { slug } = useParams()
  const [apiProduct, setApiProduct] = useState<ApiProduct | null>(null)
  const [apiChecked, setApiChecked] = useState(false)
  useSeoMetadata(
    apiProduct ? `${apiProduct.title} · El Empujoncito` : 'Ofertas locales · El Empujoncito',
    apiProduct ? `${apiProduct.description} · ${apiProduct.producer.public_name}. Contacta directamente con productores locales del interior de Panamá.` : 'Encuentra y contacta directamente a productores locales del interior de Panamá.',
    apiProduct?.images[0]?.url,
    'product',
  )
  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()
    getProduct(slug, controller.signal).then(setApiProduct).catch(() => undefined).finally(() => setApiChecked(true))
    return () => controller.abort()
  }, [slug])
  if (apiProduct) return <ApiProductDetail product={apiProduct} />
  if (!apiChecked) return <InfoPage title="Cargando oferta" description="Estamos buscando esta publicación." />
  return <InfoPage title="Esta oferta no está disponible" description="Puede que el productor la haya pausado o retirado." />
}

export function GuidePage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  useSeoMetadata(`${title} · El Empujoncito`, intro)
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="info-page page-shell guide-page">
        <nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><ChevronRight size={14} /><span aria-current="page">{title}</span></nav>
        <p className="eyebrow eyebrow--quiet">MERCADO SOLIDARIO · GUÍA PRÁCTICA</p>
        <h1>{title}</h1>
        <p className="guide-intro">{intro}</p>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

export function SafetyGuidePage() {
  return (
    <GuidePage title="Compra con cuidado" intro="El mercado te conecta con productores. Confirma los detalles de cada compra directamente con la persona que publica.">
      <div className="guide-grid">
        <section className="guide-card"><span className="guide-card__step">01</span><h2>Antes de acordar</h2><p>Confirma disponibilidad, cantidad, precio final, lugar y forma de entrega directamente con el productor. La oferta puede cambiar.</p></section>
        <section className="guide-card"><span className="guide-card__step">02</span><h2>Cuida tus datos</h2><p>No compartas contraseñas ni códigos de verificación. La plataforma no procesa pagos; acuerda cualquier pago directamente con el productor.</p></section>
        <section className="guide-card"><span className="guide-card__step">03</span><h2>Entiende la verificación</h2><p>“Contacto confirmado” indica que se comprobó el control del teléfono. No garantiza la calidad del producto ni una transacción.</p></section>
        <section className="guide-card guide-card--report"><span className="guide-card__step">04</span><h2>¿Algo te preocupa?</h2><p>Usa “Reportar esta oferta” en la ficha del producto o visita el perfil para reportar una publicación. El equipo revisará el caso.</p></section>
      </div>
      <div className="guide-actions"><Link className="button button--primary" to="/productos">Explorar ofertas <ArrowRight size={16} /></Link><Link className="text-link" to="/productores">Conocer productores <ArrowRight size={15} /></Link><Link className="text-link" to="/productos">Reportar una oferta <ArrowRight size={15} /></Link></div>
    </GuidePage>
  )
}

export function AboutProjectPage() {
  return (
    <GuidePage title="Sobre el proyecto" intro="Un espacio digital para dar visibilidad a productores, artesanos y emprendimientos locales del interior de Panamá.">
      <div className="guide-grid">
        <section className="guide-card"><span className="guide-card__step">EL MERCADO</span><h2>Ofertas de quienes producen</h2><p>Cada productor crea y mantiene sus publicaciones. El equipo revisa las ofertas antes de mostrarlas en el catálogo.</p></section>
        <section className="guide-card"><span className="guide-card__step">CONTACTO DIRECTO</span><h2>Consulta con la persona que publica</h2><p>Compradores y productores acuerdan directamente disponibilidad, precio, pago y forma de entrega.</p></section>
        <section className="guide-card guide-card--report"><span className="guide-card__step">LÍMITES DEL SERVICIO</span><h2>Sin pagos ni entregas dentro del sitio</h2><p>La plataforma no procesa pagos ni organiza entregas. Las publicaciones y los acuerdos se gestionan directamente entre comprador y productor.</p></section>
        <section className="guide-card"><span className="guide-card__step">TU CUENTA</span><h2>Registro gratuito y directo</h2><p>Productores y emprendedores del interior de Panamá pueden crear su cuenta y publicar sus ofertas sin costo.</p></section>
      </div>
      <div className="guide-actions"><Link className="button button--primary" to="/productos">Explorar ofertas <ArrowRight size={16} /></Link><Link className="text-link" to="/seguridad">Leer consejos de seguridad <ArrowRight size={15} /></Link><Link className="text-link" to="/ayuda">Ver ayuda <ArrowRight size={15} /></Link></div>
    </GuidePage>
  )
}

export function ProducerHelpPage() {
  return (
    <GuidePage title="Publica tus productos paso a paso" intro="Completa tu perfil y crea tus publicaciones directamente desde tu cuenta de productor.">
      <ol className="guide-steps">
        <li><span>1</span><div><h2>Crea tu cuenta y perfil</h2><p>Regístrate, completa tu nombre público, actividad y ubicación. Verifica tu teléfono para habilitar el contacto confirmado.</p></div></li>
        <li><span>2</span><div><h2>Prepara la oferta</h2><p>Agrega fotografías, título, categoría y una descripción clara. Indica unidad, precio si aplica, disponibilidad y detalles de entrega.</p></div></li>
        <li><span>3</span><div><h2>Envía a revisión</h2><p>Las publicaciones pasan por revisión antes de mostrarse públicamente. Revisa “Mis publicaciones” para ver el estado y atender cualquier cambio solicitado.</p></div></li>
        <li><span>4</span><div><h2>Mantén la información al día</h2><p>Edita o pausa una oferta cuando cambien la disponibilidad, el precio o las condiciones. Responde directamente a las consultas de compradores.</p></div></li>
      </ol>
      <div className="guide-callout"><strong>Asistencia opcional en una fase futura</strong><p>Super Carnes podrá contratar por separado sugerencias para identificar productos, redactar descripciones o transcribir notas de voz. Si se incorpora, podrás editar o rechazar cada sugerencia; el flujo manual seguirá disponible.</p></div>
      <div className="guide-actions"><Link className="button button--primary" to="/registro">Crear mi cuenta <ArrowRight size={16} /></Link><Link className="text-link" to="/mi-perfil">Completar mi perfil <ArrowRight size={15} /></Link><Link className="text-link" to="/mis-productos">Ver mis publicaciones <ArrowRight size={15} /></Link></div>
    </GuidePage>
  )
}

export function HelpIndexPage() {
  return (
    <GuidePage title="Ayuda para comprar y vender" intro="Encuentra pasos claros para explorar el mercado, contactar productores o publicar tus productos.">
      <div className="guide-grid guide-grid--links">
        <Link className="guide-card guide-card--link" to="/seguridad"><span className="guide-card__step">COMPRADORES</span><h2>Consejos para comprar</h2><p>Confirma los detalles, cuida tus datos y aprende cómo reportar una oferta.</p><span className="text-link">Ir a seguridad <ArrowRight size={15} /></span></Link>
        <Link className="guide-card guide-card--link" to="/ayuda-productor"><span className="guide-card__step">PRODUCTORES</span><h2>Guía para productores</h2><p>Completa tu perfil, publica manualmente y administra el estado de tus ofertas.</p><span className="text-link">Ver la guía <ArrowRight size={15} /></span></Link>
        <Link className="guide-card guide-card--link" to="/productos"><span className="guide-card__step">CATÁLOGO</span><h2>Explorar productos</h2><p>Busca ofertas por nombre, categoría y ubicación.</p><span className="text-link">Abrir catálogo <ArrowRight size={15} /></span></Link>
      </div>
    </GuidePage>
  )
}

export function PublicProducerContact({ profile }: { profile: ProducerPublicProfile }) {
  const templates = useContactTemplates()
  const [error, setError] = useState('')
  const [contactConfirmation, setContactConfirmation] = useState<DirectContactChannel | null>(null)
  const phone = profile.contact_level === 'unverified' ? null : profile.phone_public
  const whatsappMessage = templates.producer.replaceAll('{producer_name}', profile.public_name)
  const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}` : ''
  const telephoneUrl = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''
  const whatsappLinkRef = useRef<HTMLAnchorElement>(null)
  const telephoneLinkRef = useRef<HTMLAnchorElement>(null)
  const lastContactChannel = useRef<DirectContactChannel | null>(null)
  useEffect(() => {
    if (contactConfirmation || !lastContactChannel.current) return
    const trigger = lastContactChannel.current === 'whatsapp' ? whatsappLinkRef.current : telephoneLinkRef.current
    trigger?.focus()
    lastContactChannel.current = null
  }, [contactConfirmation])
  const openConfirmation = (channel: DirectContactChannel) => {
    lastContactChannel.current = channel
    setContactConfirmation(channel)
  }
  const confirmContact = () => {
    if (!contactConfirmation) return
    void recordContact({ producer_id: profile.id }, contactConfirmation).catch(() => setError('No pudimos registrar este clic; puedes continuar el contacto.'))
    setContactConfirmation(null)
  }
  if (!phone) return null

  return <div className="producer-contact-actions"><div className="detail-actions"><a ref={whatsappLinkRef} className="button button--primary" href={whatsappUrl} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openConfirmation('whatsapp') }}>Escribir por WhatsApp</a><a ref={telephoneLinkRef} className="button button--outline" href={telephoneUrl} onClick={(event) => { event.preventDefault(); openConfirmation('phone') }}>Llamar por teléfono</a></div>{error && <p role="status">{error}</p>}{contactConfirmation && <DirectContactConfirmation channel={contactConfirmation} href={contactConfirmation === 'whatsapp' ? whatsappUrl : telephoneUrl} message={contactConfirmation === 'whatsapp' ? whatsappMessage : undefined} onCancel={() => setContactConfirmation(null)} onContinue={confirmContact} />}</div>
}

export function PublicProducerPage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<ProducerPublicProfile | null>(null)
  const [error, setError] = useState('')
  useSeoMetadata(
    profile ? `${profile.public_name} · El Empujoncito` : 'Productores locales · El Empujoncito',
    profile ? `${profile.public_name}${profile.activity ? `: ${profile.activity}` : ''}. ${profile.description ?? ''} ${publicLocationLabel(profile.location) || 'Panamá'}. Explora sus ofertas y contacta directamente.` : 'Conoce productores locales del interior de Panamá y explora sus ofertas.',
    undefined,
    'profile',
  )
  useEffect(() => { void getPublicProducer(slug).then(setProfile).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el perfil.')) }, [slug])
  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><Link className="back-link" to="/productos">← Volver a productos</Link>{error ? <div className="empty-products" role="alert"><strong>{error}</strong></div> : !profile ? <p role="status">Cargando perfil…</p> : <><section className="producer-profile-card"><span className="producer-avatar producer-avatar--large" aria-hidden="true">{profile.public_name.slice(0, 2).toLocaleUpperCase('es-PA')}</span><div><p className="eyebrow eyebrow--quiet">PRODUCTOR LOCAL</p><h1>{profile.public_name}</h1><VerificationBadge level={profile.verification_level} label={profile.verification_label} /><p className="verification-explainer">Este nivel describe las comprobaciones de contacto o identidad realizadas. No garantiza calidad, disponibilidad, pago ni entrega.</p>{profile.activity && <p><strong>{profile.activity}</strong></p>}<p>{publicLocationLabel(profile.location) || 'Panamá'}</p>{profile.description && <p>{profile.description}</p>}<PublicProducerContact profile={profile} /><Link className="text-link" to={`/reportar/productor/${profile.id}`}>Reportar este perfil</Link></div></section><section className="featured-section"><h2>Ofertas publicadas</h2>{profile.products.length ? <div className="product-grid">{profile.products.map((product) => <ApiProductCard key={product.id} product={product} />)}</div> : <p>Este productor aún no tiene ofertas publicadas.</p>}</section></>}</main><SiteFooter /></div>
}

export function PublicProducerDirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsKey = searchParams.toString()
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const province = searchParams.get('province') ?? ''
  const district = searchParams.get('district') ?? ''
  const corregimiento = searchParams.get('corregimiento') ?? ''
  const [queryDraft, setQueryDraft] = useState(query)
  const [querySource, setQuerySource] = useState(query)
  const [composing, setComposing] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: number; name: string; slug: string }>>([])
  const [locations, setLocations] = useState<PublicLocation[]>([])
  const [pageData, setPageData] = useState<{ key: string; value: Awaited<ReturnType<typeof getPublicProducers>> } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)
  if (querySource !== query) {
    setQuerySource(query)
    setQueryDraft(query)
  }
  useSeoMetadata('Productores locales · El Empujoncito', 'Conoce a productores del interior de Panamá, filtra por actividad y ubicación y explora sus ofertas disponibles.', undefined, 'profile')
  useEffect(() => {
    if (composing || queryDraft.trim() === query) return
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      const value = queryDraft.trim()
      if (value) next.set('q', value)
      else next.delete('q')
      next.delete('page')
      setSearchParams(next)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [composing, query, queryDraft, searchParams, setSearchParams])
  useEffect(() => {
    void listCategories().then(setCategories).catch(() => setCategories([]))
    void listLocations().then(setLocations).catch(() => setLocations([]))
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void getPublicProducers(new URLSearchParams(paramsKey), controller.signal).then((result) => { setPageData({ key: paramsKey, value: result }) }).catch((reason: unknown) => { if (!controller.signal.aborted) setFailure({ key: paramsKey, message: reason instanceof Error ? reason.message : 'No pudimos cargar el directorio.' }) })
    return () => controller.abort()
  }, [paramsKey, retry])
  const currentPage = pageData?.key === paramsKey ? pageData.value : null
  const error = failure?.key === paramsKey ? failure.message : ''
  const selectedProvince = locations.find((item) => item.slug === province)
  const selectedDistrict = locations.find((item) => item.slug === district)
  const districts = locations.filter((item) => item.level === 'district' && item.parent_id === selectedProvince?.id)
  const corregimientos = locations.filter((item) => item.level === 'corregimiento' && item.parent_id === selectedDistrict?.id)
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'province') { next.delete('district'); next.delete('corregimiento') }
    if (key === 'district') next.delete('corregimiento')
    next.delete('page')
    setSearchParams(next)
  }
  function movePage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage > 1) next.set('page', String(nextPage))
    else next.delete('page')
    setSearchParams(next)
  }

  return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell producer-directory"><nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><ChevronRight size={14} /><span aria-current="page">Productores</span></nav><header className="catalog-heading producer-directory__heading"><div><p className="eyebrow eyebrow--quiet">PERSONAS Y OFICIOS DEL INTERIOR</p><h1>Productores locales</h1><p>Conoce a quienes ofrecen productos y trabajo hecho en la región.</p></div><span className="producer-directory__stamp"><Sprout size={19} aria-hidden="true" /><span>ORIGEN<br />LOCAL</span></span></header><ValidatedForm className="catalog-toolbar producer-directory__filters" role="search" noValidate onSubmit={(event) => { event.preventDefault(); updateFilter('q', queryDraft.trim()) }}><label className="catalog-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar productores</span><input type="search" aria-label="Buscar productores" placeholder="Nombre o actividad" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={(event) => { setComposing(false); setQueryDraft(event.currentTarget.value) }} /><button type="button" aria-label="Limpiar búsqueda" onClick={() => { setQueryDraft(''); updateFilter('q', '') }}><X size={16} /></button></label><label className="catalog-filter"><span>Producto</span><select aria-label="Filtrar por producto" value={category} onChange={(event) => updateFilter('category', event.currentTarget.value)}><option value="">Todas las categorías</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label><label className="catalog-filter"><span>Provincia</span><select aria-label="Filtrar por provincia" value={province} onChange={(event) => updateFilter('province', event.currentTarget.value)}><option value="">Todas</option>{locations.filter((item) => item.level === 'province').map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label><label className="catalog-filter"><span>Distrito</span><select aria-label="Filtrar por distrito" value={district} disabled={!province} onChange={(event) => updateFilter('district', event.currentTarget.value)}><option value="">Todos</option>{districts.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label><label className="catalog-filter"><span>Corregimiento</span><select aria-label="Filtrar por corregimiento" value={corregimiento} disabled={!district} onChange={(event) => updateFilter('corregimiento', event.currentTarget.value)}><option value="">Todos</option>{corregimientos.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label></ValidatedForm><div className="catalog-result-line" aria-live="polite"><span>{currentPage ? `${currentPage.total} ${currentPage.total === 1 ? 'productor con ofertas' : 'productores con ofertas'}` : 'Productores locales'}</span><span>{[selectedDistrict?.name, selectedProvince?.name].filter(Boolean).join(' · ') || 'Todas las provincias'}</span></div>{error ? <div className="empty-products catalog-empty" role="alert"><strong>No pudimos cargar el directorio</strong><span>{error}</span><button className="button button--outline" type="button" onClick={() => { setFailure(null); setRetry((value) => value + 1) }}>Intentar de nuevo</button>{paramsKey && <button className="button button--quiet" type="button" onClick={() => { setFailure(null); setQueryDraft(""); setSearchParams({}) }}>Limpiar filtros y volver al directorio</button>}</div> : !currentPage ? <p className="producer-directory__loading" role="status">Buscando productores…</p> : currentPage.data.length ? <section className="producer-directory__grid" aria-label="Productores encontrados">{currentPage.data.map((producer: PublicProducerSummary) => <article className="producer-directory-card" key={producer.id}><div className="producer-directory-card__identity"><span className="producer-avatar producer-avatar--large" aria-hidden="true">{producer.public_name.slice(0, 2).toLocaleUpperCase('es-PA')}</span><div><p className="eyebrow eyebrow--quiet">PRODUCTOR LOCAL{producer.contact_level !== 'unverified' ? ' · CONTACTO CONFIRMADO' : ''}</p><h2><Link to={`/productores/${producer.slug}`}>{producer.public_name}</Link></h2></div></div><p className="producer-directory-card__activity">{producer.activity ?? 'Productor local'}</p><p className="producer-directory-card__description">{producer.description ?? 'Conoce sus ofertas disponibles y consulta los detalles directamente.'}</p><p className="producer-directory-card__location">{[producer.location?.name, producer.location?.parent?.name].filter(Boolean).join(' · ') || 'Panamá'}</p><div className="producer-directory-card__footer"><span>{producer.products_count} {producer.products_count === 1 ? 'oferta disponible' : 'ofertas disponibles'}</span><Link className="text-link" to={`/productores/${producer.slug}`}>Conocer productor <ArrowRight size={15} /></Link></div></article>)}</section> : <div className="empty-products catalog-empty" role="status"><Search size={21} /><strong>No encontramos productores con esos filtros</strong><span>Prueba otra actividad o amplía la ubicación.</span><button className="text-link" type="button" onClick={() => { setQueryDraft(''); setSearchParams({}) }}>Limpiar filtros <ArrowRight size={15} /></button></div>}{currentPage && currentPage.last_page > 1 && <nav className="catalog-pagination" aria-label="Paginación de productores"><button className="button button--outline button--small" disabled={currentPage.current_page <= 1} onClick={() => movePage(currentPage.current_page - 1)}>Anterior</button><span aria-live="polite">Página {currentPage.current_page} de {currentPage.last_page}</span><button className="button button--outline button--small" disabled={currentPage.current_page >= currentPage.last_page} onClick={() => movePage(currentPage.current_page + 1)}>Siguiente</button></nav>}<aside className="catalog-safety-note"><ShieldCheck size={18} /><p>El contacto confirmado indica acceso al número, no certifica la calidad del producto ni garantiza una compraventa.</p><Link to="/seguridad">Consejos de seguridad</Link></aside></main><SiteFooter /></div>
}

export function AccessPage({ title, description }: { title: string; description: string }) {
  const isLogin = title.toLocaleLowerCase('es-PA').includes('ingresa')
  const isRegister = title.toLocaleLowerCase('es-PA').includes('publica tu oferta')
  const [formMessage, setFormMessage] = useState('')
  const [mfaChallenge, setMfaChallenge] = useState(false)
  const [mfaRecoveryOpen, setMfaRecoveryOpen] = useState(false)
  const [mfaRecoveryReason, setMfaRecoveryReason] = useState('')
  const [mfaRecoveryBusy, setMfaRecoveryBusy] = useState(false)
  const [mfaRecoverySent, setMfaRecoverySent] = useState(false)
  const [registrationLocations, setRegistrationLocations] = useState<PublicLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(isRegister)
  const [locationsError, setLocationsError] = useState(false)
  const [locationsRetry, setLocationsRetry] = useState(0)
  // multi-step registration state
  const [regStep, setRegStep] = useState(1)
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName, setRegLastName] = useState('')
  const [regCedula, setRegCedula] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPublicName, setRegPublicName] = useState('')
  const [regActivity, setRegActivity] = useState('')
  const [regLocationId, setRegLocationId] = useState<number | null>(null)
  const [regTerms, setRegTerms] = useState(false)
  const [regPrivacy, setRegPrivacy] = useState(false)
  const [regSubmitting, setRegSubmitting] = useState(false)
  const [regStep1Error, setRegStep1Error] = useState('')

  useEffect(() => {
    if (!isRegister) return
    let active = true
    setLocationsLoading(true)
    setLocationsError(false)
    void listLocations().then((locations) => {
      if (active) setRegistrationLocations(locations)
    }).catch(() => {
      if (active) {
        setRegistrationLocations([])
        setLocationsError(true)
      }
    }).finally(() => {
      if (active) setLocationsLoading(false)
    })
    return () => { active = false }
  }, [isRegister, locationsRetry])

  async function submitRegistration() {
    setRegSubmitting(true)
    setFormMessage('')
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
    try {
      const xsrf = await csrfToken()
      const response = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf },
        body: JSON.stringify({
          name: `${regFirstName.trim()} ${regLastName.trim()}`,
          email: regEmail, password: regPassword,
          cedula: regCedula.toUpperCase(), public_name: regPublicName, activity: regActivity || null,
          phone: regPhone, location_id: regLocationId,
          terms_version: 'terms-2026-10', privacy_version: 'privacy-2026-10',
          terms_confirmed: '1', privacy_confirmed: '1',
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(Object.values(body.errors ?? {}).flat().join(' ') || body.message || 'No pudimos completar el registro. Revisa los datos e inténtalo de nuevo.')
      }
      window.location.assign('/verificar')
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : 'No pudimos conectar con el servicio. Inténtalo de nuevo.')
      setRegSubmitting(false)
    }
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
    try {
      const xsrf = await csrfToken()
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf },
        body: JSON.stringify(Object.fromEntries(form)),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(Object.values(body.errors ?? {}).flat().join(' ') || body.message || 'No pudimos completar el acceso. Revisa los datos e inténtalo de nuevo.')
      }
      if (response.status === 202) {
        setMfaChallenge(true)
        setFormMessage('Ingresa el código actual de tu aplicación autenticadora.')
        return
      }
      const result = await response.json().catch(() => ({})) as { mfa_setup_required?: boolean }
      if (result.mfa_setup_required) { window.location.assign('/admin/mfa'); return }
      window.location.assign('/mi-panel')
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : 'No pudimos conectar con el servicio. Inténtalo de nuevo.')
    }
  }
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="access-page page-shell">
        <div className="access-card">
          <span className="access-card__icon"><Sprout size={23} /></span>
          <p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {isLogin ? (
            mfaChallenge ? mfaRecoverySent ? <section className="mfa-recovery-confirmation" role="status"><span className="status-pill status-pill--published">Solicitud registrada</span><h2>Revisaremos tu solicitud</h2><p>Si la solicitud puede procesarse, recibirás instrucciones para continuar. El acceso administrativo permanecerá bloqueado hasta confirmar un autenticador nuevo o demostrar que conservas el anterior.</p><button className="button button--outline" type="button" onClick={() => { setMfaRecoverySent(false); setMfaRecoveryOpen(false); setFormMessage('Ingresa el código actual de tu aplicación autenticadora.') }}>Volver al código MFA</button></section> : mfaRecoveryOpen ? <ValidatedForm key="mfa-recovery-request" className="auth-form mfa-recovery-request" onSubmit={async (event) => { event.preventDefault(); if (mfaRecoveryBusy) return; setMfaRecoveryBusy(true); setFormMessage(''); try { await requestAdminMfaRecovery(mfaRecoveryReason.trim()); setMfaRecoverySent(true) } catch (error) { setFormMessage(error instanceof Error ? error.message : 'No pudimos registrar la solicitud. El motivo se conserva para reintentar.') } finally { setMfaRecoveryBusy(false) } }}>
              <h2>Solicita recuperar tu autenticador</h2><p>Dos revisores distintos verificarán tu identidad. La administración quedará bloqueada hasta volver a registrar MFA. No incluyas documentos ni números de identidad en el motivo.</p><label htmlFor="mfa-recovery-request-reason">Motivo de la solicitud<textarea id="mfa-recovery-request-reason" name="reason" className="resize-none" style={{ resize: 'none' }} value={mfaRecoveryReason} onChange={(event) => setMfaRecoveryReason(event.currentTarget.value)} minLength={10} maxLength={1000} rows={4} required /></label>{formMessage && <p role="alert">{formMessage}</p>}<button className="button button--primary" type="submit" disabled={mfaRecoveryBusy} aria-busy={mfaRecoveryBusy}>{mfaRecoveryBusy ? 'Enviando solicitud…' : 'Solicitar recuperación'}</button><button className="button button--quiet" type="button" onClick={() => { setMfaRecoveryOpen(false); setFormMessage('') }} disabled={mfaRecoveryBusy}>Volver al código MFA</button>
            </ValidatedForm> : <ValidatedForm key="mfa-challenge" className="auth-form" onSubmit={async (event) => { event.preventDefault(); const code = String(new FormData(event.currentTarget).get('code')); try { await completeAdminMfaChallenge(code); window.location.assign('/admin') } catch (error) { if (error instanceof Error && 'status' in error && (error.status === 401 || error.status === 429)) setMfaChallenge(false); setFormMessage(error instanceof Error ? error.message : 'No se pudo completar el segundo paso.') } }}>
              <h2>Verificación en dos pasos</h2><label>Código de autenticación<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required /></label>{formMessage && <p role="status">{formMessage}</p>}<button className="button button--primary" type="submit">Verificar e ingresar</button><button className="button button--quiet" type="button" onClick={() => { setMfaRecoveryOpen(true); setFormMessage('') }}>Perdí mi autenticador</button>
            </ValidatedForm> : <ValidatedForm key="sign-in" className="auth-form" onSubmit={submitLogin}>
              <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
              <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
              {formMessage && <p role="alert">{formMessage}</p>}
              <button className="button button--primary" type="submit">Ingresar <ArrowRight size={16} /></button>
              <Link className="text-link" to="/recuperar">¿Olvidaste tu contraseña?</Link>
              <Link className="text-link" to="/registro">Crear una cuenta de productor</Link>
            </ValidatedForm>
          ) : isRegister ? (
            <div className="reg-wizard">
              <nav className="reg-steps" aria-label="Pasos del registro">
                {[['1','Tus datos'],['2','Emprendimiento'],['3','Ubicación'],['4','Confirmar']].map(([n, lbl]) => (
                  <button key={n} type="button"
                    className={`reg-step-dot${regStep === Number(n) ? ' reg-step-dot--active' : ''}${regStep > Number(n) ? ' reg-step-dot--done' : ''}`}
                    onClick={() => { if (regStep > Number(n)) setRegStep(Number(n)) }}
                    disabled={regStep <= Number(n)}
                    aria-label={`Paso ${n}: ${lbl}`}
                    aria-current={regStep === Number(n) ? 'step' : undefined}
                  >
                    <span className="reg-step-dot__num">{regStep > Number(n) ? '✓' : n}</span>
                    <span className="reg-step-dot__lbl">{lbl}</span>
                  </button>
                ))}
              </nav>

              {regStep === 1 && (
                <ValidatedForm className="auth-form reg-step-form" onSubmit={(e) => {
                  e.preventDefault()
                  const hasLetter = /[a-zA-Z]/.test(regPassword)
                  const hasNumber = /[0-9]/.test(regPassword)
                  const hasSpecial = /[^a-zA-Z0-9]/.test(regPassword)
                  if (!hasLetter || !hasNumber || !hasSpecial) {
                    setRegStep1Error('La contraseña debe incluir al menos una letra, un número y un carácter especial.')
                    return
                  }
                  setRegStep1Error('')
                  setRegStep(2)
                }}>
                  <div className="reg-form-grid">
                    <label className="form-field"><span className="form-field__label">Nombre</span><input name="first_name" type="text" autoComplete="given-name" required value={regFirstName} onChange={e => setRegFirstName(e.target.value)} /><span className="form-field__hint" aria-hidden="true" /></label>
                    <label className="form-field"><span className="form-field__label">Apellido</span><input name="last_name" type="text" autoComplete="family-name" required value={regLastName} onChange={e => setRegLastName(e.target.value)} /><span className="form-field__hint" aria-hidden="true" /></label>
                    <label className="form-field"><span className="form-field__label">Cédula de identidad</span><input name="cedula" type="text" autoComplete="off" placeholder="8-123-4567" pattern="[0-9A-Za-z]{1,3}-[0-9]{1,4}-[0-9]{1,6}" required value={regCedula} onChange={e => setRegCedula(e.target.value)} /><span className="form-field__hint">Ej: 8-123-4567 · Extranjero: E-8-12345</span></label>
                    <label className="form-field"><span className="form-field__label">Correo electrónico</span><input name="email" type="email" autoComplete="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)} /><span className="form-field__hint" aria-hidden="true" /></label>
                    <label className="form-field"><span className="form-field__label">Contraseña</span><input name="password" type="password" autoComplete="new-password" minLength={6} required value={regPassword} onChange={e => { setRegPassword(e.target.value); setRegStep1Error('') }} /><span className="form-field__hint">{regPassword ? (() => { const c = { len: regPassword.length >= 6, let: /[a-zA-Z]/.test(regPassword), num: /[0-9]/.test(regPassword), sym: /[^a-zA-Z0-9]/.test(regPassword) }; return (c.len && c.let && c.num && c.sym) ? <span className="pwd-ok">✓ Contraseña válida</span> : <span className="pwd-strength">{([{l:'6 car.',ok:c.len},{l:'letra',ok:c.let},{l:'número',ok:c.num},{l:'símbolo',ok:c.sym}] as {l:string,ok:boolean}[]).map(({l,ok}) => <span key={l} className={ok ? 'pwd-req pwd-req--ok' : 'pwd-req pwd-req--no'}>{ok ? '✓' : '✗'} {l}</span>)}</span> })() : 'Mín. 6 car. · letra · número · símbolo'}</span></label>
                    <label className="form-field"><span className="form-field__label">Teléfono de contacto</span><input name="phone" type="tel" autoComplete="tel" placeholder="6000-1234" maxLength={40} required value={regPhone} onChange={e => setRegPhone(e.target.value)} /><span className="form-field__hint">Ej: 6000-1234</span></label>
                  </div>
                  {regStep1Error && <p className="form-field__error" role="alert">{regStep1Error}</p>}
                  <button className="button button--primary" type="submit">Continuar <ArrowRight size={16} /></button>
                  <Link className="text-link" to="/ingresar">Ya tengo una cuenta</Link>
                </ValidatedForm>
              )}

              {regStep === 2 && (
                <ValidatedForm className="auth-form reg-step-form" onSubmit={(e) => { e.preventDefault(); setRegStep(3) }}>
                  <div className="reg-form-grid">
                    <label className="form-field"><span className="form-field__label">Nombre público del emprendimiento</span><input name="public_name" type="text" autoComplete="organization" required value={regPublicName} onChange={e => setRegPublicName(e.target.value)} /><span className="form-field__hint" aria-hidden="true" /></label>
                    <label className="form-field"><span className="form-field__label">Actividad principal</span><ActivitySelect defaultValue={regActivity} onChange={(v) => setRegActivity(v)} /><span className="form-field__hint" aria-hidden="true" /></label>
                  </div>
                  <div className="reg-step-nav">
                    <button className="button button--quiet" type="button" onClick={() => setRegStep(1)}>Atrás</button>
                    <button className="button button--primary" type="submit">Continuar <ArrowRight size={16} /></button>
                  </div>
                </ValidatedForm>
              )}

              {regStep === 3 && (
                <div className="auth-form reg-step-form">
                  <fieldset className="location-fieldset">
                    <legend>Ubicación de tu emprendimiento</legend>
                    {locationsLoading && <p role="status">Cargando localidades…</p>}
                    {locationsError && <div role="alert"><p>No pudimos cargar las localidades.</p><button className="button button--outline" type="button" onClick={() => setLocationsRetry(a => a + 1)}>Intentar de nuevo</button></div>}
                    {!locationsLoading && !locationsError && <LocationPicker locations={registrationLocations} idPrefix="registration-location" required value={regLocationId} onChange={setRegLocationId} />}
                    <small>Elige provincia, distrito o corregimiento. No compartas una dirección exacta.</small>
                  </fieldset>
                  <div className="reg-step-nav">
                    <button className="button button--quiet" type="button" onClick={() => setRegStep(2)}>Atrás</button>
                    <button className="button button--primary" type="button" disabled={!regLocationId} onClick={() => setRegStep(4)}>Continuar <ArrowRight size={16} /></button>
                  </div>
                </div>
              )}

              {regStep === 4 && (
                <div className="auth-form reg-step-form">
                  <div className="reg-review">
                    <div className="reg-review__row"><span>Nombre</span><strong>{regFirstName} {regLastName}</strong></div>
                    <div className="reg-review__row"><span>Cédula</span><strong>{regCedula.toUpperCase()}</strong></div>
                    <div className="reg-review__row"><span>Correo</span><strong>{regEmail}</strong></div>
                    <div className="reg-review__row"><span>Teléfono</span><strong>{regPhone}</strong></div>
                    <div className="reg-review__row"><span>Emprendimiento</span><strong>{regPublicName}</strong></div>
                    {regActivity && <div className="reg-review__row"><span>Actividad</span><strong>{regActivity}</strong></div>}
                  </div>
                  <label className="auth-consent"><input type="checkbox" checked={regTerms} onChange={e => setRegTerms(e.target.checked)} required />Acepto los <Link to="/terminos">términos y condiciones</Link>.</label>
                  <label className="auth-consent"><input type="checkbox" checked={regPrivacy} onChange={e => setRegPrivacy(e.target.checked)} required />He leído y acepto la <Link to="/privacidad">política de privacidad</Link>.</label>
                  {formMessage && <p role="alert">{formMessage}</p>}
                  <div className="reg-step-nav">
                    <button className="button button--quiet" type="button" disabled={regSubmitting} onClick={() => setRegStep(3)}>Atrás</button>
                    <button className="button button--primary" type="button" disabled={regSubmitting || !regTerms || !regPrivacy} aria-busy={regSubmitting} onClick={submitRegistration}>{regSubmitting ? 'Creando tu cuenta…' : <>Crear mi cuenta <ArrowRight size={16} /></>}</button>
                  </div>
                  <Link className="text-link" to="/ingresar">Ya tengo una cuenta</Link>
                </div>
              )}
            </div>
          ) : (
            <div className="access-card__actions"><Link className="button button--primary" to="/ingresar">Ingresar <ArrowRight size={16} /></Link><Link className="text-link" to="/registro">Crear una cuenta de productor</Link></div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  return <div className="app-shell"><SiteHeader /><main className="access-page page-shell"><div className="access-card"><p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p><h1>Recupera tu cuenta</h1><p>Te enviaremos instrucciones si el correo corresponde a una cuenta.</p>{sent ? <><p role="status">Si el correo corresponde a una cuenta, enviaremos instrucciones para restablecer la contraseña.</p><Link className="button button--primary" to="/ingresar">Volver a ingresar</Link></> : <ValidatedForm className="auth-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { const email = String(new FormData(event.currentTarget).get('email') ?? ''); await requestPasswordReset(email); setSent(true) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos procesar la solicitud. Inténtalo de nuevo más tarde.') } finally { setBusy(false) } }}><label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>{error && <p role="alert">{error}</p>}<button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar instrucciones'}</button><Link className="text-link" to="/ingresar">Volver a ingresar</Link></ValidatedForm>}</div></main><SiteFooter /></div>
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  return <div className="app-shell"><SiteHeader /><main className="access-page page-shell"><div className="access-card"><p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p><h1>Crea una contraseña nueva</h1>{complete ? <><p role="status">La contraseña se actualizó. Inicia sesión con tu nueva contraseña.</p><Link className="button button--primary" to="/ingresar">Volver a ingresar</Link></> : !token || !email ? <><p role="alert">El enlace de recuperación está incompleto. Solicita uno nuevo para continuar.</p><Link className="button button--primary" to="/recuperar">Solicitar otro enlace</Link></> : <ValidatedForm className="auth-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await resetPassword({ email, token, password: String(form.get('password') ?? ''), password_confirmation: String(form.get('password_confirmation') ?? '') }); setComplete(true) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos cambiar la contraseña. Inténtalo de nuevo más tarde.') } finally { setBusy(false) } }}><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirmar contraseña<input name="password_confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>{error && <p role="alert">{error}</p>}<button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Actualizando…' : 'Actualizar contraseña'}</button><Link className="text-link" to="/ingresar">Volver a ingresar</Link></ValidatedForm>}</div></main><SiteFooter /></div>
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const title = kind === 'terms' ? 'Términos y condiciones' : 'Política de privacidad'
  const content = kind === 'terms' ? termsText : privacyText
  const sections = content.split(/(?=^## )/m).filter(Boolean)
  const renderInline = (text: string) => text.split(/(\*\*.*?\*\*|\[[^\]]+\]\([^)]*\))/g).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) return <a key={index} href={link[2]}>{link[1]}</a>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return part
  })
  return <div className="app-shell"><SiteHeader /><main className="info-page page-shell legal-page"><nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><ChevronRight size={14} /><span aria-current="page">{title}</span></nav><p className="eyebrow eyebrow--quiet">MERCADO SOLIDARIO · VERSIÓN 1.0 · 19 DE OCTUBRE DE 2026</p><h1>{title}</h1><p className="legal-page__notice">Borrador para revisión legal y operativa. Antes de la publicación definitiva, Super Carnes debe completar sus datos legales y canales de contacto.</p>{sections.map((section, index) => {
    const lines = section.trim().split('\n')
    const heading = lines[0].replace(/^## /, '')
    const body = lines.slice(1).join('\n').trim()
    const paragraphs = body.split(/\n\s*\n/).filter(Boolean)
    return <section className="legal-page__section" key={`${heading}-${index}`}><h2>{heading}</h2>{paragraphs.map((paragraph, paragraphIndex) => {
      const normalized = paragraph.replace(/\n/g, ' ')
      if (normalized.startsWith('> ')) return <p className="legal-page__notice" key={paragraphIndex}>{renderInline(normalized.slice(2))}</p>
      const numbered = normalized.match(/^\d+\.\s/)
      const bullets = normalized.match(/^-\s/)
      if (numbered) return <ol key={paragraphIndex}>{normalized.split(/(?=\d+\.\s)/).map((item) => <li key={item}>{renderInline(item.replace(/^\d+\.\s/, ''))}</li>)}</ol>
      if (bullets) return <ul key={paragraphIndex}>{normalized.split(/(?=-\s)/).map((item) => <li key={item}>{renderInline(item.replace(/^-\s/, ''))}</li>)}</ul>
      return <p key={paragraphIndex}>{renderInline(normalized)}</p>
    })}</section>
  })}<p className="legal-page__back"><Link to="/registro">Volver al registro</Link></p></main><SiteFooter /></div>
}

export function ReportPage({ resourceType }: { resourceType: 'product' | 'producer' }) {
  const { id = '' } = useParams()
  const [message, setMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [reference, setReference] = useState('')
  const [evidenceError, setEvidenceError] = useState('')
  const targetLabel = resourceType === 'product' ? 'esta oferta' : 'este perfil de productor'

  function validateEvidence(input: HTMLInputElement): string {
    const files = Array.from(input.files ?? [])
    const error = files.length > 3
      ? 'Puedes adjuntar hasta tres archivos.'
      : files.find((file) => file.size > 5 * 1024 * 1024)
        ? 'Cada archivo debe pesar 5 MB o menos.'
        : files.find((file) => file.type && !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))
          ? 'Adjunta únicamente imágenes JPG o PNG, o documentos PDF.'
          : ''
    input.setCustomValidity(error)
    setEvidenceError(error)
    return error
  }

  return <div className="app-shell"><SiteHeader /><main className="access-page page-shell"><ValidatedForm className="access-card auth-form producer-product-form" onSubmit={async (event) => {
    event.preventDefault()
    if (submittingRef.current || reference) return
    const form = event.currentTarget
    const values = new FormData(form)
    const evidence = form.elements.namedItem('evidence') as HTMLInputElement
    if (validateEvidence(evidence)) { evidence.reportValidity(); return }
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')
    setMessage('')
    try {
      const result = await submitReport({ resource_type: resourceType, resource_id: Number(id), reason_code: String(values.get('reason_code')), description: String(values.get('description')), contact_email: String(values.get('contact_email') || '') || undefined, evidence: evidence.files })
      setReference(result.reference)
      setMessage('Gracias. Recibimos tu reporte y lo revisará el equipo. Tus datos no se mostrarán en público.')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No pudimos enviar el reporte. Tus datos siguen en el formulario; inténtalo de nuevo más tarde.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }} onChange={() => { if (submitError) setSubmitError('') }}><p className="eyebrow eyebrow--quiet">TRUST & SAFETY</p><h1>Reportar {targetLabel}</h1><p>Cuéntanos qué debemos revisar. El reporte y cualquier dato de contacto se mantienen privados.</p><label>Motivo<select name="reason_code" required disabled={Boolean(reference) || submitting}><option value="">Selecciona un motivo</option><option value="incorrect">Información incorrecta</option><option value="unavailable">Oferta no disponible</option><option value="suspicious">Actividad sospechosa</option><option value="unsafe">Riesgo de seguridad</option><option value="other">Otro</option></select></label><label>Detalles<textarea name="description" minLength={10} maxLength={1000} required rows={5} disabled={Boolean(reference) || submitting} className="resize-none" /></label><label>Correo electrónico (opcional)<input name="contact_email" type="email" autoComplete="email" disabled={Boolean(reference) || submitting} /></label><label>Evidencia opcional (hasta 3 imágenes o PDF, máximo 5 MB cada uno)<input name="evidence" type="file" accept="image/jpeg,image/png,application/pdf" multiple disabled={Boolean(reference) || submitting} aria-describedby="report-evidence-help report-evidence-error" onChange={(event) => { setMessage(''); validateEvidence(event.currentTarget) }} /></label><small id="report-evidence-help">JPG, PNG o PDF · hasta 3 archivos · máximo 5 MB por archivo.</small>{evidenceError && <p id="report-evidence-error" role="alert">{evidenceError}</p>}{submitError && <p role="alert">{submitError}</p>}{message && <p role="status">{message}</p>}{submitting && <p role="status">Enviando el reporte…</p>}{reference && <p className="form-help">Referencia de recepción: <strong>{reference}</strong></p>}<button className="button button--primary" type="submit" disabled={Boolean(reference) || submitting} aria-busy={submitting}>{submitting ? 'Enviando…' : 'Enviar reporte'}</button><Link className="text-link" to="/seguridad">Consejos de seguridad</Link></ValidatedForm></main><SiteFooter /></div>
}

export function NotFoundPage() {
  return <InfoPage title="No encontramos esta página" description="Revisa la dirección o vuelve al catálogo para explorar las ofertas." />
}

function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/productos" element={<CatalogPage />} />
      <Route path="/productores" element={<PublicProducerDirectoryPage />} />
      <Route path="/productos/:slug" element={<ProductDetailPage />} />
      <Route path="/productores/:slug" element={<PublicProducerPage />} />
      <Route path="/sobre-el-proyecto" element={<AboutProjectPage />} />
      <Route path="/seguridad" element={<SafetyGuidePage />} />
      <Route path="/ayuda" element={<HelpIndexPage />} />
      <Route path="/ayuda-productor" element={<ProducerHelpPage />} />
      <Route path="/terminos" element={<LegalPage kind="terms" />} />
      <Route path="/privacidad" element={<LegalPage kind="privacy" />} />
      <Route path="/reportar/producto/:id" element={<ReportPage resourceType="product" />} />
      <Route path="/reportar/productor/:id" element={<ReportPage resourceType="producer" />} />
      <Route path="/reportar/:id" element={<ReportPage resourceType="product" />} />
      <Route path="/registro" element={<AccessPage title="Publica tu oferta" description="Crea una cuenta para administrar tu perfil y compartir tus productos." />} />
      <Route path="/ingresar" element={<AccessPage title="Ingresa a tu cuenta" description="Administra tus publicaciones y revisa su estado." />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default PublicRoutes
