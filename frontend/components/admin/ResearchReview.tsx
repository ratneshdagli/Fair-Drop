"use client";
// The outside research review, point by point: what it said, whether we used it, what we did, and where to see it.
// Shared by the control room (Research section) and the landing page. Plain words; no number is typed in here.
import { Check, Minus, X } from "lucide-react";

type Row = { point: string; said: string; used: "yes" | "partly" | "no"; did: string; where: string };

export const REVIEW: Row[] = [
  { point: "False-positive rate at a strict 0.1% limit", said: "The worst mistake a gate can make is blocking a real person, so measure that rate and hold it under a very small limit.", used: "yes",
    did: "We count real people wrongly turned away and divide by all real requests. If none were wrongly blocked we report the 95% upper bound (3 divided by the number of good requests) and say plainly whether the 0.1% target is proven yet. It needs about 3,000 good requests.", where: "Control room > Research, and Live show (bottom): “How the research scores this”. Landing page: Proof chapter." },
  { point: "Precision and recall, not plain accuracy", said: "Bot traffic is lopsided, so plain accuracy flatters a weak gate. Use precision (of what we refused, how much deserved it) and recall (of what should be refused, how much was).", used: "yes",
    did: "We show recall, precision, F1 (the two joined), plain accuracy and balanced accuracy side by side, plus the share of traffic that was bad, for the Fair Drop gate and the old sale.", where: "Control room > Research, two panels (Fair Drop gate, old sale)." },
  { point: "PR-AUC (area under the precision-recall curve)", said: "A single score for a detector whose strictness can be dialled up and down.", used: "no",
    did: "Not applicable. Our gate is a fixed set of rules with one setting, so there is no curve. We show that one point (precision and recall) instead of inventing a curve.", where: "Explained here only." },
  { point: "Flow correlation and information distance", said: "A human flash crowd and a bot flood arrive differently. Measure how different, for example with KL distance, and how well the two timelines follow each other.", used: "partly",
    did: "For each kind of bot, from per-second arrivals: busiest second, burstiness, KL distance from the real people's timing, and how closely it matches their timeline. Kinds with under 50 requests say “too few to judge”. Our simulated people do not follow a measured human law, so this shows the method, not a real crowd.", where: "Control room > Research: “Do bots arrive like a human crowd?”" },
  { point: "Mouse dynamics (how a cursor moves)", said: "Real people and scripts move a mouse differently, so a model can tell them apart.", used: "no",
    did: "Not used. Fair Drop never decides who gets a seat by spotting bots. The disguised bot (human mimic) is simply treated as one person with one entry. The honest cost: a well-disguised bot cannot be blocked, only capped at one entry.", where: "Explained here only." },
  { point: "Browser fingerprinting and headless-browser checks", said: "Tell scripted browsers from real ones by their technical traits.", used: "no", did: "Not used, for the same reason: allocation never depends on spotting bots.", where: "Explained here only." },
  { point: "Detecting advanced bots with logs plus mouse data", said: "Combine server logs with cursor data to catch bots that copy human behaviour.", used: "no", did: "Not used, for the same reason. A bot that copies a human perfectly still gets only one entry per verified account.", where: "Explained here only." },
];

const TONE = { yes: { Icon: Check, c: "text-lime", t: "USED" }, partly: { Icon: Minus, c: "text-warn", t: "PARTLY" }, no: { Icon: X, c: "text-hot", t: "NOT USED" } };

export default function ResearchReview({ dark = false }: { dark?: boolean }) {
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-[16px] leading-relaxed text-ink">
        <b>What this is.</b> An outside review of how bot-detection systems are scored in industry (our file: “resarch_metric”). It lists seven ideas. Below is each one in plain words: whether we used it, what we did, and where to see the numbers. The numbers themselves are worked out live from each test&apos;s own records, never typed in.
      </p>
      <ol className="grid gap-3">
        {REVIEW.map((r, i) => { const T = TONE[r.used]; return (
          <li key={r.point} className={`grid gap-x-6 gap-y-2 rounded-[6px] border border-white/10 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] ${dark ? "bg-[rgba(10,7,20,.92)]" : "bg-panel"}`}>
            <div>
              <div className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-[.14em]"><span className="text-mute">{String(i + 1).padStart(2, "0")}</span><T.Icon className={`h-4 w-4 ${T.c}`} aria-hidden /><span className={T.c}>{T.t}</span></div>
              <h4 className="mt-1 text-[18px] font-bold leading-snug text-ink">{r.point}</h4>
              <p className="mt-1 text-[15px] leading-relaxed text-[#e4def5]"><b className="text-ice">The review says: </b>{r.said}</p>
            </div>
            <div>
              <p className="text-[16px] leading-relaxed text-ink"><b className="text-gold">What we did: </b>{r.did}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#e4def5]"><b className="font-mono text-[12px] uppercase tracking-[.12em] text-ice">Where to see it: </b>{r.where}</p>
            </div>
          </li>); })}
      </ol>
    </div>
  );
}
