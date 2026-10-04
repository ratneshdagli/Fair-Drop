"""CLI:  python -m attack_engine <command>
  seed                            seed 50,000 synthetic verified users (idempotent)
  list                            list experiments
  run exp1..exp7 [--scale 1.0] [--also-fcfs] [--users N] [--processes N]
  all [--scale S]                 run all seven experiments
  selftest                        18 known-good / known-bad requests against a fresh sale
  redteam                         14 things a clever bot owner would try against the live system
  serve                           HTTP control API used by the admin Test Lab (port 9200)
"""
import argparse
import json
import sys

from . import config


def main():
    ap = argparse.ArgumentParser(prog="attack_engine")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed"); sub.add_parser("list"); sub.add_parser("serve"); sub.add_parser("selftest"); sub.add_parser("redteam")
    for n in ("run", "all"):
        p = sub.add_parser(n)
        if n == "run":
            p.add_argument("experiment")
        p.add_argument("--scale", type=float, default=1.0)
        p.add_argument("--also-fcfs", action="store_true", help="also replay the same actors against the classic FCFS sale")
        p.add_argument("--spec", help="JSON for the custom test: {\"people\": N, \"bots\": {PROFILE: count}}"); p.add_argument("--users", type=int); p.add_argument("--processes", type=int); p.add_argument("--out")
    a = ap.parse_args()
    if a.cmd == "seed":
        from .auth import Api
        print(json.dumps(Api().ensure_seeded(config.POPULATION)))
    elif a.cmd == "selftest":
        from .selftest import run
        print(json.dumps(run(), indent=1))
    elif a.cmd == "redteam":
        from .redteam import run as rt
        print(json.dumps(rt(), indent=1))
    elif a.cmd == "list":
        from .scenarios import EXPERIMENTS
        for k, f in EXPERIMENTS.items():
            for s in f(1.0):
                print(k, "-", s.description, f"[{s.total_actors()} identities]")
    elif a.cmd == "serve":
        from .server import serve
        serve()
    else:
        from . import scenarios
        from .runner import run_experiment
        if a.spec:
            scenarios.CUSTOM["spec"] = json.loads(a.spec)
        if a.users or a.processes:
            orig = dict(scenarios.EXPERIMENTS)
            def wrap(f):
                def g(scale):
                    out = f(scale)
                    for s in out:
                        s.concurrency = a.users or s.concurrency; s.processes = a.processes or s.processes
                    return out
                return g
            for k in list(scenarios.EXPERIMENTS):
                scenarios.EXPERIMENTS[k] = wrap(orig[k])
        names = list(scenarios.EXPERIMENTS) if a.cmd == "all" else [a.experiment]
        for n in names:
            run_experiment(n, a.scale, a.also_fcfs, a.out)


if __name__ == "__main__":
    main()
