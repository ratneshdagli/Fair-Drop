"use client";
// Small shared parts for the control room (admin only). The global kit stays in components/ui.tsx.
import React, { useEffect, useRef, useState } from "react";
import { Check, Info, Ticket, X } from "lucide-react";
import { api, usePoll } from "@/lib/api";
import { cn } from "@/components/ui";

export const PAL = { gold: "#ffc233", hot: "#ff3b5c", violet: "#8b6cff", ice: "#7fd8ff", lime: "#b8ff4a", warn: "#ff8a3d", mute: "#9a90b8", line: "#2b2342", panel: "#0f0b1a", ink: "#f4f0ff" };
// recharts theme in the show palette
export const chartTip = { contentStyle: { background: PAL.panel, border: `1px solid ${PAL.line}`, borderRadius: 4, fontSize: 13, color: PAL.ink }, labelStyle: { color: PAL.mute }, itemStyle: { color: PAL.ink } };
export const axis = { stroke: PAL.mute, fontSize: 12, tickLine: false as const };
export const grid = { stroke: PAL.line, strokeDasharray: "3 3" };
export const clock = (v: number) => new Date(v).toLocaleTimeString().slice(3, 8);

/** 12px mono label (the global .eyebrow is 11px). */
export const Mono = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("font-mono text-xs uppercase tracking-[.16em] text-mute", className)}>{children}</span>
);

/** Opens every section: numbered kicker, poster title, and the one line "what you are looking at". */
export function SectionTitle({ n, kicker, title, what, right }: { n: string; kicker: string; title: string; what: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[.2em] text-gold"><span>{n}</span><span className="h-px w-8 bg-gold/50" /><span>{kicker}</span></div>
        <h1 className="display text-5xl md:text-6xl">{title}</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-ink/80"><Mono className="mr-2 text-gold/90">You are looking at</Mono>{what}</p>
      </div>
      {right}
    </header>
  );
}

const TONE = {
  violet: ["border-violet/40 bg-violet/10", "border-violet/40 text-violet"],
  gold: ["border-gold/35 bg-gold/[.07]", "border-gold/40 text-gold"],
  lime: ["border-lime/30 bg-lime/[.07]", "border-lime/40 text-lime"],
  warn: ["border-warn/40 bg-warn/10", "border-warn/40 text-warn"],
  hot: ["border-hot/40 bg-hot/10", "border-hot/40 text-hot"],
} as const;

/** The "what this shows / what this proves" box at the top of a screen. */
export function Explain({ title = "What this shows", icon: I = Info, tone = "violet", children, className }: { title?: string; icon?: React.ComponentType<{ className?: string }>; tone?: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <div className={cn("flex gap-4 rounded-[5px] border p-4", t[0], className)}>
      <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[4px] border bg-black/25", t[1])}><I className="h-5 w-5" /></span>
      <div className="min-w-0"><div className={cn("font-mono text-xs font-semibold uppercase tracking-[.18em]", t[1].split(" ")[1])}>{title}</div><div className="mt-1 text-sm leading-relaxed text-ink/90">{children}</div></div>
    </div>
  );
}

/** A panel with a title, an optional plain-words caption and a right-hand slot. */
export function Panel({ title, note, right, children, className }: { title?: React.ReactNode; note?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-5", className)}>
      {(title || right) && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[.16em] text-ink"><i className="h-2 w-2 rotate-45 bg-gold" />{title}</h3>
          {right}
        </div>
      )}
      {note && <p className="mb-4 max-w-3xl text-sm leading-relaxed text-mute">{note}</p>}
      {!note && title && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** Colour key. shape: dot = person, diamond = bot, bar = share. */
export function Legend({ items, className }: { items: { color: string; label: string; shape?: "dot" | "diamond" | "bar" }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink/85", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <i aria-hidden className={cn("inline-block", i.shape === "diamond" ? "h-2.5 w-2.5 rotate-45" : i.shape === "bar" ? "h-2 w-5 rounded-sm" : "h-2.5 w-2.5 rounded-full")} style={{ background: i.color, boxShadow: `0 0 8px ${i.color}88` }} />{i.label}
        </li>
      ))}
    </ul>
  );
}

/** Pass / fail mark with an icon instead of a tick character. */
export function Verdict({ ok, warn, className }: { ok: boolean; warn?: boolean; className?: string }) {
  return ok ? <Check aria-label="passed" className={cn("h-4 w-4 shrink-0 text-lime", className)} strokeWidth={3} /> : warn ? <Info aria-label="note" className={cn("h-4 w-4 shrink-0 text-warn", className)} /> : <X aria-label="failed" className={cn("h-4 w-4 shrink-0 text-hot", className)} strokeWidth={3} />;
}

