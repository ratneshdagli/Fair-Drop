"""Scenario -> traffic plan, and the seven PRD experiments (scalable)."""
from __future__ import annotations
import random
from typing import Callable, Dict, List

from . import config
from .config import OperatorSpec, Scenario
from .operators import Operator
from .profiles import PROFILES
from .users import assign_identities, human_ip


BOUNDARY_WARMUP = -4.5     # seconds before time zero that STATE_SNIPER actors wake up (the runner opens the sale at -0.5, see runner.plan_boundary)


def arrival_offset(rng: random.Random, window: float, pattern: str) -> float:
    if pattern == "uniform" or pattern == "poisson":
        return rng.uniform(0, window)
    # rush: 60% of humans pile in right after the window opens (what real drops look like), the rest trickle
    if rng.random() < 0.6:
        return min(window, rng.expovariate(1.0 / (window * 0.08)))
    return rng.uniform(0, window)


def build_plan(scn: Scenario, population: int, drop_id: str) -> dict:
    rng = random.Random(scn.seed)
    op_ids, human_ids = assign_identities(population, [o.identities for o in scn.operators], scn.humans, scn.seed)
    tier_ids = [t["id"] for t in scn.tiers]
    bot_tier = config.BOT_TIER if config.BOT_TIER in tier_ids else tier_ids[0]
    weights = [config.HUMAN_TIER_WEIGHTS.get(t, 1.0) for t in tier_ids]
    actors, ops = [], []
    for oi, (spec, ids) in enumerate(zip(scn.operators, op_ids)):
        prof = PROFILES[spec.profile]
        params = {**prof.defaults, **spec.params}
        ops.append({"index": oi, "id": spec.id, "profile": spec.profile, "ip_pool": spec.ip_pool or prof.ip_pool, "params": params, "start": spec.start})
        for uid in ids:
            if spec.start == "boundary" and scn.policy != "fcfs":
                off = BOUNDARY_WARMUP + rng.uniform(0, 0.5)   # STATE_SNIPER: wakes early (negative = before the plan's time zero) to log in and sync its clock
            else:
                off = rng.uniform(0, 1.0) if spec.start in ("open", "boundary") else arrival_offset(rng, scn.window_sec, "uniform")
            actors.append({"uid": uid, "kind": "bot", "op": spec.id, "oi": oi, "profile": spec.profile, "offset": round(off, 3), "tier": bot_tier, "ip": ""})
    for i, uid in enumerate(human_ids):
        actors.append({"uid": uid, "kind": "human", "op": "humans", "oi": -1, "profile": "HUMAN", "offset": round(arrival_offset(rng, scn.window_sec, scn.arrival), 3),
                       "tier": rng.choices(tier_ids, weights)[0], "ip": human_ip(int(uid[2:]))})
    if scn.human_ids:                                     # tests may pin specific humans
        pass
    actors.sort(key=lambda a: a["offset"])
    return {"drop_id": drop_id, "policy": scn.policy, "scenario": scn.name, "window_sec": scn.window_sec, "actors": actors, "operators": ops}


def labels_from_plan(plan: dict) -> List[dict]:
    return [{"user_id": a["uid"], "kind": a["kind"], "operator_id": a["op"] if a["kind"] == "bot" else "", "profile": a["profile"]} for a in plan["actors"]]


# ------------------------------------------------------------------ the seven experiments

def _humans(total: int, taken: int) -> int:
    return max(0, total - taken)


def exp1(scale: float) -> List[Scenario]:
    n = int(config.POPULATION * scale)
    return [Scenario("exp1_normal_traffic", "Experiment 1 - normal traffic: every verified identity is a human, no bots. Baseline latency + integrity.",
                     humans=n, window_sec=_win(scale))]


def exp2(scale: float) -> List[Scenario]:
    n = int(config.POPULATION * scale)
    ops = [OperatorSpec(f"op{i:02d}", "PROXY_ROTATOR", 10, ip_pool=2000, params={"requests": 120}) for i in range(20)]
    return [Scenario("exp2_proxy_flood", "Experiment 2 - proxy flood: 20 operators x 10 identities, rotating through 2,000 IPs each, hammering with retries.",
                     humans=_humans(n, 200), operators=ops, window_sec=_win(scale))]


