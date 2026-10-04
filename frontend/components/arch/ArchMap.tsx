"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Ticket } from "lucide-react";
import { Counter, Led, STAGE, cn, stageName } from "@/components/ui";
import BotGlyph from "@/components/BotGlyph";
import { BOT_ORDER } from "@/components/admin/botinfo";
import DotCanvas, { toEmitters, type LiveFeed } from "./DotCanvas";
import DetailPanel from "./Detail";
import { useLive } from "./useLive";
import { EDGES, H, HEX, MODULES, NODE, NODES, SCENARIOS, STAGES, W, type Flow, type NodeDef, type NodeId, type Tone } from "./data";

type Mode = "walk" | "stage" | "live";
const pct = (v: number, t: number) => `${(v / t) * 100}%`;
const ONE_WAY = new Set(["worker_pg", "api_prom", "prom_graf"]);
const short = (s: string) => stageName(s).split(":")[0];
const STAGE_ORDER = ["SCHEDULED", "OPEN", "CLOSED", "LOCKED", "DRAWN", "CLAIM", "SETTLED"];

function useMedia(q: string) {
  const [m, setM] = useState<boolean | null>(null);
  useEffect(() => { const x = window.matchMedia(q); setM(x.matches); const f = () => setM(x.matches); x.addEventListener("change", f); return () => x.removeEventListener("change", f); }, [q]);
  return m;
}

