"use client";
import { useEffect, useRef, useState } from "react";
import { adminToken, api, ApiError } from "@/lib/api";

// Real traffic for the architecture map. Reads the same admin endpoints the Live screen reads (sale list, raw request trace, server pulse).
// Nothing is invented: with no traffic the numbers are zero and the map says so.
export type LiveState = {
  authed: boolean | null; dropId: string; state: string; perSec: number; cls: Record<string, number>; rep: Record<string, number>; total: number;
  servers: Record<string, boolean>; redisOps: number | null; lag: number | null; audit: number | null; loaded: boolean;
};
const EMPTY: LiveState = { authed: null, dropId: "", state: "", perSec: 0, cls: {}, rep: {}, total: 0, servers: {}, redisOps: null, lag: null, audit: null, loaded: false };

const born = (d: any) => d?.cutoff_at_ms || d?.opened_at_ms || d?.opens_at_ms || 0;

export function useLive(enabled: boolean): LiveState {
  const [s, setS] = useState<LiveState>(EMPTY);
  const ids = useRef<string[]>([]);
  const cur = useRef<Record<string, string>>({});
  const last = useRef<Record<string, { per: number; cls: Record<string, number>; rep: Record<string, number> }>>({});

  useEffect(() => {
    const check = () => { try { const a = !!adminToken.get(); setS((x) => (x.authed === a ? x : { ...x, authed: a })); } catch {} };
    check();
    const t = setInterval(check, 2000);
    return () => clearInterval(t);
  }, []);

  const on = enabled && !!s.authed;
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const vis = () => typeof document === "undefined" || !document.hidden;
    const lost = (e: any) => { if (e instanceof ApiError && e.status === 401) setS((x) => ({ ...x, authed: false })); };

    const drops = async () => {
      if (!vis()) return;
      try {
        const list = await api<any[]>("/admin/drops", { auth: "admin" });
        if (!alive) return;
        const exp = list.filter((d) => String(d.id).startsWith("exp-")).sort((a, b) => born(b) - born(a));
        const main = exp.find((d) => d.mode === "fairdrop") || exp[0] || [...list].sort((a, b) => born(b) - born(a))[0];
        const old = main && list.find((d) => d.id === String(main.id).replace("-fairdrop-", "-fcfs-") && d.id !== main.id);
        ids.current = main ? [main.id, ...(old ? [old.id] : [])] : [];
        setS((x) => ({ ...x, dropId: main?.id || "", state: main?.state || "", loaded: true }));
      } catch (e) { lost(e); }
    };
    const trace = async () => {
      if (!vis() || !ids.current.length) return;
      try {
        const rs = await Promise.all(ids.current.map(async (id) => {
          const r = await api<any>(`/admin/drops/${id}/trace${cur.current[id] ? "?after=" + cur.current[id] : ""}`, { auth: "admin" });
          cur.current[id] = r.cursor || cur.current[id] || "";
          last.current[id] = { per: r.per_sec || 0, cls: r.by_class_3s || {}, rep: r.by_replica_3s || {} };
          return r;
        }));
        if (!alive) return;
        const cls: Record<string, number> = {}, rep: Record<string, number> = {};
        let per = 0, total = 0;
        rs.forEach((r, i) => {
          const l = last.current[ids.current[i]];
          per += l.per; total += r.total || 0;
          Object.entries(l.cls).forEach(([k, v]) => (cls[k] = (cls[k] || 0) + v));
          Object.entries(l.rep).forEach(([k, v]) => (rep[k] = (rep[k] || 0) + v));
        });
        setS((x) => ({ ...x, perSec: per, cls, rep, total }));
      } catch (e) { lost(e); }
    };
    const pulse = async () => {
      if (!vis() || !ids.current[0]) return;
      try {
        const p = await api<any>(`/admin/drops/${ids.current[0]}/pulse`, { auth: "admin" });
        if (!alive) return;
        const servers: Record<string, boolean> = {};
        (p?.server?.replicas || []).forEach((r: any) => { servers[r.id] = !!r.up; });
        setS((x) => ({ ...x, servers, redisOps: p?.database?.redis?.ops_per_sec ?? null, lag: p?.queue?.db_writes_waiting ?? null, audit: p?.database?.postgres?.audit_entries ?? null }));
      } catch (e) { lost(e); }
    };
    drops(); const a = setInterval(drops, 2000), b = setInterval(trace, 800), c = setInterval(pulse, 1600);
    return () => { alive = false; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [on]);

  return enabled ? s : { ...s, perSec: 0, cls: {}, rep: {} };
}
