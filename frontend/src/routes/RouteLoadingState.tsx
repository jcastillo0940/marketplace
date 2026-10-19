export default function RouteLoadingState() {
  return (
    <main className="route-loading page-shell" aria-busy="true">
      <p role="status" aria-live="polite">Cargando esta sección…</p>
      <span className="route-loading__indicator" aria-hidden="true" />
    </main>
  )
}
