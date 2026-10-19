import { useMemo, useState } from 'react'
import type { PublicLocation } from '../api/client'

type LocationPickerProps = {
  locations: PublicLocation[]
  value?: number | null
  onChange?: (locationId: number | null) => void
  name?: string
  required?: boolean
  disabled?: boolean
  idPrefix: string
}

export default function LocationPicker({ locations, value, onChange, name = 'location_id', required = false, disabled = false, idPrefix }: LocationPickerProps) {
  const [selectedId, setSelectedId] = useState(value ? String(value) : '')

  const selected = locations.find((location) => String(location.id) === selectedId)
  const district = selected?.level === 'district'
    ? selected
    : selected?.level === 'corregimiento'
      ? locations.find((location) => location.id === selected.parent_id)
      : undefined
  const province = district
    ? locations.find((location) => location.id === district.parent_id)
    : selected?.level === 'province' ? selected : undefined
  const districts = useMemo(() => locations.filter((location) => location.level === 'district' && location.parent_id === province?.id), [locations, province?.id])
  const corregimientos = useMemo(() => locations.filter((location) => location.level === 'corregimiento' && location.parent_id === district?.id), [locations, district?.id])

  function choose(locationId: string) {
    setSelectedId(locationId)
    onChange?.(locationId ? Number(locationId) : null)
  }

  return <div className="location-picker">
    <label htmlFor={`${idPrefix}-province`}>Provincia
      <select id={`${idPrefix}-province`} value={province?.id ?? ''} required={required} disabled={disabled} onChange={(event) => choose(event.currentTarget.value)}>
        <option value="">{required ? 'Selecciona una provincia' : 'Sin ubicación'}</option>
        {locations.filter((location) => location.level === 'province').map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
    </label>
    <label htmlFor={`${idPrefix}-district`}>Distrito
      <select id={`${idPrefix}-district`} value={district?.id ?? ''} disabled={disabled || !province} onChange={(event) => choose(event.currentTarget.value || String(province?.id ?? ''))}>
        <option value="">{province ? 'Toda la provincia' : 'Selecciona primero una provincia'}</option>
        {districts.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
    </label>
    <label htmlFor={`${idPrefix}-corregimiento`}>Corregimiento
      <select id={`${idPrefix}-corregimiento`} value={selected?.level === 'corregimiento' ? selected.id : ''} disabled={disabled || !district} onChange={(event) => choose(event.currentTarget.value || String(district?.id ?? ''))}>
        <option value="">{district ? 'Todo el distrito' : 'Selecciona primero un distrito'}</option>
        {corregimientos.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
    </label>
    <input type="hidden" name={name} value={selectedId} />
  </div>
}
