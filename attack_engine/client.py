"""HTTP client used by bot profiles (wraps a Locust FastHttpUser client)."""
import time
from typing import Optional, Tuple
from . import config, timesync


class FDClient:
    def __init__(self, http, rec, prefix: str, drop_id: str, actor: str, ip: str):
        self.http, self.rec, self.prefix, self.drop = http, rec, prefix, drop_id
        self.actor, self.ip, self.jwt = actor, ip, None
        self.last_date = None      # the last response's Date header as epoch seconds (STATE_SNIPER clock sync)

    def req(self, method: str, path: str, name: str, body=None, auth=True, ip: Optional[str] = None, headers=None) -> Tuple[int, Optional[dict]]:
        h = {"X-Sim-IP": ip or self.ip, "X-Sim-Actor": self.actor, "X-Test-Key": config.TEST_KEY}
        if auth and self.jwt:
            h["Authorization"] = "Bearer " + self.jwt
        if headers:
            h.update(headers)
        t0 = time.perf_counter()
        data = None
        with self.http.request(method, self.prefix + path, json=body, headers=h, name=name, catch_response=True) as r:
            ms = (time.perf_counter() - t0) * 1000
            code = r.status_code or 0
            try:
                data = r.json()
            except Exception:
                data = None
            try:
                hd = r.headers
                self.last_date = timesync.parse_http_date(hd.get("Date") or hd.get("date"))
            except Exception:
                self.last_date = None
            # Locust "failure" = server errors / connection errors only. 4xx are designed rejections (429, 409, 410...)
            if code == 0 or code >= 500:
                r.failure(f"{code}")
            else:
                r.success()
        self.rec.add(name, code, ms)
        return code, data

    # ---- Fair Drop flow (test-token = server-side blinding, see docs/API_CONTRACT.md) ----
    def login(self) -> Tuple[int, Optional[dict]]:
        code, d = self.req("POST", "/test/login", "POST /test/login", {"user_id": self.actor, "password": config.TEST_PASSWORD}, auth=False)
        if code == 200:
            self.jwt = d["token"]
        return code, d

    def browse(self):
        return self.req("GET", f"/drops/{self.drop}", "GET /drops/{id}", auth=False)

    def test_token(self, tier: str, ip=None):
        return self.req("POST", f"/drops/{self.drop}/test-token", "POST /drops/{id}/test-token", {"tier": tier}, ip=ip)

    def register(self, tok: dict, idem: Optional[str] = None, ip=None, fast=False, route=None):
        path = route or ("register-fast" if fast else "register")
        return self.req("POST", f"/drops/{self.drop}/{path}", f"POST /drops/{{id}}/{path}",
                        {"token_msg": tok["token_msg"], "sig": tok["sig"], "tier": tok["tier"]}, auth=False, ip=ip,
                        headers={"Idempotency-Key": idem} if idem else None)

    # ---- the REAL token path (client-side blinding, CRYPTO_SWARM): POST /drops/{id}/token, same body the browser sends ----
    def token(self, blinded_b64: str, tier: str, idem: Optional[str] = None, ip=None):
        return self.req("POST", f"/drops/{self.drop}/token", "POST /drops/{id}/token", {"blinded_msg": blinded_b64, "tier": tier}, ip=ip,
                        headers={"Idempotency-Key": idem} if idem else None)

    def link(self, token_msg_b64: str):
        """Evaluation only (TEST_MODE): tell the scorer which account owns this receipt. See hTestLink in testkit.go."""
        return self.req("POST", f"/drops/{self.drop}/test-link", "POST /drops/{id}/test-link", {"token_msg": token_msg_b64})

    def server_date(self) -> Optional[int]:
        """Cheap request whose only use is the Date header (clock estimate); returns it as epoch seconds."""
        self.req("GET", "/healthz", "GET /healthz (clock sync)", auth=False)
        return self.last_date

    def site_get(self, path: str, name: str) -> Tuple[int, str]:
        """GET a page of the website itself (not the /api): what a scraper does to read the HTML and JavaScript."""
        t0 = time.perf_counter()
        text = ""
        with self.http.get(path, name=name, catch_response=True, headers={"X-Sim-IP": self.ip}) as r:
            ms = (time.perf_counter() - t0) * 1000
            code = r.status_code or 0
            if code == 200:
                try:
                    text = r.text or ""
                except Exception:
                    text = ""
            if code == 0 or code >= 500:
                r.failure(f"{code}")
            else:
                r.success()
        self.rec.add(name, code, ms)
        return code, text

    def buy(self, tier: str, ip=None):
        return self.req("POST", f"/baseline/{self.drop}/buy", "POST /baseline/{id}/buy", {"tier": tier}, ip=ip)

    def claim(self, token_msg: str):
        return self.req("POST", f"/drops/{self.drop}/claim", "POST /drops/{id}/claim", {"token_msg": token_msg})
