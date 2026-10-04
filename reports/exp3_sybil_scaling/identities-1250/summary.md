# exp3_sybil_scaling identities=1250

Experiment 3 - Sybil scaling: one operator buys 1250 verified identities.

*policy under test:* **fairdrop** &nbsp; *duration:* 18.2s &nbsp; *drop:* `exp-exp3_sybil_scaling-fairdrop-e01596`

## Traffic
- verified identities participating: **5000** (3750 humans, 1250 bot identities across 1 operators)
- client requests sent: **22,500**; recorded entry attempts (server): **8750**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `sybil`: SYBIL_OPERATOR, IP pool 5000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.250 | **0.800** | 400.0 / 3750 | 0.107 |
| Naive lottery (E over draws) | 500 | 0.174 | 0.250 | **0.695** | 413.1 / 3750 | 0.110 |
| Fair Drop (E over draws) | 500 | 0.125 | 0.250 | **0.499** | 437.6 / 3750 | 0.117 |
| Fair Drop (the one actual draw) | 500 | 0.132 | 0.250 | **0.528** | 434.0 / 3750 | 0.116 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.250 | **0.800** | 400.0 / 3750 | 0.107 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| sybil | 1250 | 100 | 86.9 | 62.4 | 60.13 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, sybil=100

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 8750 | 481 | 48 ms | 134 ms | 161 ms | 0 | 0.0000% | 3750 |
| POST /test/login | 5000 | 275 | 75 ms | 1013 ms | 1173 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 5000 | 275 | 9 ms | 145 ms | 185 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 3750 | 206 | 29 ms | 117 ms | 141 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (614663 events)  -> overall: **OK**

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
