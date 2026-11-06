@extends('emails.layout')

@section('title', 'Tu perfil fue suspendido')

@section('content')
<p class="greeting">Hola, <strong>{{ $user->name }}</strong></p>
<p class="message">
  Tu perfil de productor en <strong>MercaPRO</strong> ha sido <strong>suspendido temporalmente</strong>. Tus publicaciones no estarán visibles en el catálogo mientras dure la suspensión.
</p>
<div class="highlight-box">
  <p><strong>Motivo:</strong><br>{{ $reason }}</p>
</div>
<p class="message">
  Si considerás que esto fue un error o querés presentar un recurso, podés apelar a través de tu cuenta.
</p>
<p>
  <a href="{{ config('app.frontend_url', config('app.url')) }}/productor" class="cta-btn">Ver mi cuenta</a>
</p>
@endsection
