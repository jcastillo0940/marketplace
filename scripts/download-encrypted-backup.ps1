param(
    [Parameter(Mandatory = $true)]
    [string]$Bucket,
    [Parameter(Mandatory = $true)]
    [string]$ObjectKey,
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [string]$Region = 'us-east-1',
    [string]$EndpointUrl
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-crypto.ps1')
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ENCRYPTION_KEY)) { throw 'Define BACKUP_ENCRYPTION_KEY desde el gestor de secretos.' }
$key = Get-MarketplaceBackupKey $env:BACKUP_ENCRYPTION_KEY
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$parent = Split-Path -Parent $destinationPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'Crea previamente la carpeta de destino con acceso restringido.' }
if (Test-Path -LiteralPath $destinationPath) { [Array]::Clear($key, 0, $key.Length); throw 'El destino ya existe y no se sobrescribirá.' }
if ([string]::IsNullOrWhiteSpace($Bucket) -or $Bucket -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' -or $ObjectKey -match '(^|/)\.\.?(/|$)' -or $ObjectKey -notmatch '^[A-Za-z0-9._/-]+\.zip\.enc$') { [Array]::Clear($key, 0, $key.Length); throw 'Bucket u object key no válidos.' }
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('marketplace-backup-download-' + [Guid]::NewGuid().ToString('N'))
$cipherPath = Join-Path $stage 'backup.enc'
New-Item -ItemType Directory -Path $stage | Out-Null
$downloadComplete = $false
try {
    $headArgs = @('s3api', 'head-object', '--bucket', $Bucket, '--key', $ObjectKey, '--region', $Region, '--output', 'json')
    $getArgs = @('s3api', 'get-object', '--bucket', $Bucket, '--key', $ObjectKey, '--region', $Region, '--output', 'json', $cipherPath)
    if (-not [string]::IsNullOrWhiteSpace($EndpointUrl)) { $headArgs += @('--endpoint-url', $EndpointUrl); $getArgs += @('--endpoint-url', $EndpointUrl) }
    $headOutput = & aws @headArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "No se pudo verificar el objeto remoto: $($headOutput -join ' ')" }
    $head = ($headOutput -join "`n") | ConvertFrom-Json
    if ($head.ServerSideEncryption -notin @('AES256', 'aws:kms') -or $head.Metadata.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'El objeto no tiene SSE y metadatos de integridad requeridos.' }
    $getOutput = & aws @getArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar el respaldo: $($getOutput -join ' ')" }
    $cipherHash = (Get-FileHash -LiteralPath $cipherPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ((Get-Item -LiteralPath $cipherPath).Length -ne [long]$head.ContentLength -or $cipherHash -ne $head.Metadata.sha256) { throw 'El archivo descargado no coincide con tamaño/hash del objeto remoto.' }
    Unprotect-MarketplaceBackup $cipherPath $destinationPath $key
    $downloadComplete = $true
    Write-Output "Respaldo descargado, autenticado y descifrado: $destinationPath (key-id $($head.Metadata.'key-id')). Valida el ZIP con restore-local.ps1 antes de cualquier restauración."
} finally {
    [Array]::Clear($key, 0, $key.Length)
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    if (-not $downloadComplete -and (Test-Path -LiteralPath $destinationPath -PathType Leaf)) { Remove-Item -LiteralPath $destinationPath -Force -ErrorAction SilentlyContinue }
}
