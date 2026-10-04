"""Bot / human behaviour profiles. Each profile has a Fair Drop flow and an FCFS flow, so the very same actors can
be replayed against either policy. Bots are NOT written to lose: they are fast, persistent, and (where the profile
says so) rotate IPs freely.

  HUMAN          realistic delays, one attempt, polite retries
  SPEED_BOT      fires the instant the window opens, no think time, hammers retries
  FLOOD_BOT      one identity, hundreds of rapid mixed requests (token, register, browse)
  RETRY_BOT      repeats register with the same idempotency key, also races duplicates concurrently
  PROXY_ROTATOR  few identities, a fresh IP on every request (thousands of IPs)
  SYBIL_OPERATOR many verified identities, each doing a competent fast flow behind a big IP pool
  API_SCRAPER    naive: finds the hidden 'fast' endpoint and uses it (tarpit); never speaks the real flow
  UI_MIMIC       drives the real flow with browser-like page loads and human-ish pacing

Added after an outside review (each is judged against the real code in docs/RED_TEAM.md; none is written to lose):
  CRYPTO_SWARM   does the REAL RFC 9474 blinding itself (pure Python) and uses POST /token instead of the test-token shortcut
  SMART_SCRAPER  reads the site's HTML/JS, drops any route that smells like a shortcut (a decoy), uses the canonical flow fast
  STATE_SNIPER   syncs to the server clock (Date header) and bursts requests within +-200 ms of the sale opening / closing
  CLAIM_SNIPER   enters normally; the runner then hammers /claim for its receipts all through the claim phase
"""
from __future__ import annotations
import base64
import random
import re
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Callable, Dict, Optional

import gevent
from gevent.lock import Semaphore

from . import blindrsa, timesync


@dataclass
class Ctx:
    c: object            # FDClient
    actor: dict          # plan entry
    op: object           # Operator or None (humans)
    p: dict              # profile params
    rng: random.Random
    rec: object          # Recorder
    tier: str
    boundary: Optional[dict] = None   # STATE_SNIPER only: when the runner opens/closes the sale, in SERVER clock seconds

    def ip_any(self) -> str:
        return self.op.ip(self.rng.randrange(max(1, self.op.ip_pool))) if self.op else self.c.ip

    def think(self, lo: float, hi: float):
        gevent.sleep(self.rng.uniform(lo, hi))

    def ev(self, name: str):
        self.rec.events[name] += 1


RETRYABLE = (0, 429, 502, 503, 504)


def retry(ctx: Ctx, fn: Callable, tries: int, lo: float, hi: float, ok=(200,)):
    code, data = 0, None
    for i in range(tries):
        code, data = fn()
        if code in ok or code not in RETRYABLE:
            break
        ctx.ev(f"retry_{code}")
        gevent.sleep(ctx.rng.uniform(lo, hi) * (1 + i * 0.25))
    return code, data


def keep(ctx: Ctx, tok: dict, resp: dict):
    ctx.rec.tokens.append({"uid": ctx.actor["uid"], "kind": ctx.actor["kind"], "op": ctx.actor["op"], "profile": ctx.actor["profile"],
                           "token_msg": tok["token_msg"], "sig": tok["sig"], "tier": tok["tier"], "receipt_id": resp["receipt_id"],
                           "arrival_ms": resp.get("arrival_ms")})


def _login(ctx, tries=6, lo=0.3, hi=1.0) -> bool:
    code, _ = retry(ctx, ctx.c.login, tries, lo, hi)
    if code != 200:
        ctx.ev(f"login_failed_{code}")
    return code == 200


def _token(ctx, tries=6, lo=0.3, hi=1.2, ip=None):
    code, d = retry(ctx, lambda: ctx.c.test_token(ctx.tier, ip=ip), tries, lo, hi)
    if code != 200:
        ctx.ev(f"token_failed_{code}")
        return None
    return d


def _register(ctx, tok, tries=6, lo=0.3, hi=1.2, idem=None, ip=None, fast=False, route=None):
    idem = idem or uuid.uuid4().hex
    code, d = retry(ctx, lambda: ctx.c.register(tok, idem=idem, ip=ip, fast=fast, route=route), tries, lo, hi)
    if code == 200 and not fast:
        keep(ctx, tok, d)
    elif code != 200:
        ctx.ev(f"register_failed_{code}")
    return code, d


# ----------------------------------------------------------------- Fair Drop flows

