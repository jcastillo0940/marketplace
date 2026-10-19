const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type ContactMessageTemplates = { product: string; producer: string }
export const DEFAULT_CONTACT_MESSAGE_TEMPLATES: ContactMessageTemplates = {
  product: 'Hola, vi tu oferta de {product_title} en El Empujoncito. ¿Sigue disponible?',
  producer: 'Hola, encontré el perfil de {producer_name} en El Empujoncito. ¿Me puedes contar sobre tus ofertas?',
}
let publicTemplatesRequest: Promise<ContactMessageTemplates> | null = null
export function clearContactMessageTemplatesCache(): void { publicTemplatesRequest = null }
export function getContactMessageTemplates(): Promise<ContactMessageTemplates> {
  if (!publicTemplatesRequest) {
    publicTemplatesRequest = fetch(`${API_BASE}/message-templates`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Template request failed')
        const data = (await response.json() as { data?: Partial<ContactMessageTemplates> }).data ?? {}
        return {
          product: typeof data.product === 'string' ? data.product : DEFAULT_CONTACT_MESSAGE_TEMPLATES.product,
          producer: typeof data.producer === 'string' ? data.producer : DEFAULT_CONTACT_MESSAGE_TEMPLATES.producer,
        }
      }).catch(() => {
        publicTemplatesRequest = null
        return DEFAULT_CONTACT_MESSAGE_TEMPLATES
      })
  }
  return publicTemplatesRequest
}
export type AdminMessageTemplate = { key: 'product' | 'producer'; label: string; body: string; version: number; updated_at: string | null; updated_by: { id: number; name: string } | null; history: Array<{ version: number; body: string; updated_at: string; updated_by: string | null }> }
export async function getAdminMessageTemplates(): Promise<AdminMessageTemplate[]> {
  const response = await fetch(`${API_BASE}/admin/message-templates`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión para administrar mensajes.' : 'Tu cuenta no tiene permiso para administrar mensajes.')
  return (await response.json() as { data: AdminMessageTemplate[] }).data
}
export async function updateAdminMessageTemplate(key: 'product' | 'producer', body: string): Promise<AdminMessageTemplate> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/message-templates/${key}`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ body }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo guardar la plantilla.')
  }
  publicTemplatesRequest = null
  return (await response.json() as { data: AdminMessageTemplate }).data
}

export type ProducerVerificationLevel = 'unverified' | 'contact_confirmed' | 'identity_reviewed' | 'producer_validated'
export type ApiProduct = {
  id: number
  slug: string
  title: string
  description: string
  unit: string
  price_type: 'fixed' | 'from' | 'contact'
  price_amount: string | null
  currency: 'PAB' | 'USD'
  stock_quantity: string | null
  delivery_method: string
  status: string
  category: { name: string; slug: string }
  producer: { public_name: string; slug: string; contact_level: string; verification_level: ProducerVerificationLevel; verification_label?: string; phone_public?: string | null; location?: { name: string; parent?: { name: string; parent?: { name: string } } } }
  images: Array<{ id: number; url: string; thumbnail_url?: string; alt_text: string | null; position: number }>
}

export type Paginated<T> = { data: T[]; current_page: number; last_page: number; total: number }

export type AdminMfaRecoveryApproval = { approver: string; decision: 'approve' | 'reject'; reason: string; decided_at: string }
export type AdminMfaRecoveryRequest = {
  id: number
  target: { name: string; email: string }
  reason: string
  status: 'pending_first_approval' | 'awaiting_second_approval'
  requested_at: string
  expires_at: string
  approvals: AdminMfaRecoveryApproval[]
  prior_vote: 'approve' | 'reject' | null
}

export async function requestAdminMfaRecovery(reason: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/auth/mfa/recovery-requests`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
    body: JSON.stringify({ reason }),
  })
  if (response.status === 202) return
  const result = await response.json().catch(() => ({})) as { errors?: Record<string, string[]> }
  if (response.status === 422) throw new AuthFlowError(Object.values(result.errors ?? {}).flat().join(' ') || 'Revisa el motivo y vuelve a intentarlo.', 422)
  if (response.status === 429) throw new AuthFlowError('Alcanzaste el límite temporal de solicitudes. Espera antes de volver a intentarlo.', 429)
  throw new AuthFlowError('No pudimos registrar la solicitud. Tu motivo sigue en el formulario; inténtalo más tarde.', response.status)
}

