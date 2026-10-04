"use client";
// THE REAL WEB TRAFFIC: the servers' own record of every request (method, path, status, time taken, which of the 3 servers, which account and address).
// Recorded by the server while it answered, so a judge can see what each bot really sends. Fetched only while this panel is on screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Gauge, Pause, Play } from "lucide-react";
import { api } from "@/lib/api";
import type { Arena } from "@/lib/arena";
import { BOT_ORDER, n } from "@/components/admin/botinfo";
import BotGlyph from "@/components/BotGlyph";
import { Counter, Eyebrow, Led, SectionHead, cn } from "@/components/ui";
import { backendDid, clock, kindName, shortId } from "./botText";

type Row = { id: string; t: number; m: string; p: string; ep: string; c: number; us: number; a: string; ip: string; rep: string; k: string; pf: string };

// DESIGN.md tokens: lime = accepted, warn = slowed, hot = refused / errors
const statusTone = (c: number) => (c < 300 ? "#b8ff4a" : c === 429 ? "#ff8a3d" : c < 500 ? "#ff8a3d" : "#ff3b5c");
const statusWord = (c: number) =>
  c === 200 ? "accepted" : c === 409 ? "refused: already done" : c === 429 ? "slowed: too many clicks" : c === 403 ? "refused" : c === 410 ? "too late: sale closed" : c === 404 ? "not found" : c === 401 ? "not signed in" : c >= 500 ? "server error" : c >= 400 ? "refused" : "ok";

