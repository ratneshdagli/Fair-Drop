"use client";
// "Bot Lab": choose your own crowd (how many real people, how many bots of each kind) and run exactly that.
import { useState } from "react";
import { Play } from "lucide-react";
import { api, testKey } from "@/lib/api";
import { Button, Callout, cn } from "@/components/ui";
import BotGlyph from "@/components/BotGlyph";
import { BOTS, BOT_CONTROL, BOT_ORDER, n } from "./botinfo";
import { Controls, Legend, Mono, POPULATION, Panel, PAL, TicketRule } from "./kit";

// the hint shows the bot share worked out from the numbers
const share = (p: { people: number; bots: Record<string, number> }) => { const b = Object.values(p.bots).reduce((x, y) => x + y, 0); return b / Math.max(1, b + p.people); };
const PRESETS: { name: string; hint: string; people: number; bots: Record<string, number> }[] = [
  { name: "No bots", hint: "a normal day: only real people", people: 3000, bots: {} },
  { name: "A few of each", hint: "every kind of bot (all 11)", people: 3000, bots: { SPEED_BOT: 15, FLOOD_BOT: 10, RETRY_BOT: 12, PROXY_ROTATOR: 35, SYBIL_OPERATOR: 25, API_SCRAPER: 15, UI_MIMIC: 10, CRYPTO_SWARM: 12, SMART_SCRAPER: 10, STATE_SNIPER: 10, CLAIM_SNIPER: 8 } },
  { name: "Heavy attack", hint: "every kind of bot (all 11)", people: 3000, bots: { SPEED_BOT: 80, FLOOD_BOT: 50, RETRY_BOT: 60, PROXY_ROTATOR: 170, SYBIL_OPERATOR: 120, API_SCRAPER: 70, UI_MIMIC: 50, CRYPTO_SWARM: 60, SMART_SCRAPER: 50, STATE_SNIPER: 50, CLAIM_SNIPER: 40 } },
  { name: "Only a big identity farm", hint: "the one bot we can't fully stop", people: 3000, bots: { SYBIL_OPERATOR: 600 } },
  { name: "Only careful bots (no decoy)", hint: "bots that avoid the decoy and use real tickets", people: 3000, bots: { CRYPTO_SWARM: 100, SMART_SCRAPER: 100, STATE_SNIPER: 60, CLAIM_SNIPER: 40 } },
  { name: "Only shortcut seekers", hint: "all fall for the decoy", people: 3000, bots: { API_SCRAPER: 300 } },
];
const numField = "num mt-auto w-full rounded-[4px] border border-line bg-bg px-3 py-1.5 font-display text-2xl outline-none transition hover:border-mute/50 focus:border-gold focus:ring-2 focus:ring-gold/25";

