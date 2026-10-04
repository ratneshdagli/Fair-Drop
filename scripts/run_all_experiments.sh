#!/usr/bin/env bash
# usage: scripts/run_all_experiments.sh [--scale 1.0] [--also-fcfs]
cd "$(dirname "$0")/.." && docker compose exec -T attack python -m attack_engine all "$@"
