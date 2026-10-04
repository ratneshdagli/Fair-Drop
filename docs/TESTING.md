# Testing

| layer | command | covers |
|---|---|---|
| Go unit/integration | `./scripts/test.sh` (Go in Docker, Redis db15, PG `fairdrop_test`) | auth, issuer (blind/plain, one-per-identity), entry (spend, idempotent), guard, lifecycle CAS, draw determinism, Merkle proofs, claim race + cascade, ledger chain tamper, integrity counters, kill/failure |
| Crypto vectors | part of the above (`fdcrypto_test.go`, writes `docs/test-vectors.json`) | cross-language format |
| Reference verifier | `python -m pytest verifier/test_verify.py` | Python recomputes root, proofs, ordering; detects dropped entry |
| Scoring | `python -m pytest scoring/test_scoring.py` | bot advantage, cost per seat, counterfactual maths |
| Attack engine | `docker exec fd-attack python -m pytest attack_engine/test_attack_engine.py` (needs `gevent`) | profiles, operator/IP mapping, plan reproducibility, labels |
| Attack engine, new bots | `python -m pytest attack_engine` (needs `gevent`; the OpenSSL cross-check needs `cryptography`) | client-side blind RSA, Date-header clock estimate, the four bots added after the outside review, the boundary score, the claim hammer |
| Browser crypto | `cd frontend && npm test` | TS Merkle/verify identical to Go vectors, blind-sign round trip, detects a cheating bundle |
| End to end | `python tests/smoke.py` against the running stack | login → blind token → register → lock → reveal → draw → verify → claim → expiry cascade → integrity zero |
| Protection self-test | `docker compose exec -T attack python -m attack_engine selftest` | 18 known-good/known-bad requests, false-positive/false-negative check |
| Experiments | `scripts/run_experiment.sh expN` | the seven PRD experiments, reports under `reports/` |

Rules we follow: no mocks for Redis/Postgres (real services in Docker); bots must retry like real ones; if Fair Drop does worse than expected the run is reported, then fixed and rerun.
