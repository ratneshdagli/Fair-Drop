# System analysis

## Problem
500 seats (Gold 100 / Silver 150 / General 250), ~50,000 would-be buyers. Under first-come-first-served the winners are whoever has the fastest connection, the most requests, the most IPs: bots. We want: **one verified identity, one entry; the entry list publicly locked before randomness is revealed; anyone can recompute the draw; speed, request volume and IP rotation confer no advantage.**

## Actors and threats
| actor | goal | what we do about it |
|---|---|---|
| Fan (human) | get a seat fairly | UI walks them through sign-in → blind token → entry → proof → claim; verify page recomputes everything |
| Bot operator | many seats | cannot win by speed/volume/IP (draw ignores them); can only add *identities*, which costs money (Sybil experiment, cost per seat) |
| Malicious server/admin | favour someone, drop someone | commit–reveal seed + drand, Merkle root before reveal, audit chain, per-fan verification; admin only advances phases, cannot choose winners |
| Flooder | take the site down | rate limits (availability only), decoy tarpit, stateless replicas behind failover |

## Non-goals (not claimed)
Stopping people from holding several real verified identities; stopping all bots; protecting a compromised identity provider; real SMS/payment (OTP is simulated; ticket price is shown but no money moves).

## Requirements → where implemented
| requirement | implementation |
|---|---|
| Verified identity once, eligibility cutoff | `auth.go`, `verified_at ≤ cutoff` check in issuer |
| One entry per identity, unlinkable | RFC 9474 blind sign + Lua spent set (`entry.go`, `fdcrypto`) |
| No session at register | `/register` takes only the token |
| Public lock + commit–reveal | Merkle root at LOCKED, `seed_hash` at creation, optional drand |
| Anyone can recompute | `/verify` bundle, browser verify page, `verifier/verify.py` |
| Fair under attack | draw over unique receipts; 8 bot profiles; counterfactual engine |
| Claims with timeout + waitlist | `claim.go` Lua + `elig`/`wlptr` |
| Tamper evidence | hash-chained `audit_log`, integrity counters, red warnings |
| Survive replica loss | stateless API, idempotent calls, nginx failover, compose restart |
| Observability | Prometheus + Grafana, SSE live monitor |
| Testability | TEST_MODE endpoints, label file, resettable seeded experiments |

## Deviations from the PRD (with reasons)
1. **Tier is part of the Merkle leaf**: stops post-lock tier swaps (ADR-6).
2. **State transitions can be triggered by timer or admin through the same CAS**: robust to worker loss (ADR-12).
3. **UI_MIMIC replays the UI request sequence, not a real browser**: 50k Playwright sessions don't fit one machine (ADR-10).
4. **drand BLS signature is not verified by our code**: we pin the correct round and use its randomness; any drand client can verify the signature.
5. **"Attempts" for counterfactuals exclude rate-limited and post-close requests**: they never reach allocation; including them would blur the comparison.
6. **Gateway on port 8088** (8080 was busy on the dev machine); configurable with `GATEWAY_PORT`.
7. **Plain-token fallback** is implemented behind the same endpoint (PRD-permitted); it is linkable by the server.
8. **Bulk load uses the TEST_MODE `/drops/{id}/test-token` endpoint** (PRD-specified) instead of client-side blinding for each of 50,000 Python actors. `/register` still verifies the signature and spends the token exactly as in production. The real blind-signature flow (browser library ↔ Go server) is covered by `tests/smoke.py`, the Go tests and the frontend unit test.
9. **Experiment 4 uses 10 seats and 21 identities** (5 bot operators × 4 identities with ~50,000 bot requests, plus one human) so that "one human among a flood" has a meaningful chance to measure; its ideal human win rate is 10/21 ≈ 0.48.
