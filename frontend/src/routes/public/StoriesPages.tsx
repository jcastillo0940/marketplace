import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Camera, ChevronRight, MapPin, PenLine, Play, ShieldCheck, Sprout, Video } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getSessionUser, getStory, listStories, storyEmbedUrl, storyVideoThumbnail, type ProducerStory } from '../../api/client'
import storiesHeroPhoto from '../../assets/azuero-harvest.webp'
import leafBlue from '../../assets/mercapro/decor/hoja-azul.svg'
import leafOrange from '../../assets/mercapro/decor/hoja-naranja.svg'
import { SiteFooter, SiteHeader } from '../shared/SiteChrome'
import { useSeoMetadata } from '../shared/SeoMetadata'

const STORIES_PER_PAGE = 9

function storyPlace(story: ProducerStory): string {
  const location = story.producer?.location
  if (!location) return 'Panamá'
  return [location.name, location.parent?.name, location.parent?.parent?.name].filter(Boolean).slice(0, 2).join(', ')
}

function storyExcerpt(body: string, length = 180): string {
  const text = body.replace(/\s+/g, ' ').trim()
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, '')}…` : text
}

function storyDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

/** Destino del botón "Comparte tu historia": el panel si ya hay sesión, el registro si no. */
function useShareStoryHref(): string {
  const [href, setHref] = useState('/registro')
  useEffect(() => { void getSessionUser().then((user) => setHref(user ? '/mis-historias' : '/registro')) }, [])
  return href
}

/** Foto o video de la historia. El reproductor externo solo se carga cuando la persona pulsa "reproducir". */
function StoryMedia({ story, variant = 'card', autoplayOnClick = true }: { story: ProducerStory; variant?: 'card' | 'feature' | 'detail'; autoplayOnClick?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const videoThumbnail = story.video ? storyVideoThumbnail(story.video) : null
  // En la ficha, el video usa su propia miniatura para que la foto se muestre aparte y no se repita.
  const poster = variant === 'detail' && videoThumbnail ? videoThumbnail : (variant === 'card' ? story.thumbnail_url : story.image_url) ?? videoThumbnail
  if (story.video && playing) {
    return (
      <div className={`story-media story-media--${variant}`}>
        <iframe src={`${storyEmbedUrl(story.video)}${autoplayOnClick ? '&autoplay=1' : ''}`} title={`Video: ${story.title}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    )
  }
  return (
    <div className={`story-media story-media--${variant}${poster ? '' : ' story-media--empty'}`}>
      {poster ? <img src={poster} alt="" loading={variant === 'card' ? 'lazy' : undefined} decoding="async" /> : <span className="story-media__initials" aria-hidden="true">{story.producer?.public_name.slice(0, 1) ?? 'M'}</span>}
      {story.video && (
        <button type="button" className="story-media__play" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setPlaying(true) }} aria-label={`Reproducir el video de ${story.producer?.public_name ?? 'esta historia'}`}>
          <Play size={variant === 'card' ? 22 : 30} fill="currentColor" aria-hidden="true" />
        </button>
      )}
      {story.video && <span className="story-media__badge"><Video size={14} aria-hidden="true" /> Video</span>}
    </div>
  )
}

function StoryProducer({ story }: { story: ProducerStory }) {
  if (!story.producer) return null
  return (
    <p className="story-producer">
      <span className="story-producer__avatar" aria-hidden="true">{story.producer.public_name.slice(0, 1)}</span>
      <span>
        <strong>{story.producer.public_name}</strong>
        <small><MapPin size={13} aria-hidden="true" /> {storyPlace(story)}{story.producer.activity ? ` · ${story.producer.activity}` : ''}</small>
      </span>
    </p>
  )
}

function StoryCard({ story }: { story: ProducerStory }) {
  return (
    <article className="story-card">
      <Link className="story-card__media-link" to={`/historias/${story.id}`} tabIndex={-1} aria-hidden="true"><StoryMedia story={story} /></Link>
      <div className="story-card__body">
        {story.quote && <p className="story-card__quote">“{story.quote}”</p>}
        <h3><Link to={`/historias/${story.id}`}>{story.title}</Link></h3>
        <p className="story-card__excerpt">{storyExcerpt(story.body, 140)}</p>
        <StoryProducer story={story} />
      </div>
    </article>
  )
}

