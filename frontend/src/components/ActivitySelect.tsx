import { useEffect, useState } from 'react'
import { listCategories } from '../api/client'

type Category = { id: number; name: string; slug: string; parent_id: number | null }

type Props = {
  name?: string
  defaultValue?: string | null
  onChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
}

export default function ActivitySelect({ name = 'activity', defaultValue, onChange, disabled = false, required = false }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listCategories()
      .then((data) => setCategories(data as Category[]))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [])

  const parents = categories.filter((c) => c.parent_id === null)
  const childrenOf = (parentId: number) => categories.filter((c) => c.parent_id === parentId)

  if (loading) {
    return <select name={name} disabled={true} required={required}><option value="">Cargando…</option></select>
  }

  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ''}
      disabled={disabled}
      required={required}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      <option value="">Selecciona una actividad</option>
      {parents.map((parent) => {
        const children = childrenOf(parent.id)
        if (children.length > 0) {
          return (
            <optgroup key={parent.id} label={parent.name}>
              {children.map((child) => (
                <option key={child.id} value={child.name}>{child.name}</option>
              ))}
            </optgroup>
          )
        }
        return (
          <option key={parent.id} value={parent.name}>{parent.name}</option>
        )
      })}
    </select>
  )
}
