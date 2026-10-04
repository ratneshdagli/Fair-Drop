# exp2_proxy_flood 

Experiment 2 - proxy flood: 20 operators x 10 identities, rotating through 2,000 IPs each, hammering with retries.

*policy under test:* **fcfs** &nbsp; *duration:* 38.8s &nbsp; *drop:* `exp-exp2_proxy_flood-fcfs-4866bd`

## Traffic
- verified identities participating: **15000** (14800 humans, 200 bot identities across 20 operators)
- client requests sent: **44,900**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `op00`: PROXY_ROTATOR, IP pool 2000
  - operator `op01`: PROXY_ROTATOR, IP pool 2000
  - operator `op02`: PROXY_ROTATOR, IP pool 2000
  - operator `op03`: PROXY_ROTATOR, IP pool 2000
  - operator `op04`: PROXY_ROTATOR, IP pool 2000
  - operator `op05`: PROXY_ROTATOR, IP pool 2000
  - operator `op06`: PROXY_ROTATOR, IP pool 2000
  - operator `op07`: PROXY_ROTATOR, IP pool 2000
  - operator `op08`: PROXY_ROTATOR, IP pool 2000
  - operator `op09`: PROXY_ROTATOR, IP pool 2000
  - operator `op10`: PROXY_ROTATOR, IP pool 2000
  - operator `op11`: PROXY_ROTATOR, IP pool 2000
  - operator `op12`: PROXY_ROTATOR, IP pool 2000
  - operator `op13`: PROXY_ROTATOR, IP pool 2000
  - operator `op14`: PROXY_ROTATOR, IP pool 2000
  - operator `op15`: PROXY_ROTATOR, IP pool 2000
  - operator `op16`: PROXY_ROTATOR, IP pool 2000
  - operator `op17`: PROXY_ROTATOR, IP pool 2000
  - operator `op18`: PROXY_ROTATOR, IP pool 2000
  - operator `op19`: PROXY_ROTATOR, IP pool 2000

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.013 | **15.000** | 400.0 / 14800 | 0.027 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 15100 | 390 | 4 ms | 67 ms | 132 ms | 0 | 0.0000% | 14600 |
| POST /test/login | 15000 | 387 | 4 ms | 733 ms | 854 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 14800 | 382 | 3 ms | 60 ms | 90 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (687873 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
