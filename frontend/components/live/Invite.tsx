"use client";
// Shown when nothing has ever run: a big invitation instead of rows of zeros.
import { Play } from "lucide-react";
import type { Arena } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import { Button } from "@/components/ui";

// about 5% bots, every one of the 11 kinds (a scaled-down copy of the "A few of each bot" preset)
const BOTS = { SPEED_BOT: 8, FLOOD_BOT: 5, RETRY_BOT: 6, PROXY_ROTATOR: 18, SYBIL_OPERATOR: 14, API_SCRAPER: 8, UI_MIMIC: 5, CRYPTO_SWARM: 6, SMART_SCRAPER: 5, STATE_SNIPER: 5, CLAIM_SNIPER: 4 };

const PEOPLE = 1500, BOT_TOTAL = Object.values(BOTS).reduce((x, y) => x + y, 0);

const RULES: [string, string, string, string][] = [
  ["First come, first served", "up to 4 seats per login", "text-hot", "border-hot/50"],
  ["Simple lottery", "every request = 1 ticket", "text-violet", "border-violet/50"],
  ["Fair Drop", "1 login · 1 ticket · 1 seat at most", "text-gold", "border-gold/60"],
];

export default function Invite({ a }: { a: Arena }) {
  const go = () => a.start({ people: PEOPLE, bots: BOTS, protection: true, seconds: 120 });
  return (
    <section className="panel relative overflow-hidden px-6 py-10 text-center md:py-16" aria-label="Start the show">
      <div className="beams" />
      <div className="relative z-10 mx-auto max-w-3xl space-y-6">
        <h2 className="display text-7xl text-glow-gold md:text-[120px]">Press <span className="text-gold">start</span></h2>
        <ol className="mx-auto max-w-2xl space-y-2 text-left text-lg text-ink/90">
          <li><b className="text-gold">1.</b> A crowd of real people and every kind of bot rushes the doors of three booking methods for the same {SEATS} seats.</li>
          <li><b className="text-gold">2.</b> You watch each method&apos;s pipeline light up, dot by dot: who is checked, who is turned away, who gets in.</li>
          <li><b className="text-gold">3.</b> After about five minutes the seat grids show who really got the seats: real people or bots.</li>
        </ol>
        <div className="flex flex-col items-center gap-3">
          <Button size="lg" onClick={go} disabled={a.busy || !!a.running} className="px-10 py-4 text-lg"><Play className="h-5 w-5" fill="currentColor" />Run the 4-minute show</Button>
          {a.msg && <p className="text-sm text-mute">{a.msg}</p>}
          <p className="text-[13px] text-mute">{PEOPLE.toLocaleString()} real people and {BOT_TOTAL} bots of all 11 kinds. Want a different crowd? Use the controls above.</p>
        </div>
        <ul className="grid gap-3 pt-4 text-left md:grid-cols-3">
          {RULES.map(([n, r, c, b]) => <li key={n} className={`rounded-[4px] border ${b} bg-bg/50 p-4`}><div className={`display text-3xl ${c}`}>{n}</div><div className="mt-1 font-mono text-[12px] uppercase tracking-[.1em] text-ink/80">{r}</div></li>)}
        </ul>
      </div>
    </section>
  );
}
