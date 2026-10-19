import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PublicLocation } from '../api/client'

const PANAMA_CENTER: [number, number] = [8.1, -80.9]
const PANAMA_BOUNDS: [[number, number], [number, number]] = [[7.0, -82.5], [9.5, -79.5]]

// ── GeoJSON types ────────────────────────────────────────────────────────────
type GeoProps = { provincia: string; distrito: string; corregimiento: string; id: string }
type GeoFeature = {
  type: 'Feature'
  properties: GeoProps
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
}
type GeoCollection = { type: 'FeatureCollection'; features: GeoFeature[] }

// ── Module-level GeoJSON cache ───────────────────────────────────────────────
let geoCache: GeoCollection | null = null
let geoPromise: Promise<GeoCollection> | null = null

async function loadGeo(): Promise<GeoCollection> {
  if (geoCache) return geoCache
  if (!geoPromise) {
    geoPromise = fetch('/panama_corregimientos.geo.json')
      .then((r) => r.json() as Promise<GeoCollection>)
      .then((d) => { geoCache = d; return d })
      .catch(() => { geoPromise = null; return { type: 'FeatureCollection', features: [] } })
  }
  return geoPromise
}

// ── Ray-casting point-in-polygon ─────────────────────────────────────────────
function pipRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function geocodeLocal(lat: number, lng: number, geo: GeoCollection): GeoProps | null {
  for (const ft of geo.features) {
    const g = ft.geometry
    const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    for (const poly of polys) {
      if (pipRing(lng, lat, poly[0])) return ft.properties
    }
  }
  return null
}

// ── Name matching ─────────────────────────────────────────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(distrito de|provincia de|corregimiento de)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findMatch(candidates: PublicLocation[], ...terms: (string | undefined)[]): PublicLocation | undefined {
  for (const term of terms) {
    if (!term) continue
    const n = normalizeName(term)
    const exact = candidates.find((l) => normalizeName(l.name) === n)
    if (exact) return exact
    const partial = candidates.find((l) => normalizeName(l.name).includes(n) || n.includes(normalizeName(l.name)))
    if (partial) return partial
  }
  return undefined
}

// ── Component ─────────────────────────────────────────────────────────────────
type LocationPickerProps = {
  locations: PublicLocation[]
  value?: number | null
  onChange?: (locationId: number | null) => void
  name?: string
  required?: boolean
  disabled?: boolean
  idPrefix: string
}

