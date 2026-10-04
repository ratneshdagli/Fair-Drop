"""Offline tests for the four bots added after the outside review (CRYPTO_SWARM, SMART_SCRAPER, STATE_SNIPER, CLAIM_SNIPER).
No network: the bots run against a tiny in-memory sale (FakeClient). Run: python -m pytest attack_engine/test_new_bots.py"""
import base64
import secrets
import time
from collections import Counter

import gevent
import pytest

from attack_engine import blindrsa as br, config, profiles as P, scenarios
from attack_engine.scenarios import build_plan


class Rec:
    def __init__(self):
        self.events, self.tokens = Counter(), []


class Sale:
    """One in-memory sale shared by the fake clients: opens at open_at, closes at close_at (seconds on the local clock)."""
    def __init__(self, open_at=0.0, close_at=1e18):
        self.open_at, self.close_at, self.issued, self.entries, self.hits = open_at, close_at, set(), {}, Counter()


class FakeClient:
    def __init__(self, sale, rec, actor="t_000002", drop="d1", signer=None):
        self.sale, self.rec, self.actor, self.drop, self.ip, self.signer = sale, rec, actor, drop, "10.0.0.1", signer

    def login(self):
        return 200, {"token": "x"}

    def browse(self):
        return 200, {"token_mode": "blind", "public_key_jwk": self.signer["jwk"]} if self.signer else (200, {"token_mode": "plain"})

    def server_date(self):
        return int(time.time())

    def test_token(self, tier, ip=None):
        now = time.time()
        if now < self.sale.open_at:
            return 409, {"error": "not_open_yet"}
        if now >= self.sale.close_at:
            return 410, {"error": "window_closed"}
        if self.actor in self.sale.issued:
            return 409, {"error": "already_issued"}
        self.sale.issued.add(self.actor)
        rid = secrets.token_hex(8)
        return 200, {"token_msg": base64.b64encode(secrets.token_bytes(32)).decode(), "sig": "AA==", "tier": tier, "receipt_id": rid}

    def register(self, tok, idem=None, ip=None, fast=False, route=None):
        now = time.time()
        self.sale.hits[route or ("register-fast" if fast else "register")] += 1
        if now < self.sale.open_at or now >= self.sale.close_at:
            return 410, {"error": "window_closed"}
        rid = tok.get("receipt_id") or secrets.token_hex(8)
        first = rid not in self.sale.entries
        self.sale.entries.setdefault(rid, int(now * 1000))
        return 200, {"receipt_id": rid, "arrival_ms": self.sale.entries[rid]}

    # --- the real token path, signed by a real RSA key held by the fake server (CRYPTO_SWARM)
    def token(self, blinded_b64, tier, idem=None, ip=None):
        s = self.signer
        if self.actor in self.sale.issued:
            return 409, {"error": "already_issued"}
        self.sale.issued.add(self.actor)
        s["seen_blinded"].append(base64.b64decode(blinded_b64))
        return 200, {"blind_sig": base64.b64encode(br.blind_sign(s["n"], s["d"], base64.b64decode(blinded_b64))).decode(), "token_mode": "blind"}

    def link(self, token_msg_b64):
        self.sale.hits["link"] += 1
        return 200, {}


def ctx_for(client, rec, boundary=None, params=None, uid="t_000002"):
    actor = {"uid": uid, "kind": "bot", "op": "o", "profile": "X"}
    return P.Ctx(client, actor, None, params or {}, __import__("random").Random(1), rec, "gold", boundary=boundary)


# ---------------------------------------------------------------- CRYPTO_SWARM

