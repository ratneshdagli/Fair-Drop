# Dependencies (and why)

| area | library | why | alternative rejected |
|---|---|---|---|
| Go | `go-chi/chi` v5 | tiny router, std `net/http` handlers | gin/fiber: bigger, non-std context |
| Go | `redis/go-redis` v9 | Lua `EvalSha`, Streams, consumer groups | redigo: no pipelining ergonomics |
| Go | `golang-jwt/jwt` v5 | HS256 sessions | hand-rolled JWT: security risk |
| Go | `jackc/pgx` v5 | pool + batch inserts for the ledger | `database/sql`+lib/pq: slower, unmaintained |
| Go | `cloudflare/circl` (blindsign/blindrsa) | RFC 9474 implementation, needs Go ≥ 1.25 | writing RSA blinding ourselves |
| Go | `prometheus/client_golang` | `/metrics` | custom exposition |
| Infra | Redis 7, Postgres 16, Nginx, Prometheus, Grafana | state, record, gateway/failover, metrics, dashboards | |
| Attack | `locust`, `gevent` | the required load engine; FastHttpUser scales to 2,000 users/process | k6 (not Python, harder to model actors) |
| Attack | `requests`, `numpy`, `matplotlib` | control calls, scoring math, report charts | pandas (unneeded) |
| Web | Next.js 16 (App Router), React 19, Tailwind 4 | fan + admin UI | CRA/Vite: no routing/SSR bundle story |
| Web | `@cloudflare/blindrsa-ts` | browser side of RFC 9474, interoperates with circl (tested against the live stack) | |
| Web | `@noble/hashes` | SHA-256 without `crypto.subtle` (unavailable on plain http) | `crypto.subtle` |
| Web | `recharts`, `qrcode`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` | charts, ticket QR, UI primitives | full shadcn CLI (hand-written primitives are ~100 lines) |
| Test | Go `testing`, `pytest`, `vitest` | per-language unit/e2e | |

Versions are pinned by `backend/go.sum`, `frontend/package-lock.json`, and `attack_engine/requirements.txt`.
