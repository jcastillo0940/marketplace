# Runbook de incidentes operativos

Procedimiento técnico para desarrollo, staging y producción. No define tiempos de respuesta contractuales ni reemplaza los responsables que debe designar Super Carnes. Antes de operar staging o producción, registra quién cubre Operaciones, DevOps, Seguridad, Privacidad y comunicación institucional, junto con sus canales aprobados.

## Principios durante un incidente

- Registra hora de inicio y zona `America/Panama`, ambiente, versión/build, síntoma, alcance observado, acciones tomadas y responsable. Usa referencias de cuenta/reporte; no copies teléfonos, OTP, contraseñas, tokens, cookies, secretos ni evidencia privada al registro.
- Determina el impacto con datos mínimos y verificables. Separa indisponibilidad técnica, degradación parcial e incidente de privacidad/seguridad.
- Ejecuta primero diagnósticos de solo lectura. Cambios de configuración, reinicios, migraciones, restauración o revocación de accesos requieren responsable autorizado y registro de la decisión.
- No uses `docker compose down -v`, `migrate:fresh`, `db:wipe`, semillas no aprobadas ni restauraciones sobre la base activa como pasos de diagnóstico. No desactives MFA, límites de intentos, validación de archivos ni controles de almacenamiento privado para recuperar disponibilidad.
- Comunica a productores y compradores solo por canales y textos aprobados por la institución. El repositorio no asigna responsables ni canales públicos de soporte.

## Prioridad inicial

| Prioridad | Criterio orientativo | Acción inicial |
| --- | --- | --- |
| P1 crítica | Exposición o alteración de datos, publicación no autorizada, pérdida de datos, compromiso de credenciales o indisponibilidad total del marketplace. | Escalar inmediatamente a Seguridad/Privacidad y al responsable de Operaciones; preservar registros y limitar el alcance siguiendo la autoridad aprobada. |
| P2 alta | Una función clave está degradada para varios usuarios: acceso, OTP, publicar, moderar, denunciar, contactar o cargar medios. | Asignar dueño técnico y operativo; documentar alcance, alternativa segura y siguiente revisión. |
| P3 normal | Fallo individual con alternativa disponible, defecto visual o incidencia no crítica. | Registrar, priorizar en backlog y confirmar si afecta accesibilidad o datos antes de cerrar. |

Estos niveles son una guía de triage, no un SLA. Operaciones debe aprobar cobertura, escalamiento y tiempos antes del piloto.

## Comprobación inicial

1. Anota URL/ambiente, hora, versión si está disponible, acción que falló y mensaje visible. Usa una cuenta y datos de prueba al reproducir; no vuelvas a enviar un formulario que pudiera duplicar una operación.
2. Consulta `GET /api/health` para comprobar que Laravel responde y `GET /api/ready` para comprobar disponibilidad técnica de MySQL, cache y Redis.
3. Si `/api/ready` responde `status: ready`, revisa `setup.reference_data`. `needs_seed` indica que faltan categorías activas o la referencia mínima de Herrera/Los Santos (7 distritos y 49/81 corregimientos activos); no es un fallo de conectividad ni autorización para sembrar catálogos sobre una base existente. En un entorno controlado, aplicar migraciones y ejecutar el seed idempotente según el procedimiento de despliegue.
4. En Docker local, usa las consultas siguientes desde la raíz del repositorio. En producción, utiliza el panel y la política de logs aprobados por DevOps; no asumas acceso shell al host.

```powershell
docker compose ps
docker compose logs --since=15m --tail=200 api mysql redis web
```

Revisa las líneas pertinentes sin copiar logs completos a tickets públicos. Los registros pueden contener datos operativos sensibles. Nunca uses `docker compose config` para compartir la salida: puede incluir valores interpolados del entorno.

## Guías por síntoma

### API o sitio no responde

- Compara `/api/health` y `/api/ready` desde el mismo ambiente donde se observa el fallo.
- Si `health` falla, revisa el estado y logs del servicio API y del proxy web. Si solo falla `ready`, revisa MySQL, Redis y cache, uno a la vez.
- Confirma que el despliegue y el proxy apuntan a la misma versión y origen canónico. No cambies dominios, cookies, CORS o secretos en caliente sin registrar y aprobar el cambio.
- Después de corregir la causa, confirma navegación pública y `/api/ready`; comprueba también `setup.reference_data=ready` antes de declarar listo un ambiente de aceptación.

### Login administrativo o MFA falla

- Si el mensaje indica límite temporal, respeta la ventana configurada y no intentes eludirla con cuentas o IPs alternas.
- Si Redis no está disponible, MFA falla cerrado por diseño. Recupera Redis mediante el procedimiento del proveedor y verifica `/api/ready`; no desactives el middleware `admin.mfa`.
- Para código TOTP incorrecto, confirma sincronización horaria del dispositivo y vuelve a intentar dentro de los límites. Para pérdida del autenticador, sigue [admin-mfa.md](admin-mfa.md): la recuperación requiere verificación de identidad y auditoría; no edites la base manualmente.
- Trata sospecha de robo de contraseña o sesión como P1 y escala a Seguridad para revocación de sesiones/credenciales según el procedimiento aprobado.

### OTP por SMS no llega