export default function ArchMap() {
  const [mode, setMode] = useState<Mode>("walk");
  const [scen, setScen] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [stage, setStage] = useState("OPEN");
  const [sel, setSel] = useState<NodeId | null>(null);
  const [tip, setTip] = useState<NodeId | null>(null);
  const wide = useMedia("(min-width: 1100px)");
  const reduce = !!useMedia("(prefers-reduced-motion: reduce)");
  const live = useLive(mode === "live");
  const sc = SCENARIOS.find((s) => s.id === scen) || null;
  const st = sc?.steps[step];
  const hasTraffic = mode === "live" && live.perSec >= 0.2;

  // pause when the tab is hidden
  useEffect(() => { const f = () => document.hidden && setPlaying(false); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, []);
  // auto-advance the story
  useEffect(() => {
    if (!playing || !sc || !st || reduce) return;
    const t = setTimeout(() => (step < sc.steps.length - 1 ? setStep(step + 1) : setPlaying(false)), Math.max(4200, 3000 + st.text.length * 24));
    return () => clearTimeout(t);
  }, [playing, step, sc, st, reduce]);

  const start = (id: string) => { setMode("walk"); setScen(id); setStep(0); setFrozen(false); setPlaying(!reduce); };
  const go = (i: number) => { setPlaying(false); setFrozen(false); setStep(i); };
  const togglePlay = () => { if (!sc) return start(SCENARIOS[0].id); if (playing) { setPlaying(false); setFrozen(true); return; } setFrozen(false); if (step >= sc.steps.length - 1) setStep(0); setPlaying(!reduce); };

  // what the map shows right now
  const liveStage = mode === "live" && STAGES[live.state] ? live.state : "";
  const view = useMemo(() => {
    let nodes: Set<string> | null = null, flows: Flow[] = [], down = new Set<string>();
    if (mode === "walk" && st) { nodes = new Set(st.nodes); flows = st.flows; down = new Set(st.down || []); }
    if (mode === "stage") { nodes = new Set(STAGES[stage].nodes); flows = STAGES[stage].flows; }
    if (mode === "live") {
      nodes = new Set(liveStage ? STAGES[liveStage].nodes : []);
      if (hasTraffic) ["attack", "nginx", "api", "api1", "api2", "api3", "redis"].forEach((x) => nodes!.add(x));
      Object.entries(live.servers).forEach(([k, up]) => { if (!up) down.add(k.replace("-", "")); });
      if (!liveStage && !hasTraffic) nodes = null;
    }
    return { nodes, flows, down };
  }, [mode, st, stage, liveStage, hasTraffic, live.servers]);
  const emit = useMemo(() => toEmitters(view.flows), [view.flows]);
  const feed: LiveFeed | null = hasTraffic ? { rate: Math.min(80, live.perSec / 5), cls: Object.entries(live.cls), rep: ["api-1", "api-2", "api-3"].map((r) => [r, live.rep[r] || 0] as [string, number]).filter((x) => x[1] > 0) } : null;

  // which edges glow, and in which colour
  const edgeTone = useMemo(() => {
    const m: Record<string, Tone> = {};
    view.flows.forEach((f) => f.e.forEach((r) => { const id = r.replace("-", ""); if (!m[id]) m[id] = f.c; }));
    if (hasTraffic) {
      m.atk_nginx = "lime";
      (["api-1", "api-2", "api-3"] as const).forEach((r) => { if (live.rep[r]) { const k = r.replace("-", ""); m[`nginx_${k}`] = "lime"; m[`${k}_redis`] = "lime"; } });
    }
    return m;
  }, [view.flows, hasTraffic, live.rep]);

  const caption = (() => {
    if (mode === "walk") return st ? { k: `${step + 1} / ${sc!.steps.length}`, title: st.title, text: st.text, tone: sc!.tone } : { k: "", title: "Pick a story", text: "Press one of the four buttons above and watch a request travel. Click any box to learn what it is, what it does in a booking and what happens if it dies.", tone: "gold" as Tone };
    if (mode === "stage") return { k: short(stage), title: "What the backend is doing now", text: STAGES[stage].text, tone: "gold" as Tone };
    const stageLine = liveStage ? `The newest sale is at the "${short(liveStage)}" stage. ${STAGES[liveStage].text}` : "No sale found yet.";
    return { k: liveStage ? short(liveStage) : "Live", title: hasTraffic ? `${Math.round(live.perSec).toLocaleString()} requests a second, right now` : "Waiting for traffic", text: live.authed === false ? "Sign in as admin to see real traffic here." : hasTraffic ? `${stageLine} Each dot stands for about 5 real requests.` : `${stageLine}`, tone: "lime" as Tone };
  })();

  const open = (id: NodeId) => setSel(id);
  const badge = (id: NodeId): string | null => {
    if (mode !== "live" || live.authed !== true) return null;
    const rps = (r: string) => Math.round((live.rep[r] || 0) / 3);
    if (id === "nginx") return `${Math.round(live.perSec)}/s`;
    if (id === "api1" || id === "api2" || id === "api3") { const r = `api-${id.slice(3)}`; return live.servers[r] === false ? "DOWN" : `${rps(r)}/s`; }
    if (id === "redis" && live.redisOps != null) return `${live.redisOps.toLocaleString()} ops/s`;
    if (id === "worker" && live.lag != null) return `${live.lag.toLocaleString()} writes waiting`;
    if (id === "pg" && live.audit != null) return `${live.audit.toLocaleString()} records`;
    return null;
  };

  return (
    <div className="space-y-4">
      {/* what to look at */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="tablist" aria-label="View" className="flex flex-wrap gap-1.5">
          {([["walk", "Watch a request travel"], ["stage", "By sale stage"], ["live", "Live traffic"]] as [Mode, string][]).map(([m, l]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPlaying(false); setFrozen(false); }}
              className={cn("flex items-center gap-2 rounded-[4px] border px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[.16em] transition", mode === m ? "border-gold bg-gold/10 text-gold" : "border-line text-mute hover:text-ink")}>
              {m === "live" && <Led tone="hot" pulse />}{l}
            </button>))}
        </div>
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.14em] text-gold"><Ticket className="h-3.5 w-3.5" />1 login · 1 ticket · 1 seat at most</p>
      </div>

      {mode === "walk" && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((s) => {
            const on = scen === s.id;
            return (
              <button key={s.id} onClick={() => start(s.id)} aria-pressed={on} className="group rounded-[5px] border bg-panel p-3 text-left transition hover:bg-panel2" style={{ borderColor: on ? HEX[s.tone] : "#2b2342", boxShadow: on ? `0 0 28px -10px ${HEX[s.tone]}` : undefined }}>
                <div className="flex items-center gap-2 font-semibold text-ink"><Led tone={s.tone} pulse={on} />{s.label}</div>
                <div className="mt-1 text-xs text-mute">{s.blurb}</div>
              </button>);
          })}
        </div>)}

      {mode === "stage" && <StageRail value={stage} onChange={setStage} />}
      {mode === "live" && <LiveStrip live={live} stage={liveStage} traffic={hasTraffic} />}

      <div>
      {/* the map */}
      {wide === true ? (
        <div className="relative left-1/2 w-[min(calc(100vw-2rem),1560px)] -translate-x-1/2">
          <div className="relative overflow-visible rounded-[8px] border border-line bg-black/25" style={{ aspectRatio: `${W}/${H}` }}>
            <div className="absolute inset-0" style={{ containerType: "inline-size" }}>
              <div className="absolute inset-0" style={{ ["--u" as string]: "clamp(9.5px, .78cqw, 12.5px)" }}>
                <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full" viewBox={`0 0 ${W} ${H}`} aria-hidden>
                  {EDGES.map((e) => <EdgeLine key={e.id} id={e.id} tone={edgeTone[e.id]} dim={!!view.nodes && !edgeTone[e.id]} />)}
                </svg>
                {/* layer captions along the top */}
                {([["VISITORS", 24, 226], ["WEBSITE + GATEWAY", 330, 230], ["API SERVERS", 640, 300], ["MEMORY + RECORD", 1060, 316]] as [string, number, number][]).map(([t, x, w]) => (
                  <div key={t} className="pointer-events-none absolute z-[1] -translate-y-full eyebrow text-mute/60" style={{ left: pct(x, W), top: pct(14, H), width: pct(w, W), fontSize: "calc(var(--u)*.85)" }}>{t}</div>))}
                {EDGES.filter((e) => e.label).map((e) => (
                  <span key={e.id} className={cn("pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[3px] border bg-bg px-1.5 py-px font-mono transition-colors", edgeTone[e.id] ? "text-ink" : "border-line text-mute")}
                    style={{ left: pct(e.at![0], W), top: pct(e.at![1], H), fontSize: "calc(var(--u)*.88)", borderColor: edgeTone[e.id] ? HEX[edgeTone[e.id]] : undefined }}>{e.label}</span>))}

                {NODES.map((n) => <MapNode key={n.id} n={n} dim={!!view.nodes && !view.nodes.has(n.id)} on={!!view.nodes && view.nodes.has(n.id)} down={view.down.has(n.id)} selected={sel === n.id}
                  badge={badge(n.id)} onOpen={() => open(n.id)} onTip={(v) => setTip(v ? n.id : null)} />)}

                {tip && !sel && <Tip n={NODE[tip]} />}
                <DotCanvas emit={emit} live={feed} run={!frozen} />
              </div>
            </div>
          </div>
        </div>
      ) : wide === false ? (
        <Layers active={view.nodes} down={view.down} badge={badge} onOpen={open} />
      ) : null}

      {/* caption + transport (sticks to the bottom of the screen while the map is in view) */}
      <div className="sticky bottom-3 z-[40] mt-3">
        <div className="flex flex-col gap-3 rounded-[6px] border border-l-4 border-line bg-[#120d20] p-4 shadow-[0_10px_40px_rgba(0,0,0,.65)] max-md:max-h-[46vh] max-md:overflow-y-auto md:flex-row md:items-center" style={{ borderLeftColor: HEX[caption.tone] }} aria-live="polite">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {caption.k && <span className="display shrink-0 text-3xl leading-none" style={{ color: HEX[caption.tone] }}>{caption.k}</span>}
              <span className="text-[15px] font-semibold text-ink md:text-base">{caption.title}</span>
            </div>
            <p className="mt-1 max-w-4xl text-[13.5px] leading-relaxed text-ink/80">{caption.text}</p>
            {mode === "walk" && st && <div className="mt-2 flex flex-wrap gap-1 md:hidden">{st.nodes.filter((x) => x !== "api").map((x) => <span key={x} className="rounded-[3px] border px-1.5 py-px font-mono text-[10px] uppercase" style={{ borderColor: HEX[NODE[x].tone], color: HEX[NODE[x].tone] }}>{NODE[x].name}</span>)}</div>}
            {mode === "live" && live.authed === false && <Link href="/admin" className="mt-2 inline-block rounded-[4px] bg-gold px-3 py-1.5 text-sm font-bold text-black hover:brightness-110">Open the Control room to sign in</Link>}
          </div>
          {mode === "walk" && (
            <div className="flex shrink-0 flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <TBtn label="Previous step" disabled={!sc || step === 0} onClick={() => go(step - 1)}><ChevronLeft className="h-4 w-4" /></TBtn>
                <button onClick={togglePlay} disabled={reduce && !sc} className="flex h-9 items-center gap-2 rounded-[4px] bg-gold px-4 text-sm font-bold text-black hover:brightness-110 disabled:opacity-40">{playing ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Play</>}</button>
                <TBtn label="Next step" disabled={!sc || step >= sc.steps.length - 1} onClick={() => go(step + 1)}><ChevronRight className="h-4 w-4" /><span className="max-md:sr-only">Step</span></TBtn>
                <TBtn label="Replay from the start" disabled={!sc} onClick={() => { setFrozen(false); setStep(0); setPlaying(!reduce); }}><RotateCcw className="h-4 w-4" /><span className="max-md:sr-only">Replay</span></TBtn>
              </div>
              {sc && <ol className="flex flex-wrap gap-1">{sc.steps.map((_, i) => <li key={i}><button onClick={() => go(i)} aria-label={`Go to step ${i + 1}`} aria-current={i === step} className={cn("h-6 w-6 rounded-[3px] border font-mono text-[11px] transition", i === step ? "border-gold bg-gold text-black" : i < step ? "border-lime/40 text-lime" : "border-line text-mute hover:text-ink")}>{i + 1}</button></li>)}</ol>}
            </div>)}
        </div>
        {reduce && mode === "walk" && <p className="mt-1.5 text-xs text-mute">Animation is off because your device asks for less motion. Use Step: the glowing route shows each hop.</p>}
      </div>

      </div>

      {sel && <DetailPanel id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function TBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex h-9 items-center gap-1 rounded-[4px] border border-line bg-panel2 px-2.5 text-sm text-mute transition hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-35">{children}</button>;
}