def human(ctx: Ctx):
    if not _login(ctx):
        return
    ctx.c.browse(); ctx.think(0.4, 2.0)
    tok = _token(ctx, tries=6, lo=0.5, hi=2.0)
    if not tok:
        return
    ctx.think(0.2, 1.2)
    _register(ctx, tok, tries=6, lo=0.5, hi=2.0)


def speed_bot(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    idem = uuid.uuid4().hex
    code, _ = _register(ctx, tok, tries=60, lo=0.02, hi=0.1, idem=idem, ip=ctx.ip_any())
    for _ in range(int(ctx.p.get("requests", 20))):       # hammer: more requests = more chances (in a naive lottery)
        ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any())


def flood_bot(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if tok:
        _register(ctx, tok, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    for i in range(int(ctx.p.get("requests", 300))):
        ip = ctx.ip_any() if i % 5 == 0 else None
        r = ctx.rng.random()
        if tok and r < 0.6:
            ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ip)
        elif r < 0.8:
            ctx.c.test_token(ctx.tier, ip=ip)
        else:
            ctx.c.browse()


def retry_bot(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    idem = uuid.uuid4().hex
    first, resp = _register(ctx, tok, tries=60, lo=0.02, hi=0.1, idem=idem, ip=ctx.ip_any())
    for _ in range(int(ctx.p.get("retries", 30))):
        # simulate "timeout, retry" + racing duplicates (the idempotency / spent-token set must collapse them)
        gs = [gevent.spawn(ctx.c.register, tok, idem, ctx.ip_any()) for _ in range(3)]
        gevent.joinall(gs, timeout=10)
        ctx.c.test_token(ctx.tier)            # and retries the token request too (409 already_issued)
        gevent.sleep(ctx.rng.uniform(0, 0.05))


def proxy_rotator(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    first = True
    for _ in range(int(ctx.p.get("requests", 120))):    # a brand-new IP every single request: never rate limited
        code, d = ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any())
        if code == 200 and first:
            keep(ctx, tok, d); first = False
        if ctx.rng.random() < 0.1:
            ctx.c.test_token(ctx.tier, ip=ctx.ip_any())  # also tries to mint more tokens from other IPs


def sybil_operator(ctx: Ctx):
    if not _login(ctx, tries=30, lo=0.02, hi=0.2):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.2, ip=ctx.ip_any())
    if not tok:
        return
    _register(ctx, tok, tries=60, lo=0.02, hi=0.2, ip=ctx.ip_any())
    for _ in range(int(ctx.p.get("requests", 3))):
        ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any())


def api_scraper(ctx: Ctx):
    """Naive scraper: read the 'API', found the faster-looking endpoint, used it. Honest limit: only catches bots that bite."""
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    code, d = ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any(), fast=True)
    if code == 200:
        ctx.ev("tarpit_receipt")                   # bot believes it is in
    elif ctx.p.get("fallback", 0):
        _register(ctx, tok, tries=20, lo=0.05, hi=0.2, ip=ctx.ip_any())


def ui_mimic(ctx: Ctx):
    """Drives only the documented UI flow with browser-like page loads and human-ish pacing."""
    if not _login(ctx, tries=10, lo=0.3, hi=1.0):
        return
    ctx.c.req("GET", "/drops", "GET /drops", auth=False); ctx.think(0.3, 1.0)
    ctx.c.browse(); ctx.think(0.3, 1.0)
    ctx.c.req("GET", f"/drops/{ctx.c.drop}/seats", "GET /drops/{id}/seats", auth=False); ctx.think(0.5, 1.5)
    tok = _token(ctx, tries=10, lo=0.3, hi=1.0)
    if not tok:
        return
    ctx.think(0.3, 1.2)
    _register(ctx, tok, tries=10, lo=0.3, hi=1.0)


# ----------------------------------------------------------------- CRYPTO_SWARM: the real blind-signature path

b64 = lambda b: base64.b64encode(b).decode()


def _local_cost(ctx, t0: float):
    ctx.rec.events["crypto_local_us"] += int((time.perf_counter() - t0) * 1e6)    # the bot's own CPU time spent on the maths


