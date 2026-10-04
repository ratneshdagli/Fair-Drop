# exp1_normal_traffic 

Experiment 1 - normal traffic: every verified identity is a human, no bots. Baseline latency + integrity.

*policy under test:* **fcfs** &nbsp; *duration:* 62.5s &nbsp; *drop:* `exp-exp1_normal_traffic-fcfs-4866bd`

## Traffic
- verified identities participating: **50000** (50000 humans, 0 bot identities across 0 operators)
- client requests sent: **150,000**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 50000 | 0.010 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 50000 | 800 | 1 ms | 7 ms | 336 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 50000 | 800 | 1 ms | 7 ms | 29 ms | 0 | 0.0000% | 0 |
| POST /baseline/{id}/buy | 50000 | 800 | 2 ms | 4 ms | 11 ms | 0 | 0.0000% | 49500 |

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
audit chain valid: **True** (126302 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
