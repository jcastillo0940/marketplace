import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Flag, Handshake, Heart, HeartHandshake, Leaf, Lock, MapPin, MessageCircle, Package, Phone, Search, Share2, ShieldCheck, Sprout, Store, Tag, Truck, Users, X } from 'lucide-react';

import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import heroPhoto from '../assets/azuero-harvest.webp';

import yucaImage from '../assets/yuca.svg';
import termsText from '../legal-terms.md?raw';
import privacyText from '../legal-privacy.md?raw';

import ActivitySelect from '../components/ActivitySelect';
import LocationPicker from '../components/LocationPicker';

import ValidatedForm from '../components/ValidatedForm';

import VerificationBadge from '../components/VerificationBadge';

import { completeAdminMfaChallenge, csrfToken, getContactMessageTemplates, DEFAULT_CONTACT_MESSAGE_TEMPLATES, getPublicProducer, getPublicProducers, getProduct, listCategories, listLocations, listProducts, recordContact, recordNoResultSearch, requestAdminMfaRecovery, requestPasswordReset, resetPassword, submitReport, type ApiProduct, type ProducerPublicProfile, type PublicLocation, type PublicProducerSummary, type ProducerVerificationLevel } from '../api/client';

import { TESTIMONIALS, TESTIMONIAL_DESIGN_SAMPLE, type Testimonial } from '../content/testimonials';

import { FavoriteButton, WhatsAppIcon } from './shared/MarketUi';
import { CATEGORY_PHOTOS, categoryVisual } from './shared/marketVisuals';
import { useReveal } from '../hooks/useReveal';

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
  const hasPrice = product.price !== 'Consultar'
  return (
    <article className="product-card">
      <div className="product-card__media">
        <Link className="product-card__image-link" to={`/productos/${product.id}`} aria-label={`Ver ${product.title}`}>
          <div className={`product-card__image ${product.imageClass}`}>
            <img src={product.image} alt={product.imageAlt} loading="lazy" decoding="async" />
          </div>
        </Link>
        <FavoriteButton id={product.id} title={product.title} className="product-card__favorite" />
      </div>
      <div className="product-card__body">
        <h3><Link to={`/productos/${product.id}`}>{product.title}</Link></h3>
        <p className="product-card__location"><MapPin size={14} aria-hidden="true" /> {product.location}</p>
        <p className="product-card__producer">
          <span>{product.producer}</span>
          {product.verified && product.verificationLevel && <VerificationBadge level={product.verificationLevel} label={product.verificationLabel} />}
        </p>
        <p className="product-price">
          <strong>{hasPrice ? product.price : 'Precio a consultar'}</strong>
          {hasPrice && <span>por {product.unit}</span>}
        </p>
        <p className="product-card__availability">{product.availability}</p>
        <Link className="contact-chip" to={`/productos/${product.id}#contactar`} aria-label={`Contactar sobre ${product.title}`}>
          <span className="contact-chip__icon"><WhatsAppIcon size={16} /></span>
          Contactar
        </Link>
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
  const parts = [location?.name, location?.parent?.name, location?.parent?.parent?.name].filter((part): part is string => Boolean(part))
  return parts.filter((part, index) => part !== parts[index - 1]).join(', ')
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

type DetailTab = 'productor' | 'historia' | 'ubicacion' | 'preguntas'
const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'productor', label: 'Productor' },
  { id: 'historia', label: 'Historia' },
  { id: 'ubicacion', label: 'Ubicación' },
  { id: 'preguntas', label: 'Preguntas' },
]

