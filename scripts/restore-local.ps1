param(
    [Parameter(Mandatory = $true)]
    [string]$Backup,
    [switch]$ConfirmReplaceData
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-format.ps1')
if (-not $ConfirmReplaceData) {
    throw 'Restaurar reemplaza la base activa y los medios locales. Revisa el respaldo y vuelve a ejecutar con -ConfirmReplaceData.'
}

$project = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $project 'docker-compose.yml'
$backupPath = [System.IO.Path]::GetFullPath($Backup)
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { throw "No existe el archivo de respaldo: $backupPath" }
$restoreStage = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
$remoteSql = '/tmp/marketplace-restore-' + [Guid]::NewGuid().ToString('N') + '.sql'
New-Item -ItemType Directory -Path $restoreStage | Out-Null

try {
    $manifest = Read-ValidatedMarketplaceBackup -BackupPath $backupPath -Destination $restoreStage
    $sql = Join-Path $restoreStage 'database.sql'
    $media = Join-Path $restoreStage 'private-media'

    Push-Location $project
    try {
        docker compose cp $sql "mysql:$remoteSql"
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el dump al contenedor MySQL.' }
        try {
            $importCommand = 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" "$MYSQL_DATABASE" < ' + $remoteSql
            docker compose exec -T mysql sh -c $importCommand
            if ($LASTEXITCODE -ne 0) { throw 'Falló la importación SQL; la base puede haber quedado parcialmente restaurada.' }

            docker compose exec -T api sh -c 'find /var/www/html/storage/app/private -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el directorio de medios.' }
            if ($manifest.private_media_empty) { Remove-Item -LiteralPath (Join-Path $media '.backup-empty') -Force }
            docker compose cp "$media/." api:/var/www/html/storage/app/private
            if ($LASTEXITCODE -ne 0) { throw 'Falló la copia de los medios al volumen privado.' }
        } finally {
            docker compose exec -T mysql rm -f $remoteSql 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Warning 'No se pudo eliminar el dump temporal del contenedor MySQL; elimínalo tras verificar el nombre único de esta ejecución.' }
        }
        Write-Output 'Base de datos y medios privados restaurados. Verifica /up y el catálogo antes de reabrir el servicio.'
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item -LiteralPath $restoreStage -Recurse -Force -ErrorAction SilentlyContinue
}
