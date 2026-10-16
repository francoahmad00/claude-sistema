# claude-sistema

Scripts del sistema de mejora continua de Claude Code. La configuración (reglas, skills, hooks) está instalada a nivel global en `%USERPROFILE%\.claude`; acá viven solo los scripts que esa configuración ejecuta.

Documentación viva del proyecto: `C:\Users\franc\Cerebro\wiki\proyectos\claude-sistema\`.

## Estructura

| Ruta | Qué es | Quién lo ejecuta |
|---|---|---|
| `config.json` | Umbral de tokens, ruta de la bóveda, opciones del informe | Todos los scripts |
| `hooks/contexto-proyecto.js` | Al iniciar sesión: detecta el proyecto y le pasa a Claude ficha + pendientes | Hook `SessionStart` |
| `hooks/aviso-contexto.js` | Avisa al pasar ~250k tokens y sugiere `/cerrar-sesion` | Hook `UserPromptSubmit` |
| `hooks/statusline.js` | Barra inferior con modelo, carpeta, rama y tokens (solo CLI) | `statusLine` |
| `scripts/informe-semanal.js` | Repeticiones de los últimos 30 días + lint del Cerebro → Obsidian | Programador de tareas, lunes 9:00 |
| `scripts/lint-cerebro.js` | Chequeo de salud del Cerebro | Informe semanal, o a mano |
| `scripts/auditoria-skills.js` | Skills instaladas vs. usadas, costo en tokens, sugerencias de limpieza; sincroniza fichas de skills | Informe semanal el primer lunes del mes, o a mano |
| `scripts/instalar.ps1` | Instala desde la ubicación actual: hooks + statusline en `settings.json` (con backup) y tareas | A mano, después de mover o clonar la carpeta |
| `scripts/instalar-hooks.js` | Parte de `instalar.ps1` que edita `settings.json` | `instalar.ps1` |
| `scripts/programar-tareas.ps1` | Registra las tareas en `\Claude\` del Programador de tareas | `instalar.ps1`, o a mano |
| `lib/` | Código compartido (transcripciones, Cerebro, contexto) | — |
| `logs/` | Log de ejecuciones automáticas | — |

## Comandos útiles

```bash
node scripts/informe-semanal.js                # correr el informe ahora
node scripts/informe-semanal.js --sin-claude   # solo estadísticas y lint, sin usar Claude
node scripts/lint-cerebro.js                   # ver el lint en la terminal
node scripts/auditoria-skills.js               # auditoría de skills ahora
node scripts/informe-semanal.js --auditoria    # informe semanal + auditoría forzada
```

Pruebas sin tocar la bóveda real: copiarla y usar `CEREBRO_BOVEDA=<ruta-copia> node scripts/...`.

## Mover la carpeta o instalar en otra PC

Ninguna ruta del repo está escrita a mano: después de mover o clonar la carpeta, correr `instalar.ps1` desde la ubicación nueva.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1 -Seco   # ver qué cambiaría
powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1         # aplicar (backup en ~/.claude/backups/)
```

Para probar sobre una copia de `settings.json`: `CLAUDE_SETTINGS=<copia> node scripts/instalar-hooks.js`.

## Tareas programadas

```powershell
powershell -ExecutionPolicy Bypass -File scripts\programar-tareas.ps1   # (re)registrar solo las tareas
Start-ScheduledTask -TaskPath '\Claude\' -TaskName 'Informe semanal'     # disparar ya
```
