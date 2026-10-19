$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-crypto.ps1')
$root = Join-Path ([System.IO.Path]::GetTempPath()) ('marketplace-backup-crypto-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null

function Assert-Rejected([scriptblock]$Action, [string]$Name) {
    try { & $Action; throw "Expected rejection: $Name" }
    catch { if ($_.Exception.Message -eq "Expected rejection: $Name") { throw } }
}

$key = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($key)
$plain = Join-Path $root 'backup.zip'
$cipher = Join-Path $root 'backup.zip.enc'
$restored = Join-Path $root 'restored.zip'
$tampered = Join-Path $root 'tampered.enc'
try {
    $source = [byte[]]::new(4096)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($source)
    [System.IO.File]::WriteAllBytes($plain, $source)
    Protect-MarketplaceBackup $plain $cipher $key
    Unprotect-MarketplaceBackup $cipher $restored $key
    if ((Get-FileHash $plain -Algorithm SHA256).Hash -ne (Get-FileHash $restored -Algorithm SHA256).Hash) { throw 'Backup decrypt round-trip did not preserve contents.' }
    Write-Output 'PASS authenticated backup encryption round-trip'

    $packed = [System.IO.File]::ReadAllBytes($cipher)
    $packed[$packed.Length - 1] = $packed[$packed.Length - 1] -bxor 1
    [System.IO.File]::WriteAllBytes($tampered, $packed)
    Assert-Rejected { Unprotect-MarketplaceBackup $tampered (Join-Path $root 'tampered.zip') $key } 'tampered ciphertext authentication'
    Write-Output 'PASS rejects ciphertext tampering'

    try { Get-MarketplaceBackupKey 'YWJj' | Out-Null; throw 'Expected invalid key length rejection.' }
    catch { if ($_.Exception.Message -eq 'Expected invalid key length rejection.') { throw }; Write-Output 'PASS rejects wrong key size' }
} finally {
    [Array]::Clear($key, 0, $key.Length)
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