function EdgeLine({ id, tone, dim }: { id: string; tone?: Tone; dim: boolean }) {
  const e = EDGES.find((x) => x.id === id)!;
  const hex = tone ? HEX[tone] : "#9a90b8";
  const d = e.pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  const arrow = (a: [number, number], b: [number, number]) => {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 8;
    const pt = (da: number, r: number) => `${b[0] + Math.cos(ang + da) * r},${b[1] + Math.sin(ang + da) * r}`;
    return `${b[0]},${b[1]} ${pt(Math.PI - 0.45, s)} ${pt(Math.PI + 0.45, s)}`;
  };
  const n = e.pts.length;
  return (
    <g style={{ opacity: tone ? 1 : dim ? 0.35 : 0.8, transition: "opacity .25s" }}>
      <path d={d} fill="none" stroke={hex} strokeOpacity={tone ? 0.95 : 0.35} strokeWidth={tone ? 3 : 2} strokeDasharray={tone ? undefined : "3 7"} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        style={tone ? { filter: `drop-shadow(0 0 5px ${hex})` } : undefined} />
      <polygon points={arrow(e.pts[n - 2], e.pts[n - 1])} fill={hex} fillOpacity={tone ? 1 : 0.5} />
      {!ONE_WAY.has(id) && <polygon points={arrow(e.pts[1], e.pts[0])} fill={hex} fillOpacity={tone ? 1 : 0.5} />}
    </g>
  );
}

