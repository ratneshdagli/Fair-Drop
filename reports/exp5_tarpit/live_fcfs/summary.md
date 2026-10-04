# exp5_tarpit 

Experiment 5 - tarpit: naive API-scraping bots vs UI-mimicking bots (plus humans). Share of bots caught by the decoy endpoint.

*policy under test:* **fcfs** &nbsp; *duration:* 42.4s &nbsp; *drop:* `exp-exp5_tarpit-fcfs-4866bd`

## Traffic
- verified identities participating: **4600** (4000 humans, 600 bot identities across 2 operators)
- client requests sent: **22,899**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `scrapers`: API_SCRAPER, IP pool 5
  - operator `ui-mimic`: UI_MIMIC, IP pool 50

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.127 | **1.577** | 400.0 / 4000 | 0.100 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 13999 | 330 | 7 ms | 19 ms | 33 ms | 0 | 0.0000% | 13499 |
| POST /test/login | 4600 | 108 | 1 ms | 31 ms | 47 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 4300 | 101 | 1 ms | 13 ms | 21 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (537991 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
