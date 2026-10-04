# Demo runbook (4 minutes)

Prereq: `scripts/start.sh` (or `.ps1`), `scripts/seed.sh` once. Open `http://localhost:8088`, admin at `/admin` (`admin` / `admin-demo-pass`), Grafana `http://localhost:3001` (anonymous viewer). Test key: `test-key-demo`.

**Quick path (the best 4 minutes): the Live Arena.** Open `/admin` (first tab, **Live Arena**) and press **Open the live screen in a new tab** (or go to `http://localhost:8088/live`), then put that tab on a second monitor. The admin signs in once; both tabs share the session.
1. **Control panel**: pick a preset or set exactly how many real people and how many bot accounts of each kind, choose how fast the crowd arrives (*Watchable, 2 min* is best for a demo), then **Start**. **Stop** halts it; **Restart: clear everything** gives a clean slate.
2. **Who is in this test?** Real people vs bot accounts, counted per kind, always adding up.
3. **Which method is fair?** The same crowd and the same 500 seats handed out three ways: first come first served (live), a simple lottery where every request is a ticket (calculated exactly once the sale is drawn), and Fair Drop (live, then the real draw). Orange squares are seats that went to bots.
4. **Do the numbers add up?** The screen checks itself live (accounts add up, seats never exceed 500, every decision graded). Any mismatch turns red.
5. **The bots, live**: hover a bot card to watch what that kind of bot is doing right now; click an account in the console to follow just that one.
6. **The real web traffic**: the servers' own record of every HTTP request (method, path, status, milliseconds, which of the 3 servers, account, address, bot kind). Filter by bot kind or *Only refused / errors*. This is the proof the bots are really sending traffic. *Check it yourself* shows a terminal command that reads the same records, and the Grafana / raw-counter links show the same traffic as charts.
7. **The gate**: every dot is a real decision (blue person, orange bot; green in, red turned away, purple decoy trap).
8. **How the research scores this**: false-positive rate against the strict 0.1% target, precision / recall / F1 (and why plain accuracy misleads), and whether each bot kind arrives differently from the real people (burstiness and distance from people). PR-AUC, mouse tracking and fingerprinting are listed as not applicable, with the reason.
9. *Admin → Proof & checks* has the detailed judge results and tamper checks; *More tools* still has the old Control Room, Bot Lab and the step-by-step sale controls.
Also `/story` has a 3D scroll explanation.

**0:00 FCFS under attack.** Admin → Test tools → *Run an experiment*: `exp2`, scale 0.1, tick *also run live FCFS*. Open `reports/exp2_proxy_flood/summary.md`: in the live FCFS row bots (4% of identities) took ~20% of seats (advantage ≈ 5×). Show `live_fcfs` sold-out within seconds.

**1:00 Same traffic, Fair Drop.** Same table: Fair Drop row ≈ 1× (bots hold their identity share), human win rate comparable or better than FCFS and naive lottery. *Counterfactual* = same recorded attempts, three policies. Show the Fairness tab (Detailed results) chart.

**2:00 Cryptographic proof.** Open an event page → *Enter* → status page shows receipt + Merkle proof; `/verify` goes green after lock; run the reference verifier: `python verifier/verify.py --url http://localhost:8088/api --drop <id> --receipt <receipt>`. Show Admin → Audit → **Verify chain** (green), then *edit a stored event* → red at the exact event, *repair*.

**3:00 Kill a replica.** Run exp6 or `scripts/kill_replica.sh 2` while Live monitor is open: replica goes DOWN, traffic continues via failover, comes back, integrity panel stays all zero.

**3:30 Malicious server.** Test tools → Malicious demo (or `scripts/run_malicious_demo.sh`): server drops one entry at lock. Open that fan's verify page: **red banner**, proof fails; Admin → Audit shows `missing_receipts > 0`.

Reset between runs: Test tools → *Reset selected drop* (keeps users) or `scripts/reset.sh` (wipes everything).
