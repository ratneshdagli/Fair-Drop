#!/usr/bin/env bash
# Run Go commands in Docker (no host Go needed). Usage: scripts/gotest.sh test ./...
cd "$(dirname "$0")/../backend" || exit 1
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/src" -v "$(cd .. && pwd -W 2>/dev/null || pwd)/docs:/docs" \
  -v fd-gomod:/go/pkg/mod -v fd-gocache:/root/.cache/go-build -w /src ${GO_ENV:-} golang:1.25-alpine go "$@"
