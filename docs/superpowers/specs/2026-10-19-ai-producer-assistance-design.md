# Asistencia opcional de IA para productores — Diseño

**Estado:** propuesta técnica para revisión de Super Carnes  
**Fecha:** 19 de octubre de 2026  
**Fuente funcional:** `C:/Users/Usuario/Downloads/Roadmap_Marketplace_Solidario_Super_Carnes_Agencia.md`, sección 9  
**Proyecto actual:** Laravel 13, MySQL 8.4, Redis/colas y React + TypeScript.

## Propósito y límites

Permitir que un productor que lo elija obtenga ayuda al preparar una publicación mediante (1) sugerencias para identificar un producto en una foto, (2) un borrador de descripción a partir de datos aportados por el productor, y (3) transcripción de una nota de voz. Toda salida es una propuesta que el productor puede editar, aplicar o descartar. El camino manual actual permanece disponible y completo.

Esta propuesta cubre la fase 7 como un paquete opcional. No incluye búsqueda natural, moderación automática, análisis ejecutivo, decisión de elegibilidad, identificación de personas ni sanciones. No procesa pagos ni modifica stock, precio, disponibilidad, origen o perfil sin acción explícita del productor. No elige proveedor ni solicita credenciales; esos puntos requieren aprobación G6 separada.

## Decisiones de arquitectura

- **Apagado por defecto y doble control.** `AI_ENABLED=false` es un interruptor maestro de servidor. Flags independientes habilitan identificación por imagen, redacción o transcripción. La política persistida de módulos/presupuesto no puede anular el interruptor maestro. Presupuesto mensual inicial cero y módulos apagados impiden solicitudes hasta aprobación G6 y configuración explícita. Con IA desactivada, React oculta las acciones opcionales, la API no encola solicitudes y todos los formularios manuales siguen operativos.
- **Adaptador de proveedor.** Una interfaz Laravel `AIProvider` ofrece operaciones tipadas de identificación, redacción y transcripción. Un router selecciona un adaptador configurado. El MVP de ingeniería incluye un adaptador determinista de prueba, no un proveedor comercial ni una promesa de IA productiva. La selección de proveedor, sus términos, transferencia internacional, costos y retención requieren aprobación G6.
- **Tareas asíncronas.** Laravel valida/autoriza, reserva cuota y crea una solicitud antes de encolarla en Redis. Un worker separado procesa el trabajo con timeout acotado, reintentos limitados e idempotencia. React consulta el estado por UUID y conserva el borrador local mientras espera, falla o se descarta.
- **Cuarentena de archivos.** Foto/audio de entrada se guarda temporalmente en almacenamiento privado. El servidor valida MIME real, tamaño/duración, elimina metadatos EXIF de fotos al preparar la copia y elimina el archivo temporal al terminar o expirar. Nunca se crea una URL pública. La duración exacta de retención debe seguir la política legal aprobada; por defecto solo se retiene la salida estructurada mínima necesaria para que el productor la revise.
- **Límites verificables.** Un presupuesto mensual en centavos USD y límites por usuario/módulo se verifican y reservan atómicamente en MySQL antes de invocar al proveedor. No existe valor productivo hasta aprobarlo en G6. Se registra costo estimado y costo reportado por proveedor cuando esté disponible. Si falta una reserva estimable o se alcanza un límite, el adaptador no se llama; la UI explica que la asistencia está temporalmente agotada y mantiene disponible el editor manual.
- **Validación de salida.** Laravel exige un esquema específico por operación, longitudes máximas y valores permitidos. Una salida mal formada, un timeout, una respuesta vacía o una falla del proveedor se convierte en estado fallido recuperable; no se copia parcialmente al producto. Nunca se aceptan precio, stock, disponibilidad, teléfono, dirección u origen de la salida del modelo.

## Interfaz del proveedor y contratos

El contrato común acepta un `AIRequestContext` con `request_id`, `producer_id`, `operation`, idioma `es-PA`, límites de salida y solo los campos mínimos de entrada. Devuelve una unión discriminada por operación y metadatos de versión del proveedor/modelo, duración y costo reportado opcional. No recibe sesión, cookies, correo, teléfono, nombre legal, ubicación exacta ni permisos del usuario.

