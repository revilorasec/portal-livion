[CmdletBinding()]
param(
    [string]$PortalRoot = "C:\OneDrive - Livion Solutions\00-PORTAL LIVION"
)

if ($PSVersionTable.PSVersion.Major -lt 7) {
    $pwshCommand = Get-Command 'pwsh' -ErrorAction SilentlyContinue
    if (-not $pwshCommand) {
        throw 'Este organizador requer PowerShell 7 ou superior para preservar corretamente os nomes com acentos.'
    }
    & $pwshCommand.Source -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -PortalRoot $PortalRoot
    exit $LASTEXITCODE
}

$ErrorActionPreference = 'Stop'
$sourceRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'docs\onedrive-apps'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not (Test-Path -LiteralPath $sourceRoot)) {
    $downloadRoot = Join-Path $env:TEMP "portal-livion-manuais-$stamp"
    $archivePath = Join-Path $downloadRoot 'portal-livion-main.zip'
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    Invoke-WebRequest -Uri 'https://github.com/revilorasec/portal-livion/archive/refs/heads/main.zip' -OutFile $archivePath
    Expand-Archive -LiteralPath $archivePath -DestinationPath $downloadRoot -Force
    $sourceRoot = Join-Path $downloadRoot 'portal-livion-main\docs\onedrive-apps'
    if (-not (Test-Path -LiteralPath $sourceRoot)) {
        throw "Não foi possível obter os manuais do Portal Livion."
    }
}

$apps = @(
    @{ Name = 'PORTAL LIVION'; Subfolders = @('Documentacao', 'Exportacoes') },
    @{ Name = 'RECURSOS HUMANOS'; Subfolders = @('Dados', 'Backups', 'Funcionarios', 'Importacoes', 'Exportacoes') },
    @{ Name = 'COTAÇÃO DE FRETES'; Subfolders = @('Dados', 'Backups', 'Anexos', 'Importacoes', 'Exportacoes') },
    @{ Name = 'STATUS REPAROS CLARO'; Subfolders = @('Dados', 'Backups', 'Anexos', 'Importacoes', 'Exportacoes') },
    @{ Name = 'CONTROLE DE ESTOQUE'; Subfolders = @('Importacoes', 'Exportacoes', 'Documentos') },
    @{ Name = 'DESPESAS E REEMBOLSOS'; Subfolders = @('Importacoes', 'Exportacoes', 'Documentos') }
)

New-Item -ItemType Directory -Path $PortalRoot -Force | Out-Null

foreach ($app in $apps) {
    $appPath = Join-Path $PortalRoot $app.Name
    New-Item -ItemType Directory -Path $appPath -Force | Out-Null

    foreach ($subfolder in $app.Subfolders) {
        New-Item -ItemType Directory -Path (Join-Path $appPath $subfolder) -Force | Out-Null
    }

    $sourceManual = Join-Path (Join-Path $sourceRoot $app.Name) 'MANUAL.md'
    $targetManual = Join-Path $appPath 'MANUAL.md'
    if (Test-Path -LiteralPath $targetManual) {
        $current = Get-FileHash -LiteralPath $targetManual -Algorithm SHA256
        $incoming = Get-FileHash -LiteralPath $sourceManual -Algorithm SHA256
        if ($current.Hash -ne $incoming.Hash) {
            Copy-Item -LiteralPath $targetManual -Destination (Join-Path $appPath "MANUAL.backup-$stamp.md")
        }
    }
    Copy-Item -LiteralPath $sourceManual -Destination $targetManual -Force
}

$indexSource = Join-Path $sourceRoot 'INDEX-APLICATIVOS.md'
Copy-Item -LiteralPath $indexSource -Destination (Join-Path $PortalRoot 'INDEX-APLICATIVOS.md') -Force

$rhRoot = Join-Path $PortalRoot 'RECURSOS HUMANOS'
$rhLegacy = Join-Path $rhRoot 'dados.json'
$rhStandard = Join-Path (Join-Path $rhRoot 'Dados') 'dados.json'
if ((Test-Path -LiteralPath $rhLegacy) -and -not (Test-Path -LiteralPath $rhStandard)) {
    Copy-Item -LiteralPath $rhLegacy -Destination $rhStandard
}

Write-Host "Estrutura e manuais atualizados em: $PortalRoot" -ForegroundColor Green
Write-Host 'Nenhum banco ou arquivo existente foi excluído.' -ForegroundColor Green
