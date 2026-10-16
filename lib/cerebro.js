// Escritura en el Cerebro (Obsidian) respetando su esquema: frontmatter, index, log y git.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { leerConfig } = require('./contexto');

// CEREBRO_BOVEDA permite apuntar a una copia de la bóveda para pruebas.
const BOVEDA = process.env.CEREBRO_BOVEDA || leerConfig().boveda || 'C:\\Users\\franc\\Cerebro';
const hoy = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD en hora local

const ruta = (rel) => path.join(BOVEDA, ...rel.split('/'));

function escribir(rel, contenido) {
  const f = ruta(rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenido, 'utf8');
}

function leer(rel) {
  try { return fs.readFileSync(ruta(rel), 'utf8'); } catch { return ''; }
}

function agregarLog(tipo, titulo, detalles = []) {
  const entrada = `\n## [${hoy()}] ${tipo} | ${titulo}\n` + detalles.map((d) => `- ${d}`).join('\n') + '\n';
  fs.appendFileSync(ruta('log.md'), entrada, 'utf8');
}

// Reemplaza la línea del índice que empieza con `prefijo` por `nuevaLinea`.
function actualizarLineaIndice(prefijo, nuevaLinea) {
  const idx = leer('index.md');
  const lineas = idx.split('\n');
  const i = lineas.findIndex((l) => l.startsWith(prefijo));
  if (i === -1) return;
  lineas[i] = nuevaLinea;
  escribir('index.md', lineas.join('\n'));
}

function commit(mensaje) {
  try {
    execFileSync('git', ['-C', BOVEDA, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', BOVEDA, 'commit', '-qm', mensaje], { stdio: 'ignore' });
    return true;
  } catch {
    return false; // nada para commitear o git no disponible
  }
}

// Lista todas las páginas .md de la bóveda (sin carpetas ocultas).
function listarPaginas() {
  const out = [];
  (function recorrer(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) recorrer(f);
      else if (e.name.endsWith('.md')) out.push(path.relative(BOVEDA, f).split(path.sep).join('/'));
    }
  })(BOVEDA);
  return out;
}

function frontmatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const o = {};
  for (const l of m[1].split(/\r?\n/)) {
    const k = l.match(/^([\w-]+):\s*(.*)$/);
    if (k) o[k[1]] = k[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return o;
}

module.exports = { BOVEDA, hoy, ruta, escribir, leer, agregarLog, actualizarLineaIndice, commit, listarPaginas, frontmatter };
