import { makePool, parseArgs, runJson, runText, startRun, finishRun, upsertConversation, upsertMessage } from './lib.js';
const args = parseArgs(process.argv);
const max = Number(args.max || process.env.GMAIL_INGEST_MAX || 50);
const includeBodies = String(args.bodies || process.env.GMAIL_INGEST_BODIES || 'true').toLowerCase() !== 'false';
const pool = makePool();
const stats = { conversationsSeen: 0, messagesSeen: 0, inserted: 0, updated: 0 };
const runId = await startRun(pool, 'gmail', `max=${max} bodies=${includeBodies}`);
function addr(v) { if (!v) return null; return v.name && v.addr ? `${v.name} <${v.addr}>` : v.addr || v.name || String(v); }
try {
  const list = await runJson('himalaya', ['envelope', 'list', '-a', 'gmail', '--page-size', String(max), '--output', 'json'], { timeout: 180000 }) || [];
  const seenConvs = new Set();
  for (const item of list) {
    const id = String(item.id || ''); if (!id) continue;
    let body = '';
    if (includeBodies) {
      try {
        const raw = await runText('himalaya', ['message', 'read', '-a', 'gmail', id, '--output', 'json'], { timeout: 180000 });
        try { body = JSON.parse(raw); } catch { body = raw; }
      } catch (_) { body = ''; }
    }
    const subject = item.subject || '(no subject)';
    const convId = subject.toLowerCase().replace(/^(re|fw|fwd):\s*/i, '').slice(0, 180) || id;
    const conversationKey = await upsertConversation(pool, { source: 'gmail', externalId: convId, name: subject, kind: 'email-thread', raw: { subject } });
    if (!seenConvs.has(conversationKey)) { stats.conversationsSeen++; seenConvs.add(conversationKey); }
    stats.messagesSeen++;
    const result = await upsertMessage(pool, { source: 'gmail', conversationKey, externalId: id, messageTs: item.date, senderName: addr(item.from), recipients: [addr(item.to)].filter(Boolean), subject, body, preview: body.slice(0, 500), isRead: Array.isArray(item.flags) ? item.flags.includes('Seen') : null, hasAttachments: !!item.has_attachment, raw: item });
    if (result === 'inserted') stats.inserted++; else stats.updated++;
  }
  await finishRun(pool, runId, stats, true);
  console.log(JSON.stringify({ ok: true, source: 'gmail', runId, ...stats }, null, 2));
} catch (err) { await finishRun(pool, runId, stats, false, String(err.stack || err)); console.error(err.stack || err); process.exitCode = 1; }
finally { await pool.end(); }
