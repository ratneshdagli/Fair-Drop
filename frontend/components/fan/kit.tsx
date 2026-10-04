"use client";
// Small shared pieces of the fan pages: show poster, ticket stubs for tiers, narrator line, plain-words error map.
import React from "react";
import { Led, StateBadge, cn } from "@/components/ui";
import { Server, Ticket } from "lucide-react";
import { api, money, usePoll } from "@/lib/api";

export const showDate = (iso: string) => {
  const t = new Date(iso);
  return { day: t.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), time: t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) };
};

/** The show as a poster: kicker, huge name, venue and date, the sale's state, with moving stage light behind it. */
export function Poster({ d, kicker = "Fair Drop presents", children, tone = "gold" }: { d: any; kicker?: string; children?: React.ReactNode; tone?: "gold" | "hot" }) {
  const when = showDate(d.starts_at);
  const hot = tone === "hot";
  return (
    <header className={cn("relative overflow-hidden rounded-[6px] border bg-panel px-5 pb-6 pt-6 md:px-9 md:pb-8 md:pt-8", hot ? "border-hot/50" : "border-line")}>
      <div className={cn("beams", hot && "opacity-70")} aria-hidden />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className={cn("eyebrow flex items-center gap-2", hot ? "text-hot" : "text-gold")}><Led tone={hot ? "hot" : "gold"} pulse />{kicker}</div>
        <StateBadge state={d.state} />
      </div>
      <h1 className="display relative z-10 mt-4 text-[clamp(2.8rem,11vw,6.5rem)] text-glow-gold">{d.event_name}</h1>
      <div className="relative z-10 mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12px] uppercase tracking-[.14em] text-ink/90">
        <span>{d.venue}</span><span className="hidden h-3 w-px bg-line sm:block" /><span>{when.day}</span><span className="hidden h-3 w-px bg-line sm:block" /><span>doors {when.time}</span>
      </div>
      {children && <div className="relative z-10 mt-5">{children}</div>}
    </header>
  );
}

const tierBar = ["bg-gold", "bg-violet", "bg-ice", "bg-lime", "bg-warn", "bg-hot"];
/** A tier as a ticket stub: coloured spine, name, price, seats. `selected`/`onClick` make it a radio-like button. */
export function TierStub({ t, i = 0, selected, onClick, hot, sub }: { t: { id: string; name: string; price_cents: number; seats: number }; i?: number; selected?: boolean; onClick?: () => void; hot?: boolean; sub?: React.ReactNode }) {
  const body = (
    <>
      <span className={cn("w-2 shrink-0", hot ? "bg-hot" : tierBar[i % tierBar.length])} />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="display block truncate text-2xl">{t.name}</span>
          <span className="font-mono text-[11px] uppercase tracking-[.16em] text-mute">{t.seats} seats</span>
        </span>
        <span className="text-right">
          <span className="display num block text-3xl text-gold">{money(t.price_cents)}</span>
          {sub && <span className="font-mono text-[10.5px] uppercase tracking-[.14em] text-mute">{sub}</span>}
        </span>
      </span>
      <span aria-hidden className="relative my-2 w-5 shrink-0 border-l-2 border-dashed border-white/15">
        <i className="absolute -left-[11px] -top-4 h-4 w-4 rounded-full bg-bg" /><i className="absolute -bottom-4 -left-[11px] h-4 w-4 rounded-full bg-bg" />
      </span>
    </>
  );
  const cls = cn("relative flex overflow-hidden rounded-[5px] border bg-panel2 transition duration-150", selected ? "border-gold glow-gold" : "border-line hover:border-mute/60", hot && selected && "border-hot glow-hot");
  return onClick ? (
    <button type="button" role="radio" aria-checked={!!selected} onClick={onClick} className={cn(cls, "w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold")}>{body}</button>
  ) : <div className={cls}>{body}</div>;
}

/** One sentence about what is happening right now, with a small light. */
export function Narrator({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "lime" | "hot" | "violet" | "ice" }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[4px] border border-line bg-black/30 px-3 py-2.5 text-[14px] leading-snug text-ink/90" aria-live="polite">
      <Led tone={tone} pulse className="mt-[5px] shrink-0" />
      <span><span className="mr-2 font-mono text-[10.5px] uppercase tracking-[.18em] text-mute">Right now</span>{children}</span></p>
  );
}

/** Decorative barcode strip (uses the global .barcode). */
export const Barcode = ({ className }: { className?: string }) => <div aria-hidden className={cn("barcode fan-barcode", className)} />;

