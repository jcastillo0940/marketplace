import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class RouteGroupErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="route-load-error page-shell" role="alert">
          <h1>No pudimos cargar esta sección</h1>
          <p>Comprueba tu conexión e inténtalo de nuevo.</p>
          <a className="button button--primary" href={window.location.href}>Recargar esta página</a>
        </main>
      )
    }

    return this.props.children
  }
}
