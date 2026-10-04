"""Red team: play the bot owner. Each probe is one thing a clever attacker would really try against the live system,
with the aim stated up front (get an extra entry / get in without a real identity / lock real people out / learn
something that gives an edge). `held` = the system stopped it. `BROKEN` = it worked, so the system needs fixing.
Run:  python -m attack_engine redteam      (also POST /redteam on the control API)"""
import base64
import concurrent.futures as cf
import socket
import statistics
import threading
import urllib.parse
import hashlib
import hmac
import json
import random
import time
import uuid

import requests

from . import config
from .auth import Api


def run() -> dict:
    api = Api()
    base = api.base
    key = api.key
    res = []
    T = 20

    def sim(ip=None):
        return {"X-Test-Key": key, "X-Sim-IP": ip or f"10.77.{random.randint(0, 255)}.{random.randint(1, 254)}"}

    def post(path, body=None, headers=None, **kw):
        return requests.post(base + path, json=body if body is not None else {}, headers={**sim(), **(headers or {})}, timeout=T, **kw)

    def add(pid, title, goal, move, expect, result, verdict, why=""):
        res.append({"id": pid, "title": title, "goal": goal, "move": move, "expected": expect, "result": result, "verdict": verdict, "why": why})

    iso = lambda ms: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ms / 1000))
    now = int(time.time() * 1000)

    def mk_drop(name):
        ev = api.a("POST", "/admin/events", json={"name": name, "venue": "red team", "starts_at": iso(now + 864e5), "tiers": [
            {"name": "Gold", "price_cents": 10000, "seats": 3}, {"name": "General", "price_cents": 5000, "seats": 3}]})
        d = api.a("POST", "/admin/drops", json={"event_id": ev["id"], "mode": "fairdrop", "opens_at": iso(now), "closes_at": iso(now + 3600e3),
                                                 "cutoff_at": iso(now - 60e3), "claim_sec": 30})
        api.a("POST", f"/admin/drops/{d['id']}/advance", json={"to": "OPEN"})
        return d["id"]

    did, did2 = mk_drop("Red team A"), mk_drop("Red team B")
    ids = random.sample(range(41000, 49000), 8)
    users = [f"t_{i:06d}" for i in ids]

    def login(u):
        r = requests.post(base + "/test/login", json={"user_id": u, "password": config.TEST_PASSWORD}, headers=sim(), timeout=T)
        return {"Authorization": "Bearer " + r.json()["token"]}

    def token(u, drop=did, tier="gold"):
        return requests.post(f"{base}/drops/{drop}/test-token", json={"tier": tier}, headers={**sim(), **login(u)}, timeout=T)

    def reg(tok, drop=did, tier=None, idem=None, ip=None):
        h = sim(ip)
        if idem:
            h["Idempotency-Key"] = idem
        return requests.post(f"{base}/drops/{drop}/register", json={"token_msg": tok["token_msg"], "sig": tok["sig"], "tier": tier or tok["tier"]}, headers=h, timeout=T)

    # 1. one phone, many identities (the classic Sybil trick: change the punctuation)
    digits = "1555" + str(random.randint(1000000, 9999999))
    spellings = ["+" + digits, f"+{digits[0]} {digits[1:4]} {digits[4:7]} {digits[7:]}", digits, f"+{digits[0]}-({digits[1:4]})-{digits[4:7]}-{digits[7:]}", "00" + digits]
    got, codes = set(), []
    for s in spellings:
        r = post("/auth/otp", {"phone": s})
        codes.append(r.status_code)
        if r.status_code == 200:
            v = post("/auth/verify", {"phone": s, "otp": r.json()["otp"]})
            if v.status_code == 200:
                got.add(v.json()["user_id"])
    add("phone_spellings", "One phone number, many identities", "Turn one SIM into many 'verified people', each with its own entry.",
        f"Verify the same number written 5 ways: {', '.join(repr(s) for s in spellings[:3])}, …", "all five count as the same one person",
        f"{len(got)} identit{'y' if len(got) == 1 else 'ies'} created from one phone number", "held" if len(got) <= 1 else "BROKEN",
        "The phone number is reduced to digits before it becomes an identity, and codes per phone are capped.")

    # 2. guessing someone's 6-digit code
    ph = "1555" + str(random.randint(1000000, 9999999))
    r = post("/auth/otp", {"phone": ph}); code = r.json()["otp"]
    wrong = [post("/auth/verify", {"phone": ph, "otp": f"{(int(code) + 1 + i) % 1000000:06d}"}).status_code for i in range(12)]
    final = post("/auth/verify", {"phone": ph, "otp": code}).status_code
    add("otp_guessing", "Guess someone's login code", "Take over a victim's account by trying codes until one fits (only 1,000,000 exist).",
        "12 wrong guesses from 12 different addresses, then the right code", "the code is destroyed after a few wrong guesses",
        f"after 12 wrong guesses the correct code was {'ACCEPTED (unlimited guesses!)' if final == 200 else 'refused (code was destroyed)'}", "BROKEN" if final == 200 else "held",
        "5 wrong guesses kill the code; the owner must request a new one.")

    # 3. code spam
    ph2 = "1555" + str(random.randint(1000000, 9999999))
    sends = [post("/auth/otp", {"phone": ph2}).status_code for _ in range(8)]
    n200 = sum(1 for c in sends if c == 200)
    add("otp_spam", "Spam login codes at one number", "Make the site send 1,000s of SMS to one number (costs money, harasses the owner).",
        "Ask for a code for the same number 8 times in a row", "only a few are sent, the rest are refused (429)",
        f"{n200} of 8 codes were sent", "held" if n200 <= 3 else "BROKEN", "Max 3 codes per number per 10 minutes.")

    # 4. admin brute force
    ip = f"10.88.{random.randint(0, 255)}.{random.randint(1, 254)}"
    adm = [requests.post(base + "/admin/login", json={"username": "admin", "password": f"guess{i}"}, headers=sim(ip), timeout=T).status_code for i in range(9)]
    locked = sum(1 for c in adm if c == 429)
    add("admin_guessing", "Guess the admin password", "Get into the admin screens by trying passwords.",
        "9 wrong passwords in a row from one address", "the address is locked out after a few tries",
        f"{locked} of 9 attempts were locked out (the rest were told 'wrong password')", "held" if locked >= 3 else "BROKEN", "5 wrong passwords per address locks it for 5 minutes. Use a strong ADMIN_PASSWORD (the server refuses demo secrets outside demo mode).")

    # 5. huge request body
    tok0 = token(users[0]).json()
    big = "A" * 300_000
    try:
        r = requests.post(f"{base}/drops/{did}/register", json={"token_msg": big, "sig": big, "tier": "gold"}, headers=sim(), timeout=T)
        sc, body_err = r.status_code, (r.json().get("error") if r.headers.get("content-type", "").startswith("application/json") else "")
    except requests.RequestException as e:
        sc, body_err = 0, str(e)[:60]
    ok_ = sc == 413 or body_err == "bad_request"
    add("huge_body", "Send enormous requests", "Exhaust the server's memory with huge requests.", "A 300 KB 'ticket' (a real one is ~0.5 KB)",
        "refused at the door without being read", f"HTTP {sc} {body_err}", "held" if ok_ else "BROKEN", "Bodies over 64 KB are refused by the gateway and again by the server.")

    # 6. hijack someone's retry key
    victim_k = "k-" + uuid.uuid4().hex[:8]
    tv, ta = token(users[1]).json(), token(users[2]).json()
    r1 = reg(tv, idem=victim_k)
    ra = reg(ta, idem=victim_k)                       # attacker reuses the victim's retry key with its own valid ticket
    r2 = reg(tv, idem=victim_k)                       # the victim's honest retry
    same = r2.status_code == 200 and r1.status_code == 200 and r2.json().get("receipt_id") == r1.json().get("receipt_id")
    add("retry_key_hijack", "Hijack someone's retry key", "Break an honest person's safe-retry so they lose their receipt (or get someone else's).",
        "Use the same Idempotency-Key as the victim, with the attacker's own valid ticket", "the victim's retry still returns the victim's own receipt",
        f"victim retry: HTTP {r2.status_code}, own receipt returned={same}; attacker's call: HTTP {ra.status_code}", "held" if same else "BROKEN",
        "A retry key only counts together with its own ticket, so keys can't collide across people.")

    # 7. ticket from one sale used in another
    t7 = token(users[3]).json()
    r7 = reg(t7, drop=did2)
    add("cross_sale_replay", "Use a ticket from a different sale", "Re-use a valid ticket in another sale to enter twice.", "Take a signed ticket from sale A to sale B",
        "rejected (each sale has its own key)", f"HTTP {r7.status_code}", "held" if r7.status_code == 400 else "BROKEN", "Each sale signs with its own key.")

    # 8. forged login
    fake = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode() + "." + base64.urlsafe_b64encode(json.dumps({"sub": "x", "role": "user", "verified_at_ms": 1}).encode()).rstrip(b"=").decode() + "."
    r8 = requests.post(f"{base}/drops/{did}/test-token", json={}, headers={**sim(), "Authorization": "Bearer " + fake}, timeout=T)
    add("forged_login", "Fake a login", "Skip verification by presenting a login card you wrote yourself (no signature).", "A login token with 'alg: none'", "rejected (401)",
        f"HTTP {r8.status_code}", "held" if r8.status_code == 401 else "BROKEN", "Only the server's signature is accepted.")

    # 9. forged admin with the published demo secret
    def hs256(secret, claims):
        b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
        h, p = b(b'{"alg":"HS256","typ":"JWT"}'), b(json.dumps(claims).encode())
        return f"{h}.{p}." + b(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    adm_tok = hs256("dev-only-change-me-jwt-secret", {"sub": "admin:evil", "role": "admin", "exp": int(time.time()) + 600})
    r9 = requests.get(base + "/admin/events", headers={**sim(), "Authorization": "Bearer " + adm_tok}, timeout=T)
    add("demo_secret", "Forge an admin login with the demo secret", "Become admin by signing a token with the secret printed in the demo config.",
        "Sign an admin token with 'dev-only-change-me-jwt-secret'", "rejected in a real deployment",
        f"HTTP {r9.status_code}" + (" (this demo is running with the demo secret, so it works HERE; a real deployment cannot start with it)" if r9.status_code == 200 else ""),
        "demo-only" if r9.status_code == 200 else "held", "Outside demo mode the server refuses to start with the demo admin password, JWT secret or test key.")

    # 10. peek at the secret seed before the draw (to pre-compute a winning ticket)
    info = requests.get(f"{base}/drops/{did}", timeout=T).json()
    leak = bool(info.get("seed")) or bool(info.get("final_randomness"))
    add("seed_peek", "Peek at the secret draw seed early", "Learn the draw's randomness before entering, then craft a ticket that is sure to win.",
        "Read the public sale page while it is open", "the seed is not published until after the list is sealed",
        "seed visible!" if leak else "only the seed's fingerprint is public", "BROKEN" if leak else "held", "The seed is committed (hash) up front and revealed only after the list is sealed.")

    # 11. read how crowded each tier is, then jump to the emptiest one
    seats = requests.get(f"{base}/drops/{did}/seats", timeout=T).text
    leak2 = info.get("entry_count") not in (None, 0) or "entries" in seats.lower()
    add("tier_sniping", "Watch tier crowding, then pounce", "Wait until the last second, see which tier has the best odds, and enter that one.", "Read the public numbers while the sale is open",
        "no live entry counts are public during the sale", "entry counts visible!" if leak2 else "no public per-tier entry counts during the sale", "BROKEN" if leak2 else "held", "Entry counts appear only after the list is sealed.")

    # 12. a second ticket by asking in a different tier
    t12a = token(users[4], tier="gold")
    t12b = token(users[4], tier="general")
    add("second_tier_token", "Ask for a second ticket in another tier", "Double the chances by getting one ticket per tier.", "Same person asks for a gold ticket, then a general one",
        "second request refused (one ticket per person per sale)", f"first HTTP {t12a.status_code}, second HTTP {t12b.status_code}", "held" if (t12a.status_code == 200 and t12b.status_code == 409) else "BROKEN", "One ticket per verified person per sale, whatever the tier.")

    # 13. dodge the speed limit by lying about the address
    rr = []
    for _ in range(80):
        h = {"X-Test-Key": key, "X-Real-IP": f"198.51.{random.randint(0, 255)}.{random.randint(1, 254)}", "X-Forwarded-For": f"203.0.113.{random.randint(1, 254)}"}
        rr.append(requests.post(f"{base}/drops/{did}/register", json={"token_msg": "AAAAAAAAAAAAAAAAAAAAAA==", "sig": "AA==", "tier": "gold"}, headers=h, timeout=T).status_code)
    th = sum(1 for c in rr if c == 429)
    add("address_lie", "Lie about your internet address", "Send unlimited requests by inventing a new address in the headers each time.", "80 fast requests, each claiming a different address header",
        "the gateway ignores the claims and slows the real address", f"{th} of 80 were slowed down (429)", "held" if th > 0 else "BROKEN", "The gateway overwrites the address header with the real one.")

    # 14. enter in a tier other than the one the ticket was asked for (information only)
    t14 = token(users[5], tier="gold").json()
    r14 = reg(t14, tier="general")
    add("tier_switch", "Switch tier at the last moment", "Pick the tier after seeing the crowd.", "Ticket requested for Gold, entered as General",
        "allowed on purpose (the ticket doesn't carry a tier, so nobody can tell), harmless because crowding is hidden",
        f"HTTP {r14.status_code}", "info", "A blind signature cannot carry the tier; see ARCHITECTURE_DECISIONS.")

    # ---- round 2: the attacker has read what round 1 fixed and goes after the next layer ----
    n_round1 = len(res)

    # 15. flood from the same address as a real person (a shared office / campus / mobile network)
    shared = f"10.66.{random.randint(0, 255)}.{random.randint(1, 254)}"
    t15 = token(users[6]).json()
    stop = threading.Event()
    def flooder():
        while not stop.is_set():
            requests.post(f"{base}/drops/{did}/register", json={"token_msg": "AAAAAAAAAAAAAAAAAAAAAA==", "sig": "AA==", "tier": "gold"}, headers=sim(shared), timeout=T)
    ths = [threading.Thread(target=flooder, daemon=True) for _ in range(24)]
    [t.start() for t in ths]
    time.sleep(1.0)
    tries, codes15 = 0, []
    for _ in range(12):
        tries += 1
        c = reg(t15, ip=shared).status_code
        codes15.append(c)
        if c == 200:
            break
        time.sleep(0.25)
    stop.set()
    add("shared_address", "Flood from the same address as real people", "Lock out the real people sharing your office / campus / mobile-network address by using up the address's quota.",
        "24 parallel flooders on one address while a real person on that same address tries to enter", "the real person still gets in on the first try or two",
        f"the real person got in after {tries} {'try' if tries == 1 else 'tries'} (answers: {', '.join(str(c) for c in codes15)})" if codes15[-1] == 200 else f"the real person was still locked out after {tries} tries",
        "held" if (codes15[-1] == 200 and tries <= 2) else "BROKEN", "Only bad requests count against an address; a valid ticket is never blocked by its neighbours' noise.")

    # 16. hammer the big public download (the 50,000-entry list everyone can fetch to re-check a draw)
    big = None
    for d in requests.get(f"{base}/drops", timeout=T).json():
        if (d.get("entry_count") or 0) >= 2000 and d.get("state") in ("DRAWN", "CLAIM", "SETTLED", "LOCKED"):
            big = d
            break
    if big:
        def lat(path):
            t0 = time.time(); r = requests.get(base + path, timeout=60); return (time.time() - t0) * 1000, r
        base_ms = statistics.median([lat(f"/drops/{big['id']}")[0] for _ in range(8)])
        t0 = time.time(); one_ms, one = lat(f"/drops/{big['id']}/verify"); size_mb = len(one.content) / 1e6
        stats = {"n429": 0, "ok": 0}
        def hit(_):
            try:
                r = requests.get(f"{base}/drops/{big['id']}/verify", headers=sim(), timeout=60)
                stats["n429" if r.status_code == 429 else "ok"] += 1
            except requests.RequestException:
                pass
        with cf.ThreadPoolExecutor(30) as ex:
            fut = [ex.submit(hit, i) for i in range(60)]
            time.sleep(0.5)
            during = statistics.median([lat(f"/drops/{big['id']}")[0] for _ in range(8)])
            cf.wait(fut)
        bad = during > max(600, base_ms * 6)
        add("download_flood", "Hammer the big public download", "Slow the whole site for everyone by repeatedly fetching the huge public list (needed to re-check a draw).",
            f"60 downloads of the {size_mb:.1f} MB list ({big.get('entry_count'):,} entries), 30 at a time, while a normal page is timed", "the normal page stays fast",
            f"a normal page took {base_ms:.0f} ms before and {during:.0f} ms during; one download takes {one_ms:.0f} ms; {stats['n429']} of 60 downloads were slowed (429)",
            "BROKEN" if bad else "held", "The finished list never changes, so the gateway keeps one copy and serves it to everybody (and repeated downloads from one address are slowed).")
    else:
        add("download_flood", "Hammer the big public download", "Slow the whole site by fetching the huge public list.", "no large finished sale available to test", "-", "skipped (run a bot attack first)", "info", "")

    # 17. thousands of idle connections that never finish a request (Slowloris-style)
    u = urllib.parse.urlparse(base)
    host, port = u.hostname, u.port or 80
    socks = []
    for _ in range(1500):
        try:
            sk = socket.create_connection((host, port), timeout=3)
            sk.sendall(b"POST /api/drops/x/register HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\n\r\n{")  # promises a body, never sends it
            socks.append(sk)
        except OSError:
            break
    t0 = time.time()
    try:
        okc = requests.get(base + "/healthz", timeout=5).status_code
    except requests.RequestException:
        okc = 0
    ms17 = (time.time() - t0) * 1000
    for sk in socks:
        try:
            sk.close()
        except OSError:
            pass
    add("idle_connections", "Hold thousands of connections open", "Use up the gateway's connections so real people can't connect (Slowloris).", f"{len(socks):,} connections that start a request and then go silent",
        "real visitors still get an answer quickly", f"a normal request took {ms17:.0f} ms (HTTP {okc}) while {len(socks):,} connections hung", "held" if (okc == 200 and ms17 < 1500) else "BROKEN", "The gateway drops connections that stay silent for 10 seconds.")
    for r_ in res[n_round1:]:
        r_["round"] = 2

    held = sum(1 for r in res if r["verdict"] == "held")
    broken = sum(1 for r in res if r["verdict"] == "BROKEN")
    return {"ran_at": int(time.time() * 1000), "probes": res, "held": held, "broken": broken, "total": len(res), "all_held": broken == 0, "rounds": 2}


if __name__ == "__main__":
    print(json.dumps(run(), indent=1))
