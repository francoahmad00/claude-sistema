// Hook UserPromptSubmit: avisa cuando el contexto de la sesión supera el umbral
// y le indica a Claude que sugiera la skill cerrar-sesion.
// Avisa al cruzar el umbral y luego cada `repetirAvisoCada` tokens extra (no en cada mensaje).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerConfig, leerStdin, tokensDeTranscripcion, formatoK } = require('../lib/contexto');

(async () => {
  try {
    const entrada = await leerStdin();
    const cfg = leerConfig();
    const tokens = tokensDeTranscripcion(entrada.transcript_path);
    if (tokens == null || tokens < cfg.umbralTokens) return;

    // Estado por sesión para no repetir el aviso en cada mensaje.
    const dirEstado = path.join(os.tmpdir(), 'claude-aviso-contexto');
    fs.mkdirSync(dirEstado, { recursive: true });
    const archivoEstado = path.join(dirEstado, `${entrada.session_id || 'sin-id'}.json`);
    let ultimoAviso = 0;
    try { ultimoAviso = JSON.parse(fs.readFileSync(archivoEstado, 'utf8')).ultimoAviso || 0; } catch {}

    // Si se compactó la conversación y bajó del umbral, el estado se reinicia solo.
    if (ultimoAviso && tokens < ultimoAviso - cfg.repetirAvisoCada) ultimoAviso = 0;
    if (ultimoAviso && tokens < ultimoAviso + cfg.repetirAvisoCada) return;

    fs.writeFileSync(archivoEstado, JSON.stringify({ ultimoAviso: tokens }));

    const t = formatoK(tokens);
    process.stdout.write(JSON.stringify({
      systemMessage: `Contexto en ~${t} tokens (umbral ${formatoK(cfg.umbralTokens)}). Conviene correr /cerrar-sesion y seguir en una sesión nueva.`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          `[aviso-contexto] La sesión tiene ~${t} tokens de contexto, por encima del umbral de ` +
          `${formatoK(cfg.umbralTokens)}. Respondé el pedido de Franco normalmente y al final ` +
          `sugerile en una línea correr la skill cerrar-sesion para generar RELEVO.md y continuar en una sesión nueva.`,
      },
    }));
  } catch {
    // Un hook que falla nunca debe trabar a Claude Code.
  }
})();
