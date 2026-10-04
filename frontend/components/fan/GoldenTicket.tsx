"use client";
import { Check, ShieldAlert } from "lucide-react";
import { cn } from "@/components/ui";
import { fmtTime } from "@/lib/api";
import { Barcode } from "./kit";

const STUB = 118;

/** The golden ticket: proof you are in the draw. Gold slab, black type, perforation, barcode stub with the receipt id. */
export default function GoldenTicket({ event, tier, receipt, sigOk, acceptedMs, reveal }: { event: string; tier?: string; receipt?: string; sigOk?: boolean; acceptedMs?: number; reveal?: boolean }) {
  return (
    <div className={cn("mx-auto w-full max-w-[26rem] drop-shadow-[0_0_40px_rgba(255,194,51,.45)]", reveal && "fan-pop")}>
      <div className="ticket relative overflow-hidden text-black" style={{ "--notch-y": `calc(100% - ${STUB}px)`, background: "var(--color-gold)" } as React.CSSProperties}>
        <div aria-hidden className="fan-shine pointer-events-none absolute inset-0" />
        <div className="relative px-5 pb-5 pt-4">
          <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-[.24em]"><span>Golden ticket</span><span>1 of 1</span></div>
          <div className="display mt-3 text-[clamp(2.6rem,12vw,3.6rem)] leading-[.88]">You are in the draw</div>
          <div className="mt-2 font-mono text-[12px] font-semibold uppercase tracking-[.12em]">{event}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t-2 border-black/80 pt-3 text-sm">
            <div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] opacity-70">Tier</div><div className="display text-3xl">{tier || "-"}</div></div>
            <div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] opacity-70">Receipt check</div>
              <div className="mt-1 flex items-center gap-1.5 font-bold">{sigOk ? <><Check className="h-4 w-4" strokeWidth={3} />Signature verified</> : <><ShieldAlert className="h-4 w-4" />Not verified</>}</div></div>
          </div>
          {acceptedMs !== undefined && <div className="mt-2 text-[12px] font-medium opacity-80">Recorded {fmtTime(acceptedMs)}. Not used in the draw.</div>}
        </div>
        <hr className="mx-5 border-0 border-t-2 border-dashed border-black/40" />
        <div className="relative px-5 pt-3" style={{ height: STUB - 2 }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] opacity-70">Receipt id</div>
          <div className="font-mono text-[10.5px] leading-snug [overflow-wrap:anywhere]">{receipt}</div>
          <Barcode className="mt-2 !h-7 text-black" />
        </div>
      </div>
    </div>
  );
}
