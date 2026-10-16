// Informe semanal: detecta tareas repetidas en las conversaciones de Claude Code
// y corre el lint del Cerebro. Deja ambos informes en Obsidian, actualiza
// candidatas-a-skill, index y log, y hace commit en el Cerebro.
//
// El primer lunes de cada mes (o con --auditoria) suma la auditoría de skills.
//
// Uso: node scripts/informe-semanal.js [--dias 30] [--sin-claude] [--sin-commit] [--auditoria]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { leerConfig, RAIZ } = require('../lib/contexto');
const { leerConversaciones, normalizarComando } = require('../lib/transcripciones');
const cerebro = require('../lib/cerebro');
const { lint, aMarkdown } = require('./lint-cerebro');
const auditoriaSkills = require('./auditoria-skills');

const args = process.argv.slice(2);
const cfg = { dias: 30, usarClaude: true, modelo: 'sonnet', ...(leerConfig().informeSemanal || {}) };
const DIAS = Number(args[args.indexOf('--dias') + 1]) || cfg.dias;
const USAR_CLAUDE = cfg.usarClaude && !args.includes('--sin-claude');
const HOY = cerebro.hoy();
const MAX_CARACTERES = 90000; // tope de texto enviado a Claude

const ARCHIVO_LOG = path.join(RAIZ, 'logs', 'informe-semanal.log');
function log(msg) {
  const linea = `[${new Date().toISOString()}] ${msg}`;
  console.log(linea);
  fs.mkdirSync(path.dirname(ARCHIVO_LOG), { recursive: true });
  fs.appendFileSync(ARCHIVO_LOG, linea + '\n');
}

function skillsInstaladas() {
  const dir = path.join(os.homedir(), '.claude', 'skills');
  try {
    return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'SKILL.md')));
  } catch { return []; }
}

const GENERICOS = new Set(['', 'cat', 'grep', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'echo', 'find', 'head', 'tail', 'python', 'python3', 'node', 'sleep', 'for', 'sed', 'wc']);

