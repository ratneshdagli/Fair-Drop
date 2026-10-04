# exp3_sybil_scaling identities=10000

Experiment 3 - Sybil scaling: one operator buys 10000 verified identities.

*policy under test:* **fcfs** &nbsp; *duration:* 62.5s &nbsp; *drop:* `exp-exp3_sybil_scaling-fcfs-d63f53`

## Traffic
- verified identities participating: **50000** (40000 humans, 10000 bot identities across 1 operators)
- client requests sent: **140,100**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `sybil`: SYBIL_OPERATOR, IP pool 5000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.200 | **1.000** | 400.0 / 40000 | 0.010 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 50100 | 801 | 2 ms | 64 ms | 76 ms | 0 | 0.0000% | 49600 |
| POST /test/login | 50000 | 799 | 1 ms | 69 ms | 882 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 40000 | 640 | 1 ms | 51 ms | 67 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (528344 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
