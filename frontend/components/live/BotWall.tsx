"use client";
// THE ATTACKERS, LIVE: a wanted-board with one card per kind of bot (plus the real people as the baseline).
// Hover, focus or tap a card to see that kind's latest actions in words; click it to keep the view open.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pin, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Arena, LiveEvent, Mode, ProfileView } from "@/lib/arena";
import { BOTS, n } from "@/components/admin/botinfo";
import BotGlyph from "@/components/BotGlyph";
import { Callout, Counter, Eyebrow, Led, SectionHead, cn } from "@/components/ui";
import { MODE_TAG, clock, kindName, sayEvent, shortId, tms, verdictColor } from "./botText";

const BINS = 30;          // activity strip: 30 bars, one second each
const LOG = 14;           // lines in the live view
const MUTE = "#9a90b8";
const ICE = "#7fd8ff";
const GOLD = "#ffc233";
const WARN = "#ff8a3d";
const HUMAN_DOES = "A real person: one device, one attempt, polite retries.";
const HUMAN_ANSWER = "Like everyone else: one verified person gets one entry, and the draw is random.";

const CSS = `
@keyframes bw-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@keyframes bw-pop { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: none; } }
.bw-in { animation: bw-in .25s ease-out; }
.bw-pop { animation: bw-pop .16s ease-out; }
.bw-bar { transition: height .45s ease, background-color .3s; }
@media (prefers-reduced-motion: reduce) { .bw-in, .bw-pop { animation: none; } .bw-bar { transition: none; } }
`;

const pctOf = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

/** the plain verdict, worked out from the numbers (never typed in) */
function verdictFor(p: ProfileView): { t: string; c: string } {
  if (p.id === "HUMAN") return { t: "Treated like everyone: 1 entry each", c: ICE };
  if (!p.requests && !p.gotInFair) return { t: "Waiting for it to act", c: MUTE };
  if (p.id === "SYBIL_OPERATOR") return { t: "Not blocked, by design: each bought account gets 1 entry", c: WARN };
  if (p.gotInFair === 0) return { t: "None of its accounts has got in so far", c: GOLD };
  if (p.gotInFair >= p.accounts) return { t: "Held to 1 entry per account, the most any account can get", c: GOLD };
  return { t: `Held to 1 entry per account: ${n(p.gotInFair)} of ${n(p.accounts)} accounts got in`, c: GOLD };
}


// "Who controls what": what a kind of bot decides for itself, and what it can never decide. Worded from botinfo.ts; the counts are live.
const OWN: Record<string, string> = {
  SPEED_BOT: "when it fires: the instant the sale opens, then non-stop",
  FLOOD_BOT: "the flood: hundreds of mixed requests from one account",
  RETRY_BOT: "repeating the same request, even several at once",
  PROXY_ROTATOR: "its addresses: a different internet address for every request",
  API_SCRAPER: "which door it takes: it spots the hidden fast endpoint, which is the decoy",
  UI_MIMIC: "its pace: slow steps, like a person",
  CRYPTO_SWARM: "making its own tickets the real way, for many accounts at once",
  SMART_SCRAPER: "its addresses (many) and the decoy: it avoids it",
  STATE_SNIPER: "timing: bursts in the fraction of a second around opening and closing",
  CLAIM_SNIPER: "timing: hammering the claim button for the whole claiming time",
  HUMAN: "its own login and when it clicks",
};
const NEVER = ["its place in the draw", "a second entry for one login", "the sealed list", "the draw seed"];

function controlsOf(p: ProfileView): { controls: string[]; never: string[]; farm?: string } {
  const live = p.id === "HUMAN" ? [`${n(p.accounts)} login${p.accounts === 1 ? "" : "s"}`] : [`${n(p.accounts)} account${p.accounts === 1 ? "" : "s"}`, `${n(p.requests)} requests sent`];
  const own = OWN[p.id];
  return {
    controls: [...live, ...(own && p.id !== "HUMAN" ? [own] : p.id === "HUMAN" ? [own] : [])],
    never: NEVER,
    farm: p.id === "SYBIL_OPERATOR" ? `It controls MORE accounts (${n(p.accounts)}), but each account is still 1 entry. The only brake is what each account costs.` : undefined,
  };
}

