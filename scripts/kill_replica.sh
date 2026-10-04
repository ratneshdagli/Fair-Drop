#!/usr/bin/env bash
# Kill one API replica abruptly (default api2); compose restarts it. Traffic keeps flowing via nginx failover.
cd "$(dirname "$0")/.." && docker kill "fd-api-${1:-2}" && echo "killed fd-api-${1:-2}; watch Admin > Live monitor and Grafana"
