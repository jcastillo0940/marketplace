# Marketplace Solidario Super Carnes

Plataforma de contacto directo para productores y compradores. El catálogo no cobra ni organiza entregas. La publicación y moderación funcionan manualmente; la IA no es requisito para ninguna tarea esencial.

## Requisitos

- Docker Desktop con Docker Compose
- Git

PHP 8.3+, Composer y Node.js 22+ son opcionales si se desea desarrollar fuera de Docker.

## Inicio local

1. Copia `.env.example` como `.env` en la raíz. Los valores incluidos son solo para desarrollo local.
2. Revisa si el proyecto Compose ya tiene una base MySQL con información que debas conservar. El volumen `mysql_data` es persistente y lo comparten los arranques posteriores.
3. Inicia primero las dependencias y espera a que estén saludables: `docker compose up -d --wait mysql redis`.
4. Solo para una base local nueva, después de confirmar que no contiene información que debas conservar, instala dependencias, genera la llave de Laravel y aplica migraciones/seed en un contenedor puntual, antes de iniciar la API: `docker compose run --rm --no-deps api sh -c "composer install --no-interaction && php artisan key:generate && php docker/wait-for-database.php && php artisan migrate --seed"`. Este paso escribe la llave en `backend/.env`; no lo repitas sobre una instalación existente porque cambiarla invalida sesiones y datos cifrados.
5. Inicia la aplicación: `docker compose up --build -d api web`.
6. Abre la interfaz en <http://localhost:5173> y la API en <http://localhost:8000>.

No ejecutes `migrate:fresh`, `db:wipe`, `docker compose down -v` ni `migrate --seed` sobre un volumen existente sin un respaldo verificado y autorización explícita: los volúmenes preservan datos entre sesiones. El seed crea roles, categorías y ubicaciones; no crea cuentas, productores ni publicaciones ficticias. El primer administrador se aprovisiona por separado con el comando interactivo descrito abajo. `/api/ready` separa salud técnica de configuración inicial: `status: ready` confirma DB/cache/Redis y `setup.reference_data: needs_seed` indica que faltan categorías o provincias activas.

Después de migrar y crear los roles iniciales en una base nueva, crea el primer administrador con `docker compose exec -it api php artisan marketplace:provision-super-admin admin@supercarnes.example "Responsable de plataforma"`. El comando solicita y confirma una contraseña segura, rechaza correos existentes o una segunda cuenta superadministradora y registra auditoría. Para migraciones posteriores en una base que debas conservar, respalda primero los datos, detén temporalmente API y web, ejecuta el migrate en un contenedor puntual y vuelve a iniciar la aplicación para evitar solicitudes concurrentes durante cambios de esquema: `docker compose stop api web`, `docker compose run --rm --no-deps api sh -c "composer install --no-interaction && php docker/wait-for-database.php && php artisan migrate --force"`, `docker compose up -d api web`. Para verificar teléfonos en desarrollo, `CONTACT_VERIFICATION_DEV_CODE` activa un código fijo únicamente en el adaptador fake local; no se envían SMS. Déjalo vacío fuera de desarrollo. En producción configura `CONTACT_VERIFICATION_DRIVER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM_NUMBER`; los OTP se almacenan como HMAC y nunca se devuelven en respuestas productivas.

Servicios: React/Vite (`web`), Laravel 13 (`api`), MySQL 8.4 (`mysql`) y Redis (`redis`). La API responde salud en `/up`. Los cambios de puertos y base de datos se configuran en el `.env` local.

## Desarrollo y verificación

- API: `docker compose exec --no-TTY --env APP_ENV=testing --env DB_CONNECTION=sqlite --env DB_DATABASE=:memory: api php artisan test` (usa SQLite en memoria; `phpunit.xml` fuerza el aislamiento para no tocar el MySQL de desarrollo)
- Contrato API: `./scripts/verify-openapi.ps1` valida la sintaxis/estructura YAML y compara las rutas y métodos Laravel con `docs/api/openapi.yaml` sin acceder a datos.
- Formato PHP: `docker compose exec api ./vendor/bin/pint --test`
- Frontend: `docker compose exec web npm run build`
- Configuración Docker sin iniciar servicios: `docker compose config --quiet` (o `docker compose config --services` para listar servicios). La comprobación más amplia `./scripts/verify-compose.ps1` en PowerShell requiere que Compose esté activo: valida servicios, healthchecks y límites de carga del contenedor API.
- Migraciones: `docker compose exec api php artisan migrate`

## Respaldo local

Crear un paquete SQL + medios: `./scripts/backup-local.ps1`. Por defecto se guarda bajo `backups/`, ignorado por Git. Para incluir el snapshot de Redis, añade `-IncludeRedis` (Redis contiene sesiones y colas temporales; no es parte de la fuente principal de datos). Los scripts de restauración validan las rutas del ZIP antes de extraerlo y contrastan los checksums y el inventario completo de medios con el manifiesto. El ZIP local no se cifra y contiene la base y medios privados: mantenlo en almacenamiento con acceso restringido y cifrado antes de transferirlo o conservarlo fuera de un entorno local protegido.

