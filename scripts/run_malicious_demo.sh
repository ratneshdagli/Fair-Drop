#!/usr/bin/env bash
# Experiment 7: server silently drops one entry; the fan verify page must turn red. Report: reports/exp7_malicious_server/
cd "$(dirname "$0")/.." && docker compose exec -T attack python -m attack_engine run exp7 --scale "${1:-0.02}"
