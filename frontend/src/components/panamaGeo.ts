/** Límites administrativos de Panamá (corregimientos) compartidos por los mapas del sitio. */
// ── GeoJSON types ────────────────────────────────────────────────────────────
export type GeoProps = { provincia: string; distrito: string; corregimiento: string; id: string }
export type GeoFeature = {
  type: 'Feature'
  properties: GeoProps
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
}
export type GeoCollection = { type: 'FeatureCollection'; features: GeoFeature[] }

// ── Module-level GeoJSON cache ───────────────────────────────────────────────
let geoCache: GeoCollection | null = null
let geoPromise: Promise<GeoCollection> | null = null

export async function loadGeo(): Promise<GeoCollection> {
  if (geoCache) return geoCache
  if (!geoPromise) {
    geoPromise = fetch('/panama_corregimientos.geo.json')
      .then((r) => r.json() as Promise<GeoCollection>)
      .then((d) => { geoCache = d; return d })
      .catch(() => { geoPromise = null; return { type: 'FeatureCollection', features: [] } })
  }
  return geoPromise
}

// ── Name matching ─────────────────────────────────────────────────────────────
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(distrito de|provincia de|corregimiento de)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}
