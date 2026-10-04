# exp3_sybil_scaling identities=10000

Experiment 3 - Sybil scaling: one operator buys 10000 verified identities.

*policy under test:* **fairdrop** &nbsp; *duration:* 64.1s &nbsp; *drop:* `exp-exp3_sybil_scaling-fairdrop-d63f53`

## Traffic
- verified identities participating: **50000** (40000 humans, 10000 bot identities across 1 operators)
- client requests sent: **220,000**; recorded entry attempts (server): **80000**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `sybil`: SYBIL_OPERATOR, IP pool 5000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.200 | **1.000** | 400.0 / 40000 | 0.010 |
| Naive lottery (E over draws) | 500 | 0.166 | 0.200 | **0.831** | 416.9 / 40000 | 0.010 |
| Fair Drop (E over draws) | 500 | 0.111 | 0.200 | **0.555** | 444.5 / 40000 | 0.011 |
| Fair Drop (the one actual draw) | 500 | 0.106 | 0.200 | **0.530** | 447.0 / 40000 | 0.011 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.200 | **1.000** | 400.0 / 40000 | 0.010 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| sybil | 10000 | 100 | 83.1 | 55.5 | 540.83 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, sybil=100

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 80000 | 1248 | 77 ms | 349 ms | 453 ms | 0 | 0.0000% | 30000 |
| POST /test/login | 50000 | 780 | 7 ms | 279 ms | 1096 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 50000 | 780 | 15 ms | 331 ms | 450 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 40000 | 624 | 4 ms | 126 ms | 209 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (527839 events)  -> overall: **OK**

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
