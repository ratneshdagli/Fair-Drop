"""Per-experiment reports: results.json, results.csv, latency.csv, summary.md, charts/*.png, and a copy pushed to the
backend (POST /test/experiments) so the admin Fairness panel shows REAL recorded data."""
from __future__ import annotations
import copy
import csv
import json
import os
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt   # noqa: E402

POLS = [("fcfs", "FCFS (actual)"), ("naive_expected", "Naive lottery (E over draws)"), ("fairdrop_expected", "Fair Drop (E over draws)")]
COL = {"fcfs": "#d1495b", "naive_expected": "#edae49", "fairdrop_expected": "#2a9d8f", "fairdrop": "#1d6f65", "naive": "#edae49", "fcfs_live": "#9d1c2c"}


def _slim(res: dict) -> dict:
    r = copy.deepcopy(res)
    for p in r.get("policies", {}).values():
        wp = p.pop("win_probability", None)
        if wp:
            p["top_win_probability"] = dict(sorted(wp.items(), key=lambda kv: -kv[1])[:20])
    return r


def _f(x, d=3):
    return "n/a" if x is None else (f"{x:.{d}f}" if isinstance(x, float) else str(x))


def headline(res: dict) -> dict:
    P = res.get("policies", {})
    g = lambda k, f: (P.get(k) or {}).get(f)
    integ = res.get("integrity", {})
    h = {"policy": res["meta"]["policy"], "tag": res["meta"].get("tag", ""), "actors": res["meta"]["actors"], "humans": res["traffic"]["humans"], "bot_identities": res["traffic"]["bot_identities"],
         "duration_s": res["meta"]["duration_s"], "client_requests": res["traffic"]["client_requests"],
         "bot_advantage_ratio": {"fcfs": g("fcfs", "bot_advantage_ratio"), "naive": g("naive_expected", "bot_advantage_ratio"), "fairdrop": g("fairdrop_expected", "bot_advantage_ratio"),
                                 "fcfs_live": g("fcfs_live", "bot_advantage_ratio")},
         "human_win_rate": {"fcfs": g("fcfs", "human_win_rate"), "naive": g("naive_expected", "human_win_rate"), "fairdrop": g("fairdrop_expected", "human_win_rate"),
                            "fcfs_live": g("fcfs_live", "human_win_rate")},
         "bot_seat_share": {"fcfs": g("fcfs", "bot_seat_share"), "naive": g("naive_expected", "bot_seat_share"), "fairdrop": g("fairdrop_expected", "bot_seat_share"),
                            "fcfs_live": g("fcfs_live", "bot_seat_share")},
         "integrity_ok": integ.get("ok"), "integrity_violations": integ.get("violations"),
         "verified_by_reference_verifier": (res.get("verification") or {}).get("reference_verifier_ok"),
         "p99_ms": {k.split(" ", 1)[-1]: v["p99_ms"] for k, v in res["latency"].items() if "register" in k or "token" in k or "buy" in k}}
    ex = res.get("extras", {})
    if "boundary" in ex:                      # STATE_SNIPER run: must be 0
        h["boundary_violations"] = ex["boundary"]["boundary_violations"]
    if "claim_sniper" in ex:                  # CLAIM_SNIPER run: must be 0
        h["double_allocated_seats"] = ex["claim_sniper"]["double_allocated_seats"]
    return h


def finish(res: dict, out: str) -> dict:
    os.makedirs(os.path.join(out, "charts"), exist_ok=True)
    res["headline"] = headline(res)
    json.dump(res, open(os.path.join(out, "results.json"), "w"), indent=1, default=str)
    _csv(res, out)
    try:
        _charts(res, out)
    except Exception as e:      # charts must never lose the data
        print("chart error:", e)
    open(os.path.join(out, "summary.md"), "w", encoding="utf8").write(_summary(res))
    try:
        from .auth import Api
        Api().req("POST", "/test/experiments", json={"id": f"{res['meta']['experiment']}-{res['meta'].get('tag', '') or 'run'}-{res['meta']['policy']}-{int(time.time())}".replace("=", ""),
                                                      "name": res["meta"]["experiment"] + (f" [{res['meta']['tag']}]" if res["meta"].get("tag") else "") + (" (live FCFS)" if res["meta"]["policy"] == "fcfs" else ""),
                                                      "result": _slim(res)})
    except Exception as e:
        print("could not push result to backend:", e)
    print(f"report written: {out}")
    return res


