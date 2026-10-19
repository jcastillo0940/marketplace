function Get-MarketplaceBackupKey([string]$Base64Key) {
    try { $key = [Convert]::FromBase64String($Base64Key) } catch { throw 'La llave de respaldo debe ser Base64 válido.' }
    if ($key.Length -ne 32) { [Array]::Clear($key, 0, $key.Length); throw 'La llave de respaldo debe decodificar exactamente a 32 bytes.' }
    return ,$key
}

function Protect-MarketplaceBackup([string]$InputPath, [string]$OutputPath, [byte[]]$Key) {
    if ($Key.Length -ne 32) { throw 'La llave de respaldo debe tener 32 bytes.' }
    $plain = [System.IO.File]::ReadAllBytes($InputPath)
    $cipher = [byte[]]::new($plain.Length)
    $nonce = [byte[]]::new(12)
    $tag = [byte[]]::new(16)
    $aes = [System.Security.Cryptography.AesGcm]::new($Key, 16)
    try {
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($nonce)
        $aad = [System.Text.Encoding]::UTF8.GetBytes('marketplace-backup-v1')
        $aes.Encrypt($nonce, $plain, $cipher, $tag, $aad)
        $stream = [System.IO.File]::Create($OutputPath)
        try {
            $stream.Write([System.Text.Encoding]::ASCII.GetBytes('SCBK1'))
            $stream.Write($nonce)
            $stream.Write($tag)
            $stream.Write($cipher)
        } finally { $stream.Dispose() }
    } finally {
        [Array]::Clear($plain, 0, $plain.Length)
        [Array]::Clear($cipher, 0, $cipher.Length)
        $aes.Dispose()
    }
}

function Unprotect-MarketplaceBackup([string]$InputPath, [string]$OutputPath, [byte[]]$Key) {
    if ($Key.Length -ne 32) { throw 'La llave de respaldo debe tener 32 bytes.' }
    $packed = [System.IO.File]::ReadAllBytes($InputPath)
    if ($packed.Length -lt 33 -or [System.Text.Encoding]::ASCII.GetString($packed, 0, 5) -ne 'SCBK1') { [Array]::Clear($packed, 0, $packed.Length); throw 'El archivo no usa el formato de backup cifrado SCBK1.' }
    $nonce = [byte[]]::new(12); [Array]::Copy($packed, 5, $nonce, 0, 12)
    $tag = [byte[]]::new(16); [Array]::Copy($packed, 17, $tag, 0, 16)
    $cipher = [byte[]]::new($packed.Length - 33); [Array]::Copy($packed, 33, $cipher, 0, $cipher.Length)
    $plain = [byte[]]::new($cipher.Length)
    $aes = [System.Security.Cryptography.AesGcm]::new($Key, 16)
    try {
        $aad = [System.Text.Encoding]::UTF8.GetBytes('marketplace-backup-v1')
        $aes.Decrypt($nonce, $cipher, $tag, $plain, $aad)
        [System.IO.File]::WriteAllBytes($OutputPath, $plain)
    } finally {
        [Array]::Clear($packed, 0, $packed.Length); [Array]::Clear($cipher, 0, $cipher.Length); [Array]::Clear($plain, 0, $plain.Length)
        $aes.Dispose()
    }
}
