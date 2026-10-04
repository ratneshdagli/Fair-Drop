# Fairness metrics

Implemented in `scoring/metrics.py` (pure functions, tested in `scoring/test_scoring.py`), fed by the server's counterfactuals and the TEST_MODE label file. Labels are **evaluation only**; allocation never reads them.

| metric | definition | target |
|---|---|---|
| **Bot advantage ratio** | (bot share of seats) ÷ (bot share of participating verified identities) | ≤ 1 (1 = a bot identity is exactly as likely to win as a human one) |
| **Seats per operator** | seats won by all identities of one operator | |
| **Cost per seat** | `identities × identity_cost ÷ seats` per operator. `identity_cost` is an explicit, configurable assumption (`FD_IDENTITY_COST_USD`, default $3) | rises as an operator buys identities |
| **Human win rate** | humans who won ÷ humans who entered | ≥ no-bot baseline |
| **Integrity** | six violation counters: oversold, duplicate entries, duplicate seats, missing receipts, broken Merkle, invalid transitions | all 0 |
| **Latency** p50/p95/p99, **error rate**, **rps** | from the attack engine's own per-request recorder (merged across Locust workers) and the server histograms | |

## Counterfactuals on the same attempts
The server records every entry attempt (`actor`, tier, accepted?). Three policies are scored on that stream, each with the per-account cap of 4 seats:
- **FCFS**: first requests in arrival order win. Volume and speed matter.
- **Naive lottery**: every request is a ticket, so volume matters; averaged over 200 independent re-draws.
- **Fair Drop**: the real draw plus its expectation over 200 re-draws (a single draw is noisy, the expectation is the honest comparison).

A **live FCFS** run (`--also-fcfs`) replays the identical actors against the real baseline sale as a cross-check of the FCFS counterfactual.

## Honest limits
- The ratio uses identities as the unit. An operator with more *identities* wins proportionally more seats; that is the Sybil experiment (3), reported as seats-per-operator and cost-per-seat, not hidden.
- Rate-limited requests and requests after close are excluded from "attempts" (documented deviation); they never affect allocation either way.
- Bot profiles are our best-effort realistic models, not a proof against every possible attacker.

## Protection accuracy: false positives and false negatives
`GET /admin/drops/{id}/protection` re-judges every recorded decision (the *decision feed*: one record per accept/reject with reason, actor and IP) with an **oracle built from facts the server did not decide**:

| decision | oracle (independent facts) |
|---|---|
| token request | eligible iff `verified_at ≤ cutoff` (from the user store), window open at that instant (Redis-stamped `at_OPEN`/`at_CLOSED`), no earlier token for that actor in the feed |
| register | window open, receipt not yet registered earlier in the feed |
| rejected "forged signature" | the stored token+signature are verified again against the drop public key; it must fail |
| rejected "token reused" | an earlier accepted entry with the same receipt must exist |
| rejected "window closed" | event time must be on/after the stamped close time |
| rate-limited (429) | the counter value and limit stored with the event must show count > limit |

Confusion matrix (positive = "should be rejected"): **TP** correctly blocked, **FP** good request wrongly blocked, **FN** bad request wrongly allowed, **TN** correctly allowed. Throttled (429) first attempts are a *delay* for a legitimate user and are counted separately; whether they finally got in is reported per person (`people.*`, "locked out" = a real false positive for a person). Idempotent retries are "absorbed" (no second entry).

Bot/human labels split the matrix by kind (TEST_MODE only). Limits: the oracle checks the server's *consistency* with its own rules and the independently stored facts; it cannot tell a genuinely sophisticated bot from a person (that is why the allocation never depends on it), and `rate_limited` correctness rests on the stored counter. The black-box **self-test** (below) complements it: expected answers are fixed before sending.

Production privacy note: outside TEST_MODE the feed stores no actor or IP for token events, so it cannot be used to link a token request to a later anonymous registration.

## Per bot type (`by_profile`)
`/protection` also returns, for each bot type and for real people: accounts, accounts that got an entry, requests sent, accepted / turned away / absorbed / decoy, and the reasons for each turn-away. Labels carry `kind|operator|profile` (evaluation only; allocation never reads them). Request totals count a person once: getting a ticket is a step, entering is the outcome. The old-sale oracle orders decisions by the Redis TIME stamped inside the atomic script, so two requests handled by different servers in the same millisecond can't be mis-ordered.
