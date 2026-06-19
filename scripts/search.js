import { makePool, parseArgs } from './lib.js';
const args = parseArgs(process.argv);
const q = args.query || args.q || args._.join(' ');
const limit = Number(args.limit || 25);
if (!q) { console.error('Usage: npm run search -- "query" [--limit 25]'); process.exit(2); }
const pool = makePool();
const r = await pool.query(`select m.source, c.name as conversation, m.message_ts, m.sender_name, m.subject,
  left(coalesce(nullif(m.body,''), m.preview), 1000) as text, m.web_url,
  ts_rank_cd(m.search_tsv, websearch_to_tsquery('english', $1)) as rank
from messages m join conversations c on c.conversation_key=m.conversation_key
where m.search_tsv @@ websearch_to_tsquery('english', $1)
   or m.body ilike '%' || $1 || '%'
   or m.preview ilike '%' || $1 || '%'
   or m.subject ilike '%' || $1 || '%'
   or c.name ilike '%' || $1 || '%'
order by rank desc, m.message_ts desc nulls last
limit $2`, [q, limit]);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
