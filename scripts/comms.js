#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] || 'status';
const rest = process.argv.slice(3);
const map = { status: 'status.js', search: 'search.js', ingest: 'ingest_all.js', 'ingest:whatsapp': 'ingest_whatsapp.js', 'ingest:ms365': 'ingest_ms365.js', 'ingest:gmail': 'ingest_gmail.js' };
if (!map[cmd]) { console.error(`Usage: comms ${Object.keys(map).join('|')} ...`); process.exit(2); }
const r = spawnSync(process.execPath, [path.join(here, map[cmd]), ...rest], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
