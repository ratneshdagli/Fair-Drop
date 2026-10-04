# exp6_kill_replica 

Experiment 6 - kill replica api-2 mid-window: every signed receipt must still be in the Merkle tree.

*policy under test:* **fairdrop** &nbsp; *duration:* 64.0s &nbsp; *drop:* `exp-exp6_kill_replica-fairdrop-4866bd`

## Traffic
- verified identities participating: **20000** (20000 humans, 0 bot identities across 0 operators)
- client requests sent: **80,000**; recorded entry attempts (server): **20000**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 20000 | 0.025 |
| Naive lottery (E over draws) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 20000 | 0.025 |
| Fair Drop (E over draws) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 20000 | 0.025 |
| Fair Drop (the one actual draw) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 20000 | 0.025 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 20000 | 0.025 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=500

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 20000 | 312 | 2 ms | 35 ms | 98 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 20000 | 312 | 2 ms | 22 ms | 80 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 20000 | 312 | 7 ms | 32 ms | 125 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register | 20000 | 312 | 3 ms | 38 ms | 121 ms | 0 | 0.0000% | 0 |

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
audit chain valid: **True** (577997 events)  -> overall: **OK**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores

## kill_replica

```
{
 "killed": {
  "url": "http://api2:8080",
  "at": 1791046905.5418088,
  "response": {
   "dying": "api-2"
  }
 },
 "acked_receipts": 20000,
 "acked_receipts_missing_from_tree": 0,
 "tree_entries": 20000,
 "entries_without_client_ack": 0,
 "client_5xx_or_conn_errors": 0,
 "replicas_after": [
  {
   "id": "api-1",
   "healthy": true
  },
  {
   "id": "api-2",
   "healthy": true
  },
  {
   "id": "api-3",
   "healthy": true
  },
  {
   "id": "worker",
   "healthy": true
  }
 ]
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
 }
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
