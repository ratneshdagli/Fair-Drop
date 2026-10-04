# exp3_sybil_scaling identities=1000

Experiment 3 - Sybil scaling: one operator buys 1000 verified identities.

*policy under test:* **fairdrop** &nbsp; *duration:* 19.3s &nbsp; *drop:* `exp-exp3_sybil_scaling-fairdrop-672e47`

## Traffic
- verified identities participating: **5000** (4000 humans, 1000 bot identities across 1 operators)
- client requests sent: **22,000**; recorded entry attempts (server): **8000**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `sybil`: SYBIL_OPERATOR, IP pool 5000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.200 | **1.000** | 400.0 / 4000 | 0.100 |
| Naive lottery (E over draws) | 500 | 0.167 | 0.200 | **0.833** | 416.7 / 4000 | 0.104 |
| Fair Drop (E over draws) | 500 | 0.110 | 0.200 | **0.552** | 444.8 / 4000 | 0.111 |
| Fair Drop (the one actual draw) | 500 | 0.112 | 0.200 | **0.560** | 444.0 / 4000 | 0.111 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.200 | **1.000** | 400.0 / 4000 | 0.100 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| sybil | 1000 | 100 | 83.3 | 55.2 | 54.37 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, sybil=100

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 8000 | 414 | 40 ms | 247 ms | 471 ms | 0 | 0.0000% | 3000 |
| POST /test/login | 5000 | 259 | 71 ms | 1201 ms | 1436 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 5000 | 259 | 8 ms | 423 ms | 547 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 4000 | 207 | 36 ms | 256 ms | 442 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (604153 events)  -> overall: **OK**

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
