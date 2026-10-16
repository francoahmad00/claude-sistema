// Utilidades compartidas: leer config y calcular tokens de contexto desde la transcripción.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function leerConfig() {
  const porDefecto = { umbralTokens: 250000, repetirAvisoCada: 50000 };
  try {
    return { ...porDefecto, ...JSON.parse(fs.readFileSync(path.join(RAIZ, 'config.json'), 'utf8')) };
  } catch {
    return porDefecto;
  }
}

function leerStdin() {
  return new Promise((resolve) => {
    let datos = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (datos += d));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(datos)); } catch { resolve({}); }
    });
  });
}

// Tokens de contexto = input + cache_creation + cache_read del último mensaje
// del asistente en la conversación principal (no subagentes).
function tokensDeUso(u) {
  if (!u) return null;
  return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

function leerCola(archivo, bytes) {
  const fd = fs.openSync(archivo, 'r');
  try {
    const tam = fs.fstatSync(fd).size;
    const desde = Math.max(0, tam - bytes);
    const buf = Buffer.alloc(tam - desde);
    fs.readSync(fd, buf, 0, buf.length, desde);
    return { texto: buf.toString('utf8'), completo: desde === 0 };
  } finally {
    fs.closeSync(fd);
  }
}

function tokensDeTranscripcion(archivo) {
  if (!archivo || !fs.existsSync(archivo)) return null;
  // Leer solo el final del archivo (rápido); si no alcanza, leer todo.
  for (const bytes of [2 * 1024 * 1024, Infinity]) {
    const { texto, completo } = leerCola(archivo, bytes);
    const lineas = texto.split('\n');
    for (let i = lineas.length - 1; i >= 0; i--) {
      const l = lineas[i];
      if (!l.includes('"usage"')) continue;
      try {
        const j = JSON.parse(l);
        if (j.type === 'assistant' && !j.isSidechain && j.message && j.message.usage) {
          return tokensDeUso(j.message.usage);
        }
      } catch { /* línea cortada al inicio de la cola */ }
    }
    if (completo) break;
  }
  return null;
}

function formatoK(n) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

module.exports = { leerConfig, leerStdin, tokensDeUso, tokensDeTranscripcion, formatoK, RAIZ };
