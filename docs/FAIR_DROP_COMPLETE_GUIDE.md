# Fair Drop: The Complete Guide

One document with everything: what it is, how the website works, the architecture, how the bots are simulated, how we attacked and defended it, the tests, the results and the API. Read Part 1 for the story; the later parts are the detailed reference.

## Contents
1. Overview: the problem, the idea, how it works for a person
2. The website: every page and the Control Room
3. How the bots are simulated (Bot Lab, the 7 bot types, the judge)
4. Reference documents, in order: Architecture · Cryptography · Attack engine · Red team · Fairness metrics · Tests explained · Testing commands · Demo runbook · System analysis · Research · Architecture decisions · API contract · Dependencies · README and results
5. Honest limits

---

# Part 1: Overview

## Latest version: the Live Arena (read this first)
Parts of this guide below describe the earlier Control Room. The current, simpler way to see and show everything is the **Live Arena** (`/live`, or the first tab of Admin):
- **Control panel**: choose how many real people and how many bot accounts of each of the **11 bot kinds** (the original 7 plus a real-ticket bot that builds genuine blind-RSA tickets itself, a careful scraper that avoids the decoy, a boundary sniper that fires around the open and close instants, and a seat sniper that hammers the claim step), choose how fast the crowd arrives, and Start / Stop / Restart.
- **Three methods, same crowd, same 500 seats**: first come first served (a real live sale), a simple lottery where every request is a ticket (calculated exactly from the final list of requests), and Fair Drop (live, then the real draw). Orange squares are seats that went to bots.
- **The bots, live**: hover any bot to see what it is doing right now (or, if quiet, its last recorded actions); click an account to follow it.
- **The real web traffic**: the servers' own record of every HTTP request (method, path, status, milliseconds, which of the 3 servers, account, address, bot kind). Proof the bots really send traffic.
- **Do the numbers add up?**: the screen checks its own figures against each other, live.
- **How the research scores this**: false-positive rate against the strict 0.1% target, precision / recall / F1, and whether each bot kind arrives differently from real people; PR-AUC, mouse tracking and fingerprinting are marked not applicable, with the reason.
- **Fixes worth knowing**: a re-created test sale now starts a new audit epoch (before, earlier tests' entries were counted as "missing receipts"); a sale-id reuse no longer shows the previous test's results; the live simple-lottery estimate was removed because it ignored the three price tiers (it is shown only as an exact result after the draw).
- **Set-up for someone new**: see `SETUP.md` in the project root.
Honest limits: the identity farm (many genuinely verified accounts) is not blocked; most simulated people and bots get tickets through a test shortcut (only the real-ticket bot blinds locally); the Go unit tests were not run on the build machine (Docker compiled the code and live runs passed); not measured at 50,000 people on the new screen.

## The problem
500 seats, 50,000 people. In a normal "first-come-first-served" (FCFS) sale, whoever's request reaches the server first wins. That rewards speed, not need: scripts, many addresses and bought accounts beat real people. In our test, bots that were 4% of the crowd took about 20% of the seats under FCFS.

## The idea
Fair Drop turns the sale into a lottery that speed cannot win:
- **One verified identity = one entry.** You verify a phone once, before a cutoff.
- **Entries are anonymous.** A blind signature lets the server sign your ticket without seeing which one is yours.
- **The list is sealed before the draw.** At close, all entries are locked under one fingerprint (a Merkle root) and published.
- **The draw is checkable.** A secret committed in advance (plus optional public randomness) picks winners; anyone can recompute it.
- **Everything is logged** in a tamper-evident, hash-chained audit log.

We do not claim bots are impossible. We claim a bot gets nothing from speed, volume or many addresses, and each extra seat costs it a real verified identity. An "identity farm" (many genuinely verified accounts) still gets one entry per account; cost per account is the only brake.

## The journey of a real person (6 steps)
1. **Prove who you are**: verify your phone once before the deadline.
2. **Get your ONE ticket**: the server blind-signs one ticket per person; a second request is refused.
3. **Enter anonymously**: hand in the ticket without logging in. A ticket works once; repeats are ignored.
4. **The list is sealed**: at close, the Merkle root is published; nobody can add, remove or swap an entry.
5. **Winners are drawn**: score = H(final seed || receipt); lowest scores win; the rest form the waitlist.
6. **Winners claim seats** in a short window; unclaimed seats go to the next person waiting.

## The protection rules a request meets
Real verified person · one ticket per person · genuine (signed) ticket · one use per ticket · slow-down for floods (only *useless* requests count against an address, so real neighbours on a shared address are not blocked) · decoy trap for bots that find the hidden "fast" endpoint · sale window. After close: sealed list plus public draw.

## FCFS vs Fair Drop in one line
FCFS rewards speed, so bots win. Fair Drop rewards being one verified person, so speed and volume buy nothing. (FCFS feels fair as a physical queue, but online "first" means fastest connection or script, not who waited. Fair Drop could be extended with a bonus for early verifiers; how much is a policy choice.)

## How to run it
```
scripts\start.ps1      (or scripts/start.sh)   starts everything and reloads the gateway
scripts\seed.ps1       once: 50,000 synthetic verified users (test mode)
```
Open http://localhost:8088 (fan site), http://localhost:8088/admin (admin / admin-demo-pass), Grafana http://localhost:3001, Prometheus http://localhost:9090. After rebuilding web servers, reload the gateway: `docker exec fd-nginx nginx -s reload`.

---

# Part 2: The website

| Page | What it is |
|---|---|
| `/` | Events list (fan site), including the "Old way: first-come-first-served" comparison sale. |
| `/events/{id}`, `/enter/{id}` | An event, and the enter flow (get a ticket, submit it anonymously). |
| `/status/{id}`, `/ticket/{id}`, `/claim/{id}` | Your receipt and Merkle proof; your ticket; claiming a seat. |
| `/verify` | Anyone can re-check a draw: root, seed commitment, scores. Green after lock; red if the server cheated. |
| `/story` | Scroll-driven 3D explanation (people, bots, old way, sealed list, draw). |
| `/admin` | The operator console. |

## Admin: Control Room (the demo screen)
Jump bar: Live picture · How it works · Tickets & queue · Server health · The bots · Is protection right? · Try to break it · Old way vs new way · What each test means · What the words mean.

- **Controls**: crowd size (2,500 to 50,000 people), Protection ON/OFF toggle, **Start bot attack**, **Quick safety check** (18 known-good and known-bad requests), **Try to break it** (red team), **Restart: clear everything** (stops any running test, deletes test sales, results and counters, turns protection back ON; real users and the audit log are kept).
- **NEW WAY / OLD WAY** buttons watch the fair sale or the FCFS replay of the same crowd.
- **Live picture**: every dot is one server decision. Blue = person, orange = bot. At the gate: green = let in, red = turned away (the reason pops up), purple = decoy trap. Counters: people on the site, clicks/s, let in/s, turned away/s, real people in the draw, bot accounts that got in, bot requests turned away, and **real people wrongly turned away (should always be 0)**.
- **How it works**: the 6-step journey and the rule cards with live "stopped" counts and which bot types each rule caught.
- **Tickets & queue**: tickets total/sold/left, requests in flight, database writes waiting.
- **Server health**: servers up, typical and slow response times, errors, Redis and Postgres figures, per-replica status.
- **The bots**: each bot type, what it tried, what it got versus what we expected.
- **Is protection right?**: an independent judge re-checks every decision and fills a confusion matrix (correctly blocked, missed, wrongly blocked, correctly allowed).
- **Old way vs new way**: bars for the same crowd under FCFS and Fair Drop.
- **Bot Lab**: design your own test (Part 3).

Other admin tabs: Summary, Run a sale step by step, Server details, Detailed results, Tamper checks (verify the audit chain, edit an event to watch it turn red, repair), Test tools (reset a sale, malicious-server demo, run experiments).

---

# Part 3: How the bots are simulated

## Bot Lab
Admin → Control Room → **Bot Lab**: choose how many real people and how many bots of each type (1 to 50,000 accounts in total), or pick a preset (No bots · A few of each · Heavy attack · Only a big identity farm · Only shortcut seekers), then **Run this test**. The same crowd also runs through the old FCFS sale for comparison. Every bot account is a verified account allowed one entry, like a person; the test asks whether any bot can get *more* than one or slip past the rules.

## The 7 bot types
| Bot | What it does | What stops it | What we expect |
|---|---|---|---|
| Speed bot | Clicks the instant the sale opens and hammers | Speed buys nothing; extra clicks ignored | at most 1 entry per account |
| Flooder | One account sending hundreds of mixed requests | One ticket per person; flood slowed | at most 1 entry per account |
| Retry-spammer | Re-sends the same request, even in parallel | Same receipt back, no second entry | at most 1 entry per account |
| Address-hopper | A new internet address for every request | The address limit is not the defence; the ticket is | at most 1 entry per account |
| Identity farm | Many real, verified, bought accounts used properly | Not stopped; only cost | 1 entry per bought account |
| Shortcut seeker | Reads the API, uses a hidden "fast" endpoint | Decoy trap: burns its ticket, worthless receipt | 0 entries |
| Human mimic | Walks the real steps slowly | Looks human, so treated as a human | 1 entry per account |

## Real people and ground truth
Real people are simulated as one device, one attempt, polite retries. The attack engine labels every simulated identity (`kind|operator|profile`) for evaluation only; **allocation never reads these labels**. The judge compares each server decision with that ground truth.

## How a run works
Locust generates the load from the attack container through the gateway; a scenario plan decides who attacks when; results go to `reports/<experiment>/`, and the Control Room shows them live from a decision feed (a Redis stream). That feed and its per-profile breakdown draw the dots and fill the bots table.

---

# Part 4: Reference documents


## 4.1 Architecture


```
browser ──► nginx :8088 ─┬─ /api/*   ─► api1 api2 api3 (Go, stateless, chi)  ─┬─► Redis (hot path: Lua, TIME, ZSETs, Streams)
                         ├─ /attack/ ─► attack engine (Locust + control API)  └─► Postgres (permanent record)
                         └─ /        ─► Next.js frontend                      worker (timers, ledger, drift-free ticks)
                                                                                 │
Prometheus ◄── scrape api1-3 + worker ── Grafana (provisioned "Fair Drop" dashboard)
```

#### Why this shape
- **Replicas are stateless.** Every decision that must be unique (one token per identity, one spend per token, one seat per rank, state transitions) is a single Redis Lua script, so any replica can serve any request and any replica can die mid-window. Redis `TIME` is the only clock; replicas never compare their own wall clocks.
- **Redis is the hot path, Postgres the record.** Registration touches only Redis. Events are appended to a Redis Stream; the worker's ledger consumer batches them into Postgres inside a hash chain (`audit_log`) and copies entries/allocations. Unique constraints in Postgres are the second line of defence for the integrity counters.
- **Allocation is timing-independent.** The lottery draws over the *set* of accepted receipts, so arrival order, request volume and IP never enter the score.
- **Defences are for availability only.** Per-IP and per-account rate limits keep the service alive under flood, and the tarpit decoy and spent-token set cost nothing to honest users. None of them is an input to allocation; turning them off (Test tools) must not change who wins.

#### Modules (Go package `internal/app`, crypto in `internal/fdcrypto`)
| module | file | job |
|---|---|---|
| auth | `auth.go` | simulated OTP, JWT, admin login, eligibility cutoff timestamp |
| issuer | `entry.go` (`hToken`) | per-drop key, blind-sign once per identity |
| entry | `entry.go` (`hRegister`, `hTarpit`) | sessionless register, spend token, receipt, decoy |
| guard | `guard.go` | Lua token-bucket per IP and per account; `X-Sim-IP` only in TEST_MODE |
| lifecycle | `lifecycle.go` | CAS state machine, timers, manual admin advance |
| draw | `draw.go` | lock (Merkle), reveal, drand, ranking, counterfactuals, verify bundle |
| claim | `claim.go` | claim window, timeout, waitlist cascade |
| baseline | `baseline.go` | classic FCFS sale for comparison |
| ledger | `ledger.go` | stream → hash-chained audit log, chain verification, integrity counters |
| testkit | `testkit.go` | TEST_MODE seeding, reset, labels, malicious mode, kill |
| live/metrics | `live.go`, `metrics.go` | SSE snapshot, Prometheus, replica heartbeats |

#### Data flow of one entry
`fan` → `POST /token` (JWT) → guard → Lua *issue* (SETNX per user per drop, then sign) → `POST /register` (no JWT) → verify signature → Lua *register* (SADD spent; HSET entry; XADD stream) → receipt.
At LOCK the worker reads all entries, builds the Merkle tree, stores the root, publishes it. At DRAWN: reveal seed, fetch beacon, rank, write `allocations` and `counterfactuals` (FCFS / naive lottery / Fair Drop computed on the *same* recorded attempts).

#### Failure handling
- nginx retries idempotent requests on the next replica; `register` is idempotent by design (deterministic receipt), `token` replays return the same signature.
- `POST /test/die` exits a replica with 137; compose `restart: unless-stopped` brings it back; the live monitor shows it DOWN then healthy; the integrity counters must stay zero (experiment 6).
- Worker restarts resume from the Redis consumer-group offset; the ledger chain continues from `audit_head`.

---

## 4.2 Cryptography


Frozen formats are in `backend/internal/fdcrypto/merkle.go` and pinned by `docs/test-vectors.json` (generated by Go, checked by Go, Python and the browser).

#### 1. One identity, one entry, unlinkable: blind signatures
- **Scheme:** RFC 9474 `RSABSSA-SHA384-PSS-Deterministic`, RSA-2048, one key pair **per drop** (Go: `cloudflare/circl`; browser: `@cloudflare/blindrsa-ts`).
- The fan's browser makes a random `token_secret`, blinds it, and sends the blinded message **with their session**. The server checks eligibility, issues **at most one** signature per identity (Redis Lua), and signs the blinded value, so it never sees `token_secret`.
- The fan later sends `token_secret` + unblinded signature to `/register` with **no session**. The server verifies the signature against the drop public key and spends the token once. The server therefore knows *that* a valid, unique token entered, not *whose*.
- **Fallback:** `BLIND_MODE=plain` signs the token directly (RSA-PSS). `/register` verifies exactly the same signature either way, so the endpoint contract is unchanged. Plain mode is linkable by the server; that is the documented price of the fallback.

#### 2. Receipts
`receipt_id = SHA-256("fd:receipt:v1" ‖ token_secret)`: deterministic, so a retried registration returns the same receipt. The server returns an ECDSA P-256 signature over `(drop, receipt, tier)`; the fan keeps it as proof the server accepted the entry.

#### 3. Publicly locked entry list: Merkle tree
- Leaf = `SHA-256(0x00 ‖ receipt ‖ tier)` (domain separated, **tier is bound into the leaf** so tiers cannot be swapped later); node = `SHA-256(0x01 ‖ L ‖ R)`; leaves sorted by receipt; odd last node duplicated.
- The root is published when the drop goes LOCKED, **before** the seed is revealed. Anyone can ask for an inclusion proof for their receipt and check it against the root.
- A server that drops an entry must publish a root that doesn't contain the victim's receipt; the victim's proof fails and the verify page turns red. Independently, the audit ledger recorded the accepted receipt, so the admin integrity panel reports `missing_receipts > 0`.

#### 4. Seed commit-reveal and the draw
1. At drop creation the server picks `seed` (32 random bytes) and publishes `seed_hash = SHA-256(seed)`.
2. After LOCKED the seed is revealed. Anyone checks `H(seed) == seed_hash`.
3. Optional beacon: a drand quicknet round that **did not exist at lock time** (computed by `DrandRoundAfter`). It is mixed in so even a server that grinds its seed cannot choose the outcome. Its BLS signature check is delegated to drand clients (documented deviation).
4. `final = SHA-256(seed ‖ merkle_root ‖ beacon?)`; `score(receipt) = SHA-256(final ‖ receipt)`; **lowest score wins**. Ranking is a pure function: ranks 1..N fill seats by tier; the rest is the ordered waitlist.

#### 5. Tickets
ECDSA P-256 signature over the claimed ticket; a QR code carries it; verification needs only the drop's EC public key.

#### 6. What is *not* claimed
- Blind signatures do not stop one person from owning several verified identities. That is an identity-cost question, measured by the Sybil experiment, not solved cryptographically.
- drand beacon BLS verification is left to drand clients; the verifier checks that the round is the right one and that its randomness is the one used.
- JWT secrets and the demo credentials in `docker-compose.yml` are for the demo only.

---

## 4.3 Attack Engine


`attack_engine/`: Locust + a scenario runner. Everything is driven by a seeded plan (each scenario has a fixed seed), so who acts when, from which IP and with which tier is identical across runs; `/test/reset` only rotates the drop's own seed and keys.

#### Model
- **Identity pool**: 50,000 synthetic verified users `t_000001…` (`POST /test/seed`).
- **Operators**: a bot operator owns N identities and an IP pool, runs one profile. Humans are operator `humans`, one identity and one IP each.
- **Plan** (`build_plan`): a time-ordered list of actors `{uid, kind, op, profile, offset, tier, ip}`. Bots attack at open; humans arrive in a "rush" (60% right after open, the rest spread).
- **Actor queue**: each Locust user pulls the next actor whose offset is due; worker processes take disjoint slices. Done markers and per-worker metrics/tokens JSON are merged by the runner.

#### Profiles
| profile | behaviour |
|---|---|
| HUMAN | login, think time, token, register, occasional retry on failure |
| SPEED_BOT | no think time, immediate token+register, a few repeats |
| FLOOD_BOT | hundreds of requests per identity from few IPs |
| RETRY_BOT | persistent retries with backoff on 429/5xx |
| PROXY_ROTATOR | a new `X-Sim-IP` every request out of a 2,000-IP pool |
| SYBIL_OPERATOR | many identities, each acting once, one IP pool |
| API_SCRAPER | skips the UI, finds `register-fast` (the tarpit) |
| UI_MIMIC | follows the page sequence with human-like delays (no JS execution; see ADR-10) |

Every profile has a Fair Drop flow and an FCFS flow so the same actors can attack both.

#### Experiments (`python -m attack_engine run expN [--scale S] [--also-fcfs]`)
| id | what | what we look at |
|---|---|---|
| exp1 | 50,000 humans, no bots | baseline human win rate, latency, integrity |
| exp2 | 20 operators × 10 identities, 2,000 rotating IPs each, flooding | bot advantage ratio vs FCFS/naive |
| exp3 | Sybil scale 100 / 1,000 / 10,000 identities | seats per operator, cost per seat |
| exp4 | ~50,000 bot requests + 1 human | that human's chance vs the ideal |
| exp5 | API scrapers vs UI-mimic bots | tarpit hits, entries accepted |
| exp6 | kill a replica mid-window (`/test/die`) | errors, retries, integrity, recovery |
| exp7 | malicious server drops one entry | victim verify red, `missing_receipts` > 0 |

Run from Admin → Test tools, the control API (`POST :9200/run`), or `scripts/run_experiment.sh|ps1`, `scripts/run_all_experiments.sh|ps1`. `--scale 0.1` runs 10% of the population.

#### Output
`reports/<experiment>/{results.json, results.csv, summary.md, charts/}`; live FCFS replays go to `.../live_fcfs/`. Results are also pushed to `/test/experiments` so the admin Fairness tab shows real recorded data.

#### Protection self-test (`python -m attack_engine selftest`, or Admin → Control Room → "Quick safety check")
Creates a fresh mini-sale and sends 18 cases whose expected answer is fixed in advance: honest entry, idempotent retry, token reuse, forged signature, tampered token, second token request, unauthenticated request, late signup (ineligible), decoy endpoint, a 150-request flood from one IP (some 429) while a normal person on another IP still gets in, entering after close, token after close, and after locking: the sealed list holds exactly the legitimate entries (forged/decoy/late excluded) and the integrity counters are zero. Last run: **18 / 18 passed**.

---

## 4.4 Red Team


Goal: find ways for a bot owner to win more than "one entry per verified person", then fix them. Run it: `python -m attack_engine redteam`, or Admin → Control Room → **Try to break it**. 17 tricks (two rounds), each with the attacker's aim, the move, and a verdict (`held` / `BROKEN`).

#### What the first run found (before any fix): 6 real holes
Saved as `reports/redteam/before_fix.json`.

| Trick | What worked | Why it matters | Fix |
|---|---|---|---|
| One phone, many identities | The same number written 5 ways ("+1 555…", "1-(555)…", "00 1555…") made 5 separate verified identities | Breaks "one person, one entry": one SIM could be many people | Phone reduced to digits before it becomes an identity |
| Guess a login code | Unlimited guesses on a 6-digit code | A distributed guesser takes over a victim's account | 5 wrong guesses destroy the code |
| Spam login codes | 8 of 8 codes sent to one number | SMS cost / harassment | Max 3 codes per number per 10 min |
| Guess the admin password | No lockout | Brute force of the admin login | 5 wrong passwords per address = 5 min lockout |
| Enormous requests | 64 MB bodies accepted on public endpoints | Memory exhaustion by a flood of huge requests | 64 KB cap at the gateway and the server |
| Hijack a retry key | Reusing someone's `Idempotency-Key` with your own ticket broke their safe retry (they got "token used") | Targeted griefing | The retry key is scoped to its own ticket |

After the fixes the same 14 tricks: 12 held, 1 informational, 1 demo-only (`reports/redteam/after_fix.json`). Each fix has a permanent Go test.

#### Round 2: one more hole, two more checks
Saved as `reports/redteam/round2_before_fix.json` (before) and `after_fix_in_network.json` (after, run from inside the Docker network: 17 tricks, 15 held, 0 broken, the rest informational / demo-only).

| Trick | What worked | Fix |
|---|---|---|
| **Flood from the same address as real people** | 24 flooders on one address used up the address's quota, so a real person on the same office/campus/mobile address was told "too many requests" | Only *useless* requests (forged or reused tickets, repeated ticket asks) count against an address; a valid first-time request is never throttled by neighbours' noise (Go test `TestFlooderCannotLockOutNeighboursOnTheSameAddress`) |
| Hammer the big public download | Held: the finished list never changes, so it is cached | none needed |
| Hold 1,500 connections open (Slowloris) | Held from inside the network: silent connections are dropped after 10 s. From the host laptop Docker Desktop's port forwarder stalls under 1,500 hung connections; that is a laptop artefact, not the product | none needed |

#### What already held
Ticket from another sale (400) · a login card with no signature (401) · reading the secret seed early (only its fingerprint is public) · reading tier crowding to pick the emptiest tier (hidden until the list is sealed) · a second ticket in another tier (409) · lying about the address in headers (the gateway overwrites it; 48 of 80 throttled).

#### Not holes, but you should know
- **Identity farm**: a bot owner who owns many *genuinely verified* accounts gets one entry per account. Nothing in the entry flow can tell them apart from many people. Defence = the cost per verified account (see experiment 3 and the cost-per-seat figures).
- **Tier switch**: a blind signature can't carry the tier, so a ticket asked for in Gold can be entered as General. Harmless because crowding is hidden during the sale.
- **Demo secret**: the demo runs with published passwords, so a token signed with the demo JWT secret is accepted *here*. The server now refuses to start outside `TEST_MODE` with the demo admin password, JWT secret or test key.
- **Phone formats**: "5551234567" vs "15551234567" (national vs international) still differ; closing that needs a phone library with a default country.
- **Admin lockout is per address**: a distributed guesser gets 5 tries per address. Use a strong `ADMIN_PASSWORD`.
- Dev ports for Redis, Postgres and the three web servers are bound to 127.0.0.1 only.
- After rebuilding web servers, reload the gateway (`docker exec fd-nginx nginx -s reload`; `scripts/start.*` does it). The gateway resolves the servers once at start-up; without a reload one server takes all the load. This showed up for real during testing: one server handled 50,499 requests while the other two handled about 80 each.

---

## 4.5 Fairness Metrics


Implemented in `scoring/metrics.py` (pure functions, tested in `scoring/test_scoring.py`), fed by the server's counterfactuals and the TEST_MODE label file. Labels are **evaluation only**; allocation never reads them.

| metric | definition | target |
|---|---|---|
| **Bot advantage ratio** | (bot share of seats) ÷ (bot share of participating verified identities) | ≤ 1 (1 = a bot identity is exactly as likely to win as a human one) |
| **Seats per operator** | seats won by all identities of one operator | |
| **Cost per seat** | `identities × identity_cost ÷ seats` per operator. `identity_cost` is an explicit, configurable assumption (`FD_IDENTITY_COST_USD`, default $3) | rises as an operator buys identities |
| **Human win rate** | humans who won ÷ humans who entered | ≥ no-bot baseline |
| **Integrity** | six violation counters: oversold, duplicate entries, duplicate seats, missing receipts, broken Merkle, invalid transitions | all 0 |
| **Latency** p50/p95/p99, **error rate**, **rps** | from the attack engine's own per-request recorder (merged across Locust workers) and the server histograms | |

#### Counterfactuals on the same attempts
The server records every entry attempt (`actor`, tier, accepted?). Three policies are scored on that stream, each with the per-account cap of 4 seats:
- **FCFS**: first requests in arrival order win. Volume and speed matter.
- **Naive lottery**: every request is a ticket, so volume matters; averaged over 200 independent re-draws.
- **Fair Drop**: the real draw plus its expectation over 200 re-draws (a single draw is noisy, the expectation is the honest comparison).

A **live FCFS** run (`--also-fcfs`) replays the identical actors against the real baseline sale as a cross-check of the FCFS counterfactual.

#### Honest limits
- The ratio uses identities as the unit. An operator with more *identities* wins proportionally more seats; that is the Sybil experiment (3), reported as seats-per-operator and cost-per-seat, not hidden.
- Rate-limited requests and requests after close are excluded from "attempts" (documented deviation); they never affect allocation either way.
- Bot profiles are our best-effort realistic models, not a proof against every possible attacker.

#### Protection accuracy: false positives and false negatives
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

#### Per bot type (`by_profile`)
`/protection` also returns, for each bot type and for real people: accounts, accounts that got an entry, requests sent, accepted / turned away / absorbed / decoy, and the reasons for each turn-away. Labels carry `kind|operator|profile` (evaluation only; allocation never reads them). Request totals count a person once: getting a ticket is a step, entering is the outcome. The old-sale oracle orders decisions by the Redis TIME stamped inside the atomic script, so two requests handled by different servers in the same millisecond can't be mis-ordered.

---

## 4.6 Tests Explained


**Plain names used on the admin Control Room page** (technical name in brackets):
Quick safety check (self-test) · Try to break it (red team) · Bot attack (load test) · Old way vs new way (before/after) · Full walkthrough (smoke test) · Code checks (unit tests) · The 7 big experiments.
The same list is on the Control Room page under "What each test means", together with the sale's stages in plain words.

There are four kinds of checks. Each answers a different question.

| Kind | Question it answers | When it runs |
|---|---|---|
| **A. Unit tests** | "Is each small piece of code correct on its own?" | Before you ship, no website needed |
| **B. Smoke test** | "Does the whole thing work once, start to finish?" | Needs the stack running |
| **C. Quick safety check = protection self-test (18 cases)** | "Does the gate let the right people in and keep the wrong ones out?" | Button in Admin → Control Room |
| **D. The 7 big experiments** | "Is it actually fairer than first-come-first-served, under attack?" | Needs the stack running; takes minutes |

Everything below is a real check that exists in the repo.

---

#### A. Unit tests (small pieces, fast, no website needed)

##### Go backend: `backend/internal/fdcrypto/fdcrypto_test.go` (the maths)
| Test | In plain words |
|---|---|
| `TestMerkleSizes` | The "sealed list fingerprint" is computed correctly for lists of awkward sizes (0, 1, 2, 3, 5, 7, 8, 1000, 4097 and 50,000 entries). Every entry's proof must check out, and changing an entry's tier must break it. |
| `TestMerkleOrderIndependentAndDuplicates` | Shuffling the list gives the same fingerprint, and a duplicate entry is rejected. |
| `TestDrawDeterministic` | Same inputs always give the same winners. Nothing random at draw time. |
| `TestBlindFlowAndPlainFallback` | The "ticket the server signed without seeing" works, and the simpler fallback works too. |
| `TestWriteVectors` | Writes the answer key (`docs/test-vectors.json`) that the Python and browser checks are compared against. |

##### Go backend: `backend/internal/app/app_test.go` (the rules, run against a real Redis and Postgres)
| Test | In plain words |
|---|---|
| `TestAuthAndTestkitHidden` | In production mode the test backdoors (`/test/...`) don't exist (404). Admin pages refuse no login, a normal fan's login and a garbage login. A wrong one-time code is refused and the right one logs you in. |
| `TestEligibilityCutoff` | Someone verified after the cutoff can't get a ticket token (403), someone verified before it can, and the late person can still browse the page. |
| `TestConcurrentDuplicateIssuance` | 200 simultaneous requests from one person (each with a different ticket) produce exactly ONE token; the other 199 are refused. A harmless retry of the same request returns the same signature. |
| `TestEntryValidReusedBadSigIdempotent` | A good token enters; 300 simultaneous retries all get the same receipt and still only ONE entry exists; reusing it without the retry key is refused; a forged one is refused; an invalid tier is refused. |
| `TestTarpitBurnsToken` | The decoy "fast lane" fools bots but never puts them in the real list. |
| `TestIllegalTransitionsAndWindowClosed` | The sale can't skip steps (e.g. draw before lock), and nothing is accepted after close. |
| `TestFullDrawIsReproducibleFromBundle` | Download the public data, recompute the draw yourself, get the same winners. |
| `TestClaimsRaceExpiryCascadeNoOversell` | 20 winners each hammer "claim" 5 times at once for 5 seats: exactly 5 seats are given out, never the same seat twice. Second half: if nobody claims, seats pass down the waitlist, exactly the right number stay reserved, and a claim that arrives too late is refused (410). |
| `TestMaliciousServerDetected` | We make the server secretly drop one person's entry. That person's proof request says "not included", the sealed count is 9 not 10, and the safety check reports one missing receipt. |
| `TestBaselineFCFSNoOversell` | The old first-come-first-served sale: 200 buyers × 3 tries for 10 seats sells exactly 10, never more. (So the comparison is fair: the old way is unfair to people, not buggy.) |
| `TestAllocateCapAndOrder` | The "plain lottery with a per-person cap" used in comparisons: one bot sends 3 requests for 3 seats with a cap of 2, so it gets 2 and a real person gets the third. |

##### Python: `scoring/test_scoring.py` (the fairness numbers)
| Test | In plain words |
|---|---|
| `test_bot_advantage_ratio` | "Bot advantage" = share of seats ÷ share of crowd. 1.0 is fair, 50 is terrible. |
| `test_naive_vs_fairdrop_monte_carlo` | Simulated 1000s of times: a plain lottery can be gamed by extra tickets; Fair Drop can't. |
| `test_percentile` | The "slowest 1%" style numbers are calculated correctly. |

##### Python: `verifier/test_verify.py`
The stand-alone verifier script must reproduce the Go answer key exactly (fingerprint, seed mix, ordering, proof paths). It also confirms a proof fails for a wrong tier. Two independent programs agreeing = trust.

##### Python: `attack_engine/test_attack_engine.py` (the bot simulator itself)
| Test | In plain words |
|---|---|
| `test_all_eight_profiles_have_both_flows` | All 8 bot types exist and know both sale types. |
| `test_plan_is_reproducible_and_identities_are_unique` | Same settings give the same crowd; no two people share an identity. |
| `test_operator_to_identity_and_ip_mapping` | Each bot operator controls the identities and IPs we say it does. |
| `test_labels_match_plan` | The "this one is a bot / this one is a person" answer key matches what was sent. This is the key the protection scorecard relies on. |
| `test_sybil_scaling_has_three_sizes_and_exp4_has_one_human` | The "bot buys more identities" experiment has the right crowd shapes. |
| `test_pool_overflow_is_rejected` | Asking for more bots than identities exist gives a clear error, not silent wrong results. |

##### Browser code: `frontend/lib/fdcrypto.test.ts`
| Test | In plain words |
|---|---|
| receipt id | The browser computes the same receipt ID as the server. |
| merkle root, proof, ordering | The browser gets the same fingerprint, proof and winner order as the Go answer key. |
| `verifyBundle` | The "Verify a draw" page accepts an honest draw and flags one with a dropped entry. |
| blinds in JS, Go signs… | End to end: the browser blinds a ticket, the server signs it blind, the browser unblinds, the server accepts it, the receipt checks out. (Skipped unless you set `FD_E2E=1` and the stack is running.) |

---

#### B. Full walkthrough (the "smoke test"): `tests/smoke.py`
One quick story against the running site, with 30 people and 7 seats: create a sale → open → each person gets one ticket token (a second request is refused) → enters (a retry gets the same receipt, a reuse is refused) → a forged ticket is refused → an illegal jump to "draw" is refused → close → lock (30 entries sealed, a person's proof matches the root) → draw → winners claim, except two who stay silent → their seats pass to the next people on the waitlist → check the safety counters are zero and the audit log is unbroken. It prints `SMOKE OK` if everything held.

#### C. Quick safety check (the "protection self-test", 18 cases)
Button: **Admin → Control Room → Quick safety check**. Code: `attack_engine/selftest.py`.
Each case has its expected answer written down BEFORE the request is sent, so a wrong accept (**false negative**) or wrong reject (**false positive**) shows as a red row.

| Group | Cases | Expected |
|---|---|---|
| Real people | honest entry, retry after glitch, honest entry after someone else's forgery, flooded person from a clean IP, normal person during a flood | accepted |
| Cheating | reuse a token, forged signature, tampered token, second token request, no sign-in, signed up after cutoff | rejected |
| Decoy | bot uses the hidden "fast" endpoint | looks accepted, never in the real list |
| Overload | 150 requests from one IP | some throttled, site stays up |
| Timing | entry after close, token after close | rejected |
| After the lock | list contains the honest entry; list has exactly the legitimate entries; safety counters zero | as stated |

#### D. The 7 experiments (`attack_engine`, results in `reports/`)
Run with `scripts/run_all_experiments.sh`. Each uses real bot traffic at scale and compares first-come-first-served, a plain lottery and Fair Drop on the same attempts.
They answer "does it hold under attack?", not "is the code correct?".

#### E. Try to break it (the "red team", 14 tricks): `attack_engine/redteam.py`
We play the bot owner and try 14 real tricks against the live system (see [RED_TEAM.md](RED_TEAM.md)). Button: **Admin → Control Room → Try to break it**. Each hole it finds became a permanent code check (`TestOnePhoneIsOneIdentityAndCodesAreCapped`, `TestWrongGuessesKillTheCodeAndAdminIsLockedOut`, `TestRetryKeyBelongsToItsOwnTicketAndBigBodiesAreRefused`).

---

#### How to run each kind

```bash
bash scripts/gotest.sh                        # A: Go tests
python scoring/test_scoring.py                # A: fairness maths
python verifier/test_verify.py                # A: Python vs Go
cd frontend && npx vitest run                 # A: browser maths (add FD_E2E=1 for the live blind-signature test)
python tests/smoke.py                         # B: smoke (defaults to http://localhost:8088)
# C: Admin → Control Room → Quick safety check
bash scripts/run_all_experiments.sh           # D
python -m attack_engine redteam               # E: try to break it
```

#### What none of these prove
- They don't prove 50,000 people at the same instant (one laptop peaked around 2,000 connections). That needs several load machines.
- The scorecard checks that the server is consistent with the facts it can verify. It can't read a bot's "intent". A bot holding a genuine verified identity still gets one entry, like everyone else.

---

## 4.7 Testing


| layer | command | covers |
|---|---|---|
| Go unit/integration | `./scripts/test.sh` (Go in Docker, Redis db15, PG `fairdrop_test`) | auth, issuer (blind/plain, one-per-identity), entry (spend, idempotent), guard, lifecycle CAS, draw determinism, Merkle proofs, claim race + cascade, ledger chain tamper, integrity counters, kill/failure |
| Crypto vectors | part of the above (`fdcrypto_test.go`, writes `docs/test-vectors.json`) | cross-language format |
| Reference verifier | `python -m pytest verifier/test_verify.py` | Python recomputes root, proofs, ordering; detects dropped entry |
| Scoring | `python -m pytest scoring/test_scoring.py` | bot advantage, cost per seat, counterfactual maths |
| Attack engine | `docker exec fd-attack python -m pytest attack_engine/test_attack_engine.py` (needs `gevent`) | profiles, operator/IP mapping, plan reproducibility, labels |
| Browser crypto | `cd frontend && npm test` | TS Merkle/verify identical to Go vectors, blind-sign round trip, detects a cheating bundle |
| End to end | `python tests/smoke.py` against the running stack | login → blind token → register → lock → reveal → draw → verify → claim → expiry cascade → integrity zero |
| Protection self-test | `docker compose exec -T attack python -m attack_engine selftest` | 18 known-good/known-bad requests, false-positive/false-negative check |
| Experiments | `scripts/run_experiment.sh expN` | the seven PRD experiments, reports under `reports/` |

Rules we follow: no mocks for Redis/Postgres (real services in Docker); bots must retry like real ones; if Fair Drop does worse than expected the run is reported, then fixed and rerun.

---

## 4.8 Demo Runbook


Prereq: `scripts/start.sh` (or `.ps1`), `scripts/seed.sh` once. Open `http://localhost:8088`, admin at `/admin` (`admin` / `admin-demo-pass`), Grafana `http://localhost:3001` (anonymous viewer). Test key: `test-key-demo`.

**Quick path (the best 4 minutes):** open `/admin` → **Control Room**.
1. *Start bot attack* (pick a crowd size). Blue dots are people, orange dots are bots. At the gate each turns green (in), red (turned away, with the reason popped up) or purple (decoy trap).
2. Scroll to **How it works**: the 6 steps a real person goes through, and the 7 rules with live "stopped" counts and which bot types each rule caught.
3. **The bots** table: each bot type, what it tried, what it got versus what we expected (✔ as expected).
4. **Is protection right?** scorecard: an independent judge re-checked every decision (people wrongly stopped should be 0).
5. **Old way vs new way** bars: the same crowd under first-come-first-served.
6. Open **Bot Lab**, pick your own mix of bots (or a preset such as *Heavy attack*), *Run this test*.
7. **Try to break it**: the red-team tricks and which ones held.
Also `/story` has a 3D scroll explanation.

**0:00 FCFS under attack.** Admin → Test tools → *Run an experiment*: `exp2`, scale 0.1, tick *also run live FCFS*. Open `reports/exp2_proxy_flood/summary.md`: in the live FCFS row bots (4% of identities) took ~20% of seats (advantage ≈ 5×). Show `live_fcfs` sold-out within seconds.

**1:00 Same traffic, Fair Drop.** Same table: Fair Drop row ≈ 1× (bots hold their identity share), human win rate comparable or better than FCFS and naive lottery. *Counterfactual* = same recorded attempts, three policies. Show the Fairness tab (Detailed results) chart.

**2:00 Cryptographic proof.** Open an event page → *Enter* → status page shows receipt + Merkle proof; `/verify` goes green after lock; run the reference verifier: `python verifier/verify.py --url http://localhost:8088/api --drop <id> --receipt <receipt>`. Show Admin → Audit → **Verify chain** (green), then *edit a stored event* → red at the exact event, *repair*.

**3:00 Kill a replica.** Run exp6 or `scripts/kill_replica.sh 2` while Live monitor is open: replica goes DOWN, traffic continues via failover, comes back, integrity panel stays all zero.

**3:30 Malicious server.** Test tools → Malicious demo (or `scripts/run_malicious_demo.sh`): server drops one entry at lock. Open that fan's verify page: **red banner**, proof fails; Admin → Audit shows `missing_receipts > 0`.

Reset between runs: Test tools → *Reset selected drop* (keeps users) or `scripts/reset.sh` (wipes everything).

---

## 4.9 System Analysis


#### Problem
500 seats (Gold 100 / Silver 150 / General 250), ~50,000 would-be buyers. Under first-come-first-served the winners are whoever has the fastest connection, the most requests, the most IPs: bots. We want: **one verified identity, one entry; the entry list publicly locked before randomness is revealed; anyone can recompute the draw; speed, request volume and IP rotation confer no advantage.**

#### Actors and threats
| actor | goal | what we do about it |
|---|---|---|
| Fan (human) | get a seat fairly | UI walks them through sign-in → blind token → entry → proof → claim; verify page recomputes everything |
| Bot operator | many seats | cannot win by speed/volume/IP (draw ignores them); can only add *identities*, which costs money (Sybil experiment, cost per seat) |
| Malicious server/admin | favour someone, drop someone | commit–reveal seed + drand, Merkle root before reveal, audit chain, per-fan verification; admin only advances phases, cannot choose winners |
| Flooder | take the site down | rate limits (availability only), decoy tarpit, stateless replicas behind failover |

#### Non-goals (not claimed)
Stopping people from holding several real verified identities; stopping all bots; protecting a compromised identity provider; real SMS/payment (OTP is simulated; ticket price is shown but no money moves).

#### Requirements → where implemented
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

#### Deviations from the PRD (with reasons)
1. **Tier is part of the Merkle leaf**: stops post-lock tier swaps (ADR-6).
2. **State transitions can be triggered by timer or admin through the same CAS**: robust to worker loss (ADR-12).
3. **UI_MIMIC replays the UI request sequence, not a real browser**: 50k Playwright sessions don't fit one machine (ADR-10).
4. **drand BLS signature is not verified by our code**: we pin the correct round and use its randomness; any drand client can verify the signature.
5. **"Attempts" for counterfactuals exclude rate-limited and post-close requests**: they never reach allocation; including them would blur the comparison.
6. **Gateway on port 8088** (8080 was busy on the dev machine); configurable with `GATEWAY_PORT`.
7. **Plain-token fallback** is implemented behind the same endpoint (PRD-permitted); it is linkable by the server.
8. **Bulk load uses the TEST_MODE `/drops/{id}/test-token` endpoint** (PRD-specified) instead of client-side blinding for each of 50,000 Python actors. `/register` still verifies the signature and spends the token exactly as in production. The real blind-signature flow (browser library ↔ Go server) is covered by `tests/smoke.py`, the Go tests and the frontend unit test.
9. **Experiment 4 uses 10 seats and 21 identities** (5 bot operators × 4 identities with ~50,000 bot requests, plus one human) so that "one human among a flood" has a meaningful chance to measure; its ideal human win rate is 10/21 ≈ 0.48.

---

## 4.10 Research


Sources are the standards and prior art that shaped the design; decisions are in `ARCHITECTURE_DECISIONS.md`.

1. **RFC 9474, RSA Blind Signatures** (IETF). Defines `RSABSSA` variants; we use SHA-384, PSS, *deterministic* (no salt) so a retried blind-sign request yields the same signature. Unlinkability holds because the signer sees only the blinded message. Takeaway: tokens are single-use only if the *verifier* keeps a spent set, so Redis `SADD` is part of the design.
2. **Privacy Pass (RFC 9576–9578)**. Same idea (issue once, redeem unlinkably) used by CDNs for anti-abuse. Confirms the two-endpoint shape (issue authenticated, redeem anonymous). We do not use its protocol framing; the drop-scoped key and a 1-per-identity issue rule are what Fair Drop needs.
3. **drand** (League of Entropy; quicknet chain, 3 s rounds, BLS threshold signatures). Verifiable public randomness that nobody (including the operator) can predict before the round. We pick a round strictly after the lock time and mix its randomness. Limitation: we do not verify the BLS signature in our own code; clients can with any drand library.
4. **Certificate Transparency / RFC 6962 Merkle trees.** Domain-separated leaf/node hashing prevents second-preimage attacks on the tree (`0x00`/`0x01` prefixes). We do not need consistency proofs (a single locked tree per drop), only inclusion proofs.
5. **Commit–reveal.** Standard; weakness is grinding by the committer, which is why ADR-5 adds the beacon.
6. **Ticketing bot economics.** Public reporting on the US BOTS Act and ticket-queue lotteries (verified-fan style programmes): FCFS rewards bandwidth; lotteries shift the attack to account creation. That motivated measuring *cost per seat* and the Sybil-scaling experiment rather than claiming bots are stopped.
7. **Redis for atomic admission**: Lua scripts are atomic and `TIME` inside a script is the single clock; Streams + consumer groups give an at-least-once feed to Postgres. The ledger writer is idempotent on `seq`.
8. **Locust**: `FastHttpUser` (geventhttpclient) handles thousands of concurrent users per process; `--processes` forks workers on one machine. We bypass its default "N identical users" model with an actor queue so identities, arrival times and IPs follow a plan.
9. **Counterfactual evaluation**: to compare policies fairly one must replay the *same* arrival stream through each policy (not run separate experiments with different randomness). Expectation over re-draws removes lucky/unlucky single-draw noise.

---

## 4.11 Architecture Decisions


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

---

## 4.12 Api Contract


All paths are served by nginx under `/api` (`http://localhost:8088/api/...`). JSON in/out. Errors are `{"error": "<code>", "detail": "..."}` with a matching HTTP status. `Authorization: Bearer <JWT>` for fan (`role=user`) and admin (`role=admin`) endpoints. The SSE stream also accepts `?access_token=` because `EventSource` cannot set headers.

#### Auth
| Method & path | Body | Result |
|---|---|---|
| `POST /auth/otp` | `{phone}` | Simulated OTP. In dev the code is returned (`dev_code`) and **no SMS is sent** |
| `POST /auth/verify` | `{phone, code}` | `{token, user_id, verified_at}`. The identity is verified once, at that time |
| `POST /admin/login` | `{username, password}` | `{token}` (role `admin`) |

#### Public drop info
| | |
|---|---|
| `GET /drops`, `GET /drops/{id}` | State, tiers, window, cutoff, `seed_hash` (published at creation), RSA `public_key` (JWK/SPKI), `token_mode`, and once locked the `merkle_root` + `entry_count`; after reveal the `seed` and beacon |
| `GET /drops/{id}/proof/{receipt}` | Merkle inclusion proof for one receipt (after LOCKED) |
| `GET /drops/{id}/result/{receipt}` | Rank, win/lose, tier, seat, ECDSA-signed receipt (after DRAWN) |
| `GET /drops/{id}/verify` | Everything needed to recompute the draw offline: sorted `(receipt, tier)` list, root, seed, beacon, ordering. Same bundle the browser verifier and `verifier/verify.py` consume |
| `GET /drops/{id}/seats` | Seat map with claim state |
| `GET /healthz`, `GET /metrics` | Liveness (also pings Redis) and Prometheus |

#### Entry (the two-step, unlinkable flow)
1. `POST /drops/{id}/token` (**authenticated**): `{blinded_msg}` (RFC 9474 blinded message; or `{token_secret}` in plain mode). Returns `{blind_sig}`. Exactly one per verified identity per drop (`409 already_issued`; idempotent replay of the *same* request returns the same signature). `403 ineligible` if verified after the cutoff. `409 closed` outside OPEN.
2. `POST /drops/{id}/register` (**no session, no cookie, no user id**): `{token_secret, signature, tier}`. The server verifies the signature against the drop key, atomically spends the token in Redis (one-time) and returns `{receipt_id, receipt_sig}` where `receipt_id = H(token_secret)`. Replaying the same token returns the same receipt (idempotent); using it for a different tier is rejected (`409`).
3. `POST /drops/{id}/register-fast`: decoy (tarpit). Looks like a faster path to entry, does nothing for allocation, and counts as a tarpit hit.

The server cannot link a receipt to an account: it signed a blinded value.

#### Lifecycle (admin)
`POST /admin/drops/{id}/advance {"to": "OPEN|CLOSED|LOCKED|DRAWN|CLAIM|SETTLED"}`: compare-and-set in Redis; illegal transition = `409 {state, allowed}`. Timers (worker) advance automatically when `auto_draw` is on. `SCHEDULED→OPEN→CLOSED→LOCKED→DRAWN→CLAIM→SETTLED`; `fcfs` drops use `SCHEDULED→OPEN→CLOSED→SETTLED`.

`POST /admin/events {name, venue, starts_at, tiers:[{name, price_cents, seats}]}` · `POST /admin/drops {event_id, mode: fairdrop|fcfs, opens_at, closes_at, cutoff_at, claim_sec, auto_draw}` (generates the seed + `seed_hash`, the per-drop RSA/EC keys).

#### Claims
`POST /drops/{id}/claim {receipt_id, ...}` (authenticated winner): claims the seat within the claim window; expired or declined seats cascade to the next waitlist rank. `GET /me/tickets` returns tickets with the ECDSA ticket signature (QR payload).

#### FCFS baseline
`POST /baseline/{id}/buy` (authenticated): classic first-come-first-served; `GET /baseline/{id}/status` public sold-out status.

#### Admin read APIs
`GET /admin/{events,drops}`, `/admin/drops/{id}/live` (SSE), `/admin/drops/{id}/feed?after=<id>` (sampled stream of accept/reject decisions with who/why, plus exact 3-second rates), `/admin/drops/{id}/protection` (confusion matrix + per-reason audit + per-bot-type breakdown `by_profile`, see FAIRNESS_METRICS), `/admin/drops/{id}/pulse` (the Control Room in one call: tickets sold/left, requests in flight, database writes waiting, typical/slow/slowest wait, 5xx count, server list, Redis and Postgres stats), `/counterfactuals`, `/audit?limit=&verify=1` (hash-chain verification), `/integrity` (six violation counters), `/claims`, `/baseline`, `/admin/experiments[/{id}]`, `/admin/config`.

#### TEST_MODE only (`X-Test-Key`, 404 otherwise)
`POST /test/seed {count}` · `POST /test/login {user_id}` (JWT without OTP) · `POST /drops/{id}/test-token` (a plain token for a test user) · `POST /test/reset {drop_id, state, window_sec, claim_sec}` · `POST|GET /test/labels` · `POST /test/malicious {drop_id, enabled, receipt_id|user_id}` · `POST /test/config {guard:{enabled, ip_limit, acct_limit}}` · `POST /test/experiments` (attack engine pushes results) · `POST /test/die` (replica `exit 137`) · `POST /test/tamper-audit {repair}` · `POST /test/admin-token`.

`X-Sim-IP` (TEST_MODE only) overrides the client IP so one machine can simulate thousands of addresses. `X-Sim-Actor` carries evaluation-only identity for the attempts stream; **allocation never reads it**.

#### Status codes you will see
`200` ok · `400 bad_request` · `401` unauthenticated · `403 ineligible|forbidden` · `404` · `409 already_issued|closed|token_spent|illegal_transition` · `429 rate_limited` (availability only; never changes who wins) · `503` redis down / draining.

#### Attack-engine control API (via nginx `/attack/…`, X-Test-Key)
`POST /run {experiment, scale, also_fcfs}` (experiment = `exp1`..`exp7` or `show`, the live-show crowd with every bot type) · `GET /runs`, `GET /runs/{id}` · `POST /selftest` (18 known-good / known-bad requests against a fresh drop; returns `{cases:[{name,tried,expected,actual,pass}], passed, total}`).
`POST /redteam` (14 attacker tricks against the live system; returns `{probes:[{id,title,goal,move,expected,result,verdict:held|BROKEN|demo-only|info}], held, broken}`), `GET /redteam/last`, `GET /redteam/before` (the first run, before the fixes, from `reports/redteam/before_fix.json`).

#### Limits added by the red team
`/auth/otp`: max 3 codes per phone per 10 min (`429 otp_rate_limited`); the phone is reduced to digits first (one SIM = one identity). `/auth/verify`: 5 wrong guesses destroy the code (`429 too_many_attempts`). `/admin/login`: 5 wrong passwords per address lock it for 5 min (`429 locked`). Request bodies: 64 KB (gateway and server), except `/api/test/*` bulk uploads. A retry key (`Idempotency-Key`) is scoped to its own ticket.

---

## 4.13 Dependencies


| area | library | why | alternative rejected |
|---|---|---|---|
| Go | `go-chi/chi` v5 | tiny router, std `net/http` handlers | gin/fiber: bigger, non-std context |
| Go | `redis/go-redis` v9 | Lua `EvalSha`, Streams, consumer groups | redigo: no pipelining ergonomics |
| Go | `golang-jwt/jwt` v5 | HS256 sessions | hand-rolled JWT: security risk |
| Go | `jackc/pgx` v5 | pool + batch inserts for the ledger | `database/sql`+lib/pq: slower, unmaintained |
| Go | `cloudflare/circl` (blindsign/blindrsa) | RFC 9474 implementation, needs Go ≥ 1.25 | writing RSA blinding ourselves |
| Go | `prometheus/client_golang` | `/metrics` | custom exposition |
| Infra | Redis 7, Postgres 16, Nginx, Prometheus, Grafana | state, record, gateway/failover, metrics, dashboards | |
| Attack | `locust`, `gevent` | the required load engine; FastHttpUser scales to 2,000 users/process | k6 (not Python, harder to model actors) |
| Attack | `requests`, `numpy`, `matplotlib` | control calls, scoring math, report charts | pandas (unneeded) |
| Web | Next.js 16 (App Router), React 19, Tailwind 4 | fan + admin UI | CRA/Vite: no routing/SSR bundle story |
| Web | `@cloudflare/blindrsa-ts` | browser side of RFC 9474, interoperates with circl (tested against the live stack) | |
| Web | `@noble/hashes` | SHA-256 without `crypto.subtle` (unavailable on plain http) | `crypto.subtle` |
| Web | `recharts`, `qrcode`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` | charts, ticket QR, UI primitives | full shadcn CLI (hand-written primitives are ~100 lines) |
| Test | Go `testing`, `pytest`, `vitest` | per-language unit/e2e | |

Versions are pinned by `backend/go.sum`, `frontend/package-lock.json`, and `attack_engine/requirements.txt`.

---

## 4.14 README and headline results


Sell **500 seats to 50,000 people** where speed, request volume and IP rotation give **no advantage**: one verified identity gets one entry, the entry list is publicly locked (Merkle root) *before* the seed is revealed, and anyone can recompute the draw.

> We do **not** claim bots are impossible. We claim a bot gets nothing from speed, volume or IPs, and that every extra seat costs it a real verified identity. The experiments below measure exactly that.

#### Run it
```bash
scripts/start.sh            # or scripts\start.ps1  (docker compose up -d --build)
scripts/seed.sh             # 50,000 synthetic verified users (TEST_MODE, no phones/SMS)
```
| what | where |
|---|---|
| fan site + admin | http://localhost:8088 · admin `/admin` (`admin` / `admin-demo-pass`) |
| API | http://localhost:8088/api |
| Grafana (dashboard "Fair Drop") | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| attack engine control API | http://localhost:9200 |

Services: 3 Go API replicas, a worker, Redis, Postgres, Nginx, Prometheus, Grafana, Next.js frontend, Locust attack engine. Test key `test-key-demo` (TEST_MODE only).

Experiments:
```bash
scripts/run_experiment.sh exp2 --scale 0.1 --also-fcfs     # one experiment (exp1..exp7)
scripts/run_all_experiments.sh --scale 1.0 --also-fcfs      # all seven, 50,000 identities
scripts/kill_replica.sh 2      scripts/run_malicious_demo.sh      scripts/reset.sh
```
Windows equivalents: `scripts\*.ps1`. Tests: what each one means in plain English is in [docs/TESTS_EXPLAINED.md](docs/TESTS_EXPLAINED.md); commands in [docs/TESTING.md](docs/TESTING.md).

#### Where to look (no jargon)
- **`/story`**: a scroll-driven 3D explanation (people, bots, the old way, the sealed list, the draw).
- **Admin → Control Room** (default tab): start a bot attack with one button; watch each decision as a dot (green accepted, red rejected, purple decoy trap; circle = person, diamond = bot); live users, requests/s, accepted/s, rejected/s; people vs bots let in; a **protection scorecard** (correctly blocked / false negatives / false positives / correctly allowed, with every rejection reason re-checked by an independent oracle); **BEFORE (first-come-first-served) vs AFTER (Fair Drop)** bars; and a **protection self-test** of 18 known-good/known-bad requests.
- Admin → Summary: the same facts in plain sentences.

#### Results (full scale, one laptop, rate limits on, live FCFS replay of the same actors)
Raw data: `reports/<experiment>/{results.json,results.csv,summary.md,charts/}`.

| experiment | FCFS | naive lottery | **Fair Drop** |
|---|---|---|---|
| **2 Proxy flood**: 20 operators × 10 identities, rotating IPs (bots = 0.4% of identities) | bots hold **20%** of seats, advantage **50×**; human win rate 0.8% | 14.1% of seats, **35×** | **0.4%** of seats, advantage **0.95×**; human win rate 1.0% |
| **4 One human vs ~50,000 bot requests** (10 seats, 21 identities) | human wins **0%** | 0% | human wins **46.5%** in expectation (ideal 47.6%) |
| **5 Tarpit**: API scrapers + UI mimics (10.6% of identities) | advantage 1.9× | 0.70× | **0.52×** |
| **1 Normal traffic**: 50,000 humans | 1.0% win | 1.0% | 1.0%, 0 errors, p99 register 44 ms |

**3 Sybil scaling** (what buying identities does): Fair Drop seats and cost per seat for a bot operator

| identities bought | FCFS seats / cost per seat | Fair Drop seats (expected) / cost per seat |
|---|---|---|
| 100 | 100 / $3 | **1.0 / $293** |
| 1,000 | 100 / $30 | 8.8 / $341 |
| 10,000 | 100 / $300 | **55.5 / $541** |

*Honest reading:* Fair Drop cannot stop a buyer who owns 10,000 verified identities from winning ≈11% of all seats. It makes each seat cost ~$300-$540 of identities (at an assumed $3/identity, configurable) instead of ~$3, and removes every speed/volume/IP lever. Identity cost is the control, not cryptography.

**6 Kill a replica mid-window** (20,000 humans, `api-2` exit 137): 20,000 client-acked receipts, **0 missing from the Merkle tree**, 0 client 5xx/connection errors, replica back healthy, all six integrity counters 0, audit chain valid, Python verifier passes.
**7 Malicious server drops one entry**: victim's proof returns 404 → verify page shows **red** "your receipt is NOT in the locked list"; independent audit log shows `missing_receipts = 1`; the reference verifier flags it; a control receipt still verifies.

#### How it works (one paragraph)
Verified fans get **one blind-signed token per drop** (RFC 9474) and later register with it **with no session**, so the server can't link entry to person. Registration is atomic in Redis (spent set); at close the entry list is Merkle-locked and the root published; then the committed seed (and an optional drand beacon chosen after lock) is revealed and `score = H(final ‖ receipt)`; lowest scores win seats, the rest form the waitlist; unclaimed seats cascade down it. Every event goes into a hash-chained audit log. See [docs/CRYPTOGRAPHY.md](docs/CRYPTOGRAPHY.md).

#### Docs
[SYSTEM_ANALYSIS](docs/SYSTEM_ANALYSIS.md) (incl. PRD deviations) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [ARCHITECTURE_DECISIONS](docs/ARCHITECTURE_DECISIONS.md) · [RESEARCH](docs/RESEARCH.md) · [API_CONTRACT](docs/API_CONTRACT.md) · [CRYPTOGRAPHY](docs/CRYPTOGRAPHY.md) · [ATTACK_ENGINE](docs/ATTACK_ENGINE.md) · [FAIRNESS_METRICS](docs/FAIRNESS_METRICS.md) · [TESTS_EXPLAINED](docs/TESTS_EXPLAINED.md) · [RED_TEAM](docs/RED_TEAM.md) · [TESTING](docs/TESTING.md) · [DEMO_RUNBOOK](docs/DEMO_RUNBOOK.md) · [DEPENDENCIES](docs/DEPENDENCIES.md)

#### Layout
`backend/` Go API + worker · `frontend/` Next.js fan + admin UI · `attack_engine/` Locust profiles, scenarios, reporting · `scoring/` fairness maths · `verifier/` stdlib Python verifier · `infra/` nginx, Prometheus, Grafana · `scripts/` · `tests/` e2e · `reports/` experiment output · `docs/`.

---

# Part 5: Honest limits
- **Identity farm**: an owner of many genuinely verified accounts gets one entry per account. Nothing in the entry flow can tell them from many people; cost per account is the only defence.
- **Oracle**: the independent judge checks consistency with ground truth in the simulation, not real-world intent.
- **50,000 test**: measured on one laptop (peak about 1,300 requests in flight, about 2,000 clicks per second). It is not proof of 50,000 simultaneous connections.
- **Demo secrets**: published demo passwords and keys are for the demo only; the server refuses to start outside test mode with them.
- **Docker Desktop**: with 1,500 hung connections held from the host, its port forwarder stalls; inside the Docker network the gateway copes. This is a laptop artefact.
- **Phone formats**: national and international spellings of the same number can still differ without a phone library and default country.
- **After redeploying web servers**, reload the gateway or one server takes all the load.