function useProductNeighbors(product: ApiProduct) {
  const [state, setState] = useState<{ slug: string; previous?: ApiProduct; next?: ApiProduct }>({ slug: '' })
  useEffect(() => {
    const controller = new AbortController()
    listProducts(new URLSearchParams({ category: product.category.slug, per_page: '48' }), controller.signal)
      .then((result) => {
        const items = Array.isArray(result?.data) ? result.data : []
        const index = items.findIndex((item) => item.slug === product.slug)
        if (index === -1 || items.length < 2) return
        setState({ slug: product.slug, previous: items[index - 1], next: items[index + 1] })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [product.slug, product.category.slug])
  return state.slug === product.slug ? state : { slug: '' }
}

function useProducerProfile(slug: string) {
  const [state, setState] = useState<{ slug: string; profile: ProducerPublicProfile } | null>(null)
  useEffect(() => {
    let active = true
    getPublicProducer(slug).then((result) => { if (active && result && typeof result === 'object') setState({ slug, profile: result }) }).catch(() => undefined)
    return () => { active = false }
  }, [slug])
  return state?.slug === slug ? state.profile : null
}

function DetailTabs({ product, profile, location }: { product: ApiProduct; profile: ProducerPublicProfile | null; location: string }) {
  const [active, setActive] = useState<DetailTab>('productor')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const producer = product.producer
  const initials = producer.public_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase('es-PA')
  const otherProducts = (Array.isArray(profile?.products) ? profile.products : []).filter((item) => item.slug !== product.slug)
  const publishedCount = Array.isArray(profile?.products) ? profile.products.length : null
  const story = profile?.description?.trim()
  const province = product.producer.location?.parent?.parent?.name ?? product.producer.location?.parent?.name ?? product.producer.location?.name
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? DETAIL_TABS.length - 1 : delta ? (index + delta + DETAIL_TABS.length) % DETAIL_TABS.length : -1
    if (target < 0) return
    event.preventDefault()
    setActive(DETAIL_TABS[target].id)
    tabRefs.current[target]?.focus()
  }
  return (
    <section className="detail-tabs page-shell" aria-label="Más información">
      <div className="detail-tabs__list" role="tablist" aria-label="Información del producto">
        {DETAIL_TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[index] = element }}
            id={`detail-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`detail-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="detail-panel-productor" role="tabpanel" aria-labelledby="detail-tab-productor" hidden={active !== 'productor'} className="detail-producer-panel">
        <div className="detail-producer-panel__profile">
          <span className="detail-producer-panel__avatar" aria-hidden="true">{initials}</span>
          <div>
            <h2>{producer.public_name}</h2>
            {profile?.activity && <p className="detail-producer-panel__activity">{profile.activity}</p>}
            <p className="detail-producer-panel__location"><MapPin size={16} aria-hidden="true" /> {location}</p>
            {producer.verification_level && <VerificationBadge level={producer.verification_level} label={producer.verification_label} />}
            <p className="detail-producer-panel__story">{story || 'Este productor todavía no ha compartido su historia. Escríbele para conocer más sobre su trabajo.'}</p>
            <Link className="button button--outline" to={`/productores/${producer.slug}`}>Ver más productos de este productor <ArrowRight size={16} /></Link>
          </div>
        </div>
        <ul className="detail-producer-panel__facts">
          <li><Store size={22} aria-hidden="true" /><strong>{publishedCount ?? '—'}</strong><span>{publishedCount === 1 ? 'publicación activa' : 'publicaciones activas'}</span></li>
          <li><MapPin size={22} aria-hidden="true" /><strong>{province ?? 'Panamá'}</strong><span>zona de producción</span></li>
          {producer.contact_level !== 'unverified' && <li><BadgeCheck size={22} aria-hidden="true" /><strong>{producer.verification_label ?? 'Contacto confirmado'}</strong><span>nivel de verificación</span></li>}
          <li><HeartHandshake size={22} aria-hidden="true" /><strong>Trato directo</strong><span>sin intermediarios</span></li>
        </ul>
      </div>

      <div id="detail-panel-historia" role="tabpanel" aria-labelledby="detail-tab-historia" hidden={active !== 'historia'} className="detail-text-panel">
        <h2>La historia de {producer.public_name}</h2>
        <p>{story || 'Este productor todavía no ha compartido su historia.'}</p>
        <h3>Sobre este producto</h3>
        <p>{product.description}</p>
      </div>

      <div id="detail-panel-ubicacion" role="tabpanel" aria-labelledby="detail-tab-ubicacion" hidden={active !== 'ubicacion'} className="detail-text-panel">
        <h2>Ubicación</h2>
        <p className="detail-text-panel__location"><MapPin size={18} aria-hidden="true" /> {location}</p>
        <p>Por seguridad mostramos solo la zona general del productor. Acuerda el lugar de entrega o recogida directamente con él.</p>
        <p><strong>Entrega o recogida:</strong> {product.delivery_method}</p>
      </div>

      <div id="detail-panel-preguntas" role="tabpanel" aria-labelledby="detail-tab-preguntas" hidden={active !== 'preguntas'} className="detail-text-panel detail-faq">
        <h2>Preguntas frecuentes</h2>
        <details><summary>¿Cómo compro este producto?</summary><p>Contacta al productor por WhatsApp o teléfono y acuerda con él cantidad, precio final, pago y entrega.</p></details>
        <details><summary>¿Puedo pagar en la plataforma?</summary><p>No. El Empujoncito no procesa pagos. Acuerda el método de pago directamente y verifica antes de enviar dinero.</p></details>
        <details><summary>¿Quién revisa las publicaciones?</summary><p>El equipo revisa cada publicación antes de mostrarla. La verificación no garantiza la calidad del producto ni la transacción.</p></details>
        <details><summary>¿Algo no está bien con esta oferta?</summary><p>Puedes <Link to={`/reportar/producto/${product.id}`}>reportar esta oferta</Link> y el equipo revisará el caso.</p></details>
      </div>

      {otherProducts.length > 0 && (
        <div className="detail-more">
          <div className="home-section__heading">
            <h2>Más productos de este productor</h2>
            <Link className="text-link" to={`/productores/${producer.slug}`}>Ver todos <ArrowRight size={15} /></Link>
          </div>
          <div className="product-grid product-grid--four">
            {otherProducts.slice(0, 4).map((item) => <ApiProductCard key={item.id} product={{ ...item, producer: item.producer ?? product.producer, category: item.category ?? product.category, images: item.images ?? [] }} />)}
          </div>
        </div>
      )}
    </section>
  )
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
  const location = publicLocationLabel(product.producer.location) || 'Panamá'
  const province = product.producer.location?.parent?.parent?.name ?? product.producer.location?.parent?.name ?? product.producer.location?.name ?? 'Panamá'
  useSeoMetadata(`${product.title} · El Empujoncito`, `${product.description} · ${product.producer.public_name}, ${location}.`, image?.url, 'product')
  useScrollToHash()
  const neighbors = useProductNeighbors(product)
  const profile = useProducerProfile(product.producer.slug)
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
  const imageCount = product.images.length
  const showImage = (step: number) => setActiveImageIndex((index) => (index + step + imageCount) % imageCount)

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="product-page">
        <div className="product-page__hero">
        <div className="product-page__crumbs page-shell">
          <nav className="breadcrumbs" aria-label="Ruta de navegación">
            <Link to="/">Inicio</Link><ChevronRight size={14} aria-hidden="true" />
            <Link to={`/productos?category=${encodeURIComponent(product.category.slug)}`}>{product.category.name}</Link><ChevronRight size={14} aria-hidden="true" />
            <span aria-current="page">{product.title}</span>
          </nav>
          {(neighbors.previous || neighbors.next) && (
            <nav className="product-page__siblings" aria-label="Productos de la misma categoría">
              {neighbors.previous && <Link to={`/productos/${neighbors.previous.slug}`}><ArrowLeft size={15} aria-hidden="true" /> Producto anterior</Link>}
              {neighbors.previous && neighbors.next && <span aria-hidden="true">|</span>}
              {neighbors.next && <Link to={`/productos/${neighbors.next.slug}`}>Siguiente producto <ArrowRight size={15} aria-hidden="true" /></Link>}
            </nav>
          )}
        </div>

        <div className="product-page__top page-shell">
          <div className="product-gallery">
            <div className="product-gallery__stage">
              <img className="product-gallery__main" src={imageUrl} alt={image?.alt_text ?? product.title} fetchPriority="high" decoding="async" />
              <FavoriteButton id={product.slug} title={product.title} className="product-gallery__favorite" />
              {imageCount > 1 && (
                <>
                  <button className="carousel-arrow carousel-arrow--prev" type="button" aria-label="Ver foto anterior" onClick={() => showImage(-1)}><ChevronLeft size={20} /></button>
                  <button className="carousel-arrow carousel-arrow--next" type="button" aria-label="Ver foto siguiente" onClick={() => showImage(1)}><ChevronRight size={20} /></button>
                  <span className="product-gallery__counter" aria-live="polite">Foto {activeImageIndex + 1} de {imageCount}</span>
                </>
              )}
            </div>
            {imageCount > 1 && (
              <div className="product-gallery__thumbnails" role="group" aria-label="Seleccionar fotografía">
                {product.images.map((photo, index) => <button key={photo.id} type="button" aria-label={`Ver foto ${index + 1}`} aria-pressed={activeImageIndex === index} onClick={() => setActiveImageIndex(index)}><img src={photo.thumbnail_url ?? photo.url} alt="" loading="lazy" decoding="async" /></button>)}
              </div>
            )}
          </div>

          <div className="product-info">
            <span className="product-info__category">{product.category.name}</span>
            <h1>{product.title}</h1>
            <p className="product-info__byline">Publicado por <Link to={`/productores/${product.producer.slug}`}>{product.producer.public_name}</Link> · {location}</p>
            <p className="product-info__price"><strong>{price}</strong>{price !== 'Consultar' && <span>por {product.unit}</span>}</p>
            <p className="product-info__description">{product.description}</p>

            <ul className="product-info__highlights">
              <li><Leaf size={24} aria-hidden="true" /><span>Producto local<br />de {province}</span></li>
              <li><MessageCircle size={24} aria-hidden="true" /><span>Contacto directo<br />con quien lo produce</span></li>
              <li><BadgeCheck size={24} aria-hidden="true" /><span>Publicación revisada<br />por el equipo</span></li>
            </ul>

            <div className="product-info__contact" id="contactar">
              {contactError && <p role="status">{contactError}</p>}
              <div className="product-info__contact-buttons">
                <a ref={contactLinkRef} className="button button--whatsapp" href={whatsappUrl} aria-disabled={!phone} onClick={(event) => { event.preventDefault(); if (!phone) return; lastContactChannel.current = 'whatsapp'; setContactConfirmation('whatsapp') }}>
                  <WhatsAppIcon size={22} /> {phone ? 'Contactar por WhatsApp' : 'Contacto disponible pronto'} {phone && <ArrowRight size={18} aria-hidden="true" />}
                </a>
                {phone && <a ref={telephoneLinkRef} className="button button--outline button--call" href={telephoneUrl} onClick={(event) => { event.preventDefault(); lastContactChannel.current = 'phone'; setContactConfirmation('phone') }}><Phone size={18} aria-hidden="true" /> Llamar</a>}
              </div>
              <p className="product-info__contact-note">Habla directamente con el productor. Acuerda precio, disponibilidad y entrega.</p>
            </div>

            <dl className="product-info__meta">
              <div><dt><Tag size={18} aria-hidden="true" /> Categoría</dt><dd>{product.category.name}</dd></div>
              <div><dt><MapPin size={18} aria-hidden="true" /> Ubicación</dt><dd>{location}</dd></div>
              <div><dt><Truck size={18} aria-hidden="true" /> Entrega o recogida</dt><dd>{product.delivery_method}</dd></div>
              <div><dt><Package size={18} aria-hidden="true" /> Disponibilidad</dt><dd>{availability}</dd></div>
              <div><dt><CreditCard size={18} aria-hidden="true" /> Pagos</dt><dd>Se acuerdan con el productor. La plataforma no procesa pagos.</dd></div>
            </dl>

            <div className="product-info__secondary">
              <button className="text-link" type="button" onClick={() => void shareProduct()}><Share2 size={15} aria-hidden="true" /> Compartir oferta</button>
              <Link className="text-link" to={`/reportar/producto/${product.id}`}><Flag size={15} aria-hidden="true" /> Reportar esta oferta</Link>
              <Link className="text-link" to="/seguridad"><ShieldCheck size={15} aria-hidden="true" /> Recomendaciones de seguridad</Link>
            </div>
            {shareStatus && <p role="status" className="product-info__status">{shareStatus}</p>}
          </div>
        </div>
        </div>

        {profile?.description?.trim() && (
          <section className="producer-story-band page-shell">
            <span className="producer-story-band__avatar" aria-hidden="true">
              {product.producer.public_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toLocaleUpperCase('es-PA')}
            </span>
            <blockquote className="producer-story-band__body">
              <p className="eyebrow eyebrow--quiet">LA HISTORIA DEL PRODUCTOR</p>
              <p className="producer-story-band__quote">{profile.description}</p>
              <footer className="producer-story-band__byline">
                — {product.producer.public_name}{profile.activity ? `, ${profile.activity}` : ''}
              </footer>
            </blockquote>
          </section>
        )}

        <DetailTabs product={product} profile={profile} location={location} />

        {contactConfirmation && <DirectContactConfirmation channel={contactConfirmation} href={contactConfirmation === 'whatsapp' ? whatsappUrl! : telephoneUrl!} message={contactConfirmation === 'whatsapp' ? whatsappMessage : undefined} onCancel={cancelContactConfirmation} onContinue={confirmContact} />}
      </main>
      <SiteFooter />
    </div>
  )
}

const POPULAR_SEARCHES = ['Café', 'Miel', 'Huevos', 'Plantas', 'Artesanías', 'Productos de limpieza', 'Ropa', 'Quesos']

function useScrollToHash() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])
}

