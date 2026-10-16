# RELEVO — claude-sistema
_Actualizado: 2026-10-16 11:15 · Rama: main_
Backlog completo: C:/Users/franc/Cerebro/wiki/proyectos/claude-sistema/claude-sistema-pendientes.md

## Para arrancar la próxima sesión
Mejoras del relevo (pendientes P2): que el hook `contexto-proyecto.js` busque RELEVO.md también en la raíz del repo y en subcarpetas inmediatas, y que `cerrar-sesion` termine indicando la carpeta exacta y el mensaje a pegar.

## Objetivo de la última sesión
Verificar las 8 fases tras la mudanza y centralizar la ruta del sistema — **cumplido**.
Detalle: Cerebro `wiki/proyectos/claude-sistema/sesiones/2026-10-16-verificacion-e-instalador.md` y decisión `wiki/decisiones/2026-10-16-instalar-ps1-ruta-unica.md`.

## Estado del repo
- Cambios sin commitear: ninguno
- Último commit de código: f0a8214 instalar.ps1: reapunta settings.json y registra tareas desde la ubicación actual (main, pusheado)
- Remoto: github.com/francoahmad00/claude-sistema (privado)

## Decisiones pendientes (Franco)
- Borrar las carpetas viejas de OneDrive (`Documentos\Claude-Code\`, `ALUD\pagina-web`, `FRANCO\administrador franco`, `FRANCO\Claude\Claude code`): **no borrar sin su OK**.

## Comandos útiles
- Tras mover o clonar la carpeta: `powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1 -Seco` (ver) y sin `-Seco` (aplicar, con backup en `~/.claude/backups/`).
- Probar sin tocar lo real: `CEREBRO_BOVEDA=<copia> node scripts/...` y `CLAUDE_SETTINGS=<copia> node scripts/instalar-hooks.js`.

## Trampas / no hacer
Ver Cerebro `wiki/conceptos/trampas-scripting-windows.md`. Las principales:
- Git Bash rompe las `\` (`sed`, `node -e`, `read` sin `-r`): chequear rutas de Windows con PowerShell.
- Con el sandbox no hay red: agent-browser y `git push` necesitan correr fuera de él.
- Archivos del Cerebro con CRLF: editar línea por línea y verificar el resultado.
- `agent-browser open` en Bash con tubería se cuelga: usar PowerShell.

## Historial
- 2026-10-16 (tarde): 8 fases verificadas; `scripts/instalar.ps1` centraliza la ruta; página explicativa de la mudanza.
- 2026-10-16: mudanza a C:\Users\franc\proyectos, repos nuevos en GitHub, respaldos del ERP a OneDrive, hooks y tarea reapuntados.
- 2026-10-12/13: fases 1 a 8 del sistema (ver Cerebro).
