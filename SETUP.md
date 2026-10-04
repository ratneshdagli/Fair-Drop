# Fair Drop: setup guide (10 minutes)

Everything runs in Docker. You do not need Go, Node or Python installed.

## What you need
- **Docker Desktop** (Windows, Mac) or Docker Engine with Compose v2 (Linux). Give Docker at least **6 GB of memory** (Windows: Docker Desktop uses WSL2; raise it in `%UserProfile%\.wslconfig` with `memory=8GB` if tests feel slow).
- **Git**.
- Free ports: **8088** (the website), 3001 (Grafana), 9090 (Prometheus), 9200 (attack engine), 8081-8083 (the three API servers), 5432, 6379.

## Set it up
```bash
git clone https://github.com/ratneshdagli/Fair-Drop.git
cd Fair-Drop

docker compose up -d --build        # first build takes about 5-10 minutes
docker exec fd-nginx nginx -s reload
```
(or run `scripts/start.sh` on Mac/Linux, `scripts\start.ps1` on Windows: they do both lines.)

Check it is up: open **http://localhost:8088**. If a page does not load yet, wait 20 seconds and refresh: the API servers need a moment to connect to the database.

## See it work
1. Open **http://localhost:8088/admin** and sign in: user `admin`, password `admin-demo-pass` (demo credentials, local only).
2. The first tab is **Live Arena**. Press **🖥 Open the live screen in a new tab** (or open `http://localhost:8088/live`). Put that tab on a second monitor.
3. In the control panel keep the default crowd (3,000 people plus 162 bot accounts of 11 kinds) and press **▶ Start**. It takes about 5 minutes: 2 minutes of fair sale, a short draw, then 2 minutes of the old first-come-first-served way.
4. Watch: who is in the crowd, the three methods side by side, the bots live (hover a card), the real web traffic log, and the "numbers add up" self-check.
5. **■ Stop** halts a test. **🔄 Restart: clear everything** gives a clean slate. The first test creates the 50,000 test accounts automatically (a few seconds).

More: `docs/FAIR_DROP_COMPLETE_GUIDE.md` (everything in one document), `docs/DEMO_RUNBOOK.md` (a 4-minute demo script), `docs/TESTING.md`.

## Everyday commands
| what | command |
|---|---|
| stop everything | `docker compose down` |
| start again (no rebuild) | `docker compose up -d` then `docker exec fd-nginx nginx -s reload` |
| wipe all data and start fresh | `docker compose down -v` then the setup commands again |
| see a server's log | `docker compose logs -f api1` (also `api2`, `api3`, `worker`, `attack`, `frontend`) |
| rebuild after changing code | `docker compose build <service>` then `docker compose up -d <service>` then the nginx reload |
| run on another port | `GATEWAY_PORT=9000 docker compose up -d` (PowerShell: `$env:GATEWAY_PORT=9000`) |

## If something goes wrong
- **Page loads but data is empty / "failed to fetch":** run `docker exec fd-nginx nginx -s reload`. The gateway must be reloaded after any server is rebuilt, otherwise one server takes all the traffic.
- **"port is already allocated":** something else uses that port. Stop it, or change `GATEWAY_PORT` as above.
- **Start does nothing / a test is stuck:** press **🔄 Restart: clear everything** on the Live Arena page.
- **The build is very slow or runs out of memory:** raise Docker's memory limit (see top) and run `docker compose build` again.

## Good to know
- The demo logins, the test key (`test-key-demo`) and `TEST_MODE=true` exist so the bot tests can run. **Never expose this stack to the internet as it is**: set your own `JWT_SECRET`, `ADMIN_PASSWORD`, `TEST_KEY` and `TEST_MODE=false` (environment variables in `docker-compose.yml`).
- One honest limit, stated on the screen too: someone who buys many real verified accounts still gets one entry per account. Fair Drop caps entries per person; it does not make buying identities impossible.
- Measured on one laptop. The 50,000-person run is slower on small machines, so start with the default crowd.

## Pushing your own changes
```bash
git checkout -b my-change
git add -A
git commit -m "describe the change"
git push -u origin my-change
```
Large generated test data (`reports/*/w*.json`, `plan.json`, `reports/_runs/`) is ignored by `.gitignore` on purpose.
