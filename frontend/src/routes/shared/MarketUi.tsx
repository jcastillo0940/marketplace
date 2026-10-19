import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'

/** Glifo de WhatsApp (lucide no incluye marcas). */
export function WhatsAppIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.71.23 1.36.2 1.88.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.47 9.47 0 0 1-4.83-1.32l-.35-.2-3.59.94.96-3.5-.23-.36a9.45 9.45 0 0 1-1.45-5.05c0-5.23 4.26-9.49 9.5-9.49a9.43 9.43 0 0 1 6.7 2.79 9.43 9.43 0 0 1 2.78 6.71c0 5.23-4.26 9.48-9.48 9.48m8.07-17.56A11.33 11.33 0 0 0 12.05.6C5.76.6.65 5.71.64 12a11.36 11.36 0 0 0 1.52 5.69L.55 23.6l6.04-1.58a11.36 11.36 0 0 0 5.45 1.39h.01c6.28 0 11.4-5.12 11.4-11.4a11.33 11.33 0 0 0-3.33-8.07" />
    </svg>
  )
}

const FAVORITES_KEY = 'empujoncito:favoritos'
const FAVORITES_EVENT = 'empujoncito:favoritos-cambio'

function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

/** Favoritos guardados solo en este navegador; no se envían a ningún servidor. */
function useFavorite(id: string): [boolean, () => void] {
  const [saved, setSaved] = useState(() => readFavorites().includes(id))
  useEffect(() => {
    const sync = () => setSaved(readFavorites().includes(id))
    sync()
    window.addEventListener(FAVORITES_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(FAVORITES_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [id])
  const toggle = () => {
    const current = readFavorites()
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)) } catch { /* almacenamiento no disponible */ }
    setSaved(next.includes(id))
    window.dispatchEvent(new Event(FAVORITES_EVENT))
  }
  return [saved, toggle]
}

export function FavoriteButton({ id, title, className = '' }: { id: string; title: string; className?: string }) {
  const [saved, toggle] = useFavorite(id)
  return (
    <button
      type="button"
      className={`favorite-button${saved ? ' favorite-button--saved' : ''} ${className}`.trim()}
      aria-pressed={saved}
      aria-label={saved ? `Quitar ${title} de favoritos` : `Guardar ${title} en favoritos`}
      title={saved ? 'Guardado en favoritos' : 'Guardar en favoritos'}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle() }}
    >
      <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
    </button>
  )
}

/** Trazo amarillo decorativo, como pincelada de cosecha. */
export function BrushStrokes({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 120" aria-hidden="true" focusable="false">
      <path d="M58 6 C 48 40, 34 74, 18 112" stroke="currentColor" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M74 30 C 66 58, 56 84, 44 110" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".75" />
    </svg>
  )
}
