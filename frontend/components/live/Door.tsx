"use client";
// One door of the Booking Theatre: poster name + rule, the numbered booking pipeline with REAL counts, the crowd flowing through, the 500 seats, and the verdict.
import { Check } from "lucide-react";
import type { Arena, LiveEvent, MethodView } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import { Badge, Counter, Led, cn } from "@/components/ui";
import Flow from "./Flow";
import SeatGrid from "./SeatGrid";
import { Station, dormant, stationsFor } from "./stations";
import { MethodKey, N, fmtPct } from "./derive";

const T = {
  fcfs: { hex: "#ff3b5c", text: "text-hot", border: "border-hot/60", activeBox: "border-hot bg-hot/10", num: "bg-hot text-white", bar: "bg-hot", glow: "glow-hot", chip: "border-hot/50 bg-hot/10 text-hot" },
  naive: { hex: "#8b6cff", text: "text-violet", border: "border-violet/60", activeBox: "border-violet bg-violet/10", num: "bg-violet text-white", bar: "bg-violet", glow: "glow-violet", chip: "border-violet/50 bg-violet/10 text-violet" },
  fair: { hex: "#ffc233", text: "text-gold", border: "border-gold/70", activeBox: "border-gold bg-gold/10", num: "bg-gold text-black", bar: "bg-gold", glow: "glow-gold", chip: "border-gold/60 bg-gold/10 text-gold" },
} as const;

const SPEC: Record<MethodKey, { n: string; name: string; rule: string; login: string; control: string; flow: "fcfs" | "lottery" | "fair" }> = {
  fcfs: { n: "A", name: "First come, first served", rule: "The old way. Fastest click wins. Nobody checks who you are.", login: "Up to 4 seats per login · fastest click wins", control: "The bots' speed decides.", flow: "fcfs" },
  naive: { n: "B", name: "Simple lottery", rule: "A random draw, but every request goes into the hat as its own ticket.", login: "Every request = 1 ticket", control: "The number of requests decides.", flow: "lottery" },
  fair: { n: "C", name: "Fair Drop", rule: "One verified person, one ticket. The list is sealed, the draw is public.", login: "1 login · 1 ticket · 1 seat at most", control: "The random draw alone decides. Bots and admins cannot pick winners.", flow: "fair" },
};

const TONE: Record<string, string> = { ice: "text-ice", hot: "text-hot", lime: "text-lime", warn: "text-warn", mute: "text-ink" };
const STATUS_TONE: Record<MethodView["status"], "gray" | "green" | "violet" | "amber" | "gold"> = { waiting: "gray", live: "green", expected: "violet", estimate: "amber", final: "gold" };