export async function getAdminMfaRecoveryRequests(page: number): Promise<Paginated<AdminMfaRecoveryRequest>> {
  const response = await fetch(`${API_BASE}/admin/mfa-recovery-requests?page=${page}`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) {
    if (response.status === 423) throw new AuthFlowError('El acceso administrativo está bloqueado mientras se recupera el autenticador. Vuelve a ingresar para continuar con la reinscripción.', 423)
    if (response.status === 403) throw new AuthFlowError('No tienes permiso para revisar recuperaciones de MFA.', 403)
    throw new Error(response.status === 401 ? 'Tu sesión venció. Inicia sesión de nuevo.' : 'No pudimos cargar la cola de recuperación MFA.')
  }
  return response.json() as Promise<Paginated<AdminMfaRecoveryRequest>>
}

export async function decideAdminMfaRecovery(id: number, decision: 'approve' | 'reject', reason: string): Promise<AdminMfaRecoveryRequest> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/mfa-recovery-requests/${id}/decision`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
    body: JSON.stringify({ decision, reason }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { errors?: Record<string, string[]> }
    if (response.status === 423) throw new AuthFlowError('El acceso administrativo está bloqueado mientras se recupera el autenticador. Vuelve a ingresar para continuar con la reinscripción.', 423)
    if (response.status === 422) throw new AuthFlowError(Object.values(result.errors ?? {}).flat().join(' ') || 'Revisa el motivo de la decisión.', 422)
    if (response.status === 409) throw new AuthFlowError('La solicitud cambió o ya recibió tu decisión. Actualiza la cola antes de continuar.', 409)
    throw new Error(response.status === 403 ? 'No tienes permiso para revisar esta solicitud.' : 'No pudimos guardar la decisión. Tu motivo se conservó; inténtalo de nuevo.')
  }
  return (await response.json() as { data: AdminMfaRecoveryRequest }).data
}
export type PublicLocation = { id: number; name: string; slug: string; level: 'province' | 'district' | 'corregimiento'; parent_id: number | null; parent?: { name: string; slug: string } | null }

export async function listProducts(params: URLSearchParams, signal?: AbortSignal): Promise<Paginated<ApiProduct>> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/products?${params.toString()}`, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new Error('No pudimos conectar con el mercado. Revisa tu conexión e inténtalo de nuevo.')
  }
  if (!response.ok) throw new Error('No pudimos cargar las ofertas en este momento.')
  return response.json() as Promise<Paginated<ApiProduct>>
}

export async function recordNoResultSearch(params: URLSearchParams): Promise<void> {
  const body = Object.fromEntries(['q', 'category', 'province', 'district', 'corregimiento'].flatMap((key) => {
    const value = params.get(key)?.trim()
    return value ? [[key, value]] : []
  }))
  if (Object.keys(body).length === 0) return
  await fetch(`${API_BASE}/search-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
}

export async function getProduct(slug: string, signal?: AbortSignal): Promise<ApiProduct> {
  const response = await fetch(`${API_BASE}/products/${encodeURIComponent(slug)}`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Esta oferta no está disponible.')
  const result = await response.json() as { data: ApiProduct }
  return result.data
}

export async function recordContact(target: { product_id: number } | { producer_id: number }, channel: 'whatsapp' | 'phone'): Promise<void> {
  const response = await fetch(`${API_BASE}/contact-events`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...target, channel }) })
  if (!response.ok) throw new Error(response.status === 429 ? 'Se alcanzó el límite temporal para registrar contactos.' : 'No se pudo registrar la intención de contacto.')
}

export async function submitReport(payload: { resource_type: 'product' | 'producer'; resource_id: number; reason_code: string; description: string; contact_email?: string; evidence?: FileList | null }): Promise<{ reference: string }> {
  const body = new FormData()
  body.append('resource_type', payload.resource_type)
  body.append('resource_id', String(payload.resource_id))
  body.append('reason_code', payload.reason_code)
  body.append('description', payload.description)
  if (payload.contact_email) body.append('contact_email', payload.contact_email)
  Array.from(payload.evidence ?? []).forEach((file) => body.append('evidence[]', file))
  const response = await fetch(`${API_BASE}/reports`, { method: 'POST', headers: { Accept: 'application/json' }, body })
  if (response.status === 422) throw new Error('Revisa el motivo, los detalles y los archivos adjuntos. Corrige lo necesario e inténtalo de nuevo.')
  if (response.status === 429) throw new Error('Alcanzaste el límite temporal de reportes. Espera un momento antes de intentarlo de nuevo.')
  if (response.status === 404) throw new Error('Esta oferta o perfil ya no está disponible para reportar.')
  if (!response.ok) throw new Error('No pudimos enviar el reporte. Tus datos siguen en el formulario; inténtalo de nuevo más tarde.')
  return response.json() as Promise<{ reference: string }>
}

export async function csrfToken(): Promise<string> {
  const apiUrl = new URL(API_BASE, window.location.origin)
  const response = await fetch(new URL('/sanctum/csrf-cookie', apiUrl.origin), { credentials: 'include' })
  if (!response.ok) throw new Error('No pudimos iniciar la sesión segura. Inténtalo de nuevo.')
  return decodeURIComponent(document.cookie.split('; ').find((item) => item.startsWith('XSRF-TOKEN='))?.split('=').slice(1).join('=') ?? '')
}

export async function requestPasswordReset(email: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/auth/password/forgot`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ email }) })
  if (response.ok) return
  if (response.status === 429) throw new Error('Espera un momento antes de volver a solicitar instrucciones.')
  throw new Error('No pudimos procesar la solicitud. Inténtalo de nuevo más tarde.')
}

