"use client";
import { ArrowUpRight, Ruler } from "lucide-react";
import { cn } from "@/components/ui";
import { PROXY_FLOOD as R } from "./config";
import { Chapter, Kicker, LinkBtn, Looking, Poster, Wrap } from "./parts";

const Bar = ({ label, pct, bar, shown }: { label: string; pct: number; bar: string; shown: string }) => (
  <div>
    <div className="mb-1 flex items-baseline justify-between gap-3 font-mono text-[12px] uppercase tracking-[.14em] text-[#cfc7e6]"><span>{label}</span><b className="num text-ink">{shown}</b></div>
    <div className="h-2.5 rounded-full bg-black/50"><div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(1.5, (pct / 25) * 100)}%` }} /></div>
  </div>
);

const Section = ({ k, children }: { k: string; children: React.ReactNode }) => <div><div className="eyebrow mb-1">{k}</div><div className="text-[14.5px] leading-snug text-ink/90">{children}</div></div>;

function PerLogin({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[4px] border-l-4 px-3 py-2.5 text-[15px] font-semibold leading-snug text-ink", tone)}><span className="eyebrow mb-0.5 block text-[11px] text-[#cfc7e6]">Per login</span>{children}</div>;
}
const Measured = () => <div className="flex items-start gap-2 font-mono text-[11px] uppercase leading-snug tracking-[.14em] text-[#cfc7e6]"><Ruler className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /><span>{R.label}. Recorded result, not live.</span></div>;

export default function Methods() {
  return (
    <Chapter id="methods" idx={4} className="py-24 md:py-32">
      <Wrap>
        <div className="grid items-end gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <Kicker n="04" label="Three ways to hand out seats" time="2:00" />
            <Poster className="mt-4">Same crowd.<br />Same bots.<br /><span className="text-gold text-glow-gold">Three doors.</span></Poster>
          </div>
          <Looking>Three seat maps stand behind the posters, one per method (hot = old way, violet = simple lottery, lime = people let in by Fair Drop). Each poster says the rule, how a bot beats it, and what we measured.</Looking>
        </div>

        <div className="mt-14 grid items-stretch gap-5 md:grid-cols-3 md:gap-4 lg:gap-6">
          {/* OLD WAY */}
          <article className="relative flex flex-col gap-5 overflow-hidden rounded-[6px] border border-hot/50 bg-bg/85 p-6 [background-image:repeating-linear-gradient(135deg,rgba(255,59,92,.07)_0_12px,transparent_12px_24px)]" data-reveal>
            <div className="eyebrow flex items-center gap-2 text-hot"><i className="led text-hot" />The old way</div>
            <h3 className="display text-[clamp(2.4rem,4.2vw,3.9rem)] text-hot">First come, first served</h3>
            <Section k="The rule">Whoever clicks first gets the seat.</Section>
            <PerLogin tone="border-hot bg-hot/10">Up to 4 seats per login (the sale's default limit), and the fastest click wins.</PerLogin>
            <Section k="How a bot beats it">Easily. A bot is at the door first and one account can buy several seats, so a few bots empty the front rows.</Section>
            <div className="mt-auto space-y-3 rounded-[5px] border border-hot/30 bg-black/40 p-4">
              <Measured />
              <Bar label="bots, share of the crowd" pct={R.botCrowdPct} bar="bg-ice" shown={`${R.botCrowdPct.toFixed(1)}%`} />
              <Bar label="bots, share of the seats" pct={R.oldBotSeatPct} bar="bg-hot" shown={`${R.oldBotSeatPct}%`} />
              <div className="display num text-5xl text-hot text-glow-hot">{R.oldAdvantage}x <span className="text-base text-[#cfc7e6] [font-family:var(--font-sans)] normal-case tracking-normal">their fair share</span></div>
              <div className="font-mono text-[11px] uppercase tracking-[.14em] text-[#cfc7e6]">bar scale: full width = 25%</div>
            </div>
            <LinkBtn href="/live" size="sm" variant="hot" className="self-start">Watch it fail live<ArrowUpRight className="h-3.5 w-3.5" /></LinkBtn>
          </article>

          {/* SIMPLE LOTTERY */}
          <article className="relative flex flex-col gap-5 overflow-hidden rounded-[6px] border border-violet/50 bg-bg/85 p-6 [background-image:radial-gradient(rgba(139,108,255,.18)_1px,transparent_1.5px)] [background-size:14px_14px] md:mt-8" data-reveal>
            <div className="eyebrow flex items-center gap-2 text-violet"><i className="led text-violet" />Better, still gameable</div>
            <h3 className="display text-[clamp(2.4rem,4.2vw,3.9rem)] text-violet">Simple lottery</h3>
            <Section k="The rule">Everyone who asks gets a ticket. A random ticket wins.</Section>
            <PerLogin tone="border-violet bg-violet/10">Every request is a ticket: 100 requests = 100 tickets.</PerLogin>
            <Section k="How a bot beats it">By asking a lot. A bot that sends 100 requests holds 100 tickets, while a person who asks once holds one.</Section>
            <div className="mt-auto space-y-3 rounded-[5px] border border-violet/30 bg-black/40 p-4">
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
                <i className="led text-ice" aria-hidden /><div className="text-[14px] text-[#e4def5]"><b className="text-ice">1 person</b> asks once: 1 ticket</div>
                <i className="h-2 w-2 rotate-45 bg-hot shadow-[0_0_8px_#ff3b5c]" aria-hidden /><div className="text-[14px] text-[#e4def5]"><b className="text-hot">1 bot</b> asks 100 times: 100 tickets</div>
              </div>
              <div className="grid grid-cols-[repeat(20,1fr)] gap-1" aria-hidden>{Array.from({ length: 100 }, (_, i) => <i key={i} className="aspect-square bg-hot/80" style={{ transform: "rotate(45deg) scale(.6)" }} />)}</div>
              <p className="font-mono text-[11px] uppercase tracking-[.14em] text-[#cfc7e6]">Illustration of the rule. For the exact result of a test, open the live screen.</p>
            </div>
            <LinkBtn href="/live" size="sm" variant="secondary" className="self-start">See the exact result live<ArrowUpRight className="h-3.5 w-3.5" /></LinkBtn>
          </article>

          {/* FAIR DROP */}
          <article className="glow-gold relative flex flex-col gap-5 overflow-hidden rounded-[6px] border border-gold/70 bg-bg/90 p-6 [background-image:linear-gradient(180deg,rgba(255,194,51,.16),transparent_45%)] md:-mt-4 md:mb-4 md:p-7" data-reveal>
            <div className="eyebrow flex items-center gap-2 text-gold"><i className="led led-pulse text-gold" />This project</div>
            <h3 className="display text-[clamp(2.8rem,5vw,4.6rem)] text-gold text-glow-gold">Fair Drop</h3>
            <Section k="The rule">One verified person is one entry. The list is sealed, then a random draw anyone can re-run.</Section>
            <PerLogin tone="border-gold bg-gold/10">1 login = 1 ticket = 1 seat at most.</PerLogin>
            <Section k="How a bot beats it">It cannot. 100 requests still make 1 entry, and speed is ignored. Only owning many real, verified accounts helps, and every account costs money (see the limits).</Section>
            <div className="mt-auto space-y-3 rounded-[5px] border border-gold/40 bg-black/40 p-4">
              <Measured />
              <Bar label="bots, share of the crowd" pct={R.botCrowdPct} bar="bg-ice" shown={`${R.botCrowdPct.toFixed(1)}%`} />
              <Bar label="bots, share of the seats" pct={R.fairBotSeatPct} bar="bg-lime" shown={`${R.fairBotSeatPct}%`} />
              <div className="display text-4xl text-lime">About their share ({R.fairAdvantage}x).</div>
              <div className="font-mono text-[11px] uppercase tracking-[.14em] text-[#cfc7e6]">bar scale: full width = 25%</div>
            </div>
            <LinkBtn href="/verify" size="sm" variant="primary" className="self-start">Re-run a draw yourself<ArrowUpRight className="h-3.5 w-3.5" /></LinkBtn>
          </article>
        </div>
      </Wrap>
    </Chapter>
  );
}
