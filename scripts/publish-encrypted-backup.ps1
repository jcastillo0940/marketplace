param(
    [Parameter(Mandatory = $true)]
    [string]$Backup,
    [Parameter(Mandatory = $true)]
    [string]$Bucket,
    [Parameter(Mandatory = $true)]
    [string]$Prefix,
    [string]$Region = 'us-east-1',
    [string]$EndpointUrl,
    [string]$Sse = 'AES256'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-crypto.ps1')
$backupPath = [System.IO.Path]::GetFullPath($Backup)
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { throw "No existe el respaldo: $backupPath" }
if ($Sse -notin @('AES256', 'aws:kms')) { throw 'SSE debe ser AES256 o aws:kms.' }
if ([string]::IsNullOrWhiteSpace($Bucket) -or $Bucket -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$') { throw 'El bucket no tiene un nombre válido.' }
$normalizedPrefix = $Prefix.Trim('/')
if ([string]::IsNullOrWhiteSpace($normalizedPrefix) -or $normalizedPrefix -match '(^|/)\.\.?(/|$)' -or $normalizedPrefix -notmatch '^[A-Za-z0-9._/-]+$') { throw 'El prefijo debe ser una ruta relativa segura.' }
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ENCRYPTION_KEY)) { throw 'Define BACKUP_ENCRYPTION_KEY desde el gestor de secretos.' }
$key = Get-MarketplaceBackupKey $env:BACKUP_ENCRYPTION_KEY

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('marketplace-backup-publish-' + [Guid]::NewGuid().ToString('N'))
$cipherPath = Join-Path $stage 'backup.zip.enc'
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    Protect-MarketplaceBackup $backupPath $cipherPath $key

    $cipherHash = (Get-FileHash -LiteralPath $cipherPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $keyId = if ([string]::IsNullOrWhiteSpace($env:BACKUP_ENCRYPTION_KEY_ID)) { 'primary' } else { $env:BACKUP_ENCRYPTION_KEY_ID }
    if ($keyId -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'BACKUP_ENCRYPTION_KEY_ID debe ser un identificador corto seguro.' }
    $objectKey = "$normalizedPrefix/$(Split-Path -Leaf $backupPath).enc"
    $awsArgs = @('s3api', 'put-object', '--bucket', $Bucket, '--key', $objectKey, '--body', $cipherPath, '--server-side-encryption', $Sse, '--metadata', "sha256=$cipherHash,key-id=$keyId", '--region', $Region, '--output', 'json')
    if (-not [string]::IsNullOrWhiteSpace($EndpointUrl)) { $awsArgs += @('--endpoint-url', $EndpointUrl) }
    $putOutput = & aws @awsArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "La carga cifrada al bucket falló: $($putOutput -join ' ')" }

    $headArgs = @('s3api', 'head-object', '--bucket', $Bucket, '--key', $objectKey, '--region', $Region, '--output', 'json')
    if (-not [string]::IsNullOrWhiteSpace($EndpointUrl)) { $headArgs += @('--endpoint-url', $EndpointUrl) }
    $headOutput = & aws @headArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "No se pudo verificar el objeto subido: $($headOutput -join ' ')" }
    $head = ($headOutput -join "`n") | ConvertFrom-Json
    if ([long]$head.ContentLength -ne (Get-Item -LiteralPath $cipherPath).Length -or $head.ServerSideEncryption -ne $Sse -or $head.Metadata.sha256 -ne $cipherHash -or $head.Metadata.'key-id' -ne $keyId) {
        throw 'El objeto remoto no coincide con el tamaño, hash o cifrado esperado.'
    }
    Write-Output "Respaldo cifrado publicado y verificado: s3://$Bucket/$objectKey (sha256 $cipherHash; SSE $Sse; llave $keyId)."
} finally {
    [Array]::Clear($key, 0, $key.Length)
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
