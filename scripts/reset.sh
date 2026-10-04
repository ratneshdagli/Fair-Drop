#!/usr/bin/env bash
# Full reset: wipes all volumes (drops, entries, audit, users) then restarts and reseeds users.
cd "$(dirname "$0")/.." && docker compose down -v && docker compose up -d --build && sleep 8 && ./scripts/seed.sh