def _csv(res, out):
    with open(os.path.join(out, "results.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["policy", "operator", "identities", "seats", "seats_per_identity", "identity_spend_usd", "cost_per_seat_usd", "identities_per_seat"])
        for pol, m in res["policies"].items():
            for op, o in m["operators"].items():
                w.writerow([pol, op, o["identities"], round(o["seats"], 3), o["seats_per_identity"], o["identity_spend_usd"], o["cost_per_seat_usd"], o["identities_per_seat"]])
    with open(os.path.join(out, "latency.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["endpoint", "requests", "rps", "p50_ms", "p95_ms", "p99_ms", "errors", "error_rate", "rejected_by_design"])
        for ep, v in res["latency"].items():
            w.writerow([ep, v["requests"], round(v["rps"], 1), v["p50_ms"], v["p95_ms"], v["p99_ms"], v["errors"], round(v["error_rate"], 5), v["rejected_by_design"]])


def _top_ops(res, keys, n=10):
    ops = {}
    for pol in keys:
        for op, o in res["policies"].get(pol, {}).get("operators", {}).items():
            ops[op] = max(ops.get(op, 0), o["seats"])
    humans = "humans"
    top = sorted((o for o in ops if o != humans), key=lambda o: -ops[o])[:n]
    return top + ([humans] if humans in ops else [])


def _charts(res, out):
    ch = os.path.join(out, "charts")
    P = res["policies"]
    pols = [(k, l) for k, l in POLS if k in P] + ([("fcfs_live", "FCFS (live run)")] if "fcfs_live" in P else [])
    # 1 seats by operator
    ops = _top_ops(res, [k for k, _ in pols])
    fig, ax = plt.subplots(figsize=(max(7, len(ops) * 1.1), 4.2))
    wd = 0.8 / max(1, len(pols))
    for i, (k, l) in enumerate(pols):
        ax.bar([j + i * wd for j in range(len(ops))], [P[k]["operators"].get(o, {}).get("seats", 0) for o in ops], wd, label=l, color=COL.get(k))
    ax.set_xticks([j + wd * (len(pols) - 1) / 2 for j in range(len(ops))]); ax.set_xticklabels(ops, rotation=30, ha="right")
    ax.set_ylabel("seats won"); ax.set_title("Seats per operator (same traffic, three policies)"); ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(ch, "seats_by_operator.png"), dpi=130); plt.close(fig)
    # 2 bot share vs identity share, 3 BAR, 4 human win rate
    for fname, key, title, line in (("bot_share.png", "bot_seat_share", "Bot share of seats (dashed = bot share of identities)", True),
                                    ("bot_advantage_ratio.png", "bot_advantage_ratio", "Bot advantage ratio (<= 1 is the target)", False),
                                    ("human_win_rate.png", "human_win_rate", "Human win rate (humans won / humans entered)", False)):
        fig, ax = plt.subplots(figsize=(6.5, 3.8))
        vals = [P[k].get(key) or 0 for k, _ in pols]
        ax.bar([l.replace(" (", "\n(") for _, l in pols], vals, color=[COL.get(k) for k, _ in pols])
        for i, v in enumerate(vals):
            ax.text(i, v, f"{v:.3f}", ha="center", va="bottom", fontsize=8)
        if line and pols:
            ax.axhline(P[pols[0][0]]["bot_identity_share"], ls="--", color="k", lw=1)
        if key == "bot_advantage_ratio":
            ax.axhline(1.0, ls="--", color="k", lw=1)
        ax.set_title(title, fontsize=10); fig.tight_layout(); fig.savefig(os.path.join(ch, fname), dpi=130); plt.close(fig)
    # 5 latency
    L = {k: v for k, v in res["latency"].items() if v["requests"] > 20}
    if L:
        names = sorted(L, key=lambda k: -L[k]["requests"])[:8]
        fig, ax = plt.subplots(figsize=(8, 3.8)); w = 0.27
        for i, (f, c) in enumerate((("p50_ms", "#7fb3d5"), ("p95_ms", "#3b82c4"), ("p99_ms", "#1b3a6b"))):
            ax.bar([j + i * w for j in range(len(names))], [L[n][f] for n in names], w, label=f[:3], color=c)
        ax.set_xticks([j + w for j in range(len(names))]); ax.set_xticklabels([n.replace("POST ", "").replace("GET ", "") for n in names], rotation=25, ha="right", fontsize=8)
        ax.set_ylabel("ms"); ax.set_title("Client-observed latency by endpoint"); ax.legend(); fig.tight_layout(); fig.savefig(os.path.join(ch, "latency.png"), dpi=130); plt.close(fig)
    # 6 cost per seat (bots)
    bots = [o for o in P[pols[0][0]]["operators"] if o != "humans" and o != "unknown"][:12]
    if bots:
        fig, ax = plt.subplots(figsize=(max(6, len(bots) * 1.0), 3.8)); wd = 0.8 / max(1, len(pols))
        for i, (k, l) in enumerate(pols):
            ax.bar([j + i * wd for j in range(len(bots))], [(P[k]["operators"].get(o, {}).get("cost_per_seat_usd") or 0) for o in bots], wd, label=l, color=COL.get(k))
        ax.set_xticks([j + wd * (len(pols) - 1) / 2 for j in range(len(bots))]); ax.set_xticklabels(bots, rotation=30, ha="right")
        ax.set_ylabel("USD per seat (0 = no seat won)"); ax.set_title(f"Identity cost per seat (assumed ${res['meta']['identity_cost_usd']}/identity)"); ax.legend(fontsize=8)
        fig.tight_layout(); fig.savefig(os.path.join(ch, "cost_per_seat.png"), dpi=130); plt.close(fig)
    # 7 requests by kind
    rk = res["traffic"].get("attempts_by_kind") or {}
    if rk:
        fig, ax = plt.subplots(figsize=(5, 3.5)); ax.bar(list(rk), list(rk.values()), color="#6c757d"); ax.set_title("Recorded entry attempts by actor kind")
        fig.tight_layout(); fig.savefig(os.path.join(ch, "requests_by_kind.png"), dpi=130); plt.close(fig)


def sybil_aggregate(results: list, out: str):
    rows = []
    for r in results:
        k = r["meta"]["scenario"]["operators"][0]["identities"]
        P = r["policies"]
        row = {"identities": k}
        for pol in ("fcfs", "naive_expected", "fairdrop_expected"):
            o = P[pol]["operators"].get("sybil", {})
            row[f"{pol}_seats"] = o.get("seats", 0); row[f"{pol}_cost_per_seat_usd"] = o.get("cost_per_seat_usd")
        row["fairdrop_seats_per_identity"] = P["fairdrop_expected"]["operators"].get("sybil", {}).get("seats_per_identity")
        rows.append(row)
    rows.sort(key=lambda x: x["identities"])
    os.makedirs(os.path.join(out, "charts"), exist_ok=True)
    with open(os.path.join(out, "sybil_scaling.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    json.dump(rows, open(os.path.join(out, "sybil_scaling.json"), "w"), indent=1)
    xs = [r["identities"] for r in rows]
    fig, axs = plt.subplots(1, 2, figsize=(11, 4))
    for pol, l in POLS:
        axs[0].plot(xs, [r[f"{pol}_seats"] for r in rows], "o-", label=l, color=COL[pol])
        axs[1].plot(xs, [r[f"{pol}_cost_per_seat_usd"] or float("nan") for r in rows], "o-", label=l, color=COL[pol])
    for a, t in ((axs[0], "seats won by the Sybil operator"), (axs[1], "identity cost per seat (USD)")):
        a.set_xscale("log"); a.set_xlabel("verified identities bought"); a.set_title(t); a.legend(fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(out, "charts", "sybil_scaling.png"), dpi=130); plt.close(fig)


def _summary(res: dict) -> str:
    m, t, P, I = res["meta"], res["traffic"], res["policies"], res.get("integrity", {})
    L = [f"# {m['experiment']} {m.get('tag', '')}", "", res["meta"]["scenario"].get("description", ""), "",
         f"*policy under test:* **{m['policy']}** &nbsp; *duration:* {m['duration_s']}s &nbsp; *drop:* `{m['drop_id']}`", "",
         "## Traffic", f"- verified identities participating: **{m['actors']}** ({t['humans']} humans, {t['bot_identities']} bot identities across {m['operators']} operators)",
         f"- client requests sent: **{t['client_requests']:,}**; recorded entry attempts (server): **{t.get('attempts_recorded', 'n/a')}**",
         f"- assumed identity cost: **${m['identity_cost_usd']}** (explicit, configurable; this shows the *cost* of buying more identities, it does not claim bots are impossible)", ""]
    for op, o in t["operators"].items():
        L.append(f"  - operator `{op}`: {o['profile']}, IP pool {o['ip_pool']}")
    L += ["", "## Same traffic, three allocation policies", "", "| policy | seats | bot share of seats | bot share of identities | **bot advantage ratio** | humans won / entered | human win rate |", "|---|---|---|---|---|---|---|"]
    for k, l in POLS + [("fairdrop", "Fair Drop (the one actual draw)"), ("fcfs_live", "FCFS (live run, real requests against the classic sale)")]:
        if k in P:
            p = P[k]
            L.append(f"| {l} | {p['seats_total']:.0f} | {_f(p['bot_seat_share'])} | {_f(p['bot_identity_share'])} | **{_f(p['bot_advantage_ratio'])}** | {p['humans_won']:.1f} / {p['humans_entered']} | {_f(p['human_win_rate'])} |")
    L += ["", "*Naive lottery and Fair Drop (expected) are averaged over 200 independent re-draws of the identical entries; FCFS is deterministic given arrival order.*", ""]
    ops = {o: 1 for o in P.get("fairdrop_expected", {}).get("operators", {}) if o != "humans"}
    if ops:
        L += ["## Seats and cost per seat by operator", "", "| operator | identities | FCFS seats | naive seats (E) | Fair Drop seats (E) | Fair Drop cost/seat |", "|---|---|---|---|---|---|"]
        for o in sorted(ops, key=lambda o: -(P["fcfs"]["operators"].get(o, {}).get("seats", 0)))[:25]:
            g = lambda k: P[k]["operators"].get(o, {})
            L.append(f"| {o} | {g('fcfs').get('identities')} | {g('fcfs').get('seats', 0):.0f} | {g('naive_expected').get('seats', 0):.1f} | {g('fairdrop_expected').get('seats', 0):.1f} | {_f(g('fairdrop_expected').get('cost_per_seat_usd'), 2)} |")
    if "fcfs_live" in P and "fcfs" in P:
        L += ["", "## Live FCFS run (same actors replayed against the classic sale)", "", "operators' seats: " + ", ".join(f"{o}={v['seats']}" for o, v in sorted(P["fcfs_live"]["operators"].items(), key=lambda kv: -kv[1]["seats"])[:12])]
    L += ["", "## Latency (client observed)", "", "| endpoint | requests | rps | p50 | p95 | p99 | 5xx/conn errors | error rate | rejected by design (4xx) |", "|---|---|---|---|---|---|---|---|---|"]
    for ep, v in sorted(res["latency"].items(), key=lambda kv: -kv[1]["requests"]):
        L.append(f"| {ep} | {v['requests']} | {v['rps']:.0f} | {v['p50_ms']:.0f} ms | {v['p95_ms']:.0f} ms | {v['p99_ms']:.0f} ms | {v['errors']} | {v['error_rate']:.4%} | {v['rejected_by_design']} |")
    if I:
        L += ["", "## Integrity (must be 0)", "", "```", json.dumps(I.get("violations"), indent=1), "```", f"audit chain valid: **{I['audit_chain']['ok']}** ({I['audit_chain']['length']} events)  -> overall: **{'OK' if I['ok'] else 'VIOLATIONS'}**"]
    v = res.get("verification")
    if v:
        L += ["", "## Independent verification (Python reference verifier)", ""] + [f"- {'PASS' if c['ok'] else 'FAIL'} {c['name']}" for c in v["checks"]]
    for k, e in res.get("extras", {}).items():
        L += ["", f"## {k}", "", "```", json.dumps(e, indent=1, default=str), "```"]
    if "claims" in res:
        L += ["", "## Claims", "", "```", json.dumps(res["claims"], indent=1, default=str), "```"]
    L += ["", "Charts: `charts/*.png`; machine-readable: `results.json`, `results.csv`, `latency.csv`."]
    return "\n".join(L) + "\n"
