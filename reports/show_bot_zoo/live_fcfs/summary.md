# show_bot_zoo 

Live show: real people plus every kind of bot (about 4% of the crowd): speed bots, flooders, retry-spammers, address-hoppers, an identity farm, shortcut seekers and human mimics.

*policy under test:* **fcfs** &nbsp; *duration:* 17.4s &nbsp; *drop:* `exp-show_bot_zoo-fcfs-4866bd`

## Traffic
- verified identities participating: **5000** (4800 humans, 200 bot identities across 7 operators)
- client requests sent: **14,912**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `speed`: SPEED_BOT, IP pool 20
  - operator `flood`: FLOOD_BOT, IP pool 5
  - operator `retry`: RETRY_BOT, IP pool 20
  - operator `hopper`: PROXY_ROTATOR, IP pool 2000
  - operator `farm`: SYBIL_OPERATOR, IP pool 1000
  - operator `scraper`: API_SCRAPER, IP pool 5
  - operator `mimic`: UI_MIMIC, IP pool 50

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.040 | **5.000** | 400.0 / 4800 | 0.083 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 5092 | 292 | 4 ms | 294 ms | 578 ms | 0 | 0.0000% | 4592 |
| POST /test/login | 5000 | 287 | 109 ms | 1542 ms | 1651 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 4820 | 276 | 65 ms | 270 ms | 404 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (956969 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
