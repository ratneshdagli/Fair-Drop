# API contract

All paths are served by nginx under `/api` (`http://localhost:8088/api/...`). JSON in/out. Errors are `{"error": "<code>", "detail": "..."}` with a matching HTTP status. `Authorization: Bearer <JWT>` for fan (`role=user`) and admin (`role=admin`) endpoints. The SSE stream also accepts `?access_token=` because `EventSource` cannot set headers.

## Auth
| Method & path | Body | Result |
|---|---|---|
| `POST /auth/otp` | `{phone}` | Simulated OTP. In dev the code is returned (`dev_code`) and **no SMS is sent** |
| `POST /auth/verify` | `{phone, code}` | `{token, user_id, verified_at}`. The identity is verified once, at that time |
| `POST /admin/login` | `{username, password}` | `{token}` (role `admin`) |

## Public drop info
| | |
|---|---|
| `GET /drops`, `GET /drops/{id}` | State, tiers, window, cutoff, `seed_hash` (published at creation), RSA `public_key` (JWK/SPKI), `token_mode`, once open/closed the real instants `opened_at_ms` / `closed_at_ms` (Redis TIME), and once locked the `merkle_root` + `entry_count`; after reveal the `seed` and beacon |
| `GET /drops/{id}/proof/{receipt}` | Merkle inclusion proof for one receipt (after LOCKED) |
| `GET /drops/{id}/result/{receipt}` | Rank, win/lose, tier, seat, ECDSA-signed receipt (after DRAWN) |
| `GET /drops/{id}/verify` | Everything needed to recompute the draw offline: sorted `(receipt, tier)` list, root, seed, beacon, ordering. Same bundle the browser verifier and `verifier/verify.py` consume |
| `GET /drops/{id}/seats` | Seat map with claim state |
| `GET /healthz`, `GET /metrics` | Liveness (also pings Redis) and Prometheus |

## Entry (the two-step, unlinkable flow)
1. `POST /drops/{id}/token` (**authenticated**): `{blinded_msg}` (RFC 9474 blinded message; or `{token_secret}` in plain mode). Returns `{blind_sig}`. Exactly one per verified identity per drop (`409 already_issued`; idempotent replay of the *same* request returns the same signature). `403 ineligible` if verified after the cutoff. `409 closed` outside OPEN.
2. `POST /drops/{id}/register` (**no session, no cookie, no user id**): `{token_secret, signature, tier}`. The server verifies the signature against the drop key, atomically spends the token in Redis (one-time) and returns `{receipt_id, receipt_sig}` where `receipt_id = H(token_secret)`. Replaying the same token returns the same receipt (idempotent); using it for a different tier is rejected (`409`).
3. `POST /drops/{id}/register-fast`: decoy (tarpit). Looks like a faster path to entry, does nothing for allocation, and counts as a tarpit hit.

The server cannot link a receipt to an account: it signed a blinded value.

## Lifecycle (admin)
`POST /admin/drops/{id}/advance {"to": "OPEN|CLOSED|LOCKED|DRAWN|CLAIM|SETTLED"}`: compare-and-set in Redis; illegal transition = `409 {state, allowed}`. Timers (worker) advance automatically when `auto_draw` is on. `SCHEDULED→OPEN→CLOSED→LOCKED→DRAWN→CLAIM→SETTLED`; `fcfs` drops use `SCHEDULED→OPEN→CLOSED→SETTLED`.

`POST /admin/events {name, venue, starts_at, tiers:[{name, price_cents, seats}]}` · `POST /admin/drops {event_id, mode: fairdrop|fcfs, opens_at, closes_at, cutoff_at, claim_sec, auto_draw}` (generates the seed + `seed_hash`, the per-drop RSA/EC keys).

## Claims
`POST /drops/{id}/claim {receipt_id, ...}` (authenticated winner): claims the seat within the claim window; expired or declined seats cascade to the next waitlist rank. `GET /me/tickets` returns tickets with the ECDSA ticket signature (QR payload).

## FCFS baseline
`POST /baseline/{id}/buy` (authenticated): classic first-come-first-served; `GET /baseline/{id}/status` public sold-out status.

