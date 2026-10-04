# Red team: playing the bot owner

Goal: find ways for a bot owner to win more than "one entry per verified person", then fix them. Run it: `python -m attack_engine redteam`, or Admin → Control Room → **Try to break it**. 17 tricks (two rounds), each with the attacker's aim, the move, and a verdict (`held` / `BROKEN`).

## What the first run found (before any fix): 6 real holes
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

## Round 2: one more hole, two more checks
Saved as `reports/redteam/round2_before_fix.json` (before) and `after_fix_in_network.json` (after, run from inside the Docker network: 17 tricks, 15 held, 0 broken, the rest informational / demo-only).

| Trick | What worked | Fix |
|---|---|---|
| **Flood from the same address as real people** | 24 flooders on one address used up the address's quota, so a real person on the same office/campus/mobile address was told "too many requests" | Only *useless* requests (forged or reused tickets, repeated ticket asks) count against an address; a valid first-time request is never throttled by neighbours' noise (Go test `TestFlooderCannotLockOutNeighboursOnTheSameAddress`) |
| Hammer the big public download | Held: the finished list never changes, so it is cached | none needed |
| Hold 1,500 connections open (Slowloris) | Held from inside the network: silent connections are dropped after 10 s. From the host laptop Docker Desktop's port forwarder stalls under 1,500 hung connections; that is a laptop artefact, not the product | none needed |

## Round 3: four blind spots an outside reviewer named
The reviewer said the seven bots are structurally fine but miss four things. Each was checked against the actual code first. All four became bots (choose them in Bot Lab or the Arena); none is written to lose. None has been run against the live stack by the person who added them (see "Not measured yet" below).

| # | Proposal | Verdict after reading the code | Bot |
|---|---|---|---|
| 1 | Bots only get tickets through the server-side shortcut (`test-token`), so the real blind-signature path is never loaded by bots | **Sound.** The shortcut skips what a real client does. | `CRYPTO_SWARM` |
| 2 | A scraper that does not fall for the decoy | **Sound, with one finding:** the site's own code never mentions the decoy route (it only names `/token`, `/register`, `/claim`), so a scraper reading the site has nothing to discard. The decoy only ever catches a bot that guesses the route or reads our docs. | `SMART_SCRAPER` |
| 3 | A bot that fires in the last and first fraction of a second of the sale | **Sound, needed a runner hook.** An ordinary run opens the sale before any bot starts and closes it after the last bot finishes, so there was no boundary to aim at. | `STATE_SNIPER` |
| 4 | A bot that hammers `/claim` the instant a reservation runs out, to steal waiting-list seats | **Feasible, but the premise is wrong:** a seat is reserved for one specific receipt and `/claim` needs that receipt's token secret, so nobody can take someone else's seat. What can still be tested (and now is) is that rapid-fire claims never double-book a seat or hand one out without entitlement. | `CLAIM_SNIPER` |

### 1. CRYPTO_SWARM: the real ticket path, written independently
Python does the RFC 9474 maths itself (`attack_engine/blindrsa.py`, pure big-integer maths plus SHA-384, no dependency): read the drop page for the public key, make a random token, blind it, `POST /token`, unblind, `POST /register`. It is the same variant the server and the website use (RSABSSA-SHA384-PSS-Deterministic, 2048-bit, salt 48).
- **Proof it is the same scheme:** a ticket made by the Python code verifies under OpenSSL's standard RSA-PSS check; an OpenSSL-made signature passes the Python verifier; tampered messages, tampered signatures and a different key are refused; and `docs/blindrsa-python-vector.json` (one Python-made token, public data only) is checked by the real Go server verifier in `backend/internal/fdcrypto/python_vector_test.go`.
- **What it adds to a run:** `POST /drops/{id}/token` traffic from bots (read its p50/p95/p99 and error rate in the run's latency table, next to the humans' numbers from the same run), plus the events `crypto_finalize_ok`, `crypto_finalize_failed` (must be 0) and `crypto_local_us` (the bot's own CPU time spent on the maths).
- **Honest limits:**
  - It loads the server's *signing* step, which the shortcut also did. From reading the code, the shortcut did **more** server work per ticket (it blinds, signs and unblinds on the server), so earlier load numbers were not flattering on this point. That comes from the code, not from a measurement.
  - The CPU cost of blinding falls on the bot, not on honest users.
  - Honest users in the test crowd still use the shortcut. To see the effect on them, run the same crowd with and without this bot and compare the humans' latency.
  - Because the real path hides which account owns which receipt, the scorer needs a note: the bot makes one extra TEST_MODE call (`POST /drops/{id}/test-link`) naming its receipt. Without it the scorer could not credit this bot's wins to it (it would look as if bots lose). Allocation never reads it, and it does not exist outside TEST_MODE.

### 2. SMART_SCRAPER: fairness without the decoy
It fetches the site's HTML and scripts once per load process, pulls out the `/drops/{id}/<step>` routes, throws away any step whose name looks like a shortcut (`fast`, `quick`, `express`, `instant`, `turbo`, `bypass`, `skip`, `vip`), and runs the canonical steps fast from many addresses with repeats. If the site shows nothing usable it falls back to the documented routes (and says so in the event `smart_route_fallback`). Tickets still come from the harness shortcut, like every other bot, so this isolates one question.
- **Expected outcome, stated plainly:** it is **not** caught by the decoy, and each account still gets exactly one entry (one ticket per verified person, whatever the speed or the number of addresses). So the identity rule, not the decoy, is what limits it.
- **How to check after a run:** the bot's "decoy" count in the per-bot table is 0, its "entered" equals its accounts, and no account has more than one entry.
- **What it does not claim:** nothing about bots that own many real accounts (that is the identity farm, unchanged). The decoy stays useful only against bots that bite.

### 3. STATE_SNIPER: the edges of the sale
Run through the runner (a Bot Lab or Arena test that includes it), the sale starts *not yet open*. The runner opens it at an announced instant and closes it at another, and tells the snipers both in **server-clock seconds**. Each sniper converts them to its own clock from the server's `Date` header (it polls until the header's second ticks over, which is accurate to a few tens of milliseconds locally) and fires 8 concurrent requests spread over plus or minus 200 ms. Half the snipers go for the opening (ticket requests). Half go for the closing (they hold a ticket, then burst entries and extra ticket requests).
- **Score (`extras.boundary`, headline `boundary_violations`, must be 0):** entries accepted outside the sale's own recorded open/close instants, plus entries logged after the CLOSED event in the tamper-evident audit order, plus receipts a client was given that are missing from the sealed list, plus the difference between entries the server accepted and entries in the sealed list, plus the integrity counter `missing_receipts`. If a part could not be read (for example an old server image without the new `opened_at_ms` / `closed_at_ms` fields) it is shown as not checked and `all_checks_ran` is false. That is never reported as a pass.
- **Evidence the test really touched the edges:** `shots` (how many requests left inside the band and how each ended: 200, 409 not open yet, 410 closed) and `open_flip_vs_announced_ms` / `close_flip_vs_announced_ms` (how far the real flip was from the announced instant).
- **Honest limits:**
  - The schedule is announced to the bots rather than discovered.
  - Shots are counted on the bot's own clock.
  - In a boundary run the sale closes at a fixed time (the last honest arrival plus 8 s), like a real sale, so an honest actor still retrying at that moment is told "closed", which an ordinary run never does.
  - Snipers hold their load-generator slots for the whole window.
  - The check covers tickets and entries, not claims.