/** tickets tried vs entries allowed: makes "1 login = 1 ticket" visible */
function TicketsVsAllowed({ p }: { p: ProfileView }) {
  const tried = p.tickets, allowed = p.accounts, extra = Math.max(0, tried - allowed);
  const w = tried > 0 ? Math.min(100, (allowed / tried) * 100) : 100;
  return (
    <div title="Every login may enter once. A simple lottery would count every request as a ticket.">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px] leading-4">
        <span><b className="num text-ink">{n(tried)}</b> <span className="text-mute">tickets tried</span></span>
        <span><b className="num text-gold">{n(allowed)}</b> <span className="text-mute">entries allowed (1 per login)</span></span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-[2px] bg-hot/40"><div className="h-full bg-gold transition-[width] duration-500" style={{ width: w + "%" }} /></div>
      <div className="mt-0.5 text-[11px] leading-4 text-mute">{tried === 0 ? "No ticket tried yet." : extra > 0 ? `${n(extra)} extra tries: refused. ${n(p.gotInFair)} got in.` : `${n(p.gotInFair)} got in: never more than 1 per login.`}</div>
    </div>
  );
}

function Controls({ p, full }: { p: ProfileView; full?: boolean }) {
  const c = controlsOf(p);
  if (full) return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div><div className="eyebrow !text-[10px] !text-gold">Controls</div><ul className="mt-1 space-y-0.5 text-[12.5px] leading-5 text-ink/85">{c.controls.map((x) => <li key={x}>{x}</li>)}</ul></div>
      <div><div className="eyebrow !text-[10px] !text-hot">Can never control</div><ul className="mt-1 space-y-0.5 text-[12.5px] leading-5 text-ink/85">{c.never.map((x) => <li key={x}>{x}</li>)}</ul></div>
      {c.farm && <p className="text-[12.5px] leading-5 text-warn sm:col-span-2">{c.farm}</p>}
    </div>
  );
  return (
    <div className="rounded-[4px] border border-line bg-panel2/60 p-2.5 text-[12px] leading-4">
      <p><b className="text-gold">Controls: </b><span className="text-ink/85">{c.controls.join(" · ")}</span></p>
      <p className="mt-1"><b className="text-hot">Can never control: </b><span className="text-ink/85">{c.never.join(" · ")}</span></p>
      {c.farm && <p className="mt-1 text-warn">{c.farm}</p>}
    </div>
  );
}

type Derived = { log: Record<string, LiveEvent[]>; bins: Record<string, number[]>; perSec: Record<string, number> };

function useDerived(events: LiveEvent[], now: number, stat: Arena["feedStat"]): Derived {
  return useMemo(() => {
    const log: Record<string, LiveEvent[]> = {}, bins: Record<string, number[]> = {};
    const c3: Record<string, Record<string, number>> = {}, tot3: Record<string, number> = {};   // sampled events of the last 3 s: per sale, per kind
    const at = now + stat.skew;                      // server time: ages must not depend on the browser clock
    for (const e of events) {                       // events are newest first
      const id = e.pf || "?";
      const l = log[id] || (log[id] = []);
      if (l.length < LOG) l.push(e);
      const age = at - tms(e.t);
      if (age < 0 || age >= BINS * 1000) continue;
      const b = bins[id] || (bins[id] = new Array(BINS).fill(0));
      b[BINS - 1 - Math.floor(age / 1000)]++;       // last bar = the most recent second
      if (age < 3000) { (c3[e.mode] || (c3[e.mode] = {}))[id] = (c3[e.mode][id] || 0) + 1; tot3[e.mode] = (tot3[e.mode] || 0) + 1; }
    }
    // the server samples the event list under load but counts every request exactly: each kind's share of the sample x the exact rate
    const perSec: Record<string, number> = {};
    for (const m in c3) for (const k in c3[m]) {
      const exact = stat.exact[m as Mode];
      perSec[k] = (perSec[k] || 0) + (exact !== undefined && tot3[m] ? (c3[m][k] / tot3[m]) * exact : c3[m][k] / 3);
    }
    return { log, bins, perSec };
  }, [events, now, stat]);
}

