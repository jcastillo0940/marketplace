import { lazy, Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RouteGroupErrorBoundary } from './RouteGroupErrorBoundary'

describe('RouteGroupErrorBoundary', () => {
  it('recovers from a rejected dynamic import without retry loops or losing the URL', async () => {
    window.history.replaceState({}, '', '/admin/metricas?period=month')
    const importer = vi.fn(() => Promise.reject(new Error('chunk failed')))
    const FailedRoute = lazy(importer)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouteGroupErrorBoundary><Suspense fallback={<p role="status">Cargando la prueba…</p>}><FailedRoute /></Suspense></RouteGroupErrorBoundary>)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar esta sección')
    expect(screen.getByRole('link', { name: 'Recargar esta página' })).toHaveAttribute('href', window.location.href)
    expect(importer).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
