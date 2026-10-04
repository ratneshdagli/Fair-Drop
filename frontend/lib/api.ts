"use client";
import { useEffect, useRef, useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_BASE || "/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: any) {
    super(`${status} ${code}`);
  }
}

export type Session = { token: string; user_id: string; verified_at_ms: number; phone?: string };
const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};
export const session = {
  get: (): Session | null => { const s = safe.get("fd:user"); return s ? JSON.parse(s) : null; },
  set: (s: Session) => safe.set("fd:user", JSON.stringify(s)),
  clear: () => safe.del("fd:user"),
};
export const adminToken = {
  get: () => safe.get("fd:admin"), set: (t: string) => safe.set("fd:admin", t), clear: () => safe.del("fd:admin"),
};
export const testKey = {
  get: () => { try { return sessionStorage.getItem("fd:testkey") || "test-key-demo"; } catch { return "test-key-demo"; } },
  set: (k: string) => { try { sessionStorage.setItem("fd:testkey", k); } catch {} },
};

export function randId() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Opts = { method?: string; body?: any; auth?: "user" | "admin" | false; headers?: Record<string, string>; idem?: boolean; base?: string };

export async function api<T = any>(path: string, o: Opts = {}): Promise<T> {
  const h: Record<string, string> = { ...(o.headers || {}) };
  if (o.body !== undefined) h["content-type"] = "application/json";
  if (o.auth === "user") { const s = session.get(); if (s) h.Authorization = "Bearer " + s.token; }
  if (o.auth === "admin") { const t = adminToken.get(); if (t) h.Authorization = "Bearer " + t; }
  if (o.idem) h["Idempotency-Key"] = randId();
  const r = await fetch((o.base ?? API) + path, { method: o.method || (o.body !== undefined ? "POST" : "GET"), headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, cache: "no-store" });
  const txt = await r.text();
  let j: any = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { j = { raw: txt }; }
  if (!r.ok) {
    // an expired or invalid admin login must not fail silently (empty screens): drop it and show the sign-in again
    if (r.status === 401 && o.auth === "admin" && adminToken.get()) { adminToken.clear(); if (typeof location !== "undefined") location.reload(); }
    throw new ApiError(r.status, j?.error || "error", j);
  }
  return j as T;
}

// Optional `key` (4th arg): components polling the same thing under the same key share ONE request per tick.
// Without a key behaviour is unchanged apart from: no re-render when the response is identical, jitter,
// slower polling while the window is unfocused, and exponential back-off (max 8x) while errors repeat.
const inflight = new Map<string, { p: Promise<any>; at: number }>();
function shared<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const e = inflight.get(key);
  if (e && Date.now() - e.at < 400) return e.p;
  const p = fn();
  inflight.set(key, { p, at: Date.now() });
  p.then(() => {}, () => { if (inflight.get(key)?.p === p) inflight.delete(key); });
  return p;
}

export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: any[] = [], key?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastRef = useRef<string>("");
  const apply = (d: T) => {
    const j = JSON.stringify(d);
    if (j !== lastRef.current) { lastRef.current = j; setData(d); }   // identical payload: skip the re-render
    setError((e) => (e ? null : e));
  };
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let fails = 0;
    const tick = async () => {
      const hidden = typeof document !== "undefined" && document.hidden;   // a background tab must not keep hitting the servers
      if (!hidden) {
        try { const d = await shared(key, () => fnRef.current()); if (alive) { fails = 0; apply(d); } }
        catch (e: any) { fails++; if (alive) setError(e); }
      }
      if (!alive) return;
      const unfocused = typeof document !== "undefined" && !document.hasFocus();
      const next = ms * (unfocused ? 3 : 1) * Math.min(8, 2 ** Math.min(fails, 3)) * (0.9 + Math.random() * 0.2);
      timer = setTimeout(tick, next);
    };
    lastRef.current = "";
    tick();
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload: async () => { try { const d = await fnRef.current(); apply(d); } catch (e: any) { setError(e); } } };
}

// ---- per-drop local storage of the user's secret token + signed receipt ----
export type LocalEntry = {
  drop_id: string; token_msg: string; sig?: string; tier: string; idem: string;
  receipt?: { receipt_id: string; arrival_ms: number; server_sig: string; tier: string; replica?: string; sig_ok?: boolean };
  root_at_lock?: string;
};
export const entries = {
  get: (drop: string): LocalEntry | null => { const s = safe.get("fd:entry:" + drop); return s ? JSON.parse(s) : null; },
  set: (e: LocalEntry) => safe.set("fd:entry:" + e.drop_id, JSON.stringify(e)),
  clear: (drop: string) => safe.del("fd:entry:" + drop),
};

export const fmtTime = (ms: number | string) => new Date(typeof ms === "string" ? ms : ms).toLocaleString();
export const money = (c: number) => (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
export const seatLabel = (tier: string, seat: number) => `${tier.slice(0, 1).toUpperCase()}-${String(seat).padStart(3, "0")}`;
