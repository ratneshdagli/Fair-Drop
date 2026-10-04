# custom_mix 

Your own test: 1,500 real people plus 8 speed bots, 5 flood bots, 6 retry bots, 18 proxy rotators, 14 sybil operators, 8 api scrapers, 5 ui mimics, 6 crypto swarms, 5 smart scrapers, 5 state snipers, 4 claim snipers.

*policy under test:* **fairdrop** &nbsp; *duration:* 129.4s &nbsp; *drop:* `exp-custom_mix-fairdrop-4866bd`

## Traffic
- verified identities participating: **1584** (1500 humans, 84 bot identities across 11 operators)
- client requests sent: **11,422**; recorded entry attempts (server): **5395**
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
| FCFS (actual) | 500 | 0.200 | 0.053 | **3.771** | 400.0 / 1500 | 0.267 |
| Naive lottery (E over draws) | 500 | 0.184 | 0.053 | **3.472** | 407.9 / 1500 | 0.272 |
| Fair Drop (E over draws) | 500 | 0.042 | 0.053 | **0.786** | 479.2 / 1500 | 0.319 |
| Fair Drop (the one actual draw) | 500 | 0.038 | 0.053 | **0.717** | 481.0 / 1500 | 0.321 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.200 | 0.053 | **3.771** | 400.0 / 1500 | 0.267 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*

## Seats and cost per seat by operator

| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |
|---|---|---|---|---|---|
| lab-proxy-rotator | 18 | 38 | 52.1 | 4.8 | 11.36 |
| lab-speed-bot | 8 | 19 | 4.5 | 2.4 | 10.19 |
| lab-sybil-operator | 14 | 16 | 1.6 | 3.9 | 10.71 |
| lab-flood-bot | 5 | 12 | 17.6 | 1.4 | 10.68 |
| lab-retry-bot | 6 | 8 | 13.9 | 1.7 | 10.71 |
| lab-api-scraper | 8 | 3 | 0.2 | 0.0 | n/a |
| lab-claim-sniper | 4 | 3 | 0.1 | 1.0 | 11.88 |
| lab-state-sniper | 5 | 1 | 0.4 | 1.4 | 10.99 |
| lab-crypto-swarm | 6 | 0 | 0.2 | 1.6 | 10.91 |
| lab-smart-scraper | 5 | 0 | 1.4 | 1.3 | 11.41 |
| lab-ui-mimic | 5 | 0 | 0.1 | 1.4 | 10.91 |

## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=400, lab-proxy-rotator=30, lab-api-scraper=12, lab-claim-sniper=12, lab-flood-bot=12, lab-speed-bot=12, lab-retry-bot=8, lab-state-sniper=5, lab-sybil-operator=5, lab-smart-scraper=4, lab-crypto-swarm=0, lab-ui-mimic=0

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /drops/{id}/register | 5399 | 42 | 9 ms | 28 ms | 42 ms | 0 | 0.0000% | 3279 |
| POST /drops/{id}/test-token | 2282 | 18 | 7 ms | 26 ms | 42 ms | 0 | 0.0000% | 704 |
| GET /drops/{id} | 1840 | 14 | 2 ms | 12 ms | 22 ms | 0 | 0.0000% | 0 |
| POST /test/login | 1584 | 12 | 5 ms | 25 ms | 41 ms | 0 | 0.0000% | 0 |
| GET /healthz (clock sync) | 239 | 2 | 1 ms | 3 ms | 4 ms | 0 | 0.0000% | 0 |
| GET site script (scraper) | 42 | 0 | 21 ms | 46 ms | 51 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register-fast | 8 | 0 | 12 ms | 18 ms | 18 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/token | 6 | 0 | 19 ms | 31 ms | 31 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-link | 6 | 0 | 11 ms | 22 ms | 22 ms | 0 | 0.0000% | 0 |
| GET site page (scraper) | 6 | 0 | 549 ms | 1344 ms | 1344 ms | 0 | 0.0000% | 0 |
| GET /drops | 5 | 0 | 4 ms | 5 ms | 5 ms | 0 | 0.0000% | 0 |
| GET /drops/{id}/seats | 5 | 0 | 4 ms | 50 ms | 50 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (1196803 events)  -> overall: **OK**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

## boundary

```
{
 "boundary_violations": 0,
 "all_checks_ran": true,
 "parts": {
  "accepted_outside_window": 0,
  "accepted_after_closed_in_audit": 0,
  "orphan_receipts": 0,
  "sealed_count_mismatch": 0,
  "accepted_but_not_in_sealed_list": 0
 },
 "entries_accepted_by_server": 1576,
 "entries_in_sealed_list": 1576,
 "receipts_clients_were_given": 1576,
 "tokens_issued": 1584,
 "sale_opened_at_ms": 1791118440912,
 "sale_closed_at_ms": 1791118569397,
 "open_flip_vs_announced_ms": -4,
 "close_flip_vs_announced_ms": -19,
 "runner_clock_offset_s": 0.006356716156005859,
 "runner_clock_uncertainty_s": 0.006866097450256348,
 "runner_clock_synced": true,
 "shots": {
  "sniper_close_http_200": 8,
  "sniper_close_http_409": 8,
  "sniper_close_http_410": 16,
  "sniper_close_in_band": 32,
  "sniper_close_shots": 32,
  "sniper_open_http_200": 1,
  "sniper_open_http_409": 7,
  "sniper_open_in_band": 8,
  "sniper_open_shots": 8
 },
 "note": "shots are counted by the bot's own clock (about +-200 ms around the announced instant); the violations come from the server's records"
}
```

## claim_sniper

```
{
 "sniper_receipts": 4,
 "seats_claimed_by_snipers": 1,
 "still_without_a_seat": 3,
 "requests_sent": 1801,
 "answers": {
  "ok": 1,
  "refused_not_reserved_for_it": 1800
 },
 "seats_claimed_without_entitlement": 0,
 "client_duplicate_seats": 0,
 "server_duplicate_seats": 0,
 "server_oversold": 0,
 "blocked_duplicate_seat_attempts": 0,
 "double_allocated_seats": 0
}
```

## Claims

```
{
 "claimed_by_client": 500,
 "client_forfeits": 63,
 "expired_rejects": 0,
 "other_rejects": 0,
 "server_summary": {
  "claimed": 500,
  "expired": 63,
  "pending": 0,
  "promoted": 63,
  "state": "SETTLED",
  "tiers": [
   {
    "counts": {
     "claimed": 100
    },
    "seats": 100,
    "tier": "gold"
   },
   {
    "counts": {
     "claimed": 150
    },
    "seats": 150,
    "tier": "silver"
   },
   {
    "counts": {
     "claimed": 250
    },
    "seats": 250,
    "tier": "general"
   }
  ],
  "totals": {
   "claimed": 500
  }
 },
 "claim_sniper": {
  "sniper_receipts": 4,
  "seats_claimed_by_snipers": 1,
  "still_without_a_seat": 3,
  "requests_sent": 1801,
  "answers": {
   "ok": 1,
   "refused_not_reserved_for_it": 1800
  },
  "seats_claimed_without_entitlement": 0,
  "client_duplicate_seats": 0,
  "server_duplicate_seats": 0,
  "server_oversold": 0,
  "blocked_duplicate_seat_attempts": 0,
  "double_allocated_seats": 0
 }
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
