# show_bot_zoo 

Live show: real people plus every kind of bot (about 4% of the crowd): speed bots, flooders, retry-spammers, address-hoppers, an identity farm, shortcut seekers and human mimics.

*policy under test:* **fairdrop** &nbsp; *duration:* 18.7s &nbsp; *drop:* `exp-show_bot_zoo-fairdrop-4866bd`

## Traffic
- verified identities participating: **5000** (4800 humans, 200 bot identities across 7 operators)
- client requests sent: **34,942**; recorded entry attempts (server): **16977**
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
| FCFS (actual) | 500 | 0.200 | 0.040 | **5.000** | 400.0 / 4800 | 0.083 |
| Naive lottery (E over draws) | 500 | 0.185 | 0.040 | **4.616** | 407.7 / 4800 | 0.085 |
| Fair Drop (E over draws) | 500 | 0.031 | 0.040 | **0.763** | 484.7 / 4800 | 0.101 |
| Fair Drop (the one actual draw) | 500 | 0.038 | 0.040 | **0.950** | 481.0 / 4800 | 0.100 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.040 | **5.000** | 400.0 / 4800 | 0.083 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| farm | 40 | 37 | 1.1 | 3.3 | 36.92 |
| hopper | 56 | 27 | 51.0 | 4.7 | 35.90 |
| speed | 24 | 14 | 4.1 | 2.3 | 31.44 |
| flood | 16 | 13 | 22.3 | 1.4 | 33.68 |
| retry | 20 | 7 | 13.5 | 1.8 | 33.24 |
| scraper | 24 | 2 | 0.2 | 0.0 | n/a |
| mimic | 20 | 0 | 0.1 | 1.8 | 33.24 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, farm=29, hopper=26, speed=16, flood=12, scraper=10, retry=7, mimic=0

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 16953 | 907 | 41 ms | 467 ms | 806 ms | 0 | 0.0000% | 10192 |
| POST /drops/{id}/test-token | 7182 | 384 | 132 ms | 755 ms | 1231 ms | 0 | 0.0000% | 2182 |
| GET /drops/{id} | 5743 | 307 | 110 ms | 449 ms | 783 ms | 0 | 0.0000% | 0 |
| POST /test/login | 5000 | 268 | 251 ms | 1957 ms | 2347 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register-fast | 24 | 1 | 154 ms | 789 ms | 1161 ms | 0 | 0.0000% | 0 |
| GET /drops | 20 | 1 | 165 ms | 1061 ms | 1061 ms | 0 | 0.0000% | 0 |
| GET /drops/{id}/seats | 20 | 1 | 38 ms | 319 ms | 319 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 51378,
 "oversold": 0
}
```
audit chain valid: **True** (956464 events)  -> overall: **VIOLATIONS**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
