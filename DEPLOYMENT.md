# Preparación del piloto y despliegue

## Perfil de ejecución

`docker compose up` es el entorno local de desarrollo: expone Vite en `5173`, PHP en `8000`, MySQL en `3307` y Redis. Usa `APP_ENV=local`, habilita los mensajes de depuración y puede devolver un código fijo de verificación únicamente si `CONTACT_VERIFICATION_DEV_CODE` está configurado. No publiques estos contenedores en Internet.

El API separa `GET /api/health` (liveness del proceso PHP) de `GET /api/ready` (readiness de MySQL, cache, Redis y consultas de catálogos). Si falla una dependencia o consulta necesaria, responde `503` con `status: not_ready` sin exponer detalles ni credenciales; si la infraestructura y el esquema responden pero faltan categorías activas o la referencia mínima de Azuero (7 distritos y al menos 49/81 corregimientos activos en Herrera/Los Santos), responde `200` con `setup.reference_data: needs_seed`. El Compose de desarrollo usa readiness para decidir cuándo iniciar el frontend y reiniciar un API que no puede atender tráfico.

En `docker-compose.production.yml`, el healthcheck del API comprueba que PHP-FPM acepte conexiones y el del frontend consulta `/api/ready` a través de Nginx y exige que el cuerpo JSON incluya `"status":"ready"`; así la página SPA de fallback no puede dar un falso positivo HTTP 200. Esto confirma que Laravel y MySQL, cache y Redis atienden solicitudes. Antes del go/no-go, consulta también `/api/ready` a través de la URL pública del frontend y exige `status: ready` y `setup.reference_data: ready`. El valor `needs_seed` significa que faltan categorías activas o la referencia mínima de Azuero: siete distritos y al menos 49 corregimientos en Herrera y 81 en Los Santos, aunque las dependencias técnicas estén disponibles.

## Requisitos previos al piloto

Usa `docs/uat/plan-piloto.md` para registrar UAT-01–UAT-14 del roadmap, UAT-15–26 (apelaciones, métricas, suspensión, declaración de afectación, pantallas públicas, catálogos, contenido institucional, gestión de usuarios, métricas operativas y jerarquía de ubicaciones, según sus aprobaciones) y el acta de salida. Las brechas por fase, riesgos abiertos y sus dueños propuestos están en `docs/operations/registro-riesgos-y-fases.md`. Una prueba local no equivale a aceptación firmada ni autorización de producción.

- Aprobar política de privacidad, términos, tiempos de retención y procedimiento para solicitudes de titulares.
- Definir responsable de moderación y Trust & Safety, turnos de atención, escala de incidentes y razones normalizadas.
- Acordar los vencimientos de atención por prioridad. Compose expone `REPORT_SLA_URGENT_HOURS`, `REPORT_SLA_HIGH_HOURS`, `REPORT_SLA_NORMAL_HOURS` y `REPORT_SLA_LOW_HOURS`; los valores iniciales son 4, 24, 72 y 168 horas. Revisar estos valores por zona horaria, turnos y capacidad operativa antes del piloto.
- Acordar la vigencia pública de las ofertas. `LISTING_TTL_DAYS` controla cuántos días desde su publicación se muestran las ofertas; el valor inicial es 90 y `0` desactiva la expiración. El productor puede renovar una oferta vencida, con fecha e historial auditados. Confirmar el periodo con Operaciones antes del piloto.
- Configurar `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM_NUMBER` desde el gestor de secretos. Producción fija el proveedor OTP en Twilio y el contenedor rechaza cualquier otra configuración al arrancar. La API invalida el OTP si falla la entrega; comprobar con el proveedor costos, cobertura en Panamá, límites, remitente y monitoreo. El modo `fake` solo se permite en `local`/`testing`; los códigos se guardan como HMAC y los logs no incluyen teléfono ni OTP.
- Configurar SMTP transaccional con `MAIL_HOST`, `MAIL_PORT`, `MAIL_SCHEME`, `MAIL_USERNAME`, `MAIL_PASSWORD` y un remitente verificado en `MAIL_FROM_ADDRESS` (opcionalmente `MAIL_FROM_NAME`). Producción fija `MAIL_MAILER=smtp` y Compose exige host, usuario, contraseña y remitente. El enlace de recuperación apunta a `FRONTEND_URL`; validar recepción, expiración y uso único en staging. El entorno local usa el mailer `log` para desarrollo.
- Configurar `MEDIA_FILESYSTEM_DISK=s3` y credenciales del bucket privado compatible con S3 para imágenes y evidencias. El disco debe permanecer privado; las descargas pasan por endpoints con autorización. Producción valida al arrancar que S3 tenga clave, secreto, región y bucket; `local` también está disponible para un único nodo y usa el volumen `backend_private_media`. En desarrollo Compose los medios se persisten en ese volumen.
- Activar TLS, dominio de SPA/API, CORS y cookies `Secure`, `HttpOnly`, `SameSite` según el diseño final.
- Crear secretos únicos para APP_KEY, base de datos y credenciales de servicios; no usar los valores locales del ejemplo.
- Configurar copias cifradas fuera del host y retención aprobada; respaldar de forma coordinada MySQL y medios privados, y probar restauración periódica. Los scripts `backup-local.ps1` y `restore-local.ps1` solo cubren el entorno Compose local y no reemplazan el servicio de backup/PITR del proveedor administrado. Configurar alarmas de disponibilidad, espacio y colas Redis.
- Validar un respaldo local sin reemplazar la base activa con `./scripts/test-restore-local.ps1 -Backup <ruta-al-zip>`. El ensayo valida rutas del ZIP, SHA-256 e inventario completo de SQL/medios, importa el dump al esquema temporal `restore_drill_*` y restaura los medios en un volumen Docker desechable etiquetado `com.marketplace.restore-drill`; elimina el esquema, contenedor auxiliar y volumen al finalizar. Usa el administrador MySQL local; si se interrumpe el proceso, inspecciona únicamente esquemas `restore_drill_*`, contenedores/volúmenes `marketplace-restore-drill-*` y elimina solo los recursos identificados como propios del ensayo. Este chequeo no ensaya restauración productiva, rollback de aplicación, backups off-host ni RPO/RTO.
- Completar revisión de seguridad externa, prueba de carga con objetivo acordado, accesibilidad y piloto supervisado con productores.
- Acordar criterios de salida y rollback, responsables y ventana de despliegue.

