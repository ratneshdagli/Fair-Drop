#!/usr/bin/env bash
# Seed 50,000 synthetic verified users (idempotent). No phones, no SMS.
cd "$(dirname "$0")/.." && docker compose exec -T attack python -m attack_engine seed