### 4. CLAIM_SNIPER: hammering `/claim`
It enters like a competent bot. A custom test that includes it automatically gets a claim phase with short reservations (10 s). The runner (which already orchestrates claims) then hammers `/claim` for every sniper receipt, in rounds about 50 ms apart, for the whole claim phase, so it takes any seat promoted to it within roughly that time. Other receipts are claimed by the normal flow (humans forfeit some seats on purpose, which makes seats cascade down the waiting list).
- **Score (`extras.claim_sniper`, headline `double_allocated_seats`, must be 0):** seats two receipts were both told 200 for, plus the server's `duplicate_seats`, plus `oversold`. Also `seats_claimed_without_entitlement` (every seat a sniper holds must be one its own draw place, or a promotion to it, entitles it to; must be 0) and the answers it got (hammering a receipt that holds no reservation is refused with `not_winner`, which is the expected answer).
- **Expected outcome:** the sniper gets no more than its draw place gives it. Being fast only means it takes its own promoted seat sooner, never anyone else's.
- **Honest limits:**
  - Claim requests are not part of the decision feed, so the protection checker neither counts nor grades them (on purpose, noted in `feed.go`). Claim safety is judged by the integrity counters and the checks above.
  - The hammer works in 50 ms rounds, not at an exact millisecond. A same-millisecond race cannot be forced from outside, but the claim and the expiry are single atomic steps on one clock, which is what the double-booking check exercises.

### Not measured yet
These four bots, the boundary hook and the claim hammer are unit-tested offline (Python: the real maths cross-checked with OpenSSL, the boundary score on clean and on faulty data, and the claim phase against a small fake of the claim rules). They have **not** been run against the live stack by their author. The Go side (the `test-link` note, the open/close instants on the sale page, the vector test) was written without a Go compiler available, so run `go build ./... && go test ./...` and rebuild the API image before the first live run.

## What already held
Ticket from another sale (400) · a login card with no signature (401) · reading the secret seed early (only its fingerprint is public) · reading tier crowding to pick the emptiest tier (hidden until the list is sealed) · a second ticket in another tier (409) · lying about the address in headers (the gateway overwrites it; 48 of 80 throttled).

## Not holes, but you should know
- **Identity farm**: a bot owner who owns many *genuinely verified* accounts gets one entry per account. Nothing in the entry flow can tell them apart from many people. Defence = the cost per verified account (see experiment 3 and the cost-per-seat figures).
- **Tier switch**: a blind signature can't carry the tier, so a ticket asked for in Gold can be entered as General. Harmless because crowding is hidden during the sale.
- **Demo secret**: the demo runs with published passwords, so a token signed with the demo JWT secret is accepted *here*. The server now refuses to start outside `TEST_MODE` with the demo admin password, JWT secret or test key.
- **Phone formats**: "5551234567" vs "15551234567" (national vs international) still differ; closing that needs a phone library with a default country.
- **Admin lockout is per address**: a distributed guesser gets 5 tries per address. Use a strong `ADMIN_PASSWORD`.
- Dev ports for Redis, Postgres and the three web servers are bound to 127.0.0.1 only.
- After rebuilding web servers, reload the gateway (`docker exec fd-nginx nginx -s reload`; `scripts/start.*` does it). The gateway resolves the servers once at start-up; without a reload one server takes all the load. This showed up for real during testing: one server handled 50,499 requests while the other two handled about 80 each.
