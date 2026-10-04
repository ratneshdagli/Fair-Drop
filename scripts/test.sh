#!/usr/bin/env bash
# Backend tests: unit + integration (Redis db 15, Postgres db fairdrop_test) against the compose stack.
cd "$(dirname "$0")/.." || exit 1
docker compose up -d redis postgres >/dev/null 2>&1
sleep 2
docker exec fd-postgres psql -U fairdrop -d fairdrop -c "CREATE DATABASE fairdrop_test" >/dev/null 2>&1
NET=$(docker inspect fd-redis --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
cd backend && MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" -v "$(pwd -W 2>/dev/null || pwd):/src" -v fd-gomod:/go/pkg/mod -v fd-gocache:/root/.cache/go-build -w /src \
  -e REDIS_ADDR=redis:6379 -e PG_DSN="postgres://fairdrop:fairdrop@postgres:5432/fairdrop_test?sslmode=disable" -e TEST_KEY=test-key-demo \
  golang:1.25-alpine go test -count=1 -timeout 300s "${@:-./...}"
