"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Bug, Clock, Gauge, IdCard, Lock, Repeat, Stamp, Tag, Ticket, type LucideIcon } from "lucide-react";
import { LAYERS } from "@/components/admin/botinfo";
import { Led, STATES, cn, stageName } from "@/components/ui";
import { Chapter, Kicker, Looking, Poster, Term, Wrap } from "./parts";

const ICONS: LucideIcon[] = [IdCard, Ticket, Stamp, Repeat, Gauge, Bug, Clock, Lock, Tag];

const MOVES: { t: string; d: string; how: React.ReactNode }[] = [
  { t: "One person, one entry", d: "Each verified login gets exactly one entry per drop. 1,000 retries or 1,000 internet addresses still make one entry.", how: "one ticket per verified phone; a repeat gets the same receipt back" },
  { t: "A signed receipt", d: "Entering gives you a receipt signed by the server. Your arrival time is recorded but never used: second 1 or minute 10 is identical.", how: <>digital signature; the ticket itself uses a <Term word="blind signature" plain="signed without being seen" /></> },
  { t: "Seal the list, then draw", d: "When the window closes, the entry list is fingerprinted and published BEFORE the server reveals its secret seed.", how: <><Term word="Merkle root" plain="one fingerprint of every entry" /> and a seed committed in advance</> },
  { t: "A draw anyone re-runs", d: "Paste your receipt into the verify page and your own browser re-runs the whole draw. No need to trust us.", how: "scores come only from the seed and the sealed list, so every computer gets the same winners" },
];

// what the backend does at each stage, in the plain wording from DESIGN.md
const BACKEND: Record<string, React.ReactNode> = {
  SCHEDULED: "Waiting. Nothing is accepted yet.",
  OPEN: <>The gateway spreads requests over 3 servers. Each checks ID, rate limit and one-ticket-per-person, signs the ticket without seeing it, and records the entry in <Term word="Redis" plain="a very fast shared notepad" />.</>,
  CLOSED: "New entries are refused. The list is frozen.",
  LOCKED: <>A worker builds the sealed <Term word="fingerprint" plain="Merkle root" /> of every entry and publishes it BEFORE the seed is revealed.</>,
  DRAWN: "The seed is revealed, the server ranks all entries, and anyone can re-run it.",
  CLAIM: "Winners claim within a window. Unclaimed seats pass down the waiting list.",
  SETTLED: <>Finished. The record is permanent in <Term word="Postgres" plain="the permanent database" />.</>,
};

