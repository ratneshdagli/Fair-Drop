"""Scenario runner: reset -> labels -> Locust traffic -> close/lock/draw -> verify -> counterfactuals -> score -> report."""
from __future__ import annotations
import hashlib
import json
import os
import random
import subprocess
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests

from . import config, labels as lab, reporting
from .auth import Api
from .config import Scenario
from .metrics import merge
from .scenarios import ALL_RUNNABLE, EXPERIMENTS, build_plan, labels_from_plan
from .timesync import estimate_offset, parse_http_date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scoring import metrics as sc          # noqa: E402
from verifier import verify as ref         # noqa: E402


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def ensure_drop(api: Api, scn: Scenario, drop_id: str, scheduled: bool = False):
    """scheduled=True leaves the sale NOT yet open (STATE_SNIPER runs: the runner opens it at an announced instant, see plan_boundary)."""
    r = api.s.get(api.base + f"/drops/{drop_id}", timeout=30)
    if r.status_code == 200:
        api.req("POST", "/test/reset", json={"drop_id": drop_id, "state": "SCHEDULED" if scheduled else "OPEN", "window_sec": 36000, "claim_sec": scn.claim_sec})
        return
    ev = api.a("POST", "/admin/events", json={"name": f"Fair Drop Experiment: {scn.name}", "venue": "Test Arena", "tiers": scn.tiers})
    when = {}
    if scheduled:                               # opens in an hour by its own timer; the runner will open it earlier by hand
        iso = lambda s: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(s))
        when = {"opens_at": iso(time.time() + 3600), "closes_at": iso(time.time() + 3600 + 36000)}
    api.a("POST", "/admin/drops", json={"id": drop_id, "event_id": ev["id"], "mode": "fcfs" if scn.policy == "fcfs" else "fairdrop",
                                        "window_sec": 36000, "claim_sec": scn.claim_sec, **when})
    if scheduled:
        return
    for _ in range(80):
        if api.req("GET", f"/drops/{drop_id}")["state"] == "OPEN":
            return
        time.sleep(0.25)
    raise RuntimeError("drop did not open (is the worker running?)")


