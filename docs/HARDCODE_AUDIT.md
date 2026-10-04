# Hardcode audit: control room, fan pages, seat map

Scope: `frontend/components/admin/*`, `frontend/components/fan/*`, `frontend/components/SeatMap.tsx`, `frontend/app/**/page.tsx`.
Verdicts: OK = live API field or derived; CONFIG = a real constant, labelled; FIXED = was typed in or misleading, now live or removed.

Verified against the raw API (`/admin/drops/{id}/pulse|protection|integrity|live`, `/admin/config`) on a fresh custom run: Server, Proof (Right or wrong), Summary and Run-a-sale screens matched the API field for field (500 left, 2,547 tickets, 2,509 entries, 4 of 4 servers, 1/2/11 ms waits, 13,227 correct refusals, 5,056 correct let-ins, 2,437/2,399 people, 110 bots, 20 s claim window, blind token mode).

| Value | Where | Source | Verdict | Fixed? |
|---|---|---|---|---|
| Seats left / sold / total, tier table (Gold 100, Silver 150, General 250) | ServerHealth | `pulse.tickets` (tiers come from the DB) | OK | - |
| "given out so far" for a fair sale still open | ServerHealth | `pulse.tickets.sold` is 0 until the draw | OK, label was misleading | Label now says the draw comes after close |
| "about 1 in N will win" | ServerHealth | entries / seats, derived | OK, but printed "1 in 1" when entries < seats | Now says everyone in wins |
| "Busiest moment while you watched: N at once" | ServerHealth | Client-side max of the 1.5 s `pulse.queue.in_flight` samples. No server peak exists | Real but over-claimed | Relabelled "highest reading since you opened this page (sampled, restarts on reload)" |
| Being handled now / waiting to be saved | ServerHealth | `pulse.queue.in_flight` (sum of server heartbeats), `db_writes_waiting` (= `ledger:lag`) | OK | - |
| Typical / slow / slowest wait | ServerHealth | `pulse.server.typical_ms/slow_ms/slowest_ms` (median of per-server medians, max of per-server p95/p99) | OK; showed "0 ms" before any traffic | Shows "-" until measured; sub-labels say how it is derived |
| "3 web servers + 1 worker", "Three web servers share the crowd" | ServerHealth, LiveTab | Typed | FIXED | Counted from `server.replicas` |
| "3 servers" in backend-does captions | botinfo, fan kit, enter page | Deployment description | FIXED | "the web servers" |
| Postgres "events in log", "entries saved", Redis "items stored" | ServerHealth | `pulse.database`; these are whole-database counts, not this sale | OK, but read as per-sale | Labelled "(all sales)" |
| Pulse API fails | ServerHealth | Spinner forever | Silent | Shows "not available" and marks stale |
| Sale switch showed previous sale's numbers (status band said "Seats sold 2,670" over a 0-sold old-way table) | StatusBand, ServerHealth, Overview, Proof, Audit, ControlRoom, Guide | `usePoll` keeps old data after the sale id changes | FIXED | New `useDropPoll` drops other-sale data at once; rps in the band too |
| "Up to 4 seats per login" (10+ places) | kit TicketRule, Compare, HowItWorks, ControlRoom, Tests/Glossary, guide | `GET /admin/config` `max_per_account` (env `MAX_PER_ACCOUNT`) | FIXED | Read live once and cached; "several seats" until known (static copy) |
| Requests per second | StatusBand, ControlRoom vs LiveTab, Overview | Two different things shared one name: door decisions for one sale (feed, last 3 s) vs all HTTP traffic on all servers, all sales (includes this screen's polling) | Numbers disagreed | Renamed "Decisions per second" and "Web requests per second", with captions |
| "Servers healthy 3 / 4" etc. | LiveTab, Overview | `live.replicas` | OK | - |
| Slowest 1% wait | Overview, LiveTab | `live.p99_ms` (includes worker); Server tab uses API servers only | OK, can differ slightly | Shows "-" when 0 |
| "Where the sale is now ... reached its last stage" | Overview | Said so while the sale list was still loading | Wrong | Shows "Reading the sale…" |
| Ticket reused counter (e.g. 11,392) vs Proof "ticket already used" (9,002) | LiveTab vs RightOrWrong | Server counter `rejected_reused` includes attempts the judge files as rate-limited (9,002 + 2,390 = 11,392) | Disagree by design | Sub-label says the server's own count; Proof may list fewer. Backend semantics not changed |
| Blocked attempts 13,227 | Overview | `rejected_reused + rejected_bad_sig + rejected_already_issued` | OK | - |
| "Correct counts are about double the number of people" | RightOrWrong note | Only true of the let-in count | Wrong | Reworded |
| "as expected" badge on each bot card | BotsTable | Was always true except for the shortcut seeker | Fabricated verdict | Now checked: entries <= accounts (shortcut seeker: 0 entries) and zero judge mistakes |
| "told sold out within seconds" | ControlRoom old-way banner | Narrative, not measured | Over-claimed | Removed |
| "average over 200 re-draws" | FairnessTab | Constant in `scoring/metrics.py`, not in the result data | Typed | "many random re-draws" |
| Experiment results, cost per seat, `$identity_cost_usd`, latency table | FairnessTab | Experiment JSON | OK | - |
| Compare / Latest bot test | Proof, Summary | Newest recorded experiment, titled as such (not the picked sale) | OK | - |
| Guide "How it works" showed the newest fair sale while header said old way | Sections (Guide) | Deliberate, silent | Sale mix-up | Now says which sale it is showing |
| Crowd sizes 2,500 / 5,000 / 15,000 / 50,000, "1.0 = 50,000", Bot Lab max 50,000 | AttackPanel, Overview, BotLab, TestLab | size x `POPULATION` = 50,000 (`attack_engine/config.py`) | CONFIG | One `POPULATION` constant in admin kit |
| "about 1 min", "about 3 min", "About 10 seconds", "About 15 seconds" | Overview, AttackPanel | Typed | FIXED | Removed |
| "18 checks", "14 tricks", "6 holes found" | AttackPanel, TestsExplained | Typed | FIXED | Removed from static text; live pass/total from results and `redteam/before` (the "6 holes" badge is live data) |
| "30 people and 7 seats", "Dozens of checks", "2,500 to 50,000" | TestsExplained | Typed description of scripts | FIXED | Vaguer wording |
| Bot Lab preset "about 5%" / "20% bots" | BotLab | Typed | FIXED | Share computed from the preset numbers |
| Rate-limit inputs 30 / 30 | TestLabTab | Server default | FIXED | Loaded from `/admin/config` (`guard`), blank if unavailable |
| Experiment list "20 operators x 10 accounts" etc. | TestLabTab | Matches `scenarios.py` at size 1.0 only | Partly stale at small sizes | Note added that it describes the full size |
| Event form defaults (Aurora Live, 250/150/80, 100/150/250), sale defaults (600 s, claim 60) | DropsTab, TestLab demo button | Editable form defaults | CONFIG (example) | Note: "prefilled with example values" |
| Sale schedule, claim window, token mode, fingerprints | DropsTab | `/admin/drops` | OK | - |
| Safety counts, hash chain, ledger info | AuditTab | `/integrity`, `/audit` | OK | - |
| Real people / bots | Overview, LiveTab | `live.labels` (test labels only) | OK, shows "unknown" without labels | - |
| Fan pages: seats, tiers, entries, seat offsets, prices, claim seconds, waitlist position, seat map | events, status, claim, baseline, ticket, SeatMap | Public API | OK | - |
| "Codes last five minutes", "7 to 15 digits", 3 codes / 10 min | fan kit error text | Matches `auth.go` constants | CONFIG | Phone button now needs 7 digits like the server |
| Claim page card `4242...` | claim | Mock payment form, labelled mock | CONFIG (example) | - |
| "500 seats, 50,000 fans, Eleven kinds, 4 minutes, three servers" | guide page | Presenter script, static | CONFIG (script) | "up to 4 seats" changed to "several seats" |
| Warn thresholds (in flight > 500, waits 250/1000 ms, p99 > 500 ms) | ServerHealth, Overview | UI judgement colours | CONFIG | Unlabelled; left as is |

Known limits left alone: the decision feed rate reads at most the newest 12,000 feed entries, so "Decisions per second" under extreme load under-reports; backend, `components/live`, `components/home`, `components/arch` and `lib` were not touched.
