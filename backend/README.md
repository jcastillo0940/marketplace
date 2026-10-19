# API del Marketplace Solidario

API REST del marketplace con Laravel 13, Sanctum y MySQL 8.4. El frontend React y los servicios de desarrollo se coordinan desde el Compose raíz; esta carpeta no es un stack independiente.

## Desarrollo local

Desde la raíz del repositorio, migra MySQL en un contenedor puntual antes de arrancar la API para que sus sondeos de readiness no coincidan con cambios de esquema. Para una base local nueva:

```powershell
docker compose up -d --wait mysql redis
docker compose run --rm --no-deps api sh -c "composer install --no-interaction && php docker/wait-for-database.php && php artisan migrate --seed"
docker compose up --build -d api web
docker compose logs -f api
```

La API local atiende en `http://localhost:8000`. `GET /api/health` comprueba liveness y `GET /api/ready` comprueba base de datos, cache, Redis y disponibilidad del catálogo de referencia. Para una base existente que deba conservarse, respalda los datos, detén temporalmente API y web, migra en el contenedor puntual y reinicia la aplicación:

```powershell
docker compose stop api web
docker compose run --rm --no-deps api sh -c "composer install --no-interaction && php docker/wait-for-database.php && php artisan migrate --force"
docker compose up -d api web
```

Ejecuta `--seed` solo al inicializar una base nueva o cuando el cambio de referencia esté aprobado. No inicies API y web junto con migraciones de MySQL: las consultas de readiness pueden interferir con DDL en curso.

No ejecutes `migrate:fresh`, `db:wipe` ni `docker compose down -v` contra un volumen que contenga información que debas conservar. Consulta [Inicio local](../README.md#inicio-local) y [Respaldo local](../README.md#respaldo-local) antes de operar sobre datos existentes.

## Contratos y módulos

- Rutas API: `routes/api.php`.
- Contrato OpenAPI: [docs/api/openapi.yaml](../docs/api/openapi.yaml).
- Esquema de datos: [docs/data/erd.mmd](../docs/data/erd.mmd).
- Flujos: catálogo público y contacto; registro y autoservicio del productor; moderación, apelaciones y Trust & Safety; administración y auditoría.
- Las publicaciones se completan manualmente. No se requiere proveedor ni credencial de IA.

La autenticación de navegador usa cookies de sesión de Sanctum y CSRF. En producción, las rutas administrativas requieren MFA y permisos de servidor. Las evidencias de denuncia y las fotografías privadas se entregan por endpoints autorizados; no publiques el almacenamiento privado.

## Verificación y producción

La suite backend está configurada para SQLite en memoria. La guía de ejecución aislada está en el [README raíz](../README.md#desarrollo-y-verificación). No dirijas PHPUnit a una base local persistente.

Para despliegue, imágenes y preflight de Compose, sigue [DEPLOYMENT.md](../DEPLOYMENT.md). El Compose raíz es para desarrollo; no publiques su servidor PHP integrado en Internet.