def locust_run(scn: Scenario, plan: dict, out: str, api: Api, extra_thread=None, boundary: bool = False) -> dict:
    u = urlparse(config.BASE_URL)
    host, prefix = f"{u.scheme}://{u.netloc}", u.path.rstrip("/")
    users = max(10, min(scn.concurrency, len(plan["actors"])))
    procs = max(1, min(scn.processes, users))
    spawn = min(users, 400)
    t0 = time.time() + max(6.0, users / spawn + 4) + (8.0 if boundary else 0.0)      # snipers wake 4.5 s before time zero: leave them room
    bnd, flips, flippers = None, {}, []
    if boundary:
        bnd = plan["boundary"] = plan_boundary(t0, scn.window_sec)
        flippers = [threading.Thread(target=_flip_later, args=(plan["drop_id"], bnd["open_local_s"], "OPEN", flips), daemon=True),
                    threading.Thread(target=_flip_later, args=(plan["drop_id"], bnd["close_local_s"], "CLOSED", flips), daemon=True)]
        [t.start() for t in flippers]
        log(f"boundary run: sale opens in {bnd['open_local_s'] - time.time():.1f}s and closes at +{bnd['close_local_s'] - time.time():.0f}s (clock {'synced' if bnd['clock_synced'] else 'NOT synced'}, offset {bnd['runner_offset_s']:+.3f}s)")
    plan_path = os.path.join(out, "plan.json")
    json.dump(plan, open(plan_path, "w"))
    for f in os.listdir(out):
        if f.startswith("done.") or f.endswith(".metrics.json") or f.endswith(".tokens.json"):
            os.remove(os.path.join(out, f))
    env = {**os.environ, "FD_PLAN": plan_path, "FD_OUT": out, "FD_T0": str(t0), "FD_WORKERS": str(procs), "FD_PREFIX": prefix,
           "PYTHONPATH": os.path.dirname(os.path.dirname(os.path.abspath(__file__)))}
    cmd = [sys.executable, "-m", "locust", "-f", os.path.join(os.path.dirname(__file__), "locustfile.py"), "--headless", "--users", str(users),
           "--spawn-rate", str(spawn), "--host", host, "--processes", str(procs), "--only-summary", "--loglevel", "WARNING"]
    log(f"locust: {len(plan['actors'])} actors, {users} concurrent users, {procs} processes, window {scn.window_sec}s")
    proc = subprocess.Popen(cmd, env=env, stdout=open(os.path.join(out, "locust.log"), "w"), stderr=subprocess.STDOUT)
    if scn.kill_replica_at_s is not None:
        threading.Thread(target=_killer, args=(t0 + scn.kill_replica_at_s, out), daemon=True).start()
    deadline = t0 + scn.window_sec + 900
    last = 0
    while time.time() < deadline:
        done = sum(1 for i in range(procs) if os.path.exists(os.path.join(out, f"done.{i}")))
        if done == procs:
            break
        if proc.poll() is not None and done < procs:
            raise RuntimeError("locust exited early; see " + os.path.join(out, "locust.log"))
        if time.time() - last > 5 and time.time() > t0:
            last = time.time()
            try:
                s = api.a("GET", f"/admin/drops/{plan['drop_id']}/live")
                log(f"  t+{time.time() - t0:5.0f}s tokens={s['tokens_issued']} entries={s['entries_registered']} rate_limited={s['counters'].get('rate_limited', 0)} sold={s.get('baseline_seats_sold', 0)} p99={s['p99_ms']:.0f}ms")
            except Exception as e:
                log("  (live poll failed)", e)
        time.sleep(1)
    elapsed = time.time() - t0
    proc.terminate()
    try:
        proc.wait(15)
    except subprocess.TimeoutExpired:
        proc.kill()
    dumps = []
    for i in range(procs):
        dumps.append({"metrics": json.load(open(os.path.join(out, f"w{i}.metrics.json"))), "tokens": json.load(open(os.path.join(out, f"w{i}.tokens.json")))})
    endpoints, events, tokens = merge(dumps)
    for t in flippers:
        t.join(60)
    return {"endpoints": endpoints, "events": dict(events), "tokens": tokens, "duration_s": elapsed, "t0": t0, "boundary": bnd, "flips": flips}


KILLED = {}


def _killer(at: float, out: str):
    time.sleep(max(0, at - time.time()))
    url = config.KILL_URLS[0]
    try:
        r = requests.post(url + "/test/die", headers={"X-Test-Key": config.TEST_KEY}, timeout=10)
        KILLED.update({"url": url, "at": time.time(), "response": r.json()})
        log(f"*** KILLED replica via {url}: {r.text.strip()}")
    except Exception as e:
        KILLED.update({"url": url, "error": str(e)})