export async function resetPassword(payload: { email: string; token: string; password: string; password_confirmation: string }): Promise<void> {
  const xsrf = await csrfToken()
  const response = await fetch(`${API_BASE}/auth/password/reset`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf }, body: JSON.stringify(payload) })
  if (response.ok) return
  const result = await response.json().catch(() => ({})) as { errors?: Record<string, string[]> }
  if (response.status === 422) throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || 'El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.')
  if (response.status === 429) throw new Error('Espera un momento antes de volver a intentarlo.')
  throw new Error('No pudimos cambiar la contraseña. Inténtalo de nuevo más tarde.')
}

export async function completeAdminMfaChallenge(code: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/auth/mfa/challenge`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ code }) })
  if (response.ok) return
  const messages: Record<number, string> = {
    401: 'El desafío venció. Inicia sesión nuevamente.',
    422: 'El código MFA no es válido. Comprueba la hora de tu dispositivo e inténtalo otra vez.',
    429: 'Se alcanzó un límite temporal de intentos. Inicia sesión de nuevo y espera antes de volver a intentarlo.',
    503: 'La verificación administrativa no está disponible temporalmente. Inténtalo más tarde.',
  }
  throw new AuthFlowError(messages[response.status] ?? 'No se pudo completar la verificación MFA. Inténtalo de nuevo.', response.status)
}

export class AuthFlowError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'AuthFlowError'
  }
}
export async function getAdminMfaSetup(): Promise<{ enabled: boolean; secret?: string; otpauth_uri?: string }> {
  const response = await fetch(`${API_BASE}/auth/mfa/setup`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión para configurar MFA.' : 'Solo el personal interno puede configurar MFA.')
  return (await response.json() as { data: { enabled: boolean; secret?: string; otpauth_uri?: string } }).data
}
export async function confirmAdminMfa(code: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/auth/mfa/confirm`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ code }) })
  if (!response.ok) throw new Error('El código no es válido. Comprueba la hora del dispositivo y vuelve a intentarlo.')
}

export async function registerProducer(payload: { name: string; email: string; password: string; public_name: string; activity?: string; location_id: number; phone: string; terms_version: string; privacy_version: string; producer_authorized?: boolean; terms_confirmed?: boolean; privacy_confirmed?: boolean }, assisted = false): Promise<void> {
  const token = await csrfToken()
  const endpoint = assisted ? '/admin/producers/assisted' : '/auth/register'
  const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify(payload) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo crear la cuenta.')
  }
}

export async function saveProductDraft(form: FormData): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/me/products`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token }, body: form })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo guardar el borrador.')
  }
}

export async function getProducerProduct(id: string): Promise<{ id: number; title: string; description: string; unit: string; price_type: 'fixed' | 'from' | 'contact'; price_amount: string | null; currency: 'PAB' | 'USD'; stock_quantity: string | null; delivery_method: string; category_id: number; status: string; images: Array<{ id: number; url: string; alt_text: string | null; position: number }> }> {
  const response = await fetch(`${API_BASE}/me/products/${encodeURIComponent(id)}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 404 ? 'No encontramos esa publicación en tu cuenta.' : 'Inicia sesión para editar tus publicaciones.')
  const result = await response.json() as { data: { id: number; title: string; description: string; unit: string; price_type: 'fixed' | 'from' | 'contact'; price_amount: string | null; currency: 'PAB' | 'USD'; stock_quantity: string | null; delivery_method: string; category_id: number; status: string; images: Array<{ id: number; url: string; alt_text: string | null; position: number }> } }
  return result.data
}

