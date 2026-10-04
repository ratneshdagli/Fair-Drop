"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/components/ui";
import FanStyles from "./FanStyles";

type J = { label: string; short: string; tip: string };
const FAIR: J[] = [
  { label: "Sign in", short: "Sign in", tip: "Show your ID at the door: verify your phone once. One verified phone gets exactly one entry." },
  { label: "Doors open", short: "Doors open", tip: "The waiting room. Nobody gets in before the doors open, and being first through them earns you nothing extra." },
  { label: "Scan and get your ticket", short: "Get your ticket", tip: "Your browser makes a secret ticket, the door signs it without ever seeing it, and you walk in. It takes a few seconds." },
  { label: "You are in the room", short: "In the room", tip: "Your entry is registered and you hold a receipt. Now you just wait: early or late, everyone inside has the same chance." },
  { label: "Sale closed, list sealed", short: "List sealed", tip: "Entries stop. The final list is locked and its public fingerprint is published, so nobody can add or swap a name." },
  { label: "The draw", short: "The draw", tip: "A random draw nobody can steer, and anyone can re-run, picks the winners and the order of the waiting list." },
  { label: "Claim your seat", short: "Claim a seat", tip: "Winners get a short time to claim and pay (mock payment here). A seat nobody claims moves to the next person waiting." },
];
const OLD: J[] = [
  { label: "Sign in", short: "Sign in", tip: "Log in with your phone. In the old way, a fast script can do this thousands of times." },
  { label: "Wait for the sale", short: "Wait", tip: "Everyone watches the clock and refreshes. The page cannot tell a person from a bot." },
  { label: "Everyone hits BUY at once", short: "BUY frenzy", tip: "Whoever's request reaches the server first gets the seat. That is a race, and bots win races." },
  { label: "Seats gone, sale over", short: "Sold out", tip: "The seats go to the fastest, not to the fairest." },
];

/** Where a fan is in the Fair Drop journey (1-7; 8 = everything done), from the drop state and what this browser holds. */
export function journeyStep(state: string | undefined, o: { signedIn: boolean; hasEntry: boolean }) {
  if (!o.signedIn && (!state || state === "SCHEDULED" || state === "OPEN")) return 1;
  switch (state) {
    case "SCHEDULED": return 2;
    case "OPEN": return o.hasEntry ? 4 : 3;
    case "CLOSED": case "LOCKED": return 5;
    case "DRAWN": return 6;
    case "CLAIM": return 7;
    case "SETTLED": return 8;
    default: return 2;
  }
}
/** Same for the old first-come-first-served sale (1-4; 5 = over). */
export function journeyStepOld(state: string | undefined, signedIn: boolean) {
  if (!signedIn && (!state || state === "SCHEDULED" || state === "OPEN")) return 1;
  return state === "SCHEDULED" ? 2 : state === "OPEN" ? 3 : state ? 5 : 1;
}

/** The visible journey: every step lit / ticked / dim, each with a plain one-liner on hover, focus or tap. */
export default function JourneyRail({ step, mode = "fairdrop", className }: { step: number; mode?: "fairdrop" | "fcfs"; className?: string }) {
  const steps = mode === "fcfs" ? OLD : FAIR;
  const hot = mode === "fcfs";
  const [sel, setSel] = useState<number | null>(null);
  const shown = sel ?? Math.min(step, steps.length);
  const cur = steps[shown - 1];
  const finished = step > steps.length;
  return (
    <nav aria-label={hot ? "The old way, step by step" : "Your journey, step by step"} className={cn("fan-noprint no-print rounded-[6px] border border-line bg-panel/80 px-3 py-3 backdrop-blur md:px-5 md:py-4", className)} onMouseLeave={() => setSel(null)}>
      <FanStyles />
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const n = i + 1;
          const done = n < step, now = n === step;
          return (
            <li key={s.label} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i > 0 && <span aria-hidden className={cn("absolute left-[-50%] top-[15px] h-px w-full", n <= step ? (hot ? "bg-hot/60" : "bg-lime/50") : "bg-line")} />}
              <button type="button" onMouseEnter={() => setSel(n)} onFocus={() => setSel(n)} onBlur={() => setSel(null)} onClick={() => setSel(n)}
                aria-current={now ? "step" : undefined} title={`${n}. ${s.label}: ${s.tip}`}
                className={cn("relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full border font-mono text-[12px] font-bold transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  done && (hot ? "border-hot/60 bg-hot/15 text-hot" : "border-lime/60 bg-lime/15 text-lime"),
                  now && (hot ? "border-hot bg-hot text-white glow-hot" : "border-gold bg-gold text-black glow-gold"),
                  !done && !now && "border-line bg-bg text-mute hover:border-mute/60 hover:text-ink")}>
                {now && <span aria-hidden className={cn("fan-ring absolute inset-0 rounded-full border", hot ? "border-hot" : "border-gold")} />}
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
              </button>
              <span className={cn("mt-1.5 hidden px-1 text-center font-mono text-[10px] uppercase leading-tight tracking-[.12em] md:block", now ? (hot ? "text-hot" : "text-gold") : done ? "text-ink/80" : "text-mute/70")}>{s.short}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[13px] leading-snug" aria-live="polite">
        <span className={cn("shrink-0 font-mono text-[10.5px] uppercase tracking-[.16em]", hot ? "text-hot" : "text-gold")}>
          {sel === null && finished ? "All done" : `Step ${shown} of ${steps.length}`}
        </span>
        <span className="text-mute"><b className="text-ink">{cur.label}.</b> {sel === null && finished ? "You have been through the whole night. Enjoy the show." : cur.tip}</span>
      </div>
    </nav>
  );
}
