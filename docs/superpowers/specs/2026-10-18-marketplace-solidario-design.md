# Marketplace Solidario Super Carnes — Diseño

**Estado:** propuesta para revisión de producto  
**Fecha:** 18 de octubre de 2026  
**Fuente de requisitos:** `C:/Users/Usuario/Downloads/Roadmap_Marketplace_Solidario_Super_Carnes_Agencia.md`  

## Propósito

Crear una plataforma web móvil primero que dé visibilidad a productores, artesanos y pequeños emprendedores afectados por el sismo en Azuero. Los compradores pueden descubrir ofertas y contactar al productor directamente por WhatsApp o teléfono. La plataforma no procesa pagos ni administra entregas y deja claro que Super Carnes no certifica la compraventa.

La experiencia esencial debe estar completa sin IA. Productores escriben y cargan todo manualmente; cualquier asistente futuro será separado, optativo, reversible y presupuestado de forma independiente.

## Alcance del primer incremento ejecutable

El roadmap describe una iniciativa de varias fases. La primera entrega de software se enfocará en un núcleo vertical que pueda evolucionar hacia el MVP completo:

- Sitio público con inicio, catálogo, búsqueda léxica, filtros de categoría/provincia/distrito/corregimiento, detalle, perfil público, información del proyecto, seguridad y formulario de denuncia.
- Registro e ingreso de productores, perfiles, publicaciones manuales con hasta cinco imágenes, estados y panel de control.
- Administración con colas de moderación, productores, denuncias, registro asistido, categorías/ubicaciones y métricas operativas básicas.
- Roles separados para productor, operador de apoyo, moderador, analista, administrador y superadministrador; autorización comprobada en el servidor para cada recurso y acción.
- Contacto externo por WhatsApp/teléfono. Registrar clics como eventos de contacto, nunca como ventas.
- Trust & Safety base: verificación de contacto por adaptador configurable, límites de frecuencia, reportes, auditoría lógica, historial de moderación, manejo privado de evidencias y advertencias de seguridad.
- Infraestructura Docker reproducible, migraciones, datos de demostración y guía de instalación.

El trabajo se ejecutará por fases 0–8 del roadmap. La primera implementación local no equivale a autorización de lanzamiento en producción: dominios, cuentas externas, proveedor SMS, revisión legal, políticas institucionales, dotación de moderadores y go/no-go permanecen sujetos a los hitos indicados en el roadmap.

## Arquitectura

- **Frontend:** React + TypeScript, aplicación adaptable para sitio público y portales privados. Se usa una SPA con prerender/SSR evaluable para que las páginas públicas tengan metadatos compartibles; el primer entorno local prioriza flujo de desarrollo y API desacoplada.
- **Backend:** Laravel 13, API REST JSON versionada bajo `/api`, Sanctum para sesiones de navegador y políticas/gates para permisos.
- **Persistencia:** MySQL 8.4, elección explícita del usuario sobre PostgreSQL mencionado como referencia en el documento.
- **Ejecución local:** Docker Compose para frontend, API/PHP, MySQL y Redis. Redis provee colas, caché y coordinación de límites cuando esté disponible; MySQL sigue siendo la fuente autoritativa.
- **Archivos:** interfaz de almacenamiento compatible con S3; almacenamiento local de desarrollo para imágenes públicas derivadas y evidencias privadas no servidas públicamente.
- **IA:** no forma parte del camino crítico, del modelo necesario para publicar ni del presupuesto de infraestructura base. Se añadirá detrás de flags y una interfaz `AIProvider` solamente en una fase aprobada aparte.

## Flujos principales

### Comprador

Visita inicio o catálogo sin cuenta → filtra/busca → abre ficha pública aprobada → lee límites y recomendaciones de seguridad → registra un clic de contacto → abre WhatsApp con mensaje prellenado editable o inicia llamada. Puede enviar una denuncia sin revelar su identidad salvo que decida incluir contacto.

### Productor

Se registra → acepta términos y aviso versionados → verifica control del teléfono por adaptador configurable → completa perfil sin exponer datos privados → crea borrador manual con imágenes y datos de oferta → envía a revisión → recibe aprobado/corrección/rechazo con motivo → publica, pausa, marca agotado o retira su publicación. Solo modifica recursos propios.

### Operación y moderación

El operador crea un registro asistido con consentimiento documentado y autor responsable. El moderador revisa una cola, toma una decisión con motivo, y el sistema registra actor, transición y fecha. Las denuncias tienen estado, prioridad, asignación, evidencia privada, resolución y bitácora. Las acciones importantes son auditables.

## Estados e invariantes del dominio

- Producto: `draft`, `pending`, `changes_requested`, `published`, `paused`, `sold_out`, `rejected`, `suspended`, `withdrawn`.
- Un anuncio aparece en el catálogo público solo si está aprobado y su estado permite disponibilidad pública. Borradores, agotados, suspendidos y retirados no se presentan como disponibles.
- La primera publicación siempre requiere moderación humana. Cambios críticos pueden volver a revisión según política configurable.
- Contacto compartido por varios productores o una comunidad no constituye por sí solo señal de fraude.
- No se exponen documentos, evidencia de afectación, dirección exacta ni evidencia de denuncias.
- El clic de WhatsApp/teléfono es analítica de intención, no una venta confirmada.
- Precio es opcional y soporta monto, “desde” o “consultar”; moneda configurable (B/. / USD).
- Cambiar el teléfono invalida verificación anterior y registra evento.
- Términos y consentimientos guardan versión, fecha y actor.
- Las suspensiones importantes requieren motivo y mecanismo de revisión/apelación.