export async function updateProduct(id: string, form: FormData): Promise<void> {
  const token = await csrfToken()
  form.append('_method', 'PATCH')
  if (!form.get('price_amount')) form.set('price_amount', '')
  const response = await fetch(`${API_BASE}/me/products/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token }, body: form })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo actualizar la publicación.')
  }
}

export async function submitProductForReview(id: number, reason: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/me/products/${id}/submit`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ reason }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo enviar la publicación a revisión. Comprueba que tenga fotografías y datos completos.')
  }
}

export async function transitionProducerProduct(id: number, status: 'paused' | 'sold_out' | 'published' | 'withdrawn'): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/me/products/${id}/transition`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ status, reason: status === 'withdrawn' ? 'El productor retiró voluntariamente esta oferta.' : undefined }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo actualizar el estado de la oferta.')
  }
}

export async function renewProducerProduct(id: number): Promise<{ published_at: string; listing_expires_at: string | null }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/me/products/${id}/renew`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token } })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo renovar la oferta.')
  }
  return (await response.json() as { data: { published_at: string; listing_expires_at: string | null } }).data
}

export async function listCategories(): Promise<Array<{ id: number; name: string; slug: string }>> {
  const response = await fetch(`${API_BASE}/categories`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No se pudieron cargar las categorías.')
  return response.json() as Promise<Array<{ id: number; name: string; slug: string }>>
}

export type ProducerDashboardProduct = { id: number; title: string; status: string; slug: string; published_at?: string | null; listing_expired?: boolean; listing_expires_at?: string | null; latest_moderation_decision: { from_status: string; to_status: string; reason: string | null; created_at: string } | null }

export type ProducerMetrics = {
  products: Record<string, number>
  contact_intentions_30d: number
  contact_channels_30d?: Partial<Record<'whatsapp' | 'phone', number>>
  profile_contact_intentions_30d?: number
  top_products_30d?: Array<{ product_id: number; title: string; contact_intentions: number }>
  period_days: 30
}

export async function getProducerDashboard(): Promise<{ user: { name: string; email: string }; profile: { public_name: string; slug: string; activity: string | null; description: string | null; location_id: number | null; phone_private: string; contact_level: string; profile_status: string; suspension_reason: string | null } | null; products: ProducerDashboardProduct[] }> {
  const [userResponse, productsResponse] = await Promise.all([
    fetch(`${API_BASE}/me`, { credentials: 'include', headers: { Accept: 'application/json' } }),
    fetch(`${API_BASE}/me/products`, { credentials: 'include', headers: { Accept: 'application/json' } }),
  ])
  if (!userResponse.ok || !productsResponse.ok) throw new Error('Inicia sesión para ver tu panel de productor.')
  const user = await userResponse.json() as { data: { name: string; email: string; profile: { public_name: string; slug: string; activity: string | null; description: string | null; location_id: number | null; phone_private: string; contact_level: string; profile_status: string; suspension_reason: string | null } | null } }
  const products = await productsResponse.json() as { data: ProducerDashboardProduct[] }
  return { user: user.data, profile: user.data.profile, products: products.data }
}

export async function getCurrentUserPermissions(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/me`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No pudimos consultar los permisos de esta sesión.')
  const result = await response.json() as { data: { permissions?: string[] } }
  return result.data.permissions ?? []
}

export async function getProducerMetrics(): Promise<ProducerMetrics> {
  const response = await fetch(`${API_BASE}/me/metrics`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No pudimos cargar el resumen de tus publicaciones.')
  const result = await response.json() as { data?: unknown }
  const data = result.data
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('products' in data) || typeof data.products !== 'object' || !data.products || Array.isArray(data.products)) {
    throw new Error('El resumen de publicaciones no está disponible. Inténtalo de nuevo más tarde.')
  }
  return data as ProducerMetrics
}

export type ProducerAppealState = { profile_status: string; suspension_reason: string | null; appeals: Array<{ id: number; reason: string; status: 'pending' | 'reinstated' | 'upheld'; resolution_note: string | null; submitted_at: string; reviewed_at: string | null }> }
export async function getProducerAppeals(): Promise<ProducerAppealState> {
  const response = await fetch(`${API_BASE}/me/appeals`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No pudimos cargar el canal de revisión de tu perfil.')
  return (await response.json() as { data: ProducerAppealState }).data
}
export async function submitProducerAppeal(reason: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/me/appeals`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ reason }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No pudimos enviar la solicitud de revisión.')
  }
}

