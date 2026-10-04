"use client";
// Shared kit for the "Doors Open" concert look (see DESIGN.md). Same exports as before, new skin, plus a few show-specific parts.
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import React, { useEffect, useRef, useState } from "react";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const button = cva("inline-flex items-center justify-center gap-2 rounded-[4px] px-4 py-2 text-sm font-semibold tracking-wide transition duration-150 enabled:active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/80 focus-visible:ring-offset-2 focus-visible:ring-offset-bg", {
  variants: {
    variant: {
      primary: "bg-gold text-black shadow-[0_0_0_1px_rgba(255,194,51,.5),0_10px_30px_-10px_rgba(255,194,51,.65)] hover:brightness-110 enabled:hover:shadow-[0_0_0_1px_rgba(255,194,51,.8),0_10px_40px_-8px_rgba(255,194,51,.85)]",
      secondary: "bg-panel2 text-ink border border-line hover:border-gold/60 hover:text-gold",
      ghost: "text-mute hover:text-ink hover:bg-panel2",
      danger: "bg-hot text-white shadow-[0_10px_30px_-10px_rgba(255,59,92,.7)] hover:brightness-110",
      warn: "bg-warn text-black hover:brightness-110",
    },
    size: { sm: "px-3 py-1.5 text-xs", md: "", lg: "px-6 py-3 text-base" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
export function Button({ className, variant, size, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel p-5", className)} {...p} />;
}
export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-3"><h3 className="eyebrow">{children}</h3>{right}</div>;
}

const field = "w-full rounded-[4px] border border-line bg-bg px-3 py-2 text-sm outline-none transition placeholder:text-mute/50 hover:border-mute/50 focus:border-gold focus:ring-2 focus:ring-gold/25";
export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(field, className)} {...p} />; }
export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn(field, className)} {...p} />; }
export function Label({ children }: { children: React.ReactNode }) { return <label className="eyebrow mb-1.5 block">{children}</label>; }

const badge = cva("inline-flex items-center gap-1 rounded-[3px] border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap", {
  variants: { tone: {
    gray: "border-line bg-panel2 text-mute", green: "border-lime/30 bg-lime/10 text-lime", red: "border-hot/35 bg-hot/10 text-hot", amber: "border-warn/35 bg-warn/10 text-warn",
    teal: "border-gold/35 bg-gold/10 text-gold", blue: "border-violet/40 bg-violet/10 text-violet", gold: "border-gold/35 bg-gold/10 text-gold", violet: "border-violet/40 bg-violet/10 text-violet", ice: "border-ice/35 bg-ice/10 text-ice" } },
  defaultVariants: { tone: "gray" },
});
export function Badge({ tone, className, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

export const STATES = ["SCHEDULED", "OPEN", "CLOSED", "LOCKED", "DRAWN", "CLAIM", "SETTLED"];
const stateTone: Record<string, any> = { SCHEDULED: "gray", OPEN: "green", CLOSED: "amber", LOCKED: "violet", DRAWN: "gold", CLAIM: "gold", SETTLED: "gray" };
// The sale's stages in plain words (the technical name stays in the tooltip). Used everywhere a stage is shown.
export const STAGE: Record<string, [string, string]> = {
  SCHEDULED: ["Not open yet", "The sale has been set up but nobody can join yet."],
  OPEN: ["Open: people are joining", "People can join right now. In the fair sale, joining early or late makes no difference."],
  CLOSED: ["Closed: no more entries", "Joining has stopped. The list of entries is final but not yet sealed."],
  LOCKED: ["List sealed", "The final list is locked and its fingerprint published. Nobody can add, remove or swap an entry any more, and the winners aren't picked yet."],
  DRAWN: ["Winners picked", "The random draw is done and can be re-checked by anyone. Winners are decided."],
  CLAIM: ["Winners claiming seats", "Winners have a short time to claim. Unclaimed seats go to the next person waiting."],
  SETTLED: ["Finished", "All seats are given out. The sale is over."],
};
export const stageName = (s: string) => STAGE[s]?.[0] || s;
export const StateBadge = ({ state }: { state: string }) => <Badge tone={stateTone[state] || "gray"} title={`${state}: ${STAGE[state]?.[1] || ""}`}>{state === "OPEN" && <Led tone="lime" pulse />}{stageName(state)}</Badge>;

export function Callout({ tone = "info", title, children, className }: { tone?: "info" | "ok" | "bad" | "warn"; title?: string; children?: React.ReactNode; className?: string }) {
  const t = { info: "border-violet/40 bg-violet/10 border-l-violet", ok: "border-lime/30 bg-lime/10 border-l-lime", bad: "border-hot bg-hot/12 border-l-hot alarm", warn: "border-warn/40 bg-warn/10 border-l-warn" }[tone];
  return <div role={tone === "bad" ? "alert" : undefined} className={cn("rounded-[5px] border border-l-4 p-4 text-sm", t, className)}>{title && <div className="mb-1 font-semibold">{title}</div>}<div className="text-ink/90">{children}</div></div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "bad" | "warn" | "gold" }) {
  return (
    <div className="panel p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn("display num mt-1 text-4xl", tone === "ok" && "text-lime", tone === "bad" && "text-hot", tone === "warn" && "text-warn", tone === "gold" && "text-gold")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-mute">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn("-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[.16em] transition focus:outline-none focus-visible:text-gold", value === t.id ? "border-gold text-gold" : "border-transparent text-mute hover:text-ink")}>{t.label}</button>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-mute"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-gold" />{label}</div>;
}

export function Hash({ v, label }: { v?: string | null; label?: string }) {
  if (!v) return null;
  return <div>{label && <div className="eyebrow mb-0.5">{label}</div>}<div className="hash">{v}</div></div>;
}

export function useCountdown(targetMs: number | undefined, offsetMs = 0) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  if (!targetMs) return null;
  return Math.max(0, targetMs - (now + offsetMs));
}
export function fmtDur(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + "h " : "") + (h || m ? String(m).padStart(m || h ? 2 : 1, "0") + "m " : "") + String(r).padStart(2, "0") + "s";
}