function ShareStoryBand({ href }: { href: string }) {
  return (
    <section className="stories-share page-shell" aria-labelledby="share-title">
      <div className="stories-share__band">
        <img className="stories-share__leaf" src={leafOrange} alt="" aria-hidden="true" />
        <div className="stories-share__copy">
          <p className="home-eyebrow home-eyebrow--dark">¿Eres productor o artesano?</p>
          <h2 id="share-title">Tu historia también inspira.</h2>
          <p>Cuéntanos cómo empezaste, qué hace especial lo que produces y cómo sigues adelante. Puedes escribirla y sumar una foto o un video.</p>
          <Link className="button stories-share__cta" to={href}><PenLine size={18} aria-hidden="true" /> Comparte tu historia <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <ol className="stories-share__steps">
          <li><span><PenLine size={20} aria-hidden="true" /></span><div><strong>Escríbela</strong><small>Con tus palabras, desde tu panel.</small></div></li>
          <li><span><Camera size={20} aria-hidden="true" /></span><div><strong>Suma foto o video</strong><small>Un enlace de YouTube o Vimeo.</small></div></li>
          <li><span><ShieldCheck size={20} aria-hidden="true" /></span><div><strong>La revisamos</strong><small>Y la publicamos para todos.</small></div></li>
        </ol>
      </div>
    </section>
  )
}

export function StoriesPage() {
  const [stories, setStories] = useState<ProducerStory[] | null>(null)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const shareHref = useShareStoryHref()
  useSeoMetadata('Historias de productores · Mercapro', 'Personas reales, historias reales: conoce en sus propias palabras a los productores y artesanos de Panamá que publican en Mercapro.')

  useEffect(() => {
    const controller = new AbortController()
    listStories(page, STORIES_PER_PAGE, controller.signal)
      .then((result) => {
        setStories((current) => page === 1 || !current ? result.data : [...current, ...result.data])
        setLastPage(result.last_page)
        setTotal(result.total)
        setError('')
      })
      .catch((reason: unknown) => { if (reason instanceof Error && reason.name !== 'AbortError') { setError(reason.message); setStories((current) => current ?? []) } })
    return () => controller.abort()
  }, [page, retry])

  const [featured, ...rest] = stories ?? []

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="stories-page">
        <section className="stories-hero" aria-labelledby="stories-title">
          <img className="stories-hero__leaf stories-hero__leaf--blue" src={leafBlue} alt="" aria-hidden="true" />
          <div className="stories-hero__inner page-shell">
            <div className="stories-hero__copy">
              <nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">Historias</span></nav>
              <p className="home-eyebrow">Historias que nos alimentan</p>
              <h1 id="stories-title">Personas reales. <span>Historias</span> <em>que nos unen.</em></h1>
              <p className="stories-hero__lead">Detrás de cada producto hay una familia, una finca o un taller que sigue adelante. Conócelos en sus propias palabras, con fotos y videos que ellos mismos comparten.</p>
              <div className="stories-hero__actions">
                <a className="button button--primary" href="#historias-lista">Leer historias <ArrowRight size={18} aria-hidden="true" /></a>
                <Link className="button button--outline" to={shareHref}><PenLine size={17} aria-hidden="true" /> Comparte la tuya</Link>
              </div>
            </div>
            <div className="stories-hero__photo">
              <img src={storiesHeroPhoto} alt="Productor de Azuero junto a su cosecha de yuca, plátano y tomate" fetchPriority="high" decoding="async" />
              <p className="stories-hero__note" aria-hidden="true">Cada historia<br />nos hace<br />más fuertes</p>
            </div>
          </div>
        </section>

        <div id="historias-lista" className="stories-list page-shell">
          {error && stories?.length === 0 ? (
            <div className="empty-products" role="alert"><strong>No pudimos cargar las historias</strong><span>{error}</span><button className="text-link" type="button" onClick={() => { setStories(null); setPage(1); setRetry((value) => value + 1) }}>Intentar de nuevo</button></div>
          ) : stories === null ? (
            <p className="home-section__placeholder" role="status">Cargando historias…</p>
          ) : !featured ? (
            <div className="stories-empty">
              <span className="stories-empty__icon"><Sprout size={30} aria-hidden="true" /></span>
              <h2>Muy pronto conocerás sus historias</h2>
              <p>Los productores y artesanos de Mercapro están preparando sus relatos. Cada historia se revisa antes de publicarse para cuidar a quienes la comparten.</p>
              <Link className="button button--primary" to={shareHref}><PenLine size={17} aria-hidden="true" /> Sé el primero en compartir la tuya</Link>
            </div>
          ) : (
            <>
              <article className="story-feature" aria-labelledby="featured-story-title">
                <StoryMedia story={featured} variant="feature" />
                <div className="story-feature__copy">
                  <p className="home-eyebrow">Historia destacada</p>
                  {featured.quote && <p className="story-feature__quote">“{featured.quote}”</p>}
                  <h2 id="featured-story-title"><Link to={`/historias/${featured.id}`}>{featured.title}</Link></h2>
                  <p className="story-feature__excerpt">{storyExcerpt(featured.body, 260)}</p>
                  <StoryProducer story={featured} />
                  <Link className="button button--primary" to={`/historias/${featured.id}`}>Leer historia completa <ArrowRight size={18} aria-hidden="true" /></Link>
                </div>
              </article>

              {rest.length > 0 && (
                <section className="stories-grid-section" aria-labelledby="more-stories-title">
                  <div className="home-section__heading">
                    <div>
                      <h2 id="more-stories-title">Más historias</h2>
                      <p>{total} {total === 1 ? 'historia compartida' : 'historias compartidas'} por productores y artesanos.</p>
                    </div>
                  </div>
                  <div className="stories-grid">{rest.map((story) => <StoryCard key={story.id} story={story} />)}</div>
                </section>
              )}
              {page < lastPage && <div className="stories-more"><button className="button button--outline" type="button" onClick={() => setPage((value) => value + 1)}>Ver más historias</button></div>}
            </>
          )}
        </div>

        <ShareStoryBand href={shareHref} />
      </main>
      <SiteFooter />
    </div>
  )
}

