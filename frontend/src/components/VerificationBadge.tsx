import type { ProducerVerificationLevel } from '../api/client'
import superCarnesLogo from '../assets/super-carnes-logo.png'
import { VERIFICATION_LABELS } from './verificationLevels'

/** `internal` also shows the phone-only level, which the public site never displays. */
export default function VerificationBadge({ level, label, internal = false }: { level: ProducerVerificationLevel; label?: string; internal?: boolean }) {
  const displayLabel = label ?? VERIFICATION_LABELS[level]

  if (level === 'unverified') {
    return <span className="verification-badge verification-badge--unverified" aria-label={VERIFICATION_LABELS.unverified}>{VERIFICATION_LABELS.unverified}</span>
  }

  if (level === 'contact_confirmed') {
    return internal ? <span className="verification-badge verification-badge--unverified" aria-label={VERIFICATION_LABELS.contact_confirmed}>{VERIFICATION_LABELS.contact_confirmed}</span> : null
  }

  if (level === 'producer_validated') {
    return (
      <span className="verification-badge verification-badge--supercarnes" aria-label={displayLabel}>
        <img className="verification-badge__logo" src={superCarnesLogo} alt="" aria-hidden="true" />
        {displayLabel}
      </span>
    )
  }

  return (
    <span className="verification-badge verification-badge--verified-pro" aria-label={displayLabel}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M6 1L7.5 3.5L10.5 4L8.5 6.5L9 9.5L6 8L3 9.5L3.5 6.5L1.5 4L4.5 3.5L6 1Z" fill="currentColor" />
      </svg>
      {level === 'biometric_verified' ? <>Verificado <strong>Pro</strong></> : displayLabel}
    </span>
  )
}