## Esquema lógico inicial

`users`, `roles`, `permissions`, `producer_profiles`, `producer_verifications`, `verification_attempts`, `producer_consents`, `categories`, `locations`, `products`, `product_images`, `product_status_history`, `contact_events`, `search_events`, `reports`, `report_evidence`, `moderation_actions`, `security_events`, `account_restrictions`, `audit_logs`, `notifications`, `system_settings`. Se definen índices para slug, estado, categoría, ubicación, fecha y búsqueda. El DER y el catálogo OpenAPI se mantienen como artefactos entregables.

Las tablas operativas incluyen marcas de tiempo y actor cuando corresponde. Los datos personales, evidencia privada, eventos analíticos y registros de auditoría requieren políticas de acceso y retención distintas, por confirmar institucional y legalmente antes de producción.

## API inicial

- Público: `GET /api/products`, `GET /api/products/{slug}`, `GET /api/producers/{slug}`, `POST /api/contact-events`, `POST /api/reports`, catálogos y ubicaciones.
- Cuenta: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/verify`, `GET /api/me`, `GET/POST/PATCH /api/me/products`, perfil y métricas propias.
- Administración: productores, publicaciones, aprobaciones/rechazos/correcciones, denuncias, registro asistido, catálogos, usuarios, analítica y seguridad según permiso.
- Respuestas paginadas con filtros validados; errores JSON estables; validación y autorización del lado servidor; límites de frecuencia en endpoints públicos y de autenticación.

## Seguridad y privacidad

Sanctum con cookies seguras para la aplicación web, protección CSRF, contraseñas con hash moderno, rate limiting, policies por recurso, validación de carga MIME/tamaño/cantidad, nombres aleatorios y separación de evidencia privada. MFA administrativo se implementará antes del piloto de producción; el entorno local debe permitir desarrollar la interfaz del flujo, pero no simular una garantía de producción.

Los secretos no se versionan. Docker incluye `.env.example`, health checks y volúmenes nombrados. Se proporcionan comandos de migración/seed y respaldo/restauración documentados; cifrado y recuperación operativa en producción requieren entorno y claves aprobados.

## Diseño de experiencia

### Audiencia y contexto

Audiencia panameña, en especial compradores móviles y productores con conectividad variable en Azuero. Interfaz en español panameño neutral, moneda B/. y USD, números y fechas es-PA, zonas administrativas panameñas como datos configurables. No publicar ubicación exacta.

### Dirección visual

- **Paleta:** verde caña oscuro `#173B2E`, verde hoja `#2F6B49`, marfil papel `#F4F0E5`, amarillo maíz `#E7B83F`, carbón `#222A25`, blanco `#FFFEFA`.
- **Tipografía:** Fraunces para titulares editoriales breves; Atkinson Hyperlegible para texto y controles. Fallbacks del sistema para redes lentas.
- **Composición:** catálogo como mercado comunitario contemporáneo, con navegación compacta, bloques de búsqueda prominentes, tarjetas de producto limpias y la ubicación presentada como provincia/distrito. No usar patrones de checkout ni simular tienda de Super Carnes.
- **Elemento distintivo:** franja de “cosecha local” inspirada en etiquetas de cajas agrícolas, usada para conectar categorías y fichas sin convertir la interfaz en una campaña publicitaria.
- **Accesibilidad:** objetivo WCAG 2.2 AA; controles semánticos, foco visible, errores asociados, estados de carga/vacío/error y reducción de movimiento.

## Fuera de alcance hasta autorización por fase

Checkout, carrito, pagos, comisiones, facturas, logística, chat, aplicación nativa, geolocalización precisa, ERP, garantía de producto/venta, moderación automática sancionadora e IA. El directorio avanzado, exportaciones y reportes XLSX pertenecen a optimización posterior. Funciones de antifraude avanzado pertenecen a Trust & Safety avanzado.

## Decisiones pendientes para producción

El roadmap identifica y conserva como puertas de gobernanza: elegibilidad, propietario de producto, identidad/dominio, políticas y textos con revisión panameña, proveedor SMS/WhatsApp, cuentas cloud, presupuesto recurrente, retención, moderación y soporte, criterios de disponibilidad/rendimiento, SLA, aceptación UAT y autorización de lanzamiento. Las decisiones no se inventarán en código ni se presentarán como legalmente aprobadas.

## Criterio de éxito

En un ambiente limpio, Docker levanta los servicios y una persona puede descubrir una publicación aprobada, mientras un productor crea y envía una publicación enteramente manual, un moderador la decide con motivo, y la publicación aprobada aparece en el catálogo con contacto externo registrado y los datos sensibles ocultos. Ningún paso requiere proveedor ni servicio de IA.
