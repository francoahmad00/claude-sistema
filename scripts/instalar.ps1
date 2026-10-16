# Instala el sistema de Claude desde la ubicación actual de este repo:
# apunta los hooks y la statusline de ~/.claude/settings.json acá (con backup) y registra las tareas.
# Correrlo después de mover o clonar la carpeta.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1 [-Seco]
#   -Seco  muestra qué cambiaría en settings.json, sin escribir ni registrar tareas

param([switch]$Seco)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

$argumentos = @("$raiz\scripts\instalar-hooks.js")
if ($Seco) { $argumentos += '--seco' }
node @argumentos
if ($LASTEXITCODE -ne 0) { throw "instalar-hooks.js fallo (exit $LASTEXITCODE)" }

if ($Seco) {
    Write-Output '[en seco] No se registran tareas.'
} else {
    & "$PSScriptRoot\programar-tareas.ps1"
}
