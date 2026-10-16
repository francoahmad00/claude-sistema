# Registra (o actualiza) las tareas programadas del sistema de Claude en el Programador de tareas.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\programar-tareas.ps1
# Para quitarlas: Unregister-ScheduledTask -TaskPath "\Claude\" -TaskName "<nombre>" -Confirm:$false

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source

function Registrar($nombre, $script, $trigger, $descripcion) {
    # conhost --headless: corre sin abrir ventana de consola
    $accion = New-ScheduledTaskAction -Execute 'conhost.exe' `
        -Argument "--headless `"$node`" `"$raiz\scripts\$script`"" `
        -WorkingDirectory $raiz
    $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    Register-ScheduledTask -TaskPath '\Claude\' -TaskName $nombre -Action $accion -Trigger $trigger `
        -Settings $ajustes -Description $descripcion -Force | Out-Null
    Write-Output "Registrada: \Claude\$nombre"
}

Registrar 'Informe semanal' 'informe-semanal.js' `
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9:00) `
    'Detecta tareas repetidas en Claude Code (30 dias), lint del Cerebro y (primer lunes del mes) auditoria de skills. Informes en Obsidian.'

Get-ScheduledTask -TaskPath '\Claude\' | Select-Object TaskName, State,
    @{n='Proxima ejecucion'; e={ (Get-ScheduledTaskInfo $_).NextRunTime }} | Format-Table -AutoSize
