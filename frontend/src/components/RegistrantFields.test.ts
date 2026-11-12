import { describe, expect, it } from 'vitest'
import { appendRegistrantDocuments } from './RegistrantFields'

const file = (name: string) => new File(['x'], name, { type: 'application/pdf' })
const allDocuments = { cedula_photo: file('cedula.jpg'), aviso_operacion: file('aviso.pdf'), pacto_social: file('pacto.pdf') }
const base = { ruc: ' 155612345-2-2015 ', rucDv: '45', documents: allDocuments }

function keys(input: Parameters<typeof appendRegistrantDocuments>[1]) {
  const body = new FormData()
  appendRegistrantDocuments(body, input)
  return [...body.keys()]
}

describe('appendRegistrantDocuments', () => {
  it('sends only the pacto social for a cooperative', () => {
    expect(keys({ ...base, type: 'cooperativa', hasRuc: 'si' })).toEqual(['pacto_social'])
  })
  it('sends the operation notice and always the RUC for a company', () => {
    expect(keys({ ...base, type: 'distribuidor', hasRuc: '' })).toEqual(['aviso_operacion', 'ruc', 'ruc_dv'])
  })
  it('sends the cédula photo for a person, and the RUC only when they said they have one', () => {
    expect(keys({ ...base, type: 'productor', hasRuc: 'si' })).toEqual(['cedula_photo', 'ruc', 'ruc_dv'])
    expect(keys({ ...base, type: 'productor', hasRuc: 'no' })).toEqual(['cedula_photo'])
  })
  it('lets the person skip the document', () => {
    expect(keys({ ...base, documents: {}, type: 'productor', hasRuc: 'no' })).toEqual([])
    expect(keys({ ...base, documents: {}, type: 'cooperativa', hasRuc: '' })).toEqual([])
  })
})