export async function updateProducerProfile(form: FormData): Promise<void> {
  const token = await csrfToken()
  const body = Object.fromEntries(form)
  if (!body.location_id) body.location_id = ''
  const response = await fetch(`${API_BASE}/me/profile`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify(body) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No pudimos guardar tu perfil.')
  }
}

export async function startPhoneVerification(): Promise<{ id: number; expires_at: string; development_code?: string }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/me/verify-phone/start`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: '{}' })
  if (!response.ok) throw new Error('No pudimos iniciar la verificación del teléfono.')
  return (await response.json() as { data: { id: number; expires_at: string; development_code?: string } }).data
}
export async function verifyProducerPhone(phone: string, code: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/auth/verify`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ phone, code }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(result.message || 'No pudimos confirmar el teléfono.')
  }
}

export async function listLocations(): Promise<PublicLocation[]> {
  const response = await fetch(`${API_BASE}/locations`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No se pudieron cargar las ubicaciones.')
  return response.json() as Promise<PublicLocation[]>
}

export type ModerationItem = Omit<ApiProduct, 'producer' | 'category'> & {
  producer: ApiProduct['producer'] & { profile_status: string; contact_verified: boolean }
  category: ApiProduct['category'] & { active: boolean; parent?: { active: boolean } | null }
  status_history: Array<{ from_status: string | null; to_status: string; reason: string | null; actor: { name: string } | null; created_at: string }>
}

export async function getModerationQueue(page = 1): Promise<Paginated<ModerationItem>> {
  const response = await fetch(`${API_BASE}/admin/moderation?page=${page}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta de moderación.' : 'Tu cuenta no tiene permiso para revisar publicaciones.')
  return response.json() as Promise<Paginated<ModerationItem>>
}

export async function decideModeration(id: number, decision: 'approve' | 'reject' | 'request_changes', reason: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/products/${id}/decision`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ decision, reason }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No pudimos guardar la decisión. Actualiza la cola y vuelve a intentarlo.')
  }
}

export type BulkModerationDecision = 'approve' | 'reject' | 'request_changes'
export type BulkModerationResult = { processed: Array<{ id: number; status: string }>; failed: Array<{ id: number; message: string }> }

export async function decideModerationBulk(ids: number[], decision: BulkModerationDecision, reason: string): Promise<BulkModerationResult> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/products/bulk-decision`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ ids, decision, reason }) })
  const result = await response.json().catch(() => ({})) as { data?: BulkModerationResult; message?: string; errors?: Record<string, string[]> }
  if (!response.ok || !result.data) {
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No pudimos guardar las decisiones. Actualiza la cola y vuelve a intentarlo.')
  }
  return result.data
}

export type ProducerPublicProfile = { id: number; slug: string; public_name: string; activity: string | null; description: string | null; contact_level: string; verification_level: ProducerVerificationLevel; verification_label: string; phone_public: string | null; location: { name: string; parent?: { name: string; parent?: { name: string } } } | null; products: ApiProduct[] }

export type PublicProducerSummary = { id: number; slug: string; public_name: string; activity: string | null; description: string | null; contact_level: string; verification_level: ProducerVerificationLevel; verification_label: string; products_count: number; location: { name: string; parent?: { name: string } | null } | null }

export async function getPublicProducers(params: URLSearchParams, signal?: AbortSignal): Promise<Paginated<PublicProducerSummary>> {
  const response = await fetch(`${API_BASE}/producers?${params.toString()}`, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No pudimos cargar el directorio de productores. Revisa los filtros e inténtalo de nuevo.')
  return response.json() as Promise<Paginated<PublicProducerSummary>>
}

export async function getPublicProducer(slug: string): Promise<ProducerPublicProfile> {
  const response = await fetch(`${API_BASE}/producers/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('No encontramos este perfil público.')
  const result = await response.json() as { data: ProducerPublicProfile }
  return result.data
}

