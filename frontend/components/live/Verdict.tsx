"use client";
// WHO GOT THE SEATS: one bar per method. The ranked takeaway appears only when the final numbers are in AND they say so (computed here).
import type { Arena } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import { Badge, Counter, SectionHead, cn } from "@/components/ui";
import { METHOD_NAME, MethodKey, fairHeld, fmtPct } from "./derive";

const ROWS: { k: MethodKey; text: string }[] = [{ k: "fcfs", text: "text-hot" }, { k: "naive", text: "text-violet" }, { k: "fair", text: "text-gold" }];

export default function Verdict({ a, compact }: { a: Arena; compact?: boolean }) {
  const held = fairHeld(a);
  const done = ROWS.filter((r) => a.methods[r.k].status !== "waiting");
  const rank = a.verdictFinal ? [...done].sort((x, y) => a.methods[x.k].botSeatSharePct - a.methods[y.k].botSeatSharePct) : [];
  const f = a.methods.fair, o = a.methods.fcfs, nv = a.methods.naive;
  return (
    <section className="space-y-5" aria-label="Who got the seats">
      {!compact && <SectionHead n="03" kicker="the verdict" title={<>Who got <span className="text-gold">the seats</span></>}>One bar per method: how many of the {SEATS} seats went to real people and how many to bots.</SectionHead>}
      <div className="panel space-y-5 p-5">
        {ROWS.map(({ k, text }) => {
          const m = a.methods[k], hs = Math.round(m.humanSeats), bs = Math.round(m.botSeats), waiting = m.status === "waiting";
          return (
            <div key={k} className="grid items-center gap-x-6 gap-y-1.5 lg:grid-cols-[230px_1fr]">
              <div><div className={cn("display text-3xl", text)}>{METHOD_NAME[k]}</div><Badge tone={waiting ? "gray" : m.status === "final" ? "gold" : m.status === "live" ? "green" : "violet"} title={m.note}>{m.status}</Badge></div>
              <div className="min-w-0 space-y-1.5">
                <div className="flex h-12 w-full overflow-hidden rounded-[4px] border border-line bg-bg/70" role="img" aria-label={`${hs} seats to real people, ${bs} to bots, out of ${SEATS}`}>
                  <div className="flex h-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap bg-ice font-mono text-sm font-bold text-black transition-[flex-basis] duration-700 ease-out motion-reduce:transition-none" style={{ flexBasis: `${(hs / SEATS) * 100}%` }}>{hs > 24 && <><Counter value={hs} /> real people</>}</div>
                  <div className="flex h-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap bg-hot font-mono text-sm font-bold text-white transition-[flex-basis] duration-700 ease-out motion-reduce:transition-none" style={{ flexBasis: `${(bs / SEATS) * 100}%` }}>{bs > 24 && <><Counter value={bs} /> bots</>}</div>
                </div>
                <p className="text-[15px] text-ink/90">{waiting ? <span className="text-mute">Waiting for the result.</span> : <>Bots were <b className="text-hot">{fmtPct(m.botCrowdSharePct)}</b> of the crowd and took <b className="text-hot">{fmtPct(m.botSeatSharePct)}</b> of the seats ({bs} bots, {hs} real people{hs + bs < SEATS ? `, ${SEATS - hs - bs} empty` : ""}).</>}</p>
              </div>
            </div>
          );
        })}
      </div>

      {a.verdictFinal && (
        <div className="panel glow-gold space-y-2 border-gold/60 p-5">
          <div className="eyebrow text-gold">The takeaway, calculated from the final numbers</div>
          {held === null
            ? <p className="text-lg">There were no bots in this crowd, so every seat went to a real person with every method.</p>
            : held.held
              ? <p className="text-xl font-semibold leading-snug">Fair Drop held bots to their share of the crowd: <span className="text-hot">{fmtPct(f.botSeatSharePct)}</span> of the seats for <span className="text-hot">{fmtPct(f.botCrowdSharePct)}</span> of the crowd.
                {o.botSeatSharePct > o.botCrowdSharePct * 1.25 && <> First come, first served handed them <span className="text-hot">{fmtPct(o.botSeatSharePct)}</span>.</>}
                {nv.botSeatSharePct > nv.botCrowdSharePct * 1.25 && <> The simple lottery handed them <span className="text-hot">{fmtPct(nv.botSeatSharePct)}</span>.</>}</p>
              : <p className="text-xl font-semibold leading-snug">In this test Fair Drop did not hold bots to their share: they took <span className="text-hot">{fmtPct(f.botSeatSharePct)}</span> of the seats for <span className="text-hot">{fmtPct(f.botCrowdSharePct)}</span> of the crowd. Look at which kind of bot got the seats below.</p>}
          {rank.length > 1 && <p className="font-mono text-[12px] uppercase tracking-[.12em] text-mute">Fewest seats to bots first: {rank.map((r, i) => <span key={r.k}>{i > 0 && " · "}<b className="text-ink">{i + 1}. {METHOD_NAME[r.k]}</b> {fmtPct(a.methods[r.k].botSeatSharePct)}</span>)}</p>}
        </div>
      )}
      <p className="text-[13px] text-mute"><b className="text-ink">What we do not claim:</b> Fair Drop gives each login one entry. It does not stop someone who owns many real verified accounts: each bought account still gets one entry, and that costs them money.</p>
    </section>
  );
}
