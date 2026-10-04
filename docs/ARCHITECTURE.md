# Architecture

```
browser ──► nginx :8088 ─┬─ /api/*   ─► api1 api2 api3 (Go, stateless, chi)  ─┬─► Redis (hot path: Lua, TIME, ZSETs, Streams)
                         ├─ /attack/ ─► attack engine (Locust + control API)  └─► Postgres (permanent record)
                         └─ /        ─► Next.js frontend                      worker (timers, ledger, drift-free ticks)
                                                                                 │
Prometheus ◄── scrape api1-3 + worker ── Grafana (provisioned "Fair Drop" dashboard)
```

## Why this shape
- **Replicas are stateless.** Every decision that must be unique (one token per identity, one spend per token, one seat per rank, state transitions) is a single Redis Lua script, so any replica can serve any request and any replica can die mid-window. Redis `TIME` is the only clock; replicas never compare their own wall clocks.
- **Redis is the hot path, Postgres the record.** Registration touches only Redis. Events are appended to a Redis Stream; the worker's ledger consumer batches them into Postgres inside a hash chain (`audit_log`) and copies entries/allocations. Unique constraints in Postgres are the second line of defence for the integrity counters.
- **Allocation is timing-independent.** The lottery draws over the *set* of accepted receipts, so arrival order, request volume and IP never enter the score.
- **Defences are for availability only.** Per-IP and per-account rate limits keep the service alive under flood, and the tarpit decoy and spent-token set cost nothing to honest users. None of them is an input to allocation; turning them off (Test tools) must not change who wins.

## Modules (Go package `internal/app`, crypto in `internal/fdcrypto`)
| module | file | job |
|---|---|---|
| auth | `auth.go` | simulated OTP, JWT, admin login, eligibility cutoff timestamp |
| issuer | `entry.go` (`hToken`) | per-drop key, blind-sign once per identity |
| entry | `entry.go` (`hRegister`, `hTarpit`) | sessionless register, spend token, receipt, decoy |
| guard | `guard.go` | Lua token-bucket per IP and per account; `X-Sim-IP` only in TEST_MODE |
| lifecycle | `lifecycle.go` | CAS state machine, timers, manual admin advance |
| draw | `draw.go` | lock (Merkle), reveal, drand, ranking, counterfactuals, verify bundle |
| claim | `claim.go` | claim window, timeout, waitlist cascade |
| baseline | `baseline.go` | classic FCFS sale for comparison |
| ledger | `ledger.go` | stream → hash-chained audit log, chain verification, integrity counters |
| testkit | `testkit.go` | TEST_MODE seeding, reset, labels, malicious mode, kill |
| live/metrics | `live.go`, `metrics.go` | SSE snapshot, Prometheus, replica heartbeats |

## Data flow of one entry
`fan` → `POST /token` (JWT) → guard → Lua *issue* (SETNX per user per drop, then sign) → `POST /register` (no JWT) → verify signature → Lua *register* (SADD spent; HSET entry; XADD stream) → receipt.
At LOCK the worker reads all entries, builds the Merkle tree, stores the root, publishes it. At DRAWN: reveal seed, fetch beacon, rank, write `allocations` and `counterfactuals` (FCFS / naive lottery / Fair Drop computed on the *same* recorded attempts).

## Failure handling
- nginx retries idempotent requests on the next replica; `register` is idempotent by design (deterministic receipt), `token` replays return the same signature.
- `POST /test/die` exits a replica with 137; compose `restart: unless-stopped` brings it back; the live monitor shows it DOWN then healthy; the integrity counters must stay zero (experiment 6).
- Worker restarts resume from the Redis consumer-group offset; the ledger chain continues from `audit_head`.
