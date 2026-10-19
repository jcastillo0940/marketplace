# Diseño: recuperación manual de MFA del personal

**Estado:** propuesta para revisión del Product Owner  
**Decisión recibida:** recuperación manual con doble autorización. El flujo de dos personas distintas, permisos dedicados, MFA vigente, decisiones auditadas, expiración y nueva inscripción fue aprobado en conversación. Este documento concreta las reglas técnicas para revisión antes de planificar la implementación.

## Propósito y límites

Permitir que personal interno que perdió su autenticador recupere acceso administrativo después de que dos revisores autorizados verifiquen su identidad. El proceso no debe permitir que una persona quite su propio MFA, que una contraseña por sí sola restaure administración, ni que solicitudes o secretos MFA se expongan a usuarios no autorizados.

La recuperación es distinta del restablecimiento de contraseña. No se envían códigos por correo/SMS, no se almacenan documentos de identidad y no se automatizan decisiones. Las personas revisoras documentan en el motivo la verificación realizada según el procedimiento institucional aprobado. No cambia el requisito MFA del personal ni los flujos de productores/compradores.

## Flujo

1. El personal inicia sesión con correo y contraseña. Como la cuenta tiene MFA confirmado, queda en el desafío pendiente de cinco minutos y no obtiene una sesión administrativa autenticada.
2. Desde ese desafío puede solicitar recuperación con un motivo de 10–1.000 caracteres. El servidor identifica la cuenta solo desde la sesión MFA pendiente, nunca desde un ID enviado por el navegador. Al registrar la solicitud, activa un bloqueo persistente de acceso administrativo para el usuario; también quedan bloqueadas sus sesiones previas.
3. El servidor devuelve una respuesta genérica `202` sin revelar estado, revisores, identificadores internos ni datos de seguridad. La interfaz informa que la solicitud quedó registrada y que la administración permanecerá bloqueada.
4. Un revisor con `security.mfa_recovery.review`, sesión autenticada y MFA vigente abre la cola. Revisa el mínimo de datos de cuenta necesario y verifica la identidad fuera del sistema según el procedimiento institucional. Cada decisión requiere un motivo de 10–1.000 caracteres.
5. El primer revisor puede aprobar o rechazar. Su decisión queda inmutable. Si aprueba, la solicitud pasa a `awaiting_second_approval`; otra persona distinta debe aprobarla. Una decisión de rechazo por cualquiera cierra la solicitud. La cuenta continúa bloqueada hasta completar una nueva inscripción o hasta que el usuario demuestre posesión del autenticador anterior.
6. Al recibirse la segunda aprobación, una transacción borra el secreto MFA cifrado y su fecha de confirmación. No inicia sesión al solicitante ni concede acceso administrativo. La persona deberá iniciar sesión con contraseña, inscribir un autenticador nuevo y confirmar un TOTP vigente. Solo al confirmar se levanta el bloqueo; un intento de entrar a `/api/admin/*` antes recibe una respuesta de MFA requerido.
7. Mientras no se haya completado el restablecimiento, si el usuario presenta un TOTP válido, eso demuestra posesión del autenticador anterior: se cancela la solicitud activa si existe, se levanta el bloqueo y continúa el login normal. Si la solicitud ya fue aprobada, el secreto previo no existe y ese camino no puede cancelar el restablecimiento.

Una solicitud expira a las **72 horas**. Este valor será configurable en `config/security.php` mediante `MFA_RECOVERY_TTL_HOURS`, con mínimo de 1 y máximo de 168 horas. La expiración se registra al consultar la cola, presentar una decisión o crear otra solicitud; no depende de un scheduler. Una solicitud rechazada o expirada no levanta por sí sola el bloqueo. El usuario puede crear otra solicitud desde un desafío posterior. Si conserva el autenticador, puede cancelar mediante un TOTP válido.

## Estados y persistencia

