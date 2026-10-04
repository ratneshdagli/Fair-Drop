# exp2_proxy_flood 

Experiment 2 - proxy flood: 20 operators x 10 identities, rotating through 2,000 IPs each, hammering with retries.

*policy under test:* **fairdrop** &nbsp; *duration:* 39.9s &nbsp; *drop:* `exp-exp2_proxy_flood-fairdrop-4866bd`

## Traffic
- verified identities participating: **15000** (14800 humans, 200 bot identities across 20 operators)
- client requests sent: **85,902**; recorded entry attempts (server): **38800**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `op00`: PROXY_ROTATOR, IP pool 2000
  - operator `op01`: PROXY_ROTATOR, IP pool 2000
  - operator `op02`: PROXY_ROTATOR, IP pool 2000
  - operator `op03`: PROXY_ROTATOR, IP pool 2000
  - operator `op04`: PROXY_ROTATOR, IP pool 2000
  - operator `op05`: PROXY_ROTATOR, IP pool 2000
  - operator `op06`: PROXY_ROTATOR, IP pool 2000
  - operator `op07`: PROXY_ROTATOR, IP pool 2000
  - operator `op08`: PROXY_ROTATOR, IP pool 2000
  - operator `op09`: PROXY_ROTATOR, IP pool 2000
  - operator `op10`: PROXY_ROTATOR, IP pool 2000
  - operator `op11`: PROXY_ROTATOR, IP pool 2000
  - operator `op12`: PROXY_ROTATOR, IP pool 2000
  - operator `op13`: PROXY_ROTATOR, IP pool 2000
  - operator `op14`: PROXY_ROTATOR, IP pool 2000
  - operator `op15`: PROXY_ROTATOR, IP pool 2000
  - operator `op16`: PROXY_ROTATOR, IP pool 2000
  - operator `op17`: PROXY_ROTATOR, IP pool 2000
  - operator `op18`: PROXY_ROTATOR, IP pool 2000
  - operator `op19`: PROXY_ROTATOR, IP pool 2000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.013 | **15.000** | 400.0 / 14800 | 0.027 |
| Naive lottery (E over draws) | 500 | 0.178 | 0.013 | **13.382** | 410.8 / 14800 | 0.028 |
| Fair Drop (E over draws) | 500 | 0.013 | 0.013 | **0.995** | 493.4 / 14800 | 0.033 |
| Fair Drop (the one actual draw) | 500 | 0.006 | 0.013 | **0.450** | 497.0 / 14800 | 0.034 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.013 | **15.000** | 400.0 / 14800 | 0.027 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| op03 | 10 | 12 | 4.5 | 0.3 | 109.09 |
| op12 | 10 | 11 | 4.3 | 0.3 | 109.09 |
| op07 | 10 | 10 | 4.6 | 0.3 | 88.24 |
| op13 | 10 | 9 | 4.7 | 0.3 | 117.65 |
| op14 | 10 | 8 | 4.4 | 0.3 | 107.14 |
| op01 | 10 | 7 | 4.4 | 0.3 | 101.69 |
| op17 | 10 | 7 | 4.4 | 0.3 | 92.31 |
| op00 | 10 | 6 | 4.4 | 0.3 | 85.71 |
| op15 | 10 | 6 | 4.5 | 0.3 | 96.77 |
| op18 | 10 | 6 | 4.5 | 0.3 | 93.75 |
| op19 | 10 | 5 | 4.5 | 0.3 | 88.24 |
| op10 | 10 | 4 | 4.5 | 0.4 | 75.95 |
| op08 | 10 | 3 | 4.3 | 0.4 | 80.00 |
| op16 | 10 | 2 | 4.5 | 0.4 | 84.51 |
| op02 | 10 | 1 | 4.6 | 0.4 | 83.33 |
| op05 | 10 | 1 | 4.4 | 0.3 | 95.24 |
| op06 | 10 | 1 | 4.3 | 0.4 | 74.07 |
| op11 | 10 | 1 | 4.6 | 0.3 | 88.24 |
| op04 | 10 | 0 | 4.5 | 0.4 | 81.08 |
| op09 | 10 | 0 | 4.4 | 0.4 | 84.51 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, op13=12, op00=10, op15=10, op12=9, op03=8, op07=8, op01=7, op08=6, op10=6, op02=5, op17=4

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 38800 | 972 | 108 ms | 226 ms | 319 ms | 0 | 0.0000% | 23800 |
| POST /drops/{id}/test-token | 17302 | 433 | 116 ms | 269 ms | 372 ms | 0 | 0.0000% | 2302 |
| POST /test/login | 15000 | 376 | 101 ms | 1914 ms | 3051 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 14800 | 371 | 86 ms | 206 ms | 290 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 0,
 "oversold": 0
}
```
audit chain valid: **True** (687369 events)  -> overall: **OK**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
