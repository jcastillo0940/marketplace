const ACTIVITY_GROUPS: Record<string, string[]> = {
  'Ganadería': [
    'Ganadería bovina (res)',
    'Ganadería porcina (cerdos)',
    'Avicultura (pollos y gallinas)',
    'Producción de huevos',
    'Ganadería caprina (cabras)',
    'Cunicultura (conejos)',
  ],
  'Lácteos': [
    'Producción de leche',
    'Quesos artesanales',
    'Lácteos y derivados',
  ],
  'Pesca y acuicultura': [
    'Pesca artesanal',
    'Acuicultura y mariscos',
  ],
  'Granos y cereales': [
    'Cultivo de maíz',
    'Cultivo de arroz',
    'Cultivo de frijoles y legumbres',
  ],
  'Tubérculos y raíces': [
    'Cultivo de yuca',
    'Cultivo de ñame y otoe',
    'Cultivo de papa',
  ],
  'Frutas': [
    'Cultivo de plátano y banano',
    'Cultivo de papaya',
    'Cultivo de cítricos',
    'Cultivo de piña',
    'Otras frutas tropicales',
  ],
  'Horticultura': [
    'Cultivo de hortalizas y vegetales',
    'Cultivo de tomate',
    'Cultivo de ají y pimiento',
    'Hierbas aromáticas y especias',
  ],
  'Cultivos especiales': [
    'Cultivo de café',
    'Cultivo de cacao',
    'Apicultura (miel y cera)',
    'Caña de azúcar',
  ],
  'Agroindustria y procesados': [
    'Panadería y repostería artesanal',
    'Conservas, mermeladas y salsas',
    'Jugos y bebidas artesanales',
    'Embutidos y derivados cárnicos',
  ],
  'Artesanías': [
    'Artesanías en fibras naturales (paja toquilla, mimbre)',
    'Artesanías en madera',
    'Artesanías en cuero y talabartería',
    'Cerámica y alfarería',
    'Artesanías y manualidades',
  ],
  'Otras actividades': [
    'Plantas medicinales y ornamentales',
    'Silvicultura y carbón vegetal',
    'Múltiples actividades agropecuarias',
    'Otra actividad agropecuaria',
  ],
}

type Props = {
  name?: string
  defaultValue?: string | null
  onChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
}

export default function ActivitySelect({ name = 'activity', defaultValue, onChange, disabled = false, required = false }: Props) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} disabled={disabled} required={required} onChange={onChange ? (e) => onChange(e.target.value) : undefined}>
      <option value="">Selecciona una actividad</option>
      {Object.entries(ACTIVITY_GROUPS).map(([group, activities]) => (
        <optgroup key={group} label={group}>
          {activities.map((activity) => (
            <option key={activity} value={activity}>{activity}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
