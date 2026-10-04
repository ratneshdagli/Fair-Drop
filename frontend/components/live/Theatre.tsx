"use client";
// The Booking Theatre: the same crowd, the same 500 seats, three doors side by side.
import { useMemo } from "react";
import type { Arena } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import { SectionHead } from "@/components/ui";
import Door from "./Door";

const Shape = ({ children }: { children: React.ReactNode }) => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0">{children}</svg>;
const LEGEND: [React.ReactNode, string][] = [
  [<Shape key="a"><circle cx="8" cy="8" r="5.5" fill="#7fd8ff" /></Shape>, "real person"],
  [<Shape key="b"><path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill="#ff3b5c" /></Shape>, "bot"],
  [<Shape key="c"><circle cx="8" cy="8" r="5.5" fill="#b8ff4a" /></Shape>, "let in"],
  [<Shape key="d"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#ff3b5c" strokeWidth="2" /></Shape>, "turned away"],
  [<Shape key="e"><circle cx="8" cy="8" r="5.5" fill="#ff8a3d" /></Shape>, "fell for the decoy trap"],
];

export default function Theatre({ a, compact }: { a: Arena; compact?: boolean }) {
  const fcfs = useMemo(() => a.events.filter((e) => e.mode === "fcfs"), [a.events]);
  const fair = useMemo(() => a.events.filter((e) => e.mode === "fairdrop"), [a.events]);
  // the simple lottery has no door of its own: it replays the Fair Drop traffic, and every request that reached the entry step is one ticket
  const naive = useMemo(() => fair.filter((e) => e.v === "accepted" || e.v === "absorbed" || e.v === "decoy" || (e.s === "register" && e.o === "spent")), [fair]);
  // dots move only while a sale is really open (also true when the run list is not reachable)
  const live = !!a.running || a.fairState === "OPEN" || a.oldState === "OPEN";
  return (
    <section className="space-y-4" aria-label="The three doors">
      {!compact && <SectionHead n="02" kicker="the three doors" title={<>Same crowd. Same {SEATS} seats. <span className="text-gold">Three doors.</span></>}>Each door is a different way of handing out the seats. Hover a numbered step to see what happens there.</SectionHead>}
      <div className="grid items-stretch gap-4 lg:grid-cols-3 2xl:gap-5">
        <Door a={a} k="fcfs" events={fcfs} live={live} />
        <Door a={a} k="naive" events={naive} live={live} />
        <Door a={a} k="fair" events={fair} live={live} />
      </div>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[4px] border border-line bg-panel/70 px-4 py-2.5 text-[13px] text-ink/90" aria-label="Legend">
        <li className="eyebrow">Legend</li>
        {LEGEND.map(([g, l]) => <li key={l} className="flex items-center gap-2">{g}{l}</li>)}
        <li className="ml-auto text-mute">Dots are real decisions of the server (sampled when it is very busy). The numbers beside them are exact.</li>
      </ul>
    </section>
  );
}
