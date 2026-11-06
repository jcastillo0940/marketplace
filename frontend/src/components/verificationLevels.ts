import type { ProducerVerificationLevel } from '../api/client'

const PUBLIC_VERIFIED_LEVELS: ProducerVerificationLevel[] = ['identity_reviewed', 'biometric_verified', 'producer_validated']

export const VERIFICATION_LABELS: Record<ProducerVerificationLevel, string> = {
  unverified: 'Contacto sin confirmar',
  contact_confirmed: 'Teléfono confirmado',
  identity_reviewed: 'Verificado',
  biometric_verified: 'Verificado Pro',
  producer_validated: 'Productor Super Carnes',
}

export const VERIFIED_DOCUMENT_LABELS: Record<string, string> = {
  ruc: 'RUC revisado',
  pacto_social: 'Pacto social revisado',
  aviso_operacion: 'Aviso de operación revisado',
}

export function isPublicVerifiedLevel(level?: ProducerVerificationLevel | null): boolean {
  return Boolean(level) && PUBLIC_VERIFIED_LEVELS.includes(level as ProducerVerificationLevel)
}
