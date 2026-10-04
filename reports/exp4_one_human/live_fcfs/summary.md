# exp4_one_human 

Experiment 4 - the 1-human scenario: ~50,000 bot requests from 5 operators with 4 identities each, plus ONE human, 10 seats.

*policy under test:* **fcfs** &nbsp; *duration:* 32.2s &nbsp; *drop:* `exp-exp4_one_human-fcfs-6b9d69`

## Traffic
- verified identities participating: **21** (1 humans, 20 bot identities across 5 operators)
- client requests sent: **53**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `flood-a`: FLOOD_BOT, IP pool 5
  - operator `flood-b`: FLOOD_BOT, IP pool 5
  - operator `proxy-a`: PROXY_ROTATOR, IP pool 3000
  - operator `proxy-b`: PROXY_ROTATOR, IP pool 3000
  - operator `retry-a`: RETRY_BOT, IP pool 100

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 10 | 1.000 | 0.952 | **1.050** | 0.0 / 1 | 0.000 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 31 | 1 | 1 ms | 2 ms | 2 ms | 0 | 0.0000% | 21 |
| POST /test/login | 21 | 1 | 2 ms | 3 ms | 4 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 1 | 0 | 1 ms | 1 ms | 1 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": null,
 "oversold": 0
}
```
audit chain valid: **True** (528407 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
