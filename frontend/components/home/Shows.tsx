"use client";
import { Ban, Check, Ticket, TriangleAlert } from "lucide-react";
import { api, money } from "@/lib/api";
import { useOnceOrAdminPoll } from "./useLandingData";
import { Badge, Callout, Spinner, StateBadge, Stub } from "@/components/ui";
import { Chapter, Kicker, LinkBtn, Poster, Wrap } from "./parts";

const CLAIM = [
  "Speed, request volume and switching internet address do not change your odds in the fair draw.",
  "The server cannot quietly drop your entry or rig the draw, and you can prove it yourself.",
  "One login is one entry and at most one seat.",
];
const NOT: [string, string][] = [
  ["We do not stop identity farms.", "Someone who owns many real, verified accounts still gets one entry per account. We only make that cost real money."],
  ["Most of our test crowd uses a shortcut ticket.", "To run tens of thousands of simulated fans quickly, most skip the full secret-ticket steps. The real ticket path is exercised by the Real-ticket bot, not by the whole crowd."],
  ["Measured on one laptop.", "Every speed and timing in our tests comes from a single laptop, not a data centre. The phone check is simulated and payments are mock."],
];

export default function Shows() {
  const { data, error } = useOnceOrAdminPoll(() => api<any[]>("/drops"));
  const drops = (data || []).filter((d) => !String(d.id).startsWith("exp-"));
  return (
    <Chapter id="limits" idx={7} className="py-24 md:py-32">
      <Wrap>
        <Kicker n="07" label="Honest limits, then try it" time="3:50" />
        <Poster className="mt-4">What we claim.<br /><span className="text-[#cfc7e6]">What we don&apos;t.</span></Poster>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
          <div className="solid rounded-[6px] border-lime/40 p-6" data-reveal>
            <div className="eyebrow mb-4 flex items-center gap-2 text-lime"><Check className="h-4 w-4" aria-hidden />We claim</div>
            <ul className="space-y-3">{CLAIM.map((c) => <li key={c} className="flex gap-3 text-[17px] text-ink"><i className="led mt-2 shrink-0 text-lime" />{c}</li>)}</ul>
          </div>
          <div className="relative overflow-hidden rounded-[6px] border border-hot/30 bg-[rgba(10,7,20,.9)] p-6" data-reveal>
            <div className="absolute inset-x-0 top-0 h-1.5 [background:repeating-linear-gradient(135deg,#ff3b5c_0_10px,#07050d_10px_20px)]" aria-hidden />
            <div className="eyebrow mb-4 flex items-center gap-2 pt-1 text-hot"><Ban className="h-4 w-4" aria-hidden />We do not claim</div>
            <ul className="space-y-4">{NOT.map(([t, d]) => <li key={t} className="flex gap-3"><i className="led mt-2 shrink-0 text-hot" /><p className="text-[17px] leading-snug text-ink"><b className="text-ink">{t}</b> {d}</p></li>)}</ul>
          </div>
        </div>

        <div id="shows" className="mt-28 scroll-mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow flex items-center gap-3 text-gold"><Ticket className="h-4 w-4" aria-hidden /><span>Now playing</span></div>
              <Poster className="mt-3 !text-[clamp(3rem,9vw,8rem)]">Pick a <span className="text-gold text-glow-gold">show.</span></Poster>
            </div>
            <p className="solid max-w-sm rounded-[6px] p-4 text-[16px] text-ink">Loaded from the server when this page opened. Each ticket is a real sale you can open, enter and verify. Tests run by the control room are hidden from this list.</p>
          </div>

          <div className="mt-8">
            {!data && !error && <Spinner label="Loading the shows" />}
            {error && (
              <Callout tone="bad" title="The shows could not be loaded">
                <span className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />The server did not answer ({String((error as Error).message)}). Reload the page to try again; the rest of this page works without it.</span>
              </Callout>
            )}
            {data && drops.length === 0 && (
              <div className="solid flex flex-col items-start gap-3 rounded-[6px] p-8">
                <Ticket className="h-8 w-8 text-gold" aria-hidden />
                <div className="display text-3xl">No shows yet.</div>
                <p className="text-[17px] text-ink">An admin creates one in the control room.</p>
                <LinkBtn href="/admin" variant="secondary" size="sm">Open the control room</LinkBtn>
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {drops.map((d) => {
                const fcfs = d.mode === "fcfs";
                return (
                  <Stub key={d.id} accent={fcfs ? "hot" : "gold"} className={fcfs ? "" : "glow-gold"}
                    tear={
                      <div className="flex min-h-[56px] flex-wrap items-center gap-2">
                        <LinkBtn href={fcfs ? `/baseline/${d.id}` : `/events/${d.id}`} size="sm" variant="secondary">Event page</LinkBtn>
                        {!fcfs && d.state === "OPEN" && <LinkBtn href={`/enter/${d.id}`} size="sm" variant="primary">Enter now</LinkBtn>}
                        {!fcfs && d.merkle_root && <LinkBtn href={`/verify?drop=${d.id}`} size="sm" variant="ghost">Verify</LinkBtn>}
                      </div>
                    }>
                    <div className="flex items-start justify-between gap-3">
                      <Badge tone={fcfs ? "red" : "gold"}>{fcfs ? "Old way" : "Fair Drop"}</Badge>
                      <StateBadge state={d.state} />
                    </div>
                    <h3 className="display mt-3 text-4xl">{d.event_name}</h3>
                    <div className="mt-1 text-[15px] text-[#cfc7e6]">{d.venue} · {new Date(d.starts_at).toLocaleDateString()}</div>
                    <ul className="mt-4 divide-y divide-dashed divide-line border-y border-dashed border-line font-mono text-[13px]">
                      {d.tiers.map((t: any) => <li key={t.id} className="flex items-center justify-between gap-3 py-1.5"><span className="uppercase tracking-wider text-ink">{t.name}</span><span className="text-mute">{money(t.price_cents)} · <span className="num">{t.seats}</span> seats</span></li>)}
                    </ul>
                    <div className="mt-3 font-mono text-[12px] uppercase tracking-[.12em] text-[#cfc7e6]">{fcfs ? "Up to 4 seats per login. Fastest click wins." : "1 login · 1 ticket · 1 seat at most"}</div>
                  </Stub>
                );
              })}
            </div>
          </div>

          <div className="mt-14 flex flex-wrap gap-3">
            <LinkBtn href="/live" variant="primary">Watch it live</LinkBtn>
            <LinkBtn href="/verify">Verify a draw</LinkBtn>
            <LinkBtn href="/login" variant="ghost">Sign in</LinkBtn>
            <LinkBtn href="#top" variant="ghost">Back to the start</LinkBtn>
          </div>
        </div>
      </Wrap>
    </Chapter>
  );
}
