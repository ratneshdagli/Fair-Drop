# exp7_malicious_server 

Experiment 7 - malicious server: it silently drops one entry; that fan's verify page must turn red with proof.

*policy under test:* **fairdrop** &nbsp; *duration:* 23.1s &nbsp; *drop:* `exp-exp7_malicious_server-fairdrop-4866bd`

## Traffic
- verified identities participating: **2000** (2000 humans, 0 bot identities across 0 operators)
- client requests sent: **8,000**; recorded entry attempts (server): **2000**
- assumed identity cost: **$3.0** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)


## Same traffic, three allocation policies

| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |
|---|---|---|---|---|---|---|
| FCFS (actual) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 2000 | 0.250 |
| Naive lottery (E over draws) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 2000 | 0.250 |
| Fair Drop (E over draws) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 2000 | 0.250 |
| Fair Drop (the one actual draw) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 2000 | 0.250 |
| FCFS (live run, real requests against the classic sale) | 500 | 0.000 | 0.000 | **n/a** | 500.0 / 2000 | 0.250 |

*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*


## Live FCFS run (same actors replayed against the classic sale)

operators' seats: humans=500

## Latency (client observed)

| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |
|---|---|---|---|---|---|---|---|---|
| POST /test/login | 2000 | 87 | 1 ms | 5 ms | 30 ms | 0 | 0.0000% | 0 |
| GET /drops/{id} | 2000 | 87 | 1 ms | 3 ms | 5 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/test-token | 2000 | 87 | 4 ms | 6 ms | 8 ms | 0 | 0.0000% | 0 |
| POST /drops/{id}/register | 2000 | 87 | 1 ms | 4 ms | 5 ms | 0 | 0.0000% | 0 |

## Integrity (must be 0)

```
{
 "broken_merkle": 0,
 "duplicate_entries": 0,
 "duplicate_seats": 0,
 "invalid_transitions": 0,
 "missing_receipts": 1,
 "oversold": 0
}
```
audit chain valid: **True** (583134 events)  -> overall: **VIOLATIONS**

## Independent verification (Python reference verifier)

- PASS seed commitment: sha256(seed) == published seed_hash
- PASS entry list has unique receipt ids
- PASS merkle root recomputed from entry list == published root
- PASS root equals the root observed when the list was locked (before seed reveal)
- PASS final randomness = H(seed || root || beacon)
- PASS tier gold: winner order + waitlist recomputed from scores
- PASS tier silver: winner order + waitlist recomputed from scores
- PASS tier general: winner order + waitlist recomputed from scores
- FAIL YOUR RECEIPT IS IN THE LOCKED LIST

## malicious_target

```
{
 "receipt_id": "20834c06c93e364750461ad7220d225de87897c4ad94d79a85d4c1f77b5fcaac",
 "uid": "t_040500"
}
```

## malicious

```
{
 "victim_proof_status": 404,
 "victim_sees": "not_included",
 "control_proof_status": 200,
 "reference_verifier_flags_victim": true,
 "integrity_missing_receipts": 1,
 "detected": true
}
```

Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`.
