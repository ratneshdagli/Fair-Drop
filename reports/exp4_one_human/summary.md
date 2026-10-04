# exp4_one_human 

Experiment 4 - the 1-human scenario: ~50,000 bot requests from 5 operators with 4 identities each, plus ONE human, 10 seats.

*policy under test:* **fairdrop** &nbsp; *duration:* 32.1s &nbsp; *drop:* `exp-exp4_one_human-fairdrop-6b9d69`

## Traffic
- verified identities participating: **21** (1 humans, 20 bot identities across 5 operators)
- client requests sent: **52,077**; recorded entry attempts (server): **29875**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `flood-a`: FLOOD_BOT, IP pool 5
  - operator `flood-b`: FLOOD_BOT, IP pool 5
  - operator `proxy-a`: PROXY_ROTATOR, IP pool 3000
  - operator `proxy-b`: PROXY_ROTATOR, IP pool 3000
  - operator `retry-a`: RETRY_BOT, IP pool 100

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 10 | 1.000 | 0.952 | **1.050** | 0.0 / 1 | 0.000 |
| Naive lottery (E over draws) | 10 | 1.000 | 0.952 | **1.050** | 0.0 / 1 | 0.000 |
| Fair Drop (E over draws) | 10 | 0.954 | 0.952 | **1.001** | 0.5 / 1 | 0.465 |
| Fair Drop (the one actual draw) | 10 | 0.900 | 0.952 | **0.945** | 1.0 / 1 | 1.000 |
| FCFS (live run, real requests against the classic sale) | 10 | 1.000 | 0.952 | **1.050** | 0.0 / 1 | 0.000 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| proxy-a | 4 | 6 | 3.4 | 1.9 | 6.49 |
| flood-b | 4 | 4 | 0.5 | 1.8 | 6.84 |
| flood-a | 4 | 0 | 0.4 | 2.0 | 6.05 |
| proxy-b | 4 | 0 | 3.3 | 1.9 | 6.22 |
| retry-a | 4 | 0 | 2.5 | 2.0 | 5.96 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: proxy-a=6, flood-b=4, flood-a=0, humans=0, proxy-b=0, retry-a=0

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 39513 | 1232 | 2 ms | 4 ms | 5 ms | 0 | 0.0000% | 31992 |
| POST /drops/{id}/test-token | 8582 | 268 | 2 ms | 3 ms | 4 ms | 0 | 0.0000% | 8561 |
| GET /drops/{id} | 3961 | 123 | 2 ms | 4 ms | 4 ms | 0 | 0.0000% | 0 |
| POST /test/login | 21 | 1 | 3 ms | 6 ms | 7 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (528392 events)  -> overall: **OK**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores

## the_human

```
{
 "user_id": "t_042314",
 "fcfs_seats_actual": 0,
 "naive_expected_seats": 0.0,
 "fairdrop_expected_seats": 0.465,
 "fairdrop_actual_seats": 1
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