export type ReportCase = { id: number; public_reference: string; resource_type: string; resource_id: number; reason_code: string; description: string; contact_email: string | null; status: string; priority: 'low' | 'normal' | 'high' | 'urgent'; assignee_id: number | null; assignee: { id: number; name: string } | null; sla_due_at: string; sla_overdue: boolean; created_at: string; evidence: Array<{ id: number; mime_type: string; size_bytes: number; created_at: string }> }
export type ReportCaseDetail = ReportCase & { can_release: boolean; resource: { type: 'product' | 'producer'; id: number; label: string; slug: string } | null; history: Array<{ action: string; reason: string | null; changes: Record<string, { from: string | number | null; to: string | number | null }>; actor: { name: string } | null; created_at: string }> }
export type RiskAlert = { id: number; signal_type: string; resource_type: string; resource_id: number; severity: string; explanation: string; evidence: { report_count_24h?: number; window_hours?: number; rule?: string }; status: string; assignee_id: number | null; assignee: { id: number; name: string } | null; first_seen_at: string; last_seen_at: string }
export async function getAdminSecurityAlerts(page = 1): Promise<Paginated<RiskAlert>> {
  const response = await fetch(`${API_BASE}/admin/security/alerts?page=${page}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con acceso a Trust & Safety.' : 'Tu cuenta no tiene permiso para revisar alertas de seguridad.')
  return response.json() as Promise<Paginated<RiskAlert>>
}
export async function updateAdminSecurityAlert(id: number, status: 'reviewing' | 'resolved' | 'dismissed', resolution_note: string): Promise<{ status: string; assignee_id: number }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/security/alerts/${id}`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ status, resolution_note }) })
  if (!response.ok) throw new Error(response.status === 409 ? 'La alerta cambió de estado o está asignada a otra persona. Actualiza la cola e inténtalo de nuevo.' : 'No se pudo guardar la revisión de la alerta.')
  return (await response.json() as { data: { status: string; assignee_id: number } }).data
}
export function reportEvidenceUrl(reportId: number, evidenceId: number): string { return `${API_BASE}/admin/reports/${reportId}/evidence/${evidenceId}` }

export async function getReportCases(page = 1): Promise<Paginated<ReportCase>> {
  const response = await fetch(`${API_BASE}/admin/reports?page=${page}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta de Trust & Safety.' : 'Tu cuenta no tiene permiso para revisar casos.')
  return response.json() as Promise<Paginated<ReportCase>>
}

export async function getReportCase(id: number): Promise<ReportCaseDetail> {
  const response = await fetch(`${API_BASE}/admin/reports/${id}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Inicia sesión con acceso a Trust & Safety.')
    if (response.status === 403) throw new Error('Tu cuenta no tiene permiso para consultar este expediente.')
    if (response.status === 404) throw new Error('Este caso ya no está disponible.')
    throw new Error('No pudimos cargar el expediente. Inténtalo de nuevo.')
  }
  return (await response.json() as { data: ReportCaseDetail }).data
}

export async function updateReportCase(id: number, status: 'reviewing' | 'resolved' | 'dismissed', priority: string, resolution_note: string): Promise<{ assignee_id: number; assignee: { id: number; name: string } | null }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/reports/${id}`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ status, priority, resolution_note }) })
  if (!response.ok) throw new Error(response.status === 409 ? 'Este caso está asignado a otra persona o cambió de estado. Actualiza la cola e inténtalo de nuevo.' : 'No pudimos guardar la actualización del caso.')
  return (await response.json() as { data: { assignee_id: number; assignee: { id: number; name: string } | null } }).data
}

export async function releaseReportCase(id: number, resolution_note: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/reports/${id}/release`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ resolution_note }) })
  if (!response.ok) throw new Error(response.status === 409 ? 'El caso cambió de estado o ya no está asignado a tu cuenta. Actualiza el expediente.' : 'No pudimos liberar el caso. Conservamos la nota para que puedas volver a intentarlo.')
}

