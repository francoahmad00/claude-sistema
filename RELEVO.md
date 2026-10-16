# RELEVO — claude-sistema
_Actualizado: 2026-10-16 · Rama: main_
Backlog completo: C:/Users/franc/Cerebro/wiki/proyectos/claude-sistema/claude-sistema-pendientes.md

## Para arrancar la próxima sesión
Verificar las 8 fases del sistema después de la mudanza y mostrarle a Franco una tabla de qué funciona. Después, proponer cómo centralizar la ruta de claude-sistema (preguntar antes de cambiar).

## Objetivo de la última sesión
Mudar el código de OneDrive a `C:\Users\franc\proyectos` y que el sistema quede funcionando igual que antes, solo que en otro lugar — **cumplido** (falta la verificación completa).
Detalle: Cerebro `wiki/proyectos/claude-sistema/sesiones/2026-10-16-mudanza-carpetas.md` y decisión `wiki/decisiones/2026-10-16-organizacion-carpetas.md`.

## Estado del repo
- Cambios sin commitear: ninguno (este RELEVO.md se commitea al cerrar).
- Último commit de código: 9732e35 Primer commit (mudanza a C:/Users/franc/proyectos, 2026-10-16)
- Remoto: github.com/francoahmad00/claude-sistema (privado)

## Cómo verificar (paso 1)
- Informe semanal y auditoría **sobre una COPIA de la bóveda**, nunca la real:
  `CEREBRO_BOVEDA=<copia> node scripts/informe-semanal.js --sin-claude --auditoria --sin-commit`
- `node scripts/lint-cerebro.js` · `node scripts/auditoria-skills.js --sin-commit` (con CEREBRO_BOVEDA)
- Hooks: ya probados el 2026-10-16 (SessionStart, statusline, aviso de tokens).
- Skills: `/cuestionar`, `/cerrar-sesion`, `/probar-app` (agent-browser 0.38.2, producción solo lectura), `blueprint`, `ui-ux-pro-max`.
- Tarea programada: `\Claude\Informe semanal` → `C:\Users\franc\proyectos\claude-sistema\scripts\informe-semanal.js` (próxima: lunes 2026-10-19 9:00).

## Decisiones pendientes (Franco)
- Borrar las carpetas viejas de OneDrive (`Documentos\Claude-Code\`, `ALUD\pagina-web`, `FRANCO\administrador franco`, `FRANCO\Claude\Claude code`): **no borrar sin su OK**.

## Trampas / no hacer
Ver Cerebro `wiki/conceptos/trampas-scripting-windows.md`. Las principales:
- Git Bash rompe barras invertidas en `node -e` y `sed`: escribir scripts en archivo.
- Archivos del Cerebro con CRLF: editar línea por línea y verificar el resultado.
- `agent-browser open` en Bash con tubería se cuelga: usar PowerShell.

## Historial
- 2026-10-16: mudanza a C:\Users\franc\proyectos, repos nuevos en GitHub, respaldos del ERP a OneDrive, hooks y tarea reapuntados.
- 2026-10-12/13: fases 1 a 8 del sistema (ver Cerebro).
