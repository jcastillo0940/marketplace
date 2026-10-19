# Propuesta técnica y estimación por fases

**Proyecto:** Marketplace Solidario Super Carnes  
**Versión:** 0.3 — estimación preliminar para decisión y presupuesto  
**Fecha de referencia:** 19 de octubre de 2026  
**Moneda:** USD  
**Estado:** no vinculante; requiere aprobación de alcance, proveedor y condiciones contractuales.

## Resumen ejecutivo

El repositorio ya contiene una base ejecutable con React/TypeScript, Laravel 13, MySQL 8.4, Redis, Docker Compose, catálogo público, portal de productores, moderación, reportes y documentación de operación. Esta estimación cubre terminar, endurecer y aceptar esa base; no cobra una reconstrucción desde cero. El valor de salida del núcleo sin IA (fases 0–6) se estima en **US$26,880–45,120** de servicios profesionales, distribuido por fase y sujeto a las puertas G0–G6 del roadmap. La fase 8 se cotiza como mantenimiento recurrente posterior, no como desarrollo de una sola vez.

La opción de IA es independiente: **US$9,600–16,000** de implementación preliminar para asistencia de producto, descripciones y transcripción, más consumo del proveedor contratado. Se puede lanzar el núcleo y dejar esta opción sin contratar.

