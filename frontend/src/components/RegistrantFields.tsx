import { useState } from 'react'
import { compressDocumentFile, MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE } from '../api/photo-optimizer'

export type RegistrantType = '' | 'productor' | 'distribuidor' | 'cooperativa'
export type HasRuc = '' | 'si' | 'no'

const REGISTRANT_OPTIONS = [
  { value: 'productor', label: 'A título personal', hint: 'Productor o emprendedor individual' },
  { value: 'distribuidor', label: 'Empresa', hint: 'Sociedad, PYME o negocio registrado' },
  { value: 'cooperativa', label: 'Cooperativa', hint: 'Organización con pacto social' },
] as const

export const REGISTRANT_LABELS: Record<Exclude<RegistrantType, ''>, string> = {
  productor: 'A título personal',
  distribuidor: 'Empresa',
  cooperativa: 'Cooperativa',
}

export function RegistrantTypeSelector({ value, onChange }: { value: RegistrantType; onChange: (value: RegistrantType) => void }) {
  return (
    <fieldset className="reg-choice">
      <legend>¿A nombre de quién te registras?</legend>
      <div className="reg-choice__options">
        {REGISTRANT_OPTIONS.map((option) => (
          <label key={option.value} className="reg-choice__option">
            <input type="radio" name="registrant_type" value={option.value} required checked={value === option.value} onChange={() => onChange(option.value)} />
            <span className="reg-choice__card"><strong>{option.label}</strong><small>{option.hint}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export type RegistrantDocumentType = 'cedula_photo' | 'aviso_operacion' | 'pacto_social'
export type RegistrantDocuments = Partial<Record<RegistrantDocumentType, File>>

/** The one document each registrant type needs before publishing. Kept in sync with ProducerProfile::PUBLISHING_DOCUMENTS. */
export const REQUIRED_DOCUMENT: Record<Exclude<RegistrantType, ''>, { type: RegistrantDocumentType; label: string; hint: string }> = {
  productor: { type: 'cedula_photo', label: 'Foto de tu cédula', hint: 'Una foto del frente de tu cédula, con los datos legibles.' },
  distribuidor: { type: 'aviso_operacion', label: 'Aviso de operación', hint: 'El aviso de operación de la empresa, en foto o PDF.' },
  cooperativa: { type: 'pacto_social', label: 'Pacto social de la cooperativa', hint: 'El pacto social o la personería jurídica, en foto o PDF.' },
}

type LegalFieldsProps = {
  type: Exclude<RegistrantType, ''>
  hasRuc: HasRuc
  onHasRucChange: (value: HasRuc) => void
  ruc: string
  onRucChange: (value: string) => void
  rucDv: string
  onRucDvChange: (value: string) => void
  documents: RegistrantDocuments
  onDocumentChange: (type: RegistrantDocumentType, file: File | null) => void
}

function DocumentPicker({ type, label, hint, file, onChange }: { type: RegistrantDocumentType; label: string; hint: string; file: File | undefined; onChange: (type: RegistrantDocumentType, file: File | null) => void }) {
  const [fileError, setFileError] = useState('')
  const [fileBusy, setFileBusy] = useState(false)

  async function select(selected: File | undefined) {
    setFileError('')
    if (!selected) return
    setFileBusy(true)
    try {
      const optimized = await compressDocumentFile(selected)
      if (optimized.size > MAX_UPLOAD_BYTES) { setFileError(MAX_UPLOAD_MESSAGE); return }
      onChange(type, optimized)
    } catch {
      setFileError('No pudimos leer este archivo. Prueba con otra foto o con un PDF.')
    } finally {
      setFileBusy(false)
    }
  }

  return (
    <div className={`reg-doc${file ? ' reg-doc--ready' : ''}`}>
      <div className="reg-doc__text">
        <span className="form-field__label">{label} <span className="reg-doc__tag">Necesario para publicar</span></span>
        <span className="form-field__hint">{fileBusy ? 'Preparando el documento…' : file ? `Listo: ${file.name}` : `${hint} JPG, PNG o PDF. Solo el equipo de Mercapro lo ve.`}</span>
      </div>
      <div className="reg-doc__actions">
        <label className="reg-legal__picker">
          <input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.pdf" disabled={fileBusy} onChange={(event) => { void select(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
          {file ? 'Cambiar archivo' : 'Subir archivo'}
        </label>
        {file && <button type="button" className="reg-doc__remove" onClick={() => onChange(type, null)}>Quitar</button>}
      </div>
      {!file && <p className="reg-doc__skip">¿No lo tienes a mano? Puedes continuar y subirlo después desde tu panel, pero no podrás publicar productos hasta hacerlo.</p>}
      {fileError && <p className="form-field__error" role="alert">{fileError}</p>}
    </div>
  )
}

export function RegistrantLegalFields({ type, hasRuc, onHasRucChange, ruc, onRucChange, rucDv, onRucDvChange, documents, onDocumentChange }: LegalFieldsProps) {
  const required = REQUIRED_DOCUMENT[type]
  const picker = <DocumentPicker type={required.type} label={required.label} hint={required.hint} file={documents[required.type]} onChange={onDocumentChange} />

  if (type === 'cooperativa') return <div className="reg-legal">{picker}</div>

  const askRuc = type === 'productor'
  return (
    <div className="reg-legal">
      {askRuc && (
        <fieldset className="reg-choice reg-choice--compact">
          <legend>¿Cuentas con RUC?</legend>
          <div className="reg-choice__options">
            {([['si', 'Sí, tengo RUC'], ['no', 'No tengo RUC']] as const).map(([value, label]) => (
              <label key={value} className="reg-choice__option">
                <input type="radio" name="has_ruc" value={value} required checked={hasRuc === value} onChange={() => onHasRucChange(value)} />
                <span className="reg-choice__card"><strong>{label}</strong></span>
              </label>
            ))}
          </div>
          <small className="form-field__hint">{hasRuc === 'no' ? 'Puedes registrarte sin RUC y agregarlo después desde tu panel.' : 'Con tu RUC puedes obtener la etiqueta Verificado.'}</small>
        </fieldset>
      )}
      {(!askRuc || hasRuc === 'si') && (
        <div className="reg-ruc-row">
          <label className="form-field"><span className="form-field__label">{askRuc ? 'RUC' : 'RUC de la empresa'}</span><input name="ruc" type="text" autoComplete="off" maxLength={30} placeholder={askRuc ? '8-123-4567' : '155612345-2-2015'} required value={ruc} onChange={(event) => onRucChange(event.target.value)} /><span className="form-field__hint" aria-hidden="true" /></label>
          <label className="form-field"><span className="form-field__label">Dígito verificador</span><input name="ruc_dv" type="text" inputMode="numeric" autoComplete="off" maxLength={2} pattern="[0-9]{1,2}" required value={rucDv} onChange={(event) => onRucDvChange(event.target.value)} /><span className="form-field__hint" aria-hidden="true" /></label>
        </div>
      )}
      {picker}
    </div>
  )
}

/** Only what applies to the chosen type is sent, even if the user changed type midway. */
export function appendRegistrantDocuments(body: FormData, input: { type: RegistrantType; hasRuc: HasRuc; ruc: string; rucDv: string; documents: RegistrantDocuments }) {
  if (!input.type) return
  const file = input.documents[REQUIRED_DOCUMENT[input.type].type]
  if (file) body.append(REQUIRED_DOCUMENT[input.type].type, file)
  if (input.type === 'cooperativa') return
  if (input.type === 'distribuidor' || input.hasRuc === 'si') {
    body.append('ruc', input.ruc.trim().toUpperCase())
    body.append('ruc_dv', input.rucDv.trim())
  }
}
