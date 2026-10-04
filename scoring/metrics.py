"""Fairness / scoring engine. Pure functions over (counterfactual winners, labels, request counts).

Inputs come from the server's /admin/drops/{id}/counterfactuals (FCFS, naive lottery and Fair Drop computed over the
SAME recorded attempts) plus the evaluation-only label file (user -> bot/human, operator).

Definitions (docs/FAIRNESS_METRICS.md):
  bot advantage ratio  = bot share of seats / bot share of participating verified identities   (<= 1 is the target)
  human win rate       = humans that won a seat / humans that entered
  cost per seat        = identities an operator bought * assumed identity cost / seats it won
"""
from __future__ import annotations
import random
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

Labels = Dict[str, Tuple[str, str]]  # user_id -> (kind, operator_id)

def kind_of(labels: Labels, actor: str) -> str:
    return labels.get(actor, ("unknown", ""))[0]

def operator_of(labels: Labels, actor: str) -> str:
    k, op = labels.get(actor, ("unknown", ""))
    return op or ("humans" if k == "human" else "unknown")

def policy_metrics(winners: Dict[str, List[str]], participants: Dict[str, int], labels: Labels, identity_cost: float = 3.0) -> dict:
    """winners: tier -> [actor,...] (one element per seat). participants: actor -> request count."""
    seats_by_op: Counter = Counter()
    seats_by_kind: Counter = Counter()
    seats_by_actor: Counter = Counter()
    for tier, actors in winners.items():
        for a in actors:
            seats_by_op[operator_of(labels, a)] += 1
            seats_by_kind[kind_of(labels, a)] += 1
            seats_by_actor[a] += 1
    return _assemble(seats_by_op, seats_by_kind, seats_by_actor, participants, labels, identity_cost)

def _assemble(seats_by_op, seats_by_kind, seats_by_actor, participants, labels, identity_cost) -> dict:
    ids_by_op: Counter = Counter()
    ids_by_kind: Counter = Counter()
    req_by_kind: Counter = Counter()
    for a, n in participants.items():
        ids_by_op[operator_of(labels, a)] += 1
        k = kind_of(labels, a)
        ids_by_kind[k] += 1
        req_by_kind[k] += n
    seats = sum(seats_by_kind.values())
    total_ids = sum(ids_by_kind.values())
    bot_seat_share = seats_by_kind["bot"] / seats if seats else 0.0
    bot_id_share = ids_by_kind["bot"] / total_ids if total_ids else 0.0
    bar = (bot_seat_share / bot_id_share) if bot_id_share > 0 else None
    humans_entered = ids_by_kind["human"]
    ops = {}
    for op in sorted(set(ids_by_op) | set(seats_by_op)):
        won, ids = seats_by_op[op], ids_by_op[op]
        cost = ids * identity_cost
        ops[op] = {"identities": ids, "seats": won, "seats_per_identity": (won / ids) if ids else None,
                   "identity_spend_usd": cost, "cost_per_seat_usd": (cost / won) if won else None,
                   "identities_per_seat": (ids / won) if won else None}
    return {"seats_total": seats, "seats_by_kind": dict(seats_by_kind), "seats_by_operator": dict(seats_by_op),
            "identities_by_kind": dict(ids_by_kind), "requests_by_kind": dict(req_by_kind),
            "bot_seat_share": bot_seat_share, "bot_identity_share": bot_id_share, "bot_advantage_ratio": bar,
            "humans_entered": humans_entered, "humans_won": seats_by_kind["human"],
            "human_win_rate": (seats_by_kind["human"] / humans_entered) if humans_entered else None,
            "operators": ops, "max_seats_one_actor": max(seats_by_actor.values()) if seats_by_actor else 0}

# ---------- Monte Carlo: expected outcome over many random draws on the SAME entries ----------
# A single draw is noisy (500 seats, a few bots). Re-drawing with fresh randomness over the identical entry /
# attempt multiset gives the expected seats per operator and each actor's win probability.