Estados terminales: `approved`, `rejected`, `expired`, `cancelled`, `enrolled`. Estados abiertos: `pending_first_approval` y `awaiting_second_approval`.

Se agrega `admin_mfa_recovery_requests` con solicitante, motivo inicial, estado, vencimiento, marcas de solicitud/cierre y timestamps. Se agrega `admin_mfa_recovery_approvals` con solicitud, aprobador, decisión (`approve`/`reject`), motivo y fecha. Índice único `(request_id, approver_id)` impide que una cuenta decida dos veces sobre la misma solicitud. La referencia a la solicitud aprobada puede conservarse en la cuenta hasta reinscripción para asociar el evento `enrolled`.

Se agrega a `users` `mfa_recovery_locked_at` nullable. El middleware administrativo niega el acceso cuando está definido, incluso para sesiones antiguas. El bloqueo se borra únicamente cuando un TOTP válido cancela una solicitud abierta (o prueba posesión después de que esta se rechazó/expiró), o al confirmar la reinscripción posterior a una aprobación doble. La solicitud expira o se rechaza sin borrar este bloqueo. Si un TOTP válido levanta un bloqueo asociado a una solicitud terminal, auditoría registra `admin.mfa_recovery.unlocked_by_totp` sin reescribir la decisión histórica.

La creación bloquea la fila de `users` en transacción para impedir solicitudes activas concurrentes por carrera. La decisión bloquea la solicitud y la cuenta objetivo, vuelve a comprobar estado, vencimiento, permiso, distinción de actores y conteo de aprobaciones. La segunda aprobación y la eliminación de la semilla son atómicas. Solicitudes terminales se conservan para auditoría; no se reciclan filas.

## Autorización y API

- `POST /api/auth/mfa/recovery-requests` usa el desafío MFA pendiente, sesión web/CSRF y el límite de autenticación. No acepta `user_id`. La validación del motivo es explícita.
- `GET /api/admin/mfa-recovery-requests` exige `auth:sanctum`, `admin.mfa` y `security.mfa_recovery.review`. Devuelve solo solicitudes abiertas paginadas, identificador de solicitud, nombre/correo de la cuenta interna objetivo, hora, vencimiento, estado, motivo de solicitud y aprobaciones anteriores con actor y motivo. Nunca incluye secreto/URI TOTP, sesión, IP completa, teléfono de productor ni adjuntos.
- `POST /api/admin/mfa-recovery-requests/{id}/decision` exige el mismo middleware y permiso. Recibe `decision` y `reason`; el solicitante y un aprobador anterior reciben `403`/`409`. Una solicitud expirada se marca `expired` y no acepta decisiones. Para evitar exposición, el endpoint público del desafío siempre usa el mismo mensaje/respuesta aunque ya exista una solicitud activa.
- `POST /api/auth/mfa/challenge` conserva MFA vigente. Si el usuario tiene una solicitud activa y presenta TOTP válido, cancela esa solicitud y quita el bloqueo antes de autenticarlo. También puede quitar un bloqueo de una solicitud terminal al demostrar posesión del autenticador previo. Un código inválido mantiene el flujo y los límites existentes.
- `POST /api/auth/mfa/confirm` termina una reinscripción aprobada: en la misma transacción confirma el secreto nuevo, marca la solicitud `enrolled`, quita el bloqueo y registra auditoría.

El permiso dedicado se crea en el seeder y se asigna a `admin` y `super_admin`; `super_admin` conserva el comportamiento existente de permiso total. Cualquier operador que aprueba debe tener MFA confirmado por `admin.mfa`. El solicitante nunca puede aprobar su solicitud. Ninguna decisión elimina la necesidad de MFA.

## Auditoría y privacidad

