"use client";
// "Watch the bots work": one card per kind of bot (hover = live view of what it is doing right now), plus a terminal-style bot console.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createPortal } from "react-dom";
import type { Arena, LiveEvent, ProfileView } from "@/lib/arena";
import { BOTS, n } from "@/components/admin/botinfo";
import { clock, sayEvent, shortId, tms, verdictColor } from "./eventText";

const BINS = 30;          // activity strip: 30 bars, one second each
const LOG = 14;           // lines in the live view
const CONSOLE = 40;       // lines in the console
const FOLLOW = 200;       // lines when following one account
const MUTE = "#8fa1b8";
const MODE_TAG = { fairdrop: { t: "FAIR", c: "#2dd4bf", tip: "Fair Drop sale" }, fcfs: { t: "OLD", c: "#f59e0b", tip: "Old first-come-first-served sale" } } as const;

const CSS = `
@keyframes bw-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes bw-pop { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
@keyframes bw-dot { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
.bw-in { animation: bw-in .3s ease-out; }
.bw-pop { animation: bw-pop .14s ease-out; }
.bw-dot { animation: bw-dot 1.2s ease-in-out infinite; }
.bw-bar { transition: height .45s ease, background-color .3s; }
@media (prefers-reduced-motion: reduce) { .bw-in, .bw-pop, .bw-dot { animation: none; } .bw-bar { transition: none; } }
`;

