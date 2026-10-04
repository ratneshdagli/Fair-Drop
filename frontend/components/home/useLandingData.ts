"use client";
// Rate-limit friendly data for the landing page. A visitor who is not signed in as admin triggers NO polling: the shows list is
// fetched once, the research metrics not at all. A signed-in admin gets a refresh every 5 s (and only while the tab is visible).
import { useEffect, useState } from "react";
import { adminToken, api } from "@/lib/api";
import type { Science } from "@/lib/arena";

const EVERY_MS = 5000;
const isAdmin = () => { try { return !!adminToken.get(); } catch { return false; } };

/** Runs `fn` once on mount; repeats every 5 s only for a signed-in admin. */
export function useOnceOrAdminPoll<T>(fn: () => Promise<T>, adminOnly = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true, t: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      if (document.hidden) return;
      try { const d = await fn(); if (alive) { setData(d); setError(null); } } catch (e) { if (alive) setError(e as Error); }
    };
    if (!adminOnly || isAdmin()) { tick(); if (isAdmin()) t = setInterval(tick, EVERY_MS); }
    return () => { alive = false; if (t) clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data, error };
}

const sci = (p: any): Science | null => (p?.confusion ? { all: p.confusion.all || {}, human: p.confusion.human || {}, bot: p.confusion.bot || {}, arrivals: p.arrivals || {}, decisions: Number(p.decisions) || 0 } : null);
const born = (d: any) => d?.cutoff_at_ms || d?.opened_at_ms || d?.opens_at_ms || 0;

/** The judge's confusion matrix of the newest Fair Drop test sale (admin only). Same endpoints the live screen reads, 5 s apart. */
export function useScience() {
  const { data } = useOnceOrAdminPoll(async () => {
    const drops = await api<any[]>("/admin/drops", { auth: "admin" });
    const fair = drops.filter((d) => String(d.id).startsWith("exp-") && d.mode === "fairdrop").sort((a, b) => born(b) - born(a))[0];
    if (!fair) return null;
    return sci(await api<any>(`/admin/drops/${fair.id}/protection`, { auth: "admin" }));
  }, true);
  return data;
}
