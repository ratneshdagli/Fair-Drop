# custom_mix 

Your own test: 1,500 real people plus 8 speed bots, 5 flood bots, 6 retry bots, 18 proxy rotators, 14 sybil operators, 8 api scrapers, 5 ui mimics, 6 crypto swarms, 5 smart scrapers, 5 state snipers, 4 claim snipers.

*policy under test:* **fcfs** &nbsp; *duration:* 121.7s &nbsp; *drop:* `exp-custom_mix-fcfs-4866bd`

## Traffic
- verified identities participating: **1584** (1500 humans, 84 bot identities across 11 operators)
- client requests sent: **4,772**; recorded entry attempts (server): **n/a**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `lab-speed-bot`: SPEED_BOT, IP pool 20
  - operator `lab-flood-bot`: FLOOD_BOT, IP pool 5
  - operator `lab-retry-bot`: RETRY_BOT, IP pool 20
  - operator `lab-proxy-rotator`: PROXY_ROTATOR, IP pool 2000
  - operator `lab-sybil-operator`: SYBIL_OPERATOR, IP pool 1000
  - operator `lab-api-scraper`: API_SCRAPER, IP pool 5
  - operator `lab-ui-mimic`: UI_MIMIC, IP pool 50
  - operator `lab-crypto-swarm`: CRYPTO_SWARM, IP pool 200
  - operator `lab-smart-scraper`: SMART_SCRAPER, IP pool 2000
  - operator `lab-state-sniper`: STATE_SNIPER, IP pool 20
  - operator `lab-claim-sniper`: CLAIM_SNIPER, IP pool 20

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.053 | **3.771** | 400.0 / 1500 | 0.267 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /baseline/{id}/buy | 1683 | 14 | 3 ms | 8 ms | 24 ms | 0 | 0.0000% | 1183 |
| POST /test/login | 1584 | 13 | 4 ms | 12 ms | 26 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 1505 | 12 | 2 ms | 3 ms | 10 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (1197934 events)  -> overall: **OK**

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