## Perfil ejecutable de producción

`docker-compose.production.yml` define imágenes separadas del entorno local: PHP-FPM no-root para Laravel, frontend compilado servido por Nginx con proxy interno para `/api`, `/sanctum` y vistas previas `/compartir`, MySQL y Redis con contraseña. La API y el frontend usan filesystem de solo lectura y `no-new-privileges`; medios privados persisten en un volumen local, pero se recomienda S3 privado para despliegues con réplicas. Los puertos de base de datos y Redis no se publican en el host. MySQL tiene un periodo de arranque de tres minutos para inicializar un volumen vacío; la API no inicia hasta que MySQL y Redis estén healthy.

Nginx conserva el fallback SPA para rutas profundas, entrega `index.html` sin caché y asigna un año de caché inmutable a los bundles versionados de `/assets/`. Esto permite actualizar el HTML en cada publicación sin perder la caché segura de archivos fingerprinted. Los demás archivos públicos mantienen el comportamiento predeterminado.

El proxy Nginx de producción admite solicitudes de hasta 28 MB, alineado con `post_max_size` de PHP, para soportar las cargas multipart documentadas de hasta cinco fotografías. PHP limita cada archivo a 6 MB y el servidor valida el máximo funcional de 5 MB; el límite de transporte deja margen para el resto de campos multipart.

El archivo exige `APP_KEY`, URL HTTPS, usuario y claves de MySQL/Redis, origen SPA, hostnames stateful y las tres credenciales de Twilio. Define esos valores desde el gestor de secretos del entorno (no copies secretos a `.env` versionado). El entrypoint verifica `APP_ENV=production`, `APP_DEBUG=false`, HTTPS en ambas URL, una `APP_KEY` válida de 32 bytes y configuración OTP Twilio antes de iniciar PHP-FPM. `MEDIA_FILESYSTEM_DISK=s3` requiere clave, secreto, región y bucket privado; `local` usa el volumen privado y es apropiado solo para un nodo. Termina TLS en un balanceador/proxy administrado delante del servicio `web`; expón solo ese proxy y permite tráfico hacia MySQL/Redis desde la red privada de contenedores. `DB_HOST`, `DB_PORT`, `REDIS_HOST` y `REDIS_PORT` pueden apuntar a servicios administrados; sus valores predeterminados (`mysql`, `redis`) corresponden a los contenedores incluidos para el smoke test aislado. `REDIS_SCHEME=tls` habilita TLS para Redis administrado (el valor predeterminado local es `tcp`); `REDIS_USERNAME` admite ACL. Para MySQL que requiera una CA propia, incluye `docker-compose.production.managed-db.yml` y define `MYSQL_CA_FILE` con la ruta del certificado; el override lo monta de solo lectura y Laravel verifica la conexión usando esa CA. El Compose productivo separa la red web→FPM y asigna al proxy web `PROXY_WEB_IP` (predeterminado `10.255.250.2`); Laravel confía solo en esa IP por defecto, nunca en todos los proxies. `PROXY_NETWORK_SUBNET`, `PROXY_WEB_IP` y `PROXY_API_IP` permiten escoger un rango e IP libres en el host; mantén ambas direcciones dentro de la subred y no las compartas con otros contenedores. Si hay un balanceador delante de Nginx, añade sus IP/CIDR en `EDGE_PROXY_CIDRS` (por ejemplo `10.20.0.0/16`) y configúralo para sobrescribir/sanitizar `X-Forwarded-For`; el Compose los combina con la IP fija de Nginx. En Compose local la lista queda vacía y se ignoran encabezados reenviados. FPM no publica puertos.

