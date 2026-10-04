"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, DoorClosed, DoorOpen, Lock, ShieldCheck, Users } from "lucide-react";
import { api, entries, fmtTime, usePoll } from "@/lib/api";
import { receiptId, unb64 } from "@/lib/fdcrypto";
import SeatMap from "@/components/SeatMap";
import { Badge, Button, Callout, Counter, Hash, Led, SectionHead, Spinner, STAGE, STATES, Timeline, cn, fmtDur, stageName } from "@/components/ui";
import JourneyRail, { journeyStep, journeyStepOld } from "@/components/fan/JourneyRail";
import { Backstage, BACKEND_BY_STATE, Narrator, OneTicket, Poster, TierStub, useMaxPerAccount } from "@/components/fan/kit";
import { useFan } from "@/components/fan/useFan";

// "What happens next, in plain words", per stage of the sale.
const NEXT: Record<string, { head: string; steps: string[] }> = {
  SCHEDULED: { head: "The doors are not open yet", steps: ["Sign in now if you have not: your phone must be verified before the cutoff time below.", "When the doors open, press Enter the draw. Your browser makes a secret ticket and the door signs it without seeing it.", "There is no race. Walking in the second the doors open or an hour later gives exactly the same chance."] },
  OPEN: { head: "The doors are open", steps: ["Press Enter the draw. It takes a few seconds and there is no queue to beat.", "You get a signed receipt. Keep it: it proves you were let in.", "Everyone inside has the same chance, early or late. When the doors close the list is sealed and the winners are drawn."] },
  CLOSED: { head: "The doors have closed", steps: ["No more entries are accepted. If you got in, you are in; if not, this sale has gone without you.", "Next the list is frozen and sealed with a public fingerprint, then the draw runs."] },
  LOCKED: { head: "The list is sealed", steps: ["Every entry is now on a final list with a public fingerprint. Nobody can add, remove or swap a name.", "Next the secret seed is revealed and the random draw picks the winners. Anyone can re-run it."] },
  DRAWN: { head: "The winners are picked", steps: ["Open My entry to see whether you won a seat or where you stand on the waiting list.", "Do not trust us: the page Check the draw recomputes the whole draw in your browser."] },
  CLAIM: { head: "Winners are claiming seats", steps: ["If you won, press Claim my seat and pay within the time window (mock payment, no real money).", "A seat nobody claims passes to the next person on the waiting list."] },
  SETTLED: { head: "The sale is finished", steps: ["All seats are given out and the record is permanent.", "Winners keep their ticket in My entry. Anyone can still re-run the draw."] },
};

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { d, error, sess, hasEntry, toOpen, toClose, eligible } = useFan(id);
  const [rid, setRid] = useState<string | undefined>();
  useEffect(() => { const le = entries.get(id); if (le) setRid(le.receipt?.receipt_id || receiptId(id, unb64(le.token_msg))); }, [id]);
  const ord = d ? STATES.indexOf(d.state) : 0;
  const { data: res } = usePoll(() => (rid && ord >= 4 ? api<any>(`/drops/${id}/result/${rid}`) : Promise.resolve(null)), 2500, [id, rid, ord]);
  const { data: seats } = usePoll(() => api<any>(`/drops/${id}/seats`), 3000, [id]);
  const maxPer = useMaxPerAccount();

  if (error && !d) return <Callout tone="bad" title="We cannot find this show">{String((error as any).message)}</Callout>;
  if (!d) return <Spinner label="Opening the venue…" />;

  const old = d.mode === "fcfs";
  const step = old ? journeyStepOld(d.state, !!sess) : journeyStep(d.state, { signedIn: !!sess, hasEntry });
  const prices = Object.fromEntries(d.tiers.map((t: any) => [t.id, t.price_cents]));
  const next = NEXT[d.state] || NEXT.SCHEDULED;

  // the one clear primary action
  type Cta = { label: string; href?: string; disabled?: boolean; sub?: string; variant?: "primary" | "danger" | "secondary" };
  let cta: Cta;
  if (old) cta = { label: "Go to the old-style sale", href: `/baseline/${id}`, variant: "danger", sub: "This sale is first-come-first-served: the fastest click wins." };
  else if (!sess && ord <= 1) cta = { label: "Sign in to enter", href: `/login?next=/enter/${id}`, sub: "Do it now: your phone must be verified before the cutoff." };
  else if (res?.claim?.status === "reserved") cta = { label: "Claim my seat", href: `/claim/${id}`, sub: "You won. Claim and pay inside the time window." };
  else if (res?.claim?.status === "claimed") cta = { label: "See my ticket", href: `/ticket/${id}`, sub: "Your seat is yours." };
  else if (hasEntry) cta = { label: "See my entry", href: `/status/${id}`, variant: "secondary", sub: "You hold a receipt for this sale." };
  else if (d.state === "SCHEDULED") cta = { label: "Waiting for doors", disabled: true, sub: toOpen !== null ? `Doors open in ${fmtDur(toOpen)}` : undefined };
  else if (d.state === "OPEN") cta = eligible === false ? { label: "Not eligible", disabled: true, sub: "Your phone was verified after the cutoff." } : { label: "Enter the draw", href: `/enter/${id}`, sub: "Takes a few seconds. No race." };
  else cta = { label: "Doors are closed", disabled: true, sub: "Entries are over for this sale." };

  const live = d.state === "OPEN";
  const clock = d.state === "SCHEDULED" ? toOpen : toClose;

  return (
    <div className="space-y-6">
      <Poster d={d} kicker={old ? "Old way: first come, first served" : "Fair Drop presents"} tone={old ? "hot" : "gold"} />
      <JourneyRail step={step} mode={old ? "fcfs" : "fairdrop"} />
      <p className="text-[14px] text-mute">What you are looking at: the show, its tickets and the live waiting room for the sale. Everything on this page updates by itself.</p>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* ---------- the door ---------- */}
        <section className="space-y-5">
          <SectionHead n="01" kicker="The waiting room" title={<>{live ? "Doors are open" : stageName(d.state)}</>} />
          <div className={cn("panel relative overflow-hidden p-5", live && "glow-lime")}>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
              <div>
                <div className="eyebrow">{d.state === "SCHEDULED" ? "Doors open in" : live ? "Doors close in" : "Sale stage"}</div>
                <div className="display num mt-1 text-[clamp(3rem,13vw,5rem)] leading-none text-gold">{clock !== null && clock !== undefined ? fmtDur(clock) : <span className="inline-flex items-center gap-3"><Led tone={ord >= 4 ? "lime" : "violet"} pulse />{ord >= 3 ? "Sealed" : "Closed"}</span>}</div>
              </div>
              <div className="space-y-2 text-[14px]">
                <Narrator tone={live ? "lime" : d.state === "SCHEDULED" ? "gold" : "violet"}>
                  {d.state === "SCHEDULED" && "Nobody is being let in yet. You can sign in now so you are ready when the doors open."}
                  {d.state === "OPEN" && "The door is checking IDs and handing out tickets. Everyone who gets in before closing time has the same chance."}
                  {d.state === "CLOSED" && "The doors are shut. The list of entries is being frozen."}
                  {d.state === "LOCKED" && `The list of ${d.entry_count?.toLocaleString() ?? "all"} entries is sealed. The draw is next.`}
                  {d.state === "DRAWN" && "The draw is done and the winners are decided."}
                  {d.state === "CLAIM" && "Winners are claiming their seats now."}
                  {d.state === "SETTLED" && "All seats are given out. The sale is over."}
                </Narrator>
                <p className="flex items-start gap-2 rounded-[4px] border border-gold/30 bg-gold/5 px-3 py-2 text-[13.5px] text-ink/90"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />Early or late makes no difference in Fair Drop. Arrival time is never used to pick winners.</p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-3">
              <div className="bg-panel p-3"><dt className="eyebrow">Seats on sale</dt><dd className="display num mt-1 text-3xl"><Counter value={d.total_seats} /></dd><div className="text-[11px] text-mute">sum of all tiers</div></div>
              <div className="bg-panel p-3"><dt className="eyebrow flex items-center gap-1"><Users className="h-3 w-3" />Entries</dt>
                <dd className="display num mt-1 text-3xl text-ice">{d.entry_count !== undefined ? <Counter value={d.entry_count} /> : "-"}</dd>
                <div className="text-[11px] text-mute">{d.entry_count !== undefined ? "counted when the list was sealed" : "the number is published when the list is sealed"}</div></div>
              <div className="col-span-2 bg-panel p-3 sm:col-span-1"><dt className="eyebrow">Your ID card</dt>
                <dd className="mt-1.5 text-[13.5px]">
                  {!sess ? <span className="flex items-center gap-2"><Led tone="warn" />Not signed in. <Link className="text-gold underline" href={`/login?next=/events/${id}`}>Sign in</Link></span>
                    : eligible ? <span className="flex items-center gap-2"><Led tone="lime" />Verified before the cutoff. You can enter.</span>
                    : <span className="flex items-center gap-2"><Led tone="hot" />Verified after the cutoff. Browse only.</span>}
                </dd></div>
            </dl>
            <div className="mt-5 space-y-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {cta.href && !cta.disabled ? (
                  <Link href={cta.href}><Button size="lg" variant={cta.variant}>{cta.label}<ArrowRight className="h-4 w-4" /></Button></Link>
                ) : <Button size="lg" disabled variant="secondary">{live ? <DoorOpen className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}{cta.label}</Button>}
                {cta.sub && <span className="text-[13px] text-mute">{cta.sub}</span>}
              </div>
              {!old && <OneTicket />}
            </div>
            <Backstage className="mt-4 border-t border-line pt-3">{BACKEND_BY_STATE[d.state]}</Backstage>
          </div>

          <div className="panel p-5">
            <div className="eyebrow text-gold">What happens next, in plain words</div>
            <h3 className="display mt-1 text-3xl">{next.head}</h3>
            <ol className="mt-3 space-y-2.5">
              {next.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[14.5px] leading-snug"><span className="display grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/50 text-sm text-gold">{i + 1}</span><span className="pt-0.5 text-ink/90">{s}</span></li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- the tickets ---------- */}
        <aside className="space-y-4">
          <SectionHead n="02" kicker="The tickets" title="Pick your tier" />
          <div className="space-y-3">{d.tiers.map((t: any, i: number) => <TierStub key={t.id} t={t} i={i} hot={old} sub={`seats ${t.seat_offset + 1}-${t.seat_offset + t.seats}`} />)}</div>
          <p className="text-[12.5px] text-mute">Seat numbers are handed out by draw rank, never by who clicked first. You choose the tier when you enter.</p>
          {!old && (
            <Callout tone="info" title="1 login, 1 ticket, 1 seat at most">
              The old first-come sale lets one account grab {maxPer ? `up to ${maxPer} seats` : "several seats"}, so fast clickers take many. Fair Drop gives each verified person exactly one fair chance at one seat.
            </Callout>
          )}
          <Callout tone="warn" title="Honest limit">Fair Drop caps entries per verified person. It does not stop someone who owns many real, verified phones: each of those still gets only one entry.</Callout>
        </aside>
      </div>

      {/* ---------- the room ---------- */}
      <section className="space-y-5">
        <SectionHead n="03" kicker="The room" title="Where your seat could be">
          The arena seen from above, stage at the top. Every square is one seat. During the sale all seats are free; after the draw they turn to held, then claimed. Your own seat, once you have one, glows gold.
        </SectionHead>
        <div className="panel p-4 md:p-8">{seats ? <SeatMap data={seats} mine={res?.claim?.seat_no} prices={prices} /> : <Spinner label="Loading the seating plan…" />}</div>
      </section>

      {/* ---------- the schedule ---------- */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionHead n="04" kicker="The sale" title="Stage by stage" />
          <div className="panel space-y-4 p-5">
            <Timeline state={d.state} mode={d.mode} />
          </div>
        </div>
        <div className="space-y-4">
          <SectionHead n="05" kicker="The clock" title="Key times" />
          <dl className="panel divide-y divide-line text-[14px]">
            {[["Cutoff for ID verification", fmtTime(d.cutoff_at_ms), "Phones verified after this cannot enter."], ["Doors open", fmtTime(d.opens_at_ms), "Entries start."], ["Doors close", fmtTime(d.closes_at_ms), "Entries end, the list is sealed."], ["Claim time for winners", `${d.claim_sec} seconds`, "After the draw, per winner."]].map(([k, v, s]) => (
              <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-3"><dt><span className="font-semibold">{k}</span><span className="block text-[12px] text-mute">{s}</span></dt><dd className="num font-mono text-[13px] text-gold">{v}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- the proofs ---------- */}
      {!old && (
        <section className="space-y-5">
          <SectionHead n="06" kicker="The proofs" title="Do not trust us. Check.">
            These public numbers are published so anyone can confirm the sale was fair. You do not need to read them: the check page does it for you.
          </SectionHead>
          <div className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="violet" title={d.token_mode === "blind" ? "RFC 9474 blind RSA signatures" : "plain signed tokens"}>{d.token_mode === "blind" ? "Blind-signed tickets: the door cannot link a ticket to you" : "Plain signed tickets (privacy fallback)"}</Badge>
              <Badge tone={d.merkle_root ? "green" : "gray"}><Lock className="h-3 w-3" />{d.merkle_root ? "list sealed" : "list not sealed yet"}</Badge>
            </div>
            <Hash label="Draw promise: the fingerprint of the secret seed, published before the sale (seed hash)" v={d.seed_hash} />
            <Hash label="The door's public stamp, used to check tickets (token signing public key)" v={d.public_key} />
            <Hash label="Fingerprint of the final list of entries (Merkle root)" v={d.merkle_root || "Published when the doors close and the list is sealed."} />
            {d.seed && <Hash label="The secret seed, revealed after the list was sealed" v={d.seed} />}
            {d.beacon_round ? <div className="text-xs text-mute">A public random beacon (drand round <b className="text-ink">{d.beacon_round}</b>) was mixed in after the list was sealed, so not even the organisers could steer the draw.</div> : null}
            <div className="flex flex-wrap gap-2">
              <Link href={`/status/${d.id}`}><Button variant="secondary" size="sm">My entry</Button></Link>
              <Link href={`/verify?drop=${d.id}`}><Button variant="ghost" size="sm"><ShieldCheck className="h-4 w-4" />Re-run the draw myself</Button></Link>
            </div>
          </div>
        </section>
      )}
      <span className="sr-only">{STAGE[d.state]?.[1]}</span>
    </div>
  );
}