- Distingue rechazo del proveedor, entrega tardía y bloqueo por frecuencia con el registro de la solicitud, sin exponer el número completo ni el código.
- Comprueba el estado del adaptador, la configuración del proveedor en el gestor de secretos y la disponibilidad/cobertura del remitente con el responsable de Operaciones.
- No cambies producción al adaptador `fake`, no publiques códigos ni desactives reverificación. Si el proveedor no está disponible, informa que el registro/verificación está temporalmente afectado y escala el impacto; los demás recorridos públicos no requieren OTP.
- Tras recuperar el proveedor, valida un único número de prueba autorizado, expiración, límite de intentos y reverificación al cambiar teléfono.

### Correo de recuperación de contraseña no llega

- La solicitud devuelve deliberadamente el mismo acuse para una cuenta existente y una desconocida. No uses el mensaje visible para inferir si el correo tiene cuenta ni pidas que el productor comparta su token.
- Busca el evento `auth.password_reset.delivery_failed` en el agregador de logs del ambiente y correlaciónalo por hora/versión. Incluye solo la clase de excepción registrada; el evento no debe contener correo, token ni URL de recuperación.
- Comprueba el estado y las credenciales SMTP en el gestor de secretos, el remitente verificado y la política del proveedor. No pases producción al mailer `log` ni registres un token para facilitar el soporte.
- Tras corregir el proveedor, pide al usuario que solicite un enlace nuevo. Un token anterior puede haber vencido; la aplicación consume cada token correctamente usado una sola vez. En staging valida entrega y caducidad con una cuenta sintética autorizada.

### Subida o lectura de imágenes/evidencias falla

- Distingue imágenes públicas optimizadas de evidencia privada de denuncias. Confirma estado del almacenamiento, espacio/cuotas y permisos del disco configurado.
- Para S3, verifica bucket, región y credenciales mediante el gestor de secretos; conserva acceso privado. No hagas público el bucket ni pegues URLs firmadas o rutas privadas en tickets.
- Para evidencia de reportes, valida acceso solo con permiso `reports.review` y registra el resultado. Si existe sospecha de exposición, eleva a P1 y preserva los registros de acceso antes de cambiar permisos.
- Reintenta con un archivo sintético que cumpla tipo y tamaño. No uses evidencia real para diagnóstico ni elimines archivos manualmente.

### MySQL o Redis degradado

- Revisa salud, espacio, eventos recientes y conexiones desde la herramienta aprobada. Si solo Redis falla, recuerda que sesiones, límites MFA, cache y colas pueden verse afectados; no lo sustituyas por un cache local improvisado.
- Si MySQL no está saludable, evita migraciones, reinicializaciones de volumen o restauraciones. Escala a DevOps/DBA con estado del servicio y hora del último cambio.
- Una restauración exige respaldo verificado, destino aislado, autorización y evaluación de pérdida de escrituras recientes. El ensayo local descrito en [DEPLOYMENT.md](../../DEPLOYMENT.md) no prueba recuperación de producción.

### Reportes de fraude, publicación indebida o posible incidente de privacidad

- Prioriza contención y preservación de auditoría. Registra ids/referencias y tiempos, no copies contenido sensible ni descargues evidencia fuera del caso.
- Una señal de Trust & Safety es una alerta para revisión humana; no la conviertas en suspensión automática. Aplica las acciones manuales con motivo y permiso según [guia-moderacion.md](guia-moderacion.md).
- Si se sospecha publicación no autorizada, exposición de contacto o acceso a evidencia, escala a Seguridad/Privacidad y Operaciones para decidir ocultamiento, preservación, notificación y tratamiento legal. No envíes avisos a titulares hasta que el responsable institucional apruebe el canal y el texto.

## Criterios de recuperación y cierre

Antes de cerrar, deja evidencia de:

- Causa identificada o hipótesis pendiente claramente diferenciada de hechos.
- Servicio recuperado: API responde, `/api/ready` está en `ready` y el estado de catálogos es el esperado para ese ambiente.
- Recorrido sintético del flujo afectado: OTP autorizado, publicación manual privada antes de aprobación, moderación, denuncia con evidencia privada o lectura pública, según corresponda.
- Permisos y controles de seguridad activos después del cambio; auditoría disponible para acciones administrativas sensibles.
- Hora de recuperación, impacto aproximado, acción correctiva, responsable y seguimiento. P1/P2 requieren revisión posterior y tareas con dueño/fecha.

No declares recuperación solo porque un contenedor aparece activo o porque una ruta devuelve HTTP 200: el frontend puede servir el fallback SPA. En producción, valida la respuesta JSON de `/api/ready` a través del dominio público, como indica [DEPLOYMENT.md](../../DEPLOYMENT.md).

## Datos de contacto operativos por completar

Completar en el entorno institucional aprobado antes del piloto: responsable titular y suplente de Operaciones; guardia DevOps; contactos de Seguridad y Privacidad; canal de escalamiento del proveedor SMS/almacenamiento; canal de comunicación pública; horario y tiempos por prioridad; autoridad para suspender temporalmente registros o publicaciones; procedimiento de notificación y conservación de evidencias. No guardar teléfonos personales ni credenciales en este repositorio.
