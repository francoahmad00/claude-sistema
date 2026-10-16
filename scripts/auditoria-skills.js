// Auditoría de skills: inventario de skills instaladas, uso en los últimos N días
// (desde las conversaciones de Claude Code), costo en contexto y sugerencias de limpieza.
// Sincroniza las fichas de skills del Cerebro (usos_30d, ultimo_uso) y crea las que falten.
//
// Uso suelto: node scripts/auditoria-skills.js [--dias 30] [--sin-commit]
// También la corre informe-semanal.js el primer lunes de cada mes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerConversaciones } = require('../lib/transcripciones');
const cerebro = require('../lib/cerebro');

const DIR_CLAUDE = path.join(os.homedir(), '.claude');
const DIAS_NUEVA = 30; // una skill instalada hace menos de esto todavía no se evalúa

// Skills que vienen con Claude Code: no se pueden desinstalar.
const INTEGRADAS = new Set(['run', 'init', 'code-review', 'simplify', 'security-review', 'loop', 'schedule',
  'update-config', 'keybindings-help', 'fewer-permission-prompts', 'claude-api', 'plugin-authoring',
  'artifact-design', 'artifact-diagramming', 'artifact-capabilities', 'dataviz']);

const base = (n) => String(n).replace(/^\//, '').split(':').pop().toLowerCase();
const diasDesde = (fecha) => Math.floor((Date.now() - new Date(fecha)) / 864e5);
const tokens = (texto) => Math.ceil((texto || '').length / 4);

function leerSkillMd(archivo) {
  const fm = cerebro.frontmatter(fs.readFileSync(archivo, 'utf8')) || {};
  return { nombre: fm.name || path.basename(path.dirname(archivo)), descripcion: fm.description || '' };
}

function fechaCreacion(p) {
  const s = fs.statSync(p);
  return (s.birthtimeMs ? s.birthtime : s.mtime).toISOString().slice(0, 10);
}

function inventario(cwdsProyectos) {
  const skills = [];

  // 1. Propias globales: ~/.claude/skills/<nombre>/SKILL.md
  const dirSkills = path.join(DIR_CLAUDE, 'skills');
  if (fs.existsSync(dirSkills)) {
    for (const d of fs.readdirSync(dirSkills)) {
      const f = path.join(dirSkills, d, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      skills.push({ ...leerSkillMd(f), origen: 'propia', ruta: f, instalada: fechaCreacion(path.dirname(f)), quitable: true });
    }
  }

  // 2. Sincronizadas desde claude.ai: ~/.claude/skills/synced/<cuenta>/manifest.json
  const dirSync = path.join(dirSkills, 'synced');
  if (fs.existsSync(dirSync)) {
    for (const cuenta of fs.readdirSync(dirSync)) {
      const man = path.join(dirSync, cuenta, 'manifest.json');
      if (!fs.existsSync(man)) continue;
      for (const s of JSON.parse(fs.readFileSync(man, 'utf8')).skills || []) {
        const dir = path.join(dirSync, cuenta, s.skillId || s.name);
        skills.push({
          nombre: s.name, descripcion: s.description || '', origen: 'claude.ai', ruta: dir,
          instalada: fs.existsSync(dir) ? fechaCreacion(dir) : null, quitable: false,
        });
      }
    }
  }

  // 3. Plugins instalados: ~/.claude/plugins/installed_plugins.json → <installPath>/skills/*/SKILL.md
  const inst = path.join(DIR_CLAUDE, 'plugins', 'installed_plugins.json');
  if (fs.existsSync(inst)) {
    const plugins = JSON.parse(fs.readFileSync(inst, 'utf8')).plugins || {};
    for (const [id, versiones] of Object.entries(plugins)) {
      for (const v of [].concat(versiones)) {
        const dir = v && v.installPath && path.join(v.installPath, 'skills');
        if (!dir || !fs.existsSync(dir)) continue;
        for (const d of fs.readdirSync(dir)) {
          const f = path.join(dir, d, 'SKILL.md');
          if (fs.existsSync(f)) skills.push({ ...leerSkillMd(f), origen: `plugin ${id}`, ruta: f,
            instalada: (v.installedAt || fechaCreacion(f)).slice(0, 10), quitable: true });
        }
      }
    }
  }

  // 4. De proyecto: <carpeta de trabajo>/.claude/skills (solo lectura)
  for (const cwd of cwdsProyectos) {
    const dir = path.join(cwd, '.claude', 'skills');
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir)) {
      const f = path.join(dir, d, 'SKILL.md');
      if (fs.existsSync(f)) skills.push({ ...leerSkillMd(f), origen: `proyecto ${path.basename(cwd)}`, ruta: f,
        instalada: fechaCreacion(path.dirname(f)), quitable: true });
    }
  }
  return skills;
}

