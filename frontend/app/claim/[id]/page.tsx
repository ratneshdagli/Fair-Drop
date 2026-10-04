"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CreditCard, Hourglass } from "lucide-react";
import { api, entries, LocalEntry, money, seatLabel, session, usePoll } from "@/lib/api";
import { receiptId, unb64 } from "@/lib/fdcrypto";
import SeatMap from "@/components/SeatMap";
import { Badge, Button, Callout, Input, Label, Led, SectionHead, Spinner, cn, fmtDur, useCountdown } from "@/components/ui";
import JourneyRail, { journeyStep } from "@/components/fan/JourneyRail";
import ConcertTicket from "@/components/fan/ConcertTicket";
import { Backstage, BACKEND_BY_STATE, OneTicket, Poster, friendly } from "@/components/fan/kit";

export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [local, setLocal] = useState<LocalEntry | null>(null);
  const [card, setCard] = useState({ num: "4242 4242 4242 4242", exp: "12/30", cvc: "123" });
  const [err, setErr] = useState("");
  const [ticket, setTicket] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLocal(entries.get(id)); if (!session.get()) router.replace(`/login?next=/claim/${id}`); }, [id, router]);
  const rid = local ? receiptId(id, unb64(local.token_msg)) : undefined;
  const { data: d } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const { data: res, error: resErr } = usePoll(() => (rid ? api<any>(`/drops/${id}/result/${rid}`) : Promise.resolve(null)), 1500, [id, rid]);
  const { data: seats } = usePoll(() => api<any>(`/drops/${id}/seats`), 2000, [id]);
  const off = d ? d.server_time_ms - Date.now() : 0;
  const left = useCountdown(res?.claim?.status === "reserved" ? res.claim.deadline_ms : undefined, off);

  if (!d || (rid && !res && !ticket && !resErr)) return <Spinner label="Finding your seat…" />;
  if (!local) return <Callout tone="warn" title="No ticket on this device">Your secret ticket is needed to claim, and it lives in the browser where you entered. <Link className="underline" href={`/status/${id}`}>Go to My entry</Link></Callout>;
  const claim = res?.claim;
  const tier = d.tiers.find((t: any) => t.id === res?.tier);
  const seatNo = ticket?.seat_no || claim?.seat_no;
  const prices = Object.fromEntries(d.tiers.map((t: any) => [t.id, t.price_cents]));
  const step = journeyStep(d.state, { signedIn: true, hasEntry: true });

  const pay = async () => {
    setErr(""); setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 700)); // mock payment processor
      const t = await api(`/drops/${id}/claim`, { body: { token_msg: local!.token_msg }, auth: "user", idem: true });
      setTicket(t);
    } catch (e: any) {
      const f = friendly(e.code, e.message);
      setErr(`${f.title}. ${f.body}`);
    }
    setBusy(false);
  };

  const holding = claim?.status === "reserved" || !!ticket;
  const urgent = left !== null && left < 10000;

  return (
    <div className="space-y-6">
      <Poster d={d} kicker="Claim your seat" />
      <JourneyRail step={ticket ? 8 : step} />
      <p className="text-[14px] text-mute">What you are looking at: the box office. If your entry won a seat, it is held for you here for a short time. Pay (pretend money) before the timer ends and the seat is yours.</p>

      {resErr && !res && <Callout tone="warn" title="We could not read your result">{friendly((resErr as any).code || "error", String((resErr as any).message)).body} <Link className="underline" href={`/status/${id}`}>Open My entry</Link></Callout>}
      {d.state !== "CLAIM" && !ticket && claim?.status !== "claimed" && <Callout tone="warn" title={d.state === "SETTLED" ? "Claiming is over" : "Claiming has not opened yet"}>{d.state === "SETTLED" ? "All seats are given out." : "Winners can claim once the draw is done and the claim stage starts."}</Callout>}
      {res && res.outcome !== "won" && !ticket && !holding && (
        <div className="panel space-y-3 p-6">
          <div className={cn("display text-[clamp(2.8rem,10vw,5rem)]", res.outcome === "waitlist" ? "text-warn" : "text-hot")}>{res.outcome === "waitlist" ? `Waiting list #${res.waitlist_position}` : "Not this time"}</div>
          <p className="max-w-xl text-[15px] text-ink/90">{res.outcome === "waitlist" ? "You do not hold a seat yet. If a winner misses their claim deadline, you are promoted automatically and a seat appears here. Keep this page open." : "Your entry did not win a seat or a place on the waiting list. It was a fair, random draw that anyone can re-run."}</p>
          <Link href={`/verify?drop=${id}&receipt=${rid}`}><Button variant="secondary">Re-run the draw myself</Button></Link>
        </div>
      )}

      {holding && (
        <div className="grid gap-8 lg:grid-cols-[26rem_1fr] lg:gap-12">
          <section className="space-y-4">
            <ConcertTicket pending={!ticket} event={d.event_name} venue={d.venue} startsAt={d.starts_at} seat={seatLabel(res?.tier || ticket?.tier, seatNo)} tier={tier?.name} paid={tier && money(tier.price_cents)}
              note={ticket ? "Paid and confirmed (mock). Open your ticket for the QR code." : claim?.promoted ? "Promoted from the waiting list." : "This seat is held for you while the timer runs."} />
          </section>

          <section className="space-y-5">
            {!ticket ? (
              <>
                <div className={cn("panel relative overflow-hidden p-5", urgent ? "glow-hot" : "glow-gold")}>
                  <div className="eyebrow flex items-center gap-2"><Hourglass className="h-3.5 w-3.5" />Your seat is held for</div>
                  <div className={cn("display num mt-1 text-[clamp(4rem,16vw,7.5rem)] leading-none", urgent ? "text-hot" : "text-gold")}>{left !== null ? fmtDur(left) : "-"}</div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className={cn("h-full transition-[width] duration-300", urgent ? "bg-hot" : "bg-gold")} style={{ width: `${left !== null ? Math.min(100, (left / (d.claim_sec * 1000)) * 100) : 0}%` }} /></div>
                  <p className="mt-3 text-[13.5px] text-mute">If the timer reaches zero the seat passes to the next person on the waiting list. This is not a punishment: it just keeps every seat from sitting empty.</p>
                  <Backstage className="mt-3 border-t border-line pt-3">{BACKEND_BY_STATE.CLAIM}</Backstage>
                </div>
                <div className="panel space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="eyebrow flex items-center gap-2 text-gold"><CreditCard className="h-3.5 w-3.5" />Box office</div><Badge tone="amber">Mock payment: no real money moves</Badge></div>
                  <div className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-3"><Label>Card number</Label><Input value={card.num} onChange={(e) => setCard({ ...card, num: e.target.value })} inputMode="numeric" /></div><div><Label>Expiry</Label><Input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} /></div><div><Label>CVC</Label><Input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></div></div>
                  <Button size="lg" className="w-full" disabled={busy || left === 0} onClick={pay}>{busy ? "Processing…" : `Pay ${tier ? money(tier.price_cents) : ""} and claim my seat`}</Button>
                  {err && <Callout tone="bad" title="Could not claim">{err}</Callout>}
                  <p className="text-xs text-mute">Proof that the seat is yours: your browser holds the secret ticket whose fingerprint is your receipt id. Only whoever holds it can claim.</p>
                </div>
              </>
            ) : (
              <div className="panel glow-lime space-y-3 p-6">
                <div className="flex items-center gap-2 eyebrow text-lime"><Led tone="lime" />Payment confirmed (mock)</div>
                <div className="display text-[clamp(3rem,11vw,5.5rem)] text-lime">Seat claimed</div>
                <p className="text-[15px] text-ink/90">The seat is yours. Your ticket, with its QR code, is ready.</p>
                <Link href={`/ticket/${id}`}><Button size="lg">See my ticket<ArrowRight className="h-4 w-4" /></Button></Link>
              </div>
            )}
            <OneTicket />
          </section>
        </div>
      )}

      {err && !claim && !holding && <Callout tone="bad" title="Could not claim">{err}</Callout>}
      {claim?.status === "expired" && <Callout tone="bad" title="Your claim time ran out">The seat passed to the next waiting entry. Nothing is charged.</Callout>}
      {claim?.status === "claimed" && !ticket && <Callout tone="ok" title="You already claimed this seat"><Link className="font-semibold underline" href={`/ticket/${id}`}>See my ticket</Link></Callout>}

      {holding && seats && (
        <section className="space-y-4">
          <SectionHead n="02" kicker="Your seat in the room" title="Look for the gold one" />
          <div className="panel p-4 md:p-8"><SeatMap data={seats} mine={seatNo} prices={prices} /></div>
        </section>
      )}
    </div>
  );
}
