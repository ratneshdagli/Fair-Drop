"use client";
// The show's director's console: one compact bar (Start / Stop, status light, preset) that opens up into every setting of the test.
import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Monitor, Play, RotateCcw, Square, X } from "lucide-react";
import type { Arena, Phase } from "@/lib/arena";
import { BOTS, BOT_ORDER, n } from "@/components/admin/botinfo";
import BotGlyph from "@/components/BotGlyph";
import { Button, Eyebrow, Led, Select, cn } from "@/components/ui";

const MAX = 50000;
const KEY = "fd:arena-last-v2";
const clamp = (v: number) => Math.max(0, Math.min(MAX, Math.floor(v) || 0));

const PRESETS: { name: string; hint: string; people: number; bots: Record<string, number> }[] = [
  { name: "Quiet day (no bots)", hint: "A normal day: only real people.", people: 3000, bots: {} },
  { name: "A few of each bot", hint: "About 5% bots, every kind (all 11).", people: 3000, bots: { SPEED_BOT: 15, FLOOD_BOT: 10, RETRY_BOT: 12, PROXY_ROTATOR: 35, SYBIL_OPERATOR: 25, API_SCRAPER: 15, UI_MIMIC: 10, CRYPTO_SWARM: 12, SMART_SCRAPER: 10, STATE_SNIPER: 10, CLAIM_SNIPER: 8 } },
  { name: "Heavy attack (20% bots)", hint: "One in five accounts is a bot, every kind.", people: 3000, bots: { SPEED_BOT: 80, FLOOD_BOT: 50, RETRY_BOT: 60, PROXY_ROTATOR: 170, SYBIL_OPERATOR: 120, API_SCRAPER: 70, UI_MIMIC: 50, CRYPTO_SWARM: 60, SMART_SCRAPER: 50, STATE_SNIPER: 50, CLAIM_SNIPER: 40 } },
  { name: "Only a bot-account farm", hint: "The one bot we cannot fully stop.", people: 3000, bots: { SYBIL_OPERATOR: 600 } },
  { name: "Only careful bots (no decoy)", hint: "Bots that avoid the decoy and use real tickets: the fairness still holds.", people: 3000, bots: { CRYPTO_SWARM: 100, SMART_SCRAPER: 100, STATE_SNIPER: 60, CLAIM_SNIPER: 40 } },
  { name: "Only decoy-takers", hint: "Bots that all fall for the decoy trap.", people: 3000, bots: { API_SCRAPER: 300 } },
];

const PHASE_WORDS: Record<Phase, string> = {
  idle: "nothing yet",
  starting: "getting the crowd ready",
  fair: "the crowd is joining the fair draw",
  wrapup: "closing the sale and drawing winners",
  old: "the same crowd is trying the old first-come way",
  done: "finished",
};

const SPEEDS: [number, string][] = [[20, "Very fast (20 s)"], [60, "Fast (1 min)"], [120, "Watchable (2 min)"], [300, "Slow (5 min)"]];

const sameBots = (x: Record<string, number>, y: Record<string, number>) => BOT_ORDER.every((id) => (x[id] || 0) === (y[id] || 0));