def exp3(scale: float) -> List[Scenario]:
    n = int(config.POPULATION * scale)
    out = []
    for k in (100, 1000, 10000):
        k = min(k, int(n * 0.25)) if scale < 1 else k
        out.append(Scenario("exp3_sybil_scaling", f"Experiment 3 - Sybil scaling: one operator buys {k} verified identities.", humans=_humans(n, k), tag=f"identities={k}",
                            operators=[OperatorSpec("sybil", "SYBIL_OPERATOR", k, ip_pool=5000, params={"requests": 3}, start="open")], window_sec=_win(scale)))
    return out


def exp4(scale: float) -> List[Scenario]:
    per = 2500
    ops = [OperatorSpec("flood-a", "FLOOD_BOT", 4, ip_pool=5, params={"requests": per}), OperatorSpec("flood-b", "FLOOD_BOT", 4, ip_pool=5, params={"requests": per}),
           OperatorSpec("proxy-a", "PROXY_ROTATOR", 4, ip_pool=3000, params={"requests": per}), OperatorSpec("proxy-b", "PROXY_ROTATOR", 4, ip_pool=3000, params={"requests": per}),
           OperatorSpec("retry-a", "RETRY_BOT", 4, ip_pool=100, params={"retries": per // 4})]
    return [Scenario("exp4_one_human", "Experiment 4 - the 1-human scenario: ~50,000 bot requests from 5 operators with 4 identities each, plus ONE human, 10 seats.",
                     humans=1, operators=ops, tiers=[{"id": "gold", "name": "Gold", "price_cents": 25000, "seats": 10}],
                     window_sec=30, arrival="uniform", concurrency=600, processes=2)]


def exp5(scale: float) -> List[Scenario]:
    s = max(50, int(300 * min(1.0, scale * 2)))
    ops = [OperatorSpec("scrapers", "API_SCRAPER", s, ip_pool=5, params={"fallback": 0}), OperatorSpec("ui-mimic", "UI_MIMIC", s, ip_pool=50, start="uniform")]
    return [Scenario("exp5_tarpit", "Experiment 5 - tarpit: naive API-scraping bots vs UI-mimicking bots (plus humans). Share of bots caught by the decoy endpoint.",
                     humans=max(500, int(4000 * scale)), operators=ops, window_sec=_win(scale, 40), concurrency=1500)]


def exp6(scale: float) -> List[Scenario]:
    n = max(2000, int(20000 * scale))
    return [Scenario("exp6_kill_replica", "Experiment 6 - kill replica api-2 mid-window: every signed receipt must still be in the Merkle tree.",
                     humans=n, window_sec=60, kill_replica_at_s=25, claims=True, claim_sec=8)]


def exp7(scale: float) -> List[Scenario]:
    return [Scenario("exp7_malicious_server", "Experiment 7 - malicious server: it silently drops one entry; that fan's verify page must turn red with proof.",
                     humans=max(300, int(2000 * scale)), window_sec=20, malicious=True, concurrency=800, processes=2)]


def show(scale: float) -> List[Scenario]:
    """The live-show crowd: real people plus one of every kind of bot (about 4% of the crowd), so each bot type can be watched."""
    n = int(config.POPULATION * scale)
    bots = max(70, int(n * 0.04))
    zoo = [("speed", "SPEED_BOT", 0.12, 20, {"requests": 20}, "open"), ("flood", "FLOOD_BOT", 0.08, 5, {"requests": 300}, "open"),
           ("retry", "RETRY_BOT", 0.10, 20, {"retries": 30}, "open"), ("hopper", "PROXY_ROTATOR", 0.28, 2000, {"requests": 120}, "open"),
           ("farm", "SYBIL_OPERATOR", 0.20, 1000, {"requests": 3}, "open"), ("scraper", "API_SCRAPER", 0.12, 5, {"fallback": 0}, "open"),
           ("mimic", "UI_MIMIC", 0.10, 50, {}, "uniform")]
    ops = [OperatorSpec(i, prof, max(5, int(bots * share)), ip_pool=pool, params=params, start=start) for i, prof, share, pool, params, start in zoo]
    # the four harder bots (real client-side tickets, decoy-avoiding scraper, boundary sniper, claim sniper) are in the default crowd too
    for prof, share in (("CRYPTO_SWARM", 0.08), ("SMART_SCRAPER", 0.08), ("STATE_SNIPER", 0.08), ("CLAIM_SNIPER", 0.06)):
        pr = PROFILES[prof]
        ops.append(OperatorSpec(f"show-{prof.lower().replace('_', '-')}", prof, max(5, int(bots * share)), ip_pool=pr.ip_pool, params=dict(pr.defaults), start="boundary" if prof == "STATE_SNIPER" else "open"))
    taken = sum(o.identities for o in ops)
    claims = any(o.profile == "CLAIM_SNIPER" for o in ops)
    return [Scenario("show_bot_zoo", "Live show: real people plus every kind of bot (about 5% of the crowd): speed bots, flooders, retry-spammers, address-hoppers, an identity farm, shortcut seekers, human mimics, real-ticket bots, careful scrapers, boundary snipers and seat snipers.",
                     humans=_humans(n, taken), operators=ops, claims=claims, claim_sec=10 if claims else Scenario.claim_sec, window_sec=_win(scale))]


CUSTOM = {"spec": None}   # set by the CLI (--spec) from the admin "Bot Lab": {"people": N, "bots": {PROFILE: count}}


def custom(scale: float) -> List[Scenario]:
    """Your own test: N real people plus exactly the bots you chose, how many of each kind."""
    sp = CUSTOM["spec"] or {"people": 1000, "bots": {}}
    people = max(0, int(sp.get("people", 0)))
    ops = []
    for prof, cnt in (sp.get("bots") or {}).items():
        cnt = int(cnt)
        if cnt > 0 and prof in PROFILES and prof != "HUMAN":
            pr = PROFILES[prof]
            ops.append(OperatorSpec(f"lab-{prof.lower().replace('_', '-')}", prof, cnt, ip_pool=pr.ip_pool, params=dict(pr.defaults),
                                    start="uniform" if prof == "UI_MIMIC" else "boundary" if prof == "STATE_SNIPER" else "open"))
    claims = any(o.profile == "CLAIM_SNIPER" for o in ops)     # claim snipers need a claim phase to snipe in (short reservations so expiries happen)
    total = people + sum(o.identities for o in ops)
    if total < 1 or total > config.POPULATION:
        raise SystemExit(f"a custom test needs between 1 and {config.POPULATION} accounts in total (got {total})")
    return [Scenario("custom_mix", f"Your own test: {people:,} real people plus " + (", ".join(f"{o.identities:,} {o.profile.lower().replace('_', ' ')}s" for o in ops) or "no bots") + ".",
                     humans=people, operators=ops, claims=claims, claim_sec=10 if claims else Scenario.claim_sec,
                     window_sec=float(min(600, max(15, sp.get("window") or 0)) if sp.get("window") else _win(max(0.05, total / config.POPULATION))))]


SHOWCASE: Dict[str, Callable[[float], List[Scenario]]] = {"show": show, "custom": custom}


def _win(scale: float, base: float = 60.0) -> float:
    return base if scale >= 0.5 else max(15.0, base * scale * 2)


EXPERIMENTS: Dict[str, Callable[[float], List[Scenario]]] = {"exp1": exp1, "exp2": exp2, "exp3": exp3, "exp4": exp4, "exp5": exp5, "exp6": exp6, "exp7": exp7}
ALL_RUNNABLE = {**EXPERIMENTS, **SHOWCASE}   # the seven experiments + the live-show crowd (not part of `all`)
