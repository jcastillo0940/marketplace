@extends('emails.layout')

@section('title', 'Tu cuenta fue creada')

@section('content')
<p class="greeting">Hola, <strong>{{ $user->name }}</strong></p>
<p class="message">
  Tu cuenta en <strong>MercaPRO</strong> fue creada exitosamente. Ya podés acceder con tu correo y contraseña.
</p>
<div class="highlight-box">
  <p>
    <strong>Nombre del perfil:</strong> {{ $profile->public_name }}<br>
    <strong>Estado:</strong> En espera de verificación<br>
    <strong>Correo registrado:</strong> {{ $user->email }}
  </p>
</div>
<p class="message">
  Tu perfil está en revisión. Nuestro equipo lo verificará en los próximos días hábiles. Te notificaremos por correo cuando esté aprobado y puedas empezar a publicar tus ofertas.
</p>
<p class="message">
  Mientras esperás, podés ingresar a tu cuenta y completar tu perfil con una descripción, foto y más detalles sobre lo que ofrecés.
</p>
<p>
  <a href="{{ config('app.frontend_url', config('app.url')) }}/ingresar" class="cta-btn">Ingresar a mi cuenta</a>
</p>
@endsection
