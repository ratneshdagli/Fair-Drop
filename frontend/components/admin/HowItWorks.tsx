"use client";
// Two pictures for a demo audience: (1) how a real person gets in, step by step, with live numbers;
// (2) what protected us: every rule a request meets, how many it stopped in THIS test and which bots it caught.
import Link from "next/link";
import { Armchair, CalendarClock, Dices, DoorOpen, Fingerprint, Gauge, Layers, Lock, Repeat2, ShieldCheck, Signature, Magnet, Tag, Ticket, type LucideIcon } from "lucide-react";
import BotGlyph from "@/components/BotGlyph";
import { cn } from "@/components/ui";
import { BOTS, LAYERS, n } from "./botinfo";
import { Panel, PAL, TicketRule, upTo, useMaxSeats } from "./kit";

const ORDER: Record<string, number> = { SCHEDULED: 0, OPEN: 2, CLOSED: 3, LOCKED: 4, DRAWN: 5, CLAIM: 6, SETTLED: 7 };
// which of the 6 steps are finished / happening now / still to come, for each stage of the sale
const stepStatus = (state: string, i: number): "done" | "now" | "later" => {
  const nowRange: Record<string, [number, number]> = { OPEN: [0, 2], CLOSED: [3, 3], LOCKED: [4, 4], DRAWN: [5, 5], CLAIM: [5, 5] };
  if (state === "SETTLED") return "done";
  const r = nowRange[state];
  if (!r) return "later";
  return i < r[0] ? "done" : i <= r[1] ? "now" : "later";
};
// one lucide icon per protection layer (the emoji in botinfo are not used in the chrome)
const LAYER_ICON: Record<string, LucideIcon> = {
  "Real, verified person": Fingerprint, "One ticket per person": Ticket, "Genuine ticket": Signature, "One use per ticket": Repeat2, "Slow down": Gauge,
  "Decoy trap": Magnet, "Sale window": CalendarClock, "Sealed list + public draw": Lock, "Old sale: sold out / limit": Tag,
};

