"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Arena } from "@/lib/arena";
import { BOTS, BOT_ORDER, n } from "@/components/admin/botinfo";
import { clock, shortId } from "./eventText";

// The raw proof: every line is an HTTP request that really reached one of the web servers (method, path, status, time taken, which server, which account and address).
// It is the servers' own record, written while the request was handled, so a judge can watch what each bot is really sending. Recorded only while this panel is open.

type Row = { id: string; t: number; m: string; p: string; ep: string; c: number; us: number; a: string; ip: string; rep: string; k: string; pf: string };

const statusTone = (c: number) => (c < 300 ? "#22c55e" : c === 429 ? "#f59e0b" : c < 500 ? "#f97316" : "#ef4444");
const statusWord = (c: number) =>
  c === 200 ? "accepted" : c === 409 ? "refused: already done" : c === 429 ? "slowed: too many clicks" : c === 403 ? "refused" : c === 410 ? "too late: sale closed" : c === 404 ? "not found" : c === 401 ? "not signed in" : c >= 500 ? "server error" : c >= 400 ? "refused" : "ok";

export default function LiveHttp({ a }: { a: Arena }) {
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">The real web traffic</h2>
          <p className="max-w-3xl text-sm text-mute">Every line below is an HTTP request that actually reached one of our three web servers, recorded by the server itself as it answered. This is the proof that the bots are really sending traffic: you can see what they send, how the server answered, and which server handled it.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 font-semibold text-mute hover:text-ink">📊 Same traffic as charts (Grafana)</a>
          <a href="/api/metrics" target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 font-semibold text-mute hover:text-ink">🔢 Raw server counters</a>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.3fr]">
        <div className="rounded-xl border border-line bg-panel/70 p-3">
          <div className="text-[11px] uppercase tracking-wide text-mute">Requests per second (servers)</div>
          <div className="text-3xl font-extrabold tabular-nums">{n(Math.round(stats.rps))}</div>
          <div className="text-[11px] text-mute">{n(stats.total)} recorded in this sale</div>
        </div>
        <div className="rounded-xl border border-line bg-panel/70 p-3">
          <div className="text-[11px] uppercase tracking-wide text-mute">How the servers answered (last 3 s)</div>
          <div className="mt-1 flex gap-4 text-sm">
            {[["2xx", "accepted", "#22c55e"], ["4xx", "refused / slowed", "#f59e0b"], ["5xx", "server errors", "#ef4444"]].map(([k, l, c]) => (
              <div key={k}><div className="text-xl font-bold tabular-nums" style={{ color: c }}>{n(stats.cls[k] || 0)}</div><div className="text-[10.5px] text-mute">{l}</div></div>))}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-panel/70 p-3">
          <div className="text-[11px] uppercase tracking-wide text-mute">Which server handled them (last 3 s)</div>
          <div className="mt-1 space-y-1">
            {reps.map((r) => { const v = stats.rep[r] || 0; return (
              <div key={r} className="flex items-center gap-2 text-xs"><span className="w-12 text-mute">{r}</span><div className="h-2 flex-1 overflow-hidden rounded bg-panel2"><div className="h-2 rounded bg-accent transition-all" style={{ width: (v / repTotal) * 100 + "%" }} /></div><span className="w-12 text-right tabular-nums">{n(v)}</span></div>); })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-[#070b12]">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2 text-xs">
          <span className="font-mono font-bold text-accent">$ live requests</span><span className={"h-2 w-2 rounded-full " + (paused ? "bg-warn" : "animate-pulse bg-ok")} />
          {[["all", "Everything"], ["err", "Only refused / errors"], ["HUMAN", "Only real people"], ...BOT_ORDER.map((id) => [id, BOTS[id]?.name || id])].map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} className={"rounded-full border px-2.5 py-0.5 font-semibold " + (filter === id ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-ink")}>{l}</button>))}
          <button onClick={() => setPaused(!paused)} className="ml-auto rounded-md border border-line px-2.5 py-0.5 font-semibold text-mute hover:text-ink">{paused ? "▶ Resume" : "⏸ Pause"}</button>
        </div>
        <div className="max-h-[420px] overflow-auto font-mono text-[12px] leading-5">
          {shown.length === 0 ? <div className="px-3 py-6 text-center text-mute">{dropId ? "Waiting for requests… press Start and they appear here as they arrive." : "No test yet."}</div> : (
            <table className="w-full min-w-[900px]"><tbody>
              {shown.map((r) => {
                const b = BOTS[r.pf];
                return (
                  <tr key={r.id} className="border-b border-line/30 hover:bg-panel2/60">
                    <td className="whitespace-nowrap px-2 text-mute">{clock(r.t)}</td>
                    <td className="whitespace-nowrap px-1 text-mute">{r.rep}</td>
                    <td className="whitespace-nowrap px-1 font-bold" style={{ color: r.m === "POST" ? "#38bdf8" : "#94a3b8" }}>{r.m}</td>
                    <td className="max-w-[320px] truncate px-1 text-ink/90" title={r.p}>{r.p}</td>
                    <td className="whitespace-nowrap px-1 font-bold" style={{ color: statusTone(r.c) }}>{r.c}</td>
                    <td className="whitespace-nowrap px-1 text-[11px]" style={{ color: statusTone(r.c) }}>{statusWord(r.c)}</td>
                    <td className="whitespace-nowrap px-1 text-right text-mute">{(r.us / 1000).toFixed(1)} ms</td>
                    <td className="whitespace-nowrap px-1 text-ink/80">{shortId(r.a)}</td>
                    <td className="whitespace-nowrap px-1 text-mute">{r.ip}</td>
                    <td className="whitespace-nowrap px-2 font-sans text-[11px] font-semibold" style={{ color: b?.color || "#38bdf8" }}>{b ? `${b.icon} ${b.name}` : r.pf === "HUMAN" ? "🧑 Real person" : ""}</td>
                  </tr>);
              })}
            </tbody></table>)}
        </div>
      </div>

      {cmd && (
        <details className="rounded-xl border border-line bg-panel/60 p-3 text-xs text-mute">
          <summary className="cursor-pointer font-semibold text-ink">Check it yourself, outside this website</summary>
          <p className="mt-2">This screen only reads what the servers recorded. To see the same records in a terminal, run:</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-bg p-2 font-mono text-[11.5px] text-ink">{cmd}</pre>
          <p className="mt-2">Or watch the servers&apos; own counters change while a test runs: open <span className="font-mono text-ink">/api/metrics</span> twice, a few seconds apart, and compare <span className="font-mono text-ink">fd_http_requests_total</span>.</p>
        </details>)}
    </section>
  );
}