- **Imagen:** entrada de una foto de la publicación actual; salida de hasta tres candidatos con etiqueta, categoría activa opcional, confianza decimal entre `0` y `1` y una frase de incertidumbre. No afirma procedencia, frescura, calidad, certificación, cantidad ni precio.
- **Descripción:** entrada de notas escritas por el productor y, si lo solicita, título/categoría elegidos; salida de un borrador de hasta 1.000 caracteres. El prompt restringe afirmaciones a hechos presentes en la entrada; la UI identifica el texto como sugerencia editable.
- **Voz:** entrada de un audio elegido por el productor; salida de texto de transcripción de hasta 2.000 caracteres, marcada como transcripción por confirmar. No genera texto nuevo ni publica automáticamente.

Los tipos/respuestas específicos se versionan en el código. Las salidas del proveedor se tratan como datos no confiables y se escapan como texto; nunca se interpretan como HTML, instrucciones del sistema o comandos.

## API propuesta

- `GET /api/me/ai/capabilities`: devuelve únicamente operaciones habilitadas para la cuenta y límites visibles; no devuelve secretos, instrucciones internas ni costo del proveedor.
- `POST /api/me/ai/requests`: sesión Sanctum, CSRF y permiso `ai.use`; acepta `operation` (`identify_image`, `draft_description`, `transcribe_audio`) y el payload mínimo de cada operación. Responde `202` con UUID opaco, operación y estado inicial. Limita tamaño y valida que una publicación asociada pertenezca al productor.
- `GET /api/me/ai/requests/{uuid}`: solo el productor dueño puede leer estado y salida validada.
- `POST /api/me/ai/requests/{uuid}/decision`: dueño marca la salida `applied` o `dismissed`; la operación solo registra la decisión. El frontend copia campos permitidos al formulario local y el productor los puede editar antes del guardado normal del borrador.
- `GET /api/admin/ai/usage`: permiso `ai.view`; devuelve agregados de consumo, fallos, latencia y solicitudes por operación/periodo, sin prompt, archivo, salida ni identificador del productor.
- `PUT /api/admin/ai/policy`: solo Superadmin con permiso `ai.manage`; cambia módulos habilitados, topes y límites de uso. No puede activar si el interruptor maestro de entorno está apagado. Todo cambio requiere motivo y auditoría.

Respuestas: `401/403` para sesión o permiso, `404` para UUID ajeno o inexistente, `413/422` para entrada no admitida, `429` para límite de frecuencia, `503` para módulo apagado/cupo agotado/proveedor no disponible. Los errores no revelan configuración o disponibilidad de una cuenta ajena. Ninguna ruta es pública.

## Datos y retención

Tablas opcionales nuevas, instaladas únicamente al adoptar fase 7:

- `ai_requests`: UUID, productor, operación, estado, timestamps, versión de esquema y resultado de decisión. No almacena prompt íntegro, correo/teléfono, ni el binario de entrada.
- `ai_results`: solicitud, JSON validado mínimo, versión de proveedor/modelo, timestamps y `applied`/`dismissed`. Borrado/retención sujeto a G1/G6; el diseño permite purga por fecha.
- `ai_usage`: agregados/costo estimado y reportado, operación, periodo y estado de reserva/liquidación; no incluye entrada ni salida textual.
- `ai_policies`: una fila de política global con flags, topes en centavos USD, límites y actor/fecha de modificación; todos los cambios guardan razón en `audit_logs`. Las credenciales no se almacenan en esta tabla.

La retención concreta de salidas y agregados no se fija antes de G1/G6. El proveedor seleccionado no puede usar archivos ni texto para entrenamiento del modelo salvo una decisión institucional, consentimiento y contrato explícitos. Antes de cada uso la UI debe identificar el dato enviado y el propósito; no se transmite información ajena a la operación solicitada.

## Interacción React

