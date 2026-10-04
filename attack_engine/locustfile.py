"""Locust entry point. Each Locust 'user' is a worker greenlet that pulls the next ACTOR (a verified identity with a
profile) from this process's share of the plan, waits for the actor's arrival offset, then runs the actor's behaviour.
Concurrency = --users; the plan can hold 50,000 actors. Run via `python -m attack_engine run ...`, not by hand.
"""
import json
import os
import random
import time
from collections import deque

import gevent
from locust import FastHttpUser, constant, task

from attack_engine.client import FDClient
from attack_engine.metrics import Recorder
from attack_engine.operators import Operator
from attack_engine.profiles import PROFILES, Ctx

PLAN = json.load(open(os.environ["FD_PLAN"]))
OUT = os.environ["FD_OUT"]
T0 = float(os.environ["FD_T0"])
WORKERS = int(os.environ.get("FD_WORKERS", "1"))
PREFIX = os.environ.get("FD_PREFIX", "/api")

STATE = {"init": False, "queue": deque(), "busy": 0, "widx": 0, "rec": Recorder(), "ops": {}, "done": False}


def _init(environment):
    if STATE["init"]:
        return
    STATE["init"] = True
    runner = environment.runner
    widx = getattr(runner, "worker_index", None)
    STATE["widx"] = widx if widx is not None else 0
    w = WORKERS if widx is not None else 1
    STATE["queue"] = deque(a for i, a in enumerate(PLAN["actors"]) if i % w == STATE["widx"])
    for o in PLAN["operators"]:
        STATE["ops"][o["index"]] = Operator(o["index"], o["id"], o["profile"], [], o["ip_pool"], o["params"], o["start"])
    gevent.spawn(_watch)


def _watch():
    """When this process has no more actors and none in flight: dump results and drop a marker file."""
    while True:
        gevent.sleep(0.5)
        if not STATE["queue"] and STATE["busy"] == 0 and time.time() > T0:
            STATE["rec"].dump(os.path.join(OUT, f"w{STATE['widx']}"))
            open(os.path.join(OUT, f"done.{STATE['widx']}"), "w").write("ok")
            STATE["done"] = True
            return


class ActorUser(FastHttpUser):
    wait_time = constant(0)
    connection_timeout = 20.0
    network_timeout = 40.0
    concurrency = 4

    def on_start(self):
        _init(self.environment)

    @task
    def run_actor(self):
        if STATE["done"] or not STATE["queue"]:
            gevent.sleep(0.5)
            return
        a = STATE["queue"].popleft()
        STATE["busy"] += 1
        try:
            wait = T0 + a["offset"] - time.time()
            if wait > 0:
                gevent.sleep(wait)
            op = STATE["ops"].get(a["oi"])
            prof = PROFILES[a["profile"]]
            rng = random.Random(a["uid"])
            ip = a["ip"] or op.ip(rng.randrange(max(1, op.ip_pool)))
            c = FDClient(self.client, STATE["rec"], PREFIX, PLAN["drop_id"], a["uid"], ip)
            ctx = Ctx(c, a, op, op.params if op else {}, rng, STATE["rec"], a["tier"], boundary=PLAN.get("boundary"))
            (prof.fd if PLAN["policy"] == "fairdrop" else prof.fcfs)(ctx)
        except Exception as e:  # a crashing actor must never take the run down
            STATE["rec"].events["actor_crash"] += 1
            STATE["rec"].events["crash:" + type(e).__name__] += 1
        finally:
            STATE["busy"] -= 1
