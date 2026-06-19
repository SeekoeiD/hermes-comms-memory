import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
const execFile = promisify(execFileCb);

export const DATABASE_URL = process.env.COMMS_DATABASE_URL || 'postgresql:///comms_history';
export const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL || 'http://127.0.0.1:3005';

export function makePool() {
  if (process.env.COMMS_DATABASE_URL) return new pg.Pool({ connectionString: DATABASE_URL });
  return new pg.Pool({ database: 'comms_history', host: '/var/run/postgresql' });
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

export async function fetchJson(urlOrPath) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${WA_BRIDGE_URL}${urlOrPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${await res.text()}`);
  return await res.json();
}

export async function runJson(command, args, opts = {}) {
  const { stdout, stderr } = await execFile(command, args, { timeout: opts.timeout || 120000, maxBuffer: opts.maxBuffer || 20 * 1024 * 1024, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });
  const text = stdout.trim();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`Could not parse JSON from ${command} ${args.join(' ')}\nstderr=${stderr}\nstdout=${text.slice(0, 2000)}`); }
}

export async function runText(command, args, opts = {}) {
  const { stdout } = await execFile(command, args, { timeout: opts.timeout || 120000, maxBuffer: opts.maxBuffer || 20 * 1024 * 1024, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });
  return stdout;
}

export function tsFromUnix(ts) {
  if (!ts) return null;
  return new Date(Number(ts) * 1000).toISOString();
}

export function cleanText(s) {
  return String(s || '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\r/g, '').trim();
}

export function key(source, externalId) {
  return `${source}:${externalId}`;
}

export async function startRun(pool, source, notes = '') {
  const r = await pool.query('insert into ingest_runs(source, notes) values($1,$2) returning id', [source, notes]);
  return r.rows[0].id;
}

export async function finishRun(pool, id, stats, ok = true, notes = null) {
  await pool.query(`update ingest_runs set finished_at=now(), conversations_seen=$2, messages_seen=$3, messages_inserted=$4, messages_updated=$5, ok=$6, notes=coalesce($7, notes) where id=$1`,
    [id, stats.conversationsSeen || 0, stats.messagesSeen || 0, stats.inserted || 0, stats.updated || 0, ok, notes]);
}

export async function upsertConversation(pool, conv) {
  const conversationKey = conv.conversationKey || key(conv.source, conv.externalId);
  await pool.query(`insert into conversations(conversation_key, source, external_id, name, kind, is_group, raw, updated_at)
    values($1,$2,$3,$4,$5,$6,$7::jsonb,now())
    on conflict(conversation_key) do update set name=excluded.name, kind=excluded.kind, is_group=excluded.is_group, raw=excluded.raw, updated_at=now()`,
    [conversationKey, conv.source, conv.externalId, conv.name || conv.externalId, conv.kind || null, !!conv.isGroup, JSON.stringify(conv.raw || {})]);
  return conversationKey;
}

export async function upsertMessage(pool, msg) {
  const messageKey = msg.messageKey || key(msg.source, msg.externalId);
  const r = await pool.query(`insert into messages(message_key, source, conversation_key, external_id, message_ts, sender_id, sender_name, recipients, subject, body, preview, from_me, is_read, has_attachments, message_type, web_url, raw, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,now())
    on conflict(message_key) do update set
      conversation_key=excluded.conversation_key, message_ts=coalesce(excluded.message_ts, messages.message_ts), sender_id=excluded.sender_id, sender_name=excluded.sender_name,
      recipients=excluded.recipients, subject=excluded.subject, body=excluded.body, preview=excluded.preview, from_me=excluded.from_me, is_read=excluded.is_read,
      has_attachments=excluded.has_attachments, message_type=excluded.message_type, web_url=excluded.web_url, raw=excluded.raw, updated_at=now()
    returning (xmax = 0) as inserted`,
    [messageKey, msg.source, msg.conversationKey, msg.externalId, msg.messageTs || null, msg.senderId || null, msg.senderName || null, JSON.stringify(msg.recipients || []), msg.subject || '', cleanText(msg.body), cleanText(msg.preview), !!msg.fromMe, msg.isRead ?? null, !!msg.hasAttachments, msg.messageType || null, msg.webUrl || null, JSON.stringify(msg.raw || {})]);
  return r.rows[0]?.inserted ? 'inserted' : 'updated';
}
