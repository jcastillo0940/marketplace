param(
    [Parameter(Mandatory = $true)]
    [string]$Backup
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-format.ps1')
$project = Split-Path -Parent $PSScriptRoot
$backupPath = [System.IO.Path]::GetFullPath($Backup)
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { throw "No existe el archivo de respaldo: $backupPath" }
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("marketplace-restore-drill-" + [Guid]::NewGuid().ToString('N'))
$database = 'restore_drill_' + [Guid]::NewGuid().ToString('N')
$drillId = [Guid]::NewGuid().ToString('N')
$restoreVolume = "marketplace-restore-drill-$drillId"
$restoreContainer = "marketplace-restore-drill-$drillId"
New-Item -ItemType Directory -Path $stage | Out-Null
$createdDatabase = $false
$createdVolume = $false
$createdContainer = $false

try {
    $manifest = Read-ValidatedMarketplaceBackup -BackupPath $backupPath -Destination $stage
    $sql = Join-Path $stage 'database.sql'
    $media = Join-Path $stage 'private-media'

    Push-Location $project
    try {
        $createCommand = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root -e "CREATE DATABASE ' + $database + '"'
        docker compose exec -T mysql sh -c $createCommand
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el esquema temporal con el administrador del MySQL local.' }
        $createdDatabase = $true
        docker compose cp $sql mysql:/tmp/marketplace-restore-drill.sql
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el dump al contenedor MySQL.' }
        $restoreCommand = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root ' + $database + ' < /tmp/marketplace-restore-drill.sql'
        docker compose exec -T mysql sh -c $restoreCommand
        if ($LASTEXITCODE -ne 0) { throw 'El dump no pudo restaurarse en el esquema temporal.' }
        $countSql = 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE(); SELECT COUNT(*) FROM migrations'
        $countCommand = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root --database=' + $database + ' -e "' + $countSql + '"'
        $counts = docker compose exec -T mysql sh -c $countCommand
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron consultar las tablas restauradas.' }
        $values = @($counts | ForEach-Object { [int]($_.Trim()) })
        if ($values.Count -lt 2 -or $values[0] -lt 1 -or $values[1] -lt 1) { throw 'La restauración temporal no contiene tablas y migraciones esperadas.' }

        $apiImage = docker compose images -q api | Select-Object -First 1
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$apiImage)) { throw 'No se pudo resolver la imagen del API para el ensayo de medios.' }
        docker volume create --label 'com.marketplace.restore-drill=true' $restoreVolume | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el volumen Docker temporal de medios.' }
        $createdVolume = $true
        docker create --name $restoreContainer --volume "${restoreVolume}:/restore" --entrypoint sh $apiImage -c 'sleep 600' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el contenedor temporal que monta el volumen de ensayo.' }
        $createdContainer = $true
        docker start $restoreContainer | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el contenedor temporal de medios.' }
        docker cp "$media/." "${restoreContainer}:/restore/"
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restaurar los medios al volumen Docker temporal.' }
        foreach ($file in @($manifest.private_media_files)) {
            $relativePath = Assert-SafeBackupRelativePath ([string]$file.path)
            $restoredPath = "/restore/$relativePath"
            $checksumOutput = docker exec $restoreContainer sha256sum -- $restoredPath
            if ($LASTEXITCODE -ne 0) { throw "No se pudo leer un archivo privado restaurado: $relativePath" }
            $restoredChecksum = ([string]($checksumOutput | Select-Object -First 1)).Trim() -split '\s+' | Select-Object -First 1
            if ($restoredChecksum -ne $file.sha256) { throw "El checksum del medio restaurado no coincide: $relativePath" }
        }
        $restoredMediaCount = @($manifest.private_media_files).Count
        $actualMediaCount = docker exec $restoreContainer sh -c 'find /restore -type f ! -name .backup-empty | wc -l'
        if ($LASTEXITCODE -ne 0 -or [int](([string]$actualMediaCount).Trim()) -ne $restoredMediaCount) { throw 'La cantidad de archivos del directorio privado restaurado no coincide con el manifiesto.' }

        Write-Output "Ensayo correcto: $($values[0]) tablas y $($values[1]) migraciones restauradas en esquema temporal; $restoredMediaCount archivos privados copiados a un volumen Docker temporal y verificados por SHA-256. Se eliminarán el esquema, contenedor y volumen de ensayo; no se modificó la base ni el volumen activo."
    } finally {
        if ($createdDatabase) {
            $dropCommand = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root -e "DROP DATABASE IF EXISTS ' + $database + '"'
            docker compose exec -T mysql sh -c $dropCommand
            if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo eliminar el esquema temporal $database; elimínalo manualmente después de revisar su nombre." }
        }
        docker compose exec -T mysql rm -f /tmp/marketplace-restore-drill.sql 2>$null | Out-Null
        if ($createdContainer) {
            docker rm -f $restoreContainer | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo eliminar el contenedor temporal $restoreContainer." }
        }
        if ($createdVolume) {
            docker volume rm $restoreVolume | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo eliminar el volumen temporal $restoreVolume; inspecciónalo antes de borrarlo." }
        }
        Pop-Location
    }
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
