param(
    [string]$ComposeFile = "docker-compose.production.yml"
)

$ErrorActionPreference = 'Stop'
$composePath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $ComposeFile))
if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) {
    throw "Production Compose file not found: $composePath"
}
$projectRoot = Split-Path -Parent $composePath
$managedDbComposePath = Join-Path $projectRoot 'docker-compose.production.managed-db.yml'
$nginxConfigPath = Join-Path $projectRoot 'frontend/nginx.production.conf'
$phpConfigPath = Join-Path $projectRoot 'backend/docker/php.ini'
if (-not (Test-Path -LiteralPath $nginxConfigPath -PathType Leaf) -or -not (Test-Path -LiteralPath $phpConfigPath -PathType Leaf)) {
    throw 'Production upload configuration is missing from the Nginx or PHP runtime.'
}
$nginxConfig = Get-Content -LiteralPath $nginxConfigPath -Raw
$phpConfig = Get-Content -LiteralPath $phpConfigPath -Raw
if ($nginxConfig -notmatch '(?m)^\s*client_max_body_size\s+28m;\s*$') { throw 'Production Nginx must allow the documented 28 MB upload request.' }
if ($phpConfig -notmatch '(?im)^\s*post_max_size\s*=\s*28M\s*$' -or $phpConfig -notmatch '(?im)^\s*upload_max_filesize\s*=\s*6M\s*$' -or $phpConfig -notmatch '(?im)^\s*max_file_uploads\s*=\s*5\s*$') {
    throw 'PHP upload limits must support five files up to 5 MB each within a 28 MB request.'
}

function Invoke-ComposeConfig {
    param([switch]$AllowMissingSecrets, [switch]$ReturnConfig, [switch]$ManagedDbOverride)

    $arguments = @('compose', '-f', $composePath, 'config')
    if ($ManagedDbOverride) {
        if (-not (Test-Path -LiteralPath $managedDbComposePath -PathType Leaf)) { throw 'Managed database Compose override is missing.' }
        $arguments = @('compose', '-f', $composePath, '-f', $managedDbComposePath, 'config')
    }
    if ($ReturnConfig) { $arguments += @('--format', 'json') } else { $arguments += '--quiet' }
    $output = & docker @arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($AllowMissingSecrets) {
        return @{ ExitCode = $exitCode; Output = ($output -join [Environment]::NewLine) }
    }
    if ($exitCode -ne 0) {
        throw "Production Compose configuration is invalid: $($output -join [Environment]::NewLine)"
    }
    if ($ReturnConfig) { return @{ ExitCode = $exitCode; Output = ($output -join [Environment]::NewLine) }
    }
}

$missing = Invoke-ComposeConfig -AllowMissingSecrets
if ($missing.ExitCode -eq 0) {
    throw 'Production Compose unexpectedly accepts an environment without required production secrets.'
}
if ($missing.Output -notmatch 'APP_KEY|REDIS_PASSWORD') {
    throw "Production Compose failed for an unexpected reason: $($missing.Output)"
}

$placeholderValues = @{
    API_IMAGE = 'registry.example/marketplace-api:deadbeef0'
    WEB_IMAGE = 'registry.example/marketplace-web:deadbeef0'
    APP_KEY = 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    APP_URL = 'https://marketplace.example.invalid'
    FRONTEND_URL = 'https://marketplace.example.invalid'
    MAIL_HOST = 'smtp.example.invalid'
    MAIL_USERNAME = 'ci-smtp-user'
    MAIL_PASSWORD = 'ci-smtp-password'
    MAIL_FROM_ADDRESS = 'no-reply@example.invalid'
    SANCTUM_STATEFUL_DOMAINS = 'marketplace.example.invalid'
    TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
    TWILIO_AUTH_TOKEN = 'placeholder-twilio-token'
    TWILIO_FROM_NUMBER = '+15005550006'
    REDIS_PASSWORD = 'placeholder-redis-password'
    DB_DATABASE = 'marketplace'
    DB_USERNAME = 'marketplace'
    DB_PASSWORD = 'placeholder-database-password'
    MYSQL_ATTR_SSL_CA = '/run/secrets/mysql-ca.pem'
    MYSQL_CA_FILE = 'C:/certificates/mysql-ca.pem'
    REDIS_SCHEME = 'tls'
    REDIS_USERNAME = 'marketplace-app'
    MYSQL_ROOT_PASSWORD = 'placeholder-root-password'
    MEDIA_FILESYSTEM_DISK = 's3'
    AWS_ACCESS_KEY_ID = 'placeholder-access-key'
    AWS_SECRET_ACCESS_KEY = 'placeholder-secret-key'
    AWS_DEFAULT_REGION = 'us-east-1'
    AWS_BUCKET = 'marketplace-private-test'
    PROXY_NETWORK_SUBNET = '10.254.100.0/29'
    PROXY_WEB_IP = '10.254.100.2'
    PROXY_API_IP = '10.254.100.3'
    EDGE_PROXY_CIDRS = '10.20.0.0/16'
}

function ConvertTo-NormalizedString {
    param([object]$Value)
    if ($null -eq $Value) { return '' }
    return ([string]$Value).ToLowerInvariant()
}