def wait_ledger(api: Api, drop_id: str, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        inf = api.a("GET", f"/admin/drops/{drop_id}/integrity")
        if inf["info"].get("ledger_lag", 1) == 0:
            return inf
        time.sleep(1.5)
    return api.a("GET", f"/admin/drops/{drop_id}/integrity")



# ---------------------------------------------------------------- STATE_SNIPER hook: the sale opens / closes at announced instants

def _server_offset():
    """(offset_s, uncertainty_s) so that server_time = our_time + offset, from the Date header (see timesync.py), or None."""
    s = requests.Session()
    return estimate_offset(lambda: parse_http_date(s.get(config.BASE_URL.rstrip("/") + "/healthz", timeout=5).headers.get("Date")))


def plan_boundary(t0: float, window_sec: float) -> dict:
    """The runner decides when the sale opens (just before the plan's time zero, so nobody honest is early) and when it closes (a few seconds
    after the last honest arrival), and tells the snipers in SERVER clock seconds, like a published schedule. The runner itself triggers the
    transitions on its own clock using the same kind of estimate, so the two sides can disagree by about the clock-estimate error."""
    est = _server_offset()
    off = est[0] if est else 0.0
    o, c = t0 - 0.5, t0 + window_sec + 8.0
    return {"open_at_s": o + off, "close_at_s": c + off, "open_local_s": o, "close_local_s": c,
            "runner_offset_s": off, "runner_offset_unc_s": est[1] if est else None, "clock_synced": bool(est)}


def _flip_later(drop_id: str, at_local: float, to: str, out: dict):
    fl = Api()                                  # its own session, and the admin login done BEFORE the instant, so nothing delays the flip
    try:
        fl.admin()
        time.sleep(max(0.0, at_local - time.time()))
        sent = time.time()
        fl.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": to}, retries=1)
        out[to] = {"sent_local_s": sent, "done_local_s": time.time()}
    except Exception as e:
        out[to] = {"error": str(e)}


def boundary_check(api: Api, drop_id: str, tokens: list, bundle: dict, inf: dict, bnd: dict, events: dict) -> dict:
    d = requests.get(api.base + f"/drops/{drop_id}", timeout=30).json()
    ev = api.a("GET", f"/admin/drops/{drop_id}/audit?limit=500")["events"]       # newest first; after CLOSED there are only a handful of events
    return score_boundary(d, ev, tokens, bundle, inf, bnd, events)


def score_boundary(d: dict, ev: list, tokens: list, bundle: dict, inf: dict, bnd: dict, events: dict) -> dict:
    """Scores the boundary run. `boundary_violations` must be 0. Each part is read from something the bots do not control:
    the sale's own recorded open/close instants (Redis TIME), the hash-chained audit order, the sealed list and the integrity counters."""
    opened, closed, epoch = d.get("opened_at_ms"), d.get("closed_at_ms"), d.get("epoch")
    acked = {t["receipt_id"]: t for t in tokens if "receipt_id" in t}            # every entry a client was told was accepted
    in_tree = {e[0] for e in bundle["entries"]}
    closed_seq = next((e["seq"] for e in ev if e["epoch"] == epoch and e["type"] == "state_changed" and (e.get("payload") or {}).get("to") == "CLOSED"), None)
    parts = {
        "accepted_outside_window": None if not (opened and closed) else sum(1 for t in acked.values() if t.get("arrival_ms") is not None and not (opened <= t["arrival_ms"] <= closed)),
        "accepted_after_closed_in_audit": None if closed_seq is None else sum(1 for e in ev if e["epoch"] == epoch and e["type"] in ("token_issued", "entry_registered") and e["seq"] > closed_seq),
        "orphan_receipts": len(set(acked) - in_tree),
        "sealed_count_mismatch": abs(inf["info"]["entries_registered"] - bundle["entry_count"]),
        "accepted_but_not_in_sealed_list": inf["violations"].get("missing_receipts"),
    }
    return {"boundary_violations": sum(v for v in parts.values() if v is not None), "all_checks_ran": all(v is not None for v in parts.values()), "parts": parts,
            "entries_accepted_by_server": inf["info"]["entries_registered"], "entries_in_sealed_list": bundle["entry_count"], "receipts_clients_were_given": len(acked),
            "tokens_issued": inf["info"].get("tokens_issued"), "sale_opened_at_ms": opened, "sale_closed_at_ms": closed,
            "open_flip_vs_announced_ms": None if not opened else round(opened - bnd["open_at_s"] * 1000), "close_flip_vs_announced_ms": None if not closed else round(closed - bnd["close_at_s"] * 1000),
            "runner_clock_offset_s": bnd["runner_offset_s"], "runner_clock_uncertainty_s": bnd["runner_offset_unc_s"], "runner_clock_synced": bnd["clock_synced"],
            "shots": {k: v for k, v in sorted(events.items()) if k.startswith("sniper_") or k == "sniper_clock_unsynced"},
            "note": "shots are counted by the bot's own clock (about +-200 ms around the announced instant); the violations come from the server's records"}


SNIPE_GAP = 0.05      # CLAIM_SNIPER: seconds between its rounds of /claim (so a promoted seat is taken within about this long)


def claim_phase(api: Api, scn: Scenario, drop_id: str, bundle: dict, tokens: list, rng: random.Random) -> dict:
    by_rid = {t["receipt_id"]: t for t in tokens if "receipt_id" in t}
    snipe = {t["receipt_id"]: t for t in tokens if t.get("profile") == "CLAIM_SNIPER" and "receipt_id" in t}   # claimed by the hammer below, not by the normal flow
    api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "CLAIM"})
    tiers = {t["id"]: t["seats"] for t in bundle["tiers"]}
    sessions, lock = {}, threading.Lock()
    stats = {"claimed": 0, "forfeited": 0, "expired_rejects": 0, "other": 0}
    claimed = set(); decided = {}
    seats_seen, sn, slock, stop = {}, Counter(), threading.Lock(), threading.Event()     # seats_seen: seat_no -> receipts that were told 200 for it

    def sess(uid):
        with lock:
            if uid in sessions:
                return sessions[uid]
        r = requests.post(api.base + "/test/login", json={"user_id": uid, "password": config.TEST_PASSWORD}, headers={"X-Test-Key": api.key}, timeout=30).json()["token"]
        with lock:
            sessions[uid] = r
        return r

    def attempt(rid):
        t = by_rid.get(rid)
        if not t or rid in snipe:
            return
        if rid not in decided:       # humans forfeit with probability (1 - human_claim_rate): this drives the cascade
            decided[rid] = not (t["kind"] == "human" and rng.random() > scn.human_claim_rate)
        if not decided[rid]:
            stats["forfeited"] += 1; return
        r = requests.post(api.base + f"/drops/{drop_id}/claim", json={"token_msg": t["token_msg"]},
                          headers={"Authorization": "Bearer " + sess(t["uid"]), "X-Sim-IP": f"172.16.{rng.randrange(256)}.{rng.randrange(1, 255)}", "Idempotency-Key": rid[:16]}, timeout=60)
        if r.status_code == 200:
            claimed.add(rid)
            with slock:
                seats_seen.setdefault(r.json().get("seat_no"), set()).add(rid)
        elif r.status_code == 410:
            stats["expired_rejects"] += 1
        else:
            stats["other"] += 1

    live = dict(snipe)           # sniper receipts still hoping for a seat

    def hit(rid):
        t = snipe[rid]
        try:
            r = requests.post(api.base + f"/drops/{drop_id}/claim", json={"token_msg": t["token_msg"]}, timeout=30,
                              headers={"Authorization": "Bearer " + sess(t["uid"]), "X-Sim-IP": f"172.18.{random.randrange(256)}.{random.randrange(1, 255)}"})
            err = (r.json() or {}).get("error") if r.status_code != 200 else None
        except (requests.RequestException, ValueError):
            with slock:
                sn["network_error"] += 1
            return
        with slock:
            sn["requests"] += 1
            if r.status_code == 200:
                sn["ok"] += 1
                seats_seen.setdefault(r.json().get("seat_no"), set()).add(rid)
                claimed.add(rid); live.pop(rid, None)
            elif r.status_code == 403:
                sn["refused_not_reserved_for_it"] += 1            # a receipt that is not (yet) holding a reservation can not claim anything
            elif r.status_code == 410:
                sn["refused_its_reservation_expired"] += 1; live.pop(rid, None)
            elif r.status_code == 409:
                sn["refused_" + (err or "409")] += 1
                if err == "seat_conflict":
                    live.pop(rid, None)
            elif r.status_code == 429:
                sn["rate_limited"] += 1
            else:
                sn[f"http_{r.status_code}"] += 1

    def hammer():
        with ThreadPoolExecutor(16) as pool:
            while not stop.is_set() and live:
                list(pool.map(hit, list(live)))
                stop.wait(SNIPE_GAP)

    hammer_th = threading.Thread(target=hammer, daemon=True)
    if snipe:
        hammer_th.start()

    winners = [rid for t, ids in bundle["results"].items() for rid in ids[:tiers[t]]]
    deadline = time.time() + scn.claim_sec * 4 + 60
    tried = set()
    with ThreadPoolExecutor(32) as ex:
        list(ex.map(attempt, winners)); tried.update(winners)
        while time.time() < deadline:
            time.sleep(1.0)
            summ = api.a("GET", f"/admin/drops/{drop_id}/claims")
            if summ["pending"] == 0:
                break
            # reserved seats may now belong to promoted waitlisters: look at the next ones in line
            cand = [rid for t, ids in bundle["results"].items() for rid in ids[tiers[t]:tiers[t] + 3 * max(1, int(summ["expired"] + 5))] if rid in by_rid and rid not in claimed]
            todo = []
            for rid in cand:
                if rid in tried and decided.get(rid) is False:
                    continue
                st = requests.get(api.base + f"/drops/{drop_id}/result/{rid}", timeout=30).json()
                if st.get("claim", {}).get("status") == "reserved" and rid not in claimed:
                    todo.append(rid)
            list(ex.map(attempt, todo)); tried.update(todo)
    stop.set()
    if snipe:
        hammer_th.join(60)
    api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "SETTLED"})
    summ = api.a("GET", f"/admin/drops/{drop_id}/claims")
    out = {"claimed_by_client": len(claimed), "client_forfeits": stats["forfeited"], "expired_rejects": stats["expired_rejects"],
           "other_rejects": stats["other"], "server_summary": summ}
    if snipe:
        # every seat a sniper was handed must be one its own draw rank (or a promotion to it) entitled it to
        wrong = 0
        for rid in [r for r in claimed if r in snipe]:
            st = requests.get(api.base + f"/drops/{drop_id}/result/{rid}", timeout=30).json()
            if st.get("outcome") != "won" or (st.get("claim") or {}).get("status") != "claimed":
                wrong += 1
        out["claim_sniper"] = {"sniper_receipts": len(snipe), "seats_claimed_by_snipers": sum(1 for r in claimed if r in snipe), "still_without_a_seat": len(live),
                               "requests_sent": sn["requests"], "answers": {k: v for k, v in sorted(sn.items()) if k != "requests"},
                               "seats_claimed_without_entitlement": wrong, "client_duplicate_seats": sum(1 for rids in seats_seen.values() if len(rids) > 1)}
    return out


