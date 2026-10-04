"use client";
import Link from "next/link";
import { useState } from "react";
import { Activity, ArrowUpRight, Gauge, MonitorPlay, SlidersHorizontal } from "lucide-react";
import { Led, cn } from "@/components/ui";
import BotGlyph from "@/components/BotGlyph";
import { BOT_ORDER } from "@/components/admin/botinfo";
import { CONTAINERS, HEX, HOPS, type Tone } from "./data";

const Chip = ({ children, tone = "mute" }: { children: React.ReactNode; tone?: Tone }) => (
  <span className="rounded-[3px] border px-2 py-0.5 font-mono text-[11px] text-ink/90" style={{ borderColor: `${HEX[tone]}66`, background: `${HEX[tone]}14` }}>{children}</span>
);

// ───────────────────────── legend ─────────────────────────
export function Legend() {
  const boxes: [Tone, string, string][] = [["lime", "Website", "pages and browser code"], ["gold", "Gateway", "the one front door"], ["violet", "API servers, worker", "the Go program"], ["ice", "Browser, Redis, Postgres", "people and data"], ["hot", "Attack engine", "our test rig"], ["mute", "Prometheus, Grafana", "watching only"]];
  const dots: [Tone, string, string, string][] = [["ice", "c", "A fan's request", "a real person"], ["hot", "d", "A bot's request", "from the test rig"], ["gold", "c", "A signed ticket", "the server signed it blind"], ["lime", "c", "Answered OK", "or a receipt coming back"], ["warn", "c", "Slowed or refused", "too many requests"], ["violet", "c", "Sealed record", "being copied to Postgres"]];
  return (
    <div className="grid gap-px overflow-hidden rounded-[6px] border border-line bg-line md:grid-cols-2">
      <div className="bg-panel p-4">
        <div className="eyebrow mb-3">Boxes: what each colour is</div>
        <ul className="grid gap-2 sm:grid-cols-2">{boxes.map(([t, n, s]) => (
          <li key={n} className="flex items-center gap-2.5 text-sm"><span className="h-4 w-6 shrink-0 rounded-[3px] border" style={{ borderColor: HEX[t], background: `${HEX[t]}26` }} /><span><b className="font-semibold">{n}</b> <span className="text-mute">{s}</span></span></li>))}</ul>
        <div className="mt-3 flex items-center gap-4 text-xs text-mute"><span className="flex items-center gap-1.5"><Led tone="lime" pulse />light on: working</span><span className="flex items-center gap-1.5"><Led tone="hot" />light red: down</span><span className="flex items-center gap-2"><span className="h-px w-6 border-t-2 border-dashed border-mute/60" />a route</span></div>
      </div>
      <div className="bg-panel p-4">
        <div className="eyebrow mb-3">Dots: what travels along the routes</div>
        <ul className="grid gap-2 sm:grid-cols-2">{dots.map(([t, s, n, d]) => (
          <li key={n} className="flex items-center gap-2.5 text-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0" aria-hidden>{s === "d" ? <path d="M8 1 15 8 8 15 1 8z" fill={HEX[t]} /> : <circle cx="8" cy="8" r="5.5" fill={HEX[t]} />}</svg>
            <span><b className="font-semibold">{n}</b> <span className="text-mute">{d}</span></span></li>))}</ul>
      </div>
    </div>
  );
}

