"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, MousePointerClick } from "lucide-react";
import { api, money, seatLabel, session, usePoll } from "@/lib/api";
import { Button, Counter, Led, SectionHead, Spinner, cn, fmtDur, useCountdown } from "@/components/ui";
import JourneyRail, { journeyStepOld } from "@/components/fan/JourneyRail";
import { Backstage, friendly, showDate } from "@/components/fan/kit";

const BAND = ["Fastest click wins", "Bots click fastest", "Refresh refresh refresh", "No queue, just a race", "Sold out in seconds"];

// The classic ticket sale: exists purely for the demo. "Fastest requests win."
export default function Baseline() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: d } = usePoll(() => api<any>(`/drops/${id}`), 1500, [id]);
  const { data: s } = usePoll(() => api<any>(`/baseline/${id}/status`), 700, [id]);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const [mine, setMine] = useState<{ tier: string; seat: number }[]>([]);
  const [signed, setSigned] = useState(true);
  useEffect(() => { if (!session.get()) { setSigned(false); router.replace(`/login?next=/baseline/${id}`); } }, [id, router]);
  const off = d ? d.server_time_ms - Date.now() : 0;
  const toOpen = useCountdown(d?.state === "SCHEDULED" ? d.opens_at_ms : undefined, off);

  const buy = async (tier: string) => {
    try {
      const r = await api(`/baseline/${id}/buy`, { body: { tier }, auth: "user" });
      setMine((m) => [...m, { tier, seat: r.seat_no }]); setLog((l) => [{ ok: true, text: `Got seat ${seatLabel(tier, r.seat_no)} (request landed at ${new Date(r.arrival_ms).toLocaleTimeString()}.${r.arrival_ms % 1000})` }, ...l]);
    } catch (e: any) { setLog((l) => [{ ok: false, text: ({ sold_out: "SOLD OUT: someone's request landed first.", limit_reached: "Per-account limit reached.", sale_closed: "Sale closed.", rate_limited: "Rate limited: slow down." } as Record<string, string>)[e.code as string] || friendly(e.code, e.message).body }, ...l]); }
  };
  if (!d || !s) return <Spinner label="Pushing through the crowd…" />;
  const step = journeyStepOld(d.state, signed);
  const open = d.state === "OPEN";
  const totalLeft = s.tiers.reduce((a: number, t: any) => a + t.seats - t.sold, 0);
  const total = s.tiers.reduce((a: number, t: any) => a + t.seats, 0);

  return (
    <div className="space-y-6">
      <div className="marquee -mx-4 border-hot/40 bg-hot text-black md:mx-0 md:rounded-[4px]" aria-hidden>
        <div className="marquee-track">{[0, 1].flatMap((k) => BAND.map((b, i) => <span key={`${k}-${i}`} className="display flex items-center gap-10 text-xl tracking-wide">{b}<i className="led text-black" /></span>))}</div>
      </div>

      <div role="alert" className="rounded-[6px] border-2 border-hot bg-hot/12 p-5 md:p-7 glow-hot">
        <div className="eyebrow flex items-center gap-2 text-hot"><Led tone="hot" pulse />The old way · {d.event_name} · {d.venue} · {showDate(d.starts_at).day}</div>
        <div className="display mt-3 text-[clamp(2.4rem,8.5vw,5.2rem)] text-hot text-glow-hot">This is the OLD way: fastest click wins. Bots click fastest.</div>
        <p className="mt-3 max-w-3xl text-[15.5px] leading-relaxed text-ink/90">
          This is the classic sale Fair Drop replaces. Whoever&apos;s request reaches the server first gets the seat, so scripts and bot farms beat people. <b>Here one login can take up to {s.max_per_account} seats</b>, so fast clickers take many. Fair Drop gives every person exactly one fair chance at one seat.
        </p>
      </div>

      <JourneyRail step={step} mode="fcfs" />
      <p className="text-[14px] text-mute">What you are looking at: a plain ticket shop. Press BUY as fast as you can. The counters show real seats going, live from the server.</p>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHead n="01" kicker="The scramble" title={open ? "BUY, BUY, BUY" : d.state === "SCHEDULED" ? "Waiting for the gun" : "Sale over"} />
          <div className="sm:text-right"><div className="eyebrow">Seats left, all tiers</div><div className="display num text-6xl text-hot"><Counter value={totalLeft} /><span className="text-2xl text-mute"> / {total}</span></div></div>
        </div>
        {d.state === "SCHEDULED" && toOpen !== null && <div className="panel border-hot/40 p-4 text-center"><span className="eyebrow">The sale starts in</span><div className="display num text-6xl text-hot">{fmtDur(toOpen)}</div></div>}
        <div className="space-y-3">
          {s.tiers.map((t: any) => {
            const left = t.seats - t.sold;
            return (
              <div key={t.id} className={cn("relative flex overflow-hidden rounded-[5px] border bg-panel2", left === 0 ? "border-line opacity-80" : "border-hot/60")}>
                <span className="w-2 shrink-0 bg-hot" />
                <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-3 p-4 grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto]">
                  <div className="min-w-0">
                    <div className="display text-3xl">{t.name}</div>
                    <div className="display num text-2xl text-gold">{money(t.price_cents)}</div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" title={`${t.sold} of ${t.seats} sold`}><div className="h-full bg-hot transition-[width] duration-500" style={{ width: `${(t.sold / t.seats) * 100}%` }} /></div>
                  </div>
                  <div className="text-right"><div className={cn("display num text-6xl leading-none", left === 0 ? "text-mute" : "text-hot")}><Counter value={left} /></div><div className="eyebrow">of {t.seats} left</div></div>
                  <Button size="lg" variant="danger" className={cn("col-span-2 w-full text-xl sm:col-span-1 sm:w-auto sm:min-w-[9rem]", open && left > 0 && "alarm")} disabled={!open || left === 0} onClick={() => buy(t.id)}>
                    <MousePointerClick className="h-5 w-5" />{left === 0 ? "Sold out" : "BUY"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <Backstage>The server handles BUY requests in the order they land and hands the seat to the earliest. It checks the account limit and nothing else: it cannot tell a person from a script.</Backstage>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel space-y-3 p-5">
          <div className="flex items-center justify-between"><div className="eyebrow text-hot">Your purchases</div><span className="font-mono text-xs text-mute">{mine.length} of {s.max_per_account} allowed per login</span></div>
          {mine.length === 0 && <div className="text-sm text-mute">Nothing yet. Click BUY as fast as you can…</div>}
          <div className="flex flex-wrap gap-2">{mine.map((m, i) => <span key={i} className="display rounded-[3px] border border-lime/50 bg-lime/10 px-3 py-1 text-2xl text-lime">{seatLabel(m.tier, m.seat)}</span>)}</div>
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-[12px]">{log.map((l, i) => <li key={i} className={l.ok ? "text-lime" : "text-mute"}>{l.ok ? "+ " : "- "}{l.text}</li>)}</ul>
        </div>
        <div className="panel space-y-3 p-5">
          <div className="eyebrow flex items-center gap-2 text-hot"><Bot className="h-3.5 w-3.5" />Why this is unfair</div>
          <ul className="list-disc space-y-2 pl-5 text-[14.5px] leading-snug text-ink/90">
            <li>A person clicks in a fraction of a second. A script clicks thousands of times a second.</li>
            <li>One login may buy up to {s.max_per_account} seats, so a bot with many logins empties the room.</li>
            <li>Nothing here knows a human from a bot. Speed is the only thing that counts.</li>
          </ul>
          <Link href="/" className="inline-block"><Button variant="secondary">See how Fair Drop answers this</Button></Link>
        </div>
      </section>
    </div>
  );
}