En el formulario de producto aparece una sección secundaria “Ayudarme con IA (opcional)” solo cuando capacidades del servidor la habilitan. El control manual y “Guardar borrador” siempre permanecen visibles y utilizables. Cada operación pide una acción explícita; voz/foto no se suben en segundo plano. La salida se presenta separada con acciones “Usar sugerencia” y “Descartar”. Al usarla, el texto entra en campos editables del formulario, nunca se guarda directamente. El componente muestra estados de preparación, cola, resultado, sin conexión, límite agotado, error y reintento; conserva selección y campos manuales ante cualquier fallo. Es teclado/lector de pantalla accesible y funciona en móvil.

No se solicitará a la persona aceptar términos genéricos de IA para navegar o publicar manualmente. Un aviso/consentimiento específico precede cada operación externa si así lo exige la política aprobada.

## Administración y operación

`/admin/ia` muestra salud técnica, uso agregado por operación, presupuesto reservado/consumido, errores/latencia y política de flags/límites. Superadmin puede pausar globalmente o por operación y ajustar topes, con motivo y auditoría. No presenta prompts, archivos, transcripciones, descripciones sugeridas ni datos personales. Las credenciales se inyectan desde el gestor de secretos en el runtime; la aplicación nunca las devuelve ni registra.

El worker usa cola separada `ai`, concurrencia limitada, timeout del cliente menor que el timeout del job, reintento máximo definido y backoff. La cola no bloquea OTP, correo, moderación ni publicación. Un comando de mantenimiento elimina cargas temporales expiradas y resultados vencidos conforme a la política aprobada. Alertas operativas cubren errores consecutivos, cola atascada, presupuesto cerca del límite y credencial no válida, con logs correlacionables por UUID opaco.

## Seguridad, degradación y pruebas de aceptación

- Sin flags, proveedor ni secretos, crear/editar/enviar a moderación/buscar/contactar manualmente funciona; la API rechaza asistencia sin hacer llamada externa.
- Solo productor autenticado con permiso y perfil activo puede crear una solicitud; no puede leer/decidir una solicitud de otro usuario ni suministrar un `producer_id` alterno.
- CSRF, throttling por usuario/IP, topes de bytes/duración, validación MIME por contenido, sanitización EXIF y aislamiento privado de archivos se aplican antes del proveedor.
- La concurrencia de requests no puede superar el tope monetario mensual; reservas huérfanas se reconcilian al expirar y fallos no duplican cobros mediante reintentos idempotentes.
- JSON inválido, contenido prohibido, incertidumbre, desconexión, timeout, 429/5xx del proveedor, reinicio del worker y borrado de temporal dejan el producto intacto y permiten continuar manualmente.
- Precio/stock/disponibilidad/origen presentados por el proveedor se rechazan del esquema; ni una salida válida cambia producto, estado ni auditoría de publicación sin acción normal del productor.
- Tests usan `FakeAIProvider` y cola fake; no hacen red. Staging posterior debe probar proveedor real con cuenta/datos sintéticos, costos máximos, borrado, retención, latencia móvil y apagado en caliente.

## Cotización separada y condiciones G6

El paquete se cotiza fuera de fases 0–6 y 8, desglosando: integración de cada operación; interfaz productora y administración; almacenamiento/worker/observabilidad incremental; QA y seguridad; soporte; consumo variable del proveedor por volumen y modalidad; y contingencia. La selección de proveedor exige comparar precio, idioma español de Panamá, modalidades de imagen/audio, residencia y retención de datos, uso para entrenamiento, SLA, límites, DPA y términos. Sin esos datos no se promete un monto de consumo recurrente.

G6 requiere alcance y proveedor elegidos, política/aviso legal, consentimiento, presupuesto máximo mensual y costo máximo estimable por operación, cuotas por productor, evaluación de datos, seguridad y piloto de calidad aprobados. Hasta entonces, no existe ruta habilitada en producción ni dependencia de SDK comercial.

## Fuera de alcance de esta especificación

Se difieren búsqueda semántica, análisis de dashboards, moderación asistida, detección de fraude por modelo, proveedor específico, entrenamiento/fine-tuning, uso de conversaciones del comprador y despliegue de IA productiva. Pueden ser especificaciones separadas tras evidencia y aprobación.