Estos importes son una estimación de planeación hecha con una tarifa blended de cálculo de **US$40/hora (US$320/jornada de 8 horas)**. No existe una razón social, tarifa contractual ni compromiso de entrega asociado a esta conversación. La tarifa se usa solo para hacer explícita la aritmética; referencias públicas de proveedores con servicio en Panamá muestran rangos distintos, por ejemplo US$25–49/h y US$50–99/h en Clutch, y un proveedor panameño publica US$40/h. La tarifa real debe acordarse con la entidad contratante y el proveedor elegido. [Clutch: proveedores de software en Panamá](https://clutch.co/pa/developers) · [Pime Panamá: referencia pública de tarifa](https://pimepanama.com/es)

## Estimación de servicios por fase

Las jornadas son esfuerzo agregado de todos los perfiles, no días calendario. El rango recoge incertidumbre de aceptación, correcciones del estado actual, hallazgos de seguridad y coordinación del piloto.

| Fase | Alcance de cierre | Perfiles principales | Esfuerzo | Servicios estimados |
|---|---|---|---:|---:|
| 0. Descubrimiento y definición | Validar alcance congelado, elegibilidad, owner, contenidos, riesgos, decisiones G0/G1 y backlog priorizado. | PM/negocio (líder), UX/UI, arquitectura/seguridad | 4–6 jornadas | US$1,280–1,920 |
| 1. UX/UI y arquitectura | Revisar prototipo y contratos existentes con Product Owner, cerrar brechas de pantallas, API, datos y accesibilidad. | UX/UI (líder), arquitectura/seguridad, frontend, PM | 4–7 jornadas | US$1,280–2,240 |
| 2. MVP sin IA | Completar integración y recorridos públicos, productor, registro asistido y moderación; preparar staging y corregir brechas de aceptación. | Frontend y backend (líderes), QA, PM | 20–32 jornadas | US$6,400–10,240 |
| 3. Seguridad, QA y piloto | Resolver hallazgos, revisión técnica, QA aislado, UAT-01–14 del roadmap y UAT-15–29 complementarios según decisiones de producto/seguridad y aprobaciones G0/G1, OTP real y piloto de 10–20 productores. Incluye la recuperación MFA manual del personal: solicitud genérica, doble aprobación independiente, auditoría, bloqueo y reinscripción obligatoria; falta validación institucional/UAT. | QA (líder), arquitectura/seguridad, frontend, backend, PM | 18–30 jornadas | US$5,760–9,600 |
| 4. Lanzamiento controlado | Configurar entorno acordado, DNS/TLS, secretos, observabilidad, backup/restore, rollback, capacitación y go/no-go. | DevOps (líder), backend, arquitectura/seguridad, QA | 8–14 jornadas | US$2,560–4,480 |
| 5. Optimización operativa | Afinar búsqueda, directorio, KPIs, accesibilidad, exportación agregada y operación según datos del piloto; separar las rutas pública, productor y administración para que carguen bajo demanda, con entrada pública ≤400 kB minificados y ≤110 kB gzip y comprobación de red. | Frontend y QA (líderes), backend, PM/analítica | 14–24 jornadas | US$4,480–7,680 |
| 6. Trust & Safety avanzado | Afinar señales explicables, expedientes, asignación, SLA, revisión/apelaciones y ejercicios de falsos positivos. | Arquitectura/seguridad y backend (líderes), QA, PM/moderación | 16–28 jornadas | US$5,120–8,960 |
| 7. IA opcional | Solo tras aprobación G6: asistencia opt-in de foto, descripción, voz y módulos priorizados; el trabajo manual permanece disponible y probado. | Backend/IA, frontend, seguridad/privacidad, QA, PM | 30–50 jornadas | US$9,600–16,000 · opción independiente |
| 8. Escalamiento y mantenimiento | Revisión operativa, actualizaciones de seguridad/dependencias, incidentes durante el horario contratado, monitoreo de capacidad y mejoras pequeñas priorizadas. No supone guardia 24/7. Expansión territorial o funciones grandes se estiman aparte. | Backend, DevOps, QA y PM según demanda | 3–6 jornadas al mes | US$960–1,920/mes · servicio recurrente |
| **Núcleo fases 0–6** | **Sin IA; las funciones esenciales se mantienen manuales.** | **Equipo asignado por fase según backlog y dependencias.** | **84–141 jornadas** | **US$26,880–45,120** |

Los plazos calendario dependen de cuántos perfiles se asignen y de las aprobaciones del cliente. Como guía de planificación: **12–18 semanas para fases 0–4**, más **4–8 semanas para fases 5–6**. La fase 7 añadiría **2–4 semanas** luego de G6; la fase 8 es continua y se contrata mes a mes. Esperas de proveedor SMS, decisiones legales, reclutamiento, cambios de alcance o aprobación de producción extienden el calendario y no se convierten en trabajo facturable hasta acordar el cambio.

## Esfuerzo estimado por perfil

| Perfil | Responsabilidad principal | Jornadas fases 0–6 |
|---|---|---:|
| PM / análisis de negocio | Backlog, demostraciones, riesgos, coordinación de decisiones y actas UAT. | 12–18 |
| UX/UI | Revisión de flujos móvil, lenguaje, accesibilidad y consistencia visual del sistema existente. | 3–6 |
| Arquitectura / seguridad | Límites de confianza, revisión de permisos, MFA, privacidad, threat model y diseño de despliegue. | 10–16 |
| Frontend React | Correcciones de flujos, estados, responsive, accesibilidad, analítica operacional y carga diferida por zona. | 13–23 |
| Backend Laravel | API, dominio, autorización, almacenamiento, hardening y señales operativas. | 16–27 |
| QA | Plan y evidencia de integración/UAT, matrices de navegadores, presupuestos de bundle y regresión en entorno aislado. | 19–31 |
| DevOps | Staging/producción, CI/CD, secretos, observabilidad, backups y rollback. | 11–20 |
| Soporte operativo fase 8 | Mantenimiento y capacidad recurrente; en la base se estima una bolsa de 3–6 jornadas mensuales compartidas por backend, DevOps, QA y PM. | 3–6 por mes |
| **Subtotal único fases 0–6 (sin fase 7 ni mantenimiento de fase 8)** |  | **84–141** |

La distribución es una previsión de capacidad; se asignan perfiles por fase según el backlog aprobado. No representa una promesa de que todas las personas trabajen en paralelo. Las jornadas mensuales de fase 8 son recurrentes y no se suman al total único de desarrollo de 84–141 jornadas.

### Escenario: entrega del núcleo y 12 meses de mantenimiento

Con la tarifa de cálculo indicada, el núcleo de fases 0–6 más 12 meses de la bolsa base de fase 8 representa **US$38,400–68,160** en servicios profesionales para completar la entrega y cubrir el primer año operativo desde el lanzamiento. Si se aprueba además la implementación de IA de fase 7, el escenario sería **US$48,000–84,160**, más el consumo/licencia del proveedor IA. Son escenarios de planificación: no incluyen infraestructura, SMS, dominio, almacenamiento, impuestos, pentest independiente ni cambios de alcance. El cliente puede contratar la fase 8 mes a mes y ajustar el nivel de servicio conforme al contrato.

## IA opcional, cotizada por separado

**Paquete de implementación estimado: US$9,600–16,000 (30–50 jornadas).** Este paquete es posterior y optativo; se autoriza únicamente mediante G6 y no forma parte del precio del núcleo.

Incluye definir proveedor y tratamiento de datos; banderas globales y por módulo; interfaz intercambiable `AIProvider`; asistencia opt-in para sugerir identificación/categoría a partir de foto, proponer texto descriptivo y transcribir audio; validación de salida en Laravel; revisión, edición y rechazo por el productor; límites de uso, manejo de errores/timeout y retorno al formulario manual; e instrumentación de consumo y pruebas con IA apagada/no disponible.

No incluye licencias ni consumo de modelos, almacenamiento/retención de fotos o audio enviado a terceros, asesoría legal, ni entrenamiento de modelos. El gasto de proveedor se contratará directamente o se cotizará con el proveedor elegido después de seleccionar modelo, volumen mensual, región y política de retención. Ninguna sugerencia completará precio, cantidad, disponibilidad u origen por cuenta del productor.

### Escenario ilustrativo de consumo (no es selección de proveedor)

Para hacer visible la escala del rubro variable, la tabla muestra un ejemplo con los precios públicos del nivel pagado de Gemini Developer API, consultados el 19 de octubre de 2026. Google publica Gemini 3.5 Flash-Lite a US$0.30 por millón de tokens de entrada (incluye texto e imagen) y US$2.50 por millón de tokens de salida; Gemini 3.5 Transcribe tiene un costo efectivo estimado de aproximadamente US$0.005 por minuto. El precio real depende de tokenización, longitud del texto y cambios de tarifa; verificar antes de contratar. [Precios oficiales de Gemini API](https://ai.google.dev/gemini-api/docs/pricing)

| Operación del ejemplo | Supuesto de uso | Cálculo aproximado por 1,000 operaciones |
|---|---|---:|
| Identificar una foto | 3,000 tokens de entrada por foto y 200 de salida por solicitud | US$1.40 |
| Redactar descripción | 800 tokens de entrada y 400 de salida por solicitud | US$1.24 |
| Transcribir nota de voz | 1 minuto por nota, al costo efectivo publicado aproximado | US$5.00 |
| **Total combinado** | **1,000 de cada operación; 1,000 minutos de audio** | **US$7.64** |

Es un cálculo de referencia del consumo del modelo, no un presupuesto mensual recomendado. No incluye reintentos, solicitudes fallidas que el proveedor facture, impuestos, almacenamiento, egreso, colas/worker, monitoreo ni soporte. Los tokens de imagen son variables según archivo y modelo, por lo que el proveedor y el tamaño máximo deben probarse con una muestra sintética antes de fijar el tope de gasto. La página de precios señala además que el nivel gratuito puede usar los datos para mejorar productos, mientras el nivel pagado indica que no; no usar el nivel gratuito con contenido de productores y revisar contrato, región, retención y términos antes de G6.

## Gastos externos y operación mensual

Estos rubros no están incluidos en servicios profesionales y se pagan según consumo o contrato:

| Rubro | Referencia de presupuesto | Cómo se calcula / pendiente |
|---|---|---|
| SMS OTP | Twilio publica para Panamá US$0.1836 por segmento SMS saliente y números internacionales desde US$1.15/mes; 1,000 segmentos equivalen a US$183.60 más número, cargos de carrier, impuestos y otros cargos aplicables. | Depende de destinos, segmentos, reintentos, disponibilidad/capacidad del remitente y validación con el proveedor. [Tarifas SMS de Twilio para Panamá](https://www.twilio.com/en-us/sms/pricing/pa) |
| Infraestructura Docker/hosting | Pendiente de proveedor, región, redundancia y carga acordada. | Cotizar API, frontend, MySQL administrado, Redis, almacenamiento de objetos, tráfico, monitoreo, logs y backups. AWS cobra según recursos elegidos; usar calculadora al definir arquitectura. [AWS Pricing Calculator](https://calculator.aws/) · [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) |
| Dominio, DNS, TLS y correo transaccional | Pendiente de titularidad y proveedor institucional. | Cotización anual/mensual del proveedor elegido; el dominio debe quedar bajo control de Super Carnes. |
| Almacenamiento y egreso de medios | Pendiente del número/tamaño de fotos y retención aprobada. | Estimar GB almacenados, solicitudes, descargas y transferencia; incluir evidencias privadas y política de respaldo. |
| Soporte fase 8 | US$960–1,920/mes como referencia de 3–6 jornadas mensuales al mismo valor blended. | Bolsa de mantenimiento correctivo/evolutivo con horario, SLA, guardia y exclusiones por definir; no incluye infraestructura ni disponibilidad 24/7. |

Las tarifas de Twilio y nube cambian y pueden sumar cargos de carrier o región; confirmar en el momento de contratar. Los ejemplos son cálculo de consumo, no cotización del proveedor ni garantía de disponibilidad en Panamá.

## Hitos de entrega y aceptación

1. **G0/G1 — alcance y política:** acta de kickoff, propietario, criterios de elegibilidad, textos y política legal/institucional aprobados.
2. **G2/G3 — proveedores y MVP:** staging funcional sin IA; cuenta/cobertura/costo de OTP confirmados; backlog y diseño aprobados.
3. **G4 — seguridad y piloto:** hallazgos de seguridad tratados o aceptados con dueño y fecha; evidencia QA/UAT; piloto controlado y plan de contingencia.
4. **G5 — producción:** backup/restore y rollback demostrados, TLS/secretos/monitoring configurados, responsables de soporte/moderación nombrados y acta go/no-go firmada.
5. **G6 — solo si se desea IA:** aprobación de alcance, privacidad, proveedor, límites de gasto y pruebas de degradación independiente.

La aceptación por fase se basa en los criterios de `docs/uat/plan-piloto.md`, los contratos OpenAPI, las reglas del roadmap y una demostración del flujo. No se facturan como “aprobados” hitos bloqueados por decisiones o servicios que todavía no existen.

## Entregables del roadmap: evidencia y cierre

Esta matriz distingue archivos disponibles en el checkout de entregables que exigen aceptación, configuración institucional o una prueba en un ambiente que aún no existe.

| Entregable solicitado | Evidencia disponible | Estado y cierre requerido |
|---|---|---|
| Código fuente, historial, README e instalación | Raíz (`README.md`), `backend/`, `frontend/`, Docker Compose y plan de implementación. | Código y guía local disponibles en el checkout compartido; falta revisión final, congelar una versión de entrega y acordar licencia/cesión. El checkout tiene cambios sin consolidar, por lo que todavía no es un paquete de release. |
| UX/UI editable, prototipo y sistema de componentes | `DESIGN.md`, `UX-CONTRACT.md`, tokens y pantallas React. | Sistema implementado en código; no hay un prototipo editable Figma ni aprobación formal del Product Owner. Debe estimarse y cerrarse en fase 1. |
| DER, migraciones, API, roles y estados | `docs/data/erd.mmd`, `docs/api/openapi.yaml`, migraciones Laravel, especificación funcional y pruebas de contratos. | Artefactos técnicos disponibles; la verificación local registrada más reciente valida 80 operaciones OpenAPI frente a 79 rutas API de Laravel (más el endpoint de CSRF de Sanctum). Falta congelar contratos y obtener aprobación de negocio. |
| Docker, configuración, CI/CD y rollback | `docker-compose.yml`, `docker-compose.production.yml`, `.env.example`, `.github/workflows/ci.yml`, `DEPLOYMENT.md` y scripts de respaldo/restauración. | Desarrollo local y workflow CI definidos; imágenes de producción y smoke test aislado pasaron con MySQL 8.4, migración/seed, healthchecks API/web, readiness a través de Nginx y ruta SPA. El ensayo local completo más reciente restauró 32 tablas, 14 migraciones y 10 medios privados, verificó SHA-256 y limpió recursos temporales (92,6 s). Falta ejecutar CI hospedado, restauración fuera del host y rollback de una versión en staging. |
| Staging, producción, DNS/TLS, monitoreo y respaldos | Compose de producción, health/readiness, runbook y procedimiento de backup/restore. | No hay ambientes ni dominio bajo control de Super Carnes. No se han configurado secretos institucionales, respaldos cifrados off-host, retención, RPO/RTO, alertas ni rollback real; depende de G2/G4/G5 y de DevOps del cliente. |
| Evidencia UAT, seguridad, accesibilidad, dispositivos y rendimiento | `docs/uat/plan-piloto.md`, matriz de riesgos y suites automatizadas. La verificación local más reciente registrada (19-10-2026) incluye backend 130 pruebas/915 aserciones, React 93 pruebas, Pint para los seis archivos PHP modificados, build TypeScript/Vite correcto, verificación de diseño sin errores, auditoría Premium estricta sin hallazgos y OpenAPI 80 operaciones frente a 79 rutas API. El build aún reporta una entrada inicial de 504.21 kB minificados (135.47 kB gzip); la separación de rutas está propuesta, no implementada. El smoke test Docker de producción/MySQL 8.4 y la revisión de diseño se registran por separado, con sus límites en el plan UAT. | Evidencia de ingeniería disponible; UAT-01–29 no está aceptado en staging, no se reclutaron 10–20 productores, no existe pentest independiente ni medición representativa de WCAG/rendimiento/baja conectividad. Las cifras locales no sustituyen pruebas del usuario ni aceptación institucional. |
| Guías de productor, moderación y soporte técnico | `docs/operations/guia-productor.md`, `guia-moderacion.md`, `runbook-incidentes.md`, `admin-mfa.md` y README. | Borradores técnicos disponibles. Faltan nombres y suplentes, horarios/SLA aprobados, contactos institucionales, capacitación y acta de transferencia operativa. |
| Incidencias conocidas, riesgos y credenciales | `docs/operations/registro-riesgos-y-fases.md`; el repositorio excluye secretos de producción. | Riesgos y dependencias trazados. Las credenciales no se incluyen en Git; el cliente debe proporcionar y recibirlas por su gestor/canal seguro cuando existan cuentas institucionales. |
| Cotización separada por fase, perfiles y costos opcionales | Tablas de esfuerzo 0–8, perfiles, tarifa de cálculo y gastos externos de este documento. | Estimación preliminar no vinculante. El núcleo sin IA, implementación IA opcional y soporte recurrente fase 8 tienen importes separados; falta cerrar alcance, tarifa contractual, proveedor SMS, hosting, almacenamiento, impuestos y SLA para una oferta firmable. |

## Supuestos, exclusiones y condiciones

- Se conserva el stack solicitado: Docker, MySQL 8.4, Laravel 13 y React/TypeScript. No se añade checkout, pago, comisión, logística ni chat interno.
- El trabajo comienza desde el repositorio actual y respeta sus datos; ningún paso requiere borrar el volumen local compartido.
- La IA está desactivada por defecto y la plataforma se acepta primero con recorrido manual completo.
- Los importes no incluyen impuestos aplicables, costos de viaje, licencias de proveedor, hosting, mensajería, dominio, asesoría legal ni compras de equipos.
- El cliente provee decisiones G0–G6, personas para UAT, contenido legal aprobado, cuenta de SMS, entorno de staging/producción y accesos por canal seguro.
- La revisión de seguridad incluida es de ingeniería y QA del alcance; una auditoría/pentest independiente se contratará y cotizará aparte.
- Cambios fuera del alcance se estiman y aprueban por separado antes de ejecutarse. Precio fijo contractual requiere cierre de G0/G1 y aceptación de backlog de fase.
- La propiedad intelectual, garantía, soporte, retención de datos, SLA y forma de pago deben quedar en contrato con la entidad que preste el servicio.

## Base de estimación consultada

- La tarifa de cálculo de US$40/h se escogió como supuesto explícito y coincide con una tarifa pública declarada por un proveedor local; no se afirma que sea una tarifa promedio ni una tarifa autorizada por Super Carnes. [Pime Panamá](https://pimepanama.com/es)
- Para contexto comparativo, el directorio Clutch lista proveedores que atienden Panamá en rangos distintos (entre ellos US$25–49/h y US$50–99/h), con mínimos de proyecto variables. Es una referencia comercial de mercado, no un estudio salarial ni garantía de precio. [Clutch](https://clutch.co/pa/developers)
- La estimación de SMS usa la tabla publicada por Twilio para Panamá, revisada el 19 de octubre de 2026. [Twilio](https://www.twilio.com/en-us/sms/pricing/pa)
- El costo de nube queda pendiente de calculadora porque no se han aprobado proveedor, región, tráfico, disponibilidad objetivo, retención ni plan de backups. [AWS Pricing Calculator](https://calculator.aws/)
