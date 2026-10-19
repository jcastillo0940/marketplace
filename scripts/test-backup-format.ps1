$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-format.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("marketplace-backup-format-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null

function New-TestArchive([string]$Path, [string]$MediaPath = 'images/photo.bin') {
    $source = Join-Path $root ([Guid]::NewGuid().ToString('N'))
    $media = Join-Path $source 'private-media'
    New-Item -ItemType Directory -Path (Join-Path $media (Split-Path $MediaPath -Parent)) -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $source 'database.sql'), ('-- test database dump ' + ('x' * 64)))
    [System.IO.File]::WriteAllBytes((Join-Path $media $MediaPath), [byte[]](1, 2, 3, 4, 5))
    $manifest = [ordered]@{
        database_file = 'database.sql'
        private_media_directory = 'private-media'
        redis_included = $false
        files = @([ordered]@{ path = 'database.sql'; sha256 = (Get-FileHash -LiteralPath (Join-Path $source 'database.sql') -Algorithm SHA256).Hash })
        private_media_files = @([ordered]@{ path = $MediaPath.Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath (Join-Path $media $MediaPath) -Algorithm SHA256).Hash })
        private_media_empty = $false
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $source 'manifest.json') -Encoding utf8
    [System.IO.Compression.ZipFile]::CreateFromDirectory($source, $Path)
    return $source
}

function Assert-Rejected([scriptblock]$Action, [string]$Name) {
    try { & $Action; throw "Expected validation rejection: $Name" }
    catch {
        if ($_.Exception.Message -eq "Expected validation rejection: $Name") { throw }
        Write-Output "PASS rejected $Name"
    }
}

try {
    $validZip = Join-Path $root 'valid.zip'
    $validSource = New-TestArchive $validZip
    $validExtract = Join-Path $root 'valid-extract'
    New-Item -ItemType Directory -Path $validExtract | Out-Null
    $validated = Read-ValidatedMarketplaceBackup -BackupPath $validZip -Destination $validExtract
    if ($validated.private_media_files.Count -ne 1) { throw 'Valid backup inventory was not preserved.' }
    Write-Output 'PASS accepts valid SQL and private-media inventory'

    $tamperedZip = Join-Path $root 'tampered.zip'
    $tamperedSource = Join-Path $root 'tampered-source'
    Copy-Item -LiteralPath $validSource -Destination $tamperedSource -Recurse
    [System.IO.File]::WriteAllBytes((Join-Path $tamperedSource 'private-media/images/photo.bin'), [byte[]](9, 9, 9))
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tamperedSource, $tamperedZip)
    $tamperedExtract = Join-Path $root 'tampered-extract'
    New-Item -ItemType Directory -Path $tamperedExtract | Out-Null
    Assert-Rejected { Read-ValidatedMarketplaceBackup -BackupPath $tamperedZip -Destination $tamperedExtract } 'media checksum mismatch'

    $unsafeZip = Join-Path $root 'unsafe-entry.zip'
    $archive = [System.IO.Compression.ZipFile]::Open($unsafeZip, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $entry = $archive.CreateEntry('../escaped.txt')
        $stream = $entry.Open()
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('must not be extracted')
            $stream.Write($bytes, 0, $bytes.Length)
        } finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
    $unsafeExtract = Join-Path $root 'unsafe-extract'
    New-Item -ItemType Directory -Path $unsafeExtract | Out-Null
    Assert-Rejected { Read-ValidatedMarketplaceBackup -BackupPath $unsafeZip -Destination $unsafeExtract } 'ZIP traversal entry'
    if (Test-Path -LiteralPath (Join-Path $root 'escaped.txt')) { throw 'ZIP traversal wrote outside the extraction directory.' }
    Write-Output 'PASS rejects ZIP traversal before extraction'

    Assert-Rejected { Assert-SafeBackupRelativePath '../outside.txt' } 'parent traversal path'
    Assert-Rejected { Assert-SafeBackupRelativePath 'C:/outside.txt' } 'drive-qualified path'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