function Spark({ bins, color }: { bins?: number[]; color: string }) {
  const b = bins || new Array(BINS).fill(0);
  const mx = Math.max(2, ...b);
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden>
      {b.map((v, i) => <div key={i} className="bw-bar flex-1 rounded-[1px]" style={{ height: `${v ? Math.max(14, (v / mx) * 100) : 6}%`, background: v ? color : "#2b2342", opacity: v ? 0.35 + 0.65 * (i / BINS) : 1 }} />)}
    </div>
  );
}

function Fig({ label, v, tone }: { label: string; v: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="display num text-2xl" style={{ color: tone }}><Counter value={v} /></div>
      <div className="text-[11px] leading-3.5 text-mute">{label}</div>
    </div>
  );
}

type Hooks = { enter: () => void; leave: () => void; click: () => void; ref: (el: HTMLElement | null) => void };

function Card({ p, i, d, busiest, pinned, on }: { p: ProfileView; i: number; d: Derived; busiest: boolean; pinned: boolean; on: Hooks }) {
  const human = p.id === "HUMAN";
  const b = BOTS[p.id];
  const color = human ? ICE : b?.color || "#fb923c";
  const v = verdictFor(p);
  const rate = d.perSec[p.id] || 0;
  return (
    <div ref={on.ref} role="button" tabIndex={0} aria-pressed={pinned} aria-label={`${kindName(p.id)}: watch live`}
      onMouseEnter={on.enter} onMouseLeave={on.leave} onFocus={on.enter} onBlur={on.leave} onClick={on.click}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); on.click(); } }}
      className={cn("panel relative flex cursor-pointer flex-col overflow-hidden outline-none transition-[box-shadow,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-gold", human && "border-dashed")}
      style={{ borderColor: pinned ? color : undefined, boxShadow: busiest ? `0 0 0 1px ${color}66, 0 0 30px -8px ${color}88` : undefined }}>
      <div className="h-1.5 w-full" style={{ background: color }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border" style={{ borderColor: color + "55", background: color + "14" }}><BotGlyph id={p.id} size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow !text-[10px]">{human ? "The baseline" : `File ${String(i + 1).padStart(2, "0")}`}</div>
            <div className="display truncate text-2xl" style={{ color }}>{kindName(p.id)}</div>
          </div>
          {rate > 0 && <Led tone={human ? "ice" : "hot"} pulse className="mt-1" />}
          {pinned && <Pin size={14} className="mt-1 shrink-0 text-gold" aria-label="Pinned" />}
        </div>

        <div className="mt-3 space-y-2 text-[13px] leading-[18px]">
          <p><span className="eyebrow !text-[10px] block">What it does</span><span className="line-clamp-2 text-ink/85">{human ? HUMAN_DOES : b?.does}</span></p>
          <p><span className="eyebrow !text-[10px] block !text-gold/80">How Fair Drop answers</span><span className="line-clamp-2 text-ink/85">{human ? HUMAN_ANSWER : b?.stoppedBy}</span></p>
        </div>

        <div className="mt-3"><Controls p={p} /></div>

        <hr className="perf my-3" />

        <TicketsVsAllowed p={p} />

        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3">
          <Fig label={human ? "people" : "accounts it runs"} v={p.accounts} />
          <Fig label="requests sent" v={p.requests} />
          <Fig label="reached the ticket step" v={p.tickets} />
          <Fig label="turned away" v={p.blocked} tone={p.blocked ? "#ff3b5c" : undefined} />
          <Fig label="got in (Fair Drop)" v={p.gotInFair} tone={p.gotInFair ? "#b8ff4a" : undefined} />
          <Fig label="seats in the old way" v={p.seatsOld} tone={p.seatsOld ? "#ff3b5c" : undefined} />
        </div>

        <div className="mt-3">
          <Spark bins={d.bins[p.id]} color={color} />
          <div className="mt-0.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-mute"><span>last 30 s</span><span>{rate > 0 ? `${rate.toFixed(1)}/s now` : "quiet"}</span></div>
        </div>

        <div className="mt-auto pt-3">
          <div className="rounded-[4px] border px-2.5 py-1.5 text-[12px] font-medium leading-4" style={{ color: v.c, background: v.c + "14", borderColor: v.c + "44" }}>{v.t}</div>
        </div>
      </div>
    </div>
  );
}

