// Hook SessionStart: detecta el proyecto del Cerebro según la carpeta de trabajo
// y le pasa a Claude la ficha, los pendientes abiertos y si hay RELEVO.md.
// Corre también después de /compact y /clear, así el contexto se recupera.
const fs = require('fs');
const path = require('path');
const { leerConfig, leerStdin } = require('../lib/contexto');

const MAX_PENDIENTES = 15;

const normalizar = (p) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function campo(texto, nombre) {
  const m = texto.match(new RegExp(`^${nombre}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'));
  return m ? m[1].trim() : '';
}

function buscarProyecto(boveda, cwd) {
  const dir = path.join(boveda, 'wiki', 'proyectos');
  if (!fs.existsSync(dir)) return null;
  const actual = normalizar(cwd);
  let mejor = null;
  for (const slug of fs.readdirSync(dir)) {
    const ficha = path.join(dir, slug, `${slug}.md`);
    if (!fs.existsSync(ficha)) continue;
    const repo = normalizar(campo(fs.readFileSync(ficha, 'utf8'), 'repo'));
    // Coincide si la carpeta actual es el repo o una subcarpeta; gana el repo más largo.
    if (repo && (actual === repo || actual.startsWith(repo + '/')) && (!mejor || repo.length > mejor.repo.length)) {
      mejor = { slug, ficha, repo };
    }
  }
  return mejor;
}

function pendientesAbiertos(archivo) {
  if (!fs.existsSync(archivo)) return [];
  return fs.readFileSync(archivo, 'utf8').split('\n')
    .filter((l) => /^\s*- \[ \]/.test(l))
    .map((l) => l.trim());
}

(async () => {
  try {
    const entrada = await leerStdin();
    const cfg = leerConfig();
    const boveda = cfg.boveda || 'C:\\Users\\franc\\Cerebro';
    const cwd = entrada.cwd || process.cwd();
    const b = boveda.replace(/\\/g, '/');

    const lineas = [`[Cerebro] Base de conocimiento: ${b} (esquema: ${b}/CLAUDE.md, catálogo: ${b}/index.md).`];

    if (normalizar(cwd).startsWith(normalizar(boveda))) {
      lineas.push('Estás dentro del Cerebro: seguí las convenciones de su CLAUDE.md.');
    } else {
      const p = buscarProyecto(boveda, cwd);
      if (p) {
        const archPend = path.join(path.dirname(p.ficha), `${p.slug}-pendientes.md`);
        const pend = pendientesAbiertos(archPend);
        lineas.push(`Proyecto detectado: ${p.slug}. Ficha: ${p.ficha.replace(/\\/g, '/')} · Pendientes: ${archPend.replace(/\\/g, '/')}`);
        if (pend.length) {
          lineas.push(`Pendientes abiertos (${pend.length}${pend.length > MAX_PENDIENTES ? `, se muestran ${MAX_PENDIENTES}` : ''}):`);
          lineas.push(...pend.slice(0, MAX_PENDIENTES));
        } else {
          lineas.push('Sin pendientes abiertos.');
        }
        lineas.push('Leé la ficha si necesitás contexto del proyecto. Si Franco da una idea o tarea para más adelante, agregala a los pendientes.');
      } else {
        lineas.push('Esta carpeta no está asociada a un proyecto del Cerebro. Si es un proyecto nuevo de Franco, cerrar-sesion lo creará.');
      }
      if (fs.existsSync(path.join(cwd, 'RELEVO.md'))) {
        lineas.push('Hay RELEVO.md en esta carpeta: leelo y resumí a Franco en 2-3 líneas dónde quedó la sesión anterior.');
      }
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lineas.join('\n') },
    }));
  } catch {
    // Un hook que falla nunca debe trabar a Claude Code.
  }
})();