export default function TrafficLog({ a }: { a: Arena }) {
  const dropId = a.phase === "old" ? a.oldId : a.fairId || a.oldId;
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState({ rps: 0, cls: {} as Record<string, number>, rep: {} as Record<string, number>, total: 0 });
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("all");
  const pausedRef = useRef(false); pausedRef.current = paused;
  const buf = useRef<Row[]>([]);

  useEffect(() => {
    buf.current = []; setRows([]);
    if (!dropId) return;
    let alive = true, cur = "";
    const tick = async () => {
      try {
        const r = await api<any>(`/admin/drops/${dropId}/trace${cur ? "?after=" + cur : ""}`, { auth: "admin" });
        if (!alive) return;
        cur = r.cursor || cur;
        if (r.events?.length) buf.current = [...r.events.slice().reverse(), ...buf.current].slice(0, 300);
        setStats({ rps: r.per_sec || 0, cls: r.by_class_3s || {}, rep: r.by_replica_3s || {}, total: r.total || 0 });
        if (!pausedRef.current) setRows(buf.current.slice());
      } catch { /* keep polling */ }
    };
    tick(); const t = setInterval(tick, 700);
    return () => { alive = false; clearInterval(t); };
  }, [dropId]);

  const shown = useMemo(() => rows.filter((r) => (filter === "all" ? true : filter === "err" ? r.c >= 400 : filter === "HUMAN" ? r.pf === "HUMAN" : r.pf === filter)).slice(0, 40), [rows, filter]);
  const repTotal = Object.values(stats.rep).reduce((x, y) => x + y, 0) || 1;
  const reps = ["api-1", "api-2", "api-3"];
  const cmd = dropId ? `docker exec fd-redis redis-cli --raw XREVRANGE drop:${dropId}:trace + - COUNT 10` : "";
  const c3 = (stats.cls["2xx"] || 0) + (stats.cls["4xx"] || 0) + (stats.cls["5xx"] || 0);
  const kinds = a.profiles.filter((p) => p.id !== "HUMAN").map((p) => p.id);
  const chips: [string, string][] = [["all", "Everything"], ["err", "Only refused or errors"], ["HUMAN", "Real people"], ...(kinds.length ? BOT_ORDER.filter((id) => kinds.includes(id)) : BOT_ORDER).map((id) => [id, kindName(id)] as [string, string])];

  return (
    <section className="space-y-5">
      <SectionHead kicker="Straight from the servers" title="The real web traffic">
        Every line below is a real HTTP request that reached one of our three web servers, written down by the server itself as it answered. The "What the server did" column says in plain words what happened to it.
      </SectionHead>

      <p className="text-[15px] text-ink/85" aria-live="polite">
        {!dropId ? "No test has started, so there is no traffic yet."
          : stats.rps > 0 ? `The servers are answering ${n(Math.round(stats.rps))} requests every second. ${c3 ? `Right now ${Math.round(((stats.cls["4xx"] || 0) / c3) * 100)}% of them are being refused or slowed down.` : ""}`
          : `The servers are quiet. ${n(stats.total)} requests were recorded in this sale.`}
      </p>

      <div className="grid gap-3 md:grid-cols-[1fr_1.1fr_1.3fr]">
        <div className="panel p-4">
          <Eyebrow>Requests per second</Eyebrow>
          <div className="display num mt-1 text-5xl text-gold"><Counter value={Math.round(stats.rps)} /></div>
          <div className="mt-1 text-xs text-mute">{n(stats.total)} recorded in this sale, live from the servers</div>
        </div>
        <div className="panel p-4">
          <Eyebrow>How the servers answered (last 3 s)</Eyebrow>
          <div className="mt-2 flex gap-5">
            {([["2xx", "accepted", "#b8ff4a"], ["4xx", "refused or slowed", "#ff8a3d"], ["5xx", "server errors", "#ff3b5c"]] as const).map(([k, l, c]) => (
              <div key={k}><div className="display num text-3xl" style={{ color: c }}>{n(stats.cls[k] || 0)}</div><div className="text-[11px] leading-3.5 text-mute">{l}</div></div>))}
          </div>
        </div>
        <div className="panel p-4">
          <Eyebrow>Which of the 3 servers handled them (last 3 s)</Eyebrow>
          <div className="mt-2 space-y-1.5">
            {reps.map((r) => { const v = stats.rep[r] || 0; return (
              <div key={r} className="flex items-center gap-2 font-mono text-xs"><span className="w-12 text-mute">{r}</span><div className="h-2 flex-1 overflow-hidden rounded-[2px] bg-panel2"><div className="h-2 rounded-[2px] bg-violet transition-all duration-300" style={{ width: (v / repTotal) * 100 + "%" }} /></div><span className="num w-12 text-right">{n(v)}</span></div>); })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[6px] border border-line bg-[#04030a] shadow-[0_0_60px_-30px_rgba(139,108,255,.6)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-3 py-2">
          <span className="flex items-center gap-1.5" aria-hidden><Led tone="hot" className="!h-2 !w-2 !shadow-none" /><Led tone="warn" className="!h-2 !w-2 !shadow-none" /><Led tone="lime" pulse={!paused} className="!h-2 !w-2" /></span>
          <span className="font-mono text-xs font-bold text-gold">$ tail -f requests.log</span>
          <span className="font-mono text-[11px] text-mute">{paused ? "paused" : "live"}</span>
          <button onClick={() => setPaused(!paused)} className="ml-auto inline-flex items-center gap-1.5 rounded-[4px] border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-mute transition hover:border-gold/60 hover:text-gold">
            {paused ? <><Play size={12} />Resume</> : <><Pause size={12} />Pause</>}
          </button>
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
          {chips.map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}
              className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-xs font-semibold transition", filter === id ? "border-gold bg-gold/10 text-gold" : "border-line text-mute hover:text-ink")}>
              {(id === "HUMAN" || BOT_ORDER.includes(id)) && <BotGlyph id={id} size={13} />}{l}
            </button>))}
        </div>
        <div className="thin-scroll max-h-[440px] overflow-auto font-mono text-[12px] leading-5">
          {shown.length === 0 ? <div className="px-3 py-8 text-center text-mute">{dropId ? "Waiting for requests: press Start and they appear here as they arrive." : "No test yet."}</div> : (
            <table className="w-full min-w-[1280px]">
              <thead className="sticky top-0 bg-[#04030a] text-left text-[10px] uppercase tracking-[.16em] text-mute"><tr>
                <th className="px-2 py-1 font-normal">Time</th><th className="px-1 font-normal">Server</th><th className="px-1 font-normal">Method</th><th className="px-1 font-normal">Path asked for</th>
                <th className="px-1 font-normal">Answer</th><th className="px-1 font-normal">In words</th><th className="px-1 font-normal">What the server did</th><th className="px-1 text-right font-normal">Took</th><th className="px-2 font-normal">Account</th><th className="px-1 font-normal">Address</th><th className="px-2 font-normal">Who</th></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const known = r.pf === "HUMAN" || BOT_ORDER.includes(r.pf);
                  return (
                    <tr key={r.id} title={backendDid(r.ep, r.m, r.c)} className="border-b border-line/30 hover:bg-panel2/60">
                      <td className="whitespace-nowrap px-2 text-mute">{clock(r.t)}</td>
                      <td className="whitespace-nowrap px-1 text-mute">{r.rep}</td>
                      <td className="whitespace-nowrap px-1 font-bold" style={{ color: r.m === "POST" ? "#7fd8ff" : "#9a90b8" }}>{r.m}</td>
                      <td className="max-w-[320px] truncate px-1 text-ink/90" title={r.p}>{r.p}</td>
                      <td className="whitespace-nowrap px-1 font-bold" style={{ color: statusTone(r.c) }}>{r.c}</td>
                      <td className="whitespace-nowrap px-1 text-[11px]" style={{ color: statusTone(r.c) }}>{statusWord(r.c)}</td>
                      <td className="max-w-[340px] truncate px-1 font-sans text-[11px] text-ink/75" title={backendDid(r.ep, r.m, r.c)}>{backendDid(r.ep, r.m, r.c)}</td>
                      <td className="num whitespace-nowrap px-1 text-right text-mute">{(r.us / 1000).toFixed(1)} ms</td>
                      <td className="whitespace-nowrap px-2 text-ink/80" title={r.a}>{shortId(r.a)}</td>
                      <td className="whitespace-nowrap px-1 text-mute">{r.ip}</td>
                      <td className="whitespace-nowrap px-2 font-sans text-[11px] font-semibold">{known ? <span className="inline-flex items-center gap-1.5"><BotGlyph id={r.pf} size={13} />{kindName(r.pf)}</span> : ""}</td>
                    </tr>);
                })}
              </tbody>
            </table>)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[4px] border border-line px-3 py-1.5 font-semibold text-mute transition hover:border-gold/60 hover:text-gold"><BarChart3 size={14} />Same traffic as charts (Grafana)</a>
        <a href="/api/metrics" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[4px] border border-line px-3 py-1.5 font-semibold text-mute transition hover:border-gold/60 hover:text-gold"><Gauge size={14} />Raw server counters</a>
      </div>

      {cmd && (
        <details className="panel p-4 text-sm text-mute">
          <summary className="cursor-pointer font-semibold text-ink">Check it yourself, outside this website</summary>
          <p className="mt-2">This screen only reads what the servers recorded. To see the same records in a terminal, run:</p>
          <pre className="mt-2 overflow-x-auto rounded-[4px] border border-line bg-bg p-3 font-mono text-[11.5px] text-ink">{cmd}</pre>
          <p className="mt-2">Or watch the servers&apos; own counters change while a test runs: open <span className="font-mono text-ink">/api/metrics</span> twice, a few seconds apart, and compare <span className="font-mono text-ink">fd_http_requests_total</span>.</p>
        </details>)}
    </section>
  );
}
