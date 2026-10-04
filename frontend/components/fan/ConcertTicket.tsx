"use client";
import { cn } from "@/components/ui";
import { Barcode, showDate } from "./kit";

const TEAR = 292; // height of the white tear-off part (px): the notches sit right above it

/** The concert ticket: poster name, seat / tier / paid, barcode, perforation, then the white tear-off with the QR. `pending` = reserved but not yet paid. */
export default function ConcertTicket({ event, venue, startsAt, seat, tier, paid, receipt, qr, pending, note }: {
  event: string; venue?: string; startsAt?: string; seat: string; tier?: string; paid?: string; receipt?: string; qr?: string; pending?: boolean; note?: string;
}) {
  const when = startsAt ? showDate(startsAt) : null;
  return (
    <div className={cn("fan-print mx-auto w-full max-w-[26rem] drop-shadow-[0_0_34px_rgba(255,194,51,.28)]", pending && "drop-shadow-none")}>
      <div className="ticket overflow-hidden border border-gold/50 bg-panel fan-print" style={{ "--notch-y": `calc(100% - ${TEAR}px)` } as React.CSSProperties}>
        <div className={cn("flex items-center justify-between px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[.22em] text-black", pending ? "bg-warn" : "bg-gold")}>
          <span>Fair Drop</span><span>{pending ? "Reserved: not paid yet" : "Admit one"}</span>
        </div>
        <div className="relative px-5 pb-5 pt-5">
          {!pending && <div aria-hidden className="fan-shine pointer-events-none absolute inset-0" />}
          <div className="eyebrow text-gold">The night</div>
          <h2 className="display mt-1 text-[clamp(2.4rem,11vw,3.4rem)]">{event}</h2>
          {(venue || when) && <div className="mt-2 font-mono text-[11.5px] uppercase leading-relaxed tracking-[.12em] text-ink/85">{venue}{when && <><br />{when.day} · doors {when.time}</>}</div>}
          <div className="mt-5 grid grid-cols-[1.1fr_1fr_1fr] gap-3 border-t border-line pt-4">
            <div><div className="eyebrow">Seat</div><div className="display num text-[2.6rem] text-gold">{seat}</div></div>
            <div><div className="eyebrow">Tier</div><div className="display mt-1 text-2xl leading-none">{tier || "-"}</div></div>
            <div><div className="eyebrow">Paid</div><div className="display num mt-1 text-2xl leading-none">{paid || "-"}</div></div>
          </div>
          <Barcode className="mt-5 text-ink" />
          {receipt && <div className="mt-3"><div className="eyebrow">Receipt</div><div className="hash !text-[10.5px] leading-snug">{receipt}</div></div>}
          {note && <p className="mt-3 text-[12.5px] leading-snug text-mute">{note}</p>}
        </div>
        <hr className="perf mx-5" />
        <div className="grid place-items-center px-5" style={{ height: TEAR - 2 }}>
          {qr ? (
            <div className="fan-keep-bg grid place-items-center rounded-[4px] bg-white p-3"><img src={qr} alt="ticket QR code" className="h-[232px] w-[232px]" /></div>
          ) : (
            <div className="grid h-[232px] w-[232px] place-items-center rounded-[4px] border-2 border-dashed border-line px-6 text-center font-mono text-[11px] uppercase leading-relaxed tracking-[.14em] text-mute">{pending ? "Your QR code appears here once the seat is paid for" : "Your QR code is on the ticket page"}</div>
          )}
        </div>
      </div>
    </div>
  );
}