/** the popover for one kind: what it is, how it fails, and a mini-console of its latest actions in words */
function LiveView({ id, prof, d, hist, running, pinned, onClose, enter, leave, pos, setEl }: { id: string; prof?: ProfileView; d: Derived; hist?: LiveEvent[]; running: boolean; pinned: boolean; onClose: () => void; enter: () => void; leave: () => void; pos: { left: number; top: number } | null; setEl: (el: HTMLDivElement | null) => void }) {
  const human = id === "HUMAN";
  const b = BOTS[id];
  const color = human ? ICE : b?.color || "#fb923c";
  const liveRows = d.log[id] || [];
  const replay = liveRows.length === 0 && !!hist?.length;      // quiet right now: show what it did last, from the record
  const rows = replay ? hist! : liveRows;
  const rate = d.perSec[id] || 0;
  return createPortal(
    <div ref={setEl} onMouseEnter={enter} onMouseLeave={leave} role="dialog" aria-label={`Live view: ${kindName(id)}`}
      className="bw-pop fixed z-50 overflow-y-auto rounded-[6px] border bg-[#0b0814]/95 p-4 backdrop-blur"
      style={{ width: "min(480px, calc(100vw - 16px))", maxHeight: "min(80vh, 640px)", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", borderColor: color + "88", borderTop: `3px solid ${color}`, boxShadow: `0 24px 60px -12px #000, 0 0 36px -12px ${color}88` }}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[4px] border" style={{ borderColor: color + "55", background: color + "14" }}><BotGlyph id={id} size={20} /></span>
        <div className="min-w-0 flex-1">
          <Eyebrow>Live view</Eyebrow>
          <div className="display text-2xl" style={{ color }}>{kindName(id)}</div>
        </div>
        {pinned && <button onClick={onClose} className="rounded-[4px] border border-line p-1.5 text-mute hover:text-ink" aria-label="Close live view"><X size={14} /></button>}
      </div>
      <p className="mt-3 text-[13px] leading-5"><b className="text-ink">What it does: </b><span className="text-ink/80">{human ? HUMAN_DOES : b?.does}</span></p>
      <p className="mt-1.5 text-[13px] leading-5"><b className="text-gold">How Fair Drop answers: </b><span className="text-ink/80">{human ? HUMAN_ANSWER : b?.stoppedBy}</span></p>
      {prof && <><Controls p={prof} full /><div className="mt-3"><TicketsVsAllowed p={prof} /></div></>}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-2">
        <div className="eyebrow !text-[10.5px]">{replay ? "Not active right now: its last recorded actions" : "What it is doing right now"}</div>
        <div className="font-mono text-[11px]" style={{ color: rate ? color : MUTE }}><b className="num text-sm">{rate.toFixed(1)}</b> actions/s</div>
      </div>
      <div className="mt-1.5 rounded-[4px] border border-line bg-black/50 p-1.5 font-mono text-[11px] leading-4">
        {rows.length === 0 && <div className="p-2 text-mute">{running ? "Nothing from this kind yet. It appears here the moment it acts." : "No test has run yet. Press Start and watch this fill up."}</div>}
        {rows.map((e) => {
          const m = MODE_TAG[e.mode] || MODE_TAG.fairdrop;
          return (
            <div key={e.mode + e.id} className="bw-in flex gap-1.5 rounded px-1 py-0.5" style={{ color: verdictColor(e.v) }}>
              <span className="shrink-0 text-mute">{clock(e.t)}</span>
              <span title={m.tip} className="shrink-0 rounded-[2px] px-1 text-[9px] font-bold leading-4" style={{ color: m.c, background: m.c + "22" }}>{m.t}</span>
              <span className="w-[12ch] shrink-0 truncate text-ink" title={e.a}>{shortId(e.a)}</span>
              <span className="min-w-0 flex-1">{sayEvent(e)}</span>
            </div>
          );
        })}
      </div>
      {!pinned && <div className="mt-2 text-[11px] text-mute">Click or tap the card to keep this open.</div>}
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

export default function BotWall({ a }: { a: Arena }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = useDerived(a.events, now, a.feedStat);
  const d0 = useRef(d); d0.current = d;

  const [hover, setHover] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const shown = hover ?? pin;
  // a kind that has been quiet falls out of the short live list: fetch its last recorded actions from the server so the popup is never empty for a bot that did act
  const [hist, setHist] = useState<Record<string, LiveEvent[]>>({});
  useEffect(() => { setHist({}); }, [a.fairId, a.running?.id]);
  useEffect(() => {
    if (!shown || !a.fairId) return;
    let alive = true;
    const load = async () => {
      if (document.hidden || (d0.current.log[shown]?.length || 0) > 0) return;   // only while this kind is quiet in the live list; re-read every few seconds while open
      const got: LiveEvent[] = [];
      for (const [id, mode] of [[a.fairId, "fairdrop"], [a.oldId, "fcfs"]] as const) {
        if (!id) continue;
        try { const r = await api<any>(`/admin/drops/${id}/feed?pf=${shown}`, { auth: "admin" }); got.push(...(r.events || []).map((e: any) => ({ ...e, mode }))); } catch { /* ignore */ }
      }
      got.sort((x, y) => tms(y.t) - tms(x.t));
      if (alive) setHist((h) => ({ ...h, [shown]: got.slice(0, LOG) }));
    };
    load(); const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
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
    if (!c || !p) return;
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { setHover(null); return; }   // the card scrolled away: let go of the popover
    setPos(place(r, p.offsetWidth, p.offsetHeight));
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
  const doing = bots.filter((p) => (d.perSec[p.id] || 0) > 0).length;

  return (
    <section className="space-y-5">
      <style>{CSS}</style>
      <SectionHead kicker="The line-up" title="The attackers, live">
        One card per kind of bot, plus real people for comparison. The numbers come live from the server. Hover, tab to or tap a card to watch that kind&apos;s latest moves in plain words. The rule at the door: 1 login · 1 ticket · 1 seat at most.
      </SectionHead>

      {!a.running && <Callout tone="warn">{a.fairId ? "Nothing is running right now. The cards show the last test. Press Start in the director's console to watch the bots work live." : "No test has run yet. Press Start in the director's console and the line-up fills with live bots."}</Callout>}
      {a.running && bots.length > 0 && <p className="text-[15px] text-ink/85">{doing > 0 ? `${doing} kind${doing === 1 ? "" : "s"} of bot ${doing === 1 ? "is" : "are"} attacking this very second. The door checks each one the same way it checks a real person.` : "The crowd is getting ready. Cards light up the moment a bot makes its first move."}</p>}

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] uppercase tracking-[.14em] text-mute" aria-label="Legend">
        <span className="flex items-center gap-1.5"><Led tone="lime" />let in</span>
        <span className="flex items-center gap-1.5"><Led tone="hot" />turned away</span>
        <span className="flex items-center gap-1.5"><Led tone="warn" />caught by the decoy trap</span>
        <span className="flex items-center gap-1.5"><Led tone="gold" />Fair Drop&apos;s answer</span>
        <span className="flex items-center gap-1.5"><Led tone="ice" />real people (dashed card)</span>
        <span className="flex items-center gap-1.5"><span className="inline-flex h-3 items-end gap-px">{[4, 8, 5, 11].map((h, i) => <i key={i} className="w-[3px] bg-mute" style={{ height: h }} />)}</span>requests per second, last 30 s</span>
      </div>

      {list.length === 0 ? (
        <div className="panel border-dashed p-8 text-center text-sm text-mute">No bots yet. Press Start and they will show up here.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" }}>
          {list.map((p, i) => (
            <Card key={p.id} p={p} i={i} d={d} busiest={p.id === busiest} pinned={pin === p.id}
              on={{ enter: () => enter(p.id), leave, click: () => setPin((x) => (x === p.id ? null : p.id)), ref: (el) => { cards.current[p.id] = el; } }} />
          ))}
        </div>
      )}
      {shown && typeof document !== "undefined" && (
        <LiveView id={shown} prof={a.profiles.find((x) => x.id === shown)} d={d} hist={hist[shown]} running={!!a.running} pinned={pin === shown} onClose={() => { setPin(null); setHover(null); }} enter={() => clearTimeout(timer.current)} leave={leave} pos={pos} setEl={(el) => { pop.current = el; }} />
      )}
    </section>
  );
}
