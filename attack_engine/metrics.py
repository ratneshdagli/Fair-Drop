"""Per-process request recorder (latency + status per endpoint); dumped to JSON for the runner to merge."""
import json
import threading
from collections import defaultdict, Counter


class Recorder:
    def __init__(self):
        self.ep = defaultdict(lambda: {"n": 0, "status": Counter(), "lat": []})
        self.tokens = []          # receipts obtained (for claims + kill-replica / malicious verification)
        self.events = Counter()   # profile-level outcomes, e.g. "tarpit_receipt", "gave_up"
        self.lock = threading.Lock()

    def add(self, name: str, status: int, ms: float):
        r = self.ep[name]
        r["n"] += 1; r["status"][status] += 1; r["lat"].append(round(ms, 2))

    def dump(self, path_prefix: str):
        with open(path_prefix + ".metrics.json", "w") as f:
            json.dump({"endpoints": {k: {"n": v["n"], "status": {str(s): c for s, c in v["status"].items()}, "lat": v["lat"]} for k, v in self.ep.items()},
                       "events": dict(self.events)}, f)
        with open(path_prefix + ".tokens.json", "w") as f:
            json.dump(self.tokens, f)


def merge(dumps):
    """Merge worker dumps -> (endpoints{name:{n,status,lat}}, events Counter, tokens list)."""
    ep = defaultdict(lambda: {"n": 0, "status": Counter(), "lat": []})
    events, tokens = Counter(), []
    for d in dumps:
        for k, v in d["metrics"]["endpoints"].items():
            ep[k]["n"] += v["n"]; ep[k]["lat"].extend(v["lat"])
            for s, c in v["status"].items():
                ep[k]["status"][int(s)] += c
        events.update(d["metrics"]["events"]); tokens.extend(d["tokens"])
    return {k: {"n": v["n"], "status": {str(s): c for s, c in v["status"].items()}, "lat": v["lat"]} for k, v in ep.items()}, events, tokens
