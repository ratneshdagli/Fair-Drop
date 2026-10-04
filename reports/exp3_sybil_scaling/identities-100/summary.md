# exp3_sybil_scaling identities=100

Experiment 3 - Sybil scaling: one operator buys 100 verified identities.

*policy under test:* **fairdrop** &nbsp; *duration:* 18.5s &nbsp; *drop:* `exp-exp3_sybil_scaling-fairdrop-e86715`

## Traffic
- verified identities participating: **5000** (4900 humans, 100 bot identities across 1 operators)
- client requests sent: **20,200**; recorded entry attempts (server): **5300**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `sybil`: SYBIL_OPERATOR, IP pool 5000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.020 | **10.000** | 400.0 / 4900 | 0.082 |
| Naive lottery (E over draws) | 500 | 0.058 | 0.020 | **2.920** | 470.8 / 4900 | 0.096 |
| Fair Drop (E over draws) | 500 | 0.019 | 0.020 | **0.950** | 490.5 / 4900 | 0.100 |
| Fair Drop (the one actual draw) | 500 | 0.020 | 0.020 | **1.000** | 490.0 / 4900 | 0.100 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.020 | **10.000** | 400.0 / 4900 | 0.082 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| sybil | 100 | 100 | 29.2 | 9.5 | 31.56 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, sybil=100

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 5300 | 287 | 3 ms | 128 ms | 172 ms | 0 | 0.0000% | 300 |
| POST /test/login | 5000 | 271 | 5 ms | 226 ms | 280 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 5000 | 271 | 7 ms | 128 ms | 149 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 4900 | 265 | 3 ms | 53 ms | 190 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (593644 events)  -> overall: **OK**

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
