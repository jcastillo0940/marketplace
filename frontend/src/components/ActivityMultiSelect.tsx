import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { listCategories } from '../api/client'

type Props = {
  defaultValue?: string[]
  onChange?: (value: string[]) => void
  disabled?: boolean
}

/** Top-level categories only. Checkboxes stay in the DOM while closed so they submit with the form. */
export default function ActivityMultiSelect({ defaultValue = [], onChange, disabled = false }: Props) {
  const [options, setOptions] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>(defaultValue)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listCategories()
      .then((categories) => setOptions(categories.filter((category) => category.parent_id === null).map((category) => category.name)))
      .catch(() => setOptions([]))
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggle(name: string, checked: boolean) {
    const next = checked ? [...selected, name] : selected.filter((value) => value !== name)
    setSelected(next)
    onChange?.(next)
  }

  return (
    <div className="activity-select" ref={root}>
      <button type="button" className="activity-select__trigger" aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}>
        <span>{selected.length > 0 ? selected.join(', ') : 'Selecciona una o varias'}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div className="activity-select__panel" hidden={!open}>
        {options.map((name) => (
          <label key={name} className="activity-select__option">
            <input type="checkbox" name="activities[]" value={name} checked={selected.includes(name)} disabled={disabled} onChange={(event) => toggle(name, event.target.checked)} />
            {name}
          </label>
        ))}
      </div>
    </div>
  )
}