function Tip({ n }: { n: NodeDef }) {
  const below = n.y < 110;
  return (
    <div role="tooltip" className="pointer-events-none absolute z-30 w-[260px] -translate-x-1/2 rounded-[5px] border border-line bg-panel2 p-2.5 text-[12px] leading-snug text-ink shadow-[0_8px_30px_rgba(0,0,0,.6)]"
      style={{ left: pct(Math.min(Math.max(n.x + n.w / 2, 150), W - 150), W), top: below ? pct(n.y + n.h, H) : pct(n.y, H), transform: `translate(-50%, ${below ? "10px" : "calc(-100% - 10px)"})` }}>
      {n.tip}<div className="mt-1 font-mono text-[10px] uppercase tracking-[.14em] text-gold">Click for details</div>
    </div>
  );
}

function MapNode({ n, dim, on, down, selected, badge, onOpen, onTip }: { n: NodeDef; dim: boolean; on: boolean; down: boolean; selected: boolean; badge: string | null; onOpen: () => void; onTip: (v: boolean) => void }) {
  const hex = HEX[down ? "hot" : n.tone];
  const pos = { left: pct(n.x, W), top: pct(n.y, H), width: pct(n.w, W), height: pct(n.h, H) };
  const ring = selected || on || down ? `0 0 0 1px ${hex}, 0 0 34px -6px ${hex}aa` : "none";
  const u = (k: number) => `calc(var(--u)*${k})`;
  const ev = { onMouseEnter: () => onTip(true), onMouseLeave: () => onTip(false), onFocus: () => onTip(true), onBlur: () => onTip(false) };

  if (n.id === "api") {
    return (
      <div className="absolute z-[1] rounded-[8px] border" style={{ ...pos, borderColor: `${hex}55`, background: `${hex}0a`, boxShadow: ring, opacity: dim ? 0.4 : 1, transition: "opacity .25s, box-shadow .25s" }}>
        <button onClick={onOpen} aria-label="API servers: open details" {...ev} className="absolute inset-x-0 top-0 flex items-center justify-between rounded-t-[8px] px-[3%] text-left" style={{ height: pct(46, n.h) }}>
          <span className="flex items-center gap-2"><Led tone={n.tone} pulse={on} /><span className="display" style={{ fontSize: u(2), color: hex }}>{n.name}</span></span>
          <span className="font-mono uppercase tracking-[.12em] text-mute" style={{ fontSize: u(.85) }}>{n.tech}</span>
        </button>
        <div className="absolute inset-x-0 bottom-0 space-y-[3%] px-[4%] pb-[3%]" style={{ fontSize: u(1) }}>
          <div className="flex gap-1.5 rounded-[4px] border border-gold/40 bg-gold/10 p-[2.5%] text-gold"><Ticket className="mt-px shrink-0" style={{ width: u(1.3), height: u(1.3) }} /><span>{n.rule}</span></div>
          <div className="eyebrow" style={{ fontSize: u(.85) }}>Parts inside every server</div>
          <div className="flex flex-wrap gap-1">{MODULES.map((m) => <span key={m} className="rounded-[3px] border border-violet/30 bg-violet/10 px-1.5 py-px font-mono text-violet" style={{ fontSize: u(.85) }}>{m}</span>)}</div>
        </div>
        {badge && <span className="absolute -top-2.5 right-3 rounded-[3px] bg-bg px-1.5 font-mono text-lime">{badge}</span>}
      </div>
    );
  }
  const server = n.id === "api1" || n.id === "api2" || n.id === "api3";
  return (
    <div className="absolute z-10" style={pos}>
      <button onClick={onOpen} {...ev} aria-label={`${n.name}: open details`} className="flex h-full w-full flex-col overflow-hidden rounded-[6px] border bg-panel text-left transition-[opacity,box-shadow,transform] duration-200 hover:-translate-y-px"
        style={{ borderColor: `${hex}${selected || on || down ? "" : "66"}`, background: `linear-gradient(180deg, ${hex}1c, transparent 75%), #0f0b1a`, boxShadow: ring, opacity: dim ? 0.4 : 1, padding: u(1), gap: u(.35) }}>
        <span className="flex items-center gap-2"><Led tone={down ? "hot" : on ? n.tone : "mute"} pulse={on && !down} /><span className="display" style={{ fontSize: u(server ? 1.9 : 2.1), color: hex }}>{n.name}</span></span>
        <span className="font-mono uppercase tracking-[.1em] text-mute" style={{ fontSize: u(.85) }}>{n.tech}</span>
        <span className="text-ink/85" style={{ fontSize: u(1.02), lineHeight: 1.3 }}>{down ? "Not answering. The gateway sends its traffic to the other two." : n.role}</span>
        {n.id === "attack" && <span className="mt-1 flex flex-wrap" style={{ gap: u(.35) }}><BotGlyph id="HUMAN" size={13} />{BOT_ORDER.map((b) => <BotGlyph key={b} id={b} size={13} />)}</span>}
        {n.bullets && <ul className="text-mute" style={{ fontSize: u(.95), lineHeight: 1.35 }}>{n.bullets.map((b) => <li key={b} className="flex gap-1.5"><span style={{ color: hex }}>+</span>{b}</li>)}</ul>}
        {n.rule && <span className="mt-auto flex gap-1.5 rounded-[3px] border border-gold/35 bg-gold/10 text-gold" style={{ fontSize: u(.95), padding: u(.5), lineHeight: 1.25 }}><Ticket className="mt-px shrink-0" style={{ width: u(1.2), height: u(1.2) }} />{n.rule}</span>}
      </button>
      {badge && <span className={cn("pointer-events-none absolute -top-2.5 right-3 z-10 rounded-[3px] bg-bg px-1.5 font-mono", badge === "DOWN" ? "text-hot" : "text-lime")} style={{ fontSize: u(.95) }}>{badge}</span>}
    </div>
  );
}

