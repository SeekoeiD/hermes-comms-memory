import { spawnSync } from 'node:child_process';
const scripts = ['ingest_whatsapp.js', 'ingest_ms365.js', 'ingest_gmail.js'];
let ok = true;
for (const script of scripts) {
  console.log(`\n=== ${script} ===`);
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) ok = false;
}
process.exit(ok ? 0 : 1);
