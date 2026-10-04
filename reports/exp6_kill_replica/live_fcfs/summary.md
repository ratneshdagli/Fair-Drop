# exp6_kill_replica 

Experiment 6 - kill replica api-2 mid-window: every signed receipt must still be in the Merkle tree.

*policy under test:* **fcfs** &nbsp; *duration:* 62.6s &nbsp; *drop:* `exp-exp6_kill_replica-fcfs-4866bd`

## Traffic
- verified identities participating: **20000** (20000 humans, 0 bot identities across 0 operators)
- client requests sent: **60,000**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 20000 | 0.025 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 20000 | 319 | 1 ms | 6 ms | 27 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 20000 | 319 | 1 ms | 3 ms | 11 ms | 0 | 0.0000% | 0 |
| POST /baseline/{id}/buy | 20000 | 319 | 1 ms | 3 ms | 6 ms | 0 | 0.0000% | 19500 |

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
audit chain valid: **True** (579128 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