/** a number that glides to its new value (writes the DOM directly: no per-frame React state) */
function AnimNum({ v }: { v: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const init = useRef(v).current;
  const cur = useRef(v);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const from = cur.current;
    if (from === v || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { cur.current = v; el.textContent = n(v); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 500);
      cur.current = from + (v - from) * (1 - (1 - k) ** 3);
      el.textContent = n(Math.round(cur.current));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <span ref={ref}>{n(init)}</span>;
}

const pctOf = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

function chipFor(p: ProfileView): { t: string; c: string } {
  if (p.id === "HUMAN") return { t: "Real people get in the same way: 1 entry each", c: "#38bdf8" };
  if (p.id === "SYBIL_OPERATOR") return { t: "Not blocked by design: each bought account gets one entry", c: "#f59e0b" };
  if (!p.requests && !p.gotInFair) return { t: "Waiting for it to act…", c: MUTE };
  if (p.gotInFair === 0) return { t: "Stopped", c: "#22c55e" };
  if (p.gotInFair >= p.accounts) return { t: "1 entry per account — the most any account can get", c: "#2dd4bf" };
  return { t: `${n(p.gotInFair)} of ${n(p.accounts)} accounts got in — 1 entry each at most`, c: "#2dd4bf" };
}

const Mode = ({ m }: { m: LiveEvent["mode"] }) => {
  const x = MODE_TAG[m] || MODE_TAG.fairdrop;
  return <span title={x.tip} className="rounded px-1 text-[10px] font-bold leading-4" style={{ color: x.c, background: x.c + "22" }}>{x.t}</span>;
};

type Derived = { log: Record<string, LiveEvent[]>; bins: Record<string, number[]>; perSec: Record<string, number> };

function useDerived(events: LiveEvent[], now: number): Derived {
  return useMemo(() => {
    const log: Record<string, LiveEvent[]> = {}, bins: Record<string, number[]> = {}, cnt3: Record<string, number> = {};
    for (const e of events) {                       // events are newest first
      const id = e.pf || "?";
      const l = log[id] || (log[id] = []);
      if (l.length < LOG) l.push(e);
      const age = now - tms(e.t);
      if (age < 0 || age >= BINS * 1000) continue;
      const b = bins[id] || (bins[id] = new Array(BINS).fill(0));
      b[BINS - 1 - Math.floor(age / 1000)]++;       // last bar = the most recent second
      if (age < 3000) cnt3[id] = (cnt3[id] || 0) + 1;
    }
    const perSec: Record<string, number> = {};
    for (const k in cnt3) perSec[k] = cnt3[k] / 3;
    return { log, bins, perSec };
  }, [events, now]);
}

function Strip({ bins, color }: { bins?: number[]; color: string }) {
  const b = bins || new Array(BINS).fill(0);
  const mx = Math.max(2, ...b);
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden>
      {b.map((v, i) => <div key={i} className="bw-bar flex-1 rounded-sm" style={{ height: `${v ? Math.max(12, (v / mx) * 100) : 6}%`, background: v ? color : "#24324766", opacity: v ? 0.35 + 0.65 * (i / BINS) : 1 }} />)}
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-bold leading-6 tabular-nums" style={{ color: tone }}><AnimNum v={v} /></div>
      <div className="text-[10.5px] leading-3 text-mute">{label}</div>
    </div>
  );
}

function Card({ p, d, busiest, pinned, on }: { p: ProfileView; d: Derived; busiest: boolean; pinned: boolean; on: { enter: () => void; leave: () => void; click: () => void; ref: (el: HTMLElement | null) => void } }) {
  const b = BOTS[p.id] || { icon: "🤖", name: p.id, color: "#fb923c", does: "", stoppedBy: "", expect: "" };
  const human = p.id === "HUMAN";
  const name = human ? "Real people" : b.name;
  const chip = chipFor(p);
  const bp = pctOf(p.blocked, p.requests);
  const rate = d.perSec[p.id] || 0;
  return (
    <div ref={on.ref} role="button" tabIndex={0} aria-pressed={pinned} aria-label={`${name}: watch live`}
      onMouseEnter={on.enter} onMouseLeave={on.leave} onFocus={on.enter} onBlur={on.leave} onClick={on.click}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); on.click(); } }}
      className="relative cursor-pointer overflow-hidden rounded-xl border bg-panel/70 p-3 outline-none backdrop-blur transition-shadow focus-visible:ring-2 focus-visible:ring-accent"
      style={{ borderColor: pinned ? b.color : "#243247", borderTop: `3px solid ${b.color}`, boxShadow: busiest ? `0 0 22px -4px ${b.color}88, inset 0 0 30px -18px ${b.color}` : "0 1px 0 #ffffff08 inset" }}>
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{b.icon}</span>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: b.color }}>{name}</div>
        {rate > 0 && <span className="bw-dot h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} title="Active right now" />}
        {pinned && <span className="text-[10px] text-mute" title="Pinned: click again to unpin">📌</span>}
      </div>
      <p className="mt-1 line-clamp-2 min-h-8 text-[11.5px] leading-4 text-mute">{b.does}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Stat label={human ? "people" : "bot accounts"} v={p.accounts} />
        <Stat label="got in (fair sale)" v={p.gotInFair} tone={p.gotInFair ? "#e8eef6" : "#22c55e"} />
        <Stat label="requests sent" v={p.requests} />
        <Stat label="turned away" v={p.blocked} tone={p.blocked ? "#ef4444" : undefined} />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" title={`${bp.toFixed(0)}% of its requests were turned away`}>
        <div className="h-full rounded-full bg-bad transition-[width] duration-500" style={{ width: bp + "%" }} />
      </div>
      <div className="mt-0.5 text-[10.5px] text-mute">{p.requests ? `${bp.toFixed(0)}% of its requests turned away` : "no requests yet"}</div>
      <div className="mt-2"><Strip bins={d.bins[p.id]} color={b.color} /></div>
      <div className="mt-0.5 flex justify-between text-[10px] text-mute"><span>last 30 seconds</span><span>now</span></div>
      <div className="mt-2 rounded-md px-2 py-1 text-[11px] font-medium leading-4" style={{ color: chip.c, background: chip.c + "1a", border: `1px solid ${chip.c}44` }}>{chip.t}</div>
    </div>
  );
}

