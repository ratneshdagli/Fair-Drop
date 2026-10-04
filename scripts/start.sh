#!/usr/bin/env bash
# Build and start the whole stack. Gateway: http://localhost:${GATEWAY_PORT:-8088}
cd "$(dirname "$0")/.." && docker compose up -d --build || exit 1
# The gateway looks the 3 web servers up once at start-up. If any server was rebuilt it has a new address, so the gateway
# must reload or it keeps sending everything to the servers it still can reach (one server then takes all the load).
sleep 3 && docker exec fd-nginx nginx -s reload >/dev/null 2>&1
echo "Fair Drop: http://localhost:${GATEWAY_PORT:-8088}  admin: /admin  grafana: http://localhost:3001  prometheus: http://localhost:9090"
