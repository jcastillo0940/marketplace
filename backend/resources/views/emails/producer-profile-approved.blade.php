@extends('emails.layout')

@section('title', 'Tu perfil fue aprobado')

@section('content')
<p class="greeting">¡Felicitaciones, <strong>{{ $user->name }}</strong>!</p>
<p class="message">
  Tu perfil de productor en <strong>MercaPRO</strong> fue revisado y <strong>aprobado</strong>. Ya podés empezar a publicar tus productos y ofertas.
</p>
<div class="highlight-box">
  <p>
    <strong>Perfil:</strong> {{ $profile->public_name }}<br>
    <strong>Estado:</strong> Activo ✓
  </p>
</div>
<p class="message">
  A partir de ahora, cada publicación que creés pasará por una revisión rápida antes de aparecer en el catálogo público. Te notificaremos cuando sean aprobadas.
</p>
<p>
  <a href="{{ config('app.frontend_url', config('app.url')) }}/productor/publicaciones/nueva" class="cta-btn">Crear mi primera oferta</a>
</p>
@endsection
