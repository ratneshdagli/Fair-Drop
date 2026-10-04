#!/usr/bin/env bash
# usage: scripts/run_experiment.sh exp1..exp7 [--scale 0.1] [--also-fcfs]   (reports/<exp>/)
cd "$(dirname "$0")/.." && docker compose exec -T attack python -m attack_engine run "$@"