def _expected(tickets_by_tier: Dict[str, Dict[str, int]], tiers: List[dict], cap: int, k: int, seed: int):
    rng = random.Random(seed)
    seats_by_actor: Counter = Counter()
    for t in tiers:
        counts = tickets_by_tier.get(t["id"], {})
        if not counts or t["seats"] <= 0:
            continue
        actors = list(counts)
        pool: List[int] = []
        for i, a in enumerate(actors):
            pool.extend([i] * counts[a])
        for _ in range(k):
            rng.shuffle(pool)
            per: Counter = Counter(); left = t["seats"]
            for i in pool:
                if per[i] < cap:
                    per[i] += 1; seats_by_actor[actors[i]] += 1; left -= 1
                    if left == 0:
                        break
    return {a: n / k for a, n in seats_by_actor.items()}

def expected_policy_metrics(tickets_by_tier, tiers, cap, participants, labels, identity_cost=3.0, k=200, seed=1) -> dict:
    exp = _expected(tickets_by_tier, tiers, cap, k, seed)
    by_op: Counter = Counter(); by_kind: Counter = Counter()
    for a, v in exp.items():
        by_op[operator_of(labels, a)] += v; by_kind[kind_of(labels, a)] += v
    m = _assemble(by_op, by_kind, Counter(exp), participants, labels, identity_cost)
    m["monte_carlo_draws"] = k
    m["win_probability"] = {a: v for a, v in exp.items()}   # expected seats (== probability when cap = 1)
    return m

# ---------- whole experiment ----------

def score_counterfactuals(cf: dict, labels: Labels, identity_cost: float = 3.0, mc_draws: int = 200, seed: int = 1) -> dict:
    tiers = cf["tiers"]
    cap = cf["max_per_account"]
    participants = cf["attempts_by_actor"]
    out = {}
    for pol in ("fcfs", "naive", "fairdrop"):
        winners = {t: [w["actor"] for w in ws] for t, ws in cf["policies"][pol].items()}
        out[pol] = policy_metrics(winners, participants, labels, identity_cost)
    # fair drop: one entry per verified identity -> cap 1 over the entry multiset; naive: every request is a ticket
    out["naive_expected"] = expected_policy_metrics(cf["attempts_by_tier_actor"], tiers, cap, participants, labels, identity_cost, mc_draws, seed)
    out["fairdrop_expected"] = expected_policy_metrics(cf["entries_by_tier_actor"], tiers, 1, participants, labels, identity_cost, mc_draws, seed)
    return out

def human_chance(cf: dict, actor: str, mc: dict) -> dict:
    """Probability a specific human wins under each policy (exp 4: the 1-human scenario)."""
    fc = sum(1 for ws in cf["policies"]["fcfs"].values() for w in ws if w["actor"] == actor)
    return {"fcfs_seats_actual": fc, "naive_expected_seats": mc["naive_expected"]["win_probability"].get(actor, 0.0),
            "fairdrop_expected_seats": mc["fairdrop_expected"]["win_probability"].get(actor, 0.0),
            "fairdrop_actual_seats": sum(1 for ws in cf["policies"]["fairdrop"].values() for w in ws if w["actor"] == actor)}

def percentile(xs: List[float], p: float) -> float:
    if not xs:
        return 0.0
    xs = sorted(xs); i = min(len(xs) - 1, int(len(xs) * p / 100.0))
    return xs[i]

def latency_table(rec: Dict[str, dict], duration_s: float) -> Dict[str, dict]:
    """rec: endpoint -> {"n": int, "status": {code: n}, "lat": [ms...]} (merged across workers)."""
    out = {}
    for ep, r in rec.items():
        st = r["status"]; n = sum(st.values())
        err = sum(c for s, c in st.items() if int(s) == 0 or int(s) >= 500)
        rej = sum(c for s, c in st.items() if int(s) in (400, 403, 409, 410, 429))
        out[ep] = {"requests": n, "p50_ms": percentile(r["lat"], 50), "p95_ms": percentile(r["lat"], 95), "p99_ms": percentile(r["lat"], 99),
                   "errors": err, "error_rate": err / n if n else 0.0, "rejected_by_design": rej,
                   "rps": n / duration_s if duration_s > 0 else 0.0, "status": st}
    return out
