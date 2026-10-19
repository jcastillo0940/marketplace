# Control de intentos del desafío MFA

**Estado: implementado en código; parámetros y procedimiento operativo pendientes de aprobación antes del piloto.**

## Contexto y objetivo

La sesión de desafío limita cinco fallos locales, pero ese tope por sí solo se renovaría con nuevas sesiones. El control compartido añade límites por cuenta e IP, y no emite un desafío administrativo si Redis no permite comprobarlos.

## Comportamiento

- Mantener el desafío de cinco minutos y un máximo de cinco intentos por sesión.
- Contar fallos en cache Redis compartido por usuario y por IP; los contadores tienen ventanas configurables y no dependen de la sesión.
- Al alcanzar el umbral, invalidar el desafío pendiente y responder de forma genérica, sin revelar si una cuenta existe o está bloqueada.
- No bloquear inicio de sesión con contraseña ni alterar el enrolamiento inicial; su mecanismo de bootstrap es una decisión de seguridad separada y permanece pendiente.
- Registrar solo el alcance agregado del bloqueo y su expiración, sin guardar códigos TOTP, secretos, correo, IP ni identificador del desafío en logs. Los contadores expiran automáticamente.
- Si Redis no está disponible, fallar de forma cerrada durante el inicio y el desafío MFA: revocar la sesión autenticada por contraseña y no aceptar ni emitir un desafío administrativo hasta recuperar el limitador. No degradar a contador de sesión únicamente.

## Implementación actual

- `MfaAttemptLimiter` utiliza el store compartido configurado (Redis en Docker y producción; array aislado únicamente en PHPUnit), claves HMAC sin identificadores directos y locks del store para inicializar e incrementar contadores concurrentes.
- Valores predeterminados configurables: 10 fallos por cuenta y 30 por IP durante 900 segundos; el máximo de cinco intentos por sesión y desafío de cinco minutos se conserva.
- Los contadores se consultan antes de verificar TOTP; el contador por cuenta se limpia después de un código válido. IP mantiene su ventana.
- El inicio de sesión con contraseña también consulta el limitador antes de emitir el desafío. Si el límite está alcanzado o el store falla, cierra la sesión autenticada y devuelve 429 o 503 sin dejar un desafío pendiente reutilizable.
- Un bloqueo invalida el desafío y devuelve 429 genérico; si Redis o el lock distribuido fallan, el endpoint devuelve 503 y no autentica.
- El evento de bloqueo solo registra alcance y expiración. OpenAPI y UAT describen los estados y parámetros.
- La matriz de aceptación todavía requiere pruebas en staging: sesiones nuevas, aislamiento por cuenta/IP, expiración, reinicio tras MFA correcto y caída de Redis.

## Aprobaciones necesarias

Seguridad y Operaciones deben aprobar antes del piloto los valores predeterminados (10 fallos por cuenta y 30 por IP en 15 minutos), el riesgo de denegación de servicio por bloqueo dirigido y el procedimiento de recuperación/desbloqueo. La sesión conserva límite de cinco intentos y duración de cinco minutos.

## Riesgos y recuperación

Un contador compartido mejora resistencia a sesiones repetidas, pero un atacante podría provocar bloqueo de una cuenta conocida. La mitigación es una respuesta genérica, TTL acotado, alertas agregadas y procedimiento de desbloqueo auditado. Desplegar con migraciones de configuración compatibles; rollback debe poder desactivar el contador nuevo solo con aprobación de Seguridad, sin convertir el inicio MFA en opcional.
