# Perf / lag notes (source-only, NOT deployed)

## Files changed
- backend/internal/app/admincache.go (new), admincache_test.go (new), app.go (field `adm`), http.go (`ad.Use(a.adminLayer)`; `requireTest` clears cache on test writes)
- infra/nginx/nginx.conf
- frontend/lib/api.ts (`usePoll`)

## Deploy
1. Go: rebuild images api1, api2, api3 (and worker if it shares the image). `go vet` + `go test` pass.
2. nginx: `nginx -s reload` (config syntax-checked with `nginx -t` in a throwaway container).
3. Frontend: rebuild the frontend image (usePoll).

## What each does
- Admin read layer (all GET /admin/* except /live): 1 s TTL cache + request coalescing per path+query, after auth.
  N tabs polling /drops, /protection, /pulse, /feed, /audit, /experiments cost one computation per second per replica
  instead of N. POSTs under /admin and /test/* clear the cache; X-Test-Key requests (TestMode) bypass it. Only 200s cached.
  Max staleness 1 s (per replica; 3 replicas => up to 3 computations/s per key).
- Backend per-IP token bucket on /admin (20 r/s, burst 40, 429 + Retry-After); X-Test-Key (valid, TestMode) and /live exempt.
- nginx: limit_req 20r/s burst 40 nodelay on /api/admin/ (SSE /live regex location stays unlimited) and /attack/, 429.
  Fan endpoints and /api/test/ untouched. gzip extended to css/js/svg. /_next/static caching: Next already sends immutable headers; not changed.
- usePoll: skips re-render on identical payloads, +/-10% jitter, 3x slower when window unfocused, back-off up to 8x on repeated errors.

## Optional call-site change (not done, components not mine)
`usePoll(fn, ms, deps, key)`: pass a 4th arg key (e.g. `"drops"`, `"prot:"+id`) so multiple components in one tab share one request per tick.

## Not verified
- No live run: nothing deployed, behaviour under real browser load unmeasured. Cache/limiter covered only by a unit test.
- Admin 429s: frontend `api()` throws ApiError on 429; with 20 r/s per IP a normal dashboard should not hit it, but many tabs behind one NAT could.
