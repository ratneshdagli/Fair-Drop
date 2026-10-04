"use client";
import { useEffect, useRef } from "react";
import { X, Ticket } from "lucide-react";
import { Led, cn } from "@/components/ui";
import { DETAIL, HEX, MODULES, NODE, type NodeId } from "./data";

const ROWS: [string, "what" | "why" | "booking" | "dies" | "never"][] = [
  ["What it is", "what"], ["Why it exists", "why"], ["What it does in a booking", "booking"], ["If it dies", "dies"], ["What it deliberately never does", "never"],
];

/** Side panel (bottom sheet on a phone) for one box of the map. */
export default function DetailPanel({ id, onClose }: { id: NodeId; onClose: () => void }) {
  const base = id.startsWith("api") ? "api" : id;
  const n = NODE[id], d = DETAIL[base], hex = HEX[n.tone];
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, [id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <button aria-label="Close details" onClick={onClose} className="fixed inset-0 z-[58] bg-black/60 md:hidden" />
      <aside role="dialog" aria-label={`${n.name} details`} className="fixed z-[59] flex flex-col border-line bg-panel shadow-[0_0_60px_rgba(0,0,0,.7)] max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[82vh] max-md:rounded-t-xl max-md:border-t md:bottom-0 md:right-0 md:top-14 md:w-[420px] md:border-l"
        style={{ borderTopColor: hex }}>
        <div className="h-1 w-full shrink-0" style={{ background: hex }} />
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <div className="eyebrow flex items-center gap-2"><Led tone={n.tone} pulse />{n.layer}</div>
            <h3 ref={head} tabIndex={-1} className="display mt-1 text-4xl outline-none" style={{ color: hex }}>{n.name}</h3>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[.16em] text-mute">{n.tech}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-[4px] border border-line p-2 text-mute hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="thin-scroll flex-1 space-y-4 overflow-y-auto p-5 text-[14px] leading-relaxed">
          {base === "api" && id !== "api" && <p className="rounded-[4px] border border-violet/30 bg-violet/10 p-3 text-[13px] text-ink/90">{n.name} is one of three identical copies. What follows is true of all of them.</p>}
          {ROWS.map(([h, k]) => (
            <section key={k}>
              <div className={cn("eyebrow mb-1", k === "dies" && "text-warn", k === "never" && "text-hot")}>{h}</div>
              <p className="text-ink/90">{d[k]}</p>
            </section>
          ))}
          {base === "api" && (
            <section>
              <div className="eyebrow mb-1.5">Parts inside every server</div>
              <div className="flex flex-wrap gap-1.5">{MODULES.map((m) => <span key={m} className="rounded-[3px] border border-violet/30 bg-violet/10 px-2 py-0.5 font-mono text-[11px] text-violet">{m}</span>)}</div>
            </section>
          )}
          <section className="overflow-hidden rounded-[5px] border border-line">
            <div className="flex items-center gap-2 border-b border-line bg-panel2 px-3 py-2 eyebrow text-gold"><Ticket className="h-3.5 w-3.5" />Decides vs. never decides</div>
            <div className="grid grid-cols-2 divide-x divide-line text-[13px]">
              <div className="p-3"><div className="eyebrow mb-1 text-lime">This part decides</div>{d.decides}</div>
              <div className="p-3"><div className="eyebrow mb-1 text-hot">It never decides</div>{d.notDecides}</div>
            </div>
          </section>
          <section className="overflow-hidden rounded-[5px] border border-line">
            <div className="border-b border-line bg-panel2 px-3 py-2 eyebrow text-gold">Who controls what, in the whole system</div>
            <div className="grid grid-cols-2 divide-x divide-line text-[13px]">
              <div className="p-3"><div className="eyebrow mb-1 text-hot">Bots and attackers control</div>Their speed, their volume, their internet addresses, how many accounts they own, whether they avoid the decoy, and when they fire.</div>
              <div className="p-3"><div className="eyebrow mb-1 text-violet">Nobody controls</div>The order of the draw, the seed, and the sealed list. One login is one entry, at most one seat.</div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
