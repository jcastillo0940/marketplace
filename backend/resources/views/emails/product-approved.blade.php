@extends('emails.layout')

@section('title', 'Tu publicación fue aprobada')

@section('content')
<p class="greeting">¡Buenas noticias, <strong>{{ $user->name }}</strong>!</p>
<p class="message">
  Tu publicación fue revisada y <strong>aprobada</strong>. Ya está visible en el catálogo del mercado.
</p>
<div class="highlight-box">
  <p>
    <strong>Publicación:</strong> {{ $product->title }}<br>
    @if($product->category)
    <strong>Categoría:</strong> {{ $product->category->name }}<br>
    @endif
    <strong>Estado:</strong> Publicada ✓
  </p>
</div>
<p class="message">
  Los compradores ya pueden ver tu oferta y ponerse en contacto contigo. Recordá mantener actualizada la disponibilidad y el precio.
</p>
<p>
  <a href="{{ config('app.frontend_url', config('app.url')) }}/productos/{{ $product->slug }}" class="cta-btn">Ver mi publicación</a>
</p>
@endsection