def crypto_swarm(ctx: Ctx):
    """Exactly what the browser does (frontend/app/enter/[id]/page.tsx), minus the browser: read the drop page for the public key,
    make a random token, blind it locally, POST /token, unblind, then POST /register. No server-side shortcut anywhere."""
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    code, drop = ctx.c.browse()
    if code != 200 or not drop:
        ctx.ev(f"drop_info_failed_{code}")
        return
    msg = secrets.token_bytes(32)
    t0 = time.perf_counter()
    if drop.get("token_mode") == "plain":                      # the documented fallback: the token goes unblinded
        ctx.ev("crypto_plain_mode")
        blinded, finish = msg, (lambda s: s)
    else:
        n, e = blindrsa.pub_from_jwk(drop["public_key_jwk"])
        blinded, inv = blindrsa.blind(n, e, msg)
        finish = lambda s: blindrsa.finalize(n, e, msg, s, inv)
    _local_cost(ctx, t0)
    idem, bb = uuid.uuid4().hex, b64(blinded)
    code, bs = retry(ctx, lambda: ctx.c.token(bb, ctx.tier, idem=idem, ip=ctx.ip_any()), 60, 0.02, 0.1)
    if code != 200 or not bs:
        ctx.ev(f"token_failed_{code}")
        return
    t0 = time.perf_counter()
    try:
        sig = finish(base64.b64decode(bs["blind_sig"]))
    except (ValueError, KeyError):                             # would mean the server signed garbage or the maths is wrong: never hide it
        ctx.ev("crypto_finalize_failed")
        return
    _local_cost(ctx, t0)
    ctx.ev("crypto_finalize_ok")
    tok = {"token_msg": b64(msg), "sig": b64(sig), "tier": ctx.tier}
    lc, _ = ctx.c.link(tok["token_msg"])                       # evaluation only (TEST_MODE): lets the scorer credit this account's entry
    if lc != 200:
        ctx.ev(f"link_failed_{lc}")
    _register(ctx, tok, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())


# ----------------------------------------------------------------- SMART_SCRAPER: reads the site, skips the decoy

DECOY_WORDS = ("fast", "quick", "express", "instant", "turbo", "bypass", "skip", "vip")
ROUTE_RE = re.compile(r"/drops/(?:\$\{[^}]*\}|\{[^}]*\}|:[A-Za-z_]+)/([a-z][a-z0-9-]*)")     # /drops/${id}/token -> "token"
SCRIPT_RE = re.compile(r'(?:src|href)="(/_next/static/[^"]+\.js)')
_SCRAPE = {"lock": Semaphore(1), "done": False, "segs": set()}


def routes_in(text: str) -> set:
    return set(ROUTE_RE.findall(text or ""))


def looks_like_decoy(seg: str) -> bool:
    return any(w in seg for w in DECOY_WORDS)


def choose_routes(segs) -> tuple:
    """(token route, register route, routes thrown away as decoy-like) out of what the scraper found."""
    kept = sorted(s for s in segs if not looks_like_decoy(s))
    return ("token" if "token" in kept else None), ("register" if "register" in kept else None), sorted(s for s in segs if looks_like_decoy(s))


def _scrape(ctx: Ctx) -> set:
    """Read the site once per process (a scraper author does it once, then runs many workers): HTML of two pages, then the scripts they load."""
    with _SCRAPE["lock"]:
        if not _SCRAPE["done"]:
            segs, urls = set(), []
            try:
                for page in ("/", f"/enter/{ctx.c.drop}"):
                    _, html = ctx.c.site_get(page, "GET site page (scraper)")
                    segs |= routes_in(html)
                    urls += [u for u in SCRIPT_RE.findall(html) if u not in urls]
                for u in urls[:15]:
                    _, js = ctx.c.site_get(u, "GET site script (scraper)")
                    segs |= routes_in(js)
            except Exception:
                pass
            _SCRAPE["segs"], _SCRAPE["done"] = segs, True
    return _SCRAPE["segs"]


def smart_scraper(ctx: Ctx):
    """The scraper that does NOT bite: finds the routes, discards anything shortcut-like, and runs the canonical flow fast from many addresses.
    Tickets still come from test-token (the harness's shortcut, same as every other bot); CRYPTO_SWARM covers the real ticket path."""
    segs = _scrape(ctx)
    _, reg, skipped = choose_routes(segs)
    ctx.ev("smart_routes_found" if segs else "smart_nothing_found")
    if skipped:
        ctx.ev("smart_decoy_route_seen")
    if not reg:                                                # nothing usable on the site: fall back to the documented API
        ctx.ev("smart_route_fallback")
        reg = "register"
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
    if not tok:
        return
    _register(ctx, tok, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any(), route=reg)
    for _ in range(int(ctx.p.get("requests", 10))):            # fast repeats from fresh addresses: more chances in a naive lottery
        ctx.c.register(tok, idem=uuid.uuid4().hex, ip=ctx.ip_any(), route=reg)