Después de aplicar migraciones y seeders en la base nueva, aprovisiona la cuenta inicial desde una sesión operativa segura. La contraseña se solicita dos veces en una terminal interactiva, no se pasa como argumento ni variable de entorno:

```powershell
docker compose -f docker-compose.production.yml exec -it api php artisan marketplace:provision-super-admin admin@supercarnes.example "Responsable de plataforma"
```

El comando solo crea la primera cuenta `super_admin`, rechaza correos ya existentes y deja un evento de auditoría. Después del primer alta queda deshabilitado para nuevas cuentas; el personal autorizado podrá asignar roles desde el módulo de administración. Al iniciar sesión, el nuevo administrador debe configurar y confirmar MFA antes de acceder a cualquier ruta administrativa.

Validación local sin arrancar servicios ni tocar volúmenes:

```powershell
./scripts/verify-production-compose.ps1
```

Construcción del candidato de release (requiere que los secretos anteriores estén exportados):

```powershell
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml build
```

Antes de iniciar la primera versión, provisiona base de datos y Redis durables fuera de los volúmenes de demostración y demuestra un restore desde el mecanismo de backup aprobado. Configura `DB_HOST`, `DB_PORT`, `REDIS_HOST`, `REDIS_PORT` y sus credenciales para esos servicios administrados; no uses los contenedores `mysql`/`redis` incluidos como almacenes productivos. No arranques `up` para el Compose completo en un host que pueda resolver el proyecto o volumen de demostración.

### Tarea de release: migrar antes de actualizar API

Publica API y web en un registro y usa etiquetas SHA de commit; el flujo resuelve cada etiqueta a un digest antes del despliegue. Un build local sin publicar no permite garantizar un rollback desde otra sesión. Exporta los secretos y variables de conexión desde el gestor de secretos. La tarea no debe iniciar dependencias Compose; MySQL y Redis administrados deben estar disponibles desde la red privada del runner. Confirma el backup/PITR y la ventana aprobada antes de continuar:

```powershell
$compose = @('compose', '-p', 'marketplace-release', '-f', 'docker-compose.production.yml')
if (-not [string]::IsNullOrWhiteSpace($env:MYSQL_CA_FILE)) { $compose += @('-f', 'docker-compose.production.managed-db.yml') }
if ([string]::IsNullOrWhiteSpace($env:PUBLIC_URL) -or ([uri]$env:PUBLIC_URL).Scheme -ne 'https') { throw 'PUBLIC_URL debe ser el origen HTTPS público aprobado.' }
$runningApi = (& docker @compose ps --quiet api | Select-Object -First 1)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el release API actualmente desplegado.' }
$runningWeb = (& docker @compose ps --quiet web | Select-Object -First 1)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el release web actualmente desplegado.' }
if (-not [string]::IsNullOrWhiteSpace([string]$runningApi) -and -not [string]::IsNullOrWhiteSpace([string]$runningWeb)) {
    $apiImageId = (& docker inspect --format '{{.Image}}' ([string]$runningApi).Trim()).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo identificar la imagen API anterior.' }
    $apiDigests = @(& docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' $apiImageId)
    if ($LASTEXITCODE -ne 0 -or $apiDigests.Count -eq 0) { throw 'La API anterior no tiene digest publicado; no se puede garantizar el rollback.' }
    $env:PREVIOUS_API_IMAGE = ([string]$apiDigests[0]).Trim()
    $webImageId = (& docker inspect --format '{{.Image}}' ([string]$runningWeb).Trim()).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo identificar la imagen web anterior.' }
    $webDigests = @(& docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' $webImageId)
    if ($LASTEXITCODE -ne 0 -or $webDigests.Count -eq 0) { throw 'La web anterior no tiene digest publicado; no se puede garantizar el rollback.' }
    $env:PREVIOUS_WEB_IMAGE = ([string]$webDigests[0]).Trim()
} else {
    $env:PREVIOUS_API_IMAGE = ''
    $env:PREVIOUS_WEB_IMAGE = ''
}
$env:API_IMAGE = 'registry.example/marketplace-api:COMMIT_SHA'
$env:WEB_IMAGE = 'registry.example/marketplace-web:COMMIT_SHA'
foreach ($image in @($env:API_IMAGE, $env:WEB_IMAGE)) {
    if ($image -notmatch '(:[0-9a-f]{7,64}|@sha256:[0-9a-f]{64})$') { throw "La imagen del release debe llevar tag SHA inmutable o digest: $image" }
}
if ($env:IMAGES_FROM_CI -ne 'true') { throw 'Publica las imágenes del commit en el registro antes del release; no se admite build local en producción.' }
docker @compose pull api web
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron descargar las imágenes del release.' }
$apiImageId = (& docker image inspect --format '{{.Id}}' $env:API_IMAGE).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo resolver la imagen API descargada.' }
$apiDigests = @(& docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' $apiImageId)
if ($LASTEXITCODE -ne 0 -or $apiDigests.Count -eq 0) { throw 'La imagen API no tiene digest del registro.' }
$env:API_IMAGE = ([string]$apiDigests[0]).Trim()
$webImageId = (& docker image inspect --format '{{.Id}}' $env:WEB_IMAGE).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo resolver la imagen web descargada.' }
$webDigests = @(& docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' $webImageId)
if ($LASTEXITCODE -ne 0 -or $webDigests.Count -eq 0) { throw 'La imagen web no tiene digest del registro.' }
$env:WEB_IMAGE = ([string]$webDigests[0]).Trim()
foreach ($image in @($env:API_IMAGE, $env:WEB_IMAGE, $env:PREVIOUS_API_IMAGE, $env:PREVIOUS_WEB_IMAGE)) {
    if (-not [string]::IsNullOrWhiteSpace($image) -and $image -notmatch '@sha256:[0-9a-f]{64}$') { throw "La imagen resuelta no es un digest inmutable: $image" }
}

docker @compose run --rm --no-deps api sh -c 'php docker/wait-for-database.php && php artisan migrate --force'
if ($LASTEXITCODE -ne 0) { throw 'Falló la tarea de release; detener el despliegue e investigar.' }

docker @compose up -d --no-deps api web
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar API/web; aplicar el plan de rollback aprobado.' }

$readiness = Invoke-RestMethod -Uri "$($env:PUBLIC_URL.TrimEnd('/'))/api/ready" -TimeoutSec 15
if ($readiness.status -ne 'ready' -or $readiness.setup.reference_data -ne 'ready') { throw 'El release no está listo o faltan catálogos de referencia; detener el go/no-go.' }
```

Sustituye `COMMIT_SHA` por el SHA real antes de ejecutar y define `IMAGES_FROM_CI=true` para descargar las imágenes publicadas. Antes de migrar, el bloque resuelve las imágenes nuevas y desplegadas a sus digests de registro, valida el formato `repo@sha256:…` y conserva los digests anteriores en `PREVIOUS_API_IMAGE`/`PREVIOUS_WEB_IMAGE`. Para iniciar el rollback en otra sesión, carga esos digests desde el manifiesto/registro del release. En la primera instalación no habrá imágenes anteriores para revertir. No ejecutes `seed` automáticamente en cada release ni uses `migrate:rollback`, `migrate:fresh` o `down --volumes` como recuperación. Laravel no puede revertir de forma segura todo cambio de esquema con datos activos: diseña migraciones aditivas y compatibles con la versión anterior. Si la migración falla, no actualices API/web; restaura esquema/datos únicamente con el procedimiento PITR aprobado. Si la app falla después de migrar, vuelve a la imagen anterior solo cuando la migración sea compatible; de lo contrario sigue el procedimiento de recuperación de datos y registra el incidente.

Rollback solo de aplicación (ejecutar en una sesión de release con los mismos secretos, conexión administrada y override de CA):