export default function HowItWorks({ pulse, prot, dropId, isOld }: { pulse: any; prot: any; dropId: string; isOld: boolean }) {
  const cap = useMaxSeats();
  const st = pulse?.state || "SCHEDULED";
  const at = ORDER[st] ?? 0;
  const f = pulse?.flow || {};
  const root: string = pulse?.merkle_root || "";
  const steps: { icon: LucideIcon; t: string; d: string; live: string }[] = [
    { icon: Fingerprint, t: "Prove who you are", d: "Verify your phone once, before the deadline. This is what makes you one real person.", live: "verified people only" },
    { icon: Ticket, t: "Get your ONE ticket", d: "The server signs a ticket for you without ever seeing which one is yours (a “blind” signature). Ask twice and the second is refused.", live: `${n(f.tokens_issued)} tickets handed out` },
    { icon: DoorOpen, t: "Enter, anonymously", d: "You hand in the ticket without logging in, so nobody can link the entry to you. A ticket works once; repeats are ignored.", live: `${n(f.entries)} entries so far` },
    { icon: Lock, t: "The list is sealed", d: "When the sale closes, all entries are locked and one fingerprint (a Merkle root) is published. Nobody can add, remove or swap an entry any more.", live: root ? `fingerprint ${root.slice(0, 12)}…` : "not sealed yet" },
    { icon: Dices, t: "Winners are drawn", d: "A secret committed in advance plus public randomness picks the winners. Anyone can re-run the draw on their own computer.", live: at >= 5 ? "draw done: anyone can check it" : "not drawn yet" },
    { icon: Armchair, t: "Winners claim seats", d: "Winners have a short time to claim. Unclaimed seats go to the next person waiting.", live: at >= 6 ? "claiming open or finished" : "later" },
  ];
  const audit = prot?.audit || {}, bp = prot?.by_profile || {};
  const layers = LAYERS.map((l) => {
    const stopped = l.keys.reduce((a, k) => a + (audit[k]?.Rejected || 0), 0);
    const who = Object.entries(bp).map(([id, v]: any) => [id, l.keys.reduce((a, k) => a + (v.Reasons?.[k] || 0), 0)] as [string, number]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { ...l, stopped, who };
  }).filter((l) => (isOld ? l.name.startsWith("Old sale") : !l.name.startsWith("Old sale")));
  const max = Math.max(1, ...layers.map((l) => l.stopped));

  return (
    <div className="space-y-6">
      {!isOld ? (
        <Panel title="How a real person gets in" right={<TicketRule />} note="Six steps from sign-up to a seat. The line under each step is live from the sale you picked.">
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {steps.map((s, i) => {
              const status = stepStatus(st, i), done = status === "done", now = status === "now", I = s.icon;
              return (
                <li key={i} className={cn("rounded-[5px] border p-4", now ? "border-gold bg-gold/[.08]" : done ? "border-lime/35 bg-lime/[.05]" : "border-line bg-panel2/50")}>
                  <div className="flex items-center gap-3"><span className={cn("grid h-9 w-9 place-items-center rounded-[4px] border", now ? "border-gold text-gold" : done ? "border-lime/50 text-lime" : "border-line text-mute")}><I className="h-5 w-5" /></span><span className="font-mono text-xs font-semibold uppercase tracking-wider text-mute">Step {i + 1}{now ? " · happening now" : done ? " · done" : ""}</span></div>
                  <div className="mt-2 text-base font-bold">{s.t}</div>
                  <p className="mt-1 text-sm leading-relaxed text-mute">{s.d}</p>
                  <div className={cn("mt-2 font-mono text-xs font-semibold", now ? "text-gold" : done ? "text-lime" : "text-mute")}>{s.live}</div>
                </li>);
            })}
          </ol>
          <p className="mt-4 text-sm text-mute">Why a bot can&rsquo;t cheat this: it can&rsquo;t get a second ticket, can&rsquo;t reuse one, can&rsquo;t forge one, and arriving early or late changes nothing. {dropId && pulse?.state && ["DRAWN", "CLAIM", "SETTLED"].includes(pulse.state) && <Link className="font-semibold text-gold underline" href={`/verify?drop=${dropId}`}>Re-check this draw yourself</Link>}</p>
        </Panel>
      ) : (
        <Panel title="How you get a seat in the OLD way" right={<TicketRule old />}>
          <p className="text-sm leading-relaxed text-ink/85">Press &ldquo;Buy&rdquo;. Whoever&rsquo;s click reaches the server first gets the seat, until the seats run out, and one login can buy {upTo(cap)}. Nothing checks who is a bot, nothing protects people with slower connections, and there is no list anyone can check. That is why bots do so well here.</p></Panel>)}

      <Panel title={isOld ? "What protects the old sale" : "What protected us: every rule a request meets"} note="Counts are for the sale you picked. Each rule asks a question; the bar shows how many requests it stopped in this test.">
        <div className="space-y-2.5">
          {layers.map((l, i) => {
            const I = LAYER_ICON[l.name] || Layers;
            return (
              <div key={l.name} className="grid items-center gap-x-5 gap-y-2 rounded-[5px] border border-line bg-panel2/50 p-3.5 md:grid-cols-[2.2rem_1.2fr_2fr_1.3fr]" style={{ borderLeft: `4px solid ${l.color}` }}>
                <I className="h-6 w-6" style={{ color: l.color }} />
                <div><div className="font-bold">{isOld ? "" : `Rule ${i + 1}: `}{l.name}</div><div className="text-sm text-mute">&ldquo;{l.asks}&rdquo;</div></div>
                <div className="text-sm text-ink/85">{l.stops}
                  {l.keys.length > 0 && <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-panel2"><div className="h-full rounded-sm" style={{ width: Math.max(l.stopped ? 3 : 0, (l.stopped / max) * 100) + "%", background: l.color }} /></div>}</div>
                <div className="text-sm">{l.keys.length > 0 ? <><div className="display num text-2xl" style={{ color: l.color }}>{n(l.stopped)} <span className="font-sans text-xs normal-case text-mute">stopped</span></div>
                  {l.who.length ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">mostly: {l.who.map(([id, c]) => <span key={id} className="inline-flex items-center gap-1"><BotGlyph id={id} size={13} />{BOTS[id]?.name || id} ({n(c)})</span>)}</div> : <div className="text-xs text-mute">none needed it in this test</div>}</> : <div className="flex items-center gap-1.5 text-mute"><ShieldCheck className="h-4 w-4" style={{ color: PAL.lime }} />{!isOld && at >= 4 ? "the list is sealed" : "applies after the sale closes"}</div>}</div>
              </div>);
          })}
        </div>
        {!isOld && <p className="mt-4 text-sm text-mute">Every &ldquo;stopped&rdquo; number was re-checked afterwards by an independent judge. Real people are never in these counts unless the judge says it was a mistake: it counted <b className="text-ink">{n((prot?.confusion?.human?.FP) || 0)}</b> real people wrongly stopped.</p>}
      </Panel>
    </div>
  );
}