# ----------------------------------------------------------------- STATE_SNIPER: fires at the open / close boundaries

_SYNC = {"lock": Semaphore(1), "done": False, "val": None}


def _clock(ctx: Ctx):
    """(offset_s, uncertainty_s) of the server clock against ours, from the Date header; estimated once per process."""
    with _SYNC["lock"]:
        if not _SYNC["done"]:
            _SYNC["val"], _SYNC["done"] = timesync.estimate_offset(ctx.c.server_date, gevent.sleep), True
    return _SYNC["val"]


def _burst(ctx: Ctx, at_local: float, side: str, fire: Callable, shots: int, span: float = 0.2):
    """`shots` concurrent requests, spread evenly over [at - span, at + span]; counts how many really left inside the band."""
    out = []

    def one(k):
        t = at_local - span + 2 * span * k / max(1, shots - 1)
        gevent.sleep(max(0.0, t - time.time()))
        sent = time.time()
        res = fire(k)
        out.append(res)
        ctx.ev(f"sniper_{side}_shots")
        ctx.ev(f"sniper_{side}_{'in_band' if abs(sent - at_local) <= span + 0.05 else 'out_of_band'}")
        ctx.ev(f"sniper_{side}_http_{res[0]}")

    gevent.joinall([gevent.spawn(one, k) for k in range(shots)], timeout=30)
    return out


def state_sniper(ctx: Ctx):
    """Half of the snipers go for the OPENING (a burst of ticket requests around the instant the sale opens), half for the CLOSING (hold a
    ticket, then a burst of entries around the instant it closes). The times come from the runner as server-clock seconds; the sniper
    converts them to its own clock with a Date-header estimate (so a skewed server clock would not fool it)."""
    b = ctx.boundary
    if not b:                                                  # not run through the runner hook: behave as a plain competent bot
        ctx.ev("sniper_no_boundary")
        return sybil_operator(ctx)
    if not _login(ctx, tries=30, lo=0.02, hi=0.1):
        return
    est = _clock(ctx)
    if not est:
        ctx.ev("sniper_clock_unsynced")
    off = est[0] if est else 0.0
    try:
        close_side = int(ctx.actor["uid"].split("_")[-1]) % 2 == 1
    except ValueError:
        close_side = ctx.rng.random() < 0.5
    shots = int(ctx.p.get("shots", 8))
    if close_side:
        close_local = b["close_at_s"] - off
        gevent.sleep(max(0.0, close_local - 2.0 - time.time()))
        tok = _token(ctx, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())
        if not tok:
            ctx.ev("sniper_close_no_token")
            return
        idem, seen = uuid.uuid4().hex, set()

        def fire(k):
            if k % 4 == 3:                                     # asks for a second ticket right at the edge (refused: one per person)
                return ctx.c.test_token(ctx.tier, ip=ctx.ip_any())
            res = ctx.c.register(tok, idem=idem if k % 2 == 0 else uuid.uuid4().hex, ip=ctx.ip_any())
            if res[0] == 200 and res[1] and res[1]["receipt_id"] not in seen:
                seen.add(res[1]["receipt_id"])
                keep(ctx, tok, res[1])
            return res
        _burst(ctx, close_local, "close", fire, shots)
    else:
        res = _burst(ctx, b["open_at_s"] - off, "open", lambda k: ctx.c.test_token(ctx.tier, ip=ctx.ip_any()), shots)
        tok = next((d for c, d in res if c == 200 and d), None)
        if tok is None:                                        # every shot landed before the opening: a real sniper keeps trying
            for _ in range(40):
                c, d = ctx.c.test_token(ctx.tier, ip=ctx.ip_any())
                if c == 200:
                    tok = d
                    ctx.ev("sniper_open_needed_retry")
                    break
                if c == 410:
                    break
                gevent.sleep(0.05)
        if not tok:
            ctx.ev("sniper_open_no_token")
            return
        _register(ctx, tok, tries=60, lo=0.02, hi=0.1, ip=ctx.ip_any())


# ----------------------------------------------------------------- CLAIM_SNIPER