function StationRow({ s, i, k }: { s: Station; i: number; k: MethodKey }) {
  const t = T[k];
  return (
    <li tabIndex={0} className="group relative z-0 flex flex-1 flex-col outline-none hover:z-30 focus-visible:z-30 focus-within:z-30">
      <div className={cn("flex flex-1 items-center gap-3 rounded-[4px] border px-3 py-2 transition duration-200", s.state === "active" ? cn(t.activeBox, t.glow) : s.state === "done" ? "border-lime/30 bg-lime/5" : "border-line bg-panel2/40", "group-focus-visible:ring-2 group-focus-visible:ring-gold/80")}>
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-xs font-bold", s.state === "active" ? t.num : s.state === "done" ? "bg-lime text-black" : "bg-line text-mute")}>
          {s.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3.2} /> : i + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-center gap-2 text-[15px] font-bold leading-tight", s.state === "idle" ? "text-[#cfc7e6]" : "text-ink")}>
            {s.title}{s.state === "active" && <Led tone={k === "fcfs" ? "hot" : k === "naive" ? "violet" : "gold"} pulse />}
          </div>
          <div className="text-[14px] leading-snug text-[#cfc7e6]">{s.line}</div>
          {s.counts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              {s.counts.map((c) => (
                <span key={c.label} className="flex items-baseline gap-1.5">
                  <Counter value={c.v} className={cn("display text-2xl", TONE[c.tone || "mute"])} />
                  <span className="font-mono text-[10px] uppercase tracking-[.12em] text-mute">{c.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div role="tooltip" className="pointer-events-none invisible absolute inset-x-0 top-full mt-1 translate-y-1 rounded-[4px] border border-line bg-panel2 p-3 text-[13px] leading-snug opacity-0 shadow-[0_18px_40px_-10px_rgba(0,0,0,.9)] transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <p className="text-ink">{s.what}</p>
        <p className="mt-1.5"><b className="text-lime">Passes:</b> <span className="text-mute">{s.pass}</span></p>
        <p className="mt-0.5"><b className="text-hot">Stopped:</b> <span className="text-mute">{s.stop}</span></p>
      </div>
    </li>
  );
}

export default function Door({ a, k, events, live }: { a: Arena; k: MethodKey; events: LiveEvent[]; live: boolean }) {
  const t = T[k], sp = SPEC[k], m = a.methods[k];
  const stations = stationsFor(k, a);
  const sleeping = dormant(k, a);
  const hs = Math.max(0, Math.round(m.humanSeats)), bs = Math.max(0, Math.round(m.botSeats));
  const waiting = m.status === "waiting";
  const empty = Math.max(0, SEATS - hs - bs);
  return (
    <article className={cn("min-w-0 overflow-visible rounded-[6px] border bg-panel", t.border, k === "fair" && "glow-gold")} style={{ display: "grid", gridRow: "span 5", gridTemplateRows: "subgrid", rowGap: 0 }} aria-label={sp.name}>
      <header className="@container space-y-2 px-4 pb-3 pt-0">
        <div className={cn("-mx-4 mb-3 h-1.5 rounded-t-[5px]", t.bar)} />
        <div className="flex items-start justify-between gap-3">
          <div className="eyebrow">Door {sp.n}</div>
          <Badge tone={STATUS_TONE[m.status]} title={m.note}>{m.status === "live" && <Led tone="lime" pulse />}{m.status}</Badge>
        </div>
        <h3 className={cn("display text-[40px] @[520px]:text-5xl", t.text)}>{sp.name}</h3>
        <p className="text-[15px] leading-snug text-ink/90">{sp.rule}</p>
        <div className={cn("inline-block rounded-[3px] border px-2.5 py-1.5 font-mono text-[12px] font-bold uppercase tracking-[.08em]", t.chip)}>{sp.login}</div>
        <p className="text-[13px] text-mute"><span className="eyebrow mr-2">Who is in control</span><b className={t.text}>{sp.control}</b></p>
        {sleeping && <p className="rounded-[3px] border border-line bg-bg/60 px-3 py-1.5 text-[13px] text-mute">{sleeping}</p>}
      </header>

      <ol className="flex flex-col gap-2 px-4 pb-4" aria-label="Booking pipeline">
        {stations.map((s, i) => <StationRow key={s.title} s={s} i={i} k={k} />)}
      </ol>

      <div className="px-4 pb-4"><Flow kind={sp.flow} events={events} live={live} accent={t.hex} /></div>

      <div className="@container relative px-4 pb-4">
        <div className="grid items-start gap-4 @[520px]:grid-cols-[350px_1fr]">
          <div className="relative">
            <SeatGrid humanSeats={hs} botSeats={bs} solid={m.status === "live" || m.status === "final"} />
            {waiting && <div className="absolute inset-0 grid place-items-center rounded-[3px] bg-bg/70 font-mono text-xs uppercase tracking-[.2em] text-mute">Waiting for the result</div>}
          </div>
          <div className={cn("space-y-3", waiting && "opacity-40")}>
            <div><div className="display num text-5xl text-ice"><Counter value={hs} /></div><div className="text-[13px] text-mute">seats to real people</div></div>
            <div><div className="display num text-5xl text-hot"><Counter value={bs} /></div><div className="text-[13px] text-mute">seats to bots</div></div>
            <div className="font-mono text-[11px] uppercase tracking-[.14em] text-mute">{N(empty)} of {SEATS} empty</div>
          </div>
        </div>
      </div>

      <footer className="space-y-1.5 border-t border-line bg-bg/40 px-4 py-4">
        {waiting
          ? <p className="text-[15px] text-[#cfc7e6]">No result yet.</p>
          : <p className="text-lg font-semibold leading-snug">Bots were <b className="text-hot">{fmtPct(m.botCrowdSharePct)}</b> of the crowd and took <b className="text-hot">{fmtPct(m.botSeatSharePct)}</b> of the seats.</p>}
        <p className="text-[12px] leading-snug text-mute"><span className="eyebrow mr-1.5">Where this number comes from</span>{m.note}</p>
      </footer>
    </article>
  );
}