export function StoryDetailPage() {
  const { id = '' } = useParams()
  const [story, setStory] = useState<ProducerStory | null>(null)
  const [more, setMore] = useState<ProducerStory[]>([])
  const [error, setError] = useState('')
  const shareHref = useShareStoryHref()
  useSeoMetadata(
    story ? `${story.title} · Historias de Mercapro` : 'Historias de productores · Mercapro',
    story ? `${story.producer?.public_name ?? 'Un productor'} cuenta su historia: ${storyExcerpt(story.body, 150)}` : 'Historias de productores y artesanos de Panamá en Mercapro.',
    story?.image_url ?? undefined,
  )

  useEffect(() => {
    const controller = new AbortController()
    setStory(null)
    setError('')
    getStory(id, controller.signal).then(setStory).catch((reason: unknown) => { if (reason instanceof Error && reason.name !== 'AbortError') setError(reason.message) })
    listStories(1, 4, controller.signal).then((result) => setMore(result.data.filter((item) => String(item.id) !== id).slice(0, 3))).catch(() => setMore([]))
    return () => controller.abort()
  }, [id])

  if (error) return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><div className="empty-products" role="alert"><strong>{error}</strong><Link className="button button--outline" to="/historias">Ver todas las historias</Link></div></main><SiteFooter /></div>
  if (!story) return <div className="app-shell"><SiteHeader /><main className="catalog-page page-shell"><p role="status">Cargando historia…</p></main><SiteFooter /></div>

  const paragraphs = story.body.split(/\n{2,}|\r\n\r\n/).map((paragraph) => paragraph.trim()).filter(Boolean)

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="story-detail">
        <header className="story-detail__header page-shell">
          <nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><ChevronRight size={14} aria-hidden="true" /><Link to="/historias">Historias</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{story.title}</span></nav>
          <p className="home-eyebrow">Historia de productor</p>
          <h1>{story.title}</h1>
          <div className="story-detail__meta">
            <StoryProducer story={story} />
            {story.published_at && <time dateTime={story.published_at}>Publicada el {storyDate(story.published_at)}</time>}
          </div>
        </header>

        <div className="story-detail__layout page-shell">
          <article className="story-detail__article">
            {(story.video || story.image_url) && <StoryMedia story={story} variant="detail" />}
            {story.quote && <blockquote className="story-detail__quote">“{story.quote}”</blockquote>}
            <div className="story-detail__body">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            {story.video && story.image_url && storyVideoThumbnail(story.video) && <figure className="story-detail__photo"><img src={story.image_url} alt={`Fotografía compartida por ${story.producer?.public_name ?? 'el productor'}`} loading="lazy" decoding="async" /></figure>}
            <Link className="text-link story-detail__back" to="/historias"><ArrowLeft size={16} aria-hidden="true" /> Volver a todas las historias</Link>
          </article>

          {story.producer && (
            <aside className="story-detail__aside">
              <div className="producer-card">
                <p className="home-eyebrow">Conoce a quien la cuenta</p>
                <StoryProducer story={story} />
                <p className="story-detail__aside-text">Explora sus productos y contáctale directamente, sin intermediarios.</p>
                <Link className="button button--primary" to={`/productores/${story.producer.slug}`}>Ver perfil y productos <ArrowRight size={18} aria-hidden="true" /></Link>
              </div>
            </aside>
          )}
        </div>

        {more.length > 0 && (
          <section className="stories-grid-section page-shell" aria-labelledby="related-stories-title">
            <div className="home-section__heading">
              <h2 id="related-stories-title">Otras historias</h2>
              <Link className="text-link" to="/historias">Ver todas <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            <div className="stories-grid">{more.map((item) => <StoryCard key={item.id} story={item} />)}</div>
          </section>
        )}

        <ShareStoryBand href={shareHref} />
      </main>
      <SiteFooter />
    </div>
  )
}
