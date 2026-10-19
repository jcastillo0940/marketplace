import { useEffect, useState } from 'react';

import { Facebook, Instagram, LayoutDashboard, LogOut, Menu, Plus, Search, X, Youtube } from 'lucide-react';

import { Link, useLocation, useNavigate } from 'react-router-dom';

import { clearSessionCache, getSessionUser, logoutUser, type SessionUser } from '../../api/client';

import superCarnesLogo from '../../assets/super-carnes-logo.png';

const NAV_LINKS: Array<{ label: string; to: string; match?: string }> = [
  { label: 'Explorar', to: '/productos', match: '/productos' },
  { label: 'Productores', to: '/productores', match: '/productores' },
  { label: 'Cómo funciona', to: '/#como-funciona' },
  { label: 'Historias', to: '/#historias' },
  { label: 'Preguntas', to: '/ayuda', match: '/ayuda' },
]

/** Redes sociales: solo se muestran si están configuradas en el entorno (VITE_SOCIAL_*). */
const SOCIAL_LINKS = [
  { label: 'Instagram', href: import.meta.env.VITE_SOCIAL_INSTAGRAM as string | undefined, Icon: Instagram },
  { label: 'Facebook', href: import.meta.env.VITE_SOCIAL_FACEBOOK as string | undefined, Icon: Facebook },
  { label: 'YouTube', href: import.meta.env.VITE_SOCIAL_YOUTUBE as string | undefined, Icon: Youtube },
].filter((link): link is { label: string; href: string; Icon: typeof Instagram } => Boolean(link.href))

const CURRENT_YEAR = new Date().getFullYear()

function BrandMark({ footer = false }: { footer?: boolean }) {
  return (
    <>
      <img className="brand__logo" src={superCarnesLogo} alt="Super Carnes" />
      <span className={`brand__type${footer ? ' brand__type--light' : ''}`}>
        <span>El</span>
        <strong>Empujoncito</strong>
      </span>
    </>
  )
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<SessionUser | null | 'loading'>('loading')
  const location = useLocation()
  const navigate = useNavigate()
  const close = () => setMenuOpen(false)

  useEffect(() => {
    void getSessionUser().then(setSession)
  }, [location.pathname])

  async function handleLogout() {
    close()
    try { await logoutUser() } catch { /* la sesión se limpia igual */ }
    clearSessionCache()
    setSession(null)
    navigate('/')
  }

  const signedIn = session !== null && session !== 'loading' && typeof session.name === 'string'
  const firstName = signedIn && typeof session === 'object' ? session.name.split(' ')[0] : ''

  return (
    <>
      <div className="initiative-bar">
        <span className="initiative-bar__dot" aria-hidden="true" />
        <span>Una iniciativa de <strong>Super Carnes</strong> para apoyar a productores y emprendedores de Coclé, Veraguas, Herrera y Los Santos</span>
      </div>
      <header className="site-header">
        <div className="site-header__inner page-shell">
          <Link className="brand" to="/" aria-label="El Empujoncito, inicio">
            <BrandMark />
          </Link>

          <button
            type="button"
            className="mobile-menu-button"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>

          <nav
            id="primary-navigation"
            className={`site-nav${menuOpen ? ' site-nav--open' : ''}`}
            aria-label="Navegación principal"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                aria-current={link.match && location.pathname === link.match ? 'page' : undefined}
                onClick={close}
              >
                {link.label}
              </Link>
            ))}
            {signedIn ? (
              <>
                <span className="site-nav__welcome">Bienvenido, <strong>{firstName}</strong></span>
                <Link className="site-nav__icon-link" to="/mi-panel" onClick={close}>
                  <LayoutDashboard size={16} aria-hidden="true" />
                  Mi panel
                </Link>
                <button type="button" className="site-nav__icon-link site-nav__logout" onClick={() => void handleLogout()}>
                  <LogOut size={16} aria-hidden="true" />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <Link className="button button--accent button--small site-nav__mobile-cta" to="/registro" onClick={close}>
                Publica gratis <Plus size={16} />
              </Link>
            )}
          </nav>

          <div className="site-header__actions">
            <Link className="icon-button" to="/productos" aria-label="Buscar productos en el catálogo" title="Buscar">
              <Search size={18} />
            </Link>
            {!signedIn && (
              <Link className="button button--accent button--small site-header__cta" to="/registro">
                Publica gratis <Plus size={16} />
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner page-shell">
        <Link className="brand brand--footer" to="/" aria-label="El Empujoncito, inicio">
          <BrandMark footer />
        </Link>
        <nav aria-label="Enlaces del pie de página">
          <Link to="/sobre-el-proyecto">Sobre el proyecto</Link>
          <Link to="/ayuda">Preguntas</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/terminos">Términos y condiciones</Link>
          <Link to="/privacidad">Política de privacidad</Link>
        </nav>
        {SOCIAL_LINKS.length > 0 && (
          <ul className="site-footer__social" aria-label="Redes sociales">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <li key={label}><a href={href} target="_blank" rel="noreferrer" aria-label={label}><Icon size={20} /></a></li>
            ))}
          </ul>
        )}
      </div>
      <div className="site-footer__legal page-shell">
        <small>© {CURRENT_YEAR} El Empujoncito · Una iniciativa de apoyo a productores y emprendedores del interior de Panamá, impulsada por Super Carnes.</small>
      </div>
    </footer>
  )
}
