// Apunta los hooks y la statusline de ~/.claude/settings.json a la ubicación actual de este repo.
// Lo llama scripts/instalar.ps1; se puede correr solo.
// Uso: node scripts/instalar-hooks.js [--seco]
//   --seco            muestra qué cambiaría, sin escribir
//   CLAUDE_SETTINGS   otra ruta de settings.json (para probar sobre una copia)
const fs = require('fs');
const os = require('os');
const path = require('path');

const SECO = process.argv.includes('--seco');
const RAIZ = path.join(__dirname, '..').replace(/\\/g, '/');
const SETTINGS = process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');

const comando = (archivo) => `node "${RAIZ}/hooks/${archivo}"`;
const esNuestro = (cmd, archivo) =>
  typeof cmd === 'string' && new RegExp(`hooks[\\\\/]${archivo.replace('.', '\\.')}`).test(cmd);

// Hooks del sistema: evento → archivo y opciones
const HOOKS = [
  { evento: 'SessionStart', archivo: 'contexto-proyecto.js', timeout: 10 },
  { evento: 'UserPromptSubmit', archivo: 'aviso-contexto.js', timeout: 10 },
];

const original = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, 'utf8') : '{}';
const cfg = JSON.parse(original);
const cambios = [];

// statusLine
const cmdStatus = comando('statusline.js');
if (!cfg.statusLine || cfg.statusLine.command !== cmdStatus) {
  if (cfg.statusLine && !esNuestro(cfg.statusLine.command, 'statusline.js')) {
    cambios.push(`statusLine: se reemplaza una ajena (${cfg.statusLine.command})`);
  } else {
    cambios.push(`statusLine → ${cmdStatus}`);
  }
  cfg.statusLine = { type: 'command', command: cmdStatus };
}

// hooks
cfg.hooks = cfg.hooks || {};
for (const h of HOOKS) {
  const cmd = comando(h.archivo);
  const grupos = (cfg.hooks[h.evento] = cfg.hooks[h.evento] || []);
  const encontrados = grupos.flatMap((g) => (g.hooks || []).filter((x) => esNuestro(x.command, h.archivo)));
  if (encontrados.length === 0) {
    grupos.push({ hooks: [{ type: 'command', command: cmd, timeout: h.timeout }] });
    cambios.push(`${h.evento}: se agrega ${h.archivo}`);
  }
  for (const x of encontrados) {
    if (x.command !== cmd) {
      cambios.push(`${h.evento}: ${x.command} → ${cmd}`);
      x.command = cmd;
    }
  }
}

if (cambios.length === 0) {
  console.log(`settings.json ya apunta a ${RAIZ}. Sin cambios.`);
  process.exit(0);
}

console.log(`${SECO ? '[en seco] ' : ''}Cambios en ${SETTINGS}:`);
for (const c of cambios) console.log(`  - ${c}`);
if (SECO) process.exit(0);

if (fs.existsSync(SETTINGS)) {
  const sello = new Date().toISOString().slice(0, 23).replace(/[:T.]/g, '-');
  const dirBackup = path.join(path.dirname(SETTINGS), 'backups');
  fs.mkdirSync(dirBackup, { recursive: true });
  const backup = path.join(dirBackup, `settings.json.bak-${sello}`);
  fs.copyFileSync(SETTINGS, backup);
  console.log(`Backup: ${backup}`);
}
fs.writeFileSync(SETTINGS, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('settings.json actualizado.');
