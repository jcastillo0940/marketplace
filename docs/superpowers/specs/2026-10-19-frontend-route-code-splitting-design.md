# Diseño: carga diferida de zonas del marketplace

**Estado:** propuesta para revisión del Product Owner  
**Decisión recibida:** separar rutas públicas, del portal de productor y de administración, y cargar cada grupo al entrar a su zona. Este documento concreta límites de rendimiento y comportamiento para revisar antes de redactar el plan.

## Propósito

Reducir el JavaScript que una persona debe descargar al abrir el marketplace, en particular en teléfonos y redes variables, sin cambiar la experiencia, las URL, los permisos ni las funciones actuales. Hoy `frontend/src/App.tsx` contiene las pantallas de las tres zonas en un módulo y el build reporta una entrada de 504.21 kB minificados (135.47 kB gzip).

El trabajo crea tres límites de carga: zona pública, portal de productor y administración. El grupo privado que corresponda se descarga únicamente cuando la persona navega a una ruta de esa zona. No se introduce IA ni se modifican servicios API.

## Diseño aprobado en principio

- Mantener `BrowserRouter` y las URL actuales.
- Separar las declaraciones y pantallas en tres módulos de rutas cargados con `React.lazy`/`import()` al coincidir con su zona. Cada zona será un grupo coherente; no se crearán decenas de chunks por pantalla.
- Mantener controles, sesión, cliente API, utilidades, navegación pública y estilos compartidos en módulos comunes para evitar implementaciones duplicadas. La extracción conserva el comportamiento y las políticas de acceso actuales.
- La carga diferida es un límite real de descarga. La configuración de `manualChunks` por sí sola no satisface este diseño.
- Renderizar un estado de carga breve y accesible en español, con `role="status"`/`aria-live="polite"`, indicador existente y espacio estable para reducir saltos de contenido. Respetar movimiento reducido.
- Si falla la importación de un chunk, mostrar un error recuperable en español con acción de reintento/recarga y conservar la URL solicitada. No convertir el fallo en una pantalla vacía.

La zona pública comprende inicio, catálogo, fichas, directorio, ayuda, seguridad, información, `/terminos`, `/privacidad`, reportes públicos y acceso/recuperación de cuenta. La zona de productor comprende `/mi-panel`, `/mis-productos*`, `/mi-perfil` y `/verificar`. Administración comprende `/admin*`. La zona se determina por ruta, no por una afirmación de rol del cliente; la autorización del servidor sigue siendo la autoridad.

## Requisitos de comportamiento

1. Todas las rutas actuales, parámetros, alias, comodines y pantallas 404 continúan resolviendo igual, tanto desde navegación interna como al cargar directamente o refrescar una URL profunda.
2. La ruta, los parámetros de búsqueda, orden, filtros, paginación y estado de navegación que hoy se conservan en URL siguen funcionando después de cargar cada grupo.
3. No cambia autenticación, sesión, MFA, permisos, navegación autorizada, API, formularios, accesibilidad, títulos/metadatos ni comportamiento de compartir. El SSR no forma parte de este cambio.
4. Navegar entre páginas dentro de un grupo no vuelve a descargar el grupo. Una persona que visita el público no descarga los grupos de productor o administración; al llegar a ellos, el grupo necesario se descarga una vez y se reutiliza.
5. Los módulos comunes usados por el público no importan estáticamente pantallas ni dependencias exclusivas de las zonas privadas. Los estilos existentes continúan disponibles para evitar parpadeos o cambios visuales al entrar a una ruta.
6. La carga y el error de importación son accesibles por teclado/lector de pantalla, no desplazan la página de forma marcada y mantienen la identidad visual vigente de `DESIGN.md` y el comportamiento de `UX-CONTRACT.md`.

## Presupuesto y evidencia

El build de producción debe mantener la entrada JavaScript inicial del público en **400 kB minificados o menos y 110 kB gzip o menos** (incluyendo runtime y dependencias comunes). La compilación debe emitir chunks separados para productor y administración. La visita inicial a `/` no debe solicitar esos dos chunks, comprobado mediante el manifiesto de Vite y una inspección de red de navegador. Los tamaños se miden con el build de producción, no con modo desarrollo.

Se comparará el resultado contra la línea base registrada arriba y se documentarán los tamaños de entrada y grupos. No se considerará cumplido ocultar una entrada grande mediante fragmentación de vendor si el navegador igualmente descarga todos los chunks al inicio. Si las dependencias compartidas impiden el presupuesto, se identificará el peso y se propondrá otro corte para aprobación antes de quitar o reemplazar funcionalidad.

## Validación propuesta

- Pruebas de rutas con renderizado y navegación real de React Router: una URL por zona, parámetros dinámicos, alias admin, wildcard, refresco simulado e historial.
- Pruebas del fallback accesible y del error de chunk con reintento, incluidas las interacciones de teclado.
- Pruebas de que una entrada pública no importa ni solicita chunks privados y que navegar a productor/admin los solicita una sola vez.
- Suite frontend existente y build de producción; comparar bytes minificados y gzip del manifiesto antes/después.
- Revisión visual de inicio, catálogo, acceso, panel de productor y administración, incluyendo viewport móvil y `prefers-reduced-motion`; comprobar carga, error y recuperación sin cambio de diseño ni salto sustancial.
- Inspección en navegador de rutas profundas y red con caché desactivada para confirmar la secuencia real de descarga.

## Fuera de alcance

- Cambiar rutas, navegación, diseño, tokens, contenido o comportamiento de pantallas.
- Cambiar autenticación, autorización, límites API o estructura de backend.
- Lazy loading individual de imágenes o refactor general de componentes no necesario para crear los tres límites.
- Añadir dependencias de carga, estado, diseño o navegación.
- Cambiar resolución/compresión de imágenes, crear nuevas funcionalidades o incluir IA.

## Riesgos a resolver en el plan

- Las pruebas actuales montan la aplicación completa y pueden necesitar esperar la resolución asíncrona de React `lazy` sin relajar sus aserciones.
- Los componentes comunes que referencian páginas privadas deben moverse o recibir dependencias explícitas para no volver a cargar de forma estática esos módulos.
- En una publicación nueva, una pestaña antigua puede pedir un chunk eliminado. El error recuperable debe explicar cómo recargar y no repetir reintentos infinitos.
- El presupuesto es una condición de aceptación del build final. El plan debe prever cómo medirlo de forma repetible en Windows y revisar el manifiesto/red.

## Decisiones para confirmar en revisión

1. Aceptar los tres grupos y el comportamiento de carga y error descritos.
2. Aceptar como objetivo la entrada pública de máximo 400 kB minificados y 110 kB gzip.
3. Aceptar inspección de red de navegador como evidencia obligatoria de que los dos grupos privados permanecen fuera de la carga pública inicial.
