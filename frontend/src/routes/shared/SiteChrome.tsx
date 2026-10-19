import { useEffect, useState } from 'react';

import { ArrowUpRight, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';

import { Link, useLocation, useNavigate } from 'react-router-dom';

import { clearSessionCache, getSessionUser, logoutUser, type SessionUser } from '../../api/client';
import superCarnesLogo from '../../assets/super-carnes-logo.png';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<SessionUser | null | 'loading'>('loading')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    void getSessionUser().then(setSession)
  }, [location.pathname])

  function closeMenu() { setMenuOpen(false) }

  async function handleLogout() {
    closeMenu()
    try {
      await logoutUser()
      clearSessionCache()
      setSession(null)
      navigate('/')
    } catch {
      clearSessionCache()
      setSession(null)
      navigate('/')
    }
  }

  const firstName = session && session !== 'loading' ? session.name.split(' ')[0] : ''

  return (
    <>
      <div className="initiative-bar">
        <span className="initiative-bar__dot" aria-hidden="true" />
        Una iniciativa para apoyar a productores de Coclé, Veraguas, Herrera y Los Santos
        <span className="initiative-bar__partner">con el respaldo de Super Carnes</span>
      </div>
      <header className="site-header">
        <div className="site-header__inner page-shell">
          <Link className="brand" to="/" aria-label="El Empujoncito, inicio">
            <img className="brand__logo" src={superCarnesLogo} alt="Super Carnes" />
            <span className="brand__type">
              <span>El</span>
              <strong>Empujoncito</strong>
            </span>
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
            <Link to="/productos" onClick={closeMenu}>Productos</Link>
            <Link to="/productores" aria-current={location.pathname === '/productores' ? 'page' : undefined} onClick={closeMenu}>Productores</Link>
            <a href="/#como-funciona" onClick={closeMenu}>Cómo funciona</a>
            <Link to="/seguridad" onClick={closeMenu}>Seguridad</Link>

            {session && session !== 'loading' ? (
              <>
                <span className="site-nav__welcome">Bienvenido, <strong>{firstName}</strong></span>
                <Link className="site-nav__icon-link" to="/mi-panel" onClick={closeMenu} aria-label="Mi panel">
                  <LayoutDashboard size={16} aria-hidden="true" />
                  Mi panel
                </Link>
                <button type="button" className="site-nav__icon-link site-nav__logout" onClick={handleLogout}>
                  <LogOut size={16} aria-hidden="true" />
                  Cerrar sesión
                </button>
              </>
            ) : session === null ? (
              <Link className="button button--small button--outline" to="/registro" onClick={closeMenu}>
                Soy productor <ArrowUpRight size={15} />
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
    </>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner page-shell">
        <Link className="brand brand--footer" to="/">
          <img className="brand__logo" src={superCarnesLogo} alt="Super Carnes" />
          <span className="brand__type"><span>El</span><strong>Empujoncito</strong></span>
        </Link>
        <p>Una iniciativa de apoyo a productores y emprendedores del interior de Panamá.</p>
        <nav aria-label="Enlaces del pie de página">
          <Link to="/sobre-el-proyecto">Sobre el proyecto</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/ayuda">Ayuda</Link>
          <Link to="/terminos">Términos y condiciones</Link>
          <Link to="/privacidad">Política de privacidad</Link>
        </nav>
        <small>© 2026 El Empujoncito · Super Carnes apoya esta iniciativa</small>
      </div>
    </footer>
  )
}