## Admin read APIs
`GET /admin/{events,drops}`, `/admin/drops/{id}/live` (SSE), `/admin/drops/{id}/feed?after=<id>` (sampled stream of accept/reject decisions with who/why, plus exact 3-second rates), `/admin/drops/{id}/protection` (confusion matrix + per-reason audit + per-bot-type breakdown `by_profile`, see FAIRNESS_METRICS), `/admin/drops/{id}/pulse` (the Control Room in one call: tickets sold/left, requests in flight, database writes waiting, typical/slow/slowest wait, 5xx count, server list, Redis and Postgres stats), `/counterfactuals`, `/audit?limit=&verify=1` (hash-chain verification), `/integrity` (six violation counters), `/claims`, `/baseline`, `/admin/experiments[/{id}]`, `/admin/config`.

## TEST_MODE only (`X-Test-Key`, 404 otherwise)
`POST /test/seed {count}` · `POST /test/login {user_id}` (JWT without OTP) · `POST /drops/{id}/test-token` (a plain token for a test user) · `POST /drops/{id}/test-link {token_msg}` (evaluation only: a bot that blinded its own token via the real `/token` tells the scorer which account owns the receipt; never read by allocation) · `POST /test/reset {drop_id, state, window_sec, claim_sec}` · `POST|GET /test/labels` · `POST /test/malicious {drop_id, enabled, receipt_id|user_id}` · `POST /test/config {guard:{enabled, ip_limit, acct_limit}}` · `POST /test/experiments` (attack engine pushes results) · `POST /test/die` (replica `exit 137`) · `POST /test/tamper-audit {repair}` · `POST /test/admin-token`.

`X-Sim-IP` (TEST_MODE only) overrides the client IP so one machine can simulate thousands of addresses. `X-Sim-Actor` carries evaluation-only identity for the attempts stream; **allocation never reads it**.

## Status codes you will see
`200` ok · `400 bad_request` · `401` unauthenticated · `403 ineligible|forbidden` · `404` · `409 already_issued|closed|token_spent|illegal_transition` · `429 rate_limited` (availability only; never changes who wins) · `503` redis down / draining.

## Attack-engine control API (via nginx `/attack/…`, X-Test-Key)
`POST /run {experiment, scale, also_fcfs}` (experiment = `exp1`..`exp7` or `show`, the live-show crowd with every bot type) · `GET /runs`, `GET /runs/{id}` · `POST /selftest` (18 known-good / known-bad requests against a fresh drop; returns `{cases:[{name,tried,expected,actual,pass}], passed, total}`).
`POST /redteam` (14 attacker tricks against the live system; returns `{probes:[{id,title,goal,move,expected,result,verdict:held|BROKEN|demo-only|info}], held, broken}`), `GET /redteam/last`, `GET /redteam/before` (the first run, before the fixes, from `reports/redteam/before_fix.json`).

## Limits added by the red team
`/auth/otp`: max 3 codes per phone per 10 min (`429 otp_rate_limited`); the phone is reduced to digits first (one SIM = one identity). `/auth/verify`: 5 wrong guesses destroy the code (`429 too_many_attempts`). `/admin/login`: 5 wrong passwords per address lock it for 5 min (`429 locked`). Request bodies: 64 KB (gateway and server), except `/api/test/*` bulk uploads. A retry key (`Idempotency-Key`) is scoped to its own ticket.


## Live request log (TEST_MODE, admin)

`GET /admin/drops/{id}/trace?after=<id>` returns the raw HTTP requests the web servers handled for that sale: `{events:[{id,t,m,p,ep,c,us,a,ip,rep,k,pf}], cursor, total, per_sec, by_class_3s, by_replica_3s, now_ms}`
(`m` method, `p` path, `c` status code, `us` handling time in microseconds, `a` account, `ip` address, `rep` which replica, `k`/`pf` evaluation labels). Each poll keeps recording switched on for 15 s (`trace:on`);
with nobody watching nothing is recorded. It only records: allocation never reads it. Records are batched off the request path and dropped if the buffer is full.
`GET /admin/drops/{id}/protection` also returns `arrivals`: requests per second since the first decision, per bot kind, used for the arrival-pattern analysis.
