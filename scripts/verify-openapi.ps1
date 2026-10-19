param([switch]$UseDocker)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $project 'backend'
$openApiPath = Join-Path $project 'docs/api/openapi.yaml'
if (-not (Test-Path -LiteralPath $openApiPath -PathType Leaf)) { throw "No se encontró OpenAPI: $openApiPath" }

Push-Location (Join-Path $project 'frontend')
try {
    if ($UseDocker) {
        docker compose exec -T web npm run verify:openapi
    } else {
        npm run verify:openapi
    }
    if ($LASTEXITCODE -ne 0) { throw 'El contrato OpenAPI no pasó la validación sintáctica y estructural.' }
} finally {
    Pop-Location
}

Push-Location $backend
try {
    if ($UseDocker) {
        $routeOutput = docker compose exec -T api php artisan route:list --path=api --json
    } else {
        $routeOutput = php artisan route:list --path=api --json
    }
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener el inventario de rutas API de Laravel.' }
    $routes = $routeOutput | ConvertFrom-Json
} finally {
    Pop-Location
}

$specMethods = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$inPaths = $false
$currentPath = ''
foreach ($line in Get-Content -LiteralPath $openApiPath) {
    if ($line -match '^paths:\s*$') { $inPaths = $true; continue }
    if ($inPaths -and $line -match '^components:\s*$') { break }
    if (-not $inPaths) { continue }
    if ($line -match '^  (/[^:]+):\s*$') { $currentPath = $Matches[1]; continue }
    if ($currentPath -and $line -match '^    (get|post|put|patch|delete|options|head|trace):\s*$') {
        [void]$specMethods.Add($Matches[1].ToUpperInvariant() + ' ' + $currentPath)
    }
}

$routeMethods = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($route in $routes) {
    $uri = [string]$route.uri
    if ($uri.StartsWith('api/')) { $uri = $uri.Substring(4) }
    foreach ($method in ([string]$route.method -split '\|')) {
        if ($method -eq 'HEAD') { continue }
        [void]$routeMethods.Add($method.ToUpperInvariant() + ' /' + $uri.TrimStart('/'))
    }
}

# Sanctum registers this framework route outside Laravel's /api route group.
[void]$specMethods.Remove('GET /sanctum/csrf-cookie')
$missingFromSpec = @($routeMethods | Where-Object { -not $specMethods.Contains($_) } | Sort-Object)
$documentedButAbsent = @($specMethods | Where-Object { -not $routeMethods.Contains($_) } | Sort-Object)
if ($missingFromSpec.Count -gt 0 -or $documentedButAbsent.Count -gt 0) {
    if ($missingFromSpec.Count -gt 0) { Write-Error "Rutas API sin documentar:`n$($missingFromSpec -join "`n")" }
    if ($documentedButAbsent.Count -gt 0) { Write-Error "Operaciones OpenAPI sin ruta Laravel:`n$($documentedButAbsent -join "`n")" }
    exit 1
}

Write-Output "OpenAPI coincide con las $($routeMethods.Count) operaciones API de Laravel."
