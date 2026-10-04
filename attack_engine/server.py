"""Tiny control API so the admin Test Lab can start experiments (stdlib only). Guarded by X-Test-Key."""
import json
import os
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import config

RUNS = {}
REDTEAM = {"last": None}
LOCK = threading.Lock()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def start(body: dict) -> dict:
    exp = body.get("experiment", "exp1")
    rid = f"{exp}-{int(time.time())}"
    cmd = [sys.executable, "-m", "attack_engine", "all" if exp == "all" else "run"] + ([] if exp == "all" else [exp]) + ["--scale", str(body.get("scale", 0.1))]
    if exp == "custom":
        sp = body.get("spec") or {}
        from .profiles import PROFILES
        bots = {k: int(v) for k, v in (sp.get("bots") or {}).items() if k in PROFILES and k != "HUMAN" and int(v) > 0}
        people = max(0, int(sp.get("people", 0)))
        if people + sum(bots.values()) < 1 or people + sum(bots.values()) > config.POPULATION:
            return {"error": f"choose between 1 and {config.POPULATION:,} accounts in total"}
        cmd += ["--spec", json.dumps({"people": people, "bots": bots, "window": int(sp.get("window") or 0)})]
    if body.get("also_fcfs"):
        cmd.append("--also-fcfs")
    for k in ("users", "processes"):
        if body.get(k):
            cmd += [f"--{k}", str(int(body[k]))]
    os.makedirs(os.path.join(config.REPORTS_DIR, "_runs"), exist_ok=True)
    logp = os.path.join(config.REPORTS_DIR, "_runs", rid + ".log")
    p = subprocess.Popen(cmd, cwd=ROOT, stdout=open(logp, "w"), stderr=subprocess.STDOUT, start_new_session=True, env={**os.environ, "PYTHONUNBUFFERED": "1"})
    with LOCK:
        RUNS[rid] = {"id": rid, "experiment": exp, "scale": body.get("scale", 0.1), "started": time.time(), "proc": p, "log": logp, "cmd": " ".join(cmd)}
    return {"id": rid}


def view(r, tail=False):
    rc = r["proc"].poll()
    d = {"id": r["id"], "experiment": r["experiment"], "scale": r["scale"], "started": r["started"], "status": "running" if rc is None else ("done" if rc == 0 else "failed"), "cmd": r["cmd"]}
    if tail:
        d["log"] = open(r["log"], errors="replace").read()[-6000:]
    return d


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def _auth(self):
        if self.headers.get("X-Test-Key") != config.TEST_KEY:
            self._send(401, {"error": "bad_test_key"}); return False
        return True

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        if not self._auth():
            return
        if self.path == "/redteam/before":
            try:
                return self._send(200, json.load(open(os.path.join(config.REPORTS_DIR, "redteam", "before_fix.json"), encoding="utf-8")))
            except OSError:
                return self._send(200, {})
        if self.path == "/redteam/last":
            return self._send(200, REDTEAM["last"] or {})
        if self.path == "/experiments":
            from .scenarios import EXPERIMENTS
            return self._send(200, [{"id": k, "description": f(1.0)[0].description, "runs": len(f(1.0))} for k, f in EXPERIMENTS.items()])
        if self.path == "/runs":
            return self._send(200, [view(r) for r in sorted(RUNS.values(), key=lambda r: -r["started"])])
        if self.path.startswith("/runs/"):
            r = RUNS.get(self.path.split("/")[2])
            return self._send(200, view(r, True)) if r else self._send(404, {"error": "not_found"})
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        if not self._auth():
            return
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/selftest":
            from .selftest import run
            try:
                return self._send(200, run())
            except Exception as e:
                return self._send(500, {"error": str(e)})
        if self.path == "/redteam":
            from .redteam import run as rt
            try:
                REDTEAM["last"] = rt()
                return self._send(200, REDTEAM["last"])
            except Exception as e:
                return self._send(500, {"error": str(e)})
        if self.path == "/stop":  # kill every running test, including the load generators it started
            n = 0
            for r in RUNS.values():
                if r["proc"].poll() is None:
                    try:
                        os.killpg(r["proc"].pid, signal.SIGKILL); n += 1
                    except ProcessLookupError:   # it exited a moment ago: nothing left to kill
                        pass
            if body.get("forget"):   # "Clear everything": also drop the finished runs from the list so old runs do not keep loading
                with LOCK:
                    for k in [k for k, r in RUNS.items() if r["proc"].poll() is not None]:
                        del RUNS[k]
            return self._send(200, {"stopped": n})
        if self.path == "/run":
            if any(r["proc"].poll() is None for r in RUNS.values()):
                return self._send(409, {"error": "a run is already in progress"})
            res = start(body)
            return self._send(400 if "error" in res else 200, res)
        self._send(404, {"error": "not_found"})

    def log_message(self, *a):
        pass


def serve(port=9200):
    print("attack engine control API on", port, flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