```powershell
$compose = @('compose', '-p', 'marketplace-release', '-f', 'docker-compose.production.yml')
if (-not [string]::IsNullOrWhiteSpace($env:MYSQL_CA_FILE)) { $compose += @('-f', 'docker-compose.production.managed-db.yml') }
if ([string]::IsNullOrWhiteSpace($env:PREVIOUS_API_IMAGE) -or [string]::IsNullOrWhiteSpace($env:PREVIOUS_WEB_IMAGE)) { throw 'Define referencias inmutables de las imágenes anteriores.' }
if ([string]::IsNullOrWhiteSpace($env:PUBLIC_URL) -or ([uri]$env:PUBLIC_URL).Scheme -ne 'https') { throw 'PUBLIC_URL debe ser el origen HTTPS público aprobado.' }
foreach ($image in @($env:PREVIOUS_API_IMAGE, $env:PREVIOUS_WEB_IMAGE)) {
    if ($image -notmatch '@sha256:[0-9a-f]{64}$') { throw "La imagen anterior no tiene digest inmutable: $image" }
}
$env:API_IMAGE = $env:PREVIOUS_API_IMAGE
$env:WEB_IMAGE = $env:PREVIOUS_WEB_IMAGE
docker @compose pull api web
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron obtener las imágenes anteriores; mantener el incidente abierto.' }
docker @compose up -d --no-deps api web
if ($LASTEXITCODE -ne 0) { throw 'Falló el rollback de aplicación; activar recuperación aprobada.' }
$readiness = Invoke-RestMethod -Uri "$($env:PUBLIC_URL.TrimEnd('/'))/api/ready" -TimeoutSec 15
if ($readiness.status -ne 'ready' -or $readiness.setup.reference_data -ne 'ready') { throw 'La versión anterior no recuperó readiness; no cerrar el incidente.' }
```

Este rollback no revierte migraciones ni restaura datos. No lo ejecutes si la versión anterior no es compatible con el esquema actual; usa el plan de recuperación PITR aprobado.

## Ensayo de despliegue

El workflow `.github/workflows/ci.yml` se ejecuta en cada push y pull request: valida Compose, comprueba los gates y construye imágenes de producción aisladas; inicia MySQL/Redis efímeros, espera conexiones PDO TCP, aplica migraciones/seed y prueba healthchecks junto con `/api/ready` real detrás del Nginx de producción y su `/healthz`; el proyecto Compose y sus volúmenes se eliminan al terminar. También verifica el entrypoint con `--no-deps`, incluyendo rechazo de `APP_KEY` inválida y S3 sin credenciales; construye el stack local, aplica migraciones/seed en MySQL efímero, ejecuta Pint, Composer Audit y pruebas backend aisladas en SQLite en memoria, y ejecuta pruebas frontend, build, lint, npm audit y verificación de diseño. CI no despliega ni publica imágenes. Para pruebas locales usa el comando aislado de `README.md`; PHPUnit fuerza SQLite aunque el servicio API esté configurado con MySQL.

1. Construir frontend con `npm ci && npm run build` y servir `dist/` desde un servidor web/CDN con fallback SPA.
   En el host público, enrutar `/sitemap.xml` y `/robots.txt` al servicio Laravel antes del fallback SPA; Vite ya realiza ese proxy durante el desarrollo. Establecer `FRONTEND_URL` al origen canónico del frontend para generar `loc` correctos.
2. Construir imagen API desde `backend/Dockerfile`; publicar con PHP-FPM detrás de Nginx/Caddy o un servidor PHP de producción. El `php -S` configurado en Compose es solo local.
3. Inyectar secretos desde el administrador de secretos del entorno; establecer `APP_ENV=production`, `APP_DEBUG=false`, URL HTTPS, origen SPA y dominios stateful aprobados. Laravel activa `Secure` por defecto para cookies de sesión en producción; Compose desactiva ese atributo únicamente para HTTP local. Mantener `HttpOnly` y `SameSite=Lax` cuando frontend y API compartan el mismo sitio registrable. Si se alojan en sitios distintos, configurar `SameSite=None` junto con `Secure` y validar el flujo CSRF en navegadores compatibles.
4. Usar MySQL administrado con backups/PITR y Redis administrado con credenciales y TLS; separar base de datos de desarrollo.
5. En un contenedor de tarea del mismo release y red privada, ejecutar `php docker/wait-for-database.php && php artisan migrate --force` como paso controlado; el sondeo PDO espera conexiones MySQL TCP aunque el healthcheck del contenedor ya haya pasado. Ejecutar luego `config:cache`, `route:cache` y `view:cache` en la imagen/release.
6. Activar health checks, logging sin PII, métricas, alertas y rollback a imagen y esquema compatibles.
7. No habilitar publicación pública hasta verificar que una cuenta de moderación puede aprobar; una oferta sin revisar debe permanecer privada.

## IA opcional

El núcleo no importa SDK de IA ni llama a proveedores de IA. La futura fase de IA debe añadirse detrás de un proveedor intercambiable y una bandera apagada por defecto, con estimación/cotización separada, límites de uso, consentimiento y revisión humana de toda sugerencia. No debe bloquear crear, editar ni moderar publicaciones si está apagada o indisponible.
