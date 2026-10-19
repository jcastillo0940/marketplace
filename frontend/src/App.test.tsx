import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import App from './App'
import { clearContactMessageTemplatesCache } from './api/client'

function paginated<T>(data: T[]) {
  return { current_page: 1, data, first_page_url: null, from: data.length ? 1 : null, last_page: 1, links: [], next_page_url: null, path: '/', per_page: 20, prev_page_url: null, to: data.length || null, total: data.length }
}

function RouteGroupNavigationHarness() {
  const location = useLocation()
  return <><nav aria-label="Prueba de cambios de sección"><Link to="/mi-panel?from=public">Productor</Link><Link to="/admin?from=producer">Administración</Link><Link to="/seguridad?from=admin">Público</Link></nav><output data-testid="route-location">{location.pathname}{location.search}</output></>
}

describe('route group contract', () => {
  it('renders the public home route', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: /el mercado de nuestra tierra/i })).toBeInTheDocument()
  })

  it('renders the public not-found page for unknown paths', async () => {
    render(<MemoryRouter initialEntries={['/ruta-que-no-existe']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument()
  })

  it('keeps the shared not-found recovery links in the admin route group', async () => {
    render(<MemoryRouter initialEntries={['/admin/ruta-desconocida']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a explorar' })).toHaveAttribute('href', '/productos')
  })

  it('switches lazy groups through SPA navigation without dropping query state', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/?campaign=home']}><RouteGroupNavigationHarness /><App /></MemoryRouter>)

    await user.click(screen.getByRole('link', { name: 'Productor' }))
    expect(await screen.findByRole('heading', { name: 'Mi panel' })).toBeInTheDocument()
    expect(screen.getByTestId('route-location')).toHaveTextContent('/mi-panel?from=public')

    await user.click(screen.getByRole('link', { name: 'Administración' }))
    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeInTheDocument()
    expect(screen.getByTestId('route-location')).toHaveTextContent('/admin?from=producer')

    await user.click(screen.getByRole('link', { name: 'Público' }))
    expect(await screen.findByRole('heading', { name: 'Compra con cuidado' })).toBeInTheDocument()
    expect(screen.getByTestId('route-location')).toHaveTextContent('/seguridad?from=admin')
  })

  it('keeps the public mobile navigation and footer links available', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/seguridad']}><App /></MemoryRouter>)

    const footer = within(screen.getByRole('navigation', { name: 'Enlaces del pie de página' }))
    expect(footer.getByRole('link', { name: 'Sobre el proyecto' })).toHaveAttribute('href', '/sobre-el-proyecto')
    const menu = screen.getByLabelText('Abrir menú')
    expect(menu).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menu)

    expect(screen.getByLabelText('Cerrar menú')).toHaveAttribute('aria-expanded', 'true')
    await user.click(within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', { name: 'Productos' }))

    expect(screen.getByLabelText('Abrir menú')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda')
  })

  it('opens and closes the mobile navigation with keyboard controls', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/seguridad']}><App /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Compra con cuidado' })
    const menu = screen.getByLabelText('Abrir menú')
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
    menu.style.display = 'grid'
    navigation.style.display = 'none'
    await user.tab()
    await user.tab()
    expect(menu).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Cerrar menú')).toHaveFocus()
    navigation.style.removeProperty('display')
    expect(navigation).toBeVisible()

    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Abrir menú')).toHaveFocus()
  })
})