Validar localmente el parser de backups y rechazos de rutas/checksums sin Docker ni base de datos: `./scripts/test-backup-format.ps1`.

Restaurar la base y medios locales reemplaza los datos activos y exige la opción explícita `-ConfirmReplaceData`: `./scripts/restore-local.ps1 -Backup ./backups/marketplace-AAAAmmdd-HHmmss-GUID.zip -ConfirmReplaceData`. Cada respaldo usa un identificador único para evitar colisiones; la restauración valida el contenido y los checksums, independientemente del nombre del archivo. Para un ensayo, usa un proyecto Compose y volúmenes separados, y verifica salud, archivos y publicación antes de considerar válido el respaldo.

Para publicar un respaldo local cifrado fuera del host, genera una llave aleatoria de 32 bytes (por ejemplo, `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`) y guárdala una sola vez en el gestor de secretos bajo `BACKUP_ENCRYPTION_KEY`; asigna una versión no secreta a `BACKUP_ENCRYPTION_KEY_ID`. El runner necesita AWS CLI v2 con credenciales IAM de duración corta. El bucket debe tener bloqueo de acceso público, versionado, cifrado SSE-S3 o SSE-KMS por defecto, y una regla lifecycle aprobada para el prefijo; estos controles y el RPO/RTO/retención son responsabilidad del dueño de la cuenta cloud y no se crean automáticamente:

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<Base64 desde el gestor de secretos>'
$env:BACKUP_ENCRYPTION_KEY_ID = '2026-10-primary'
$backup = (Get-ChildItem ./backups/marketplace-*.zip | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
./scripts/publish-encrypted-backup.ps1 -Backup $backup -Bucket 'supercarnes-backups' -Prefix 'marketplace/production' -Region 'us-east-1' -Sse AES256
```

El ZIP se cifra localmente con AES-256-GCM antes del upload; S3 aplica además SSE y el script verifica tamaño, SHA-256 del ciphertext y metadata con `HeadObject`. Para restore, usa un host aislado con AWS CLI y la misma versión de llave en el gestor de secretos. Descarga a una carpeta temporal cifrada/restringida, valida el ZIP con `test-backup-format.ps1` y restaura solo a un esquema/volumen aislado aprobado:

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<Base64 desde el gestor de secretos>'
./scripts/download-encrypted-backup.ps1 -Bucket 'supercarnes-backups' -ObjectKey 'marketplace/production/marketplace-AAAAmmdd-HHmmss-GUID.zip.enc' -Destination "$env:TEMP/marketplace-restore.zip" -Region 'us-east-1'
./scripts/test-restore-local.ps1 -Backup "$env:TEMP/marketplace-restore.zip"
```

No versionar ni imprimir la llave; restringe IAM a `PutObject`/`GetObject`/`HeadObject` sobre el prefijo y `ListBucket` solo si el flujo operativo lo requiere. Conserva llaves antiguas mientras existan objetos cifrados con ellas y documenta el mapeo de `key-id` en el gestor de secretos. `scripts/test-backup-crypto.ps1` prueba ida y vuelta y rechazo de manipulación sin AWS ni credenciales reales.

## Seguridad y producción

Los valores del `.env.example` no son aptos para producción. Producción requiere secretos únicos, TLS, copias cifradas verificadas, almacenamiento privado de evidencias, proveedor de verificación aprobado, MFA administrativo y aceptación de los hitos G0–G6 del roadmap. No cargues evidencia sensible en el almacenamiento público.

Consulta [DEPLOYMENT.md](DEPLOYMENT.md) para el checklist de piloto y el perfil de despliegue. Docker Compose en esta carpeta es solo desarrollo; el contenedor local usa PHP integrado y Vite, no un servidor listo para producción.

La guía técnica del API Laravel está en [backend/README.md](backend/README.md); describe sus contratos y precauciones de datos desde la raíz del repositorio.

La propuesta técnica y estimación preliminar por fase, con IA y gastos externos separados, está en [docs/operations/propuesta-agencia-por-fases.md](docs/operations/propuesta-agencia-por-fases.md). No es un contrato ni sustituye las aprobaciones G0–G6.

Las guías de operación de la versión actual están en [guía del productor](docs/operations/guia-productor.md) y [moderación y Trust & Safety](docs/operations/guia-moderacion.md). Los procedimientos institucionales que aún requieren aprobación están identificados dentro de cada guía.

El diagnóstico técnico y la recuperación operativa siguen [el runbook de incidentes](docs/operations/runbook-incidentes.md). Debe completarse con responsables, cobertura y canales institucionales aprobados antes del piloto.