function StageRail({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="eyebrow">Pick a stage of the sale: the boxes that are working light up</div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {STAGE_ORDER.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <button onClick={() => onChange(s)} title={STAGE[s][1]} aria-pressed={value === s} className={cn("flex items-center gap-2 rounded-[4px] border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider transition", value === s ? "border-gold bg-gold/10 text-gold" : "border-line text-mute hover:text-ink")}>
              <span className="text-mute/70">{i + 1}</span>{short(s)}
            </button>
            {i < STAGE_ORDER.length - 1 && <span className="hidden h-px w-3 bg-line sm:block" />}
          </li>))}
      </ol>
    </div>
  );
}

function LiveStrip({ live, stage, traffic }: { live: ReturnType<typeof useLive>; stage: string; traffic: boolean }) {
  if (live.authed === null) return null;
  if (live.authed === false)
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-gold p-4">
        <div><div className="font-semibold">Sign in as admin to see real traffic</div><p className="text-sm text-mute">Live mode reads the servers' own request record, which only the Control room can open. Until then the map stays idle: we never show made-up numbers.</p></div>
        <Link href="/admin" className="rounded-[4px] bg-gold px-4 py-2 text-sm font-bold text-black hover:brightness-110">Go to the Control room</Link>
      </div>);
  const cls = [["2xx", "answered OK", "text-lime"], ["4xx", "refused or slowed", "text-warn"], ["5xx", "server errors", "text-hot"]] as const;
  return (
    <div className="grid gap-3 md:grid-cols-[1.1fr_1.2fr_1.2fr]">
      <div className="panel p-4">
        <div className="eyebrow">Requests per second at the gateway</div>
        <div className="display num mt-1 text-5xl text-gold"><Counter value={live.perSec} /></div>
        <div className="mt-1 text-xs text-mute">live from the servers, last 3 seconds{live.dropId ? ` · sale ${live.dropId}` : ""}</div>
      </div>
      <div className="panel p-4">
        <div className="eyebrow">How the servers answered (last 3 s)</div>
        <div className="mt-2 flex gap-5">{cls.map(([k, l, c]) => <div key={k}><div className={cn("display num text-3xl", c)}><Counter value={live.cls[k] || 0} /></div><div className="text-[11px] text-mute">{l}</div></div>)}</div>
      </div>
      <div className="panel p-4">
        <div className="eyebrow">Which server handled them (last 3 s)</div>
        <div className="mt-2 space-y-1.5">{["api-1", "api-2", "api-3"].map((r) => {
          const v = live.rep[r] || 0, t = Object.values(live.rep).reduce((a, b) => a + b, 0) || 1;
          return <div key={r} className="flex items-center gap-2 text-xs"><Led tone={live.servers[r] === false ? "hot" : "lime"} /><span className="w-10 font-mono text-mute">{r}</span><div className="h-2 flex-1 overflow-hidden rounded bg-panel2"><div className="h-2 rounded bg-violet transition-all" style={{ width: `${(v / t) * 100}%` }} /></div><span className="num w-10 text-right">{v}</span></div>;
        })}</div>
      </div>
      {!traffic && <p className="text-sm text-mute md:col-span-3">No traffic right now. Start a test on the <Link href="/live" className="text-gold underline">Live screen</Link> to watch real requests here.{stage ? "" : " (No sale found yet.)"}</p>}
      {traffic && <p className="text-xs text-mute md:col-span-3">Dot colour = how the server answered: lime OK, orange refused or slowed, red error. Dots are capped at 80 a second; the numbers are exact.</p>}
    </div>
  );
}