function TestimonialCarousel({ items, sample }: { items: Testimonial[]; sample: boolean }) {
  const [index, setIndex] = useState(0)
  const item = items[index]
  const go = (step: number) => setIndex((current) => (current + step + items.length) % items.length)
  return (
    <section className="home-testimonials page-shell" id="historias" aria-roledescription="carrusel" aria-label="Historias de productores">
      {sample && <p className="home-testimonials__sample">Ejemplo de diseño · reemplaza este contenido en <code>src/content/testimonials.ts</code></p>}
      <div className="home-testimonials__card">
        {items.length > 1 && <button className="carousel-arrow carousel-arrow--prev" type="button" aria-label="Historia anterior" onClick={() => go(-1)}><ChevronLeft size={18} /></button>}
        <div className="home-testimonials__portrait" aria-hidden="true">
          {item.photo ? <img src={item.photo} alt="" loading="lazy" decoding="async" /> : <span>{item.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>}
        </div>
        <figure className="home-testimonials__body" aria-live="polite">
          <blockquote>“{item.quote}”</blockquote>
          <figcaption><strong>{item.name}</strong><span>{item.role}</span></figcaption>
        </figure>
        <div className="home-testimonials__leaf" aria-hidden="true"><Leaf size={120} strokeWidth={1.1} /></div>
        {items.length > 1 && <button className="carousel-arrow carousel-arrow--next" type="button" aria-label="Historia siguiente" onClick={() => go(1)}><ChevronRight size={18} /></button>}
      </div>
      {items.length > 1 && (
        <div className="carousel-dots" role="group" aria-label="Elegir historia">
          {items.map((_, dot) => <button key={dot} type="button" aria-label={`Historia ${dot + 1}`} aria-pressed={dot === index} onClick={() => setIndex(dot)} />)}
        </div>
      )}
    </section>
  )
}

/** El inicio muestra una sola fila de categorías; el resto vive en el catálogo. */
const HOME_CATEGORY_LIMIT = 7

export function HomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [province, setProvince] = useState('')
  const [provinces, setProvinces] = useState<PublicLocation[]>([])
  const [homeProducts, setHomeProducts] = useState<ApiProduct[] | null>(null)
  const [homeCategories, setHomeCategories] = useState<Array<{ id: number; name: string; slug: string }>>([])
  const [homeError, setHomeError] = useState('')
  const [homeRetry, setHomeRetry] = useState(0)
  useScrollToHash()
  useReveal([homeCategories.length, homeProducts?.length ?? -1])

  useEffect(() => {
    void listCategories().then((result) => setHomeCategories(Array.isArray(result) ? result.filter((c) => c.parent_id === null) : [])).catch(() => setHomeCategories([]))
    void listLocations().then((result) => setProvinces(Array.isArray(result) ? result.filter((item) => item.level === 'province') : [])).catch(() => setProvinces([]))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    listProducts(new URLSearchParams({ per_page: '4' }), controller.signal)
      .then((result) => { setHomeProducts(result.data); setHomeError('') })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setHomeProducts([])
          setHomeError(error.message)
        }
      })
    return () => controller.abort()
  }, [homeRetry])

  const searchParams = new URLSearchParams()
  if (query.trim()) searchParams.set('q', query.trim())
  if (province) searchParams.set('province', province)
  const searchHref = `/productos${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const testimonials = TESTIMONIALS.length ? TESTIMONIALS : import.meta.env.DEV && import.meta.env.MODE !== 'test' ? TESTIMONIAL_DESIGN_SAMPLE : []

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="home">
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero__photo" aria-hidden="true">
            <img src={heroPhoto} alt="" fetchPriority="high" decoding="async" />
          </div>
          <div className="home-hero__inner page-shell">
            <div className="home-hero__copy">
              <p className="home-eyebrow" data-reveal="slide-left">Productos locales, personas reales</p>
              <h1 id="hero-title" data-reveal="blur-in" style={{ animationDelay: '80ms' }}>Encuentra <em className="home-hero__accent">emprendedores</em> <span>de nuestra tierra.</span></h1>
              <p className="home-hero__lead" data-reveal="fade-up" style={{ animationDelay: '200ms' }}>Descubre productos frescos, artesanías, alimentos y más. Conecta directamente con quienes los producen y apoya el talento local.</p>
              <ul className="home-hero__benefits" aria-label="Por qué El Empujoncito" data-reveal="fade-up" style={{ animationDelay: '320ms' }}>
                <li><span className="home-hero__benefit-icon"><Leaf size={20} /></span>Productos<br />locales</li>
                <li><span className="home-hero__benefit-icon home-hero__benefit-icon--blue"><Users size={20} /></span>Trato directo<br />con productores</li>
                <li><span className="home-hero__benefit-icon"><Heart size={20} /></span>Impulsa<br />nuestra economía</li>
              </ul>
            </div>
            <p className="home-hero__note" aria-hidden="true" data-reveal="fade-in" style={{ animationDelay: '480ms' }}>Apoyar lo local<br />también nos alimenta</p>
          </div>
          <span className="sr-only">Fotografía: productor del interior de Panamá con yuca, plátanos y tomates cosechados en su finca.</span>
        </section>

        <section className="home-search page-shell" aria-label="Busca productos y emprendedores">
          <ValidatedForm className="home-search__panel" role="search" noValidate data-reveal="fade-up" onSubmit={(event) => { event.preventDefault(); navigate(searchHref) }}>
            <label className="home-search__field home-search__field--query">
              <Search size={19} aria-hidden="true" />
              <input
                id="product-search"
                type="search"
                role="searchbox"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="¿Qué estás buscando? Ej. café, miel, artesanías…"
                aria-label="Buscar productos"
                autoComplete="off"
                enterKeyHint="search"
              />
              {query && (
                <button className="search-clear" type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}>
                  <X size={16} />
                </button>
              )}
            </label>
            <label className="home-search__field home-search__field--province">
              <MapPin size={18} aria-hidden="true" />
              <select aria-label="Filtrar por provincia" value={province} onChange={(event) => setProvince(event.target.value)}>
                <option value="">Todas las provincias</option>
                {provinces.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
              </select>
              <ChevronDown className="home-search__chevron" size={16} aria-hidden="true" />
            </label>
            <Link className="button button--primary home-search__submit" to={searchHref}>
              Buscar
            </Link>
          </ValidatedForm>
          <div className="home-search__popular">
            <span id="popular-searches-label">Búsquedas populares:</span>
            <ul aria-labelledby="popular-searches-label">
              {POPULAR_SEARCHES.map((term) => <li key={term}><Link className="chip" to={`/productos?q=${encodeURIComponent(term)}`}>{term}</Link></li>)}
            </ul>
          </div>
        </section>

        <section className="home-section page-shell" aria-labelledby="category-title">
          <p className="home-eyebrow">Categorías</p>
          <div className="home-section__heading" data-reveal="fade-up">
            <h2 id="category-title">Explora por categoría</h2>
            <Link className="text-link" to="/productos">Ver todas las categorías <ArrowRight size={15} /></Link>
          </div>
          {homeCategories.length > 0 ? (
            <ul className="category-rail">
              {homeCategories.slice(0, HOME_CATEGORY_LIMIT).map((category) => {
                const { Icon, tone } = categoryVisual(category.name)
                const photo = CATEGORY_PHOTOS[category.slug]
                return (
                  <li key={category.id} data-reveal="scale-in">
                    <Link className={`category-card category-card--${tone}`} to={`/productos?category=${encodeURIComponent(category.slug)}`}>
                      <span className="category-card__media" aria-hidden="true">
                        {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : <Icon className="category-card__art" size={58} strokeWidth={1.25} />}
                      </span>
                      <span className="category-card__footer">
                        <span className="category-card__name">{category.name}</span>
                        <span className="category-card__arrow" aria-hidden="true"><ChevronRight size={15} /></span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="home-section__placeholder">Las categorías aparecerán aquí en cuanto estén configuradas.</p>
          )}
        </section>

        <section className="home-section home-section--tight page-shell" aria-labelledby="featured-title">
          <p className="home-eyebrow">Hecho en nuestra tierra</p>
          <div className="home-section__heading" data-reveal="fade-up">
            <div>
              <h2 id="featured-title">Productos destacados</h2>
              <p>Conoce algunos de los productos que puedes encontrar en nuestra plataforma.</p>
            </div>
            <Link className="text-link" to="/productos">Ver todos los productos <ArrowRight size={15} /></Link>
          </div>
          {homeError ? (
            <div className="empty-products" role="alert"><strong>No pudimos cargar las ofertas</strong><span>{homeError}</span><button className="text-link" type="button" onClick={() => { setHomeError(''); setHomeProducts(null); setHomeRetry((attempt) => attempt + 1) }}>Intentar de nuevo</button><Link className="text-link" to="/productos">Explorar el catálogo <ArrowRight size={15} /></Link></div>
          ) : homeProducts === null ? (
            <p role="status" className="home-section__placeholder">Cargando productos locales…</p>
          ) : homeProducts.length ? (
            <div className="product-grid product-grid--four">
              {homeProducts.map((product) => <div key={product.id} data-reveal="fade-up"><ApiProductCard product={product} /></div>)}
            </div>
          ) : (
            <div className="empty-products" role="status">
              <Sprout size={21} />
              <strong>Pronto encontrarás productos locales</strong>
              <span>Cuando una publicación sea revisada y aprobada aparecerá aquí.</span>
            </div>
          )}
        </section>

        <section className="home-story" id="como-funciona" aria-labelledby="how-title">
          <div className="home-story__people" data-reveal="slide-left">
            <img src={heroPhoto} alt="Productor de Azuero junto a su cosecha de yuca, plátano y tomate" loading="lazy" decoding="async" />
            <div className="home-story__people-copy">
              <h2>Personas que hacen que nuestra tierra crezca.</h2>
              <Link className="button button--ghost-light" to="/productores">Conoce sus historias <ArrowRight size={16} /></Link>
            </div>
          </div>
          <div className="home-story__how" data-reveal="fade-up">
            <p className="home-eyebrow">Sin intermediarios</p>
            <h2 id="how-title">¿Cómo funciona?</h2>
            <p className="home-story__sub">Es muy fácil. Conecta, descubre y apoya.</p>
            <ol className="how-steps">
              <li data-reveal="fade-up"><span className="how-steps__icon"><Search size={22} /></span><span className="how-steps__number">1</span><div><strong>Busca productos</strong><p>y encuentra emprendedores de tu región.</p></div></li>
              <li data-reveal="fade-up"><span className="how-steps__icon how-steps__icon--whatsapp"><WhatsAppIcon size={22} /></span><span className="how-steps__number">2</span><div><strong>Contacta directamente</strong><p>por WhatsApp o teléfono.</p></div></li>
              <li data-reveal="fade-up"><span className="how-steps__icon"><Handshake size={22} /></span><span className="how-steps__number">3</span><div><strong>Acuerda la compra</strong><p>directamente con el productor.</p></div></li>
            </ol>
            <Link className="text-link" to="/seguridad">Consejos para comprar con confianza <ArrowRight size={15} /></Link>
          </div>
        </section>

        <section className="home-publish page-shell" aria-labelledby="publish-title">
          <div className="home-publish__band">
            <div className="home-publish__copy" data-reveal="slide-left">
              <p className="home-eyebrow home-eyebrow--dark">¿Eres productor o emprendedor?</p>
              <h2 id="publish-title">Publica tu producto gratis.</h2>
              <p>Llega a más personas y haz crecer tu negocio.</p>
              <Link className="button button--primary" to="/registro">Publicar ahora <ArrowRight size={16} /></Link>
            </div>
            <p className="home-publish__note" aria-hidden="true" data-reveal="fade-in" style={{ animationDelay: '200ms' }}>Tu talento<br />también<br />empuja<br />comunidades</p>
            <div className="home-publish__photo" aria-hidden="true" data-reveal="scale-in" style={{ animationDelay: '150ms' }}>
              <img src={heroPhoto} alt="" loading="lazy" decoding="async" />
            </div>
          </div>
          <p className="home-publish__help">¿Necesitas una mano para publicar? <Link to="/ayuda-productor">Mira la guía paso a paso</Link></p>
        </section>

        <section className="home-values page-shell" aria-label="Por qué El Empujoncito">
          <ul>
            <li data-reveal="fade-up"><span className="home-values__icon"><Sprout size={24} /></span><div><strong>Una iniciativa con propósito</strong><p>Impulsada por Super Carnes.</p></div></li>
            <li data-reveal="fade-up"><span className="home-values__icon"><ShieldCheck size={24} /></span><div><strong>Contacto directo</strong><p>Hablas directamente con el productor.</p></div></li>
            <li data-reveal="fade-up"><span className="home-values__icon"><Users size={24} /></span><div><strong>Apoyo a comunidades</strong><p>Compras que generan impacto local.</p></div></li>
            <li data-reveal="fade-up"><span className="home-values__icon"><Lock size={24} /></span><div><strong>Seguro y confiable</strong><p>Revisamos cada publicación antes de que sea visible.</p></div></li>
          </ul>
        </section>

        {testimonials.length > 0 && <TestimonialCarousel items={testimonials} sample={TESTIMONIALS.length === 0} />}
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
      if (active) setCategoriesFromApi(Array.isArray(result) ? result.filter((c) => c.parent_id === null) : [])
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
  const initials = profile ? profile.public_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toLocaleUpperCase('es-PA') : ''
  const locationLabel = profile ? publicLocationLabel(profile.location) || 'Panamá' : ''
  const province = profile?.location?.parent?.parent?.name ?? profile?.location?.parent?.name ?? profile?.location?.name ?? 'Panamá'
  useSeoMetadata(
    profile ? `${profile.public_name} · El Empujoncito` : 'Productores locales · El Empujoncito',
    profile ? `${profile.public_name}${profile.activity ? `: ${profile.activity}` : ''}. ${profile.description ?? ''} ${locationLabel}. Explora sus ofertas y contacta directamente.` : 'Conoce productores locales del interior de Panamá y explora sus ofertas.',
    undefined,
    'profile',
  )
  useEffect(() => { void getPublicProducer(slug).then(setProfile).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el perfil.')) }, [slug])

  if (error) return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><div className="empty-products" role="alert"><strong>{error}</strong><Link className="button button--outline" to="/productores">Volver al directorio</Link></div></main><SiteFooter /></div>
  if (!profile) return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p role="status">Cargando perfil…</p></main><SiteFooter /></div>

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="product-page">

        {/* ── Hero ── */}
        <div className="product-page__hero">
          <div className="product-page__crumbs page-shell">
            <nav className="breadcrumbs" aria-label="Ruta de navegación">
              <Link to="/">Inicio</Link><ChevronRight size={14} aria-hidden="true" />
              <Link to="/productores">Productores</Link><ChevronRight size={14} aria-hidden="true" />
              <span aria-current="page">{profile.public_name}</span>
            </nav>
          </div>

          <div className="product-page__top page-shell">

            {/* Left – visual identity */}
            <div className="producer-profile-visual">
              <div className="producer-profile-visual__avatar" aria-hidden="true">{initials}</div>
              <ul className="producer-profile-visual__facts">
                <li><Store size={18} aria-hidden="true" /><div><strong>{profile.products.length}</strong><span>{profile.products.length === 1 ? 'oferta publicada' : 'ofertas publicadas'}</span></div></li>
                <li><MapPin size={18} aria-hidden="true" /><div><strong>{province}</strong><span>zona de producción</span></div></li>
                {profile.contact_level !== 'unverified' && <li><BadgeCheck size={18} aria-hidden="true" /><div><strong>{profile.verification_label}</strong><span>verificación confirmada</span></div></li>}
                <li><HeartHandshake size={18} aria-hidden="true" /><div><strong>Trato directo</strong><span>sin intermediarios</span></div></li>
              </ul>
            </div>

            {/* Right – info + contact */}
            <div className="product-info">
              <span className="product-info__category">{profile.activity ?? 'Productor local'}</span>
              <h1>{profile.public_name}</h1>
              <p className="product-info__byline"><MapPin size={15} aria-hidden="true" /> {locationLabel}</p>
              <VerificationBadge level={profile.verification_level} label={profile.verification_label} />

              <ul className="product-info__highlights">
                <li><Sprout size={24} aria-hidden="true" /><span>Productor local<br />de {province}</span></li>
                <li><MessageCircle size={24} aria-hidden="true" /><span>Contacto directo<br />sin intermediarios</span></li>
                <li><BadgeCheck size={24} aria-hidden="true" /><span>Perfil revisado<br />por el equipo</span></li>
              </ul>

              <PublicProducerContact profile={profile} />

              <div className="product-info__secondary">
                <Link className="text-link" to={`/reportar/productor/${profile.id}`}><Flag size={15} aria-hidden="true" /> Reportar este perfil</Link>
                <Link className="text-link" to="/seguridad"><ShieldCheck size={15} aria-hidden="true" /> Consejos de seguridad</Link>
              </div>
            </div>

          </div>
        </div>

        {/* ── Historia del productor ── */}
        {profile.description?.trim() && (
          <section className="producer-story-band page-shell">
            <span className="producer-story-band__avatar" aria-hidden="true">{initials}</span>
            <blockquote className="producer-story-band__body">
              <p className="eyebrow eyebrow--quiet">LA HISTORIA DEL PRODUCTOR</p>
              <p className="producer-story-band__quote">{profile.description}</p>
              <footer className="producer-story-band__byline">— {profile.public_name}{profile.activity ? `, ${profile.activity}` : ''}</footer>
            </blockquote>
          </section>
        )}

        {/* ── Ofertas ── */}
        <section className="detail-more page-shell" aria-label="Ofertas publicadas">
          <div className="home-section__heading">
            <h2>Ofertas de {profile.public_name}</h2>
            {profile.products.length > 0 && <span>{profile.products.length} {profile.products.length === 1 ? 'oferta' : 'ofertas'}</span>}
          </div>
          {profile.products.length
            ? <div className="product-grid product-grid--four">{profile.products.map((product) => <ApiProductCard key={product.id} product={product} />)}</div>
            : <div className="empty-products"><Store size={24} aria-hidden="true" /><strong>Aún no hay ofertas publicadas</strong><span>Este productor no tiene publicaciones activas en este momento.</span></div>}
        </section>

        {/* ── Safety note ── */}
        <aside className="catalog-safety-note page-shell">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>El contacto confirmado indica acceso al número, no certifica la calidad del producto ni garantiza una compraventa.</p>
          <Link to="/seguridad">Consejos de seguridad</Link>
        </aside>

      </main>
      <SiteFooter />
    </div>
  )
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
    void listCategories().then((result) => setCategories(result.filter((c) => c.parent_id === null))).catch(() => setCategories([]))
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

function RegistroPage() {
  const [showRegForm, setShowRegForm] = useState(false)

  // Login state
  const [loginMessage, setLoginMessage] = useState('')

  // Registration state
  const [regMessage, setRegMessage] = useState('')
  const [registrationLocations, setRegistrationLocations] = useState<PublicLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locationsError, setLocationsError] = useState(false)
  const [locationsRetry, setLocationsRetry] = useState(0)
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
    let active = true
    setLocationsLoading(true)
    void listLocations().then((locs) => {
      if (active) setRegistrationLocations(locs)
    }).catch(() => {
      if (active) { setRegistrationLocations([]); setLocationsError(true) }
    }).finally(() => { if (active) setLocationsLoading(false) })
    return () => { active = false }
  }, [locationsRetry])

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
    setLoginMessage('')
    try {
      const xsrf = await csrfToken()
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST', credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf },
        body: JSON.stringify(Object.fromEntries(form)),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(Object.values(body.errors ?? {}).flat().join(' ') || body.message || 'Revisa los datos e inténtalo de nuevo.')
      }
      window.location.assign('/mi-panel')
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : 'No pudimos conectar con el servicio.')
    }
  }

  async function submitRegistration() {
    setRegSubmitting(true)
    setRegMessage('')
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
    try {
      const xsrf = await csrfToken()
      const response = await fetch(`${apiBase}/auth/register`, {
        method: 'POST', credentials: 'include',
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
        throw new Error(Object.values(body.errors ?? {}).flat().join(' ') || body.message || 'No pudimos completar el registro. Revisa los datos.')
      }
      window.location.assign('/verificar')
    } catch (error) {
      setRegMessage(error instanceof Error ? error.message : 'No pudimos conectar con el servicio.')
      setRegSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="auth-gateway page-shell">
        <div className="auth-gateway__header">
          <span className="access-card__icon"><Sprout size={23} /></span>
          <p className="eyebrow eyebrow--quiet">PORTAL DE PRODUCTORES</p>
          <h1>Publica tus productos en El Empujoncito</h1>
          <p>La plataforma gratuita para productores y emprendedores del interior de Panamá.</p>
        </div>

        {!showRegForm ? (
          <div className="auth-gateway__panels">
            {/* ── Login panel (desktop only) ── */}
            <div className="auth-gateway__panel auth-gateway__panel--login">
              <h2 className="auth-gateway__panel-title">Ya tengo cuenta</h2>
              <p className="auth-gateway__panel-sub">Ingresa a tu panel de productor</p>
              <ValidatedForm className="auth-form" onSubmit={submitLogin}>
                <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
                <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
                {loginMessage && <p role="alert">{loginMessage}</p>}
                <button className="button button--primary" type="submit">Ingresar <ArrowRight size={16} /></button>
                <Link className="text-link" to="/recuperar">¿Olvidaste tu contraseña?</Link>
              </ValidatedForm>
            </div>

            <div className="auth-gateway__divider" aria-hidden="true"><span>o</span></div>

            {/* ── Register CTA panel ── */}
            <div className="auth-gateway__panel auth-gateway__panel--register-cta">
              <h2 className="auth-gateway__panel-title">Crear mi cuenta gratis</h2>
              <p className="auth-gateway__panel-sub">Únete y empieza a publicar tus ofertas en El Empujoncito, la plataforma gratuita para productores del interior de Panamá.</p>
              <button className="button button--primary button--large" type="button" onClick={() => setShowRegForm(true)}>
                Crear mi cuenta gratis <ArrowRight size={18} />
              </button>
              <Link className="text-link auth-gateway__login-mobile" to="/ingresar">Ya tengo una cuenta</Link>
            </div>
          </div>
        ) : (
          <div className="auth-gateway__register-only">
            <h2 className="auth-gateway__panel-title">Crear mi cuenta gratis</h2>
            <p className="auth-gateway__panel-sub">Únete y empieza a publicar tus ofertas</p>
            <div className="reg-wizard">
              <nav className="reg-steps" aria-label="Pasos del registro">
                {([['1','Tus datos'],['2','Emprendimiento'],['3','Ubicación'],['4','Confirmar']] as [string,string][]).map(([n, lbl]) => (
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
                  if (!hasLetter || !hasNumber || !hasSpecial) { setRegStep1Error('La contraseña debe incluir al menos una letra, un número y un carácter especial.'); return }
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
                    {!locationsLoading && !locationsError && <LocationPicker locations={registrationLocations} idPrefix="gw-location" required value={regLocationId} onChange={setRegLocationId} />}
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
                  {regMessage && <p role="alert">{regMessage}</p>}
                  <div className="reg-step-nav">
                    <button className="button button--quiet" type="button" disabled={regSubmitting} onClick={() => setRegStep(3)}>Atrás</button>
                    <button className="button button--primary" type="button" disabled={regSubmitting || !regTerms || !regPrivacy} aria-busy={regSubmitting} onClick={submitRegistration}>{regSubmitting ? 'Creando tu cuenta…' : <>Crear mi cuenta <ArrowRight size={16} /></>}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
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
      <Route path="/registro" element={<RegistroPage />} />
      <Route path="/ingresar" element={<AccessPage title="Ingresa a tu cuenta" description="Administra tus publicaciones y revisa su estado." />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default PublicRoutes
