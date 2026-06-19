#!/usr/bin/env bash
set -euo pipefail
cat >/etc/systemd/system/comms-history-poller.service <<'UNIT'
[Unit]
Description=Hermes unified communications history poller
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/hermes-comms-memory
Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=WA_INGEST_TOP=100
Environment=WA_INGEST_LIMIT=200
Environment="WA_SPECIAL_CHAT=example project group"
Environment=WA_SPECIAL_LIMIT=1500
Environment=MS365_INGEST_MAX=50
Environment=MS365_INGEST_BODIES=false
Environment=GMAIL_INGEST_MAX=50
Environment=GMAIL_INGEST_BODIES=false
ExecStart=/usr/local/bin/npm run ingest
UNIT
cat >/etc/systemd/system/comms-history-poller.timer <<'UNIT'
[Unit]
Description=Run Hermes unified communications history poller every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
AccuracySec=1min
Persistent=true
Unit=comms-history-poller.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now comms-history-poller.timer
systemctl start comms-history-poller.service
systemctl status comms-history-poller.timer --no-pager
