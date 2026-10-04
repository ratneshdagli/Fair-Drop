"use client";
// The poster band: title, big plain-words phase, live counters, and who is in the crowd (real people vs each kind of bot).
import { useEffect, useRef, useState } from "react";
import type { Arena, Phase } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import BotGlyph from "@/components/BotGlyph";
import { BOTS } from "@/components/admin/botinfo";
import { Counter, Led, cn } from "@/components/ui";
import { N, fmtClock, fmtPct, phaseWords } from "./derive";

const LED: Record<Phase, "mute" | "gold" | "violet" | "hot" | "lime"> = { idle: "mute", starting: "gold", fair: "gold", wrapup: "violet", old: "hot", done: "lime" };
const kindName = (id: string) => (id === "HUMAN" ? "Real people" : BOTS[id]?.name ?? id);

function Clock({ a }: { a: Arena }) {
  const base = useRef({ ms: a.closesInMs, at: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => { base.current = { ms: a.closesInMs, at: Date.now() }; }, [a.closesInMs]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (a.phase !== "fair" || base.current.ms === null) return null;
  const left = Math.max(0, base.current.ms - (Date.now() - base.current.at));
  return <span className="num rounded-[3px] border border-gold/50 bg-gold/10 px-2.5 py-1 font-mono text-sm font-bold text-gold" title="time until the sale closes">closes in {fmtClock(left)}</span>;
}

function Gauge({ label, sub, value, tone }: { label: string; sub: string; value: number; tone: string }) {
  return (
    <div className="panel min-w-[150px] flex-1 px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className={cn("display num text-5xl 2xl:text-6xl", tone)}><Counter value={value} /></div>
      <div className="text-[12px] text-mute">{sub}</div>
    </div>
  );
}

function CrowdStrip({ a }: { a: Arena }) {
  const list = [...a.profiles].sort((x, y) => (x.id === "HUMAN" ? -1 : y.id === "HUMAN" ? 1 : 0));
  const total = list.reduce((s, p) => s + p.accounts, 0);
  if (!total) return null;
  const col = (id: string) => (id === "HUMAN" ? "#7fd8ff" : BOTS[id]?.color ?? "#9a90b8");
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="eyebrow">Who is in the crowd</div>
        <div className="text-[15px]"><b className="text-ice">{N(a.crowd.humans)}</b> real people + <b className="text-hot">{N(a.crowd.bots)}</b> bot accounts = <b>{N(a.crowd.total)}</b> logins, hall of {SEATS} seats</div>
      </div>
      <div className="flex h-4 w-full gap-px overflow-hidden rounded-[3px] bg-bg" role="img" aria-label={`${N(a.crowd.humans)} real people and ${N(a.crowd.bots)} bots`}>
        {list.map((p) => <div key={p.id} title={`${kindName(p.id)}: ${N(p.accounts)} logins`} className="h-full transition-[flex-grow] duration-700 motion-reduce:transition-none" style={{ flex: `${Math.max(p.accounts, total * 0.01)} 1 0`, background: col(p.id), minWidth: 4 }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {list.map((p) => (
          <li key={p.id} title={BOTS[p.id]?.does} className="flex items-center gap-1.5 text-[13px]">
            <BotGlyph id={p.id} size={15} />
            <span className="text-ink/90">{kindName(p.id)}</span>
            <b className="num" style={{ color: col(p.id) }}>{N(p.accounts)}</b>
            <span className="num text-mute">{fmtPct((p.accounts / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Header({ a, compact }: { a: Arena; compact?: boolean }) {
  const idle = a.phase === "idle";
  const past = a.phase === "done" && !a.running;
  return (
    <header className="relative space-y-4">
      {!compact && <div className="beams opacity-70" />}
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 space-y-2">
          {!compact && (
            <>
              <div className="eyebrow flex items-center gap-3 text-gold"><span>01</span><span className="h-px w-8 bg-gold/50" /><span>the booking theatre</span></div>
              <h1 className="display flex flex-wrap items-baseline gap-x-5 text-6xl md:text-7xl 2xl:text-[104px]">Live booking <span className="text-gold text-glow-gold">{SEATS} seats</span></h1>
              <p className="max-w-3xl text-[15px] text-mute">You are watching three ways of booking the same {SEATS} seats, run at once with the same crowd of real people and bots. Look at who gets in.</p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Led tone={LED[a.phase]} pulse={!!a.running} className="h-3 w-3" />
            <span className={cn("display text-3xl md:text-4xl", idle ? "text-mute" : "text-ink")}>{phaseWords(a)}</span>
            <Clock a={a} />
            {past && <span className="rounded-[3px] border border-line bg-panel2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.14em] text-mute" title="Nothing is running now. This is the newest finished test.">last test</span>}
          </div>
        </div>
        {!idle && (
          <div className="flex flex-wrap gap-3">
            <Gauge label="In the crowd" sub="logins at the door" value={a.crowd.total} tone="text-ice" />
            <Gauge label="Requests / second" sub="live from the server" value={a.rates.rps} tone="text-ink" />
            <Gauge label="Turned away / second" sub="live from the server" value={a.rates.blockedPerSec} tone="text-hot" />
          </div>
        )}
      </div>
      {!idle && <div className="relative z-10"><CrowdStrip a={a} /></div>}
    </header>
  );
}
