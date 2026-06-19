import { makePool, parseArgs, fetchJson, startRun, finishRun, upsertConversation, upsertMessage, tsFromUnix, key } from './lib.js';
const args = parseArgs(process.argv);
const top = Number(args.top || process.env.WA_INGEST_TOP || 100);
const limit = Number(args.limit || process.env.WA_INGEST_LIMIT || 200);
const special = String(args.special || process.env.WA_SPECIAL_CHAT || 'example project group');
const specialLimit = Number(args.specialLimit || process.env.WA_SPECIAL_LIMIT || 1500);
const qs = new URLSearchParams({ top: String(top), limit: String(limit), special, specialLimit: String(specialLimit) });
const pool = makePool();
const stats = { conversationsSeen: 0, messagesSeen: 0, inserted: 0, updated: 0 };
const runId = await startRun(pool, 'whatsapp', `top=${top} limit=${limit} special=${special} specialLimit=${specialLimit}`);
try {
  const data = await fetchJson(`/admin/export?${qs.toString()}`);
  for (const item of data.chats || []) {
    const chat = item.chat || {};
    const externalId = chat.id;
    if (!externalId) continue;
    stats.conversationsSeen++;
    const conversationKey = await upsertConversation(pool, { source: 'whatsapp', externalId, name: chat.name, kind: chat.isGroup ? 'group' : 'direct', isGroup: !!chat.isGroup, raw: chat });
    for (const m of item.messages || []) {
      if (!m.id) continue;
      stats.messagesSeen++;
      const text = m.body || m.caption || '';
      const result = await upsertMessage(pool, { source: 'whatsapp', conversationKey, externalId: m.id, messageTs: tsFromUnix(m.timestamp), senderId: m.author || m.from, senderName: m.senderName, recipients: [m.to].filter(Boolean), subject: chat.name || '', body: text, preview: text.slice(0, 300), fromMe: !!m.fromMe, hasAttachments: !!m.hasMedia, messageType: m.type, raw: m });
      if (result === 'inserted') stats.inserted++; else stats.updated++;
    }
  }
  await finishRun(pool, runId, stats, true);
  console.log(JSON.stringify({ ok: true, source: 'whatsapp', runId, ...stats }, null, 2));
} catch (err) {
  await finishRun(pool, runId, stats, false, String(err.stack || err));
  console.error(err.stack || err); process.exitCode = 1;
} finally { await pool.end(); }
