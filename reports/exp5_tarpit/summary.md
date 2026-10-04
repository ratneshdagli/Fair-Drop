# exp5_tarpit 

Experiment 5 - tarpit: naive API-scraping bots vs UI-mimicking bots (plus humans). Share of bots caught by the decoy endpoint.

*policy under test:* **fairdrop** &nbsp; *duration:* 43.5s &nbsp; *drop:* `exp-exp5_tarpit-fairdrop-4866bd`

## Traffic
- verified identities participating: **4600** (4000 humans, 600 bot identities across 2 operators)
- client requests sent: **18,700**; recorded entry attempts (server): **4473**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)

  - operator `scrapers`: API_SCRAPER, IP pool 5
  - operator `ui-mimic`: UI_MIMIC, IP pool 50

## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.200 | 0.106 | **1.891** | 400.0 / 4000 | 0.100 |
| Naive lottery (E over draws) | 500 | 0.074 | 0.106 | **0.696** | 463.2 / 4000 | 0.116 |
| Fair Drop (E over draws) | 500 | 0.055 | 0.106 | **0.521** | 472.5 / 4000 | 0.118 |
| Fair Drop (the one actual draw) | 500 | 0.064 | 0.106 | **0.605** | 468.0 / 4000 | 0.117 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.127 | **1.577** | 400.0 / 4000 | 0.100 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| scrapers | 173 | 100 | 13.3 | 0.0 | n/a |
| ui-mimic | 300 | 0 | 23.5 | 27.5 | 32.69 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, scrapers=100, ui-mimic=0

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 4600 | 106 | 1 ms | 5 ms | 18 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 4600 | 106 | 4 ms | 8 ms | 12 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 4300 | 99 | 1 ms | 4 ms | 5 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register | 4300 | 99 | 2 ms | 5 ms | 7 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register-fast | 300 | 7 | 2 ms | 5 ms | 7 ms | 0 | 0.0000% | 127 |
| GET /drops | 300 | 7 | 4 ms | 9 ms | 15 ms | 0 | 0.0000% | 0 |
| GET /drops/{id}/seats | 300 | 7 | 1 ms | 3 ms | 5 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 0,
 "oversold": 0
}
```
audit chain valid: **True** (537486 events)  -> overall: **OK**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

## tarpit

```
{
 "scraper_identities": 300,
 "ui_mimic_identities": 300,
 "tarpit_hits": 173,
 "scrapers_fooled": 173,
 "share_of_scrapers_caught": 0.5766666666666667,
 "real_entries_scrapers": 0,
 "real_entries_ui_mimic": 300,
 "honest_limit": "the tarpit only catches bots that take the bait; UI-mimicking bots are not caught (and still get exactly 1 entry per identity)"
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
