// Lint del Cerebro: chequeos de salud del wiki (no modifica páginas, solo informa).
// Uso suelto: node scripts/lint-cerebro.js
const path = require('path');
const { leer, listarPaginas, frontmatter } = require('../lib/cerebro');

const DIAS_HECHO = 30;
const DIAS_DESACTUALIZADO = 60;

// Saca bloques de código e inline code para no tomar ejemplos como links reales.
const sinCodigo = (t) => t.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

// `porCrear`: nombres de páginas que se escriben después del lint (ej. su propio informe).
function lint({ porCrear = [] } = {}) {
  const paginas = listarPaginas();
  const nombres = new Map(paginas.map((p) => [path.basename(p, '.md'), p]));
  porCrear.forEach((n) => nombres.set(n, n));
  const indice = leer('index.md');
  const entrantes = new Map();
  const hoy = Date.now();
  const r = { linksRotos: [], sinFrontmatter: [], sinResumen: [], fueraDelIndice: [], huerfanas: [], hechoViejo: [], desactualizadas: [] };

  for (const p of paginas) {
    if (p.startsWith('plantillas/')) continue;
    const texto = leer(p);
    for (const m of sinCodigo(texto).matchAll(/\[\[([^\]|#]+)/g)) {
      const destino = m[1].trim();
      // Entre backticks, para que el informe no genere a su vez un link roto.
      if (!nombres.has(destino)) r.linksRotos.push(`${p} → \`[[${destino}]]\``);
      else if (destino !== path.basename(p, '.md')) entrantes.set(destino, (entrantes.get(destino) || 0) + 1);
    }

    if (!p.startsWith('wiki/')) continue;
    const fm = frontmatter(texto);
    const slug = path.basename(p, '.md');
    const enSesionOInforme = p.includes('/sesiones/') || p.includes('/informes/');

    if (!fm || !fm.tipo) r.sinFrontmatter.push(p);
    else if (!fm.resumen) r.sinResumen.push(p);
    if (!enSesionOInforme && !indice.includes(`[[${slug}]]`) && !indice.includes(`[[${slug}|`)) r.fueraDelIndice.push(p);

    if (fm && fm.actualizado && fm.tipo !== 'sesion' && fm.tipo !== 'informe' && fm.tipo !== 'decision') {
      const dias = Math.floor((hoy - new Date(fm.actualizado)) / 864e5);
      if (dias > DIAS_DESACTUALIZADO) r.desactualizadas.push(`${p} (${dias} días)`);
    }

    if (fm && fm.tipo === 'pendientes') {
      for (const l of texto.split('\n')) {
        const h = l.match(/^\s*- \[x\].*hecho (\d{4}-\d{2}-\d{2})/i);
        if (h && (hoy - new Date(h[1])) / 864e5 > DIAS_HECHO) r.hechoViejo.push(`${p}: ${l.trim().slice(0, 90)}`);
      }
    }
  }

  // Huérfanas: páginas del wiki sin ningún link entrante (sesiones e informes se excluyen).
  for (const p of paginas) {
    if (!p.startsWith('wiki/') || p.includes('/sesiones/') || p.includes('/informes/')) continue;
    if (!entrantes.get(path.basename(p, '.md'))) r.huerfanas.push(p);
  }

  r.total = Object.values(r).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  r.paginas = paginas.length;
  return r;
}

const SECCIONES = [
  ['linksRotos', 'Links rotos', 'Crear la página o corregir el link.'],
  ['sinFrontmatter', 'Sin frontmatter o sin `tipo`', 'Agregar el frontmatter del esquema.'],
  ['sinResumen', 'Sin `resumen`', 'Agregar una línea de resumen (la usa el índice y grep).'],
  ['fueraDelIndice', 'No figuran en index.md', 'Agregarlas en su sección del índice.'],
  ['huerfanas', 'Huérfanas (sin links entrantes)', 'Enlazarlas desde su proyecto o una página relacionada.'],
  ['hechoViejo', `Pendientes "Hecho" con más de ${DIAS_HECHO} días`, 'Borrarlos (quedan en log y sesiones).'],
  ['desactualizadas', `Sin actualizar hace más de ${DIAS_DESACTUALIZADO} días`, 'Revisar si siguen vigentes.'],
];

function aMarkdown(r) {
  let md = `**${r.paginas} páginas revisadas · ${r.total} problemas.**\n`;
  for (const [k, titulo, accion] of SECCIONES) {
    if (!r[k].length) continue;
    md += `\n### ${titulo} (${r[k].length})\n_${accion}_\n` + r[k].map((x) => `- ${x}`).join('\n') + '\n';
  }
  if (!r.total) md += '\nSin problemas.\n';
  md += '\n_Contradicciones y datos viejos requieren revisión del LLM: pedile a Claude "hacé lint del Cerebro" cuando quieras una revisión de contenido._\n';
  return md;
}

module.exports = { lint, aMarkdown };

if (require.main === module) {
  const r = lint();
  console.log(aMarkdown(r));
}