export default function BotLab({ running, onStarted }: { running: boolean; onStarted: (msg: string) => void }) {
  const [people, setPeople] = useState(3000);
  const [bots, setBots] = useState<Record<string, number>>(PRESETS[1].bots);
  const [preset, setPreset] = useState(1);
  const [err, setErr] = useState("");
  const botTotal = Object.values(bots).reduce((a, b) => a + (b || 0), 0);
  const total = people + botTotal;
  const set = (id: string, v: number) => { setPreset(-1); setBots((b) => ({ ...b, [id]: Math.max(0, Math.min(POPULATION, Math.floor(v) || 0)) })); };
  const chosen = BOT_ORDER.filter((id) => (bots[id] || 0) > 0);

  const run = async () => {
    setErr("");
    try {
      await api("/test/config", { body: { guard: { enabled: true } }, headers: { "X-Test-Key": testKey.get() } });
      await api("/run", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: { experiment: "custom", spec: { people, bots }, also_fcfs: true } });
      onStarted(`Your test started: ${n(people)} real people and ${n(botTotal)} bots (${chosen.length} kind${chosen.length === 1 ? "" : "s"}). Watch it in Live show.`);
    } catch (e: any) { setErr(e.body?.error || e.body?.detail || e.message); }
  };

  return (
    <Panel title="Bot Lab: design your own test" note="Pick a ready-made crowd, or set the numbers yourself, then press Run. You will see which bots get in, which are stopped, and why. Every bot account is a verified account that is allowed one entry, like a person; what we test is whether any bot can get more than one, or get past the rules.">
      <div className="space-y-5">
        <div>
          <Mono>Ready-made crowds</Mono>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p, i) => <button key={p.name} onClick={() => { setPeople(p.people); setBots(p.bots); setPreset(i); }} aria-pressed={preset === i} className={cn("rounded-[4px] border px-3 py-2 text-left text-sm font-semibold transition", preset === i ? "border-gold bg-gold/10 text-gold" : "border-line text-ink hover:border-mute/60")}>{p.name}<span className="block text-xs font-normal text-mute">{p.hint}{p.bots && Object.keys(p.bots).length ? ` · ${(share(p) * 100).toFixed(0)}% bots` : ""}</span></button>)}
          </div>
        </div>
        <Legend items={[{ color: PAL.ice, label: "real people" }, { color: PAL.hot, label: "bots (each has its own colour below)", shape: "diamond" }]} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col rounded-[5px] border border-line bg-panel2/50 p-3.5" style={{ borderTop: `3px solid ${PAL.ice}` }}>
            <div className="flex items-center gap-2 font-bold text-ice"><BotGlyph id="HUMAN" size={18} />Real people</div>
            <div className="mt-1 text-sm text-ink/85">{BOTS.HUMAN.does}</div>
            <Controls className="mb-3 mt-2" ctl={BOT_CONTROL.HUMAN[0]} never={BOT_CONTROL.HUMAN[1]} />
            <input aria-label="Number of real people" type="number" min={0} max={POPULATION} step={500} value={people} onChange={(e) => setPeople(Math.max(0, Math.floor(+e.target.value) || 0))} className={numField} />
          </label>
          {BOT_ORDER.map((id) => {
            const b = BOTS[id], v = bots[id] || 0;
            return (
              <label key={id} className={cn("flex flex-col rounded-[5px] border border-line bg-panel2/50 p-3.5 transition", !v && "opacity-65 hover:opacity-100")} style={{ borderTop: `3px solid ${b.color}` }}>
                <div className="flex items-center gap-2 font-bold" style={{ color: b.color }}><BotGlyph id={id} size={18} />{b.name}</div>
                <div className="mt-1 text-sm text-ink/85">{b.does}</div>
                <Controls className="mb-3 mt-2" ctl={BOT_CONTROL[id][0]} never={BOT_CONTROL[id][1]} />
                <input aria-label={`Number of ${b.name} accounts`} type="number" min={0} max={POPULATION} step={10} value={v} onChange={(e) => set(id, +e.target.value)} className={numField} />
                <div className="mt-1 text-xs text-mute">{v ? `We expect: ${b.expect}` : "not in this test"}</div>
              </label>);
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[5px] border border-line bg-bg/60 p-4">
          <div className="text-sm"><b>{n(people)}</b> people + <b>{n(botTotal)}</b> bots = <b className={total > POPULATION || total < 1 ? "text-hot" : "text-lime"}>{n(total)}</b> accounts<span className="block text-xs text-mute">allowed 1 to {n(POPULATION)}{botTotal ? ` · bots are ${((botTotal / Math.max(1, total)) * 100).toFixed(1)}% of the crowd` : ""}</span></div>
          <Button size="lg" onClick={run} disabled={running || total < 1 || total > POPULATION}><Play className="h-5 w-5" />{running ? "A test is running…" : "Run this test"}</Button>
          <TicketRule />
        </div>
        {err && <Callout tone="bad">{err}</Callout>}
      </div>
    </Panel>
  );
}