/** the "Live view" popover for one kind */
function LiveView({ id, d, hist, running, pinned, onClose, enter, leave, pos, setEl }: { id: string; d: Derived; hist?: LiveEvent[]; running: boolean; pinned: boolean; onClose: () => void; enter: () => void; leave: () => void; pos: { left: number; top: number } | null; setEl: (el: HTMLDivElement | null) => void }) {
  const b = BOTS[id] || { icon: "🤖", name: id, color: "#fb923c", does: "", stoppedBy: "", expect: "" };
  const human = id === "HUMAN";
  const liveRows = d.log[id] || [];
  const replay = liveRows.length === 0 && !!hist?.length;      // quiet right now: show what it did last, from the record
  const rows = replay ? hist! : liveRows;
  const rate = d.perSec[id] || 0;
  return createPortal(
    <div ref={setEl} onMouseEnter={enter} onMouseLeave={leave} role="dialog" aria-label={`Live view: ${human ? "Real people" : b.name}`}
      className="bw-pop fixed z-50 overflow-y-auto rounded-xl border bg-[#0d141d]/95 p-4 shadow-2xl backdrop-blur"
      style={{ width: "min(460px, calc(100vw - 16px))", maxHeight: "min(80vh, 620px)", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", borderColor: b.color + "88", borderTop: `3px solid ${b.color}`, boxShadow: `0 20px 50px -10px #000, 0 0 30px -10px ${b.color}66` }}>
      <div className="flex items-start gap-2">
        <span className="text-2xl leading-none">{b.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-mute">Live view</div>
          <div className="text-base font-bold" style={{ color: b.color }}>{human ? "Real people" : b.name}</div>
        </div>
        {pinned && <button onClick={onClose} className="rounded-md border border-line px-2 py-0.5 text-sm text-mute hover:text-ink" aria-label="Close live view">✕</button>}
      </div>
      <p className="mt-2 text-[12.5px] leading-5"><b className="text-ink">The trick: </b><span className="text-mute">{b.does}</span></p>
      <p className="mt-1 text-[12.5px] leading-5"><b className="text-ink">{human ? "How they are treated: " : "Why it fails: "}</b><span className="text-mute">{human ? "Like everyone else: one verified person gets one entry, and the draw is random." : b.stoppedBy}</span></p>
      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-mute">{replay ? "Not active right now: its last recorded actions" : "What it is doing right now"}</div>
        <div className="text-xs tabular-nums" style={{ color: rate ? b.color : MUTE }}><b className="text-sm">{rate.toFixed(1)}</b> actions per second right now</div>
      </div>
      <div className="mt-1.5 rounded-lg bg-black/40 p-1.5 font-mono text-[11px] leading-4">
        {rows.length === 0 && <div className="p-2 text-mute">{running ? "Nothing from this kind yet. It appears here the moment it acts." : "No test has run yet. Press Start and watch this fill up."}</div>}
        {rows.map((e) => (
          <div key={e.mode + e.id} className="bw-in flex gap-1.5 whitespace-nowrap rounded px-1 py-0.5" style={{ color: verdictColor(e.v) }}>
            <span className="shrink-0 text-mute">{clock(e.t)}</span>
            <span className="w-[14ch] shrink-0 truncate text-ink" title={e.a}>{shortId(e.a)}</span>
            <span className="w-[13ch] shrink-0 truncate text-mute" title="address">{e.ip}</span>
            <Mode m={e.mode} />
            <span className="min-w-0 whitespace-normal">{sayEvent(e)}</span>
          </div>
        ))}
      </div>
      {!pinned && <div className="mt-2 text-[10.5px] text-mute">Click the card to keep this open.</div>}
    </div>,
    document.body,
  );
}

function place(r: DOMRect, w: number, h: number) {
  const vw = window.innerWidth, vh = window.innerHeight, m = 8, g = 10;
  const clampT = (t: number) => Math.max(m, Math.min(t, vh - h - m));
  if (r.right + g + w <= vw - m) return { left: r.right + g, top: clampT(r.top) };
  if (r.left - g - w >= m) return { left: r.left - g - w, top: clampT(r.top) };
  const left = Math.max(m, Math.min(r.left, vw - w - m));
  return { left, top: r.bottom + g + h <= vh - m ? r.bottom + g : clampT(r.top - h - g) };
}

type Filter = "all" | "humans" | string;

function Console({ a }: { a: Arena }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<LiveEvent[]>([]);
  const [follow, setFollow] = useState<string | null>(null);
  const events = paused ? frozen : a.events;
  const lines = useMemo(() => {
    if (follow) return events.filter((e) => e.a === follow).slice(0, FOLLOW).reverse();   // in the order it happened
    const f = filter === "all" ? () => true : filter === "humans" ? (e: LiveEvent) => e.pf === "HUMAN" || e.k === "human" : (e: LiveEvent) => e.pf === filter;
    const out: LiveEvent[] = [];
    for (const e of events) { if (f(e)) { out.push(e); if (out.length >= CONSOLE) break; } }
    return out;
  }, [events, filter, follow]);
  const kinds = a.profiles.filter((p) => p.id !== "HUMAN");
  const chip = (k: Filter, label: string, color = "#2dd4bf") => (
    <button key={k} onClick={() => { setFilter(k); setFollow(null); }} className="rounded-full border px-2.5 py-0.5 text-[11px] transition-colors"
      style={filter === k && !follow ? { color: "#0a0e14", background: color, borderColor: color, fontWeight: 600 } : { color: MUTE, borderColor: "#243247" }}>{label}</button>
  );
  return (
    <div className="rounded-xl border border-line bg-[#0b1118]/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="mr-1 flex items-center gap-2 text-sm font-semibold">
          <span className="font-mono text-accent">&gt;_</span> Bot console
          {!paused && a.events.length > 0 && <span className="bw-dot h-2 w-2 rounded-full bg-ok" title="Live" />}
        </div>
        {follow ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-mute">Following</span><b className="font-mono text-accent" title={follow}>{shortId(follow)}</b>
            <button onClick={() => setFollow(null)} className="text-accent underline hover:no-underline">← back to everything</button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chip("all", "Everything")}
            {chip("humans", "Only real people", "#38bdf8")}
            {kinds.map((p) => chip(p.id, `${BOTS[p.id]?.icon || ""} ${BOTS[p.id]?.name || p.id}`, BOTS[p.id]?.color || "#fb923c"))}
          </div>
        )}
        <button onClick={() => { if (!paused) setFrozen(a.events); setPaused(!paused); }} className="ml-auto rounded-md border border-line px-2.5 py-0.5 text-xs text-ink hover:border-accent">
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
      </div>
      <div className="max-h-[440px] overflow-y-auto p-2 font-mono text-[11.5px] leading-[18px]">
        {paused && <div className="mb-1 rounded bg-warn/15 px-2 text-warn">Paused: the list is frozen. New actions keep happening in the background.</div>}
        {lines.length === 0 && <div className="p-3 text-mute">{a.events.length === 0 ? "Waiting for the bots… press Start." : "Nothing matches this filter yet."}</div>}
        {lines.map((e) => (
          <div key={e.mode + e.id} className={`${follow ? "" : "bw-in"} flex gap-2 whitespace-nowrap rounded px-1 hover:bg-white/5`} style={{ color: verdictColor(e.v) }}>
            <span className="shrink-0 text-mute">{clock(e.t)}</span>
            <Mode m={e.mode} />
            <button onClick={() => setFollow(e.a)} title={`${e.a}: click to follow only this account`} className="w-[14ch] shrink-0 truncate text-left text-ink underline decoration-dotted hover:text-accent">{shortId(e.a)}</button>
            <span className="hidden w-[14ch] shrink-0 truncate text-mute sm:inline" title="address">{e.ip}</span>
            <span className="min-w-0 truncate" title={sayEvent(e)}>{BOTS[e.pf] && e.pf !== "HUMAN" ? <span className="text-mute">{BOTS[e.pf].icon} </span> : null}{sayEvent(e)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BotWatch({ a }: { a: Arena }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = useDerived(a.events, now);
  const d0 = useRef(d); d0.current = d;

  const [hover, setHover] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const shown = hover ?? pin;
  // a kind that has been quiet falls out of the short live list: fetch its last recorded actions from the server so the popup is never empty for a bot that did act
  const [hist, setHist] = useState<Record<string, LiveEvent[]>>({});
  useEffect(() => { setHist({}); }, [a.fairId, a.running?.id]);
  useEffect(() => {
    if (!shown || !a.fairId || (d0.current.log[shown]?.length || 0) > 0) return;
    let alive = true;
    (async () => {
      const got: LiveEvent[] = [];
      for (const [id, mode] of [[a.fairId, "fairdrop"], [a.oldId, "fcfs"]] as const) {
        if (!id) continue;
        try { const r = await api<any>(`/admin/drops/${id}/feed?pf=${shown}`, { auth: "admin" }); got.push(...(r.events || []).map((e: any) => ({ ...e, mode }))); } catch { /* ignore */ }
      }
      got.sort((x, y) => tms(y.t) - tms(x.t));
      if (alive) setHist((h) => ({ ...h, [shown]: got.slice(0, 14) }));
    })();
    return () => { alive = false; };
  }, [shown, a.fairId, a.oldId]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cards = useRef<Record<string, HTMLElement | null>>({});
  const pop = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const enter = (id: string) => { clearTimeout(timer.current); setHover(id); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(null), 220); };   // grace time to cross the gap to the popover
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setPin(null); setHover(null); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const rows = shown ? (d.log[shown] || []).length : 0;
  const measure = () => {
    const c = shown && cards.current[shown], p = pop.current;
    if (c && p) setPos(place(c.getBoundingClientRect(), p.offsetWidth, p.offsetHeight));
  };
  useLayoutEffect(() => { setPos(null); }, [shown]);
  useLayoutEffect(() => { measure(); }, [shown, rows, pos === null]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shown) return;
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [shown]);   // eslint-disable-line react-hooks/exhaustive-deps

  const bots = a.profiles.filter((p) => p.id !== "HUMAN");
  const human = a.profiles.find((p) => p.id === "HUMAN");
  const list = human ? [...bots, human] : bots;
  const busiest = useMemo(() => {
    let best = "", mx = 0;
    for (const k in d.perSec) if (k !== "HUMAN" && d.perSec[k] > mx) { mx = d.perSec[k]; best = k; }
    return best;
  }, [d]);

  return (
    <div className="space-y-4">
      <style>{CSS}</style>
      <div>
        <h3 className="text-base font-semibold">Watch the bots work</h3>
        <p className="text-xs text-mute">Hover a card (or tab to it) to see that bot&apos;s actions live. Click to keep the view open.</p>
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-mute">No bots yet. Press Start and they will show up here.</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
          {list.map((p) => (
            <Card key={p.id} p={p} d={d} busiest={p.id === busiest} pinned={pin === p.id}
              on={{ enter: () => enter(p.id), leave, click: () => setPin((x) => (x === p.id ? null : p.id)), ref: (el) => { cards.current[p.id] = el; } }} />
          ))}
        </div>
      )}
      {shown && typeof document !== "undefined" && (
        <LiveView id={shown} d={d} hist={hist[shown]} running={!!a.running} pinned={pin === shown} onClose={() => { setPin(null); setHover(null); }} enter={() => clearTimeout(timer.current)} leave={leave} pos={pos} setEl={(el) => { pop.current = el; }} />
      )}
      <Console a={a} />
    </div>
  );
}