// ───────────────────────── how we built it ─────────────────────────
function Plate({ tone, title, kicker, indent, children }: { tone: Tone; title: string; kicker: string; indent: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative rounded-[6px] border bg-panel p-5 md:p-6", indent)} style={{ borderColor: `${HEX[tone]}55`, boxShadow: `inset 4px 0 0 ${HEX[tone]}, 0 18px 40px -22px ${HEX[tone]}66` }}>
      <div className="eyebrow" style={{ color: HEX[tone] }}>{kicker}</div>
      <h3 className="display mt-1 text-3xl md:text-4xl">{title}</h3>
      {children}
    </div>
  );
}
const Dots = ({ items }: { items: string[] }) => <ul className="mt-3 space-y-1.5 text-[14px] text-ink/85">{items.map((i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-3 shrink-0 bg-gold/70" />{i}</li>)}</ul>;

export function BuildStack() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <Plate tone="lime" kicker="Top layer · what people see" title="The website" indent="">
          <div className="mt-3 flex flex-wrap gap-1.5">{["Next.js 16", "React 19", "Tailwind 4", "WebGL scenes", "blind signatures in the browser", "SHA-256 in the browser"].map((c) => <Chip key={c} tone="lime">{c}</Chip>)}</div>
          <Dots items={["Runs in the fan's browser: hides the ticket secret before anything is sent.", "Checks receipts and proofs on the fan's own device and re-runs the whole draw, so nobody has to trust us.", "Served by one container that holds no data."]} />
        </Plate>
        <div className="ml-8 h-4 border-l-2 border-dashed border-line pl-3 font-mono text-[11px] text-mute md:ml-12">asks the servers through /api</div>
        <Plate tone="violet" kicker="Middle layer · the brain" title="The backend" indent="md:ml-6">
          <div className="mt-3 flex flex-wrap gap-1.5">{["Go", "chi router", "atomic Lua in Redis", "Postgres record", "background worker", "Merkle-sealed list", "commit-reveal draw", "RFC 9474 blind RSA"].map((c) => <Chip key={c} tone="violet">{c}</Chip>)}</div>
          <Dots items={["Three identical stateless servers. Every decision that must be unique is one atomic script in Redis.", "Postgres keeps the permanent record in a hash chain. A worker moves events there and runs the timers.", "The entry list is sealed with a fingerprint before the draw seed is revealed."]} />
        </Plate>
        <div className="ml-14 h-4 border-l-2 border-dashed border-line pl-3 font-mono text-[11px] text-mute md:ml-[4.5rem]">runs on</div>
        <Plate tone="gold" kicker="Bottom layer · the ground" title="The platform" indent="md:ml-12">
          <p className="mt-2 text-[15px]"><span className="font-semibold text-gold">One command</span> <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px]">docker compose up --build</code> starts <b className="display text-2xl text-gold">{CONTAINERS.length}</b> containers:</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6">{CONTAINERS.map((c) => <div key={c.n} className="flex items-center gap-1.5 rounded-[3px] border bg-black/30 px-2 py-1.5 font-mono text-[11px]" style={{ borderColor: `${HEX[c.t]}55` }}><Led tone={c.t} />{c.n}</div>)}</div>
          <p className="mt-3 text-sm text-mute">nginx is the gateway. Redis 7 and Postgres 16 keep the data. Prometheus and Grafana watch it.</p>
        </Plate>
      </div>
      <div className="self-start lg:sticky lg:top-24">
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.16em] text-hot/80"><span className="h-px w-8 border-t-2 border-dashed border-hot/50" />attacks the stack from outside</div>
        <Plate tone="hot" kicker="The test rig · outside the stack" title="The attack engine" indent="">
          <div className="mt-3 flex flex-wrap gap-1.5">{["Python", "Locust", "gevent", "numpy", "control API :9200"].map((c) => <Chip key={c} tone="hot">{c}</Chip>)}</div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5"><BotGlyph id="HUMAN" size={16} />{BOT_ORDER.map((b) => <BotGlyph key={b} id={b} size={16} />)}<span className="ml-1 font-mono text-[11px] text-mute">{BOT_ORDER.length} bot kinds</span></div>
          <Dots items={["Plays thousands of simulated fans plus the bots, through the same gateway as everyone.", "An independent judge re-checks every decision the system made."]} />
        </Plate>
      </div>
    </div>
  );
}

