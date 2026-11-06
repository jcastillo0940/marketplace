import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { loadGeo, normalizeName, type GeoFeature } from './panamaGeo'

type ZoneLocation = { name: string; parent?: { name: string; parent?: { name: string } } } | null

const PIN_ICON = L.divIcon({
  className: 'producer-zone-map__pin',
  html: '<svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0Z" fill="#005ec4"/><circle cx="12" cy="12" r="4.6" fill="#fff"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 39],
})

/** Corregimiento, distrito y provincia de la ubicación pública, del más fino al más amplio. */
function zoneChain(location: ZoneLocation): { province: string; district?: string; corregimiento?: string } | null {
  if (!location) return null
  if (location.parent?.parent) return { province: location.parent.parent.name, district: location.parent.name, corregimiento: location.name }
  if (location.parent) return { province: location.parent.name, district: location.name }
  return { province: location.name }
}

/** Polígonos de la zona más precisa que exista en el GeoJSON; si no hay coincidencia, se usa el nivel superior. */
function zoneFeatures(features: GeoFeature[], location: ZoneLocation): GeoFeature[] {
  const chain = zoneChain(location)
  if (!chain) return []
  const province = normalizeName(chain.province)
  const district = chain.district ? normalizeName(chain.district) : null
  const corregimiento = chain.corregimiento ? normalizeName(chain.corregimiento) : null
  const inProvince = features.filter((feature) => normalizeName(feature.properties.provincia) === province)
  const inDistrict = district ? inProvince.filter((feature) => normalizeName(feature.properties.distrito) === district) : []
  const inCorregimiento = corregimiento ? inDistrict.filter((feature) => normalizeName(feature.properties.corregimiento) === corregimiento) : []
  return inCorregimiento.length ? inCorregimiento : inDistrict.length ? inDistrict : inProvince
}

/** Mapa de la zona de producción. El GeoJSON (≈3 MB) solo se descarga cuando la tarjeta entra en pantalla. */
export default function ProducerZoneMap({ location, label }: { location: ZoneLocation; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '300px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!visible || !element) return
    let map: L.Map | null = null
    let cancelled = false
    void loadGeo().then((geo) => {
      if (cancelled) return
      const features = zoneFeatures(geo.features, location)
      if (!features.length) { setStatus('unavailable'); return }
      map = L.map(element, { scrollWheelZoom: false, zoomControl: true, attributionControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map)
      const zone = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
        style: { color: '#005ec4', weight: features.length > 1 ? 0.6 : 2, opacity: features.length > 1 ? 0.35 : 0.9, fillColor: '#005ec4', fillOpacity: 0.22 },
        interactive: false,
      }).addTo(map)
      const bounds = zone.getBounds()
      map.fitBounds(bounds, { padding: [18, 18] })
      L.marker(bounds.getCenter(), { icon: PIN_ICON, interactive: false, keyboard: false }).addTo(map)
      setStatus('ready')
    })
    return () => { cancelled = true; map?.remove() }
  }, [visible, location])

  return (
    <div className="producer-map">
      <div ref={containerRef} className="producer-map__canvas" role="img" aria-label={`Mapa de la zona de producción: ${label}, Panamá`} />
      {status === 'loading' && <span className="producer-map__status" role="status">Cargando mapa…</span>}
      {status === 'unavailable' && <span className="producer-map__status">Mapa no disponible para esta zona</span>}
      <span className="producer-map__label"><strong>{label}</strong><small>Panamá</small></span>
    </div>
  )
}