export default function LocationPicker({
  locations, value, onChange, name = 'location_id', required = false, disabled = false, idPrefix,
}: LocationPickerProps) {
  const [selectedId, setSelectedId] = useState(value ? String(value) : '')
  const [showMap, setShowMap] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [mapNote, setMapNote] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)

  const selected = locations.find((l) => String(l.id) === selectedId)
  const district = selected?.level === 'district'
    ? selected
    : selected?.level === 'corregimiento'
      ? locations.find((l) => l.id === selected.parent_id)
      : undefined
  const province = district
    ? locations.find((l) => l.id === district.parent_id)
    : selected?.level === 'province' ? selected : undefined
  const districts = useMemo(
    () => locations.filter((l) => l.level === 'district' && l.parent_id === province?.id),
    [locations, province?.id],
  )
  const corregimientos = useMemo(
    () => locations.filter((l) => l.level === 'corregimiento' && l.parent_id === district?.id),
    [locations, district?.id],
  )

  function choose(locationId: string) {
    setSelectedId(locationId)
    onChange?.(locationId ? Number(locationId) : null)
  }

  // Pre-warm the geo cache when the map toggle is visible
  useEffect(() => { void loadGeo() }, [])

  useEffect(() => {
    if (!showMap || !mapRef.current || leafletRef.current) return

    const map = L.map(mapRef.current, { zoomControl: true }).setView(PANAMA_CENTER, 8)
    map.setMaxBounds(PANAMA_BOUNDS)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        markerRef.current = L.circleMarker([lat, lng], {
          radius: 9, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1,
        }).addTo(map)
      }

      setGeocoding(true)
      setMapNote(null)
      try {
        const geo = await loadGeo()
        const match = geocodeLocal(lat, lng, geo)

        if (!match) {
          setMapNote('Ubicación fuera del área cubierta. Selecciónala manualmente desde los desplegables.')
          return
        }

        const provinces = locations.filter((l) => l.level === 'province')
        const matchedProvince = findMatch(provinces, match.provincia)
        if (!matchedProvince) {
          setMapNote('Provincia no encontrada en el directorio. Selecciónala manualmente.')
          return
        }

        const districtCandidates = locations.filter(
          (l) => l.level === 'district' && l.parent_id === matchedProvince.id,
        )
        const matchedDistrict = findMatch(districtCandidates, match.distrito)

        const corregimientoCandidates = matchedDistrict
          ? locations.filter((l) => l.level === 'corregimiento' && l.parent_id === matchedDistrict.id)
          : []
        const matchedCorregimiento = matchedDistrict
          ? findMatch(corregimientoCandidates, match.corregimiento)
          : undefined

        const best = matchedCorregimiento ?? matchedDistrict ?? matchedProvince
        choose(String(best.id))
        setMapNote(
          matchedCorregimiento
            ? `✓ ${matchedCorregimiento.name} · ${matchedDistrict?.name ?? ''} · ${matchedProvince.name}`
            : matchedDistrict
              ? `${matchedDistrict.name} · ${matchedProvince.name} — elige el corregimiento si lo deseas`
              : `${matchedProvince.name} — elige distrito y corregimiento`,
        )
      } catch {
        setMapNote('No se pudo detectar la ubicación. Selecciónala manualmente.')
      } finally {
        setGeocoding(false)
      }
    })

    leafletRef.current = map
    return () => {
      map.remove()
      leafletRef.current = null
      markerRef.current = null
    }
  }, [showMap]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showMap && leafletRef.current) {
      setTimeout(() => leafletRef.current?.invalidateSize(), 50)
    }
  }, [showMap])

  return (
    <div className="location-picker">
      <label htmlFor={`${idPrefix}-province`}>Provincia
        <select id={`${idPrefix}-province`} value={province?.id ?? ''} required={required} disabled={disabled} onChange={(e) => choose(e.currentTarget.value)}>
          <option value="">{required ? 'Selecciona una provincia' : 'Sin ubicación'}</option>
          {locations.filter((l) => l.level === 'province').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-district`}>Distrito
        <select id={`${idPrefix}-district`} value={district?.id ?? ''} disabled={disabled || !province} onChange={(e) => choose(e.currentTarget.value || String(province?.id ?? ''))}>
          <option value="">{province ? 'Toda la provincia' : 'Selecciona primero una provincia'}</option>
          {districts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-corregimiento`}>Corregimiento
        <select id={`${idPrefix}-corregimiento`} value={selected?.level === 'corregimiento' ? selected.id : ''} disabled={disabled || !district} onChange={(e) => choose(e.currentTarget.value || String(district?.id ?? ''))}>
          <option value="">{district ? 'Todo el distrito' : 'Selecciona primero un distrito'}</option>
          {corregimientos.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>

      {!disabled && (
        <button
          type="button"
          className="text-link location-picker__map-toggle"
          onClick={() => setShowMap((v) => !v)}
        >
          {showMap ? 'Ocultar mapa' : 'Seleccionar en el mapa'}
        </button>
      )}

      {showMap && (
        <div className="location-picker__map-wrapper">
          <div ref={mapRef} className="location-picker__map" aria-label="Mapa para seleccionar ubicación" />
          {geocoding && <p className="location-picker__map-status" role="status">Detectando ubicación…</p>}
          {mapNote && <p className="location-picker__map-status">{mapNote}</p>}
          <small className="location-picker__map-hint">Haz clic en el mapa para detectar provincia, distrito y corregimiento automáticamente.</small>
        </div>
      )}

      <input type="hidden" name={name} value={selectedId} />
    </div>
  )
}
