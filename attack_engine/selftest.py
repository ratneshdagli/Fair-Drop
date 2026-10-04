"""Protection self-test: known-good and known-bad inputs against a fresh drop. Every case has an expected answer
decided BEFORE we call the server, so a wrong accept (false negative) or a wrong reject (false positive) is a visible failure.
Run:  python -m attack_engine selftest      (also exposed as POST /selftest on the control API)"""
import base64
import concurrent.futures as cf
import random
import time
import uuid

import requests

from . import config
from .auth import Api


def run() -> dict:
    api = Api()
    base = api.base
    out = []

    def case(name, tried, expected, actual, ok, kind):
        out.append({"name": name, "tried": tried, "expected": expected, "actual": actual, "pass": bool(ok), "kind": kind})

    now = int(time.time() * 1000)
    iso = lambda ms: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ms / 1000))
    ev = api.a("POST", "/admin/events", json={"name": "Protection self-test", "venue": "lab", "starts_at": iso(now + 864e5),
                                               "tiers": [{"name": "Gold", "price_cents": 10000, "seats": 5}]})
    d = api.a("POST", "/admin/drops", json={"event_id": ev["id"], "mode": "fairdrop", "opens_at": iso(now), "closes_at": iso(now + 3600e3),
                                             "cutoff_at": iso(now - 60e3), "claim_sec": 30})
    did = d["id"]
    api.a("POST", f"/admin/drops/{did}/advance", json={"to": "OPEN"})
    ids = random.sample(range(40000, 49000), 12)
    users = [f"t_{i:06d}" for i in ids]

    def login(u):
        r = requests.post(base + "/test/login", json={"user_id": u, "password": config.TEST_PASSWORD}, headers={"X-Test-Key": api.key}, timeout=20)
        return {"Authorization": "Bearer " + r.json()["token"]}

    def hdr(u, ip):
        return {"X-Test-Key": api.key, "X-Sim-IP": ip, "X-Sim-Actor": u}

    def token(u, ip="10.9.0.1", auth=True):
        h = hdr(u, ip)
        if auth:
            h.update(login(u))
        return requests.post(f"{base}/drops/{did}/test-token", json={}, headers=h, timeout=20)

    def reg(tok, u, ip, idem=None, path="register", sig=None, msg=None):
        h = hdr(u, ip)
        if idem:
            h["Idempotency-Key"] = idem
        return requests.post(f"{base}/drops/{did}/{path}", json={"token_msg": msg or tok["token_msg"], "sig": sig or tok["sig"], "tier": tok["tier"]}, headers=h, timeout=20)

    # 1 + 2 + 3: one honest person
    u0 = users[0]
    t0 = token(u0).json()
    key = uuid.uuid4().hex
    r1 = reg(t0, u0, "10.9.0.1", idem=key)
    case("Honest person enters", "valid token, first time", "accepted", f"HTTP {r1.status_code}", r1.status_code == 200, "should_accept")
    r2 = reg(t0, u0, "10.9.0.1", idem=key)
    same = r2.status_code == 200 and r2.json().get("receipt_id") == r1.json().get("receipt_id")
    case("Retry after a network glitch", "same request sent twice (same idempotency key)", "accepted again, same receipt, no second entry", f"HTTP {r2.status_code}, same receipt={same}", same, "should_accept")
    r3 = reg(t0, u0, "10.9.0.1")
    case("Reusing a used token", "the same token submitted again without the retry key", "rejected (409 token already used)", f"HTTP {r3.status_code}", r3.status_code == 409, "should_reject")

    # 4 + 5 forged / tampered
    u1 = users[1]
    t1 = token(u1).json()
    bad_sig = base64.b64encode(bytes(random.getrandbits(8) for _ in range(len(base64.b64decode(t1["sig"]))))).decode()
    r4 = reg(t1, u1, "10.9.0.2", sig=bad_sig)
    case("Forged signature", "random bytes instead of the server's signature", "rejected (400)", f"HTTP {r4.status_code}", r4.status_code == 400, "should_reject")
    tm = bytearray(base64.b64decode(t1["token_msg"])); tm[0] ^= 0xFF
    r5 = reg(t1, u1, "10.9.0.2", msg=base64.b64encode(bytes(tm)).decode())
    case("Tampered token", "a valid signature attached to a different token", "rejected (400)", f"HTTP {r5.status_code}", r5.status_code == 400, "should_reject")
    r5b = reg(t1, u1, "10.9.0.2")
    case("Honest person enters after a failed forgery attempt", "u1's real token afterwards", "accepted", f"HTTP {r5b.status_code}", r5b.status_code == 200, "should_accept")

    # 6 second token, 7 unauth, 8 ineligible
    r6 = token(u0)
    case("Asking for a second ticket token", "same verified person asks again", "rejected (409 already issued)", f"HTTP {r6.status_code}", r6.status_code == 409, "should_reject")
    r7 = requests.post(f"{base}/drops/{did}/test-token", json={}, headers={"X-Test-Key": api.key}, timeout=20)
    case("Asking for a token without signing in", "no session at all", "rejected (401)", f"HTTP {r7.status_code}", r7.status_code == 401, "should_reject")
    phone = "+1555" + str(random.randint(1000000, 9999999))
    otp = requests.post(base + "/auth/otp", json={"phone": phone}, timeout=20).json()["otp"]
    late = requests.post(base + "/auth/verify", json={"phone": phone, "otp": otp}, timeout=20).json()["token"]
    r8 = requests.post(f"{base}/drops/{did}/test-token", json={}, headers={"X-Test-Key": api.key, "Authorization": "Bearer " + late, "X-Sim-Actor": "late-signup"}, timeout=20)
    case("Signed up after the cutoff", "new account verified after eligibility cutoff", "rejected (403 not eligible)", f"HTTP {r8.status_code}", r8.status_code == 403, "should_reject")

    # 9 decoy
    u2 = users[2]
    t2 = token(u2).json()
    r9 = reg(t2, u2, "10.9.0.3", path="register-fast")
    case("Bot takes the decoy 'fast' endpoint", "a token sent to the hidden fast path", "looks accepted but never enters the real list (checked after lock)", f"HTTP {r9.status_code}", r9.status_code == 200, "decoy")

    # 10 flood from one IP vs normal user elsewhere
    pre = [(users[i], token(users[i], ip=f"10.9.1.{i}").json()) for i in (3, 4)]
    def poke(_):
        return reg(pre[0][1], pre[0][0], "10.99.99.99", sig=bad_sig).status_code
    with cf.ThreadPoolExecutor(60) as ex:
        codes = list(ex.map(poke, range(150)))
    n429 = sum(1 for c in codes if c == 429)
    case("One address floods the server", "150 requests in about a second from one IP", "some are throttled (429) so the site stays up", f"{n429} of 150 throttled", n429 > 0, "should_reject")
    r10 = reg(pre[1][1], pre[1][0], "10.9.1.4")
    case("Normal person while another IP is flooding", "a different person, different IP, at the same time", "accepted (flooding must not block others)", f"HTTP {r10.status_code}", r10.status_code == 200, "should_accept")
    r10b = reg(pre[0][1], pre[0][0], "10.9.1.3")
    case("Flooded person still gets in from a clean IP", "the real token of the person whose IP was used to flood", "accepted", f"HTTP {r10b.status_code}", r10b.status_code == 200, "should_accept")
    legit_entries = 4  # u0, u1, users[4], users[3]

    # 12 close, late
    late_tok = token(users[5]).json()
    api.a("POST", f"/admin/drops/{did}/advance", json={"to": "CLOSED"})
    r12 = reg(late_tok, users[5], "10.9.0.5")
    case("Entering after the window closed", "valid token submitted after close", "rejected (410 window closed)", f"HTTP {r12.status_code}", r12.status_code == 410, "should_reject")
    r12b = token(users[6])
    case("Asking for a token after the window closed", "valid person, window closed", "rejected (window closed)", f"HTTP {r12b.status_code}", r12b.status_code in (409, 410), "should_reject")

    # 13 lock, check list
    api.a("POST", f"/admin/drops/{did}/advance", json={"to": "LOCKED"})
    api.a("POST", f"/admin/drops/{did}/advance", json={"to": "DRAWN"})
    time.sleep(1)
    bundle = requests.get(f"{base}/drops/{did}/verify", timeout=30).json()
    ents = bundle.get("entries") or bundle.get("receipts") or []
    rids = {(e[0] if isinstance(e, (list, tuple)) else e.get("receipt_id") or e.get("receipt")) for e in ents}
    in_list = r1.json().get("receipt_id") in rids
    case("Published list contains the honest entry", "look up person 1's receipt in the sealed list", "present", "present" if in_list else "MISSING", in_list, "should_accept")
    case("Published list has exactly the legitimate entries", "count entries in the sealed list", f"{legit_entries} (forged, tampered, decoy and late ones excluded)", f"{len(rids)}", len(rids) == legit_entries, "should_reject")
    ig = api.a("GET", f"/admin/drops/{did}/integrity")
    case("Safety counters", "oversold, duplicates, missing receipts, broken Merkle, bad transitions", "all zero", f"total violations: {ig.get('total_violations')}", ig.get("ok") is True, "should_accept")
    passed = sum(1 for c in out if c["pass"])
    return {"drop_id": did, "cases": out, "passed": passed, "total": len(out), "all_passed": passed == len(out)}


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=1))
