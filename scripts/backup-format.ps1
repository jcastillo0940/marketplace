function Assert-SafeBackupRelativePath([string]$RelativePath) {
    $normalized = $RelativePath.Replace('\', '/')
    $segments = @($normalized.Split('/'))
    $trailingSegmentCount = 0
    if ($normalized.EndsWith('/')) { $trailingSegmentCount = 1 }
    $segmentCount = $segments.Count - $trailingSegmentCount
    $invalidSegment = $false
    for ($index = 0; $index -lt $segmentCount; $index++) {
        if ($segments[$index] -in @('', '.', '..')) { $invalidSegment = $true; break }
    }
    if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized.StartsWith('/') -or $normalized.Contains(':') -or $invalidSegment -or $normalized -notmatch '^[A-Za-z0-9._/-]+$') {
        throw "Ruta no válida en el respaldo: $RelativePath"
    }

    return $normalized
}

function Read-ValidatedMarketplaceBackup([string]$BackupPath, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($BackupPath)
    try {
        $archivePaths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in $archive.Entries) {
            $path = if ($entry.FullName -eq 'private-media/.backup-empty') {
                'private-media/.backup-empty'
            } else {
                Assert-SafeBackupRelativePath $entry.FullName
            }
            $isDirectory = $path.EndsWith('/')
            $filePath = if ($isDirectory) { $path.TrimEnd('/') } else { $path }
            if ($filePath -notin @('database.sql', 'manifest.json', 'redis-dump.rdb') -and -not $filePath.StartsWith('private-media/') -and -not ($filePath -eq 'private-media' -and $isDirectory)) {
                throw "Entrada inesperada en el respaldo: $($entry.FullName)"
            }
            if ($filePath -eq 'private-media' -and -not $isDirectory) {
                throw 'private-media debe ser un directorio.'
            }
            if (($entry.ExternalAttributes -band 0xF000) -eq 0xA000) {
                throw "No se permiten enlaces simbólicos en el respaldo: $($entry.FullName)"
            }
            if (-not $isDirectory -and -not $archivePaths.Add($filePath)) {
                throw "Entrada duplicada en el respaldo: $filePath"
            }
        }
    } finally {
        $archive.Dispose()
    }

    Expand-Archive -LiteralPath $BackupPath -DestinationPath $Destination
    $sql = Join-Path $Destination 'database.sql'
    $media = Join-Path $Destination 'private-media'
    $manifestPath = Join-Path $Destination 'manifest.json'
    if (-not (Test-Path -LiteralPath $sql -PathType Leaf) -or (Get-Item -LiteralPath $sql).Length -lt 32) { throw 'El dump SQL está vacío o incompleto.' }
    if (-not (Test-Path -LiteralPath $media -PathType Container)) { throw 'El respaldo no contiene el directorio private-media.' }
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Falta manifest.json.' }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.database_file -ne 'database.sql' -or $manifest.private_media_directory -ne 'private-media') { throw 'El manifiesto no coincide con el formato de respaldo esperado.' }
    $manifestFiles = @($manifest.files)
    if (@($manifestFiles | Where-Object { $_.path -eq 'database.sql' }).Count -ne 1) { throw 'El manifiesto debe incluir exactamente un checksum para database.sql.' }
    if ($manifestFiles.Count -ne $(if ($manifest.redis_included) { 2 } else { 1 })) { throw 'El manifiesto contiene archivos no esperados o incompletos.' }
    foreach ($file in $manifestFiles) {
        if ($file.path -notin @('database.sql', 'redis-dump.rdb') -or $file.sha256 -notmatch '^[A-Fa-f0-9]{64}$') { throw "Entrada o checksum no válido en el manifiesto: $($file.path)" }
        if (($file.path -eq 'redis-dump.rdb') -ne [bool]$manifest.redis_included) { throw 'redis_included no coincide con los archivos declarados.' }
        $filePath = Join-Path $Destination $file.path
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf) -or (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -ne $file.sha256) { throw "Falta o no coincide el checksum de $($file.path)." }
    }
    $actualRootFiles = (Get-ChildItem -LiteralPath $Destination -File | ForEach-Object Name | Sort-Object) -join "`n"
    $expectedRootNames = @('database.sql', 'manifest.json')
    if ($manifest.redis_included) { $expectedRootNames += 'redis-dump.rdb' }
    $expectedRootFiles = ($expectedRootNames | Sort-Object) -join "`n"
    if ($actualRootFiles -ne $expectedRootFiles) { throw 'Los archivos del respaldo no coinciden exactamente con el manifiesto.' }

    $manifestMedia = @{}
    foreach ($file in @($manifest.private_media_files)) {
        $relativePath = Assert-SafeBackupRelativePath ([string]$file.path)
        if ($relativePath -eq '.backup-empty' -or $file.sha256 -notmatch '^[A-Fa-f0-9]{64}$' -or $manifestMedia.ContainsKey($relativePath)) { throw "Entrada de medio duplicada o no válida: $relativePath" }
        $manifestMedia[$relativePath] = $file.sha256
        $filePath = Join-Path $media ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf) -or (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -ne $file.sha256) { throw "Falta o no coincide un medio privado: $relativePath" }
    }

    $actualMedia = @(Get-ChildItem -LiteralPath $media -File -Recurse | Where-Object { $_.Name -ne '.backup-empty' } | ForEach-Object {
        [System.IO.Path]::GetRelativePath($media, $_.FullName).Replace('\', '/')
    })
    $actualMediaSet = (@($actualMedia | Sort-Object) -join "`n")
    $manifestMediaSet = (@($manifestMedia.Keys | Sort-Object) -join "`n")
    if ($actualMediaSet -ne $manifestMediaSet) { throw 'El manifiesto no cubre exactamente los medios privados del respaldo.' }
    $emptyMarker = Test-Path -LiteralPath (Join-Path $media '.backup-empty') -PathType Leaf
    if ([bool]$manifest.private_media_empty -ne ($manifestMedia.Count -eq 0) -or [bool]$manifest.private_media_empty -ne $emptyMarker) { throw 'El estado de medios vacíos no coincide con el manifiesto.' }
    if ($emptyMarker -and (Get-Content -LiteralPath (Join-Path $media '.backup-empty') -Raw) -ne 'empty') { throw 'El marcador de medios vacíos no tiene el contenido esperado.' }

    return $manifest
}