// ───────────────────────── why this shape ─────────────────────────
const S = { stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const T = ({ x, y, c, children, a = "middle" }: { x: number; y: number; c: string; children: React.ReactNode; a?: "start" | "middle" | "end" }) => <text x={x} y={y} fill={c} textAnchor={a} fontSize="9.5" fontFamily="var(--font-mono)" letterSpacing=".08em">{children}</text>;

function Ill1() {
  return (
    <svg viewBox="0 0 340 170" className="w-full" aria-hidden>
      {[20, 130, 240].map((x, i) => (
        <g key={x} opacity={i === 1 ? 0.55 : 1}>
          <rect x={x} y={52} width={80} height={46} rx={5} fill="#8b6cff22" stroke="#8b6cff" strokeWidth={2} strokeDasharray={i === 1 ? "4 4" : undefined} />
          <T x={x + 40} y={79} c="#c9bbff">api-{i + 1}</T>
          <path d={`M${x + 40} 98 V132`} stroke="#7fd8ff" strokeWidth={2} />
        </g>))}
      <path d="M150 62 L210 88 M210 62 L150 88" stroke="#ff3b5c" strokeWidth={3} strokeLinecap="round" />
      <rect x={20} y={132} width={300} height={26} rx={5} fill="#7fd8ff22" stroke="#7fd8ff" strokeWidth={2} />
      <T x={170} y={149} c="#7fd8ff">Redis: all the memory lives here</T>
      <path d="M170 30 H60 V44" stroke="#ffc233" strokeWidth={2.5} fill="none" strokeLinejoin="round" /><path d="M54 38 60 47 66 38" {...S} stroke="#ffc233" /><circle cx={170} cy={30} r={4} fill="#ffc233" />
      <T x={170} y={18} c="#ffc233">retried on another server</T>
    </svg>
  );
}
function Ill2() {
  return (
    <svg viewBox="0 0 340 170" className="w-full" aria-hidden>
      <circle cx={26} cy={60} r={9} fill="#7fd8ff" />
      <path d="M40 60 H112" stroke="#ffc233" strokeWidth={3} /><path d="M104 52 118 60 104 68" {...S} stroke="#ffc233" />
      <T x={78} y={46} c="#ffc233">fast lane</T>
      <rect x={120} y={30} width={86} height={60} rx={6} fill="#7fd8ff22" stroke="#7fd8ff" strokeWidth={2} />
      <T x={163} y={56} c="#7fd8ff">Redis</T><T x={163} y={72} c="#9a90b8">in memory</T>
      <path d="M206 60 H236" stroke="#8b6cff" strokeWidth={2} strokeDasharray="2 5" /><path d="M228 54 238 60 228 66" {...S} stroke="#8b6cff" />
      <rect x={240} y={30} width={86} height={60} rx={6} fill="#7fd8ff22" stroke="#7fd8ff" strokeWidth={2} />
      <T x={283} y={56} c="#7fd8ff">Postgres</T><T x={283} y={72} c="#9a90b8">permanent</T>
      {[0, 1, 2, 3, 4].map((i) => <g key={i}><rect x={236 + i * 18} y={108} width={14} height={9} rx={4} fill="none" stroke="#8b6cff" strokeWidth={2} />{i < 4 && <path d={`M${250 + i * 18} 112 h4`} stroke="#8b6cff" strokeWidth={2} />}</g>)}
      <T x={170} y={148} c="#8b6cff">hash chain: change one link, break the rest</T>
      <T x={78} y={96} c="#9a90b8">entering never waits</T>
    </svg>
  );
}
function Ill3() {
  const cols = ["#7fd8ff", "#ff3b5c", "#7fd8ff", "#ff3b5c", "#7fd8ff", "#7fd8ff"];
  return (
    <svg viewBox="0 0 340 170" className="w-full" aria-hidden>
      {cols.map((c, i) => <g key={i} transform={`translate(${28 + (i % 3) * 42 + (i > 2 ? 12 : 0)} ${30 + Math.floor(i / 3) * 40}) rotate(${(i * 37) % 24 - 12})`}><rect width={34} height={26} rx={3} fill={`${c}26`} stroke={c} strokeWidth={2} /><path d="M6 10h22M6 17h14" stroke={c} strokeWidth={1.6} opacity={0.7} /></g>)}
      <T x={90} y={125} c="#9a90b8">accepted entries: a set</T>
      <path d="M170 78 H224" stroke="#8b6cff" strokeWidth={3} /><path d="M214 70 226 78 214 86" {...S} stroke="#8b6cff" />
      <rect x={232} y={44} width={72} height={72} rx={10} fill="#ffc23322" stroke="#ffc233" strokeWidth={2.5} />
      {[[252, 64], [284, 64], [268, 80], [252, 96], [284, 96]].map(([x, y]) => <circle key={x + "" + y} cx={x} cy={y} r={4.5} fill="#ffc233" />)}
      <T x={268} y={136} c="#ffc233">the draw</T>
      <T x={170} y={20} c="#ff3b5c">not in the score: order · volume · address</T>
    </svg>
  );
}
function Ill4() {
  return (
    <svg viewBox="0 0 340 170" className="w-full" aria-hidden>
      <rect x={20} y={40} width={110} height={84} rx={6} fill="#ffc23314" stroke="#ffc233" strokeWidth={2} />
      <path d="M75 62 L98 72 V92 C98 104 88 110 75 114 C62 110 52 104 52 92 V72 Z" fill="#8b6cff33" stroke="#8b6cff" strokeWidth={2} />
      <T x={75} y={140} c="#ffc233">rate limits, decoy</T>
      <circle cx={26} cy={28} r={5} fill="#b8ff4a" /><T x={36} y={31} c="#b8ff4a" a="start">site stays up for everyone</T>
      <path d="M130 82 H214" stroke="#ff3b5c" strokeWidth={2} strokeDasharray="5 6" /><path d="M158 72 L178 92 M178 72 L158 92" stroke="#ff3b5c" strokeWidth={3} strokeLinecap="round" />
      <T x={172} y={106} c="#ff3b5c">never linked</T>
      <rect x={214} y={40} width={106} height={84} rx={6} fill="#8b6cff14" stroke="#8b6cff" strokeWidth={2} />
      <path d="M267 58 V100 M240 68 H294 M240 68 l-8 22 h16 z M294 68 l-8 22 h16 z" {...S} stroke="#c9bbff" />
      <T x={267} y={140} c="#8b6cff">who wins</T>
    </svg>
  );
}

const WHY: { n: string; t: string; p: string; ill: () => React.JSX.Element; tone: Tone }[] = [
  { n: "01", t: "Servers remember nothing", tone: "violet", ill: Ill1, p: "Every decision that must be unique (one ticket per login, one spend per ticket, one seat per rank) is a single atomic step in Redis. So any server can answer any request, and any server can die mid-sale. Nobody compares their own clocks: Redis keeps the one clock." },
  { n: "02", t: "A fast lane and a permanent record", tone: "ice", ill: Ill2, p: "Entering touches only Redis, so 50,000 people in seconds do not jam a database. Each event is also put on a stream; a worker copies it into Postgres inside a hash chain. Postgres' own unique rules then double-check the same one-entry rule." },
  { n: "03", t: "The draw never depends on timing", tone: "gold", ill: Ill3, p: "The lottery draws over the set of accepted entries. When you arrived, how many requests you sent and from which address never enter the score. That is why speed and flooding buy nothing." },
  { n: "04", t: "Defences only keep the site alive", tone: "hot", ill: Ill4, p: "Rate limits, the decoy trap and the spent-ticket list protect the servers and cost honest people nothing. None of them is an input to the draw: switching them off must not change who wins." },
];
export function WhyShape() {
  return (
    <div className="space-y-4">
      {WHY.map((w, i) => (
        <div key={w.n} className={cn("grid items-center gap-6 rounded-[6px] border border-line bg-panel p-5 md:grid-cols-2 md:p-7", i % 2 && "md:[&>div:first-child]:order-2")}>
          <div>
            <div className="flex items-baseline gap-3"><span className="display text-5xl" style={{ color: HEX[w.tone] }}>{w.n}</span><h3 className="display text-3xl md:text-4xl">{w.t}</h3></div>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink/85">{w.p}</p>
          </div>
          <div className="rounded-[5px] border border-line bg-black/30 p-3">{w.ill()}</div>
        </div>))}
    </div>
  );
}

// ───────────────────────── one entry, start to finish ─────────────────────────
export function EntryStrip() {
  const [a, setA] = useState(0);
  const h = HOPS[a];
  return (
    <div className="space-y-4">
      <ol className="no-scrollbar -mx-4 flex snap-x gap-0 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-10 lg:overflow-visible lg:px-0">
        {HOPS.map((x, i) => {
          const on = i === a, hex = HEX[x.tone];
          return (
            <li key={x.k} className="relative min-w-[118px] shrink-0 snap-start lg:min-w-0">
              <button onMouseEnter={() => setA(i)} onFocus={() => setA(i)} onClick={() => setA(i)} aria-pressed={on}
                className="group relative block h-full w-full px-1.5 pb-3 pt-2 text-left transition">
                <div className="mb-3 flex items-center">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 font-mono text-xs font-bold transition" style={{ borderColor: hex, background: on ? hex : "transparent", color: on ? "#000" : hex, boxShadow: on ? `0 0 22px -2px ${hex}` : undefined }}>{i + 1}</span>
                  {i < HOPS.length - 1 && <span className="h-px flex-1 border-t-2 border-dashed" style={{ borderColor: `${hex}55` }} />}
                </div>
                <div className="display text-2xl leading-none transition" style={{ color: on ? hex : "#f4f0ff" }}>{x.k}</div>
                <div className="mt-1 font-mono text-[10px] uppercase leading-snug tracking-[.12em] text-mute">{x.where}</div>
              </button>
            </li>);
        })}
      </ol>
      <div className="panel flex items-start gap-4 border-l-4 p-4 md:p-5" style={{ borderLeftColor: HEX[h.tone] }} aria-live="polite">
        <span className="display text-5xl leading-none" style={{ color: HEX[h.tone] }}>{String(a + 1).padStart(2, "0")}</span>
        <div><div className="display text-2xl">{h.k} <span className="font-mono text-[11px] uppercase tracking-[.16em] text-mute">{h.where}</span></div><p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-ink/90">{h.t}</p></div>
      </div>
    </div>
  );
}

// ───────────────────────── links ─────────────────────────
export function LinkRow() {
  const items = [
    { h: "/live", i: MonitorPlay, t: "Live screen", s: "watch bots and people compete", ext: false },
    { h: "/admin", i: SlidersHorizontal, t: "Control room", s: "run tests, read the record", ext: false },
    { h: "http://localhost:3001", i: Gauge, t: "Grafana", s: "the servers as charts (port 3001)", ext: true },
    { h: "/api/metrics", i: Activity, t: "Raw server counters", s: "what Prometheus reads", ext: true },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((x) => {
        const inner = <><x.i className="h-5 w-5 text-gold" /><div className="flex-1"><div className="font-semibold">{x.t}</div><div className="text-xs text-mute">{x.s}</div></div><ArrowUpRight className="h-4 w-4 text-mute transition group-hover:text-gold" /></>;
        const c = "group flex items-center gap-3 rounded-[5px] border border-line bg-panel p-4 transition hover:border-gold/60 hover:bg-panel2";
        return x.ext ? <a key={x.h} href={x.h} target="_blank" rel="noreferrer" className={c}>{inner}</a> : <Link key={x.h} href={x.h} className={c}>{inner}</Link>;
      })}
    </div>
  );
}

