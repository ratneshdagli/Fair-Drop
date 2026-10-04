# Architecture decisions

Format: options → tradeoffs → choice → reason.

**ADR-1 Allocation: FCFS vs naive lottery vs identity-capped lottery.** FCFS rewards speed and volume (bots win). A naive lottery over *requests* rewards volume (more requests = more tickets). *Choice:* lottery over **accepted unique receipts**, one receipt per verified identity per drop. Bots get no advantage per identity; the only lever left is buying identities, which has an explicit cost we measure.

**ADR-2 Keeping identity out of the entry: blind signatures vs a server-side ID check vs zero-knowledge proofs.** Server-side check is simplest but lets the server link entries to people (and bias). ZK identity needs heavy tooling for a 1-person-1-entry check. *Choice:* RFC 9474 blind RSA (standardised, small libs in Go and the browser). Fallback `plain` mode behind the same `/register` contract if blinding misbehaves.

**ADR-3 Uniqueness: Redis Lua vs Postgres transactions.** PG rows give strong guarantees but 50k users within seconds hit a hot-row/connection wall. *Choice:* atomic Lua in Redis on the hot path, Postgres unique constraints as the independent audit. Both must agree (integrity counters).

**ADR-4 Clock: wall clocks vs Redis TIME.** Replica clock skew would let a replica accept entries late. *Choice:* Redis `TIME` in every Lua script, one clock.

**ADR-5 Public randomness: committed seed only vs seed + drand.** A committed seed alone lets the operator grind seeds before publishing the hash. Adding a beacon from a round that did not exist at lock time removes that. *Choice:* both, drand optional (`DRAND_ENABLED`), with `DrandRoundAfter` pinning the round.

**ADR-6 Merkle leaf binds tier.** Without it a malicious server could move a winner between tiers after the lock. *Deviation from the PRD sketch, which listed receipt only.* Cost: none.

**ADR-7 Seat = draw rank.** Ranks fill tiers in order of score; waitlist is the remainder. Timing of claim never changes rank. Cascade on expiry is deterministic (`elig` ZSET + `wlptr`).

**ADR-8 Counterfactuals on the same attempts.** The attempts stream records every accepted/rejected request with evaluation-only actor labels. FCFS = arrival order; naive lottery = every request is a ticket; Fair Drop = the real result; each with a per-account cap of 4. Naive and Fair Drop expectations are averaged over 200 re-draws so one lucky draw is not mistaken for an advantage.

**ADR-9 Load generator: Locust actor queue.** Each Locust "user" pulls the next actor from a time-ordered plan (partitioned per worker process), so thousands of identities are scheduled with the arrival pattern we choose rather than N parallel loops. Realistic bots (retries, backoff, IP rotation) live in `profiles.py`.

**ADR-10 UI_MIMIC without a real browser.** Playwright at 50k actors is out of budget on one machine. *Deviation:* UI_MIMIC replays the sequence the UI would make (page loads, think time, the same blind-sign flow) over HTTP. It does not execute JS.

**ADR-11 Rate limits.** Used only so the service stays up; the experiments run with the guard enabled and the draw does not read it. Claims about bots are limited to "no allocation advantage per request or per IP", never "bots are impossible".

**ADR-12 State machine permits transitions from any process.** Timers (worker) and manual admin advance race through the same Redis CAS. *Deviation:* the PRD implied a single orchestrator; this is more robust to the worker dying.

**ADR-13 Frontend: Next.js 16, Tailwind 4, hand-written shadcn-style primitives, recharts, @noble/hashes.** `crypto.subtle` is unavailable on plain-http origins, so hashing uses `@noble/hashes` in the browser verifier.