`audit_logs` registra `admin.mfa_recovery.requested`, `approved`, `rejected`, `expired`, `cancelled`, `unlocked_by_totp` y `enrolled`, con actor, tipo/ID de solicitud, estado anterior/posterior y motivo correspondiente. La doble aprobación conserva ambos actores y motivos. No se escribe el secreto TOTP, URI, código, contraseña ni token en base de datos de recuperación, respuestas, logs ni auditoría. Las entradas de historial son inmutables desde la API.

El motivo registra que se realizó la verificación y su resultado, no el número/documento ni copias de evidencia. La institución debe aprobar el procedimiento para comprobar identidad fuera del sistema antes de producción. El personal autorizado verá datos mínimos de la cuenta solo en la cola protegida por MFA. Todas las respuestas son privadas y `no-store` cuando se relacionan con recuperación.

## Interfaz

- En el desafío MFA de `/ingresar`, un enlace secundario abre el formulario de recuperación. El formulario pide el motivo, explica que dos revisores distintos deben autorizar y que se bloqueará el acceso admin hasta volver a inscribir MFA; el envío tiene estado ocupado, error recuperable y confirmación genérica.
- Se incorpora `/admin/seguridad/recuperacion-mfa` y un enlace visible solo con `security.mfa_recovery.review`. La pantalla muestra estados de carga, error/reintento, cola vacía, vencimiento, primer voto y acción de aprobación/rechazo con motivo requerido. Cada persona puede actuar una sola vez por solicitud. La decisión requiere confirmación accesible antes de enviarse.
- Los errores se asocian al campo y el foco va al primer campo inválido. Tras éxito, se vuelve a la cola y se presenta el estado actualizado; fallos de red conservan el motivo escrito para reintentar.
- Se reutilizan los patrones visuales y de formularios del proyecto, con vocabulario en español de Panamá. Sin agregar biblioteca visual ni mostrar datos MFA.

## Pruebas de aceptación

1. Cuenta de productor, cuenta inexistente, sesión sin desafío y sesión vencida no pueden abrir solicitudes; no se acepta un ID de objetivo del cliente.
2. Personal con MFA confirmado puede solicitar; cuenta sin MFA usa inscripción normal. La repetición concurrente no crea dos solicitudes abiertas.
3. Solicitud activa bloquea API administrativa incluso desde sesión autenticada previa; endpoints del productor/comprador no conceden permisos adicionales.
4. Falta de permiso, MFA no confirmado, solicitante, aprobador repetido, solicitud terminal y decisión concurrente se rechazan sin mutar datos.
5. Una primera aprobación no borra el secreto; la segunda aprobación por distinta persona lo borra atómicamente, conserva la auditoría, mantiene el bloqueo y no autentica al solicitante.
6. Un rechazo, vencimiento o error transaccional conserva el secreto y el bloqueo; la solicitud no acepta decisiones posteriores. Se puede crear una solicitud nueva después de rechazo/vencimiento y demostrar posesión con un TOTP válido siempre puede levantar el bloqueo antes de una aprobación doble.
7. TOTP válido previo a la aprobación cancela solicitud y levanta el bloqueo; TOTP inválido no lo altera.
8. Tras dos aprobaciones, el ingreso conduce a reinscripción; una confirmación válida levanta el bloqueo. Antes de confirmar, ninguna sesión accede a administración.
9. La cola solo devuelve solicitudes abiertas y datos permitidos; la API no serializa secretos, códigos, URIs, adjuntos ni identificadores de sesión. Se cubren CSRF, límites, expiración y respuestas `no-store`.
10. React verifica solicitud desde el desafío, validación/foco/errores, confirmación genérica, acceso denegado por permiso, cola vacía/error, primer voto, segundo aprobador, motivo conservado al fallar, confirmación de decisión y estados de reinscripción.

## Fuera de alcance

Recuperación por email/SMS, códigos de respaldo autogestionados, adjuntar documentos, aprobación por una sola persona, restablecimiento manual directo en base de datos, enrolamiento sin TOTP, autenticación de productores con MFA y elección de un proveedor externo de identidad.