def claim_sniper(ctx: Ctx):
    """Enters like a competent fast bot. What makes it a claim sniper happens later: runner.claim_phase hammers /claim for its receipts
    for the whole claim phase (that is where claims are orchestrated), so it takes any seat promoted to it within ~50 ms."""
    if not _login(ctx, tries=30, lo=0.02, hi=0.2):
        return
    tok = _token(ctx, tries=60, lo=0.02, hi=0.2, ip=ctx.ip_any())
    if tok:
        _register(ctx, tok, tries=60, lo=0.02, hi=0.2, ip=ctx.ip_any())


# ----------------------------------------------------------------- FCFS flows (same actors, classic sale)

def _buy_loop(ctx: Ctx, attempts: int, rotate: bool, lo: float, hi: float):
    got = 0
    for i in range(attempts):
        code, d = ctx.c.buy(ctx.tier, ip=ctx.ip_any() if rotate else None)
        if code == 200:
            got += 1; ctx.rec.tokens.append({"uid": ctx.actor["uid"], "kind": ctx.actor["kind"], "op": ctx.actor["op"], "seat_no": d["seat_no"], "tier": ctx.tier})
        elif code == 409 and d and d.get("error") in ("limit_reached", "sold_out"):
            break
        elif code == 410:
            break
        if hi > 0:
            gevent.sleep(ctx.rng.uniform(lo, hi))
    return got


def fcfs_human(ctx: Ctx):
    if not _login(ctx, tries=6, lo=0.3, hi=1.0):
        return
    ctx.c.browse(); ctx.think(0.4, 2.0)
    for _ in range(6):                      # a human clicks "buy" a few times if the page is slow
        code, d = ctx.c.buy(ctx.tier)
        if code == 200:
            ctx.rec.tokens.append({"uid": ctx.actor["uid"], "kind": "human", "op": ctx.actor["op"], "seat_no": d["seat_no"], "tier": ctx.tier}); break
        if code in (409, 410):
            break
        gevent.sleep(ctx.rng.uniform(0.5, 2.0))


def fcfs_bot(rotate: bool, default_attempts: int):
    def run(ctx: Ctx):
        if not _login(ctx, tries=30, lo=0.02, hi=0.1):
            return
        _buy_loop(ctx, int(ctx.p.get("requests", default_attempts)), rotate, 0.0, 0.0)
    return run


def fcfs_ui_mimic(ctx: Ctx):
    if not _login(ctx, tries=10, lo=0.3, hi=1.0):
        return
    ctx.c.browse(); ctx.think(0.3, 1.0)
    _buy_loop(ctx, 10, False, 0.5, 1.5)


@dataclass
class Profile:
    fd: Callable
    fcfs: Callable
    defaults: Dict[str, float]
    kind: str = "bot"
    ip_pool: int = 20


PROFILES: Dict[str, Profile] = {
    "HUMAN": Profile(human, fcfs_human, {}, "human", 1),
    "SPEED_BOT": Profile(speed_bot, fcfs_bot(True, 200), {"requests": 20}, "bot", 20),
    "FLOOD_BOT": Profile(flood_bot, fcfs_bot(False, 400), {"requests": 300}, "bot", 5),
    "RETRY_BOT": Profile(retry_bot, fcfs_bot(True, 100), {"retries": 30}, "bot", 20),
    "PROXY_ROTATOR": Profile(proxy_rotator, fcfs_bot(True, 400), {"requests": 120}, "bot", 2000),
    "SYBIL_OPERATOR": Profile(sybil_operator, fcfs_bot(True, 60), {"requests": 3}, "bot", 1000),
    "API_SCRAPER": Profile(api_scraper, fcfs_bot(False, 100), {"fallback": 0}, "bot", 5),
    "UI_MIMIC": Profile(ui_mimic, fcfs_ui_mimic, {}, "bot", 50),
    "CRYPTO_SWARM": Profile(crypto_swarm, fcfs_bot(True, 100), {}, "bot", 200),
    "SMART_SCRAPER": Profile(smart_scraper, fcfs_bot(True, 200), {"requests": 10}, "bot", 2000),
    "STATE_SNIPER": Profile(state_sniper, fcfs_bot(True, 100), {"shots": 8}, "bot", 20),
    "CLAIM_SNIPER": Profile(claim_sniper, fcfs_bot(True, 100), {}, "bot", 20),
}