describe('marketplace home', () => {
  it('gives buyers practical safety guidance and a route to report an offer', () => {
    render(<MemoryRouter initialEntries={['/seguridad']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Compra con cuidado' })).toBeInTheDocument()
    expect(screen.getByText(/no compartas contraseñas ni códigos de verificación/i)).toBeInTheDocument()
    expect(screen.getByText(/la plataforma no procesa pagos/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explorar ofertas/i })).toHaveAttribute('href', '/productos')
    expect(screen.getByRole('link', { name: /reportar una oferta/i })).toHaveAttribute('href', '/productos')
  })

  it('explains how producers can publish without AI', () => {
    render(<MemoryRouter initialEntries={['/ayuda-productor']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /publica tus productos paso a paso/i })).toBeInTheDocument()
    expect(screen.getByText(/en esta versión completas todo manualmente/i)).toBeInTheDocument()
    expect(screen.getByText(/las publicaciones pasan por revisión/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /crear mi cuenta/i })).toHaveAttribute('href', '/registro')
    expect(screen.getByRole('link', { name: /ver mis publicaciones/i })).toHaveAttribute('href', '/mis-productos')
  })

  it('provides a useful help index for buyers and producers', () => {
    render(<MemoryRouter initialEntries={['/ayuda']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /ayuda para comprar y vender/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /consejos para comprar/i })).toHaveAttribute('href', '/seguridad')
    expect(screen.getByRole('link', { name: /guía para productores/i })).toHaveAttribute('href', '/ayuda-productor')
  })

  it('explains marketplace boundaries and links visitors to its public paths', () => {
    render(<MemoryRouter initialEntries={['/sobre-el-proyecto']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Sobre el proyecto' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ofertas de quienes producen' })).toBeInTheDocument()
    expect(screen.getByText(/la plataforma no procesa pagos ni organiza entregas/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'La IA no es necesaria' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explorar ofertas/i })).toHaveAttribute('href', '/productos')
    expect(screen.getByRole('link', { name: /consejos de seguridad/i })).toHaveAttribute('href', '/seguridad')
    expect(screen.getByRole('link', { name: /ver ayuda/i })).toHaveAttribute('href', '/ayuda')
  })

  it('offers an aggregate CSV export on the admin metrics page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { producers: { active: 4 }, products: { published: 8 }, reports_open: 1, contact_intentions_30d: 12, searches_without_results_30d: 2 } }) }))
    render(<MemoryRouter initialEntries={['/admin/reportes']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Métricas operativas' })).toBeInTheDocument()
    expect(await screen.findByText(/no incluyen información personal/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar CSV agregado' })).toBeInTheDocument()
    expect(screen.getByText('Intenciones de contacto')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('opens the moderation queue at the roadmap publications route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }))
    render(<MemoryRouter initialEntries={['/admin/publicaciones']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Cola de moderación' })).toBeInTheDocument()
    expect(screen.getByText('No hay publicaciones pendientes')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('collects moderation reasons in an accessible form instead of a browser prompt', async () => {
    const user = userEvent.setup()
    const item = { id: 17, slug: 'yuca-fresca', title: 'Yuca fresca', description: 'Yuca cosechada esta semana en la finca.', unit: 'libra', price_type: 'contact', price_amount: null, currency: 'PAB', stock_quantity: null, delivery_method: 'Retiro coordinado', status: 'pending', category: { name: 'Raíces', slug: 'raices', active: true, parent: null }, producer: { public_name: 'Finca de prueba', slug: 'finca-prueba', contact_level: 'contact_confirmed', profile_status: 'active', contact_verified: true }, images: [], status_history: [] }
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/admin/moderation')) return Promise.resolve({ ok: true, json: async () => paginated([item]) })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Aclara la unidad de venta ofrecida.')
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/publicaciones']}><App /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'Solicitar cambios' }))
    expect(promptSpy).not.toHaveBeenCalled()
    const reason = screen.getByRole('textbox', { name: /motivo de la decisión/i })
    const confirm = screen.getByRole('button', { name: 'Guardar decisión' })
    await user.click(confirm)
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveFocus()

    await user.type(reason, 'Aclara la unidad de venta ofrecida.')
    await user.click(confirm)
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => {
      const url = new URL(String(input), 'http://localhost:8000')
      return url.pathname.endsWith('/admin/products/17/decision') && init?.method === 'POST' && JSON.parse(String(init.body)).decision === 'request_changes' && JSON.parse(String(init.body)).reason === 'Aclara la unidad de venta ofrecida.'
    })).toBe(true))
    promptSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('applies one validated decision to the explicitly selected moderation page items', async () => {
    const user = userEvent.setup()
    const item = (id: number, title: string) => ({ id, slug: `producto-${id}`, title, description: 'Producto local para el ejemplo.', unit: 'libra', price_type: 'contact', price_amount: null, currency: 'PAB', stock_quantity: null, delivery_method: 'Retiro coordinado', status: 'pending', category: { name: 'Raíces', slug: 'raices', active: true, parent: null }, producer: { public_name: `Finca ${id}`, slug: `finca-${id}`, contact_level: 'contact_confirmed', profile_status: 'active', contact_verified: true }, images: [], status_history: [] })
    let queueLoads = 0
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/admin/moderation')) {
        queueLoads++
        return Promise.resolve({ ok: true, json: async () => paginated(queueLoads === 1 ? [item(17, 'Yuca fresca'), item(18, 'Ñame local')] : []) })
      }
      if (url.pathname.endsWith('/admin/products/bulk-decision')) return Promise.resolve({ ok: true, json: async () => ({ data: { processed: [{ id: 17, status: 'changes_requested' }, { id: 18, status: 'changes_requested' }], failed: [] } }) })
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/publicaciones']}><App /></MemoryRouter>)

    await user.click(await screen.findByRole('checkbox', { name: /seleccionar todas las publicaciones de esta página/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /decisión para las publicaciones seleccionadas/i }), 'request_changes')
    await user.type(screen.getByRole('textbox', { name: /motivo común para la decisión/i }), 'Aclara la unidad y disponibilidad antes de publicar.')
    await user.click(screen.getByRole('button', { name: 'Solicitar cambios a 2 publicaciones' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => {
      const url = new URL(String(input), 'http://localhost:8000')
      return url.pathname.endsWith('/admin/products/bulk-decision') && init?.method === 'POST' && JSON.stringify(JSON.parse(String(init.body))).includes('17') && JSON.parse(String(init.body)).reason === 'Aclara la unidad y disponibilidad antes de publicar.'
    })).toBe(true))
    expect(await screen.findByText(/2 publicaciones actualizadas/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('limits approve-all to eligible visible items and preserves bulk reason after partial failure', async () => {
    const user = userEvent.setup()
    const item = (id: number, profile_status: string) => ({ id, slug: 'producto-' + id, title: 'Oferta ' + id, description: 'Producto local para el ejemplo.', unit: 'libra', price_type: 'contact', price_amount: null, currency: 'PAB', stock_quantity: null, delivery_method: 'Retiro coordinado', status: 'pending', category: { name: 'Raíces', slug: 'raices', active: true, parent: null }, producer: { public_name: 'Finca ' + id, slug: 'finca-' + id, contact_level: 'contact_confirmed', profile_status, contact_verified: true }, images: [], status_history: [] })
    let sent: Record<string, unknown> | null = null
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/admin/moderation')) return Promise.resolve({ ok: true, json: async () => paginated([item(27, 'active'), item(28, 'suspended')]) })
      if (url.pathname.endsWith('/admin/products/bulk-decision')) { sent = JSON.parse(String(init?.body)); return Promise.resolve({ ok: true, json: async () => ({ data: { processed: [{ id: 27, status: 'published' }], failed: [{ id: 28, message: 'El perfil está suspendido.' }] } }) }) }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/publicaciones']}><App /></MemoryRouter>)
    await screen.findByRole('checkbox', { name: /seleccionar todas las publicaciones/i })
    await user.selectOptions(screen.getByRole('combobox', { name: /decisión para las publicaciones seleccionadas/i }), 'approve')
    expect(screen.getByRole('checkbox', { name: /seleccionar publicaciones aprobables de esta página/i })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /no aprobable con los requisitos actuales/i })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /seleccionar publicaciones aprobables de esta página/i }))
    await user.type(screen.getByRole('textbox', { name: /motivo común para la decisión/i }), 'Revisión manual completa y requisitos confirmados.')
    await user.click(screen.getByRole('button', { name: 'Aprobar y publicar a 1 publicaciones' }))
    expect(await screen.findByText(/1 publicación actualizada; 1 no se procesaron/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /motivo común para la decisión/i })).toHaveValue('Revisión manual completa y requisitos confirmados.')
    expect(sent).toMatchObject({ ids: [27], decision: 'approve', reason: 'Revisión manual completa y requisitos confirmados.' })
    vi.unstubAllGlobals()
  })


  it('opens the assisted producer registration as a dedicated admin page', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      const result = url.pathname.endsWith('/me')
        ? { data: { permissions: ['producers.assist'] } }
        : url.pathname.endsWith('/locations')
          ? [{ id: 1, level: 'province', name: 'Herrera', slug: 'herrera', active: true }]
          : { data: [] }
      return Promise.resolve({ ok: true, json: async () => result })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/registro-asistido']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Registro asistido de productores' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del productor')).toBeInTheDocument()
    expect(screen.getByText(/el productor autorizó este registro/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/admin/producers'), expect.anything())
    vi.unstubAllGlobals()
  })

  it('keeps an assisted registration retryable and clears its temporary password after success', async () => {
    const user = userEvent.setup()
    let registrationRequests = 0
    const registrationBodies: Record<string, unknown>[] = []
    const firstFailure: { release?: () => void } = {}
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['producers.assist'] } }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, level: 'province', name: 'Herrera', slug: 'herrera', active: true }] })
      if (url.pathname.endsWith('/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/admin/producers/assisted')) {
        registrationRequests += 1
        registrationBodies.push(JSON.parse(String(init?.body)))
        if (registrationRequests === 1) return new Promise((resolve) => { firstFailure.release = () => resolve({ ok: false, json: async () => ({ message: 'Servicio temporalmente no disponible. Intenta otra vez.' }) }) })
        return Promise.resolve({ ok: true, json: async () => ({ data: { id: 19 } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/registro-asistido']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Registro asistido de productores' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre del productor'), 'Productora de prueba')
    await user.type(screen.getByLabelText('Correo electrónico del productor'), 'productora@example.test')
    await user.type(screen.getByLabelText('Nombre público'), 'Finca de prueba')
    await user.selectOptions(await screen.findByLabelText('Provincia'), '1')
    await user.type(screen.getByRole('textbox', { name: /teléfono privado/i }), '60001234')
    await user.type(screen.getByLabelText('Clave temporal para entrega privada'), 'ClaveTemporalSegura123!')
    await user.click(screen.getByLabelText(/El productor autorizó este registro/))
    await user.click(screen.getByLabelText(/El productor confirmó los términos/))
    await user.click(screen.getByLabelText(/El productor confirmó haber leído/))
    await user.click(screen.getByRole('button', { name: 'Registrar productor' }))
    expect(await screen.findByRole('button', { name: 'Registrando productor…' })).toBeDisabled()
    expect(registrationRequests).toBe(1)
    firstFailure.release?.()
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio temporalmente no disponible. Intenta otra vez.')
    expect(screen.getByLabelText('Clave temporal para entrega privada')).toHaveValue('ClaveTemporalSegura123!')
    expect(screen.getByLabelText('Nombre del productor')).toHaveValue('Productora de prueba')
    await user.click(screen.getByRole('button', { name: 'Registrar productor' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/cuenta creada con registro asistido/i)
    expect(screen.getByLabelText('Clave temporal para entrega privada')).toHaveValue('')
    expect(screen.getByLabelText('Nombre del productor')).toHaveValue('')
    expect(screen.getByLabelText('Provincia')).toHaveValue('')
    expect(registrationRequests).toBe(2)
    expect(registrationBodies[0]).toMatchObject({ producer_authorized: true, terms_confirmed: true, privacy_confirmed: true, location_id: 1 })
    expect(registrationBodies[0].password).toBe('ClaveTemporalSegura123!')
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), 'http://localhost:8000').pathname.endsWith('/auth/login'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('shows the producer verification and review history in the protected admin detail route', async () => {
    const detail = { producer: { id: 5, public_name: 'Finca detalle', slug: 'finca-detalle', activity: 'Agricultura', description: 'Cultivo familiar.', profile_status: 'active', contact_level: 'contact_confirmed', phone_verified_at: '2026-10-18T12:00:00Z', registration_method: 'assisted', registered_by: 'Operadora', location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }, account: { name: 'Productora detalle', email: 'detalle@example.test', created_at: '2026-10-17T12:00:00Z' }, consents: [{ id: 2, consent_type: 'privacy', version: 'v1', accepted_at: '2026-10-17T12:00:00Z' }], verifications: [{ id: 3, channel: 'sms', status: 'verified', verified_at: '2026-10-18T12:00:00Z', expires_at: null, attempts_count: 1 }], product_status_counts: { pending: 1 }, products: [{ id: 8, title: 'Yuca fresca', status: 'pending', updated_at: '2026-10-18T12:00:00Z' }], product_history: [{ product_title: 'Yuca fresca', from_status: 'draft', to_status: 'pending', reason: 'Enviada a revisión.', actor: 'Productora detalle', created_at: '2026-10-18T12:00:00Z' }], audit: [{ action: 'producer.profile_updated', before_values: {}, after_values: { public_name: 'Finca detalle' }, reason: 'Actualizó el perfil.', actor: 'Productora detalle', created_at: '2026-10-18T12:00:00Z' }] }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      return Promise.resolve({ ok: true, json: async () => url.pathname.endsWith('/me') ? { data: { permissions: ['producers.assist'] } } : { data: { ...detail, producer: { ...detail.producer, verification_level: 'contact_confirmed' }, trust_reviews: [] } } })
    }))
    render(<MemoryRouter initialEntries={['/admin/productores/5']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Finca detalle' })).toBeInTheDocument()
    expect(screen.getAllByText('Contacto confirmado').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Yuca fresca')).toBeInTheDocument()
    expect(screen.getByText('Enviada a revisión.')).toBeInTheDocument()
    expect(screen.getByText('detalle@example.test')).toBeInTheDocument()
    expect(screen.queryByText('+50760007777')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('lets a producer assistant activate a pending profile from its detail page', async () => {
    const user = userEvent.setup()
    const detail = { producer: { id: 5, public_name: 'Finca pendiente', slug: 'finca-pendiente', activity: 'Agricultura', description: null, profile_status: 'pending', suspension_reason: null, contact_level: 'unverified', verification_level: 'unverified', phone_verified_at: null, registration_method: 'direct', registered_by: null, location: null }, account: { name: 'Productora pendiente', email: 'pendiente@example.test', created_at: '2026-10-17T12:00:00Z' }, consents: [], verifications: [], product_status_counts: {}, products: [], product_history: [], audit: [] }
    const statusRequests: RequestInit[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['producers.assist'] } }) })
      if (url.pathname.endsWith('/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/status')) { statusRequests.push(init ?? {}); return Promise.resolve({ ok: true, json: async () => ({ data: { profile_status: 'active', products_queued_for_review: 0 } }) }) }
      return Promise.resolve({ ok: true, json: async () => ({ data: { ...detail, trust_reviews: [] } }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/productores/5']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Finca pendiente' })).toBeInTheDocument()
    const reason = await screen.findByRole('textbox', { name: /motivo de activación/i })
    await user.type(reason, 'El perfil cumple los requisitos iniciales.')
    await user.click(screen.getByRole('button', { name: 'Activar perfil' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Perfil activado.')
    expect(statusRequests.some((init) => init.method === 'PUT' && JSON.parse(String(init.body)).profile_status === 'active' && JSON.parse(String(init.body)).reason === 'El perfil cumple los requisitos iniciales.')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('requires a reason and a suspension permission before changing producer status', async () => {
    const user = userEvent.setup()
    const detail = { producer: { id: 5, public_name: 'Finca detalle', slug: 'finca-detalle', activity: 'Agricultura', description: null, profile_status: 'active', suspension_reason: null, contact_level: 'contact_confirmed', phone_verified_at: null, registration_method: 'direct', registered_by: null, location: null }, account: { name: 'Productora detalle', email: 'detalle@example.test', created_at: '2026-10-17T12:00:00Z' }, consents: [], verifications: [], product_status_counts: {}, products: [], product_history: [], audit: [] }
    const statusRequests: RequestInit[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['producers.suspend'] } }) })
      if (url.pathname.endsWith('/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/status')) { statusRequests.push(init ?? {}); return Promise.resolve({ ok: true, json: async () => ({ data: { profile_status: 'suspended', products_queued_for_review: 0 } }) }) }
      return Promise.resolve({ ok: true, json: async () => ({ data: { ...detail, trust_reviews: [] } }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/productores/5']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Finca detalle' })).toBeInTheDocument()
    const reason = await screen.findByRole('textbox', { name: /motivo de suspensión/i })
    const suspend = screen.getByRole('button', { name: 'Suspender perfil' })
    await user.click(suspend)
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveFocus()
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), 'http://localhost:8000').pathname.endsWith('/status'))).toBe(false)
    await user.type(reason, 'Revisión manual pendiente.')
    await user.click(suspend)
    expect(await screen.findByRole('status')).toHaveTextContent(/perfil suspendido/i)
    expect(screen.getByText('suspended')).toBeInTheDocument()
    expect(screen.getAllByText('Revisión manual pendiente.').length).toBeGreaterThanOrEqual(1)
    expect(statusRequests.some((init) => init.method === 'PUT' && JSON.parse(String(init.body)).profile_status === 'suspended' && JSON.parse(String(init.body)).reason === 'Revisión manual pendiente.')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('reactivates a suspended producer and reports listings returned to human review', async () => {
    const user = userEvent.setup()
    const detail = { producer: { id: 5, public_name: 'Finca detalle', slug: 'finca-detalle', activity: 'Agricultura', description: null, profile_status: 'suspended', suspension_reason: 'Pendiente de revisión manual.', contact_level: 'contact_confirmed', phone_verified_at: null, registration_method: 'direct', registered_by: null, location: null }, account: { name: 'Productora detalle', email: 'detalle@example.test', created_at: '2026-10-17T12:00:00Z' }, consents: [], verifications: [], product_status_counts: {}, products: [], product_history: [], audit: [] }
    const statusRequests: RequestInit[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['producers.assist'] } }) })
      if (url.pathname.endsWith('/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/status')) { statusRequests.push(init ?? {}); return Promise.resolve({ ok: true, json: async () => ({ data: { profile_status: 'active', products_queued_for_review: 2 } }) }) }
      return Promise.resolve({ ok: true, json: async () => ({ data: { ...detail, trust_reviews: [] } }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/productores/5']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Finca detalle' })).toBeInTheDocument()
    expect(screen.getByText('Pendiente de revisión manual.')).toBeInTheDocument()
    const reason = await screen.findByRole('textbox', { name: /motivo de reactivación/i })
    await user.type(reason, 'Revisión final completada.')
    await user.click(screen.getByRole('button', { name: 'Reactivar perfil' }))
    expect(await screen.findByRole('status')).toHaveTextContent('2 publicaciones quedaron pendientes de revisión humana.')
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(statusRequests.some((init) => init.method === 'PUT' && JSON.parse(String(init.body)).profile_status === 'active' && JSON.parse(String(init.body)).reason === 'Revisión final completada.')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('lets a producer request and confirm a private phone code in the profile portal', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora', email: 'productora@example.test', profile: { public_name: 'Finca', slug: 'finca', activity: null, description: null, location_id: null, phone_private: '+50760001234', contact_level: 'unverified', profile_status: 'active', suspension_reason: null } } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/verify-phone/start')) return Promise.resolve({ ok: true, json: async () => ({ data: { id: 2, expires_at: '2026-10-19T12:10:00Z', development_code: '123456' } }) })
      if (url.pathname.endsWith('/verify-phone')) return Promise.resolve({ ok: true, json: async () => ({ data: { verified: true } }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/verificar']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Verifica tu contacto' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre público')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Solicitar código' }))
    expect(await screen.findByText('Código de desarrollo: 123456')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Código de seis dígitos' }), '123456')
    await user.click(screen.getByRole('button', { name: 'Confirmar teléfono' }))
    expect(await screen.findByText('Teléfono verificado. Ahora puede mostrarse en tu perfil público.')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
  it('lets a producer retry phone verification after a temporary request failure', async () => {
    const user = userEvent.setup()
    let startRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora', email: 'productora@example.test', profile: { public_name: 'Finca', slug: 'finca', activity: null, description: null, location_id: null, phone_private: '+50760001234', contact_level: 'unverified', profile_status: 'active', suspension_reason: null } } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/verify-phone/start')) {
        startRequests += 1
        return Promise.resolve(startRequests === 1
          ? { ok: false, json: async () => ({ message: 'Servicio temporalmente no disponible.' }) }
          : { ok: true, json: async () => ({ data: { id: 3, expires_at: '2026-10-19T12:10:00Z', development_code: '654321' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/verificar']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Verifica tu contacto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Solicitar código' }))
    expect(await screen.findByText('No pudimos iniciar la verificación del teléfono.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código de seis dígitos')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Solicitar código' }))
    expect(await screen.findByText('Código de desarrollo: 654321')).toBeInTheDocument()
    expect(screen.getByLabelText('Código de seis dígitos')).toBeInTheDocument()
    expect(startRequests).toBe(2)
    vi.unstubAllGlobals()
  })
  it('keeps the previous phone private after changing it in the producer portal', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora', email: 'productora@example.test', profile: { public_name: 'Finca', slug: 'finca', activity: null, description: null, location_id: null, phone_private: '+50760009999', contact_level: 'unverified', profile_status: 'active', suspension_reason: null } } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/me/profile') && init?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mi-perfil']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Mi perfil público' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/teléfono privado de contacto/i))
    await user.type(screen.getByLabelText(/teléfono privado de contacto/i), '+50760009999')
    await user.click(screen.getByRole('button', { name: 'Guardar perfil' }))
    expect(await screen.findByText(/Estado del contacto: sin verificar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solicitar código' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
  it('submits manual product data and compresses a selected photo for a private draft', async () => {
    const user = userEvent.setup()
    const file = new File([new Uint8Array(1024 * 1024)], 'yuca.jpg', { type: 'image/jpeg' })
    const bitmap = { width: 2400, height: 1200, close: vi.fn() }
    const compressedPhoto = new Blob([new Uint8Array(200 * 1024)], { type: 'image/webp' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(compressedPhoto))
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Raíces' }] })
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) { Object.defineProperty(document, 'cookie', { configurable: true, value: 'XSRF-TOKEN=test-token' }); return Promise.resolve({ ok: true, json: async () => ({}) }) }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000/api')
    render(<MemoryRouter initialEntries={['/mis-productos/nuevo']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Publica un producto' })).toBeInTheDocument()
    expect(screen.getByText(/borrador privado/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre del producto'), 'Yuca del patio')
    await user.selectOptions(await screen.findByLabelText('Categoría'), '1')
    await user.type(screen.getByLabelText('Descripción'), 'Yuca fresca cosechada esta semana en la finca familiar.')
    await user.type(screen.getByLabelText('Unidad de venta'), 'libra')
    await user.type(screen.getByLabelText('Entrega o recogida'), 'Recogida en Las Tablas')
    await user.upload(screen.getByLabelText(/Fotografías/), file)
    const form = screen.getByRole('button', { name: 'Guardar borrador' }).closest('form') as HTMLFormElement
    const body = new FormData(form)
    expect(body.getAll('images[]')).toHaveLength(1)
    expect(body.getAll('images[]')[0]).toBeInstanceOf(File)
    expect(body.get('title')).toBe('Yuca del patio')
    fireEvent.submit(form)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/me/products'), expect.objectContaining({ method: 'POST', body: expect.any(FormData) })))
    const upload = fetchMock.mock.calls.find(([input, init]) => new URL(String(input), 'http://localhost:8000').pathname.endsWith('/me/products') && init?.method === 'POST')
    if (!upload?.[1]) throw new Error('No se envió el formulario de producto.')
    expect((upload[1].body as FormData).get('images[]')).toMatchObject({ name: 'yuca.webp', type: 'image/webp' })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps manual product fields and selected photos after a failed draft save so the producer can retry', async () => {
    const user = userEvent.setup()
    const photo = new File([new Uint8Array(32 * 1024)], 'yuca.jpg', { type: 'image/jpeg' })
    let draftRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Raíces' }] })
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) { Object.defineProperty(document, 'cookie', { configurable: true, value: 'XSRF-TOKEN=test-token' }); return Promise.resolve({ ok: true, json: async () => ({}) }) }
      if (url.pathname.endsWith('/me/products')) {
        draftRequests += 1
        return Promise.resolve(draftRequests === 1
          ? { ok: false, json: async () => ({ message: 'No se pudo guardar el borrador.' }) }
          : { ok: true, json: async () => ({ data: {} }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000/api')
    render(<MemoryRouter initialEntries={['/mis-productos/nuevo']}><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Publica un producto' })
    await user.type(screen.getByLabelText('Nombre del producto'), 'Yuca del patio')
    await user.selectOptions(await screen.findByLabelText('Categoría'), '1')
    await user.type(screen.getByLabelText('Descripción'), 'Yuca fresca cosechada esta semana en la finca familiar.')
    await user.type(screen.getByLabelText('Unidad de venta'), 'libra')
    await user.type(screen.getByLabelText('Entrega o recogida'), 'Recogida en Las Tablas')
    const photoInput = screen.getByLabelText(/Fotografías/)
    await user.upload(photoInput, photo)
    const form = screen.getByRole('button', { name: 'Guardar borrador' }).closest('form') as HTMLFormElement

    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent(/tu información y las fotos siguen en este formulario/i)
    expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Yuca del patio')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Yuca fresca cosechada esta semana en la finca familiar.')
    expect(screen.getByLabelText(/Fotografías/)).toHaveProperty('files.0.name', 'yuca.jpg')

    fireEvent.submit(form)
    await waitFor(() => expect(draftRequests).toBe(2))
    expect(await screen.findByText('Guardamos tu borrador. Se publicará después de revisión humana.')).toBeInTheDocument()
    expect(draftRequests).toBe(2)
    expect(screen.getByLabelText('Nombre del producto')).toHaveValue('')
    expect(screen.getByLabelText(/Fotografías/)).toHaveProperty('files.length', 0)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  it('filters the administrative producer directory on the server and restores filters from the URL', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/admin/producers')) return Promise.resolve({ ok: true, json: async () => ({ data: [], current_page: Number(url.searchParams.get('page') ?? 1), last_page: 1, per_page: 20, total: 0 }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/productores?q=Finca&status=active']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Directorio de productores' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar productor' })).toHaveValue('Finca')
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado del perfil' })).toHaveValue('active')
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar productor' }))
    await user.type(screen.getByRole('searchbox', { name: 'Buscar productor' }), 'Huerto')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por estado del perfil' }), 'suspended')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => { const url = new URL(String(input), 'http://localhost:8000'); return url.pathname.endsWith('/admin/producers') && url.searchParams.get('q') === 'Huerto' && url.searchParams.get('status') === 'suspended' && url.searchParams.get('page') === '1' })).toBe(true))
    vi.unstubAllGlobals()
  })

  it('edits a category with an inline validated form and retains the name after a server error', async () => {
    const user = userEvent.setup()
    let categoryName = 'Raíces'
    let updateCount = 0
    const updateBodies: unknown[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/admin/categories/5')) {
        updateCount += 1
        updateBodies.push(JSON.parse(String(init?.body)))
        if (updateCount === 1) return Promise.resolve({ ok: false, json: async () => ({ errors: { name: ['El nombre ya existe.'] } }) })
        categoryName = String(JSON.parse(String(init?.body)).name)
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      if (url.pathname.endsWith('/admin/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 5, parent_id: null, name: categoryName, slug: 'raices', active: true, position: 0, products_count: 0 }] })
      if (url.pathname.endsWith('/admin/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/csrf-cookie')) return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Raíces de miel')
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/catalogos']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Categorías y ubicaciones' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const name = screen.getByRole('textbox', { name: 'Nombre de categoría' })
    const save = screen.getByRole('button', { name: 'Guardar nombre' })
    await user.clear(name)
    await user.click(save)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(updateCount).toBe(0)
    await user.type(name, 'Raíces de miel')
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('El nombre ya existe.')
    expect(name).toHaveValue('Raíces de miel')
    await user.click(save)
    expect(await screen.findAllByText(/Raíces de miel/)).toHaveLength(2)
    expect(prompt).not.toHaveBeenCalled()
    expect(updateBodies).toEqual([
      { name: 'Raíces de miel', parent_id: null, active: true, position: 0 },
      { name: 'Raíces de miel', parent_id: null, active: true, position: 0 },
    ])
    prompt.mockRestore()
    vi.unstubAllGlobals()
  })

  it('validates a role-change reason and retains the roles and reason after an API failure', async () => {
    const user = userEvent.setup()
    let updateCount = 0
    const bodies: unknown[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/admin/users/42/roles')) {
        updateCount += 1
        bodies.push(JSON.parse(String(init?.body)))
        return Promise.resolve(updateCount === 1
          ? { ok: false, json: async () => ({ message: 'No se pudieron guardar los roles. Intenta otra vez.' }) }
          : { ok: true, json: async () => ({ data: { roles: ['moderator', 'support_operator'] } }) })
      }
      if (url.pathname.endsWith('/admin/users')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 42, name: 'Operadora', email: 'operadora@example.test', created_at: '2026-10-01T00:00:00Z', roles: [{ id: 2, name: 'moderator', display_name: 'Moderador', permissions: [] }] }], current_page: 1, last_page: 1, per_page: 20, total: 1 }) })
      if (url.pathname.endsWith('/admin/roles')) return Promise.resolve({ ok: true, json: async () => [{ id: 2, name: 'moderator', display_name: 'Moderador', permissions: [] }, { id: 3, name: 'support_operator', display_name: 'Operador de apoyo', permissions: [] }] })
      if (url.pathname.endsWith('/csrf-cookie')) return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Reasignación aprobada por coordinación.')
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/usuarios']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Usuarios y permisos' })).toBeInTheDocument()
    await user.click(await screen.findByLabelText('Operador de apoyo'))
    const reason = screen.getByRole('textbox', { name: /motivo del cambio de permisos/i })
    const save = screen.getByRole('button', { name: 'Guardar roles' })
    await user.click(save)
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveFocus()
    expect(updateCount).toBe(0)
    await user.type(reason, 'Reasignación aprobada por coordinación.')
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron guardar los roles. Intenta otra vez.')
    expect(reason).toHaveValue('Reasignación aprobada por coordinación.')
    expect(screen.getByRole('checkbox', { name: 'Operador de apoyo' })).toBeChecked()
    await user.click(save)
    expect(await screen.findByText(/Roles actuales: Moderador, Operador de apoyo/)).toBeInTheDocument()
    expect(prompt).not.toHaveBeenCalled()
    expect(bodies).toEqual([
      { roles: ['moderator', 'support_operator'], reason: 'Reasignación aprobada por coordinación.' },
      { roles: ['moderator', 'support_operator'], reason: 'Reasignación aprobada por coordinación.' },
    ])
    prompt.mockRestore()
    vi.unstubAllGlobals()
  })

  it('validates the directory suspension reason and preserves it when the server asks for a retry', async () => {
    const user = userEvent.setup()
    const producer = { id: 31, public_name: 'Finca de prueba', slug: 'finca-prueba', activity: 'Cultivo', profile_status: 'active', contact_level: 'contact_confirmed', verification_level: 'contact_confirmed', products_count: 2, account: { name: 'Productora', email: 'productora@example.test' } }
    let statusRequests = 0
    let profileStatus = 'active'
    const statusErrorRelease: { release?: () => void } = {}
    const bodies: unknown[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['producers.suspend'] } }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.pathname.endsWith('/admin/producers/31/status')) {
        statusRequests += 1
        bodies.push(JSON.parse(String(init?.body)))
        if (statusRequests === 1) return new Promise((resolve) => { statusErrorRelease.release = () => resolve({ ok: false, json: async () => ({ message: 'No se pudo guardar la suspensión. Inténtalo de nuevo.' }) }) })
        return Promise.resolve({ ok: true, json: async () => { profileStatus = 'suspended'; return { data: { profile_status: 'suspended', products_queued_for_review: 0 } } } })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [{ ...producer, profile_status: profileStatus }], current_page: 1, last_page: 1, per_page: 20, total: 1 }) })
    })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Confirma el origen de las ofertas.')
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/productores']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Suspender' }))
    const dialog = screen.queryByRole('alertdialog')
    expect(prompt).not.toHaveBeenCalled()
    expect(dialog).toBeInTheDocument()
    const reason = screen.getByRole('textbox', { name: /motivo de suspensión/i })
    const confirm = screen.getByRole('button', { name: 'Suspender perfil' })
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    expect(reason).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(reason).toHaveFocus()
    await user.click(confirm)
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveFocus()
    expect(statusRequests).toBe(0)
    await user.type(reason, 'Confirma el origen de las ofertas.')
    await user.click(confirm)
    expect(await screen.findByRole('button', { name: 'Suspendiendo…' })).toBeDisabled()
    expect(dialog).toHaveFocus()
    statusErrorRelease.release?.()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la suspensión. Inténtalo de nuevo.')
    expect(reason).toHaveValue('Confirma el origen de las ofertas.')
    await user.click(confirm)
    expect(await screen.findByRole('status')).toHaveTextContent('Se suspendió el perfil de Finca de prueba. Sus ofertas dejaron de estar disponibles.')
    expect(await screen.findByText('suspended')).toBeInTheDocument()
    expect(statusRequests).toBe(2)
    expect(bodies).toEqual([
      { profile_status: 'suspended', reason: 'Confirma el origen de las ofertas.' },
      { profile_status: 'suspended', reason: 'Confirma el origen de las ofertas.' },
    ])
    prompt.mockRestore()
    vi.unstubAllGlobals()
  })

  it('lets a dedicated trust reviewer reach a producer ficha without account contact data', async () => {
    const reviewer = { id: 25, public_name: 'Finca revisión', slug: 'finca-revision', activity: 'Cultivo', profile_status: 'active', contact_level: 'contact_confirmed', verification_level: 'contact_confirmed', products_count: 2, account: null }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      const data = url.pathname.endsWith('/me') ? { data: { permissions: ['producers.verify'] } }
        : url.pathname.endsWith('/locations') ? { data: [] }
          : { data: [reviewer], current_page: 1, last_page: 1, per_page: 20, total: 1 }
      return Promise.resolve({ ok: true, json: async () => data })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/productores']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Finca revisión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/admin/productores/25')
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('renders published listings returned by the public API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates de temporada cultivados en Azuero.', unit: 'libra', price_type: 'fixed', price_amount: '1.25', currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas y verduras', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'unverified', location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }, images: [{ id: 1, url: 'https://api.example/images/tomate.webp', thumbnail_url: 'https://api.example/images/tomate.webp?variant=thumbnail', alt_text: 'Tomates de temporada' }] }], current_page: 1, last_page: 1, total: 1 }),
    }))
    render(<MemoryRouter initialEntries={['/productos']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Tomate local' })).toBeInTheDocument()
    expect(screen.getByText('Consulta disponibilidad')).toBeInTheDocument()
    expect(screen.getByText('1 oferta publicada')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Tomates de temporada' })).toHaveAttribute('loading', 'lazy')
    expect(screen.getByRole('img', { name: 'Tomates de temporada' })).toHaveAttribute('decoding', 'async')
    expect(screen.getByRole('img', { name: 'Tomates de temporada' })).toHaveAttribute('src', 'https://api.example/images/tomate.webp?variant=thumbnail')
    vi.unstubAllGlobals()
  })

  it('filters the public catalog with dependent geographic selectors and preserves query parameters', async () => {
    const user = userEvent.setup()
    const locations = [
      { id: 1, name: 'Los Santos', slug: 'los-santos', level: 'province', parent_id: null },
      { id: 2, name: 'Las Tablas', slug: 'las-tablas', level: 'district', parent_id: 1 },
      { id: 3, name: 'Santo Domingo', slug: 'santo-domingo', level: 'corregimiento', parent_id: 2 },
    ]
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      const data = url.includes('/locations') ? locations : url.includes('/categories') ? [] : []
      return Promise.resolve({ ok: true, json: async () => url.includes('/products') ? { data: [], current_page: 1, last_page: 1, per_page: 12, total: 0 } : data })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productos?q=tomate']}><App /></MemoryRouter>)
    const province = await screen.findByRole('combobox', { name: /filtrar por provincia/i })
    await user.selectOptions(province, 'los-santos')
    const district = await screen.findByRole('combobox', { name: /filtrar por distrito/i })
    await user.selectOptions(district, 'las-tablas')
    const corregimiento = await screen.findByRole('combobox', { name: /filtrar por corregimiento/i })
    await user.selectOptions(corregimiento, 'santo-domingo')
    expect(fetchMock.mock.calls.some(([input]) => {
      const url = new URL(String(input), 'http://localhost:8000')
      return url.pathname.endsWith('/products') && url.searchParams.get('q') === 'tomate' && url.searchParams.get('province') === 'los-santos' && url.searchParams.get('district') === 'las-tablas' && url.searchParams.get('corregimiento') === 'santo-domingo'
    })).toBe(true)
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/search-events') && init?.method === 'POST')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('clears district and corregimiento filters when the province changes', async () => {
    const user = userEvent.setup()
    const locations = [
      { id: 1, name: 'Los Santos', slug: 'los-santos', level: 'province', parent_id: null },
      { id: 2, name: 'Las Tablas', slug: 'las-tablas', level: 'district', parent_id: 1 },
      { id: 3, name: 'Santo Domingo', slug: 'santo-domingo', level: 'corregimiento', parent_id: 2 },
      { id: 4, name: 'Herrera', slug: 'herrera', level: 'province', parent_id: null },
      { id: 5, name: 'Las Minas', slug: 'las-minas', level: 'district', parent_id: 4 },
    ]
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => locations })
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/search-events')) return Promise.resolve({ ok: true, json: async () => ({ data: { recorded: true } }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: [], current_page: 1, last_page: 1, per_page: 12, total: 0 }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productos?province=los-santos&district=las-tablas&corregimiento=santo-domingo']}><App /></MemoryRouter>)
    const province = await screen.findByRole('combobox', { name: /filtrar por provincia/i })
    expect(province).toHaveValue('los-santos')
    expect(await screen.findByRole('combobox', { name: /filtrar por distrito/i })).toHaveValue('las-tablas')
    expect(await screen.findByRole('combobox', { name: /filtrar por corregimiento/i })).toHaveValue('santo-domingo')

    await user.selectOptions(province, 'herrera')

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), 'http://localhost:8000')
        return url.pathname.endsWith('/products') && url.searchParams.get('province') === 'herrera' && !url.searchParams.has('district') && !url.searchParams.has('corregimiento')
      })).toBe(true)
    })
    expect(screen.getByRole('combobox', { name: /filtrar por distrito/i })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: /filtrar por corregimiento/i })).toHaveValue('')
    vi.unstubAllGlobals()
  })

  it('keeps the catalog sort in the URL-backed request and resets pagination when it changes', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [], current_page: 2, last_page: 2, per_page: 12, total: 15 }) })
      if (url.pathname.endsWith('/categories') || url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productos?q=tomate&category=del-campo&page=2']}><App /></MemoryRouter>)

    const sort = await screen.findByRole('combobox', { name: /ordenar por/i })
    expect(sort).toHaveValue('relevance')
    await user.selectOptions(sort, 'newest')

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), 'http://localhost:8000')
        return url.pathname.endsWith('/products') && url.searchParams.get('q') === 'tomate' && url.searchParams.get('category') === 'del-campo' && url.searchParams.get('sort') === 'newest' && !url.searchParams.has('page')
      })).toBe(true)
    })
    vi.unstubAllGlobals()
  })

  it('renders public producers from the filtered directory response without showing phone data', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/producers')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 8, slug: 'manos-de-azuero', public_name: 'Manos de Azuero', activity: 'Agricultura familiar', description: 'Cultivamos alimentos frescos en Azuero.', contact_level: 'contact_confirmed', products_count: 2, location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }], current_page: 1, last_page: 1, per_page: 12, total: 1 }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Los Santos', slug: 'los-santos', level: 'province', parent_id: null }, { id: 2, name: 'Las Tablas', slug: 'las-tablas', level: 'district', parent_id: 1 }] })
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Del campo', slug: 'del-campo' }] })
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productores?q=Manos&province=los-santos']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Productores locales de Azuero' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /manos de azuero/i })).toHaveAttribute('href', '/productores/manos-de-azuero')
    expect(screen.getByText('Agricultura familiar')).toBeInTheDocument()
    expect(screen.getByText('Las Tablas · Los Santos')).toBeInTheDocument()
    expect(screen.getByText('2 ofertas disponibles')).toBeInTheDocument()
    expect(screen.queryByText('+50761112222')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => { const url = new URL(String(input), 'http://localhost:8000'); return url.pathname.endsWith('/producers') && url.searchParams.get('q') === 'Manos' && url.searchParams.get('province') === 'los-santos' })).toBe(true)
    vi.unstubAllGlobals()
  })

  it('updates directory filters with dependent geographic options', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/producers')) return Promise.resolve({ ok: true, json: async () => ({ data: [], current_page: 1, last_page: 1, per_page: 12, total: 0 }) })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Los Santos', slug: 'los-santos', level: 'province', parent_id: null }, { id: 2, name: 'Las Tablas', slug: 'las-tablas', level: 'district', parent_id: 1 }, { id: 3, name: 'Santo Domingo', slug: 'santo-domingo', level: 'corregimiento', parent_id: 2 }] })
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Del campo', slug: 'del-campo' }] })
      return Promise.resolve({ ok: true, json: async () => [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productores']}><App /></MemoryRouter>)
    const province = await screen.findByRole('combobox', { name: 'Filtrar por provincia' })
    const district = screen.getByRole('combobox', { name: 'Filtrar por distrito' })
    expect(district).toBeDisabled()
    await user.selectOptions(province, 'los-santos')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por distrito' }), 'las-tablas')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por corregimiento' }), 'santo-domingo')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por producto' }), 'del-campo')
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const url = new URL(String(input), 'http://localhost:8000')
      return url.pathname.endsWith('/producers') && url.searchParams.get('province') === 'los-santos' && url.searchParams.get('district') === 'las-tablas' && url.searchParams.get('corregimiento') === 'santo-domingo' && url.searchParams.get('category') === 'del-campo'
    })).toBe(true))
    expect(await screen.findByText('No encontramos productores con esos filtros')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('offers retry when the producer directory API is unavailable', async () => {
    const user = userEvent.setup()
    let producerRequests = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/producers')) {
        producerRequests += 1
        return Promise.resolve(producerRequests === 1 ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ data: [], current_page: 1, last_page: 1, per_page: 12, total: 0 }) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    }))
    render(<MemoryRouter initialEntries={['/productores']}><App /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el directorio')
    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('No encontramos productores con esos filtros')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('introduces the local market and takes buyers to the product catalog', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /el mercado de nuestra tierra/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explorar productos/i })).toHaveAttribute(
      'href',
      '/productos',
    )
  })

  it('carries the buyer search phrase into the public catalog route', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    await user.type(screen.getByRole('searchbox', { name: /buscar productos/i }), 'huevos')

    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/productos?q=huevos')
  })

  it('renders the public catalog route and restores its search query from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/productos?q=yuca']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /productos locales de azuero/i })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /buscar productos/i })).toHaveValue('yuca')
  })

  it('updates share metadata for a public product detail', async () => {
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates de temporada cultivados en Azuero.', unit: 'libra', price_type: 'fixed', price_amount: '1.25', currency: 'USD', stock_quantity: '8.5', status: 'published', category: { name: 'Frutas y verduras', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'unverified', phone_public: null, location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }, images: [{ id: 3, alt_text: 'Tomates', url: 'https://api.example/images/tomates.jpg', thumbnail_url: 'https://api.example/images/tomates.jpg?variant=thumbnail' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: product }) }))
    const view = render(<MemoryRouter initialEntries={['/productos/tomate-local']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Tomate local' })).toBeInTheDocument()
    expect(screen.getByText('US$ 1.25')).toBeInTheDocument()
    expect(screen.getByText(/Stock indicado:/)).toHaveTextContent(/8\.5 libra|8,5 libra/)
    expect(screen.getByRole('img', { name: 'Tomates' })).toHaveAttribute('fetchpriority', 'high')
    expect(screen.getByRole('img', { name: 'Tomates' })).toHaveAttribute('src', 'https://api.example/images/tomates.jpg')
    expect(screen.getByRole('img', { name: 'Tomates' })).toHaveAttribute('decoding', 'async')
    await waitFor(() => expect(document.title).toBe('Tomate local · Mercado Solidario'))
    expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute('content', 'https://api.example/images/tomates.jpg')
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'http://localhost:3000/productos/tomate-local')
    view.unmount()
    await waitFor(() => expect(document.title).toBe('Mercado Solidario · Azuero produce, Panamá conecta'))
    expect(document.head.querySelector('meta[property="og:image"]')).not.toBeInTheDocument()
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'http://localhost:3000/')
    vi.unstubAllGlobals()
  })

  it('uses compact images for the gallery previews while keeping the selected photo full size', async () => {
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates de temporada cultivados en Azuero.', unit: 'libra', price_type: 'contact', price_amount: null, currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'contact_confirmed', phone_public: '+50760001111', location: null }, images: [
      { id: 3, alt_text: 'Tomates maduros', url: 'https://api.example/images/tomates-full.webp', thumbnail_url: 'https://api.example/images/tomates-full.webp?variant=thumbnail' },
      { id: 4, alt_text: 'Tomates en la planta', url: 'https://api.example/images/tomates-planta-full.webp', thumbnail_url: 'https://api.example/images/tomates-planta-full.webp?variant=thumbnail' },
    ] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: product }) }))
    const { container } = render(<MemoryRouter initialEntries={['/productos/tomate-local']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Tomate local' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Tomates maduros' })).toHaveAttribute('src', 'https://api.example/images/tomates-full.webp')
    expect(container.querySelector('.product-gallery__thumbnails img')).toHaveAttribute('src', 'https://api.example/images/tomates-full.webp?variant=thumbnail')
    vi.unstubAllGlobals()
  })

  it('shows a safety confirmation before opening WhatsApp and records contact intent without claiming a sale', async () => {
    const user = userEvent.setup()
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates de temporada cultivados en Azuero.', unit: 'libra', price_type: 'fixed', price_amount: '1.25', currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas y verduras', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'contact_confirmed', phone_public: '+507 6000-1111', location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }, images: [] }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: product }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productos/tomate-local']}><App /></MemoryRouter>)
    const contactLink = await screen.findByRole('link', { name: 'Consultar por WhatsApp' })
    expect(contactLink).toHaveAttribute('href', expect.stringContaining('wa.me/50760001111'))
    const destination = new URL(contactLink.getAttribute('href')!)
    expect(destination.searchParams.get('text')).toContain('Tomate local')
    expect(destination.searchParams.get('text')).toContain('Mercado Solidario')
    await user.click(contactLink)
    expect(await screen.findByRole('dialog', { name: /antes de continuar a whatsapp/i })).toBeInTheDocument()
    const editableMessage = screen.getByRole('textbox', { name: /mensaje para el productor/i })
    await user.clear(editableMessage)
    await user.type(editableMessage, 'Hola, ¿todavía tienes tomate?')
    expect(screen.getByRole('link', { name: /continuar a whatsapp/i })).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('Hola, ¿todavía tienes tomate?')))
    expect(screen.getByText(/confirma disponibilidad, precio y entrega/i)).toBeInTheDocument()
    expect(screen.getByText(/no envíes dinero por adelantado sin verificar/i)).toBeInTheDocument()
    expect(screen.getByText(/antes de abrir un enlace de pago, confirma la solicitud por un canal independiente/i)).toBeInTheDocument()
    expect(screen.getByText(/confirma el pago directamente en tu cuenta/i)).toBeInTheDocument()
    expect(screen.getByText(/registraremos este clic como intención de contacto, no como una venta/i)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /continuar a whatsapp/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/contact-events') && init?.method === 'POST' && JSON.parse(String(init.body)).channel === 'whatsapp')).toBe(true))
    vi.unstubAllGlobals()
  })

  it('uses administratively configured contact templates and substitutes product data', async () => {
    clearContactMessageTemplatesCache()
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates locales.', unit: 'libra', price_type: 'fixed', price_amount: '1.25', currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas y verduras', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'contact_confirmed', phone_public: '+50760001111', location: null }, images: [] }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/message-templates') ? { data: { product: 'Buen día, quisiera consultar {product_title} con {producer_name}.', producer: 'Hola {producer_name}' } } : { data: product }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/productos/tomate-local']}><App /></MemoryRouter>)
    const opener = await screen.findByRole('link', { name: 'Consultar por WhatsApp' })
    await waitFor(() => expect(new URL(opener.getAttribute('href')!).searchParams.get('text')).toBe('Buen día, quisiera consultar Tomate local con Huerto local.'))
    vi.unstubAllGlobals()
  })

  it('lets an administrator save a changed WhatsApp template', async () => {
    const user = userEvent.setup()
    const history: Array<{ version: number; body: string; updated_at: string; updated_by: string | null }> = []
    const body = 'Hola, me interesa el tomate fresco. ¿Está disponible?'
    const template = { key: 'product', label: 'producto', body, version: 2, updated_at: '2026-10-19T10:00:00Z', updated_by: { id: 1, name: 'Admin' }, history }
    const initial = { ...template, body: 'Hola, quisiera saber sobre {product_title}.', version: 1, updated_at: null, updated_by: null }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true } as Response)
      if (url.endsWith('/admin/message-templates/product') && init?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({ data: template }) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({ data: [initial, { ...initial, key: 'producer', label: 'productor', body: 'Hola productor, quisiera conocer tus ofertas.' }] }) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/mensajes']}><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Contacto de producto' })
    const field = document.getElementById('message-template-product') as HTMLTextAreaElement
    expect(field).toHaveValue(initial.body)
    await user.clear(field)
    await user.type(field, body)
    await user.click(field.closest('article')!.querySelector('button[type="submit"]')!)
    expect(await screen.findByText(/guardamos la plantilla de producto/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([request, options]) => String(request).endsWith('/admin/message-templates/product') && options?.method === 'PUT' && JSON.parse(String(options.body)).body === body)).toBe(true)
    expect(screen.getByText(/versión 2/i)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('keeps keyboard focus inside the contact confirmation and restores it when dismissed', async () => {
    const user = userEvent.setup()
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates de temporada cultivados en Azuero.', unit: 'libra', price_type: 'fixed', price_amount: '1.25', currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas y verduras', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'contact_confirmed', phone_public: '+50760001111', location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }, images: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: product }) }))
    render(<MemoryRouter initialEntries={['/productos/tomate-local']}><App /></MemoryRouter>)
    const opener = await screen.findByRole('link', { name: 'Consultar por WhatsApp' })
    opener.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: /antes de continuar a whatsapp/i })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    const backButton = screen.getByRole('button', { name: 'Volver' })
    const messageField = screen.getByRole('textbox', { name: /mensaje para el productor/i })
    const continueLink = screen.getByRole('link', { name: /continuar a whatsapp/i })
    expect(backButton).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(messageField).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(continueLink).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(messageField).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(backButton).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(continueLink).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    vi.unstubAllGlobals()
  })

  it('shows the safety warning before opening the phone dialer', async () => {
    const user = userEvent.setup()
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates frescos.', unit: 'libra', price_type: 'contact', price_amount: null, currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'contact_confirmed', phone_public: '+50760001111', location: null }, images: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: product }) }))
    render(<MemoryRouter initialEntries={['/productos/tomate-local']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('link', { name: 'Llamar por teléfono' }))
    const dialog = await screen.findByRole('dialog', { name: /antes de iniciar la llamada/i })
    expect(dialog).toHaveTextContent(/no envíes dinero por adelantado/i)
    expect(dialog).toHaveTextContent(/antes de abrir un enlace de pago, confirma la solicitud por un canal independiente/i)
    expect(dialog).toHaveTextContent(/no confíes solo en capturas o comprobantes/i)
    expect(screen.getByRole('link', { name: /iniciar llamada/i })).toHaveAttribute('href', 'tel:+50760001111')
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows requested moderation changes and the reason on the producer product page', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/me')
        ? { data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }
        : { data: [{ id: 17, title: 'Yuca por libra', slug: 'yuca-por-libra', status: 'changes_requested', latest_moderation_decision: { from_status: 'pending', to_status: 'changes_requested', reason: 'Agrega el peso aproximado por unidad antes de publicar.', created_at: '2026-10-18T12:00:00Z' } }] }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    expect(await screen.findByText('Cambios solicitados:')).toBeInTheDocument()
    expect(screen.getByText('Agrega el peso aproximado por unidad antes de publicar.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /corregir publicación/i })).toHaveAttribute('href', '/mis-productos/17/editar')
    vi.unstubAllGlobals()
  })

  it('lets the producer correct and resubmit a rejected product', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/me')
        ? { data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }
        : { data: [{ id: 18, title: 'Yuca con origen pendiente', slug: 'yuca-origen-pendiente', status: 'rejected', latest_moderation_decision: { from_status: 'pending', to_status: 'rejected', reason: 'Aclara el origen y la unidad de venta del producto.', created_at: '2026-10-18T12:00:00Z' } }] }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    expect(await screen.findByText('Motivo del rechazo:')).toBeInTheDocument()
    expect(screen.getByText('Aclara el origen y la unidad de venta del producto.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /corregir publicación/i })).toHaveAttribute('href', '/mis-productos/18/editar')
    await user.click(screen.getByRole('button', { name: /reenviar a revisión/i }))
    const reasonField = screen.getByRole('textbox', { name: /explicación para el equipo revisor/i })
    expect(reasonField).toBeRequired()
    expect(reasonField).toHaveAttribute('minlength', '5')
    vi.unstubAllGlobals()
  })

  it('keeps the producer product list available after a failed review submission so it can be retried', async () => {
    const user = userEvent.setup()
    let submissionRequests = 0
    const submittedReasons: string[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 25, title: 'Miel de la finca', slug: 'miel-de-la-finca', status: 'draft', latest_moderation_decision: null }] }) })
      if (url.pathname.endsWith('/me/products/25/submit')) {
        submissionRequests += 1
        submittedReasons.push(JSON.parse(String(init?.body)).reason)
        return Promise.resolve(submissionRequests === 1 ? { ok: false, json: async () => ({ message: 'El servicio de moderación no respondió.' }) } : { ok: true, json: async () => ({ data: { status: 'pending' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Mis productos' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enviar a revisión' }))
    const reasonField = screen.getByRole('textbox', { name: /explicación para el equipo revisor/i })
    expect(reasonField).toHaveFocus()
    expect(reasonField).toBeRequired()
    expect(reasonField).toHaveAttribute('minlength', '5')
    await user.click(screen.getByRole('button', { name: 'Confirmar envío a revisión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 5 caracteres/i)
    expect(reasonField).toHaveFocus()
    expect(submissionRequests).toBe(0)
    await user.type(reasonField, 'Es una cosecha nueva y confirmé disponibilidad con el equipo.')
    await user.click(screen.getByRole('button', { name: 'Confirmar envío a revisión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio de moderación no respondió.')
    expect(screen.getByText('Miel de la finca')).toBeInTheDocument()
    expect(reasonField).toHaveValue('Es una cosecha nueva y confirmé disponibilidad con el equipo.')
    await user.click(screen.getByRole('button', { name: 'Confirmar envío a revisión' }))
    await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument())
    expect(submissionRequests).toBe(2)
    expect(submittedReasons).toEqual(['Es una cosecha nueva y confirmé disponibilidad con el equipo.', 'Es una cosecha nueva y confirmé disponibilidad con el equipo.'])
    vi.unstubAllGlobals()
  })

  it('lets a producer renew a published offer whose configured listing period ended', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }) })
      if (url.pathname.endsWith('/me/products/51/renew') && init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ data: { id: 51, status: 'published', listing_expired: false, listing_expires_at: '2026-12-31T00:00:00Z' } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 51, title: 'Miel de la finca', slug: 'miel-de-la-finca', status: 'published', listing_expired: true, listing_expires_at: '2026-10-17T00:00:00Z', latest_moderation_decision: null }] }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    expect(await screen.findByText('Oferta vencida')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Renovar oferta' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/me/products/51/renew'), expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.queryByText('Oferta vencida')).not.toBeInTheDocument())
    vi.unstubAllGlobals()
  })

  it('offers editing a live listing and explains that saving sends it to human review', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 64, title: 'Huevos de patio', slug: 'huevos-de-patio', status: 'published', listing_expired: false, listing_expires_at: null, latest_moderation_decision: null }] }) })
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Huevos', slug: 'huevos' }] })
      if (url.pathname.endsWith('/me/products/64')) return Promise.resolve({ ok: true, json: async () => ({ data: { id: 64, title: 'Huevos de patio', description: 'Huevos frescos de gallinas criadas en la finca.', unit: 'docena', price_type: 'contact', price_amount: null, currency: 'PAB', stock_quantity: null, delivery_method: 'Retiro coordinado', category_id: 1, status: 'published', images: [{ id: 3, url: '/photo.jpg', alt_text: 'Huevos', position: 0 }] } }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    }))
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('link', { name: 'Editar oferta' }))
    expect(await screen.findByRole('heading', { name: 'Edita tu producto' })).toBeInTheDocument()
    expect(screen.getByText(/dejará de aparecer temporalmente/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /motivo del cambio/i })).toBeRequired()
    vi.unstubAllGlobals()
  })

  it('blocks duplicate lifecycle requests and announces the server-confirmed state change', async () => {
    const user = userEvent.setup()
    let finishTransition: ((response: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void) | undefined
    let transitionRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }) })
      if (url.pathname.endsWith('/me/products/61/transition')) {
        transitionRequests += 1
        return new Promise((resolve) => { finishTransition = resolve })
      }
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 61, title: 'Miel de la finca', slug: 'miel-de-la-finca', status: 'published', listing_expired: false, listing_expires_at: '2026-12-31T00:00:00Z', latest_moderation_decision: null }] }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Pausar' }))
    const busyButton = screen.getByRole('button', { name: 'Pausando…' })
    expect(busyButton).toBeDisabled()
    expect(busyButton).toHaveAttribute('aria-busy', 'true')
    expect(transitionRequests).toBe(1)
    finishTransition?.({ ok: true, json: async () => ({ data: {} }) })
    expect(await screen.findByRole('status')).toHaveTextContent('Publicación pausada.')
    expect(screen.getByText('paused')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('keeps a failed lifecycle transition retryable without changing the displayed status', async () => {
    const user = userEvent.setup()
    let transitionRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }) })
      if (url.pathname.endsWith('/me/products/62/transition')) {
        transitionRequests += 1
        return Promise.resolve(transitionRequests === 1 ? { ok: false, json: async () => ({ message: 'La publicación cambió en otra sesión.' }) } : { ok: true, json: async () => ({ data: {} }) })
      }
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 62, title: 'Huevos de patio', slug: 'huevos-de-patio', status: 'published', listing_expired: false, listing_expires_at: null, latest_moderation_decision: null }] }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Pausar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La publicación cambió en otra sesión.')
    expect(screen.getByText('published')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Publicación pausada.')
    expect(screen.getByText('paused')).toBeInTheDocument()
    expect(transitionRequests).toBe(2)
    vi.unstubAllGlobals()
  })

  it('requires an accessible in-app confirmation before withdrawing a product', async () => {
    const user = userEvent.setup()
    let finishWithdrawal: ((response: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void) | undefined
    let transitionRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: null } }) })
      if (url.pathname.endsWith('/me/products/63/transition')) {
        transitionRequests += 1
        return new Promise((resolve) => { finishWithdrawal = resolve })
      }
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 63, title: 'Yuca en saco', slug: 'yuca-en-saco', status: 'draft', listing_expired: false, listing_expires_at: null, latest_moderation_decision: null }] }) })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mis-productos']}><App /></MemoryRouter>)
    const withdrawButton = await screen.findByRole('button', { name: 'Retirar' })
    await user.click(withdrawButton)
    expect(screen.getByRole('alertdialog', { name: 'Retirar publicación' })).toHaveAccessibleDescription(/Yuca en saco/)
    expect(transitionRequests).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(withdrawButton)

    await user.click(withdrawButton)
    await user.click(screen.getByRole('button', { name: 'Confirmar retiro' }))
    expect(transitionRequests).toBe(1)
    expect(screen.getByRole('alertdialog', { name: 'Retirar publicación' })).toHaveAccessibleDescription(/Yuca en saco/)
    finishWithdrawal?.({ ok: true, json: async () => ({ data: {} }) })
    expect(await screen.findByRole('status')).toHaveTextContent('Publicación retirada.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('withdrawn')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('uses the shared accessible confirmation to withdraw from the producer dashboard', async () => {
    const user = userEvent.setup()
    let transitionRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: { public_name: 'Finca', slug: 'finca', activity: 'Cultivo', description: null, location_id: null, phone_private: '+50760000000', contact_level: 'unverified', profile_status: 'active', suspension_reason: null } } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 64, title: 'Yuca del panel', slug: 'yuca-del-panel', status: 'draft', listing_expired: false, listing_expires_at: null, latest_moderation_decision: null }] }) })
      if (url.pathname.endsWith('/me/metrics')) return Promise.resolve({ ok: true, json: async () => ({ data: { products: {}, contact_intentions_30d: 0, period_days: 30 } }) })
      if (url.pathname.endsWith('/me/appeals')) return Promise.resolve({ ok: true, json: async () => ({ data: { profile_status: 'active', suspension_reason: null, appeals: [] } }) })
      if (url.pathname.endsWith('/me/products/64/transition')) { transitionRequests++; return Promise.resolve({ ok: true, json: async () => ({ data: {} }) }) }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mi-panel']}><App /></MemoryRouter>)
    const withdrawButton = await screen.findByRole('button', { name: 'Retirar' })
    await user.click(withdrawButton)
    expect(screen.getByRole('alertdialog', { name: 'Retirar publicación' })).toHaveAccessibleDescription(/Yuca del panel/)
    expect(transitionRequests).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(document.activeElement).toBe(withdrawButton)
    await user.click(withdrawButton)
    await user.click(screen.getByRole('button', { name: 'Confirmar retiro' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Publicación retirada.')
    expect(transitionRequests).toBe(1)
    vi.unstubAllGlobals()
  })

  it('shows a reason and human-review form to a suspended producer', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/me')
        ? { data: { name: 'Productora de prueba', email: 'productora@example.test', profile: { public_name: 'Finca de prueba', slug: 'finca-prueba', activity: 'Cultivo', description: null, location_id: null, phone_private: '+50760000000', contact_level: 'unverified', profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.' } } }
        : url.endsWith('/me/appeals')
          ? { data: { profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.', appeals: [] } }
          : { data: [] }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/mi-panel']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Tu perfil está suspendido' })).toBeInTheDocument()
    expect(screen.getByText('Debemos confirmar el origen de tus publicaciones.')).toBeInTheDocument()
    expect(await screen.findByLabelText(/explica por qué solicitas la revisión/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /solicitar revisión/i })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('keeps a short appeal local, explains the correction, and focuses the field', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/me')
        ? { data: { name: 'Productora de prueba', email: 'productora@example.test', profile: { public_name: 'Finca de prueba', slug: 'finca-prueba', activity: 'Cultivo', description: null, location_id: null, phone_private: '+50760000000', contact_level: 'unverified', profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.' } } }
        : url.endsWith('/me/appeals')
          ? { data: { profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.', appeals: [] } }
          : { data: [] }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/mi-panel']}><App /></MemoryRouter>)
    const reason = await screen.findByLabelText(/explica por qué solicitas la revisión/i)
    await user.click(screen.getByRole('button', { name: 'Solicitar revisión' }))
    expect(await screen.findByText('Explica tu solicitud con al menos 20 caracteres.')).toBeInTheDocument()
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(reason)
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/me/appeals'), expect.objectContaining({ method: 'POST' }))
    vi.unstubAllGlobals()
  })

  it('keeps the producer appeal form hidden after history fails and restores the pending status on retry', async () => {
    const user = userEvent.setup()
    let appealRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: { public_name: 'Finca de prueba', slug: 'finca-prueba', activity: 'Cultivo', description: null, location_id: null, phone_private: '+50760000000', contact_level: 'unverified', profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.' } } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.pathname.endsWith('/me/metrics')) return Promise.resolve({ ok: true, json: async () => ({ data: { products: {}, contact_intentions_30d: 0, period_days: 30 } }) })
      if (url.pathname.endsWith('/me/appeals')) {
        appealRequests += 1
        if (appealRequests === 1) return Promise.resolve({ ok: false, json: async () => ({ message: 'Servicio no disponible.' }) })
        return Promise.resolve({ ok: true, json: async () => ({ data: { profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.', appeals: [{ id: 31, reason: 'Solicito revisar la suspensión con evidencia actualizada.', status: 'pending', resolution_note: null, submitted_at: '2026-10-19T12:00:00Z', reviewed_at: null }] } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mi-panel']}><App /></MemoryRouter>)
    expect(await screen.findByText('No pudimos cargar tu historial de revisión.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/explica por qué solicitas la revisión/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText(/tu solicitud está en revisión desde/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/explica por qué solicitas la revisión/i)).not.toBeInTheDocument()
    expect(appealRequests).toBe(2)
    vi.unstubAllGlobals()
  })

  it('does not briefly show a second appeal form while the producer history is loading', async () => {
    let resolveAppeals!: (response: { ok: boolean; json: () => Promise<unknown> }) => void
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { name: 'Productora de prueba', email: 'productora@example.test', profile: { public_name: 'Finca de prueba', slug: 'finca-prueba', activity: 'Cultivo', description: null, location_id: null, phone_private: '+50760000000', contact_level: 'unverified', profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.' } } }) })
      if (url.pathname.endsWith('/me/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.pathname.endsWith('/me/metrics')) return Promise.resolve({ ok: true, json: async () => ({ data: { products: {}, contact_intentions_30d: 0, period_days: 30 } }) })
      if (url.pathname.endsWith('/me/appeals')) return new Promise((resolve) => { resolveAppeals = resolve })
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/mi-panel']}><App /></MemoryRouter>)
    expect(await screen.findByText('Consultando si tienes una solicitud en revisión…')).toBeInTheDocument()
    expect(screen.queryByLabelText(/explica por qué solicitas la revisión/i)).not.toBeInTheDocument()
    resolveAppeals({ ok: true, json: async () => ({ data: { profile_status: 'suspended', suspension_reason: 'Debemos confirmar el origen de tus publicaciones.', appeals: [{ id: 31, reason: 'Solicito revisar la suspensión con evidencia actualizada.', status: 'pending', resolution_note: null, submitted_at: '2026-10-19T12:00:00Z', reviewed_at: null }] } }) })
    expect(await screen.findByText(/tu solicitud está en revisión desde/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/explica por qué solicitas la revisión/i)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('gives authorized staff an appeal queue with the suspension reason and resolution choices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 22, reason: 'Presento documentos que aclaran el origen de mis productos.', status: 'pending', submitted_at: '2026-10-19T12:00:00Z', producer: { id: 7, public_name: 'Finca del valle', slug: 'finca-del-valle', profile_status: 'suspended', suspension_reason: 'Confirma el origen de los productos.' }, submitter: { id: 9, name: 'Productor del valle' } }] }),
    }))
    render(<MemoryRouter initialEntries={['/admin/apelaciones']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Apelaciones de productores' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Finca del valle' })).toBeInTheDocument()
    expect(screen.getByText('Confirma el origen de los productos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /aceptar y restablecer perfil/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mantener suspensión/i })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('lets staff retry loading the appeals queue after a request fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Servicio no disponible.' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 22, reason: 'Presento documentos para revisión manual.', status: 'pending', submitted_at: '2026-10-19T12:00:00Z', producer: { id: 7, public_name: 'Finca del valle', slug: 'finca-del-valle', profile_status: 'suspended', suspension_reason: 'Confirma el origen de los productos.' }, submitter: { id: 9, name: 'Productor del valle' } }] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/apelaciones']}><App /></MemoryRouter>)
    expect(await screen.findByText(/no pudimos cargar las apelaciones/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByRole('heading', { name: 'Finca del valle' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it('shows deterministic risk alerts and states they need human review', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      const data = url.pathname.endsWith('/me')
        ? { data: { permissions: ['security.alerts.manage'] } }
        : paginated([{ id: 4, signal_type: 'repeated_reports', resource_type: 'product', resource_id: 19, severity: 'warning', explanation: 'Tres o más reportes recibidos para el mismo recurso en 24 horas. Requiere revisión humana; no determina fraude.', evidence: { report_count_24h: 3, window_hours: 24, rule: 'same_resource_report_threshold' }, status: 'open', assignee_id: null, assignee: null, first_seen_at: '2026-10-19T12:00:00Z', last_seen_at: '2026-10-19T12:00:00Z' }])
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/admin/alertas']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Alertas de seguridad' })).toBeInTheDocument()
    expect(screen.getByText(/una señal no confirma fraude ni puede suspender una cuenta por sí sola/i)).toBeInTheDocument()
    expect(screen.getByText('Reportes recibidos en 24 horas:')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    const note = screen.getByLabelText('Nota de revisión')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tomar y revisar' }))
    expect(await screen.findByText('Escribe una nota de al menos diez caracteres.')).toBeInTheDocument()
    expect(document.activeElement).toBe(note)
    vi.unstubAllGlobals()
  })

  it('loads the next page of security alerts from the queue controls', async () => {
    const user = userEvent.setup()
    const alert = (id: number) => ({ id, signal_type: 'repeated_reports', resource_type: 'product', resource_id: id, severity: 'warning', explanation: 'Señal de prueba para la cola.', evidence: { report_count_24h: 3 }, status: 'open', assignee_id: null, assignee: null, first_seen_at: '2026-10-19T12:00:00Z', last_seen_at: '2026-10-19T12:00:00Z' })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      const data = url.pathname.endsWith('/me')
        ? { data: { permissions: [] } }
        : url.searchParams.get('page') === '2'
          ? { ...paginated([alert(21)]), current_page: 2, last_page: 2, total: 21 }
          : { ...paginated(Array.from({ length: 20 }, (_, index) => alert(index + 1))), last_page: 2, next_page_url: '/api/admin/security/alerts?page=2', total: 21 }
      return Promise.resolve({ ok: true, json: async () => data })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/alertas']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Alertas de seguridad' })).toBeInTheDocument()
    expect(await screen.findByText('Página 1 de 2 · 21 alertas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Página 2 de 2 · 21 alertas')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oferta · #21' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/security/alerts?page=2'), expect.anything())
    vi.unstubAllGlobals()
  })

  it('shows report ownership, configurable SLA deadline, and priority controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => paginated([{ id: 14, public_reference: 'report-ref-14', resource_type: 'product', resource_id: 19, reason_code: 'unsafe', description: 'Esta oferta requiere revisión prioritaria.', contact_email: null, status: 'new', priority: 'urgent', created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-19T13:00:00Z', sla_overdue: false, assignee_id: null, assignee: null, evidence: [] }]),
    }))
    render(<MemoryRouter initialEntries={['/admin/denuncias']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Casos y denuncias' })).toBeInTheDocument()
    expect(screen.getByText(/Responsable: Sin asignar/)).toBeInTheDocument()
    expect(screen.getByText(/Vence/)).toBeInTheDocument()
    expect(screen.getByLabelText(/prioridad del caso/i)).toHaveValue('urgent')
    expect(screen.getByRole('link', { name: /abrir expediente/i })).toHaveAttribute('href', '/admin/seguridad/casos/14')
    vi.unstubAllGlobals()
  })

  it('shows a protected security case dossier with resource, evidence and audit timeline', async () => {
    const dossier = { id: 14, public_reference: 'report-ref-14', resource_type: 'product', resource_id: 19, resource: { type: 'product', id: 19, label: 'Tomate de patio', slug: 'tomate-de-patio' }, reason_code: 'unsafe', description: 'Esta oferta requiere revisión prioritaria.', status: 'reviewing', priority: 'high', assignee_id: 5, assignee: { id: 5, name: 'Moderadora asignada' }, created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-20T09:00:00Z', sla_overdue: false, evidence: [{ id: 3, mime_type: 'image/jpeg', size_bytes: 128, created_at: '2026-10-19T09:05:00Z' }], history: [{ action: 'trust_safety.report_updated', reason: 'Iniciamos una revisión humana del reporte.', changes: { status: { from: 'new', to: 'reviewing' } }, actor: { name: 'Moderadora asignada' }, created_at: '2026-10-19T09:10:00Z' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: dossier }) }))
    render(<MemoryRouter initialEntries={['/admin/seguridad/casos/14']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Expediente de seguridad · #14' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tomate de patio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /abrir vista pública/i })).toHaveAttribute('href', '/productos/tomate-de-patio')
    expect(screen.getByText(/iniciamos una revisión humana/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /descargar evidencia/i })).toHaveAttribute('href', expect.stringContaining('/admin/reports/14/evidence/3'))
    expect(screen.getByRole('link', { name: /volver a casos/i })).toHaveAttribute('href', '/admin/denuncias')
    vi.unstubAllGlobals()
  })

  it('does not let a delayed case action overwrite a dossier opened afterward', async () => {
    const user = userEvent.setup()
    let finishUpdate: (() => void) | undefined
    const dossier = (id: number, status: string) => ({ id, public_reference: `report-ref-${id}`, resource_type: 'product', resource_id: id, resource: { type: 'product', id, label: `Oferta ${id}`, slug: `oferta-${id}` }, reason_code: 'incorrect', description: `Caso de prueba ${id}.`, status, priority: 'normal', assignee_id: status === 'reviewing' ? 5 : null, assignee: status === 'reviewing' ? { id: 5, name: 'Moderadora asignada' } : null, created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-20T09:00:00Z', sla_overdue: false, evidence: [], history: [] })
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true } as Response)
      if (url.pathname.endsWith('/admin/reports/14') && init?.method === 'PUT') return new Promise<Response>((resolve) => { finishUpdate = () => resolve({ ok: true, json: async () => ({ data: { id: 14, status: 'reviewing', assignee_id: 5, assignee: { id: 5, name: 'Moderadora asignada' } } }) } as Response) })
      const id = Number(url.pathname.split('/').pop())
      return Promise.resolve({ ok: true, json: async () => ({ data: dossier(id, id === 14 && finishUpdate ? 'reviewing' : 'new') }) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/casos/14']}><Link to="/admin/seguridad/casos/15">Abrir caso 15</Link><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Expediente de seguridad · #14' })
    await user.type(screen.getByLabelText('Nota privada para el historial'), 'Inicio la revisión del caso.')
    await user.click(screen.getByRole('button', { name: 'Tomar caso y revisar' }))
    await waitFor(() => expect(finishUpdate).toBeDefined())
    await user.click(screen.getByRole('link', { name: 'Abrir caso 15' }))
    await screen.findByRole('heading', { name: 'Expediente de seguridad · #15' })
    finishUpdate?.()
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).includes('/admin/reports/14') && !init?.method)).toBe(true))
    expect(screen.getByRole('heading', { name: 'Expediente de seguridad · #15' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
  it('requires a private note to take a case from its security dossier', async () => {
    const user = userEvent.setup()
    let status = 'new'
    const dossier = { id: 14, public_reference: 'report-ref-14', resource_type: 'product', resource_id: 19, resource: { type: 'product', id: 19, label: 'Tomate de patio', slug: 'tomate-de-patio' }, reason_code: 'unsafe', description: 'Esta oferta requiere revisión prioritaria.', status, priority: 'high', assignee_id: status === 'reviewing' ? 5 : null, assignee: status === 'reviewing' ? { id: 5, name: 'Moderadora asignada' } : null, created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-20T09:00:00Z', sla_overdue: false, evidence: [], history: [] }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true } as Response)
      if (url.endsWith('/admin/reports/14') && init?.method === 'PUT') { status = 'reviewing'; return Promise.resolve({ ok: true, json: async () => ({ data: { id: 14 } }) } as Response) }
      return Promise.resolve({ ok: true, json: async () => ({ data: { ...dossier, status, assignee_id: status === 'reviewing' ? 5 : null, assignee: status === 'reviewing' ? { id: 5, name: 'Moderadora asignada' } : null } }) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/casos/14']}><App /></MemoryRouter>)
    const takeCase = await screen.findByRole('button', { name: 'Tomar caso y revisar' })
    await user.click(takeCase)
    expect(await screen.findByText('Escribe una nota privada de al menos cinco caracteres.')).toBeInTheDocument()
    const note = document.getElementById('case-detail-note-14') as HTMLTextAreaElement
    expect(document.activeElement).toBe(note)
    await user.type(note, 'Iniciamos revisión del reporte.')
    await user.click(takeCase)
    expect(await screen.findByText(/moderadora asignada/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/reports/14'), expect.objectContaining({ method: 'PUT', body: JSON.stringify({ status: 'reviewing', priority: 'high', resolution_note: 'Iniciamos revisión del reporte.' }) }))
    vi.unstubAllGlobals()
  })

  it('releases an assigned case through an accessible confirmation and returns it to the queue', async () => {
    const user = userEvent.setup()
    let status = 'reviewing'
    let assigneeId: number | null = 5
    let releaseNote = ''
    const dossier = { id: 18, public_reference: 'report-ref-18', resource_type: 'product', resource_id: 29, resource: { type: 'product', id: 29, label: 'Yuca', slug: 'yuca' }, reason_code: 'unsafe', description: 'Requiere revisión.', status, priority: 'normal', assignee_id: assigneeId, assignee: { id: 5, name: 'Moderadora actual' }, can_release: true, created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-22T09:00:00Z', sla_overdue: false, evidence: [], history: [] }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/admin/reports/18/release') && init?.method === 'POST') { releaseNote = JSON.parse(String(init.body)).resolution_note; status = 'new'; assigneeId = null; return Promise.resolve({ ok: true, json: async () => ({ data: { id: 18, status, assignee_id: null } }) }) }
      return Promise.resolve({ ok: true, json: async () => ({ data: { ...dossier, status, assignee_id: assigneeId, assignee: assigneeId ? { id: 5, name: 'Moderadora actual' } : null, can_release: status === 'reviewing' && assigneeId === 5 } }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/casos/18']}><App /></MemoryRouter>)
    await user.type(await screen.findByRole('textbox', { name: /nota privada para el historial/i }), 'Cambio de turno, devolver al equipo.')
    await user.click(screen.getByRole('button', { name: 'Devolver a la cola' }))
    expect(screen.getByRole('alertdialog', { name: 'Devolver caso a la cola' })).toBeInTheDocument()
    expect(releaseNote).toBe('')
    await user.click(screen.getAllByRole('button', { name: 'Devolver a la cola' })[1])
    expect(await screen.findByText('Nuevo')).toBeInTheDocument()
    expect(releaseNote).toBe('Cambio de turno, devolver al equipo.')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/reports/18/release'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ resolution_note: 'Cambio de turno, devolver al equipo.' }) }))
    vi.unstubAllGlobals()
  })
  it('requires a private note and records resolution from the security dossier', async () => {
    const user = userEvent.setup()
    let status = 'reviewing'
    const dossier = { id: 14, public_reference: 'report-ref-14', resource_type: 'product', resource_id: 19, resource: { type: 'product', id: 19, label: 'Tomate de patio', slug: 'tomate-de-patio' }, reason_code: 'unsafe', description: 'Esta oferta requiere revisión prioritaria.', priority: 'high', assignee_id: 5, assignee: { id: 5, name: 'Moderadora asignada' }, created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-20T09:00:00Z', sla_overdue: false, evidence: [], history: [] }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true } as Response)
      if (url.endsWith('/admin/reports/14') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { status: string; resolution_note: string }
        status = body.status
        return Promise.resolve({ ok: true, json: async () => ({ data: { id: 14, status, assignee_id: 5, assignee: { id: 5, name: 'Moderadora asignada' } } }) } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: { ...dossier, status } }) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/casos/14']}><App /></MemoryRouter>)
    const resolve = await screen.findByRole('button', { name: 'Resolver caso' })
    await user.click(resolve)
    expect(await screen.findByText('Escribe una nota privada de al menos cinco caracteres.')).toBeInTheDocument()
    const note = document.getElementById('case-detail-note-14') as HTMLTextAreaElement
    expect(document.activeElement).toBe(note)
    await user.type(note, 'Resolución confirmada en el piloto.')
    await user.click(resolve)
    expect(await screen.findByText('Este caso está cerrado. Puedes consultar su historial de decisiones.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/reports/14'), expect.objectContaining({ method: 'PUT', body: JSON.stringify({ status: 'resolved', priority: 'high', resolution_note: 'Resolución confirmada en el piloto.' }) }))
    vi.unstubAllGlobals()
  })
  it('persists report priority and recalculates the SLA while preserving the old value after a failure', async () => {
    const user = userEvent.setup()
    let priorityRequests = 0
    const report = { id: 16, public_reference: 'report-ref-16', resource_type: 'product', resource_id: 21, reason_code: 'incorrect', description: 'La información requiere revisión.', contact_email: null, status: 'new', priority: 'normal' as const, created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-22T09:00:00Z', sla_overdue: false, assignee_id: null, assignee: null, evidence: [] }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.pathname.endsWith('/admin/reports/16/priority')) {
        priorityRequests += 1
        return Promise.resolve(priorityRequests === 1
          ? { ok: false, status: 503 }
          : { ok: true, json: async () => ({ data: { id: 16, status: 'new', priority: 'urgent', assignee_id: null, sla_due_at: '2026-10-19T15:00:00Z', sla_overdue: true } }) })
      }
      return Promise.resolve({ ok: true, json: async () => paginated([report]) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/denuncias']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Casos y denuncias' })).toBeInTheDocument()
    const priority = screen.getByLabelText('Prioridad del caso 16')
    await user.selectOptions(priority, 'high')
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la prioridad del caso.')
    expect(priority).toHaveValue('normal')
    await user.selectOptions(priority, 'urgent')
    await waitFor(() => expect(priority).toHaveValue('urgent'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/reports/16/priority'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ priority: 'urgent' }) }))
    expect(screen.getByText(/Plazo vencido/)).toBeInTheDocument()
    expect(priorityRequests).toBe(2)
    vi.unstubAllGlobals()
  })

  it('loads the next page of report cases from the queue controls', async () => {
    const user = userEvent.setup()
    const report = (id: number) => ({ id, public_reference: `report-ref-${id}`, resource_type: 'product', resource_id: id, reason_code: 'incorrect', description: 'Reporte de prueba para la cola paginada.', contact_email: null, status: 'new', priority: 'normal', created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-22T09:00:00Z', sla_overdue: false, assignee_id: null, assignee: null, evidence: [] })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      const data = url.searchParams.get('page') === '2'
        ? { ...paginated([report(21)]), current_page: 2, last_page: 2, total: 21 }
        : { ...paginated(Array.from({ length: 20 }, (_, index) => report(index + 1))), last_page: 2, next_page_url: '/api/admin/reports?page=2', total: 21 }
      return Promise.resolve({ ok: true, json: async () => data })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/denuncias']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Casos y denuncias' })).toBeInTheDocument()
    expect(await screen.findByText('Página 1 de 2 · 21 casos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Página 2 de 2 · 21 casos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reporte de oferta · #21' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/reports?page=2'), expect.anything())
    vi.unstubAllGlobals()
  })

  it('requires a private note before assigning a report and focuses its field', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => paginated([{ id: 14, public_reference: 'report-ref-14', resource_type: 'product', resource_id: 19, reason_code: 'unsafe', description: 'Esta oferta requiere revisión prioritaria.', contact_email: null, status: 'new', priority: 'urgent', created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-19T13:00:00Z', sla_overdue: false, assignee_id: null, assignee: null, evidence: [] }]),
    }))
    render(<MemoryRouter initialEntries={['/admin/denuncias']}><App /></MemoryRouter>)
    const note = await screen.findByLabelText('Nota privada para el historial')
    await user.click(screen.getByRole('button', { name: 'Tomar caso y revisar' }))
    expect(await screen.findByText('Escribe una nota privada de al menos cinco caracteres.')).toBeInTheDocument()
    expect(document.activeElement).toBe(note)
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/admin/reports/14'), expect.objectContaining({ method: 'PUT' }))
    vi.unstubAllGlobals()
  })

  it('shows the moderator as report owner after taking the case', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/admin/reports?page=')
        ? paginated([{ id: 14, public_reference: 'report-ref-14', resource_type: 'product', resource_id: 19, reason_code: 'unsafe', description: 'Esta oferta requiere revisión prioritaria.', contact_email: null, status: 'new', priority: 'urgent', created_at: '2026-10-19T09:00:00Z', sla_due_at: '2026-10-19T13:00:00Z', sla_overdue: false, assignee_id: null, assignee: null, evidence: [] }])
        : { data: { id: 14, status: 'reviewing', priority: 'urgent', assignee_id: 5, assignee: { id: 5, name: 'Moderadora asignada' } } }
      return Promise.resolve({ ok: true, json: async () => body })
    }))
    render(<MemoryRouter initialEntries={['/admin/denuncias']}><App /></MemoryRouter>)
    await user.type(await screen.findByLabelText('Nota privada para el historial'), 'Inicio revisión del reporte.')
    await user.click(screen.getByRole('button', { name: 'Tomar caso y revisar' }))
    expect(await screen.findByText(/Responsable: Moderadora asignada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Caso en revisión' })).toBeDisabled()
    vi.unstubAllGlobals()
  })

  it('assigns an alert after the moderator records a review note', async () => {
    const user = userEvent.setup()
    let alertStatus = 'open'
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.endsWith('/me')
        ? { data: { permissions: ['security.alerts.manage'] } }
        : url.includes('/admin/security/alerts/4')
          ? (alertStatus = 'reviewing', { data: { id: 4, status: 'reviewing', assignee_id: 9 } })
        : url.includes('/admin/security/alerts?page=')
          ? paginated([{ id: 4, signal_type: 'repeated_reports', resource_type: 'product', resource_id: 19, severity: 'warning', explanation: 'Tres o más reportes recibidos para el mismo recurso en 24 horas.', evidence: { report_count_24h: 3 }, status: alertStatus, assignee_id: alertStatus === 'reviewing' ? 9 : null, assignee: alertStatus === 'reviewing' ? { id: 9, name: 'Moderadora asignada' } : null, first_seen_at: '2026-10-19T12:00:00Z', last_seen_at: '2026-10-19T12:00:00Z' }])
        : { data: { id: 4, status: 'reviewing', assignee_id: 9 } }
      return Promise.resolve({ ok: true, json: async () => body })
    }))
    render(<MemoryRouter initialEntries={['/admin/alertas']}><App /></MemoryRouter>)
    const note = await screen.findByLabelText('Nota de revisión')
    await user.type(note, 'Iniciamos una investigación manual de esta alerta.')
    await user.click(screen.getByRole('button', { name: 'Tomar y revisar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Alerta asignada a tu revisión.')
    expect(screen.getByText(/EN REVISIÓN/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/security/alerts/4'), expect.objectContaining({ method: 'PUT' }))
    vi.unstubAllGlobals()
  })

  it('shows appeal outcomes to the producer after the profile is reinstated', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/me')
        ? { data: { name: 'Productora de prueba', email: 'productora@example.test', profile: { public_name: 'Finca de prueba', slug: 'finca-prueba', activity: 'Cultivo', description: null, location_id: null, phone_private: '+50760000000', contact_level: 'unverified', profile_status: 'active', suspension_reason: null } } }
        : url.endsWith('/me/appeals')
          ? { data: { profile_status: 'active', suspension_reason: null, appeals: [{ id: 22, reason: 'Presenté documentos para revisión.', status: 'reinstated', resolution_note: 'Verificamos la información y restablecimos tu perfil.', submitted_at: '2026-10-19T12:00:00Z', reviewed_at: '2026-10-19T14:00:00Z' }] } }
          : { data: [] }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    render(<MemoryRouter initialEntries={['/mi-panel']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Historial de revisión de suspensión' })).toBeInTheDocument()
    expect(screen.getByText('Verificamos la información y restablecimos tu perfil.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /solicitar revisión/i })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows featured offers returned by the public catalog API', async () => {
    const product = { id: 4, slug: 'tomate-local', title: 'Tomate local', description: 'Tomates de temporada cultivados en Azuero.', unit: 'libra', price_type: 'fixed', price_amount: '1.25', currency: 'PAB', stock_quantity: null, status: 'published', category: { name: 'Frutas y verduras', slug: 'frutas' }, producer: { public_name: 'Huerto local', slug: 'huerto-local', contact_level: 'unverified', location: { name: 'Las Tablas', parent: { name: 'Los Santos' } } }, images: [] }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/products')) return Promise.resolve({ ok: true, json: async () => ({ data: [product], current_page: 1, last_page: 1, total: 1 }) })
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'De aquí, para compartir' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Tomate local' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), 'http://localhost:8000').pathname.endsWith('/products'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('shows a localized recoverable catalog error without leaving a loading status', async () => {
    const user = userEvent.setup()
    let requests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/categories')) return Promise.resolve({ ok: true, json: async () => [{ id: 2, name: 'Del campo', slug: 'del-campo' }] })
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.pathname.endsWith('/products')) {
        requests += 1
        if (requests === 1) return Promise.reject(new TypeError('Failed to fetch'))
        return Promise.resolve({ ok: true, json: async () => ({ data: [], current_page: 1, last_page: 1, total: 0 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/productos?q=yuca&category=del-campo']}><App /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar con el mercado')
    expect(screen.getByText('No pudimos consultar el catálogo')).toBeInTheDocument()
    expect(screen.queryByText('Consultando el catálogo…')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar productos' })).toHaveValue('yuca')
    expect(screen.getByRole('combobox', { name: 'Filtrar por categoría' })).toHaveValue('del-campo')

    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('Todavía no hay ofertas publicadas que coincidan')).toBeInTheDocument()
    expect(requests).toBe(2)
    vi.unstubAllGlobals()
  })

  it('renders Spanish login fields with browser autocomplete semantics', () => {
    render(
      <MemoryRouter initialEntries={['/ingresar']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('heading', { name: /ingresa a tu cuenta/i })).toBeInTheDocument()
  })

  it('shows an associated inline error and focuses the first invalid sign-in field', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/ingresar']}><App /></MemoryRouter>)

    const email = screen.getByRole('textbox', { name: /correo electrónico/i })
    const form = email.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    expect(email).toHaveFocus()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    const describedBy = email.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent(/escribe tu correo electrónico/i)
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything())
    fireEvent.change(email, { target: { value: 'productora@example.test' } })
    expect(email).not.toHaveAttribute('aria-invalid')
    expect(email).not.toHaveAttribute('aria-describedby')
    expect(document.getElementById(`${email.id}-validation-error-inline`)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('lets a producer request a generic password recovery message', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/auth/password/forgot')) return Promise.resolve({ ok: true, status: 202, json: async () => ({ message: 'Si el correo corresponde a una cuenta, enviaremos instrucciones para restablecer la contraseña.' }) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/recuperar']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Recupera tu cuenta' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/correo electrónico/i), 'productora@example.test')
    await user.click(screen.getByRole('button', { name: /enviar instrucciones/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/si el correo corresponde a una cuenta/i)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/password/forgot'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'productora@example.test' }) }))
    vi.unstubAllGlobals()
  })

  it('submits an emailed reset token and confirms the new password without logging in automatically', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/auth/password/reset')) return Promise.resolve({ ok: true, json: async () => ({ message: 'La contraseña se actualizó. Inicia sesión con tu nueva contraseña.' }) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/restablecer?token=mail-token&email=productora%40example.test']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Crea una contraseña nueva' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^nueva contraseña$/i), 'Nueva-clave-segura-123')
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'Nueva-clave-segura-123')
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/la contraseña se actualizó/i)
    expect(screen.getByRole('link', { name: /volver a ingresar/i })).toHaveAttribute('href', '/ingresar')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/password/reset'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'productora@example.test', token: 'mail-token', password: 'Nueva-clave-segura-123', password_confirmation: 'Nueva-clave-segura-123' }) }))
    vi.unstubAllGlobals()
  })

  it('shows a recoverable error when the secure session cannot be initialized before login', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    render(<MemoryRouter initialEntries={['/ingresar']}><App /></MemoryRouter>)
    await user.type(screen.getByLabelText(/correo electrónico/i), 'productora@example.test')
    await user.type(screen.getByLabelText(/contraseña/i), 'password-seguro')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos iniciar la sesión segura. Inténtalo de nuevo.')
    vi.unstubAllGlobals()
  })

  it('keeps the MFA challenge available after a temporary verification service failure', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (url.pathname.endsWith('/auth/login')) return Promise.resolve({ ok: true, status: 202 })
      if (url.pathname.endsWith('/auth/mfa/challenge')) return Promise.resolve({ ok: false, status: 503 })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/ingresar']}><App /></MemoryRouter>)
    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@example.test')
    await user.type(screen.getByLabelText(/contraseña/i), 'password-seguro')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    expect(await screen.findByRole('heading', { name: 'Verificación en dos pasos' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/código de autenticación/i), '123456')
    fireEvent.submit(screen.getByRole('button', { name: /verificar e ingresar/i }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/mfa/challenge'), expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('La verificación administrativa no está disponible temporalmente.'))
    expect(screen.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeInTheDocument()
    expect(screen.getByLabelText(/código de autenticación/i)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('keeps manual product publication complete without requiring AI', () => {
    render(<MemoryRouter initialEntries={['/mis-productos/nuevo']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /publica un producto/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/fotografías/i)).toHaveAttribute('multiple')
    expect(screen.getByLabelText(/stock disponible/i)).toHaveAttribute('name', 'stock_quantity')
    expect(screen.getByLabelText(/moneda/i)).toHaveValue('PAB')
    expect(screen.getByLabelText(/tipo de precio/i)).toHaveValue('contact')
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeInTheDocument()
    expect(screen.queryByText(/la ia es opcional/i)).not.toBeInTheDocument()
  })

  it('shows the authenticated administrator MFA enrollment instructions and confirmation field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { enabled: false, secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/Mercado%20Solidario:admin@example.test' } }),
    }))
    render(<MemoryRouter initialEntries={['/admin/mfa']}><App /></MemoryRouter>)
    expect(await screen.findByLabelText(/clave de configuración/i)).toHaveValue('JBSWY3DPEHPK3PXP')
    expect(screen.getByLabelText(/código de seis dígitos/i)).toHaveAttribute('autocomplete', 'one-time-code')
    expect(screen.getByRole('heading', { name: /configura la verificación en dos pasos/i })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows a recovery request from the admin MFA challenge and gives a generic confirmation', async () => {
    const user = userEvent.setup()
    const reason = 'Perdí el teléfono con mi aplicación autenticadora.'
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (path.endsWith('/auth/login')) return Promise.resolve({ ok: true, status: 202 })
      if (path.endsWith('/auth/mfa/recovery-requests')) return Promise.resolve({ ok: true, status: 202 })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/ingresar']}><App /></MemoryRouter>)
    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@example.test')
    await user.type(screen.getByLabelText(/contraseña/i), 'password-seguro')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await user.click(await screen.findByRole('button', { name: /perdí mi autenticador/i }))
    expect(screen.getByRole('heading', { name: /solicita recuperar tu autenticador/i })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/motivo de la solicitud/i), reason)
    await user.click(screen.getByRole('button', { name: /solicitar recuperación/i }))
    expect(await screen.findByRole('heading', { name: /revisaremos tu solicitud/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent(reason)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/mfa/recovery-requests'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason }) }))
    vi.unstubAllGlobals()
  })

  it('validates and focuses the recovery reason before submitting', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (path.endsWith('/auth/login')) return Promise.resolve({ ok: true, status: 202 })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/ingresar']}><App /></MemoryRouter>)
    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@example.test')
    await user.type(screen.getByLabelText(/contraseña/i), 'password-seguro')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await user.click(await screen.findByRole('button', { name: /perdí mi autenticador/i }))
    const reasonField = screen.getByLabelText(/motivo de la solicitud/i)
    await user.click(screen.getByRole('button', { name: /solicitar recuperación/i }))
    expect(reasonField).toHaveAttribute('aria-invalid', 'true')
    expect(reasonField).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/mfa/recovery-requests'), expect.anything())
    vi.unstubAllGlobals()
  })

  it('preserves the recovery reason after a submission error', async () => {
    const user = userEvent.setup()
    const reason = 'El autenticador dejó de estar disponible y necesito ayuda.'
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (path.endsWith('/auth/login')) return Promise.resolve({ ok: true, status: 202 })
      if (path.endsWith('/auth/mfa/recovery-requests')) return Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/ingresar']}><App /></MemoryRouter>)
    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@example.test')
    await user.type(screen.getByLabelText(/contraseña/i), 'password-seguro')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))
    await user.click(await screen.findByRole('button', { name: /perdí mi autenticador/i }))
    await user.type(screen.getByLabelText(/motivo de la solicitud/i), reason)
    await user.click(screen.getByRole('button', { name: /solicitar recuperación/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/tu motivo sigue en el formulario/i)
    expect(screen.getByLabelText(/motivo de la solicitud/i)).toHaveValue(reason)
    vi.unstubAllGlobals()
  })

  it('hides the MFA recovery queue link without its permission', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/admin/analytics')) return Promise.resolve({ ok: true, json: async () => ({ data: { producers: {}, products: {}, reports_open: 0, contact_intentions_30d: 0, searches_without_results_30d: 0, moderation_decisions_30d: 0, average_moderation_hours_30d: null } }) })
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['analytics.view'] } }) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin']}><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Administración' })
    await waitFor(() => expect(screen.queryByRole('link', { name: /recuperación de mfa/i })).not.toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/admin/mfa-recovery-requests'), expect.anything())
    vi.unstubAllGlobals()
  })

  it('shows empty and recoverable error states for the MFA review queue', async () => {
    const user = userEvent.setup()
    let fail = false
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['security.mfa_recovery.review'] } }) })
      if (path.endsWith('/admin/mfa-recovery-requests')) return Promise.resolve(fail ? { ok: false, status: 503 } : { ok: true, json: async () => paginated([]) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<MemoryRouter initialEntries={['/admin/seguridad/recuperacion-mfa']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /no hay solicitudes pendientes/i })).toBeInTheDocument()
    view.unmount()
    fail = true
    render(<MemoryRouter initialEntries={['/admin/seguridad/recuperacion-mfa']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /no pudimos cargar la cola/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /intentar de nuevo/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows the reviewer prior vote and disables a duplicate decision', async () => {
    const item = { id: 82, target: { name: 'Personal de prueba', email: 'staff@example.test' }, reason: 'El autenticador dejó de funcionar.', status: 'awaiting_second_approval', requested_at: '2026-10-19T12:00:00Z', expires_at: '2026-10-22T12:00:00Z', approvals: [{ approver: 'Revisora A', decision: 'approve', reason: 'Identidad comprobada por canal institucional.', decided_at: '2026-10-19T13:00:00Z' }], prior_vote: 'approve' }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['security.mfa_recovery.review'] } }) })
      if (path.endsWith('/admin/mfa-recovery-requests')) return Promise.resolve({ ok: true, json: async () => paginated([item]) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/recuperacion-mfa']}><App /></MemoryRouter>)
    expect(await screen.findByText(/ya registraste tu decisión/i)).toBeInTheDocument()
    expect(screen.getByText('Revisora A')).toBeInTheDocument()
    expect(screen.getByLabelText('Revisiones anteriores')).toHaveTextContent('Aprobó')
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('requires confirmation and a reason for a reviewer decision', async () => {
    const user = userEvent.setup()
    const item = { id: 83, target: { name: 'Personal de prueba', email: 'staff@example.test' }, reason: 'El autenticador institucional se perdió.', status: 'pending_first_approval', requested_at: '2026-10-19T12:00:00Z', expires_at: '2026-10-22T12:00:00Z', approvals: [], prior_vote: null }
    let queueLoads = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['security.mfa_recovery.review'] } }) })
      if (path.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (path.endsWith('/admin/mfa-recovery-requests')) { queueLoads++; return Promise.resolve({ ok: true, json: async () => paginated(queueLoads === 1 ? [item] : []) }) }
      if (path.endsWith('/decision')) return Promise.resolve({ ok: true, json: async () => ({ data: { ...item, status: 'awaiting_second_approval' } }) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/recuperacion-mfa']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))
    const reason = screen.getByRole('textbox', { name: /motivo de la decisión/i })
    await user.click(screen.getByRole('button', { name: /confirmar aprobación/i }))
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveFocus()
    await user.type(reason, 'Verifiqué la identidad por un canal independiente.')
    await user.click(screen.getByRole('button', { name: /confirmar aprobación/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/mfa-recovery-requests/83/decision'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'approve', reason: 'Verifiqué la identidad por un canal independiente.' }) })))
    expect(await screen.findByRole('status')).toHaveTextContent(/la segunda aprobación debe provenir de otra persona/i)
    vi.unstubAllGlobals()
  })

  it('returns keyboard focus to the reviewer action when its dialog is cancelled', async () => {
    const user = userEvent.setup()
    const item = { id: 85, target: { name: 'Personal de prueba', email: 'staff@example.test' }, reason: 'El autenticador institucional se extravió.', status: 'pending_first_approval', requested_at: '2026-10-19T12:00:00Z', expires_at: '2026-10-22T12:00:00Z', approvals: [], prior_vote: null }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['security.mfa_recovery.review'] } }) })
      if (path.endsWith('/admin/mfa-recovery-requests')) return Promise.resolve({ ok: true, json: async () => paginated([item]) })
      return Promise.resolve({ ok: false, status: 404 })
    }))
    render(<MemoryRouter initialEntries={['/admin/seguridad/recuperacion-mfa']}><App /></MemoryRouter>)
    const opener = await screen.findByRole('button', { name: 'Aprobar' })
    await user.click(opener)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(opener).toHaveFocus()
    vi.unstubAllGlobals()
  })

  it('retains the reviewer reason when the decision request fails', async () => {
    const user = userEvent.setup()
    const item = { id: 84, target: { name: 'Personal de prueba', email: 'staff@example.test' }, reason: 'El autenticador institucional se extravió.', status: 'pending_first_approval', requested_at: '2026-10-19T12:00:00Z', expires_at: '2026-10-22T12:00:00Z', approvals: [], prior_vote: null }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: ['security.mfa_recovery.review'] } }) })
      if (path.endsWith('/sanctum/csrf-cookie')) return Promise.resolve({ ok: true })
      if (path.endsWith('/admin/mfa-recovery-requests')) return Promise.resolve({ ok: true, json: async () => paginated([item]) })
      if (path.endsWith('/decision')) return Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
      return Promise.resolve({ ok: false, status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/admin/seguridad/recuperacion-mfa']}><App /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))
    const reason = 'La identidad se verificó con la persona responsable del área.'
    await user.type(screen.getByRole('textbox', { name: /motivo de la decisión/i }), reason)
    await user.click(screen.getByRole('button', { name: /confirmar aprobación/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/motivo se conservó/i)
    expect(screen.getByRole('textbox', { name: /motivo de la decisión/i })).toHaveValue(reason)
    vi.unstubAllGlobals()
  })

  it('shows recovery lock guidance when an existing admin session gets 423', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8000').pathname
      if (path.endsWith('/admin/analytics')) return Promise.resolve({ ok: false, status: 423 })
      if (path.endsWith('/me')) return Promise.resolve({ ok: true, json: async () => ({ data: { permissions: [] } }) })
      return Promise.resolve({ ok: false, status: 404 })
    }))
    render(<MemoryRouter initialEntries={['/admin']}><App /></MemoryRouter>)
    expect(await screen.findByText(/acceso administrativo está bloqueado durante la recuperación de mfa/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver a ingresar/i })).toHaveAttribute('href', '/ingresar')
    vi.unstubAllGlobals()
  })
})

describe('legal pages and registration consent', () => {
  it('shows the terms and privacy pages from the footer', () => {
    const terms = render(<MemoryRouter initialEntries={['/terminos']}><App /></MemoryRouter>)
    expect(screen.getAllByRole('heading', { name: /términos y condiciones/i })[0]).toBeInTheDocument()
    expect(screen.getByText(/Super Carnes no es parte de la compraventa entre usuarios/i)).toBeInTheDocument()
    terms.unmount()

    render(<MemoryRouter initialEntries={['/privacidad']}><App /></MemoryRouter>)
    expect(screen.getAllByRole('heading', { name: /política de privacidad/i })[0]).toBeInTheDocument()
    expect(screen.getByText(/Ley 81 de 2019/i)).toBeInTheDocument()

    const footer = within(screen.getByRole('navigation', { name: 'Enlaces del pie de página' }))
    expect(footer.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/terminos')
    expect(footer.getByRole('link', { name: 'Política de privacidad' })).toHaveAttribute('href', '/privacidad')
  })

  it('makes both legal acceptances required to submit registration', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost:8000')
      if (url.pathname.endsWith('/locations')) return Promise.resolve({ ok: true, json: async () => [{ id: 1, level: 'province', name: 'Herrera', slug: 'herrera', active: true }] })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/registro']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Publica tu oferta' })).toBeInTheDocument()
    const terms = screen.getByRole('checkbox', { name: /acepto los términos y condiciones/i })
    const privacy = screen.getByRole('checkbox', { name: /he leído y acepto la política de privacidad/i })
    expect(terms).toBeRequired()
    expect(privacy).toBeRequired()
    expect(screen.getAllByRole('link', { name: /términos y condiciones/i }).some((link) => link.getAttribute('href') === '/terminos')).toBe(true)
    expect(screen.getAllByRole('link', { name: /política de privacidad/i }).some((link) => link.getAttribute('href') === '/privacidad')).toBe(true)

    await user.click(screen.getByRole('button', { name: /continuar con registro/i }))
    expect(terms).not.toBeChecked()
    expect(privacy).not.toBeChecked()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/register'), expect.anything())
    vi.unstubAllGlobals()
  })
})



