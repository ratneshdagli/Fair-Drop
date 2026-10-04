# exp7_malicious_server 

Experiment 7 - malicious server: it silently drops one entry; that fan's verify page must turn red with proof.

*policy under test:* **fcfs** &nbsp; *duration:* 22.1s &nbsp; *drop:* `exp-exp7_malicious_server-fcfs-4866bd`

## Traffic
- verified identities participating: **2000** (2000 humans, 0 bot identities across 0 operators)
- client requests sent: **6,000**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 2000 | 0.250 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 2000 | 90 | 1 ms | 3 ms | 21 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 2000 | 90 | 1 ms | 1 ms | 4 ms | 0 | 0.0000% | 0 |
| POST /baseline/{id}/buy | 2000 | 90 | 1 ms | 2 ms | 2 ms | 0 | 0.0000% | 1500 |

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
audit chain valid: **True** (583639 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
