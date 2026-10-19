import { useState } from 'react';

import { ArrowUpRight, Menu, X } from 'lucide-react';

import { Link, useLocation } from 'react-router-dom';

import superCarnesLogo from '../../assets/super-carnes-logo.png';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <>
      <div className="initiative-bar">
        <span className="initiative-bar__dot" aria-hidden="true" />
        Una iniciativa para apoyar a productores de Azuero
        <span className="initiative-bar__partner">con el respaldo de Super Carnes</span>
      </div>
      <header className="site-header">
        <div className="site-header__inner page-shell">
          <Link className="brand" to="/" aria-label="Mercado Solidario, inicio">
            <img className="brand__logo" src={superCarnesLogo} alt="Super Carnes" />
            <span className="brand__type">
              <span>Mercado</span>
              <strong>Solidario</strong>
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
            <Link to="/productos" onClick={() => setMenuOpen(false)}>Productos</Link>
            <Link to="/productores" aria-current={location.pathname === '/productores' ? 'page' : undefined} onClick={() => setMenuOpen(false)}>Productores</Link>
            <a href="/#como-funciona" onClick={() => setMenuOpen(false)}>Cómo funciona</a>
            <Link to="/seguridad" onClick={() => setMenuOpen(false)}>Seguridad</Link>
            <Link className="button button--small button--outline" to="/registro" onClick={() => setMenuOpen(false)}>
              Soy productor <ArrowUpRight size={15} />
            </Link>
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
          <span className="brand__type"><span>Mercado</span><strong>Solidario</strong></span>
        </Link>
        <p>Una iniciativa de apoyo a productores y emprendedores de Azuero.</p>
        <nav aria-label="Enlaces del pie de página">
          <Link to="/sobre-el-proyecto">Sobre el proyecto</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/ayuda">Ayuda</Link>
          <Link to="/terminos">Términos y condiciones</Link>
          <Link to="/privacidad">Política de privacidad</Link>
        </nav>
        <small>© 2026 Mercado Solidario · Super Carnes apoya esta iniciativa</small>
      </div>
    </footer>
  )
}