/** The sale's stages as tour dates: lit LED for the stage we are at, ticks for the ones behind us. */
export function Timeline({ state, mode = "fairdrop" }: { state: string; mode?: string }) {
  const steps = mode === "fcfs" ? ["SCHEDULED", "OPEN", "CLOSED", "SETTLED"] : STATES;
  const idx = steps.indexOf(state);
  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 font-mono text-[11px] uppercase tracking-wider">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <span title={STAGE[s]?.[1]} className={cn("flex items-center gap-1.5 rounded-[3px] border px-2 py-1", i < idx ? "border-lime/30 text-lime" : i === idx ? "border-gold bg-gold/10 text-gold" : "border-line text-mute")}>
              <Led tone={i < idx ? "lime" : i === idx ? "gold" : "mute"} pulse={i === idx} />{stageName(s)}
            </span>
            {i < steps.length - 1 && <span className="h-px w-3 bg-line" />}
          </li>
        ))}
      </ol>
      {STAGE[state] && <p className="text-xs text-mute">Right now: {STAGE[state][1]}</p>}
    </div>
  );
}

// ───── show-specific parts ─────
const ledTone: Record<string, string> = { gold: "text-gold", hot: "text-hot", violet: "text-violet", ice: "text-ice", lime: "text-lime", warn: "text-warn", mute: "text-mute/50" };
/** A small glowing status light. */
export function Led({ tone = "lime", pulse, className }: { tone?: keyof typeof ledTone; pulse?: boolean; className?: string }) {
  return <i aria-hidden className={cn("led", ledTone[tone], pulse && "led-pulse", className)} />;
}

/** Mono, uppercase small label. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

/** A section opener: numbered kicker + poster headline + optional one-line explanation. */
export function SectionHead({ n, kicker, title, children, className }: { n?: string; kicker?: string; title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {(n || kicker) && <div className="eyebrow flex items-center gap-3 text-gold">{n && <span>{n}</span>}{n && kicker && <span className="h-px w-8 bg-gold/50" />}{kicker && <span>{kicker}</span>}</div>}
      <h2 className="display text-4xl md:text-5xl">{title}</h2>
      {children && <p className="max-w-2xl text-[15px] text-mute">{children}</p>}
    </div>
  );
}

/** A number that counts up/down to its new value instead of jumping. */
export function Counter({ value, className, format = (x: number) => Math.round(x).toLocaleString() }: { value: number; className?: string; format?: (x: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from.current === value) { from.current = value; setShown(value); return; }
    const a = from.current, b = value, t0 = performance.now(), dur = 650;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e); from.current = a + (b - a) * e;
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn("num", className)}>{format(shown)}</span>;
}

/** A scrolling band of short phrases (stops with reduced motion). The list is doubled so the loop is seamless. */
export function Marquee({ items, className }: { items: React.ReactNode[]; className?: string }) {
  const row = items.map((x, i) => <span key={i} className="flex items-center gap-10 font-mono text-[11px] uppercase tracking-[.22em] text-mute">{x}<i className="led text-gold/60" /></span>);
  return <div className={cn("marquee bg-black/30", className)} aria-hidden><div className="marquee-track">{row}{row}</div></div>;
}

/** A ticket-stub shell: notched sides, a main part and an optional tear-off part divided by a perforation. */
export function Stub({ children, tear, className, accent = "gold" }: { children: React.ReactNode; tear?: React.ReactNode; className?: string; accent?: "gold" | "hot" | "violet" | "lime" }) {
  const bar = { gold: "bg-gold", hot: "bg-hot", violet: "bg-violet", lime: "bg-lime" }[accent];
  return (
    <div className={cn("ticket overflow-hidden border border-line", className)} style={tear ? ({ "--notch-y": "calc(100% - 96px)" } as React.CSSProperties) : undefined}>
      <div className={cn("h-1.5 w-full", bar)} />
      <div className="p-5">{children}</div>
      {tear && <><hr className="perf mx-5" /><div className="p-5">{tear}</div></>}
    </div>
  );
}
