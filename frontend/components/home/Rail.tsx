"use client";
import { cn } from "@/components/ui";

// The talk clock: seven marks of the 4-minute presentation. `ch` is the chapter each mark jumps to.
export const MARKS: { t: string; label: string; ch: number }[] = [
  { t: "0:00", label: "The problem", ch: 1 },
  { t: "0:40", label: "The bots", ch: 2 },
  { t: "1:20", label: "The journey", ch: 3 },
  { t: "2:00", label: "Three methods", ch: 4 },
  { t: "2:40", label: "What we do", ch: 5 },
  { t: "3:20", label: "The proof", ch: 6 },
  { t: "3:50", label: "Limits + shows", ch: 7 },
];

/** Slim timer rail: right edge on desktop, bottom bar on phones. Progress and the clock are written straight to the DOM by the page. */
export default function Rail({ active, onJump, rootRef, clockRef }: { active: number; onJump: (ch: number) => void; rootRef: React.RefObject<HTMLElement | null>; clockRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <nav ref={rootRef} aria-label="Presentation timer: jump to a part" style={{ ["--p" as string]: 0 }}
      className="fixed inset-x-0 bottom-0 z-40 flex h-11 items-center gap-3 border-t border-line/80 bg-bg/85 px-3 md:inset-x-auto md:bottom-auto md:right-3 md:top-1/2 md:h-[min(62vh,440px)] md:-translate-y-1/2 md:flex-col md:rounded-[6px] md:border md:px-2 md:py-3">
      <div title="The planned pace of the 4-minute tour, not a stopwatch" className="shrink-0 text-center font-mono text-[11px] uppercase leading-tight tracking-[.12em] text-[#cfc7e6] md:w-12">
        <span ref={clockRef} className="num block text-[13px] font-bold text-gold">0:00</span><span className="hidden md:block">of 4:00</span>
      </div>
      <div className="relative flex h-full flex-1 md:w-full md:flex-none md:flex-1">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-line md:bottom-0 md:left-1/2 md:right-auto md:top-0 md:h-auto md:w-px" aria-hidden>
          <div className="h-full w-full origin-left bg-gold shadow-[0_0_10px_#ffc233] [transform:scaleX(var(--p))] md:origin-top md:[transform:scaleY(var(--p))]" />
        </div>
        <ol className="relative flex w-full items-center justify-between md:flex-col">
          {MARKS.map((m, i) => (
            <li key={m.t} className="md:w-full">
              <button type="button" onClick={() => onJump(m.ch)} aria-label={`${m.t} ${m.label}`} aria-current={active === i ? "step" : undefined} className="group relative grid place-items-center focus-visible:outline-2 focus-visible:outline-gold md:w-full">
                <span className={cn("block h-2.5 w-2.5 rounded-full border-2 bg-bg transition", i <= active ? "border-gold bg-gold shadow-[0_0_10px_#ffc233]" : "border-mute/60 group-hover:border-gold")} />
                <span className={cn("pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-[3px] border border-line bg-bg px-2 py-1 font-mono text-[12px] uppercase tracking-[.1em] md:bottom-auto md:right-full md:mb-0 md:mr-3",
                  i === active ? "text-gold md:opacity-0 md:transition md:group-hover:opacity-100 md:group-focus-visible:opacity-100" : "text-[#cfc7e6] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 max-md:hidden")}>
                  <b className="num mr-1.5">{m.t}</b>{m.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
