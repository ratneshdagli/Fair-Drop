"""Control-plane client (admin + testkit endpoints) used by the runner. Not used by bots."""
import time
import requests
from . import config


class Api:
    def __init__(self, base: str = None, key: str = None):
        self.base = (base or config.BASE_URL).rstrip("/")
        self.key = key or config.TEST_KEY
        self.s = requests.Session()
        self.s.headers.update({"X-Test-Key": self.key})
        self._admin = None

    def req(self, method, path, ok=(200, 201), retries=3, **kw):
        last = None
        timeout = kw.pop("timeout", 180)
        for i in range(retries):
            try:
                r = self.s.request(method, self.base + path, timeout=timeout, **kw)
                if r.status_code in ok:
                    return r.json() if r.content else {}
                last = RuntimeError(f"{method} {path} -> {r.status_code} {r.text[:300]}")
                if r.status_code < 500:
                    break
            except requests.RequestException as e:
                last = e
            time.sleep(1 + i)
        raise last

    def admin(self):
        if not self._admin:
            self._admin = {"Authorization": "Bearer " + self.req("POST", "/test/admin-token")["token"]}
        return self._admin

    def a(self, method, path, **kw):
        return self.req(method, path, headers=self.admin(), **kw)

    def healthy(self, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.s.get(self.base + "/healthz", timeout=3).status_code == 200:
                    return True
            except requests.RequestException:
                pass
            time.sleep(1)
        return False

    def ensure_seeded(self, n: int):
        """Seed 50,000 synthetic verified users if the last one cannot log in yet (idempotent)."""
        r = self.s.post(self.base + "/test/login", json={"user_id": f"t_{n:06d}", "password": config.TEST_PASSWORD}, timeout=30)
        if r.status_code != 200:
            return self.req("POST", "/test/seed", json={"count": config.POPULATION, "password": config.TEST_PASSWORD}, timeout=600)
        return {"already_seeded": True}