/** Plain-language sentences for the server's error codes. Unknown codes get a calm generic line. */
const ERR: Record<string, [string, string]> = {
  not_eligible: ["Your phone was verified too late", "This sale only lets in phones that were verified before its cutoff time. That is on purpose: accounts created during a sale can't enter, so a bot farm that signs up in a hurry gets nothing. You can still look around."],
  already_issued: ["This ID already got a ticket", "One verified phone gets exactly one entry for this sale, and this one already collected its ticket, maybe on another device. If it is this browser, open My entry."],
  window_closed: ["The doors have closed", "The entry window is over, so no more entries are accepted. Nothing you did was too slow or too fast: it simply ended on schedule."],
  not_open_yet: ["The doors are not open yet", "Entering starts when the doors open. Come back at the opening time, no need to hurry: being first earns you nothing extra."],
  token_spent: ["You are already in", "This ticket was already registered, so your receipt exists. Open My entry to see it."],
  rate_limited: ["The door is busy", "Lots of people are at the door right now, so you were asked to wait a moment. This never changes your chances. Try again in a few seconds."],
  bad_sig: ["The door rejected the ticket", "The signature on your secret ticket did not check out, so it was refused. Try once more; if it keeps happening, something is wrong on the server side."],
  unauthorized: ["Your sign-in ran out", "We could not recognise your ID card. Sign in again; your place is not lost."],
  bad_otp: ["That code is wrong or has expired", "Codes last five minutes. Ask for a new one and use the one shown on screen."],
  too_many_attempts: ["Too many wrong codes", "That code has been cancelled to stop guessing. Ask for a new one."],
  otp_rate_limited: ["Too many codes requested", "Wait a few minutes before asking for another code for this number."],
  bad_phone: ["That does not look like a phone number", "Use any real-looking number with 7 to 15 digits, for example +1 555 010 2030."],
  claim_expired: ["Your claim time ran out", "The seat passed to the next person on the waiting list."],
  not_winner: ["This entry is not holding a seat", "Only an entry that won, or was promoted from the waiting list, can claim."],
  not_claim_phase: ["Claiming is not open", "Winners can claim only while the claim stage is running."],
  seat_conflict: ["Seat conflict", "That seat was just taken. This should never happen; please tell the organisers."],
  sold_out: ["Sold out", "Someone's request reached the server before yours."],
  limit_reached: ["Per-account limit reached", "This account already holds the most seats it is allowed."],
  sale_closed: ["The sale is closed", "No more seats are being sold."],
};
export const friendly = (code: string, fallback?: string): { title: string; body: string } => {
  const e = ERR[code];
  return e ? { title: e[0], body: e[1] } : { title: "Something unexpected happened", body: `${fallback ? fallback + ". " : ""}Please try again in a moment. Trying again is safe: it can never enter you twice.` };
};

/** The ticket rule as a badge: 1 login, 1 ticket, 1 seat at most. */
export function OneTicket({ className }: { className?: string }) {
  return (
    <span title="One verified phone gets exactly one entry, and an entry can win at most one seat." className={cn("inline-flex items-center gap-2 rounded-[3px] border border-gold/60 bg-gold/10 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[.14em] text-gold", className)}>
      <Ticket className="h-3.5 w-3.5" />1 login <i className="h-3 w-px bg-gold/50" /> 1 ticket <i className="h-3 w-px bg-gold/50" /> 1 seat at most
    </span>
  );
}

/** "Seats one account may take in the OLD first-come sale", read live from that sale's own status (null until known / if there is no such sale). */
export function useMaxPerAccount(): number | null {
  const { data } = usePoll(async () => {
    const ds = await api<any[]>("/drops");
    const f = ds.find((x) => x.mode === "fcfs");
    return f ? (await api<any>(`/baseline/${f.id}/status`)).max_per_account ?? null : null;
  }, 15000, []);
  return data ?? null;
}

/** "What the backend is doing" caption: a small violet-tinted line under a step or state, in plain words. */
export function Backstage({ children, className, short }: { children: React.ReactNode; className?: string; short?: boolean }) {
  return (
    <p className={cn("flex items-start gap-2 text-[12.5px] leading-snug text-mute", className)}>
      <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet" aria-hidden />
      <span><b className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-violet">{short ? "Backend" : "What the backend is doing"}</b>{children}</span>
    </p>
  );
}

/** Backend, in plain words, by stage of the sale (DESIGN.md wording). */
export const BACKEND_BY_STATE: Record<string, string> = {
  SCHEDULED: "Waiting. Nothing is accepted yet.",
  OPEN: "A gateway spreads requests over the web servers. Each one checks the ID and the rate limit, makes sure this person gets only one ticket, signs it without seeing it, and records the entry in Redis.",
  CLOSED: "New entries are refused. The list of entries is frozen.",
  LOCKED: "The worker builds the sealed fingerprint (a Merkle root) of every entry and publishes it before the secret seed is revealed.",
  DRAWN: "The seed is revealed and the server ranks all entries by it. Anyone can re-run the same ranking.",
  CLAIM: "Winners claim within a time window. A seat nobody claims passes down the waiting list.",
  SETTLED: "Finished. The record is now permanent in Postgres.",
};
