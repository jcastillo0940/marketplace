import { useEffect, useState } from 'react';

import { ArrowUpRight, LayoutDashboard, LogOut, Menu, Plus, Search, X } from 'lucide-react';

import { Link, useLocation, useNavigate } from 'react-router-dom';

import { BrandLogo } from '../../components/BrandLogo';

import { adminLogout, clearSessionCache, getAdminMe, getSessionUser, logoutUser, type SessionUser } from '../../api/client';

const NAV_LINKS: Array<{ label: string; to: string; match?: string }> = [
  { label: 'Explorar', to: '/productos', match: '/productos' },
  { label: 'Productores', to: '/productores', match: '/productores' },
  { label: 'Cómo funciona', to: '/#como-funciona' },
  { label: 'Historias', to: '/historias', match: '/historias' },
  { label: 'Ayuda y consejos', to: '/ayuda', match: '/ayuda' },
]

const CURRENT_YEAR = new Date().getFullYear()

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<SessionUser | null | 'loading'>('loading')
  const location = useLocation()
  const overHero = location.pathname === '/'
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (!overHero) return
    const update = () => setScrolled(window.scrollY > 8)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [overHero])
  const navigate = useNavigate()

  const isAdminPath = location.pathname.startsWith('/admin') || location.pathname === '/adminsc1car'

  useEffect(() => {
    if (isAdminPath) {
      void getAdminMe().then((admin) => setSession(admin ? { name: admin.name, email: admin.email } as SessionUser : null))
    } else {
      void getSessionUser().then(setSession)
    }
  }, [location.pathname, isAdminPath])

  function closeMenu() { setMenuOpen(false) }

  async function handleLogout() {
    closeMenu()
    try {
      if (isAdminPath) {
        await adminLogout()
      } else {
        await logoutUser()
      }
    } finally {
      clearSessionCache()
      setSession(null)
      navigate(isAdminPath ? '/adminsc1car' : '/')
    }
  }

  const firstName = session && session !== 'loading' ? session.name.split(' ')[0] : ''

  return (
    <>
      <div className="initiative-bar">
        <span>Impulsado por</span>
        <a href="https://supercarnes.com" target="_blank" rel="noopener noreferrer" aria-label="Super Carnes">
          <img src="/super-carnes-logo.png" alt="Super Carnes" className="initiative-bar__logo" />
        </a>
      </div>
      <header className={`site-header${overHero ? ' site-header--over-hero' : ''}${overHero && !scrolled && !menuOpen ? ' site-header--transparent' : ''}`}>
        <div className="site-header__inner page-shell">
          <Link className="brand" to="/" aria-label="Mercapro, inicio">
            <BrandLogo />
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

          <nav id="primary-navigation" className={`site-nav${menuOpen ? ' site-nav--open' : ''}`} aria-label="Navegación principal">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} to={link.to} aria-current={link.match && location.pathname === link.match ? 'page' : undefined} onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
            {session && session !== 'loading' ? (
              <>
                <span className="site-nav__welcome">Bienvenido, <strong>{firstName}</strong></span>
                <Link className="site-nav__icon-link" to={isAdminPath ? '/admin' : '/mi-panel'} onClick={closeMenu} aria-label={isAdminPath ? 'Administración' : 'Mi panel'}>
                  <LayoutDashboard size={16} aria-hidden="true" /> {isAdminPath ? 'Administración' : 'Mi panel'}
                </Link>
                <button type="button" className="site-nav__icon-link site-nav__logout" onClick={() => void handleLogout()}>
                  <LogOut size={16} aria-hidden="true" /> Cerrar sesión
                </button>
              </>
            ) : session === null ? (
              <Link className="button button--accent button--small site-nav__mobile-cta" to="/registro" onClick={closeMenu}>
                Publica gratis <Plus size={16} />
              </Link>
            ) : null}
          </nav>

          <div className="site-header__actions">
            <Link className="icon-button" to="/productos" aria-label="Buscar productos en el catálogo" title="Buscar"><Search size={18} /></Link>
            {session === null && !isAdminPath && <Link className="button button--accent button--small site-header__cta" to="/registro">Publica gratis <Plus size={16} /></Link>}
            {session && session !== 'loading' && <Link className="button button--accent button--small site-header__cta" to={isAdminPath ? '/admin' : '/mi-panel'}>{isAdminPath ? 'Administración' : 'Mi panel'} <ArrowUpRight size={15} /></Link>}
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
        <Link className="brand brand--footer" to="/" aria-label="Mercapro, inicio"><BrandLogo light /></Link>
        <nav aria-label="Enlaces del pie de página">
          <Link to="/sobre-el-proyecto">Sobre el proyecto</Link>
          <Link to="/productores">Productores</Link>
          <Link to="/historias">Historias</Link>
          <Link to="/ayuda">Ayuda y consejos</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/terminos">Términos y condiciones</Link>
          <Link to="/privacidad">Política de privacidad</Link>
        </nav>
        <a href="https://supercarnes.com" target="_blank" rel="noopener noreferrer" className="site-footer__partner">
          <span>Impulsado por</span>
          <img src="/super-carnes-logo.png" alt="Super Carnes" className="site-footer__partner-logo" />
        </a>
      </div>
      <div className="site-footer__legal page-shell">
        <p className="site-footer__disclaimer">Mercapro es un servicio gratuito que conecta compradores con productores. No procesamos pagos ni intervenimos en precios, entregas, calidad o acuerdos entre las partes. Super Carnes no se hace responsable por pagos, transacciones ni acuerdos realizados entre compradores y productores.</p>
        <small>© {CURRENT_YEAR} Mercapro · Apoyando lo nuestro. Plataforma gratuita que conecta a productores y artesanos con compradores, impulsada por Super Carnes.</small>
      </div>
    </footer>
  )
}
