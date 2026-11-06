@extends('emails.layout')

@section('title', $changesRequested ? 'Tu publicación necesita cambios' : 'Tu publicación no fue aprobada')

@section('content')
<p class="greeting">Hola, <strong>{{ $user->name }}</strong></p>

@if($changesRequested)
<p class="message">
  Tu publicación fue revisada y <strong>necesita algunos cambios</strong> antes de poder aparecer en el catálogo.
</p>
@else
<p class="message">
  Tu publicación fue revisada y <strong>no pudo ser aprobada</strong> en esta ocasión.
</p>
@endif

<div class="highlight-box">
  <p>
    <strong>Publicación:</strong> {{ $product->title }}<br>
    <strong>Observación del equipo:</strong><br>
    {{ $reason }}
  </p>
</div>

@if($changesRequested)
<p class="message">
  Podés editar tu publicación para corregir los puntos indicados y volver a enviarla a revisión.
</p>
<p>
  <a href="{{ config('app.frontend_url', config('app.url')) }}/productor/publicaciones" class="cta-btn">Editar mi publicación</a>
</p>
@else
<p class="message">
  Si tenés dudas sobre esta decisión, podés crear una nueva publicación corrigiendo los aspectos mencionados.
</p>
<p>
  <a href="{{ config('app.frontend_url', config('app.url')) }}/productor/publicaciones" class="cta-btn">Mis publicaciones</a>
</p>
@endif
@endsection