function Get-ComposeEnvironmentValue {
    param([object]$Environment, [string]$Name)
    $property = $Environment.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

$previous = @{}
try {
    foreach ($entry in $placeholderValues.GetEnumerator()) {
        $previous[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    $validated = Invoke-ComposeConfig -ReturnConfig
    $config = $validated.Output | ConvertFrom-Json

    $api = $config.services.api
    $web = $config.services.web
    foreach ($image in @([string]$api.image, [string]$web.image)) {
        if ($image -notmatch '(:[0-9a-f]{7,64}|@sha256:[0-9a-f]{64})$') { throw "API and web images must use a commit SHA tag or registry digest: $image" }
    }
    if ($api.image -ne $placeholderValues.API_IMAGE -or $web.image -ne $placeholderValues.WEB_IMAGE) { throw 'API and web must accept explicit immutable release image references.' }
    $apiProxyNetwork = $api.networks.PSObject.Properties['proxy'].Value
    $webProxyNetwork = $web.networks.PSObject.Properties['proxy'].Value
    $proxyNetwork = $config.networks.proxy.ipam.config | Select-Object -First 1
    if ($null -eq $apiProxyNetwork -or $apiProxyNetwork.ipv4_address -ne $placeholderValues.PROXY_API_IP -or $null -eq $webProxyNetwork -or $webProxyNetwork.ipv4_address -ne $placeholderValues.PROXY_WEB_IP -or $null -eq $proxyNetwork -or $proxyNetwork.subnet -ne $placeholderValues.PROXY_NETWORK_SUBNET) {
        throw 'API and web must use the configured isolated proxy subnet and addresses.'
    }
    if ($null -eq $api.networks.PSObject.Properties['private'] -or $null -ne $web.networks.PSObject.Properties['private']) {
        throw 'Only API may join both networks; web must not share the private database network.'
    }
    $trustedProxies = [string](Get-ComposeEnvironmentValue $api.environment 'TRUSTED_PROXIES')
    if ($trustedProxies -notmatch ('(^|,)\s*' + [regex]::Escape($placeholderValues.PROXY_WEB_IP) + '\s*(,|$)')) { throw 'API must trust the configured web proxy address and no wildcard proxy range.' }
    if ($trustedProxies -notmatch [regex]::Escape($placeholderValues.EDGE_PROXY_CIDRS)) { throw 'API must preserve explicitly configured edge proxy CIDRs.' }
    if ((Get-ComposeEnvironmentValue $api.environment 'MYSQL_ATTR_SSL_CA') -ne $placeholderValues.MYSQL_ATTR_SSL_CA -or (Get-ComposeEnvironmentValue $api.environment 'REDIS_SCHEME') -ne 'tls' -or (Get-ComposeEnvironmentValue $api.environment 'REDIS_USERNAME') -ne $placeholderValues.REDIS_USERNAME) { throw 'Managed database CA and Redis TLS/ACL settings must reach the API container.' }
    $managedDbValidated = Invoke-ComposeConfig -ReturnConfig -ManagedDbOverride
    $managedDbConfig = $managedDbValidated.Output | ConvertFrom-Json
    $managedApi = $managedDbConfig.services.api
    $caMount = @($managedApi.volumes) | Where-Object { $_.target -eq '/run/secrets/mysql-ca.pem' -and $_.source -eq $placeholderValues.MYSQL_CA_FILE -and $_.read_only -eq $true }
    if ($null -eq $caMount -or (Get-ComposeEnvironmentValue $managedApi.environment 'MYSQL_ATTR_SSL_CA') -ne '/run/secrets/mysql-ca.pem') { throw 'Managed database override must mount its CA read-only and configure Laravel to use it.' }
    if ((ConvertTo-NormalizedString (Get-ComposeEnvironmentValue $api.environment 'APP_ENV')) -ne 'production' -or (ConvertTo-NormalizedString (Get-ComposeEnvironmentValue $api.environment 'APP_DEBUG')) -ne 'false') { throw 'API must run with APP_ENV=production and APP_DEBUG=false.' }
    foreach ($name in @('SESSION_SECURE_COOKIE', 'SESSION_HTTP_ONLY', 'SESSION_ENCRYPT')) {
        if ((ConvertTo-NormalizedString (Get-ComposeEnvironmentValue $api.environment $name)) -ne 'true') { throw "API must enable $name in production." }
    }
    if ((Get-ComposeEnvironmentValue $api.environment 'MEDIA_FILESYSTEM_DISK') -notin @('s3', 'local')) { throw 'Production media storage must be private S3 or a single-node local volume.' }
    if ((Get-ComposeEnvironmentValue $api.environment 'MEDIA_FILESYSTEM_DISK') -eq 's3' -and [string]::IsNullOrWhiteSpace([string](Get-ComposeEnvironmentValue $api.environment 'AWS_BUCKET'))) { throw 'S3 media storage requires a bucket.' }
    foreach ($serviceName in @('api', 'mysql', 'redis')) {
        $ports = $config.services.$serviceName.PSObject.Properties['ports']
        if ($null -ne $ports -and @($ports.Value).Count -gt 0) { throw "$serviceName must not publish a host port directly." }
    }
    if (@($web.ports).Count -lt 1 -or -not $web.healthcheck -or -not $api.healthcheck) { throw 'Web and API must expose the web entry point and define health checks.' }
    $webHealthcheck = @($web.healthcheck.test) -join ' '
    if ($webHealthcheck -notmatch '/api/ready' -or $webHealthcheck -notmatch 'grep.+status.+ready') { throw 'Production web healthcheck must verify the /api/ready JSON response through Nginx.' }
    foreach ($serviceName in @('api', 'web', 'mysql', 'redis')) {
        $service = $config.services.PSObject.Properties[$serviceName].Value
        $securityOptions = $service.PSObject.Properties['security_opt'].Value
        if ($null -eq $securityOptions -or @($securityOptions) -notcontains 'no-new-privileges:true') { throw "$serviceName must set no-new-privileges:true." }
    }
    if ($api.read_only -ne $true -or $web.read_only -ne $true) { throw 'API and web containers must use read-only root filesystems.' }

} finally {
    foreach ($key in $placeholderValues.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}

Write-Output 'Production Compose rejects missing secrets and satisfies the static production and upload contracts with disposable placeholders.'
