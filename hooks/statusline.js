// Statusline del CLI: muestra modelo, carpeta, rama y tokens de contexto.
// Se pone en alerta al pasar el umbral. (Solo visible en el CLI de terminal.)
const path = require('path');
const { execSync } = require('child_process');
const { leerConfig, leerStdin, tokensDeUso, tokensDeTranscripcion, formatoK } = require('../lib/contexto');

(async () => {
  const e = await leerStdin();
  const cfg = leerConfig();

  const modelo = (e.model && e.model.display_name) || '';
  const dir = (e.workspace && e.workspace.current_dir) || e.cwd || process.cwd();
  let rama = '';
  try {
    rama = execSync('git branch --show-current', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 })
      .toString().trim();
  } catch {}

  // Si Claude Code ya manda el uso de contexto, usarlo; si no, calcularlo de la transcripción.
  const tokens = tokensDeUso(e.context_window && e.context_window.current_usage)
    ?? tokensDeTranscripcion(e.transcript_path);

  const partes = [modelo, path.basename(dir) + (rama ? ` (${rama})` : '')];
  if (tokens != null) {
    const pct = Math.round((tokens / cfg.umbralTokens) * 100);
    const txt = `ctx ${formatoK(tokens)}/${formatoK(cfg.umbralTokens)}`;
    if (tokens >= cfg.umbralTokens) partes.push(`\x1b[41;97m ${txt} → /cerrar-sesion \x1b[0m`);
    else if (pct >= 80) partes.push(`\x1b[33m${txt}\x1b[0m`);
    else partes.push(`\x1b[32m${txt}\x1b[0m`);
  }
  process.stdout.write(partes.filter(Boolean).join(' · '));
})();