function auditar(dias = 30) {
  const datos = leerConversaciones(dias);
  const cwds = [...new Set(datos.pedidos.map((p) => p.cwd).filter(Boolean))];
  const skills = inventario(cwds);

  const uso = new Map();
  for (const u of datos.skills) {
    const k = base(u.skill);
    const e = uso.get(k) || { veces: 0, auto: 0, slash: 0, ultimo: '', proyectos: new Set() };
    e.veces++; e[u.via]++; e.proyectos.add(u.proyecto);
    if (u.fecha > e.ultimo) e.ultimo = u.fecha;
    uso.set(k, e);
  }

  for (const s of skills) {
    const u = uso.get(base(s.nombre));
    s.usos = u ? u.veces : 0;
    s.auto = u ? u.auto : 0;
    s.slash = u ? u.slash : 0;
    s.ultimo = u ? u.ultimo : '';
    s.proyectos = u ? [...u.proyectos] : [];
    s.tokens = tokens(s.nombre + s.descripcion);
    const edad = s.instalada ? diasDesde(s.instalada) : Infinity;

    if (s.usos > 0) s.veredicto = 'mantener';
    else if (edad < DIAS_NUEVA) s.veredicto = 'nueva';
    else if (s.quitable) s.veredicto = 'eliminar';
    else s.veredicto = 'revisar';
  }

  // Integradas usadas (no se pueden quitar, pero sirve saber cuáles se usan)
  const nombresInv = new Set(skills.map((s) => base(s.nombre)));
  const integradas = [...uso.entries()].filter(([k]) => !nombresInv.has(k) && INTEGRADAS.has(k))
    .map(([k, u]) => ({ nombre: k, usos: u.veces, ultimo: u.ultimo }));
  const otras = [...uso.entries()].filter(([k]) => !nombresInv.has(k) && !INTEGRADAS.has(k))
    .map(([k, u]) => ({ nombre: k, usos: u.veces, ultimo: u.ultimo }));

  return { dias, skills, integradas, otras, sesiones: datos.sesiones };
}

