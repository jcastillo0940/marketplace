import { useEffect, useState } from 'react';

import { ArrowUpRight, LayoutDashboard, LogOut, Menu, Plus, Search, X } from 'lucide-react';

import { Link, useLocation, useNavigate } from 'react-router-dom';

import { adminLogout, clearSessionCache, getAdminMe, getSessionUser, logoutUser, type SessionUser } from '../../api/client';

const NAV_LINKS: Array<{ label: string; to: string; match?: string }> = [
  { label: 'Explorar', to: '/productos', match: '/productos' },
  { label: 'Productores', to: '/productores', match: '/productores' },
  { label: 'Cómo funciona', to: '/#como-funciona' },
  { label: 'Historias', to: '/#historias' },
  { label: 'Preguntas', to: '/ayuda', match: '/ayuda' },
]

const CURRENT_YEAR = new Date().getFullYear()

function BrandMark({ footer = false }: { footer?: boolean }) {
  const gradientId = footer ? 'brand-bag-footer' : 'brand-bag'
  return (
    <>
      <svg className="brand__icon" viewBox="0 0 65 85" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#a9e83c" />
            <stop offset=".52" stopColor="#66b578" />
            <stop offset="1" stopColor="#075cc5" />
          </linearGradient>
        </defs>
        <path d="M18 32V20C18-2 48-2 48 20v12" fill="none" stroke="#a8e137" strokeWidth="7" strokeLinecap="round" />
        <path d="M10 32H54L60 77Q60 83 53 83H9Q3 83 6 76L17 65H36Q45 65 45 59Q45 54 38 54H13L20 45H42Q48 45 48 39Q48 34 41 34H10Z" fill={`url(#${gradientId})`} />
        <path d="M7 43H40M3 53H37M1 64H32" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span className={`brand__type${footer ? ' brand__type--light' : ''}`}>
        <strong>El Empujoncito</strong>
        <span>Marketplace</span>
      </span>
    </>
  )
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<SessionUser | null | 'loading'>('loading')
  const location = useLocation()
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
        <span className="initiative-bar__dot" aria-hidden="true" />
        <span>Una iniciativa de <strong>Super Carnes</strong> para apoyar a productores y emprendedores de Panamá</span>
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
        <Link className="brand brand--footer" to="/" aria-label="El Empujoncito, inicio"><BrandMark footer /></Link>
        <nav aria-label="Enlaces del pie de página">
          <Link to="/sobre-el-proyecto">Sobre el proyecto</Link>
          <Link to="/ayuda">Preguntas</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/terminos">Términos y condiciones</Link>
          <Link to="/privacidad">Política de privacidad</Link>
        </nav>
      </div>
      <div className="site-footer__legal page-shell">
        <small>© {CURRENT_YEAR} El Empujoncito · Una iniciativa de apoyo a productores y emprendedores del interior de Panamá, impulsada por Super Carnes.</small>
      </div>
    </footer>
  )
}
