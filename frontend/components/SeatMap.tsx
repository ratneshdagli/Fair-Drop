"use client";
import { cn } from "./ui";
import { money, seatLabel } from "@/lib/api";

type SeatData = { tiers: { id: string; name: string; offset: number; seats: string[] }[] };
const SEAT: Record<string, string> = {
  open: "bg-mute/40",
  reserved: "bg-warn shadow-[0_0_8px_rgba(255,138,61,.55)]",
  claimed: "bg-lime shadow-[0_0_8px_rgba(184,255,74,.5)]",
  unclaimed: "bg-transparent outline outline-1 outline-dashed outline-mute/50",
};
const LEGEND: [string, string][] = [
  ["open", "free seat"],
  ["reserved", "held for a winner"],
  ["claimed", "claimed and paid"],
  ["unclaimed", "nobody left to take it"],
];

/** The room, seen from above: stage at the top, one seating block per tier (front tier nearest the stage).
 *  `mine` = the viewer's seat number (global, 1-based). `prices` = optional tier id -> price in cents for the block headers. */
export default function SeatMap({ data, mine, prices }: { data: SeatData; mine?: number; prices?: Record<string, number> }) {
  const all = data.tiers.flatMap((t) => t.seats);
  const count = (s: string) => all.filter((x) => x === s).length;
  return (
    <div className="space-y-5">
      <div className="mx-auto w-full max-w-xl">
        <div className="relative grid h-14 place-items-center overflow-hidden rounded-b-[50%] border border-t-0 border-violet/50 bg-violet/10 shadow-[0_18px_50px_-18px_rgba(139,108,255,.9)]">
          <span className="display text-xl tracking-[.3em] text-violet">Stage</span>
        </div>
      </div>
      <div role="img" aria-label={`Seat map. ${all.length} seats: ${count("open")} free, ${count("reserved")} held for winners, ${count("claimed")} claimed.${mine ? ` Your seat is number ${mine}.` : ""}`} className="space-y-6">
        {data.tiers.map((t) => {
          const cols = Math.min(24, Math.max(4, Math.ceil(Math.sqrt(t.seats.length * 3))));
          const myIdx = mine ? mine - t.offset - 1 : -1;
          const hasMine = myIdx >= 0 && myIdx < t.seats.length;
          const price = prices?.[t.id];
          return (
            <section key={t.id} className="mx-auto" style={{ maxWidth: cols * 28 + 40 }}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line pb-1.5">
                <h4 className="display text-lg">{t.name}</h4>
                <span className="font-mono text-[10.5px] uppercase tracking-[.16em] text-mute">
                  seats {t.offset + 1}-{t.offset + t.seats.length}{price !== undefined && <> · {money(price)}</>}
                </span>
              </div>
              {hasMine && <div className="mb-2 font-mono text-[11px] uppercase tracking-[.16em] text-gold">Your seat: {seatLabel(t.id, myIdx + t.offset + 1)}</div>}
              <div className="grid justify-center gap-[7px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {t.seats.map((s, i) => {
                  const n = t.offset + i + 1;
                  const you = mine === n;
                  return (
                    <span key={n} title={`seat ${n}: ${s}${you ? " (yours)" : ""}`}
                      className={cn("aspect-square w-full max-w-[20px] justify-self-center rounded-t-[5px] rounded-b-[2px] transition", SEAT[s] || SEAT.open, you && "relative z-10 scale-125 !bg-gold shadow-[0_0_0_2px_#fff,0_0_18px_4px_rgba(255,194,51,.85)]")} />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[10.5px] uppercase tracking-[.14em] text-mute">
        {LEGEND.map(([k, label]) => (
          <li key={k} className="flex items-center gap-1.5"><i className={cn("inline-block h-3 w-3 rounded-t-[4px] rounded-b-[2px]", SEAT[k])} />{label} <b className="num text-ink">{count(k)}</b></li>
        ))}
        {mine !== undefined && <li className="flex items-center gap-1.5 text-gold"><i className="inline-block h-3 w-3 rounded-t-[4px] rounded-b-[2px] bg-gold shadow-[0_0_0_2px_#fff]" />your seat</li>}
      </ul>
    </div>
  );
}
