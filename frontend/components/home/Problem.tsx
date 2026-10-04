"use client";
import { Counter } from "@/components/ui";
import { CONFIG, PROXY_FLOOD } from "./config";
import { Chapter, Kicker, Legend, Looking, Poster, Wrap, useInView } from "./parts";

const FANS = CONFIG.fans, SEATS = CONFIG.seats;

export default function Problem() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Chapter id="problem" idx={1} className="py-24 md:py-32">
      <Wrap>
        <div className="max-w-3xl">
          <Kicker n="01" label="The problem" time="0:00" tone="hot" />
          <Poster className="mt-4" data-reveal>Everyone<br />wants in.<br /><span className="text-hot text-glow-hot">Almost nobody<br />gets in.</span></Poster>
        </div>

        <div ref={ref} className="mt-12 grid max-w-4xl gap-px overflow-hidden rounded-[6px] border border-line bg-line md:grid-cols-[1.25fr_1fr_1fr]" data-reveal>
          <Big n={<Counter value={seen ? FANS : 0} />} unit="fans want a ticket" tone="text-ice" />
          <Big n={<Counter value={seen ? SEATS : 0} />} unit="seats exist" tone="text-gold" />
          <Big n={<>1 in <Counter value={seen ? FANS / SEATS : 0} /></>} unit="gets a seat" tone="text-hot" note={`calculated: ${FANS.toLocaleString("en-US")} ÷ ${SEATS}`} />
        </div>

        <div className="mt-6 grid max-w-4xl gap-4 md:grid-cols-2" data-reveal>
          <Looking>The crowd pushing toward one door. The golden grid behind the door is the 500 seats. Ice discs are real people, red diamonds are bots sprinting to the front.</Looking>
          <Legend className="md:hidden" />
        </div>

        <div className="mt-[34vh] max-w-2xl">
          <Kicker n="01b" label="And then there are the bots" tone="hot" />
          <Poster className="mt-3 !text-[clamp(2.3rem,6vw,5.4rem)]">A few programs that click<br /><span className="text-hot">faster than any human.</span></Poster>
          <div className="solid mt-6 space-y-4 rounded-[6px] p-6" data-reveal>
            <p className="text-[18px] leading-relaxed text-ink">A bot never sleeps, never waits for a page to load and can send requests much faster than a person can click. In a first-come-first-served sale, that speed is all it needs.</p>
            <Lane who="A real person" note="a few clicks, with pauses" count={6} />
            <Lane who="A bot" note="an endless burst, no pauses" count={44} bot />
            <p className="eyebrow">Illustration of speed, not a measurement. In our recorded "Proxy flood" test the bots were only {PROXY_FLOOD.botCrowdPct.toFixed(1)}% of the {FANS.toLocaleString("en-US")} accounts ({PROXY_FLOOD.botAccounts} bot accounts), drawn bigger here so you can see them. The size of the test show ({FANS.toLocaleString("en-US")} fans, {SEATS} seats) is a setting of our test, not a live count.</p>
          </div>
        </div>
      </Wrap>
    </Chapter>
  );
}

function Big({ n, unit, tone, note }: { n: React.ReactNode; unit: string; tone: string; note?: string }) {
  return (
    <div className="bg-[rgba(10,7,20,.9)] p-5">
      <div className={`display num text-[clamp(2.6rem,6vw,5rem)] ${tone}`}>{n}</div>
      <div className="mt-1 text-[17px] text-ink">{unit}</div>
      {note && <div className="eyebrow mt-1">{note}</div>}
    </div>
  );
}

function Lane({ who, note, count, bot }: { who: string; note: string; count: number; bot?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 font-mono text-[12px] uppercase tracking-[.12em]"><span className={bot ? "text-[#ff6b84]" : "text-ice"}>{who}</span><span className="text-[#cfc7e6]">{note}</span></div>
      <div className="flex items-center justify-between overflow-hidden border-y border-dashed border-line py-2" aria-hidden>
        {Array.from({ length: count }, (_, i) => bot
          ? <i key={i} className="h-2 w-2 shrink-0 rotate-45 bg-hot shadow-[0_0_8px_#ff3b5c]" />
          : <i key={i} className="led shrink-0 text-ice" />)}
      </div>
    </div>
  );
}
