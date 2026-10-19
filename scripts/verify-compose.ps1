$ErrorActionPreference = 'Stop'

$services = docker compose config --services 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'docker compose config must resolve successfully.'
}

$required = @('api', 'web', 'mysql', 'redis')
$missing = $required | Where-Object { $_ -notin $services }
if ($missing.Count -gt 0) {
    throw "Compose is missing required services: $($missing -join ', ')."
}

$config = docker compose config 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'docker compose config must resolve successfully.'
}

foreach ($service in $required) {
    $section = [regex]::Match(($config -join "`n"), "(?ms)^  ${service}:`n(.*?)(?=^  [a-z][a-z0-9_-]*:`n|^volumes:`n|\z)")
    if (-not $section.Success -or $section.Groups[1].Value -notmatch '(?m)^    healthcheck:') {
        throw "Compose service '$service' must define a healthcheck."
    }
}

if (($config -join "`n") -notmatch 'curl -fsS http://localhost:8000/api/ready') {
    throw 'The API container must use dependency readiness, not liveness, for its health check.'
}
if (($config -join "`n") -notmatch 'APP_ENV: local' -or ($config -join "`n") -notmatch 'APP_DEBUG: "true"') {
    throw 'The Compose profile must remain explicitly marked as local development.'
}

$phpConfig = docker compose exec -T api php -i 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'The API container must be running to verify its PHP upload configuration.'
}
$phpConfigText = $phpConfig -join "`n"
foreach ($setting in @('upload_max_filesize => 6M', 'post_max_size => 28M', 'max_file_uploads => 5')) {
    if ($phpConfigText -notmatch [regex]::Escape($setting)) {
        throw "The API PHP configuration is missing required photo upload capacity: $setting."
    }
}

Write-Output "Compose services and health checks verified: $($required -join ', ')"