function topComandos(comandos, n = 15) {
  const c = {};
  for (const x of comandos) {
    const k = normalizarComando(x.comando);
    if (!GENERICOS.has(k)) c[k] = (c[k] || 0) + 1;
  }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function armarPrompt(datos, comandos) {
  const porSesion = new Map();
  for (const p of datos.pedidos) {
    if (!porSesion.has(p.sesion)) porSesion.set(p.sesion, []);
    porSesion.get(p.sesion).push(p);
  }
  let pedidos = '';
  let i = 0;
  for (const lista of porSesion.values()) {
    i++;
    pedidos += `\n### Sesión ${i} · ${lista[0].fecha} · ${lista[0].proyecto}\n`;
    for (const p of lista) pedidos += `- ${p.texto.slice(0, 280)}\n`;
    if (pedidos.length > MAX_CARACTERES) { pedidos += '\n[...recortado]\n'; break; }
  }

  return `Sos un analista de hábitos de trabajo. Abajo están los pedidos que Franco le hizo a Claude Code en los últimos ${DIAS} días (agrupados por sesión) y los comandos más ejecutados. Franco desarrolla ERPs y webs con panel admin, en Windows + VS Code. Tu tarea: detectar TAREAS REPETIDAS que convendría automatizar.

Tipos de automatización:
- skill: procedimiento reutilizable con pasos (ej: deployar en Vercel, generar resumen técnico del proyecto)
- agente: tarea larga/autónoma con contexto propio (ej: probar todas las pantallas del ERP, revisar consistencia de datos)
- comando: atajo simple de una acción (ej: commitear y pasar a main)
- hook: algo que debe pasar SIEMPRE automáticamente ante un evento
- regla: preferencia o corrección repetida que debería ir en CLAUDE.md (ej: "hablame en castellano")

Criterios:
- Agrupá por significado, no por palabras exactas.
- Incluí solo tareas con 3+ apariciones, o 2+ en sesiones distintas si el valor es claramente alto.
- Ignorá lo que ya cubren estas skills instaladas: ${skillsInstaladas().join(', ') || '(ninguna)'}.
- Si una tarea ya está en "Candidatas existentes", reutilizá exactamente su id.
- Los ejemplos son citas breves (máx. 100 caracteres) de pedidos reales.
- Respondé SOLO con JSON válido, sin texto antes ni después, con esta forma:
{"resumen":"2-3 líneas sobre cómo trabajó Franco en el período","repeticiones":[{"id":"kebab-case","tarea":"descripción corta","veces":0,"sesiones":0,"proyectos":["..."],"ejemplos":["..."],"tipo":"skill|agente|comando|hook|regla","prioridad":"alta|media|baja","por_que":"una línea","propuesta":"qué haría concretamente, 1-2 líneas"}],"aprendizajes":["preferencias o patrones de Franco que valga registrar en el Cerebro o CLAUDE.md"]}

## Candidatas existentes
${cerebro.leer('wiki/skills/candidatas-a-skill.md').split('## Candidatas')[1] || '(ninguna)'}

## Comandos más ejecutados (sin genéricos)
${comandos.map(([c, n]) => `- ${c}: ${n}`).join('\n')}

## Pedidos
${pedidos}`;
}

function consultarClaude(prompt) {
  const r = spawnSync(
    `claude -p --model ${cfg.modelo} --tools "" --no-session-persistence --output-format json`,
    { input: prompt, encoding: 'utf8', shell: true, timeout: 10 * 60 * 1000, cwd: os.tmpdir(), maxBuffer: 20 * 1024 * 1024 },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`claude terminó con código ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  const salida = JSON.parse(r.stdout);
  if (salida.is_error) throw new Error(`claude devolvió error: ${String(salida.result).slice(0, 300)}`);
  const texto = String(salida.result || '');
  const json = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

function informeRepeticiones(datos, comandos, analisis, errorClaude) {
  const nombre = `${HOY}-repeticiones`;
  const reps = (analisis && analisis.repeticiones) || [];
  const orden = { alta: 0, media: 1, baja: 2 };
  reps.sort((a, b) => (orden[a.prioridad] ?? 3) - (orden[b.prioridad] ?? 3) || b.veces - a.veces);

  let md = `---
tipo: informe
resumen: Tareas repetidas en las conversaciones de los últimos ${DIAS} días y qué automatizar
proyecto: claude-sistema
fecha: ${HOY}
actualizado: ${HOY}
tags: [informe, repeticiones]
---
# Repeticiones — ${HOY}
Proyecto: [[claude-sistema]] · Candidatas: [[candidatas-a-skill]] · Lint: [[${HOY}-lint]]

**Período:** últimos ${DIAS} días · **${datos.sesiones} sesiones** · **${datos.pedidos.length} pedidos** · ${datos.comandos.length} comandos ejecutados.
`;
  if (analisis && analisis.resumen) md += `\n> ${analisis.resumen}\n`;

  if (errorClaude) {
    md += `\n> El análisis con Claude falló (${errorClaude}). Este informe solo tiene estadísticas. Se puede reintentar con \`node scripts/informe-semanal.js\`.\n`;
  } else if (!reps.length) {
    md += '\nNo se detectaron tareas repetidas que valga la pena automatizar.\n';
  } else {
    md += '\n## Sugerencias\n';
    for (const r of reps) {
      md += `\n### ${r.tarea} · \`${r.tipo}\` · prioridad ${r.prioridad}\n`;
      md += `- **id:** \`${r.id}\` · **veces:** ${r.veces} en ${r.sesiones} sesiones · **proyectos:** ${(r.proyectos || []).join(', ')}\n`;
      md += `- **Por qué:** ${r.por_que}\n- **Propuesta:** ${r.propuesta}\n`;
      if (r.ejemplos && r.ejemplos.length) md += `- **Ejemplos:** ${r.ejemplos.map((e) => `"${e}"`).join(' · ')}\n`;
    }
    md += '\nPara convertir una: abrí Claude Code y pedí *"convertí la candidata `<id>` en <tipo>"*.\n';
  }

  if (analisis && analisis.aprendizajes && analisis.aprendizajes.length) {
    md += '\n## Aprendizajes sobre cómo trabaja Franco\n' + analisis.aprendizajes.map((a) => `- ${a}`).join('\n') + '\n';
    md += '_Si son correctos, pedile a Claude que los registre en [[franco]] o en CLAUDE.md._\n';
  }

  md += '\n## Comandos más ejecutados\n' + (comandos.length ? comandos.map(([c, n]) => `- \`${c}\` · ${n}`).join('\n') : '_Sin datos._') + '\n';

  const porProyecto = {};
  datos.pedidos.forEach((p) => { porProyecto[p.proyecto] = (porProyecto[p.proyecto] || 0) + 1; });
  md += '\n## Pedidos por carpeta\n' + Object.entries(porProyecto).sort((a, b) => b[1] - a[1]).map(([p, n]) => `- ${p}: ${n}`).join('\n') + '\n';

  cerebro.escribir(`wiki/informes/repeticiones/${nombre}.md`, md);
  return { nombre, reps };
}

// Agrega o actualiza candidatas: `- **id** — tarea · tipo: x · veces: n · visto: fechas · [[informe]]`
function actualizarCandidatas(reps, informe) {
  const rel = 'wiki/skills/candidatas-a-skill.md';
  let texto = cerebro.leer(rel);
  if (!texto) return { nuevas: 0, actualizadas: 0 };
  let nuevas = 0, actualizadas = 0;
  const lineas = texto.split('\n');

  for (const r of reps) {
    if (!r.id || r.tipo === 'regla') continue; // las reglas van a CLAUDE.md, no son candidatas
    const i = lineas.findIndex((l) => l.includes(`**${r.id}**`));
    if (i >= 0) {
      let l = lineas[i];
      l = l.replace(/visto: ([^·]+)/, (m, f) => (f.includes(HOY) ? m : `visto: ${f.trim()}, ${HOY} `));
      l = l.replace(/veces: (\d+)/, (m, n) => `veces: ${Math.max(Number(n), r.veces)}`);
      lineas[i] = l;
      actualizadas++;
    } else {
      const fin = lineas.findIndex((l, k) => k > lineas.findIndex((x) => x.startsWith('## Candidatas')) && l.startsWith('## '));
      const nueva = `- **${r.id}** — ${r.tarea} · tipo: ${r.tipo} · veces: ${r.veces} · visto: ${HOY} · [[${informe}]]`;
      const pos = fin === -1 ? lineas.length : fin;
      // insertar antes de la línea en blanco previa a la siguiente sección
      lineas.splice(pos > 0 && lineas[pos - 1] === '' ? pos - 1 : pos, 0, nueva);
      nuevas++;
    }
  }
  texto = lineas.join('\n').replace(/^actualizado: .*$/m, `actualizado: ${HOY}`);
  cerebro.escribir(rel, texto);
  return { nuevas, actualizadas };
}

function informeLint(r) {
  const nombre = `${HOY}-lint`;
  cerebro.escribir(`wiki/informes/lint/${nombre}.md`, `---
tipo: informe
resumen: Chequeo de salud del Cerebro (links, frontmatter, índice, huérfanas, pendientes viejos)
proyecto: claude-sistema
fecha: ${HOY}
actualizado: ${HOY}
tags: [informe, lint]
---
# Lint del Cerebro — ${HOY}
Proyecto: [[claude-sistema]] · Repeticiones: [[${HOY}-repeticiones]]

${aMarkdown(r)}`);
  return nombre;
}

(async () => {
  log(`Inicio · ${DIAS} días · Claude: ${USAR_CLAUDE ? cfg.modelo : 'no'}`);
  try {
    const datos = leerConversaciones(DIAS);
    const comandos = topComandos(datos.comandos);
    log(`${datos.sesiones} sesiones, ${datos.pedidos.length} pedidos, ${datos.comandos.length} comandos`);

    let analisis = null, errorClaude = null;
    if (USAR_CLAUDE && datos.pedidos.length) {
      try {
        analisis = consultarClaude(armarPrompt(datos, comandos));
        log(`Claude: ${(analisis.repeticiones || []).length} repeticiones detectadas`);
      } catch (e) {
        errorClaude = e.message.slice(0, 200);
        log(`Claude falló: ${errorClaude}`);
      }
    } else if (!USAR_CLAUDE) {
      errorClaude = 'desactivado con --sin-claude o config';
    }

    const { nombre: infRep, reps } = informeRepeticiones(datos, comandos, analisis, errorClaude);
    const cand = actualizarCandidatas(reps, infRep);
    const resLint = lint({ porCrear: [`${HOY}-lint`] });
    const infLint = informeLint(resLint);

    cerebro.actualizarLineaIndice('- Repeticiones semanales:', `- Repeticiones semanales: \`wiki/informes/repeticiones/\` · último: [[${infRep}]]`);
    cerebro.actualizarLineaIndice('- Lint del Cerebro:', `- Lint del Cerebro: \`wiki/informes/lint/\` · último: [[${infLint}]]`);
    cerebro.agregarLog('informe', `Repeticiones y lint semanal`, [
      `[[${infRep}]] · ${reps.length} repeticiones · candidatas: +${cand.nuevas} nuevas, ${cand.actualizadas} actualizadas`,
      `[[${infLint}]] · ${resLint.total} problemas en ${resLint.paginas} páginas`,
    ]);

    // Auditoría de skills: mensual (primer lunes del mes, día 1 a 7) o forzada.
    const ahora = new Date();
    if (args.includes('--auditoria') || (ahora.getDay() === 1 && ahora.getDate() <= 7)) {
      try {
        const a = auditoriaSkills.ejecutar(DIAS);
        log(`Auditoría de skills: ${a.nombre} · eliminar ${a.eliminar} · revisar ${a.revisar}`);
      } catch (e) {
        log(`Auditoría de skills falló: ${e.message}`);
      }
    }

    if (!args.includes('--sin-commit')) {
      log(cerebro.commit(`informe: repeticiones y lint ${HOY}`) ? 'Commit en el Cerebro OK' : 'Sin commit (nada nuevo o git no disponible)');
    }
    log(`Fin OK · ${infRep} · ${infLint}`);
  } catch (e) {
    log(`ERROR: ${e.stack || e.message}`);
    process.exitCode = 1;
  }
})();