/** Horizontal share bar with a label and a percentage. */
export function Meter({ label, v, color, max = 1 }: { label: string; v: number; color: string; max?: number }) {
  const w = Math.min(100, ((v || 0) / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between gap-3 text-[13px] text-mute"><span>{label}</span><span className="num font-semibold text-ink">{((v || 0) * 100).toFixed(1)}%</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-sm bg-panel2"><div className="h-full rounded-sm" style={{ width: w + "%", background: color }} /></div>
    </div>
  );
}

/** Shown where a sale is needed but none is picked. */
export function NeedSale({ children }: { children?: React.ReactNode }) {
  return <Explain title="Pick a sale first" icon={Info} tone="gold">{children || <>Use the <b>Sale</b> menu in the bar at the top. Everything on this screen is about the sale you pick there.</>}</Explain>;
}

/** Plain table styles. */
export const th = "py-2 pr-3 text-left font-mono text-xs font-semibold uppercase tracking-[.12em] text-mute";
export const td = "py-2.5 pr-3 align-top text-sm";

/** The test population the attack engine seeds (attack_engine/config.py POPULATION). A size of 1.0 = this many people; the Bot Lab accepts at most this many accounts. */
export const POPULATION = 50000;

/** Seats one login may buy in the old sale: read from the server's own config (/admin/config max_per_account), cached once. null until known. */
let capCache: number | null = null;
export function useMaxSeats(): number | null {
  const [v, setV] = useState<number | null>(capCache);
  useEffect(() => {
    if (capCache !== null) return;
    let alive = true;
    api<any>("/admin/config", { auth: "admin" }).then((c) => { if (typeof c?.max_per_account === "number") { capCache = c.max_per_account; if (alive) setV(capCache); } }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return v;
}
/** "up to 4 seats", or "several seats" while the server's number is not known. */
export const upTo = (cap: number | null) => (cap ? `up to ${cap} seats` : "several seats");

/** The ticket rule, always the same words. old = the first-come sale (several seats per login: the server's own cap). */
export function TicketRule({ old, className }: { old?: boolean; className?: string }) {
  const cap = useMaxSeats();
  return old
    ? <span title={`The old first-come sale lets one login buy ${upTo(cap)}.`} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-hot/40 bg-hot/10 px-2 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-hot", className)}><Ticket className="h-3.5 w-3.5" />Old way: {upTo(cap)} per login</span>
    : <span title="Fair Drop: one verified login gets one ticket, one entry, and at most one seat." className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-gold/40 bg-gold/10 px-2 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-gold", className)}><Ticket className="h-3.5 w-3.5" />1 login · 1 ticket · 1 seat at most</span>;
}

/** "What a bot controls / can never control", two short lines. */
export function Controls({ ctl, never, className }: { ctl: string; never: string; className?: string }) {
  return (
    <dl className={cn("space-y-1 text-[13px] leading-snug", className)}>
      <div className="flex gap-2"><dt className="w-[74px] shrink-0 font-mono text-xs font-semibold uppercase text-warn">controls</dt><dd className="text-ink/90">{ctl}</dd></div>
      <div className="flex gap-2"><dt className="w-[74px] shrink-0 font-mono text-xs font-semibold uppercase text-lime">never</dt><dd className="text-ink/90">{never}</dd></div>
    </dl>
  );
}

/** The server's live counters for one sale, refreshed every second. Same data as the live stream, but as plain requests
 *  (a few long-lived streams per browser tab would starve the other calls); requests per second is worked out from the request total. */
export function useLive(dropId: string): { s: any; ok: boolean } {
  const [s, setS] = useState<any>(null);
  const [ok, setOk] = useState(false);
  const prev = useRef<{ r: number; t: number } | null>(null);
  useEffect(() => {
    setS(null); setOk(false); prev.current = null;
    if (!dropId) return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api<any>(`/admin/drops/${dropId}/live`, { auth: "admin" });
        if (!alive) return;
        const p = prev.current;
        if (p && d.requests_total >= p.r && d.now_ms > p.t) d.rps = (d.requests_total - p.r) / ((d.now_ms - p.t) / 1000);
        prev.current = { r: d.requests_total, t: d.now_ms };
        setS((old: any) => ({ ...d, rps: d.rps ?? old?.rps ?? 0 })); setOk(true);
      } catch { if (alive) setOk(false); }
    };
    tick(); const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [dropId]);
  return { s, ok };
}

/** Poll one admin endpoint of one sale. When the sale changes, the previous sale's numbers are dropped at once (never shown under the new sale's header). */
export function useDropPoll(id: string, path: string, ms: number) {
  const { data, error, reload } = usePoll(async () => ({ id, v: id ? await api<any>(`/admin/drops/${id}/${path}`, { auth: "admin" }) : null }), ms, [id]);
  return { data: data && data.id === id ? data.v : null, error, reload: async () => { await reload(); } };
}
