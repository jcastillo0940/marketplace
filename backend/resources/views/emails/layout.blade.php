<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>@yield('title')</title>
<style>
  body { margin: 0; padding: 0; background: #f5f0eb; font-family: Georgia, 'Times New Roman', serif; color: #1a1208; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #fffdf8; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: #1a1208; padding: 28px 32px; text-align: center; }
  .header h1 { margin: 0; color: #f5c842; font-size: 20px; font-weight: 700; letter-spacing: 0.04em; }
  .header p { margin: 4px 0 0; color: #c9a84c; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
  .body { padding: 36px 32px; }
  .greeting { font-size: 17px; margin: 0 0 18px; }
  .message { font-size: 15px; line-height: 1.7; color: #3a2e1a; margin: 0 0 24px; }
  .highlight-box { background: #fdf6e3; border-left: 4px solid #f5c842; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px; }
  .highlight-box p { margin: 0; font-size: 14px; line-height: 1.6; }
  .cta-btn { display: inline-block; background: #1a1208; color: #f5c842 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: 0.03em; margin: 8px 0; }
  .footer { border-top: 1px solid #e8dfc8; padding: 20px 32px; text-align: center; }
  .footer p { margin: 0; font-size: 12px; color: #8a7558; line-height: 1.5; }
  .footer a { color: #8a7558; }
  strong { color: #1a1208; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>MercaPRO</h1>
    <p>Del productor a tu mesa</p>
  </div>
  <div class="body">
    @yield('content')
  </div>
  <div class="footer">
    <p>Este correo fue enviado automáticamente. Si tienes dudas, contáctanos a través del mercado.<br>
    © {{ date('Y') }} MercaPRO</p>
  </div>
</div>
</body>
</html>