export default function DirectorConsole({ a, screenLink }: { a: Arena; screenLink?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [people, setPeople] = useState(3000);
  const [bots, setBots] = useState<Record<string, number>>(PRESETS[1].bots);
  const [protection, setProtection] = useState(true);
  const [seconds, setSeconds] = useState(120);   // how long the fair sale stays open (watchable pace)
  const [open, setOpen] = useState(false);

  // remember the last numbers used (optional convenience)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && typeof s.people === "number" && s.bots) { setPeople(clamp(s.people)); setBots(s.bots); setProtection(s.protection !== false); }
    } catch {}
  }, []);

  const botTotal = BOT_ORDER.reduce((s, id) => s + (bots[id] || 0), 0);
  const total = people + botTotal;
  const valid = total >= 1 && total <= MAX;
  const botPct = total > 0 ? (botTotal / total) * 100 : 0;
  const kinds = BOT_ORDER.filter((id) => (bots[id] || 0) > 0).length;
  const setBot = (id: string, v: number) => setBots((b) => ({ ...b, [id]: clamp(v) }));
  const canStart = !a.running && !a.busy && valid;
  const presetIdx = PRESETS.findIndex((p) => p.people === people && sameBots(p.bots, bots));

  const go = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ people, bots, protection })); } catch {}
    const clean: Record<string, number> = {};
    BOT_ORDER.forEach((id) => { if ((bots[id] || 0) > 0) clean[id] = bots[id]; });
    a.start({ people, bots: clean, protection, seconds });
  };

  const summary = `${n(people)} real people + ${n(botTotal)} bot accounts${botTotal ? ` (${botPct.toFixed(1)}% bots)` : ""} · protection ${protection ? "ON" : "OFF"}`;

  return (
    <section className="panel overflow-hidden border-gold/25">
      {/* the one-line bar: always visible */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 basis-60">
          <Led tone={a.running ? "lime" : "mute"} pulse={!!a.running} />
          <div className="min-w-0">
            <Eyebrow>Director&apos;s console</Eyebrow>
            <div className="truncate text-sm text-ink/90" title={a.running ? PHASE_WORDS[a.phase] : summary}>{a.running ? `Running: ${PHASE_WORDS[a.phase]}` : summary}</div>
          </div>
        </div>
        <div className="w-full sm:w-56">
          <Select aria-label="Ready-made crowd" value={presetIdx >= 0 ? String(presetIdx) : "custom"} disabled={!!a.running}
            title={presetIdx >= 0 ? PRESETS[presetIdx].hint : "Your own mix of people and bots"}
            onChange={(e) => { const p = PRESETS[+e.target.value]; if (p) { setPeople(p.people); setBots(p.bots); } }}>
            {presetIdx < 0 && <option value="custom">Custom mix</option>}
            {PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={go} disabled={!canStart}><Play size={16} fill="currentColor" />Start</Button>
          <Button size="lg" variant="secondary" onClick={() => a.stop()} disabled={!a.running}><Square size={14} fill="currentColor" />Stop</Button>
          <Button variant={armed ? "danger" : "ghost"} onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 8000); } else { setArmed(false); a.restart(); } }} disabled={a.busy} title="Stop any running test and clear all test sales, results and counters. Real users stay."><RotateCcw size={14} />{a.busy ? "Clearing…" : armed ? "Click again: stop & wipe" : "Clear everything"}</Button>
          {screenLink && <a href="/live" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-[4px] border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20"><Monitor size={15} />Open the live screen<ExternalLink size={12} /></a>}
          <Button variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>Settings<ChevronDown size={14} className={cn("transition-transform duration-200", open && "rotate-180")} /></Button>
        </div>
      </div>
      <p className="px-4 pb-3 text-xs text-mute">Pick a ready-made crowd, then press Start. The fair sale runs first, then the same crowd tries the old first-come way. Open Settings to choose exactly who shows up.</p>

      {a.msg && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-[4px] border border-line bg-panel2 px-3 py-2 text-sm text-ink/90" role="status">
          <span className="min-w-0 flex-1">{a.msg}</span>
          <button onClick={a.clearMsg} aria-label="Dismiss message" className="text-mute hover:text-ink"><X size={14} /></button>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-line px-4 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Stepper id="HUMAN" color="#7fd8ff" name="Real people" does="Everyday people: one device, one try, polite retries." value={people} step={500} max={MAX} onChange={(v) => setPeople(clamp(v))} />
            {BOT_ORDER.map((id) => (
              <Stepper key={id} id={id} color={BOTS[id].color} name={BOTS[id].name} does={BOTS[id].does} value={bots[id] || 0} step={10} max={2000} onChange={(v) => setBot(id, v)} dim={!(bots[id] || 0)} />
            ))}
          </div>

          <div className={cn("rounded-[4px] border px-4 py-3 text-sm", valid ? "border-line bg-panel2" : "border-hot/60 bg-hot/10")}>
            <b className="num">{n(people)}</b> real people + <b className="num">{n(botTotal)}</b> bot accounts = <b className={cn("num", valid ? "text-lime" : "text-hot")}>{n(total)}</b> accounts <span className="text-mute">(max {n(MAX)})</span>
            {valid && botTotal > 0 && <span className="text-mute"> · bots are {botPct.toFixed(1)}% of the crowd ({kinds} kind{kinds === 1 ? "" : "s"})</span>}
            {!valid && <span className="ml-2 font-semibold text-hot">{total < 1 ? "Add at least one account." : `Too many: lower it by ${n(total - MAX)}.`}</span>}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="panel bg-panel2 p-4 text-sm">
              <div className="mb-2 font-semibold">How fast should the crowd arrive?</div>
              <div className="flex flex-wrap gap-2">
                {SPEEDS.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setSeconds(v)} aria-pressed={seconds === v} className={cn("rounded-[4px] border px-3 py-1.5 text-xs font-semibold transition", seconds === v ? "border-gold bg-gold/10 text-gold" : "border-line text-mute hover:text-ink")}>{l}</button>))}
              </div>
              <div className="mt-2 text-xs text-mute">Same crowd either way. A longer sale just gives you time to watch the bots work. The old way then runs for the same length.</div>
            </div>
            <div className="panel flex items-start gap-3 bg-panel2 p-4">
              <button type="button" role="switch" aria-checked={protection} aria-label="Protection" onClick={() => setProtection(!protection)} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", protection ? "bg-lime" : "bg-line")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", protection ? "left-[22px]" : "left-0.5")} />
              </button>
              <div className="text-sm"><b>Protection {protection ? "ON" : "OFF"}</b><div className="mt-0.5 text-xs text-mute">Protection is the set of rules that stop bots: one entry per verified login, rate limits, the decoy trap. Turn it off to see what the bots can do without it.</div></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// one control: glyph, name, a plain caption of what it is, stepper + slider
function Stepper({ id, color, name, does, value, step, max, onChange, dim }: { id: string; color: string; name: string; does: string; value: number; step: number; max: number; onChange: (v: number) => void; dim?: boolean }) {
  return (
    <div className={cn("rounded-[4px] border border-line bg-panel2 p-3 transition", dim && "opacity-60 hover:opacity-100 focus-within:opacity-100")} style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex items-center gap-2 font-semibold" style={{ color }}><BotGlyph id={id} size={16} />{name}</div>
      <div className="mb-3 mt-1 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-mute" title={does}>{does}</div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Fewer ${name}`} onClick={() => onChange(value - step)} className="h-9 w-9 shrink-0 rounded-[4px] border border-line bg-bg text-lg font-bold hover:border-gold/60">−</button>
        <input type="number" min={0} max={MAX} aria-label={`How many: ${name}`} value={value} onChange={(e) => onChange(+e.target.value)} className="num h-9 w-full min-w-0 rounded-[4px] border border-line bg-bg px-2 text-center text-lg font-bold outline-none focus:border-gold" />
        <button type="button" aria-label={`More ${name}`} onClick={() => onChange(value + step)} className="h-9 w-9 shrink-0 rounded-[4px] border border-line bg-bg text-lg font-bold hover:border-gold/60">+</button>
      </div>
      <input type="range" min={0} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(+e.target.value)} aria-label={`${name} slider`} className="mt-3 w-full" style={{ accentColor: color }} />
    </div>
  );
}
