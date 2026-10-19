param(
    [string]$Destination = (Join-Path (Get-Location) 'backups'),
    [switch]$IncludeRedis
)

$ErrorActionPreference = 'Stop'

$compose = Join-Path (Split-Path -Parent $PSScriptRoot) 'docker-compose.yml'
if (-not (Test-Path -LiteralPath $compose)) { throw "No se encontró Compose en $compose" }
$project = Split-Path -Parent $PSScriptRoot
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupId = [Guid]::NewGuid().ToString('N')
$stage = Join-Path $destinationPath ".marketplace-$stamp-$backupId"
$archivePath = Join-Path $destinationPath "marketplace-$stamp-$backupId.zip"
if (Test-Path -LiteralPath $archivePath) { throw "El respaldo ya existe y no se sobrescribirá: $archivePath" }
$archiveReady = $false

Push-Location $project
try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --no-tablespaces --single-transaction --routines --triggers --user="$MYSQL_USER" "$MYSQL_DATABASE"' | Set-Content -LiteralPath (Join-Path $stage 'database.sql') -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'mysqldump falló; revisa que MySQL esté activo y saludable.' }
    if ((Get-Item -LiteralPath (Join-Path $stage 'database.sql')).Length -lt 32) { throw 'El dump SQL está vacío o incompleto.' }

    docker compose cp api:/var/www/html/storage/app/private (Join-Path $stage 'private-media')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron copiar los medios privados del volumen Docker.' }
    if (-not (Test-Path -LiteralPath (Join-Path $stage 'private-media') -PathType Container)) {
        New-Item -ItemType Directory -Path (Join-Path $stage 'private-media') -Force | Out-Null
    }
    if ($IncludeRedis) {
        docker compose exec -T redis redis-cli --rdb /data/dump.rdb | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo solicitar el snapshot de Redis.' }
        docker compose cp redis:/data/dump.rdb (Join-Path $stage 'redis-dump.rdb')
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el snapshot de Redis.' }
    }

    $files = @([ordered]@{ path = 'database.sql'; sha256 = (Get-FileHash -LiteralPath (Join-Path $stage 'database.sql') -Algorithm SHA256).Hash })
    if (Test-Path -LiteralPath (Join-Path $stage 'redis-dump.rdb')) {
        $files += [ordered]@{ path = 'redis-dump.rdb'; sha256 = (Get-FileHash -LiteralPath (Join-Path $stage 'redis-dump.rdb') -Algorithm SHA256).Hash }
    }
    $mediaFiles = @(Get-ChildItem -LiteralPath (Join-Path $stage 'private-media') -File -Recurse | ForEach-Object {
        [ordered]@{ path = [System.IO.Path]::GetRelativePath((Join-Path $stage 'private-media'), $_.FullName).Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    $mediaEmpty = $mediaFiles.Count -eq 0
    if ($mediaEmpty) {
        Set-Content -LiteralPath (Join-Path $stage 'private-media/.backup-empty') -Value 'empty' -NoNewline -Encoding ascii
    }

    $manifest = [ordered]@{
        created_at_utc = [DateTime]::UtcNow.ToString('o')
        database_file = 'database.sql'
        private_media_directory = 'private-media'
        redis_included = [bool]$IncludeRedis
        files = $files
        private_media_files = $mediaFiles
        private_media_empty = $mediaEmpty
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'manifest.json') -Encoding utf8
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archivePath -CompressionLevel Optimal
    if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf) -or (Get-Item -LiteralPath $archivePath).Length -lt 128) {
        throw 'El archivo ZIP no se creó correctamente o está incompleto.'
    }
    Remove-Item -LiteralPath $stage -Recurse -Force
    if (Test-Path -LiteralPath $stage) { throw 'No se pudo limpiar el directorio temporal del respaldo.' }
    $archiveReady = $true
    Write-Output "Respaldo creado: $archivePath"
} finally {
    if (Test-Path -LiteralPath $stage -PathType Container) {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not $archiveReady -and (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
        Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}
