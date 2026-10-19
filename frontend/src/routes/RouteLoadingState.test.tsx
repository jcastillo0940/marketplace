import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RouteLoadingState from './RouteLoadingState'

describe('RouteLoadingState', () => {
  it('announces the route load politely in Spanish and reserves the main area', () => {
    render(<RouteLoadingState />)

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status')).toHaveTextContent('Cargando esta sección')
    expect(document.querySelector('.route-loading__indicator')).toBeInTheDocument()
  })
})
