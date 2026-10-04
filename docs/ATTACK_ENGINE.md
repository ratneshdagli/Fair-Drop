# Attack engine

`attack_engine/`: Locust + a scenario runner. Everything is driven by a seeded plan (each scenario has a fixed seed), so who acts when, from which IP and with which tier is identical across runs; `/test/reset` only rotates the drop's own seed and keys.

## Model
- **Identity pool**: 50,000 synthetic verified users `t_000001…` (`POST /test/seed`).
- **Operators**: a bot operator owns N identities and an IP pool, runs one profile. Humans are operator `humans`, one identity and one IP each.
- **Plan** (`build_plan`): a time-ordered list of actors `{uid, kind, op, profile, offset, tier, ip}`. Bots attack at open; humans arrive in a "rush" (60% right after open, the rest spread).
- **Actor queue**: each Locust user pulls the next actor whose offset is due; worker processes take disjoint slices. Done markers and per-worker metrics/tokens JSON are merged by the runner.

## Profiles
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
| CRYPTO_SWARM | does the real RFC 9474 blinding itself (`blindrsa.py`) and uses `POST /token` + `/register`, no `test-token` shortcut |
| SMART_SCRAPER | reads the site's HTML/JS, discards shortcut-looking routes (so it never touches the decoy), runs the canonical flow fast from many addresses |
| STATE_SNIPER | syncs to the server clock (`Date` header) and bursts requests within +-200 ms of the sale opening and closing (needs the runner's boundary hook) |
| CLAIM_SNIPER | enters normally; the runner hammers `/claim` for its receipts during the claim phase (a custom test with it gets a 10 s claim phase) |

Every profile has a Fair Drop flow and an FCFS flow so the same actors can attack both.

## Experiments (`python -m attack_engine run expN [--scale S] [--also-fcfs]`)
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

## Added after the outside review (what each proves and where it stops: `docs/RED_TEAM.md`, "Round 3")
Choose them in Bot Lab / the Arena (custom test). They are not in the `show` crowd or in exp1..exp7.

- **Real blind signatures from the load generator.** `blindrsa.py` is pure Python (RSABSSA-SHA384-PSS-Deterministic, the same variant as the Go server and the website). `python -m pytest attack_engine/test_blindrsa.py` cross-checks it with OpenSSL (needs the `cryptography` package, test only) and a Python-made token is verified by the Go server verifier (`backend/internal/fdcrypto/python_vector_test.go`, fixture `docs/blindrsa-python-vector.json`; regenerate with `WRITE_VECTOR=docs/blindrsa-python-vector.json python -m pytest attack_engine/test_blindrsa.py`). Bots using it call one extra TEST_MODE endpoint, `POST /drops/{id}/test-link`, so the scorer can still credit their receipts.
- **Boundary hook (STATE_SNIPER).** If a custom test contains STATE_SNIPER, the runner leaves the sale not yet open, estimates the server clock from the `Date` header, opens the sale at "time zero minus 0.5 s" and closes it at "last honest arrival plus 8 s" (both on a timer thread, admin login done in advance), and passes both instants to the bots in server-clock seconds (`plan.boundary`). The result has `extras.boundary` with `boundary_violations` (must be 0), `all_checks_ran`, the parts, and the sniper `shots`. The FCFS replay of the same crowd is unaffected.
- **Claim phase (CLAIM_SNIPER).** A custom test with CLAIM_SNIPER sets `claims=True, claim_sec=10`. During the claim phase one runner thread pool sends `/claim` for every sniper receipt every ~50 ms. The result has `extras.claim_sniper` with `double_allocated_seats` (must be 0), `seats_claimed_without_entitlement` (must be 0) and the answers it received.
- **Clock estimate** (`timesync.py`): poll a cheap URL until the `Date` header's second ticks; the boundary is bracketed between two polls. Accuracy is about one poll interval plus a round trip.
- Tests: `python -m pytest attack_engine` (needs `gevent`, which the load generator needs anyway).

## Output
`reports/<experiment>/{results.json, results.csv, summary.md, charts/}`; live FCFS replays go to `.../live_fcfs/`. Results are also pushed to `/test/experiments` so the admin Fairness tab shows real recorded data.

## Protection self-test (`python -m attack_engine selftest`, or Admin → Control Room → "Quick safety check")
Creates a fresh mini-sale and sends 18 cases whose expected answer is fixed in advance: honest entry, idempotent retry, token reuse, forged signature, tampered token, second token request, unauthenticated request, late signup (ineligible), decoy endpoint, a 150-request flood from one IP (some 429) while a normal person on another IP still gets in, entering after close, token after close, and after locking: the sealed list holds exactly the legitimate entries (forged/decoy/late excluded) and the integrity counters are zero. Last run: **18 / 18 passed**.