// ───────── phone / narrow screens: the same system as a vertical list ─────────
const LAYERS: { t: string; ids: NodeId[]; link?: string }[] = [
  { t: "Visitors", ids: ["fan", "attack"], link: "page & /api calls, /attack" },
  { t: "Gateway", ids: ["nginx"], link: "/ pages go to the website, /api/* goes to the servers" },
  { t: "Website", ids: ["web"] },
  { t: "API servers", ids: ["api1", "api2", "api3"], link: "tickets & entries" },
  { t: "Memory and record", ids: ["redis", "worker", "pg"], link: "metrics" },
  { t: "Watching", ids: ["prom", "graf"] },
];
function Layers({ active, down, badge, onOpen }: { active: Set<string> | null; down: Set<string>; badge: (id: NodeId) => string | null; onOpen: (id: NodeId) => void }) {
  return (
    <div className="space-y-1">
      {LAYERS.map((l, i) => (
        <div key={l.t}>
          <div className="eyebrow mb-1.5 mt-3">{String(i + 1).padStart(2, "0")} · {l.t}</div>
          <div className="grid gap-2">{l.ids.map((id) => {
            const n = NODE[id], dead = down.has(id), on = !!active && active.has(id), dim = !!active && !on, hex = HEX[dead ? "hot" : n.tone], b = badge(id);
            return (
              <button key={id} onClick={() => onOpen(id)} className="relative rounded-[6px] border bg-panel p-3 text-left transition" style={{ borderColor: on ? hex : `${hex}55`, boxShadow: on ? `0 0 26px -8px ${hex}` : undefined, opacity: dim ? 0.45 : 1 }}>
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Led tone={dead ? "hot" : on ? n.tone : "mute"} pulse={on} /><span className="display text-2xl" style={{ color: hex }}>{n.name}</span></span><span className="font-mono text-[10px] uppercase tracking-wider text-mute">{n.tech}</span></div>
                <p className="mt-1 text-sm text-ink/85">{n.role}</p>
                {n.rule && <p className="mt-1.5 flex gap-1.5 text-xs text-gold"><Ticket className="mt-px h-3.5 w-3.5 shrink-0" />{n.rule}</p>}
                {b && <span className={cn("absolute -top-2 right-3 rounded-[3px] bg-bg px-1.5 font-mono text-[11px]", b === "DOWN" ? "text-hot" : "text-lime")}>{b}</span>}
              </button>);
          })}</div>
          {l.link && <div className="flex items-center gap-2 py-1.5 pl-3 font-mono text-[11px] text-mute"><ArrowDown className="h-3.5 w-3.5 text-gold" />{l.link}</div>}
        </div>))}
    </div>
  );
}
