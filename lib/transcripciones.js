// Lectura de las conversaciones de Claude Code (~/.claude/projects/**/*.jsonl).
// Devuelve pedidos de Franco limpios de ruido, comandos ejecutados y uso de skills.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR_PROYECTOS = path.join(os.homedir(), '.claude', 'projects');

// Respuestas cortas que no son pedidos.
const CONFIRMACIONES = /^(s[ií]|no|ok|dale|listo|perfecto|excelente|gracias|bien|as[ií]\??|seguí|avanzá|continuá|hacelo|de una|genial|buenísimo|joya)[\s.,!?]*$/i;

function listarTranscripciones(desde) {
  const archivos = [];
  if (!fs.existsSync(DIR_PROYECTOS)) return archivos;
  for (const dir of fs.readdirSync(DIR_PROYECTOS)) {
    const d = path.join(DIR_PROYECTOS, dir);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.jsonl')) continue;
      const ruta = path.join(d, f);
      if (fs.statSync(ruta).mtime >= desde) archivos.push(ruta);
    }
  }
  return archivos;
}

function limpiarPedido(texto) {
  if (/^<task-notification>|^This session is being continued|^<local-command-|^Caveat:/.test(texto.trim())) return '';
  return texto
    .replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content>/g, ' [contenido pegado] ')
    .replace(/<(ide_opened_file|ide_selection|system-reminder)>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<command-(message|args)>[\s\S]*?<\/command-\1>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const textoDe = (c) => typeof c === 'string' ? c
  : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : '';

/**
 * Recorre las transcripciones modificadas en los últimos `dias` días.
 * @returns {{ pedidos, comandos, skills, sesiones }}
 *   pedidos:  [{ fecha, proyecto, cwd, sesion, texto }]
 *   comandos: [{ fecha, proyecto, comando }]          (Bash/PowerShell ejecutados)
 *   skills:   [{ fecha, proyecto, skill, via }]       (via: 'auto' | 'slash')
 */
function leerConversaciones(dias = 30) {
  const desde = new Date(Date.now() - dias * 864e5);
  const pedidos = [], comandos = [], skills = [];
  const sesiones = new Set();

  for (const archivo of listarTranscripciones(desde)) {
    let lineas;
    try { lineas = fs.readFileSync(archivo, 'utf8').split('\n'); } catch { continue; }
    for (const l of lineas) {
      if (!l) continue;
      let j;
      try { j = JSON.parse(l); } catch { continue; }
      if (j.isSidechain || !j.message || !j.timestamp) continue;
      const fecha = new Date(j.timestamp);
      if (fecha < desde) continue;
      const proyecto = (j.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '?';
      const f = fecha.toISOString().slice(0, 10);

      if (j.type === 'user' && !j.isMeta) {
        const bruto = textoDe(j.message.content);
        // Skills invocadas a mano con /nombre
        const cmd = bruto.match(/<command-name>\/?([^<\s]+)<\/command-name>/);
        if (cmd) skills.push({ fecha: f, proyecto, skill: cmd[1], via: 'slash' });
        const texto = limpiarPedido(bruto);
        if (texto.length >= 8 && !CONFIRMACIONES.test(texto)) {
          pedidos.push({ fecha: f, proyecto, cwd: j.cwd, sesion: j.sessionId, texto });
          sesiones.add(j.sessionId);
        }
      }

      if (j.type === 'assistant' && Array.isArray(j.message.content)) {
        for (const b of j.message.content) {
          if (b.type !== 'tool_use') continue;
          if ((b.name === 'Bash' || b.name === 'PowerShell') && b.input && b.input.command) {
            comandos.push({ fecha: f, proyecto, comando: b.input.command });
          }
          if (b.name === 'Skill' && b.input && b.input.skill) {
            skills.push({ fecha: f, proyecto, skill: b.input.skill, via: 'auto' });
          }
        }
      }
    }
  }
  return { pedidos, comandos, skills, sesiones: sesiones.size };
}

// "git -C x commit -m ..." → "git commit"; "npm run dev" → "npm run dev"
function normalizarComando(c) {
  // Primer segmento real: se saltean cd/Set-Location y asignaciones de variables.
  const segmentos = c.trim().split(/\s*(?:&&|\|\||;|\||\r?\n)\s*/);
  const primera = segmentos.find((s) => s && !/^(cd|Set-Location|pushd|export|set|\$?\w+=)\b/i.test(s) && !/^\w+=/.test(s)) || '';
  // Quitar argumentos entre comillas (rutas, mensajes) antes de partir por espacios.
  const partes = primera.replace(/"[^"]*"|'[^']*'/g, ' ').split(/\s+/)
    .filter((p) => p && !p.startsWith('-') && !/[\\/:"'<>=$]/.test(p));
  const base = (partes[0] || '').toLowerCase();
  if (['npm', 'npx', 'pnpm', 'yarn'].includes(base)) return partes.slice(0, base === 'npm' && partes[1] === 'run' ? 3 : 2).join(' ');
  return partes.slice(0, 2).join(' ');
}

module.exports = { leerConversaciones, normalizarComando, DIR_PROYECTOS };