export default function How() {
  const stack = useRef<HTMLOListElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stack.current, r = rail.current; if (!el || !r) return;
    const rows = Array.from(el.children) as HTMLElement[];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { rows.forEach((x) => (x.dataset.on = "1")); r.style.setProperty("--p", "1"); return; }
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: el, start: "top 65%", end: "bottom 60%",
      onUpdate: (s) => { const n = Math.ceil(s.progress * rows.length); rows.forEach((x, i) => { x.dataset.on = i < n ? "1" : "0"; }); r.style.setProperty("--p", String(s.progress)); },
    });
    return () => st.kill();
  }, []);

  return (
    <Chapter id="how" idx={5} className="py-24 md:py-32">
      <Wrap>
        <div className="grid items-end gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Kicker n="05" label="What we do, and how" time="2:40" />
            <Poster className="mt-4">{LAYERS.length} checks.<br /><span className="text-gold text-glow-gold">{MOVES.length} fair moves.</span></Poster>
          </div>
          <Looking>Every request walks down this stack of gates, in order. Real people pass them all (the ice column). Bots get stuck on the rims (the red diamonds). Below the gates, the gold floor is the sealed list of everyone let in.</Looking>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="solid space-y-3 rounded-[6px] p-6 text-[17px] leading-relaxed text-ink">
              <div className="eyebrow text-gold">The door, in plain words</div>
              <p>Think of a venue door with a row of guards. Each guard asks <b className="text-ink">one</b> simple question. Fail any one and you are turned away, with the reason written down.</p>
              <p className="text-[#cfc7e6]">Scroll down and watch a request pass each gate. The last two are special: one happens after the sale, and one belongs only to the old first-come sale.</p>
            </div>
          </div>

          <div className="relative pl-9">
            <div ref={rail} className="absolute bottom-3 left-[11px] top-3 w-px bg-line [--p:0]" aria-hidden>
              <div className="h-full origin-top bg-gold shadow-[0_0_12px_#ffc233] [transform:scaleY(var(--p))]" />
              <i className="led absolute -left-[3.5px] text-gold" style={{ top: "calc(var(--p) * 100%)" }} />
            </div>
            <ol ref={stack} className="space-y-3">
              {LAYERS.map((l, i) => {
                const I = ICONS[i] || Lock, after = i === 7, old = i === 8;
                return (
                  <li key={l.name} data-on="0" className={cn("group relative rounded-[5px] border bg-[rgba(10,7,20,.9)] p-4 transition duration-300 data-[on=1]:bg-[#171126]", old ? "border-hot/30 data-[on=1]:border-hot/60" : after ? "border-violet/30 data-[on=1]:border-violet/70" : "border-line data-[on=1]:border-gold/60")}>
                    <span className="absolute -left-[33px] top-5 grid h-6 w-6 place-items-center rounded-full border border-line bg-bg font-mono text-[12px] text-[#cfc7e6] group-data-[on=1]:border-gold group-data-[on=1]:text-gold">{i + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[4px] border border-line bg-bg", old ? "text-hot" : after ? "text-violet" : "text-gold")}><I className="h-[18px] w-[18px]" aria-hidden /></span>
                      <h3 className="display text-2xl">{l.name}</h3>
                      {old && <span className="eyebrow ml-auto text-hot">old way only</span>}
                      {after && <span className="eyebrow ml-auto text-violet">after the sale</span>}
                      {!old && !after && <Led tone="mute" className="ml-auto group-data-[on=1]:text-lime" />}
                    </div>
                    <div className="mt-3 grid gap-x-6 gap-y-2 text-[16px] leading-snug sm:grid-cols-2">
                      <p><span className="eyebrow mb-0.5 block text-gold">The door asks</span><span className="text-ink">{l.asks}</span></p>
                      <p><span className="eyebrow mb-0.5 block text-hot">It stops</span><span className="text-ink">{l.stops}</span></p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* the four fairness moves, as a staircase */}
        <div className="mt-24">
          <div className="eyebrow mb-5 flex items-center gap-3 text-gold"><span className="font-bold">05b</span><span className="h-px w-8 bg-gold/50" />Four fair moves that make the draw checkable</div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MOVES.map((m, i) => (
              <div key={m.t} data-reveal className={cn("solid relative overflow-hidden rounded-[6px] p-6", ["", "xl:mt-8", "xl:mt-16", "xl:mt-24"][i])}>
                <div className="display pointer-events-none absolute -right-1 -top-4 select-none text-[7rem] leading-none text-gold/[.16]">{i + 1}</div>
                <h3 className="display relative text-3xl leading-[.95]">{m.t}</h3>
                <p className="relative mt-3 text-[17px] leading-relaxed text-ink">{m.d}</p>
                <p className="relative mt-3 border-t border-dashed border-line pt-3 font-mono text-[12px] uppercase leading-relaxed tracking-[.08em] text-[#cfc7e6]"><span className="text-[#b4a0ff]">how </span>{m.how}</p>
              </div>
            ))}
          </div>
        </div>

        {/* what the backend does at each stage */}
        <div className="mt-24">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow flex items-center gap-3 text-gold"><span className="font-bold">05c</span><span className="h-px w-8 bg-gold/50" />What the backend is doing at each stage</div>
              <h3 className="display mt-2 text-[clamp(2rem,4vw,3.4rem)]">A sale, from first light to final record</h3>
            </div>
            <p className="solid max-w-sm rounded-[6px] p-4 text-[15px] text-ink">Every show moves through these seven stages in order. The stage names are the same ones you will see on the show tickets below.</p>
          </div>
          <ol className="thin-scroll -mx-5 flex gap-px overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0" data-lenis-prevent>
            {STATES.map((s, i) => (
              <li key={s} className="flex min-w-[210px] flex-1 flex-col gap-2 border border-line bg-[rgba(10,7,20,.9)] p-4 first:rounded-l-[6px] last:rounded-r-[6px] md:min-w-0">
                <div className="flex items-center justify-between"><span className="eyebrow text-gold">{String(i + 1).padStart(2, "0")}</span><Led tone={s === "LOCKED" ? "violet" : s === "OPEN" ? "lime" : s === "SETTLED" ? "mute" : "gold"} pulse={s === "OPEN"} /></div>
                <div className="display text-lg leading-none">{stageName(s)}</div>
                <p className="text-[15px] leading-snug text-ink">{BACKEND[s]}</p>
              </li>
            ))}
          </ol>
        </div>
      </Wrap>
    </Chapter>
  );
}
