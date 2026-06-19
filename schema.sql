-- Unified local communications history for Hermes Agent.
SELECT 'CREATE DATABASE comms_history'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'comms_history')\gexec
\connect comms_history

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS sources (
  source text PRIMARY KEY,
  kind text NOT NULL,
  account text,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sources(source, kind, account, config) VALUES
  ('whatsapp', 'whatsapp', 'user@example.com', '{"bridge":"http://127.0.0.1:3005"}'::jsonb),
  ('ms365', 'email', 'user@company.example', '{"command":"ms365-mail"}'::jsonb),
  ('gmail', 'email', 'user@example.com', '{"command":"himalaya", "account":"gmail"}'::jsonb)
ON CONFLICT (source) DO UPDATE SET account=EXCLUDED.account, config=sources.config || EXCLUDED.config, updated_at=now();

CREATE TABLE IF NOT EXISTS conversations (
  conversation_key text PRIMARY KEY,
  source text NOT NULL REFERENCES sources(source) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text,
  kind text,
  is_group boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS messages (
  message_key text PRIMARY KEY,
  source text NOT NULL REFERENCES sources(source) ON DELETE CASCADE,
  conversation_key text NOT NULL REFERENCES conversations(conversation_key) ON DELETE CASCADE,
  external_id text NOT NULL,
  message_ts timestamptz,
  sender_id text,
  sender_name text,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  preview text NOT NULL DEFAULT '',
  from_me boolean NOT NULL DEFAULT false,
  is_read boolean,
  has_attachments boolean NOT NULL DEFAULT false,
  message_type text,
  web_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(subject,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(preview,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(sender_name,'')), 'B')
  ) STORED,
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS messages_source_ts_idx ON messages(source, message_ts DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS messages_conv_ts_idx ON messages(conversation_key, message_ts DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING gin(search_tsv);
CREATE INDEX IF NOT EXISTS messages_body_trgm_idx ON messages USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS messages_subject_trgm_idx ON messages USING gin (subject gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  conversations_seen integer NOT NULL DEFAULT 0,
  messages_seen integer NOT NULL DEFAULT 0,
  messages_inserted integer NOT NULL DEFAULT 0,
  messages_updated integer NOT NULL DEFAULT 0,
  ok boolean,
  notes text
);

CREATE TABLE IF NOT EXISTS summaries (
  summary_key text PRIMARY KEY,
  source text,
  conversation_key text REFERENCES conversations(conversation_key) ON DELETE CASCADE,
  scope text NOT NULL,
  title text,
  summary text NOT NULL,
  first_message_ts timestamptz,
  last_message_ts timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW recent_messages AS
SELECT m.message_ts, m.source, c.name AS conversation, m.sender_name, m.subject,
       left(coalesce(nullif(m.body,''), m.preview), 500) AS text, m.web_url, m.message_key
FROM messages m JOIN conversations c ON c.conversation_key=m.conversation_key
ORDER BY m.message_ts DESC NULLS LAST;

CREATE OR REPLACE VIEW source_stats AS
SELECT s.source, s.kind, s.account,
       count(DISTINCT c.conversation_key)::int AS conversations,
       count(DISTINCT m.message_key)::int AS messages,
       max(m.message_ts) AS latest_message_ts
FROM sources s
LEFT JOIN conversations c ON c.source=s.source
LEFT JOIN messages m ON m.source=s.source
GROUP BY s.source, s.kind, s.account
ORDER BY s.source;
