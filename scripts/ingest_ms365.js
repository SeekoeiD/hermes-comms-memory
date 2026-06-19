import { makePool, parseArgs, runJson, startRun, finishRun, upsertConversation, upsertMessage } from './lib.js';
const args = parseArgs(process.argv);
const max = Number(args.max || process.env.MS365_INGEST_MAX || 50);
const includeBodies = String(args.bodies || process.env.MS365_INGEST_BODIES || 'true').toLowerCase() !== 'false';
const pool = makePool();
const stats = { conversationsSeen: 0, messagesSeen: 0, inserted: 0, updated: 0 };
const runId = await startRun(pool, 'ms365', `max=${max} bodies=${includeBodies}`);
try {
  const list = await runJson('ms365-mail', ['list', '--max', String(max)], { timeout: 180000 }) || [];
  const seenConvs = new Set();
  for (const item of list) {
    const id = item.id; if (!id) continue;
    let full = item;
    if (includeBodies) {
      try { full = await runJson('ms365-mail', ['read', id], { timeout: 180000 }) || item; } catch (_) { full = item; }
    }
    const subject = full.subject || item.subject || '(no subject)';
    const convId = subject.toLowerCase().replace(/^(re|fw|fwd):\s*/i, '').slice(0, 180) || id;
    const conversationKey = await upsertConversation(pool, { source: 'ms365', externalId: convId, name: subject, kind: 'email-thread', raw: { subject } });
    if (!seenConvs.has(conversationKey)) { stats.conversationsSeen++; seenConvs.add(conversationKey); }
    stats.messagesSeen++;
    const result = await upsertMessage(pool, { source: 'ms365', conversationKey, externalId: id, messageTs: full.receivedDateTime || item.receivedDateTime, senderName: full.from || item.from, subject, body: full.body || item.bodyPreview || '', preview: item.bodyPreview || full.bodyPreview || '', isRead: full.isRead ?? item.isRead, hasAttachments: !!(full.hasAttachments ?? item.hasAttachments), webUrl: full.webLink || item.webLink, raw: full });
    if (result === 'inserted') stats.inserted++; else stats.updated++;
  }
  await finishRun(pool, runId, stats, true);
  console.log(JSON.stringify({ ok: true, source: 'ms365', runId, ...stats }, null, 2));
} catch (err) { await finishRun(pool, runId, stats, false, String(err.stack || err)); console.error(err.stack || err); process.exitCode = 1; }
finally { await pool.end(); }