// Actualiza (o crea) las fichas del Cerebro de skills propias, de plugin y de proyecto.
function sincronizarCerebro(res) {
  const hoy = cerebro.hoy();
  const creadas = [], actualizadas = [];
  let indice = cerebro.leer('index.md');

  for (const s of res.skills.filter((x) => x.origen !== 'claude.ai')) {
    const slug = base(s.nombre).replace(/[^a-z0-9-]+/g, '-');
    const rel = `wiki/skills/${slug}.md`;
    let texto = cerebro.leer(rel);
    if (!texto) {
      const resumen = s.descripcion.replace(/\s+/g, ' ').slice(0, 140);
      texto = `---\ntipo: skill\nresumen: ${resumen}\nproyecto: general\norigen: ${s.origen}\nruta: "${s.ruta.replace(/\\/g, '/')}"\nusos_30d: 0\nultimo_uso: \nactualizado: ${hoy}\naliases: [${s.nombre}]\ntags: [skill]\n---\n# ${s.nombre}\n\n${s.descripcion}\n`;
      creadas.push(slug);
      if (!indice.includes(`[[${slug}]]`)) {
        indice = indice.replace(/(## Skills\n)/, `$1- [[${slug}]] — ${resumen}\n`);
      }
    } else {
      actualizadas.push(slug);
    }
    // Campos de uso en el frontmatter (si no existen, se agregan antes de `actualizado:`)
    const set = (t, k, v) => (new RegExp(`^${k}:.*$`, 'm').test(t) ? t.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`)
      : t.replace(/^actualizado:/m, `${k}: ${v}\nactualizado:`));
    texto = set(set(set(texto, 'usos_30d', s.usos), 'ultimo_uso', s.ultimo || ''), 'actualizado', hoy);
    cerebro.escribir(rel, texto);
  }
  cerebro.escribir('index.md', indice);

  // Fichas de skills que ya no están instaladas
  const instaladas = new Set(res.skills.map((s) => base(s.nombre)));
  const huerfanas = cerebro.listarPaginas()
    .filter((p) => p.startsWith('wiki/skills/'))
    .filter((p) => (cerebro.frontmatter(cerebro.leer(p)) || {}).ruta)
    .filter((p) => !instaladas.has(path.basename(p, '.md')));

  return { creadas, actualizadas, huerfanas };
}

function escribirInforme(res, sync) {
  const hoy = cerebro.hoy();
  const nombre = `${hoy}-auditoria-skills`;
  const total = res.skills.reduce((n, s) => n + s.tokens, 0);
  const grupo = (v) => res.skills.filter((s) => s.veredicto === v).sort((a, b) => b.tokens - a.tokens);
  const fila = (s) => `| ${s.nombre} | ${s.origen} | ${s.usos}${s.usos ? ` (${s.auto} auto, ${s.slash} /)` : ''} | ${s.ultimo || '—'} | ~${s.tokens} | ${s.instalada || '—'} |`;
  const tabla = (lista) => lista.length
    ? '| Skill | Origen | Usos | Último uso | Tokens/sesión | Instalada |\n|---|---|---|---|---|---|\n' + lista.map(fila).join('\n') + '\n'
    : '_Ninguna._\n';

  const eliminar = grupo('eliminar'), revisar = grupo('revisar');
  const ahorro = [...eliminar, ...revisar].reduce((n, s) => n + s.tokens, 0);

  let md = `---
tipo: informe
resumen: Auditoría de skills instaladas, uso en los últimos ${res.dias} días y sugerencias de limpieza
proyecto: claude-sistema
fecha: ${hoy}
actualizado: ${hoy}
tags: [informe, skills]
---
# Auditoría de skills — ${hoy}
Proyecto: [[claude-sistema]] · Skills: [[cuestionar]], [[cerrar-sesion]] · [[candidatas-a-skill]]

**${res.skills.length} skills instaladas** · ${res.sesiones} sesiones analizadas (${res.dias} días) · las descripciones ocupan **~${total} tokens en cada sesión**.
Si se quitan las sugeridas abajo: ahorro de ~${ahorro} tokens por sesión.

## Sugeridas para eliminar (${eliminar.length})
Sin uso en ${res.dias} días y con más de ${DIAS_NUEVA} días instaladas.
${tabla(eliminar)}`;
  if (eliminar.length) md += '\nPara quitar una: pedile a Claude *"desinstalá la skill <nombre>"* (propias: borrar su carpeta en `~/.claude/skills/`; plugins: `/plugin`).\n';

  md += `
## Revisar: skills de claude.ai sin uso en Claude Code (${revisar.length})
Se administran desde claude.ai (Configuración → Capacidades → Skills). **Pueden estar usándose en el chat de claude.ai**, que este informe no ve: desactivalas solo si no las usás en ningún lado.
${tabla(revisar)}
## En uso (${grupo('mantener').length})
${tabla(grupo('mantener'))}
## Nuevas, todavía sin evaluar (${grupo('nueva').length})
Instaladas hace menos de ${DIAS_NUEVA} días.
${tabla(grupo('nueva'))}`;

  if (res.integradas.length) {
    md += `\n## Integradas de Claude Code usadas\nNo se pueden quitar; sirve para ver qué usás.\n` +
      res.integradas.sort((a, b) => b.usos - a.usos).map((s) => `- \`${s.nombre}\` · ${s.usos} · último ${s.ultimo}`).join('\n') + '\n';
  }
  if (res.otras.length) {
    md += `\n## Usadas pero ya no instaladas\n` + res.otras.map((s) => `- \`${s.nombre}\` · ${s.usos} · último ${s.ultimo}`).join('\n') + '\n';
  }

  md += `\n## Fichas en el Cerebro\n- Creadas: ${sync.creadas.map((s) => `[[${s}]]`).join(', ') || 'ninguna'}\n- Actualizadas (usos_30d, ultimo_uso): ${sync.actualizadas.map((s) => `[[${s}]]`).join(', ') || 'ninguna'}\n`;
  if (sync.huerfanas.length) md += `- **Fichas de skills ya no instaladas** (mover a "Descartadas" o borrar): ${sync.huerfanas.map((p) => `\`${p}\``).join(', ')}\n`;

  md += `\n_Limitaciones: Claude Code borra las conversaciones de más de 30 días (\`cleanupPeriodDays\`), y no ve el uso en el chat de claude.ai._\n`;
  cerebro.escribir(`wiki/informes/auditoria-skills/${nombre}.md`, md);
  return { nombre, eliminar: eliminar.length, revisar: revisar.length, total, ahorro };
}

// Corre todo: auditar, sincronizar fichas, informe, índice y log. Devuelve el resumen.
function ejecutar(dias = 30) {
  const res = auditar(dias);
  const sync = sincronizarCerebro(res);
  const inf = escribirInforme(res, sync);
  cerebro.actualizarLineaIndice('- Auditoría de skills:', `- Auditoría de skills: \`wiki/informes/auditoria-skills/\` · último: [[${inf.nombre}]]`);
  cerebro.agregarLog('informe', 'Auditoría de skills', [
    `[[${inf.nombre}]] · ${res.skills.length} instaladas · eliminar: ${inf.eliminar} · revisar: ${inf.revisar} · ~${inf.total} tokens/sesión`,
  ]);
  return inf;
}

module.exports = { auditar, ejecutar };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dias = Number(args[args.indexOf('--dias') + 1]) || 30;
  const inf = ejecutar(dias);
  console.log(`Informe: wiki/informes/auditoria-skills/${inf.nombre}.md`);
  console.log(`Eliminar: ${inf.eliminar} · Revisar: ${inf.revisar} · ~${inf.total} tokens/sesión (ahorro posible ~${inf.ahorro})`);
  if (!args.includes('--sin-commit')) cerebro.commit(`informe: auditoría de skills ${cerebro.hoy()}`);
}