def run_scenario(scn: Scenario, out_root: str, extra_fcfs: bool = False) -> dict:
    api = Api()
    if not api.healthy():
        raise SystemExit(f"backend not reachable at {config.BASE_URL}")
    api.ensure_seeded(scn.total_actors())
    tag = hashlib.sha1((json.dumps(scn.tiers, sort_keys=True) + scn.tag).encode()).hexdigest()[:6]
    out = os.path.join(out_root, scn.name, scn.tag.replace("=", "-")) if scn.tag else os.path.join(out_root, scn.name)
    if scn.policy == "fcfs":
        out = os.path.join(out, "live_fcfs")
    os.makedirs(os.path.join(out, "charts"), exist_ok=True)
    drop_id = f"exp-{scn.name}-{scn.policy}-{tag}"[:60]
    log(f"=== {scn.name} {scn.tag} policy={scn.policy} drop={drop_id}")
    boundary = scn.policy != "fcfs" and any(o.profile == "STATE_SNIPER" for o in scn.operators)   # the runner opens/closes the sale at announced instants
    ensure_drop(api, scn, drop_id, scheduled=boundary)
    plan = build_plan(scn, config.POPULATION, drop_id)
    labels = labels_from_plan(plan)
    lab.upload(api, labels)
    lab.write_file(labels, os.path.join(out, "labels.json"))
    LB = lab.as_map(labels)
    KILLED.clear()
    started = time.strftime("%Y-%m-%dT%H:%M:%S")
    run = locust_run(scn, plan, out, api, boundary=boundary)
    ep, tokens = run["endpoints"], run["tokens"]
    if boundary and any("error" in v for v in run["flips"].values()):
        raise RuntimeError(f"the runner could not open/close the sale on schedule: {run['flips']}")
    lat = sc.latency_table(ep, run["duration_s"])
    live = api.a("GET", f"/admin/drops/{drop_id}/live")
    res = {"meta": {"experiment": scn.name, "tag": scn.tag, "scenario": scn.to_dict(), "started": started, "duration_s": round(run["duration_s"], 1),
                    "drop_id": drop_id, "policy": scn.policy, "population": config.POPULATION, "identity_cost_usd": scn.identity_cost_usd,
                    "actors": len(plan["actors"]), "operators": len(plan["operators"])},
           "traffic": {"humans": sum(1 for a in plan["actors"] if a["kind"] == "human"), "bot_identities": sum(1 for a in plan["actors"] if a["kind"] == "bot"),
                       "operators": {o["id"]: {"profile": o["profile"], "ip_pool": o["ip_pool"]} for o in plan["operators"]},
                       "client_requests": sum(v["requests"] for v in lat.values()), "client_events": run["events"],
                       "receipts_issued_to_clients": sum(1 for t in tokens if "receipt_id" in t)},
           "latency": lat, "counters": live["counters"], "extras": {}}
    cost = scn.identity_cost_usd

    if scn.policy == "fcfs":
        api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "CLOSED"})
        b = api.a("GET", f"/admin/drops/{drop_id}/baseline")
        offs, off = {}, 0
        for t in scn.tiers:
            offs[t["id"]] = (off, off + t["seats"]); off += t["seats"]
        winners = {t: [] for t in offs}
        for seat, user in b["seats"].items():
            for t, (lo, hi) in offs.items():
                if lo < int(seat) <= hi:
                    winners[t].append(user)
        parts = b["attempts_by_actor"] or {a["uid"]: 1 for a in plan["actors"]}
        res["policies"] = {"fcfs_live": sc.policy_metrics(winners, parts, LB, cost)}
        res["integrity"] = api.a("GET", f"/admin/drops/{drop_id}/integrity")
        api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "SETTLED"})
        return reporting.finish(res, out)

    # ---------------- Fair Drop: close -> lock -> draw -> verify ----------------
    if scn.malicious:
        target = next((t for t in tokens if t.get("kind") == "human" and "receipt_id" in t), None)
        api.req("POST", "/test/malicious", json={"drop_id": drop_id, "enabled": True, "receipt_id": target["receipt_id"]})
        res["extras"]["malicious_target"] = {"receipt_id": target["receipt_id"], "uid": target["uid"]}
    if not boundary:                       # (in a boundary run the runner already closed it at the announced instant)
        api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "CLOSED"})
    t_lock = time.time()
    locked = api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "LOCKED"})
    root_at_lock = locked["merkle_root"]
    log(f"locked: root={root_at_lock[:16]}.. entries={locked['entry_count']} in {time.time() - t_lock:.2f}s")
    t_draw = time.time()
    drawn = api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "DRAWN"})
    log(f"drawn in {time.time() - t_draw:.1f}s beacon={'yes' if drawn.get('beacon') else 'none'}")
    bundle = requests.get(api.base + f"/drops/{drop_id}/verify", timeout=300).json()
    tgt = res["extras"].get("malicious_target", {}).get("receipt_id")
    ok, checks = ref.verify_bundle(bundle, receipt=tgt, root_at_lock=root_at_lock)
    res["verification"] = {"reference_verifier_ok": ok, "checks": [{"name": n, "ok": o, "detail": d} for n, o, d in checks], "merkle_root": bundle["merkle_root"],
                           "entry_count": bundle["entry_count"], "beacon": bool(bundle.get("beacon")), "seed_hash": bundle["seed_hash"]}
    cf = api.a("GET", f"/admin/drops/{drop_id}/counterfactuals")
    res["policies"] = sc.score_counterfactuals(cf, LB, cost)
    res["traffic"]["attempts_recorded"] = cf["attempts_total"]
    res["traffic"]["attempts_by_kind"] = res["policies"]["fcfs"]["requests_by_kind"]
    res["counterfactual_definitions"] = cf["definitions"]
    res["tiers"] = scn.tiers

    # experiment-specific evidence
    if scn.name.startswith("exp4"):
        h = next(a["uid"] for a in plan["actors"] if a["kind"] == "human")
        res["extras"]["the_human"] = {"user_id": h, **sc.human_chance(cf, h, res["policies"])}
    if scn.name.startswith("exp5"):
        scr = [a["uid"] for a in plan["actors"] if a["op"] == "scrapers"]; ui = [a["uid"] for a in plan["actors"] if a["op"] == "ui-mimic"]
        ent = {}
        for tier in cf["entries_by_tier_actor"].values():
            for actor, n in tier.items():
                ent[actor] = ent.get(actor, 0) + n
        res["extras"]["tarpit"] = {"scraper_identities": len(scr), "ui_mimic_identities": len(ui), "tarpit_hits": live["counters"].get("tarpit_hits", 0),
                                   "scrapers_fooled": run["events"].get("tarpit_receipt", 0),
                                   "share_of_scrapers_caught": run["events"].get("tarpit_receipt", 0) / max(1, len(scr)),
                                   "real_entries_scrapers": sum(ent.get(u, 0) for u in scr), "real_entries_ui_mimic": sum(ent.get(u, 0) for u in ui),
                                   "honest_limit": "the tarpit only catches bots that take the bait; UI-mimicking bots are not caught (and still get exactly 1 entry per identity)"}
    if scn.kill_replica_at_s is not None:
        in_tree = {e[0] for e in bundle["entries"]}
        acked = {t["receipt_id"] for t in tokens if "receipt_id" in t}
        res["extras"]["kill_replica"] = {"killed": KILLED, "acked_receipts": len(acked), "acked_receipts_missing_from_tree": len(acked - in_tree),
                                         "tree_entries": len(in_tree), "entries_without_client_ack": len(in_tree - acked),
                                         "client_5xx_or_conn_errors": sum(v["errors"] for v in lat.values()),
                                         "replicas_after": [{"id": r["id"], "healthy": r["healthy"]} for r in api.a("GET", f"/admin/drops/{drop_id}/live")["replicas"]]}
    inf = wait_ledger(api, drop_id)
    res["integrity"] = inf
    if boundary:
        res["extras"]["boundary"] = boundary_check(api, drop_id, tokens, bundle, inf, run["boundary"], run["events"])
    if scn.malicious:
        m = res["extras"]["malicious_target"]
        p = requests.get(api.base + f"/drops/{drop_id}/proof/{m['receipt_id']}", timeout=30)
        ctrl = next(t for t in tokens if t.get("kind") == "human" and t["receipt_id"] != m["receipt_id"])
        pc = requests.get(api.base + f"/drops/{drop_id}/proof/{ctrl['receipt_id']}", timeout=30)
        res["extras"]["malicious"] = {"victim_proof_status": p.status_code, "victim_sees": p.json().get("error"), "control_proof_status": pc.status_code,
                                      "reference_verifier_flags_victim": not ok, "integrity_missing_receipts": inf["violations"].get("missing_receipts"),
                                      "detected": p.status_code == 404 and inf["violations"].get("missing_receipts") == 1}
    if scn.claims:
        res["claims"] = claim_phase(api, scn, drop_id, bundle, tokens, random.Random(scn.seed))
        res["integrity_after_claims"] = wait_ledger(api, drop_id)
        cs = res["claims"].get("claim_sniper")
        if cs:                             # double-allocated seats = a seat two receipts were told 200 for + the server's own duplicate/oversold counters
            v = res["integrity_after_claims"]["violations"]
            cs["server_duplicate_seats"], cs["server_oversold"] = v.get("duplicate_seats"), v.get("oversold")
            cs["blocked_duplicate_seat_attempts"] = res["integrity_after_claims"]["info"].get("blocked_duplicate_seat_attempts")
            cs["double_allocated_seats"] = cs["client_duplicate_seats"] + (v.get("duplicate_seats") or 0) + (v.get("oversold") or 0)
            res["extras"]["claim_sniper"] = cs
    else:
        api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "CLAIM"})
        api.a("POST", f"/admin/drops/{drop_id}/advance", json={"to": "SETTLED"})
    return reporting.finish(res, out)


def run_experiment(name: str, scale: float, also_fcfs: bool = False, out_root: str = None) -> list:
    out_root = out_root or config.REPORTS_DIR
    results = []
    for scn in ALL_RUNNABLE[name](scale):
        r = run_scenario(scn, out_root)
        if also_fcfs and scn.policy == "fairdrop":
            import copy
            f = copy.deepcopy(scn); f.policy = "fcfs"
            fr = run_scenario(f, out_root)
            r["policies"]["fcfs_live"] = fr["policies"]["fcfs_live"]
            r["live_fcfs_latency"] = fr["latency"]
            reporting.finish(r, os.path.join(out_root, scn.name, scn.tag.replace("=", "-")) if scn.tag else os.path.join(out_root, scn.name))
        results.append(r)
    if name == "exp3":
        reporting.sybil_aggregate(results, os.path.join(out_root, EXPERIMENTS[name](scale)[0].name))
    return results
