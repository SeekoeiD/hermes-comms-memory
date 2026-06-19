# hermes-comms-memory

Local-first PostgreSQL communications memory/search layer for Hermes Agent.

It stores normalized messages from connectors such as WhatsApp, Gmail, and Microsoft 365, then exposes a `comms` CLI for status/search/ingestion.

## Security

This repo contains code only. Do not commit tokens, exports, session directories, database dumps, or real messages.

## Install

```bash
git clone https://github.com/SeekoeiD/hermes-comms-memory.git
cd hermes-comms-memory
npm install
npm run schema
npm link
```

## Use

```bash
comms status
comms search "project terms" --limit 10
comms ingest
```

Configure connectors using environment variables and installed connector CLIs.
