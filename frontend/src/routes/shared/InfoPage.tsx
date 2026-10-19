import { ArrowRight, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SiteFooter, SiteHeader } from './SiteChrome'

export function InfoPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="info-page page-shell">
        <nav className="breadcrumbs" aria-label="Ruta de navegación"><Link to="/">Inicio</Link><ChevronRight size={14} /><span aria-current="page">{title}</span></nav>
        <p className="eyebrow eyebrow--quiet">MERCADO SOLIDARIO</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="button button--outline" to="/productos">Volver a explorar <ArrowRight size={16} /></Link>
      </main>
      <SiteFooter />
    </div>
  )
}
