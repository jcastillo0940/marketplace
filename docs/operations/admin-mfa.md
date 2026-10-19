# MFA para personal interno

Todo acceso a rutas `/api/admin/*` requiere TOTP confirmado además de la sesión Sanctum. La clave secreta se guarda cifrada con `APP_KEY`; la sesión también usa el cifrado de Laravel. Los productores y compradores no necesitan MFA.

## Primera inscripción

1. Inicia sesión con la cuenta interna; si todavía no tiene MFA, el portal la envía a `/admin/mfa`.
2. Agrega una cuenta manualmente en una aplicación autenticadora compatible con TOTP (RFC 6238), usando el emisor, correo y clave que muestra el portal.
3. Escribe un código vigente de seis dígitos para confirmar. Tras confirmarlo, el secreto deja de mostrarse.
4. En los siguientes inicios de sesión, introduce el código TOTP antes de entrar al panel administrativo.

El desafío posterior a la contraseña expira en cinco minutos y admite cinco intentos por sesión. Además, se comparten límites de 10 fallos por cuenta y 30 por IP en 15 minutos; esos valores se configuran con `MFA_ACCOUNT_ATTEMPTS`, `MFA_ACCOUNT_WINDOW_SECONDS`, `MFA_IP_ATTEMPTS` y `MFA_IP_WINDOW_SECONDS`. El login comprueba disponibilidad y límites antes de emitir el desafío y revoca la sesión si no puede comprobarlos. Al agotar un límite, inicia sesión de nuevo después de que venza la ventana. El portal distingue un código incorrecto, un desafío vencido, un límite temporal y la indisponibilidad del servicio de seguridad. Si Redis no está disponible, el acceso administrativo falla cerrado; reintenta cuando el servicio esté restablecido.

## Recuperación de autenticador perdido

La persona que perdió el autenticador puede iniciar la solicitud desde el desafío MFA luego del login. La solicitud bloquea la cuenta administrativa inmediatamente. La identidad debe verificarse por el procedimiento institucional; la solicitud y su aprobación no sustituyen esa verificación. Dos revisores internos distintos, cada uno con TOTP vigente y `security.mfa_recovery.review`, deben aprobar con motivos individuales; un revisor no puede resolver su propia solicitud. Rechazarla, dejarla vencer o no alcanzar dos aprobaciones mantiene el bloqueo hasta que la persona demuestre posesión del TOTP anterior. Tras dos aprobaciones se elimina el secreto anterior, pero el acceso solo se restablece al enrolar y confirmar otro TOTP. Decisiones, motivos, actores y fechas quedan auditados. El plazo se configura con `MFA_RECOVERY_TTL_HOURS` (72 horas por defecto; de 1 a 168). La solicitud responde de forma genérica, sin enumerar cuentas ni entregar identificadores; la cola muestra datos mínimos, 20 por página y sin caché. El seeder concede el permiso inicial a admin y super_admin; el bootstrap e identidad de revisores deben aprobarse institucionalmente antes de producción. Consulta la [especificación aprobada](../superpowers/specs/2026-10-19-admin-mfa-recovery-design.md) y el [plan aprobado](../superpowers/plans/2026-10-19-admin-mfa-recovery.md). Nunca elimines MFA directamente de la base de datos como parte de la operación normal.

## Configuración

- Usa una `APP_KEY` estable, aleatoria y protegida. Cambiarla invalida sesiones y secretos MFA cifrados.
- En producción sirve la aplicación exclusivamente por HTTPS y configura `SESSION_SECURE_COOKIE=true`.
- Conserva `SESSION_ENCRYPT=true`, `SESSION_HTTP_ONLY=true` y `SESSION_SAME_SITE=lax`.
- MFA no está diseñado para el entorno local como frontera de seguridad de producción; cuentas locales y datos de prueba no deben reutilizarse en producción.

## Evidencia de aceptación

Las pruebas `test_internal_staff_login_requires_totp_and_mfa_setup_is_confirmed` y los vectores RFC 6238 en `TotpTest` cubren el desafío, la inscripción, códigos conocidos, y el bloqueo de rutas administrativas sin MFA confirmado.
La recuperación de contraseña de productores usa `POST /api/auth/password/forgot` y `/reset`, tokens de un solo uso y respuesta que no revela si un correo está registrado. Cambiar una contraseña de cuenta interna no elimina su MFA confirmado ni inicia una sesión; el acceso sigue requiriendo TOTP. Producción necesita SMTP transaccional configurado.

