import type { ProducerVerificationLevel } from '../api/client'

const labels: Record<ProducerVerificationLevel, string> = {
  unverified: 'Contacto sin confirmar',
  contact_confirmed: 'Contacto confirmado',
  identity_reviewed: 'Identidad revisada',
  producer_validated: 'Productor validado',
}

export default function VerificationBadge({ level, label }: { level: ProducerVerificationLevel; label?: string }) {
  return <span className={`verification-badge verification-badge--${level}`} aria-label={`Nivel de revisión: ${label ?? labels[level]}`}>{label ?? labels[level]}</span>
}