export async function updateReportPriority(id: number, priority: ReportCase['priority']): Promise<Pick<ReportCase, 'priority' | 'sla_due_at' | 'sla_overdue'>> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/reports/${id}/priority`, { method: 'PATCH', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ priority }) })
  if (!response.ok) throw new Error(response.status === 409 ? 'Este caso está asignado a otra persona. Actualiza la cola antes de cambiar su prioridad.' : 'No pudimos guardar la prioridad del caso. Inténtalo de nuevo.')
  const result = await response.json() as { data: Pick<ReportCase, 'priority' | 'sla_due_at' | 'sla_overdue'> }
  return result.data
}

export type AdminProducer = { id: number; public_name: string; slug: string; activity: string | null; profile_status: string; contact_level: string; verification_level: ProducerVerificationLevel; products_count: number; account: { name: string; email: string } | null }
export type AdminProducerDetail = {
  producer: { id: number; public_name: string; slug: string; activity: string | null; description: string | null; profile_status: string; suspension_reason: string | null; contact_level: string; verification_level: ProducerVerificationLevel; phone_verified_at: string | null; registration_method: string; registered_by: string | null; location: { name: string; parent?: { name: string } | null } | null }
  account: { name: string; email: string; created_at: string }
  consents: Array<{ id: number; consent_type: string; version: string; accepted_at: string }>
  verifications: Array<{ id: number; channel: string; status: string; verified_at: string | null; expires_at: string | null; attempts_count: number }>
  trust_reviews: Array<{ from_level: ProducerVerificationLevel; to_level: ProducerVerificationLevel; reason: string; actor: string | null; created_at: string }>
  product_status_counts: Record<string, number>
  products: Array<{ id: number; title: string; status: string; updated_at: string }>
  product_history: Array<{ product_title: string; from_status: string | null; to_status: string; reason: string | null; actor: string | null; created_at: string }>
  audit: Array<{ action: string; before_values: Record<string, unknown> | null; after_values: Record<string, unknown> | null; reason: string | null; actor: string | null; created_at: string }>
}
export async function getAdminProducerDetail(id: string): Promise<AdminProducerDetail> {
  const response = await fetch(`${API_BASE}/admin/producers/${encodeURIComponent(id)}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para consultar productores.' : response.status === 404 ? 'No encontramos ese perfil de productor.' : 'Tu cuenta no tiene permiso para consultar el historial del productor.')
  return (await response.json() as { data: AdminProducerDetail }).data
}
export async function getAdminProducers(filters: { q?: string; status?: 'pending' | 'active' | 'suspended'; page?: number } = {}, signal?: AbortSignal): Promise<Paginated<AdminProducer>> {
  const params = new URLSearchParams()
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.status) params.set('status', filters.status)
  if (filters.page) params.set('page', String(filters.page))
  const response = await fetch(`${API_BASE}/admin/producers?${params.toString()}`, { credentials: 'include', headers: { Accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para consultar productores.' : 'Tu cuenta no tiene permiso para consultar el directorio de productores.')
  return response.json() as Promise<Paginated<AdminProducer>>
}
export async function setAdminProducerStatus(id: number, profile_status: 'active' | 'suspended', reason: string): Promise<{ profile_status: 'active' | 'suspended'; products_queued_for_review: number }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/producers/${id}/status`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ profile_status, reason }) })
  const result = await response.json().catch(() => ({})) as { data?: { profile_status: 'active' | 'suspended'; products_queued_for_review: number }; message?: string; errors?: Record<string, string[]> }
  if (!response.ok || !result.data) throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo actualizar el estado del productor.')
  return result.data
}
export async function setAdminProducerTrustLevel(id: number, level: Exclude<ProducerVerificationLevel, 'unverified'>, reason: string): Promise<{ verification_level: ProducerVerificationLevel; verification_label: string }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/producers/${id}/trust-level`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ level, reason }) })
  const result = await response.json().catch(() => ({})) as { data?: { verification_level: ProducerVerificationLevel; verification_label: string }; message?: string; errors?: Record<string, string[]> }
  if (!response.ok || !result.data) throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo actualizar el nivel de revisión.')
  return result.data
}
export type AdminProducerAppeal = { id: number; reason: string; status: string; submitted_at: string; published_products_count: number; producer: { id: number; public_name: string; slug: string; profile_status: string; suspension_reason: string | null }; submitter: { id: number; name: string } }
export async function getAdminProducerAppeals(): Promise<AdminProducerAppeal[]> {
  const response = await fetch(`${API_BASE}/admin/producer-appeals`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con acceso administrativo.' : 'Tu cuenta no tiene permiso para revisar apelaciones.')
  return (await response.json() as { data: AdminProducerAppeal[] }).data
}
export async function decideProducerAppeal(id: number, decision: 'reinstated' | 'upheld', resolution_note: string): Promise<{ products_queued_for_review: number }> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/producer-appeals/${id}`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ decision, resolution_note }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No pudimos guardar la decisión.')
  }
  const result = await response.json() as { data: { products_queued_for_review: number } }
  return result.data
}
export type AdminCategory = { id: number; parent_id: number | null; name: string; slug: string; active: boolean; position: number; products_count: number }
export async function getAdminCategories(): Promise<AdminCategory[]> {
  const response = await fetch(`${API_BASE}/admin/categories`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para administrar catálogos.' : 'Tu cuenta no tiene permiso para administrar categorías.')
  return response.json() as Promise<AdminCategory[]>
}
export type AdminLocation = { id: number; parent_id: number | null; name: string; level: 'province' | 'district' | 'corregimiento'; slug: string; active: boolean; parent?: { name: string } | null }
export async function getAdminLocations(): Promise<AdminLocation[]> {
  const response = await fetch(`${API_BASE}/admin/locations`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para administrar catálogos.' : 'Tu cuenta no tiene permiso para administrar ubicaciones.')
  return response.json() as Promise<AdminLocation[]>
}
export async function saveAdminLocation(location: Omit<AdminLocation, 'id' | 'slug' | 'parent'>, id?: number): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/locations${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify(location) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo guardar la ubicación; revisa el nivel y la ubicación padre.')
  }
}
export async function saveAdminCategory(category: Omit<AdminCategory, 'id' | 'slug' | 'products_count'>, id?: number): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/categories${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify(category) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo guardar la categoría.')
  }
}
export async function updateAdminCategory(id: number, category: Omit<AdminCategory, 'id' | 'slug' | 'products_count'>): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/categories/${id}`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify(category) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo actualizar la categoría.')
  }
}
export async function updateAdminLocation(id: number, location: Omit<AdminLocation, 'id' | 'slug' | 'parent'>): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/locations/${id}`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify(location) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudo actualizar la ubicación.')
  }
}
export async function deactivateAdminCatalogItem(kind: 'categories' | 'locations', id: number): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/${kind}/${id}`, { method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token } })
  if (!response.ok) throw new Error('No se pudo desactivar; revisa si el elemento tiene contenido asociado.')
}
export type AdminMetrics = { producers: Record<string, number>; products: Record<string, number>; reports_open: number; contact_intentions_30d: number; searches_without_results_30d: number; moderation_decisions_30d: number; average_moderation_hours_30d: number | null }
export async function getAdminMetrics(): Promise<AdminMetrics> {
  const response = await fetch(`${API_BASE}/admin/analytics`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 423) throw new AuthFlowError('El acceso administrativo está bloqueado mientras se recupera el autenticador.', 423)
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para consultar métricas.' : 'Tu cuenta no tiene permiso para consultar métricas operativas.')
  return (await response.json() as { data: AdminMetrics }).data
}
export async function downloadAdminMetricsCsv(): Promise<Blob> {
  const response = await fetch(`${API_BASE}/admin/analytics/export.csv`, { credentials: 'include', headers: { Accept: 'text/csv' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para exportar métricas.' : 'Tu cuenta no tiene permiso para exportar métricas.')
  return response.blob()
}
export async function getAuditLogs(): Promise<Array<{ id: number; action: string; resource_type: string; resource_id: number | null; reason: string | null; created_at: string; actor: { name: string } | null }>> {
  const response = await fetch(`${API_BASE}/admin/audit`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión con una cuenta autorizada para consultar la auditoría.' : 'Tu cuenta no tiene permiso para consultar la auditoría.')
  return (await response.json() as { data: Array<{ id: number; action: string; resource_type: string; resource_id: number | null; reason: string | null; created_at: string; actor: { name: string } | null }> }).data
}

export type AdminRole = { id: number; name: string; display_name: string; permissions: Array<{ id: number; name: string }> }
export type AdminUser = { id: number; name: string; email: string; created_at: string; roles: AdminRole[] }
export async function getAdminRoles(): Promise<AdminRole[]> {
  const response = await fetch(`${API_BASE}/admin/roles`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión para administrar usuarios.' : 'Tu cuenta no tiene permiso para administrar usuarios.')
  return response.json() as Promise<AdminRole[]>
}
export async function getAdminUsers(query = '', page = 1): Promise<Paginated<AdminUser>> {
  const params = new URLSearchParams({ q: query, page: String(page), per_page: '20' })
  const response = await fetch(`${API_BASE}/admin/users?${params}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Inicia sesión para administrar usuarios.' : 'Tu cuenta no tiene permiso para administrar usuarios.')
  return response.json() as Promise<Paginated<AdminUser>>
}
export async function setAdminUserRoles(id: number, roles: string[], reason: string): Promise<void> {
  const token = await csrfToken()
  const response = await fetch(`${API_BASE}/admin/users/${id}/roles`, { method: 'PUT', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: JSON.stringify({ roles, reason }) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    throw new Error(Object.values(result.errors ?? {}).flat().join(' ') || result.message || 'No se pudieron actualizar los roles.')
  }
}
