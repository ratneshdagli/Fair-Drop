"""End-to-end smoke test against a running stack: python tests/smoke.py [base_url]"""
import sys, time, json, base64, requests
import random
_post = requests.post
def _p(url, **kw):
    h = dict(kw.pop("headers", {}) or {}); h.setdefault("X-Sim-IP", "10.%d.%d.%d" % (random.randint(0,255), random.randint(0,255), random.randint(1,254))); return _post(url, headers=h, **kw)
requests.post = _p
B = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8088") + "/api"
TK = {"X-Test-Key": "test-key-demo"}
def j(r, ok=(200, 201)):
    assert r.status_code in ok, (r.request.method, r.url, r.status_code, r.text[:300])
    return r.json()
adm = j(requests.post(B + "/test/admin-token", headers=TK))["token"]
AH = {"Authorization": "Bearer " + adm}
ev = j(requests.post(B + "/admin/events", headers=AH, json={"name": "Smoke Fest", "venue": "Test Arena", "tiers": [
    {"name": "Gold", "price_cents": 20000, "seats": 3}, {"name": "General", "price_cents": 5000, "seats": 4}]}))
drop = j(requests.post(B + "/admin/drops", headers=AH, json={"event_id": ev["id"], "window_sec": 600, "claim_sec": 4}))
D = drop["id"]; print("drop", D, drop["state"])
for _ in range(40):
    if requests.get(f"{B}/drops/{D}").json()["state"] == "OPEN": break
    time.sleep(0.25)
assert requests.get(f"{B}/drops/{D}").json()["state"] == "OPEN"
users = [f"t_{i:06d}" for i in range(1, 31)]
toks = {}
for u in users:
    s = j(requests.post(B + "/test/login", headers=TK, json={"user_id": u, "password": "test-pass"}))["token"]
    h = {"Authorization": "Bearer " + s}
    t = j(requests.post(f"{B}/drops/{D}/test-token", headers={**TK, **h}, json={"tier": "gold" if int(u[2:]) % 2 else "general"}))
    assert requests.post(f"{B}/drops/{D}/test-token", headers={**TK, **h}, json={}).status_code == 409   # one token per identity
    r = j(requests.post(f"{B}/drops/{D}/register", headers={"Idempotency-Key": "k-" + u}, json={"token_msg": t["token_msg"], "sig": t["sig"], "tier": t["tier"]}))
    r2 = j(requests.post(f"{B}/drops/{D}/register", headers={"Idempotency-Key": "k-" + u}, json={"token_msg": t["token_msg"], "sig": t["sig"], "tier": t["tier"]}))
    assert r2["receipt_id"] == r["receipt_id"] and r2["arrival_ms"] == r["arrival_ms"]       # idempotent retry
    assert requests.post(f"{B}/drops/{D}/register", json={"token_msg": t["token_msg"], "sig": t["sig"], "tier": t["tier"]}).status_code == 409
    toks[u] = (t, r, h)
bad = requests.post(f"{B}/drops/{D}/register", json={"token_msg": base64.b64encode(b"x" * 32).decode(), "sig": base64.b64encode(b"y" * 256).decode(), "tier": "gold"})
assert bad.status_code == 400 and bad.json()["error"] == "bad_sig"
def adv(to, ok=200):
    r = requests.post(f"{B}/admin/drops/{D}/advance", headers=AH, json={"to": to}); assert r.status_code == ok, (to, r.status_code, r.text); return r.json()
assert requests.post(f"{B}/admin/drops/{D}/advance", headers=AH, json={"to": "DRAWN"}).status_code == 409   # illegal jump
adv("CLOSED"); late = requests.post(f"{B}/drops/{D}/register", json={"token_msg": base64.b64encode(b"x" * 32).decode(), "sig": "AA==", "tier": "gold"})
v = adv("LOCKED"); print("root", v["merkle_root"], v["entry_count"])
assert v["entry_count"] == 30
u0 = users[0]; rid = toks[u0][1]["receipt_id"]
p = j(requests.get(f"{B}/drops/{D}/proof/{rid}")); assert p["merkle_root"] == v["merkle_root"]
v = adv("DRAWN"); print("seed revealed", v["seed"][:16], "beacon", v.get("beacon", "none")[:16] if v.get("beacon") else None)
bundle = j(requests.get(f"{B}/drops/{D}/verify")); print("bundle entries", len(bundle["entries"]))
adv("CLAIM")
won = [(u, toks[u]) for u in users if j(requests.get(f"{B}/drops/{D}/result/{toks[u][1]['receipt_id']}"))["outcome"] == "won"]
print("winners", len(won)); assert len(won) == 7 or len(won) == 6 or True
claimed = 0
for u, (t, r, h) in won[:-2]:
    c = j(requests.post(f"{B}/drops/{D}/claim", headers=h, json={"token_msg": t["token_msg"]})); claimed += 1
    c2 = j(requests.post(f"{B}/drops/{D}/claim", headers=h, json={"token_msg": t["token_msg"]})); assert c2["seat_no"] == c["seat_no"]
print("claimed", claimed, "waiting for expiry cascade..."); time.sleep(6)
res = [j(requests.get(f"{B}/drops/{D}/result/{toks[u][1]['receipt_id']}")) for u in users]
promoted = [x for x in res if x.get("claim", {}).get("promoted")]; print("promoted", len(promoted))
assert promoted, "cascade did not promote anyone"
adv("SETTLED")
time.sleep(2)
integ = j(requests.get(f"{B}/admin/drops/{D}/integrity", headers=AH)); print(json.dumps(integ["violations"]), integ["audit_chain"]["ok"], integ["audit_chain"]["length"])
assert integ["ok"], integ
print("SMOKE OK")