def test_crypto_swarm_does_real_blinding_and_the_server_accepts_the_ticket():
    pytest.importorskip("cryptography")
    from cryptography.hazmat.primitives.asymmetric import rsa
    nums = rsa.generate_private_key(65537, 2048).private_numbers()
    n, e, d = nums.public_numbers.n, nums.public_numbers.e, nums.d
    enc = lambda i: base64.urlsafe_b64encode(i.to_bytes((i.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()
    signer = {"n": n, "d": d, "jwk": {"kty": "RSA", "n": enc(n), "e": enc(e)}, "seen_blinded": []}
    sale, rec = Sale(), Rec()
    registered = []

    class Strict(FakeClient):                     # a /register that does what the Go server does: verify the RSA-PSS signature
        def register(self, tok, idem=None, ip=None, fast=False, route=None):
            ok = br.verify(n, e, base64.b64decode(tok["token_msg"]), base64.b64decode(tok["sig"]))
            registered.append(ok)
            return (200, {"receipt_id": secrets.token_hex(8), "arrival_ms": 1}) if ok else (400, {"error": "bad_sig"})

    P.crypto_swarm(ctx_for(Strict(sale, rec, signer=signer), rec))
    assert registered == [True], "the Python-blinded, Python-unblinded ticket must pass the server's signature check"
    assert rec.events["crypto_finalize_ok"] == 1 and rec.events["crypto_finalize_failed"] == 0 and sale.hits["link"] == 1
    assert len(signer["seen_blinded"]) == 1 and len(rec.tokens) == 1 and rec.events["crypto_local_us"] > 0
    assert len(signer["seen_blinded"][0]) == 256                         # what went on the wire was the blinded value, full key size


def test_crypto_swarm_never_turns_a_bad_server_answer_into_a_ticket():
    pytest.importorskip("cryptography")
    from cryptography.hazmat.primitives.asymmetric import rsa
    nums = rsa.generate_private_key(65537, 2048).private_numbers()
    n, e, d = nums.public_numbers.n, nums.public_numbers.e, nums.d
    enc = lambda i: base64.urlsafe_b64encode(i.to_bytes((i.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()
    signer = {"n": n, "d": d + 2, "jwk": {"kty": "RSA", "n": enc(n), "e": enc(e)}, "seen_blinded": []}     # a server with the wrong key
    rec = Rec()
    P.crypto_swarm(ctx_for(FakeClient(Sale(), rec, signer=signer), rec))
    assert rec.events["crypto_finalize_failed"] == 1 and rec.tokens == []


# ---------------------------------------------------------------- SMART_SCRAPER

SITE_JS = 'x=await api(`/drops/${id}/token`,{body:{}});y=await api(`/drops/${id}/register`,{});z=api(`/drops/${t}/claim`);u=`/drops/${e}/register-fast`;v="/drops/{id}/seats"'


def test_scraper_reads_routes_and_throws_away_shortcut_looking_ones():
    segs = P.routes_in(SITE_JS)
    assert segs == {"token", "register", "claim", "register-fast", "seats"}
    token, register, skipped = P.choose_routes(segs)
    assert (token, register, skipped) == ("token", "register", ["register-fast"])
    assert P.choose_routes(set()) == (None, None, [])
    assert not any(P.looks_like_decoy(s) for s in ("token", "register", "claim", "seats", "result", "verify", "proof"))


def test_smart_scraper_uses_only_the_canonical_route_and_still_gets_one_entry():
    P._SCRAPE.update(done=True, segs=P.routes_in(SITE_JS))              # pretend the site was already read (no website in this test)
    sale, rec = Sale(), Rec()
    P.smart_scraper(ctx_for(FakeClient(sale, rec), rec, params={"requests": 5}))
    assert set(sale.hits) == {"register"} and sale.hits["register"] == 6    # never the shortcut route
    assert rec.events["smart_decoy_route_seen"] == 1 and len(sale.entries) == 1


def test_smart_scraper_falls_back_to_the_documented_route_when_the_site_shows_nothing():
    P._SCRAPE.update(done=True, segs=set())
    sale, rec = Sale(), Rec()
    P.smart_scraper(ctx_for(FakeClient(sale, rec), rec, params={"requests": 1}))
    assert rec.events["smart_route_fallback"] == 1 and set(sale.hits) == {"register"} and len(sale.entries) == 1


# ---------------------------------------------------------------- STATE_SNIPER

def test_state_sniper_fires_inside_the_band_around_open_and_close():
    now = time.time()
    open_at, close_at = now + 1.6, now + 4.2
    sale, rec = Sale(open_at, close_at), Rec()
    b = {"open_at_s": open_at, "close_at_s": close_at}              # server clock == this machine's clock in the test
    ctxs = [ctx_for(FakeClient(sale, rec, uid), rec, boundary=b, params={"shots": 4}, uid=uid) for uid in ("t_000002", "t_000003")]   # even = opener, odd = closer
    gs = [gevent.spawn(P.state_sniper, c) for c in ctxs]
    gevent.joinall(gs, timeout=30)
    ev = rec.events
    assert ev["sniper_open_shots"] == 4 and ev["sniper_close_shots"] == 4
    assert ev["sniper_open_in_band"] == 4 and ev["sniper_close_in_band"] == 4 and ev["sniper_clock_unsynced"] == 0
    assert ev["sniper_open_http_409"] >= 1 and ev["sniper_open_http_200"] == 1          # early shots refused, exactly one ticket handed out
    assert ev["sniper_close_http_200"] >= 1 and ev["sniper_close_http_410"] >= 1        # shots before the edge accepted, after refused
    assert all(t["arrival_ms"] < close_at * 1000 + 1 for t in rec.tokens) and len(rec.tokens) == 2


def test_state_sniper_without_boundary_is_a_plain_competent_bot():
    sale, rec = Sale(), Rec()
    P.state_sniper(ctx_for(FakeClient(sale, rec), rec, boundary=None, params={"requests": 0}))
    assert rec.events["sniper_no_boundary"] == 1 and len(sale.entries) == 1


# ---------------------------------------------------------------- wiring: profiles, custom test, plan

NEW = ["CRYPTO_SWARM", "SMART_SCRAPER", "STATE_SNIPER", "CLAIM_SNIPER"]


def test_new_profiles_are_registered_with_both_flows():
    assert all(k in P.PROFILES and callable(P.PROFILES[k].fd) and callable(P.PROFILES[k].fcfs) and P.PROFILES[k].kind == "bot" for k in NEW)


def test_custom_test_accepts_the_new_bots_and_sets_up_their_needs():
    scenarios.CUSTOM["spec"] = {"people": 100, "bots": {k: 10 for k in NEW}}
    s = scenarios.ALL_RUNNABLE["custom"](1)[0]
    assert {o.profile for o in s.operators} == set(NEW) and s.claims and s.claim_sec == 10          # a claim phase exists for the claim snipers
    assert {o.profile: o.start for o in s.operators}["STATE_SNIPER"] == "boundary"
    scenarios.CUSTOM["spec"] = {"people": 100, "bots": {"SPEED_BOT": 10}}
    s2 = scenarios.ALL_RUNNABLE["custom"](1)[0]
    assert not s2.claims                                                                           # other tests are unchanged


def test_snipers_wake_before_time_zero_in_the_fair_run_but_not_in_the_fcfs_replay():
    scenarios.CUSTOM["spec"] = {"people": 50, "bots": {"STATE_SNIPER": 10}}
    s = scenarios.ALL_RUNNABLE["custom"](1)[0]
    fd = [a["offset"] for a in build_plan(s, config.POPULATION, "d")["actors"] if a["profile"] == "STATE_SNIPER"]
    s.policy = "fcfs"
    fc = [a["offset"] for a in build_plan(s, config.POPULATION, "d")["actors"] if a["profile"] == "STATE_SNIPER"]
    assert all(o < -3 for o in fd) and all(0 <= o <= 1 for o in fc)


def test_labels_for_the_new_bots_are_evaluation_only_and_carry_the_profile():
    scenarios.CUSTOM["spec"] = {"people": 20, "bots": {k: 5 for k in NEW}}
    plan = build_plan(scenarios.ALL_RUNNABLE["custom"](1)[0], config.POPULATION, "d")
    L = scenarios.labels_from_plan(plan)
    assert {l["profile"] for l in L if l["kind"] == "bot"} == set(NEW) and all(l["operator_id"] for l in L if l["kind"] == "bot")


# ---------------------------------------------------------------- the boundary score (runner.score_boundary): must be 0 when the server behaved, and must NOT be 0 when it did not

def _boundary_case(**over):
    from attack_engine.runner import score_boundary
    d = {"epoch": 3, "opened_at_ms": 1000, "closed_at_ms": 9000}
    ev = [{"seq": 12, "epoch": 3, "type": "state_changed", "payload": {"to": "LOCKED"}}, {"seq": 11, "epoch": 3, "type": "state_changed", "payload": {"to": "CLOSED"}},
          {"seq": 10, "epoch": 3, "type": "entry_registered", "payload": {}}, {"seq": 9, "epoch": 3, "type": "token_issued", "payload": {}}]
    toks = [{"receipt_id": "a", "arrival_ms": 1000}, {"receipt_id": "b", "arrival_ms": 8999}, {"receipt_id": "c", "arrival_ms": 9000}]
    bundle = {"entries": [["a", "gold"], ["b", "gold"], ["c", "gold"]], "entry_count": 3}
    inf = {"info": {"entries_registered": 3, "tokens_issued": 3}, "violations": {"missing_receipts": 0}}
    case = {"d": d, "ev": ev, "tokens": toks, "bundle": bundle, "inf": inf}
    case.update(over)
    return score_boundary(case["d"], case["ev"], case["tokens"], case["bundle"], case["inf"], {"open_at_s": 1.0, "close_at_s": 9.0, "runner_offset_s": 0.0, "runner_offset_unc_s": 0.01, "clock_synced": True}, {"sniper_open_shots": 8})


def test_boundary_score_is_zero_for_a_clean_run():
    r = _boundary_case()
    assert r["boundary_violations"] == 0 and r["all_checks_ran"] and r["entries_accepted_by_server"] == r["entries_in_sealed_list"] == 3


def test_boundary_score_catches_each_kind_of_violation():
    late = _boundary_case(tokens=[{"receipt_id": "a", "arrival_ms": 9001}, {"receipt_id": "b", "arrival_ms": 8000}, {"receipt_id": "c", "arrival_ms": 9000}])
    assert late["parts"]["accepted_outside_window"] == 1 and late["boundary_violations"] == 1                 # accepted after the recorded closing instant
    orphan = _boundary_case(bundle={"entries": [["a", "gold"], ["b", "gold"]], "entry_count": 2})
    assert orphan["parts"]["orphan_receipts"] == 1 and orphan["parts"]["sealed_count_mismatch"] == 1 and orphan["boundary_violations"] >= 2   # a receipt the sealed list lacks
    after = _boundary_case(ev=[{"seq": 14, "epoch": 3, "type": "entry_registered", "payload": {}}, {"seq": 11, "epoch": 3, "type": "state_changed", "payload": {"to": "CLOSED"}}])
    assert after["parts"]["accepted_after_closed_in_audit"] == 1 and after["boundary_violations"] == 1        # an entry logged after the CLOSED event
    unknown = _boundary_case(d={"epoch": 3})
    assert unknown["parts"]["accepted_outside_window"] is None and not unknown["all_checks_ran"]               # an old server image: reported as NOT fully checked, never as a pass


# ---------------------------------------------------------------- CLAIM_SNIPER inside the runner's claim phase (against a tiny fake of the claim rules)

class FakeResp:
    def __init__(self, code, body):
        self.status_code, self._b = code, body

    def json(self):
        return self._b


class FakeClaimServer:
    """Seat s is reserved for winner #s; when a reservation lapses the NEXT waitlisted receipt gets that same seat (claimLua/expireLua rules)."""
    def __init__(self, winners, waitlist, secs=0.8):
        self.secs, self.wl, self.res, self.owner, self.ptr = secs, list(waitlist), {}, {}, 0
        now = time.time()
        for i, r in enumerate(winners):
            self.res[r] = {"status": "reserved", "seat": i + 1, "deadline": now + secs, "promoted": False}
        self.lock = __import__("threading").Lock()

    def tick(self):
        now = time.time()
        for r, s in list(self.res.items()):
            if s["status"] == "reserved" and s["deadline"] < now:
                s["status"] = "expired"
                if self.ptr < len(self.wl):
                    self.res[self.wl[self.ptr]] = {"status": "reserved", "seat": s["seat"], "deadline": now + self.secs, "promoted": True}
                    self.ptr += 1

    def claim(self, rid):
        with self.lock:
            self.tick()
            s = self.res.get(rid)
            if not s:
                return FakeResp(403, {"error": "not_winner"})
            if s["status"] == "expired":
                return FakeResp(410, {"error": "claim_expired"})
            if s["status"] == "claimed":
                return FakeResp(200, {"seat_no": s["seat"]})
            if s["seat"] in self.owner:
                return FakeResp(409, {"error": "seat_conflict"})
            s["status"] = "claimed"; self.owner[s["seat"]] = rid
            return FakeResp(200, {"seat_no": s["seat"]})

    def pending(self):
        with self.lock:
            self.tick()
            return sum(1 for s in self.res.values() if s["status"] == "reserved")


def test_claim_sniper_hammer_takes_its_promoted_seat_and_nothing_is_double_allocated(monkeypatch):
    from attack_engine import runner
    srv = FakeClaimServer(["r1", "r2"], ["r3", "r4"])
    tok = lambda rid, kind, prof: {"receipt_id": rid, "token_msg": "tm-" + rid, "uid": "u-" + rid, "kind": kind, "op": "o", "profile": prof}
    tokens = [tok("r1", "human", "HUMAN"), tok("r2", "bot", "CLAIM_SNIPER"), tok("r3", "bot", "CLAIM_SNIPER"), tok("r4", "human", "HUMAN")]
    by_tm = {t["token_msg"]: t["receipt_id"] for t in tokens}

    def post(url, json=None, headers=None, timeout=None):
        if url.endswith("/test/login"):
            return FakeResp(200, {"token": "jwt-" + json["user_id"]})
        return srv.claim(by_tm[json["token_msg"]])

    def get(url, timeout=None):
        rid = url.rsplit("/", 1)[1]
        s = srv.res.get(rid)
        return FakeResp(200, {"outcome": "won" if s else "waitlist", "claim": {"status": s["status"]} if s else {}})

    class Api:
        base, key = "http://x/api", "k"
        def a(self, method, path, **kw):
            return {"pending": srv.pending(), "expired": 0} if path.endswith("/claims") else {}

    monkeypatch.setattr(runner.requests, "post", post)
    monkeypatch.setattr(runner.requests, "get", get)
    scn = config.Scenario("t", claim_sec=1, human_claim_rate=0.0)               # every human forfeits, so seats cascade to the waitlist
    bundle = {"tiers": [{"id": "gold", "seats": 2}], "results": {"gold": ["r1", "r2", "r3", "r4"]}}
    out = runner.claim_phase(Api(), scn, "d", bundle, tokens, __import__("random").Random(1))
    cs = out["claim_sniper"]
    assert cs["seats_claimed_by_snipers"] == 2 and cs["still_without_a_seat"] == 0                  # its own winner seat AND the promoted waitlist seat
    assert cs["seats_claimed_without_entitlement"] == 0 and cs["client_duplicate_seats"] == 0
    assert cs["answers"].get("refused_not_reserved_for_it", 0) >= 1                                 # hammering before the promotion earned a refusal, not a seat
    assert sorted(srv.owner.values()) == ["r2", "r3"] and len(srv.owner) == len(set(srv.owner.values()))
