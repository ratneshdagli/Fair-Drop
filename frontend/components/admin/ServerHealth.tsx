"use client";
// "Is the website itself coping?": tickets and queue, response times, the servers and the two databases. All from the live pulse.
import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, usePoll } from "@/lib/api";
import { Callout, Led, Stat, StateBadge, fmtDur } from "@/components/ui";
import { ms, n } from "./botinfo";
import { Explain, Legend, NeedSale, Panel, PAL, TicketRule, axis, chartTip, clock, grid, upTo, useMaxSeats, useDropPoll } from "./kit";

// "-" when nothing has been measured yet (the server reports 0 until a web server has answered a request)
const wait = (x: number) => (x > 0 ? ms(x) : "-");
const tone3 = (v: number, a: number, b: number) => (v < a ? "ok" : v < b ? "warn" : "bad") as "ok" | "warn" | "bad";

export default function ServerHealth({ dropId }: { dropId: string }) {
  const { data: pulse, error } = useDropPoll(dropId, "pulse", 1500);
  const [ph, setPh] = useState<any[]>([]);
  const peak = useRef({ inflight: 0, id: "" });
  const cap = useMaxSeats();
  useEffect(() => { setPh([]); peak.current = { inflight: 0, id: dropId }; }, [dropId]);
  useEffect(() => {
    if (!pulse) return;
    peak.current.inflight = Math.max(peak.current.inflight, pulse.queue?.in_flight || 0);
    setPh((h) => [...h.slice(-89), { t: Date.now(), "typical wait": pulse.server.typical_ms > 0 ? +pulse.server.typical_ms.toFixed(1) : null, "slow wait": pulse.server.slow_ms > 0 ? +pulse.server.slow_ms.toFixed(1) : null, "handled at once": pulse.queue.in_flight }]);
  }, [pulse?.now_ms]);

  if (!dropId) return <NeedSale />;
  if (!pulse) return error ? <Callout tone="bad" title="Server numbers not available">The server did not answer ({String((error as any).message || error)}). Nothing is shown rather than made-up numbers; this retries by itself.</Callout> : <div className="flex items-center gap-2 text-sm text-mute"><Led tone="warn" pulse />Reading the servers…</div>;
  const T = pulse.tickets, pct = T.total ? (T.sold / T.total) * 100 : 0, entries = pulse.flow.entries;
  const old = pulse.mode === "fcfs";
  const closes = pulse.closes_at_ms && pulse.state === "OPEN" ? Math.max(0, pulse.closes_at_ms - pulse.now_ms) : null;
  const S = pulse.server, D = pulse.database;
  const webs = S.replicas.filter((r: any) => r.id !== "worker").length, workers = S.replicas.length - webs;
  const staleNote = error ? " (the last reading failed; these numbers may be out of date)" : "";
  return (
    <div className="space-y-6">
      <Explain title="What this shows">Whether the website itself is coping with the crowd: how many tickets are left, whether a queue is forming, how long people wait, and whether every server and database is up. Lime is healthy, orange means watch it, red means trouble. Numbers refresh every second or two.</Explain>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tickets" right={<span className="flex items-center gap-2"><TicketRule old={old} /><StateBadge state={pulse.state} /></span>} note="How many seats exist and how many are gone.">
          <div className="flex items-end gap-8">
            <div><div className="display num text-6xl">{n(T.left)}</div><div className="text-xs text-mute">seats left of {n(T.total)}{staleNote}</div></div>
            <div><div className="display num text-6xl text-lime">{n(T.sold)}</div><div className="text-xs text-mute">{T.basis === "bought" ? "sold" : T.basis === "claimed" ? "claimed by winners" : "given out so far (the draw comes after the sale closes)"}</div></div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-sm bg-panel2"><div className="h-full rounded-sm bg-lime" style={{ width: pct + "%" }} /></div>
          {T.basis === "pending" && <p className="mt-3 text-sm leading-relaxed text-ink/85">Nobody &ldquo;buys&rdquo; in the fair sale. When the sale closes, the draw picks <b>{n(T.total)}</b> winners from the <b>{n(entries)}</b> entries so far: {entries > T.total ? <>about <b>1 in {(entries / T.total).toFixed(1)}</b> will win.</> : <>so far there are fewer entries than seats, so everyone who is in wins a seat.</>}{closes !== null && <> The sale closes in <b>{fmtDur(closes)}</b>.</>}</p>}
          {T.basis === "bought" && <p className="mt-3 text-sm leading-relaxed text-ink/85">First come, first served: seats go to whoever&rsquo;s click lands first, {upTo(cap)} per login. So speed (and bots) win.</p>}
          {T.tiers.some((t: any) => t.sold !== undefined) && <table className="mt-3 w-full text-sm"><thead className="text-left font-mono text-xs uppercase text-mute"><tr><th className="py-1">Section</th><th className="text-right">Seats</th><th className="text-right">Sold</th><th className="text-right">Left</th></tr></thead><tbody>{T.tiers.map((t: any) => <tr key={t.id} className="border-t border-line"><td className="py-1.5">{t.name}</td><td className="text-right">{t.seats}</td><td className="text-right">{t.sold ?? "-"}</td><td className="text-right">{t.left ?? "-"}</td></tr>)}</tbody></table>}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[[n(pulse.flow.tokens_issued), "tickets handed out", "one per verified login"], [n(entries), "entries in the draw", ""], [n(pulse.flow.counters?.tarpit_hits || 0), "caught by the decoy", ""]].map(([v, l, sub]) => <div key={l} className="rounded-[4px] border border-line bg-panel2 p-2.5"><div className="display num text-2xl">{v}</div><div className="text-xs text-ink/85">{l}</div>{sub && <div className="text-xs text-mute">{sub}</div>}</div>)}
          </div>
        </Panel>
        <Panel title="Is a queue forming?" note="Two numbers tell you if the servers are falling behind.">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Being handled now" value={n(pulse.queue.in_flight)} sub="requests in progress this instant" tone={pulse.queue.in_flight > 500 ? "warn" : "ok"} />
            <Stat label="Waiting to be saved" value={n(pulse.queue.db_writes_waiting)} sub="records queued for the permanent database" tone={pulse.queue.db_writes_waiting > 5000 ? "warn" : "ok"} />
          </div>
          <Callout tone="info" className="mt-4">{old ? <>The old sale has no waiting line either: whoever&rsquo;s click lands first wins, which is why bots do well in it. </> : null}The fair sale has <b>no waiting line, on purpose</b>. Arrival order doesn&rsquo;t change anyone&rsquo;s chance, so there is nothing to queue for. What can pile up is work: if those two numbers keep growing, the servers are falling behind.</Callout>
          <p className="mt-3 text-sm text-mute">Highest reading since you opened this page: <b className="text-ink">{n(peak.current.inflight)}</b> requests handled at once (sampled every 1.5 seconds, so a shorter spike can be missed; it restarts when you change sale or reload). Measured on this one computer: it shows what <i>this</i> machine can do, not what a real 50,000-person crowd would do.</p>
        </Panel>
      </div>

      <section className="space-y-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-gold">How long people wait</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Stat label="Typical wait" value={wait(S.typical_ms)} tone={tone3(S.typical_ms, 250, 1000)} sub="half of requests waited less (tech: p50; middle of the web servers' own medians)" />
          <Stat label="Slow wait" value={wait(S.slow_ms)} tone={tone3(S.slow_ms, 800, 2500)} sub="19 of 20 wait less (tech: p95; the slowest web server's figure)" />
          <Stat label="Slowest wait" value={wait(S.slowest_ms)} tone={tone3(S.slowest_ms, 2000, 5000)} sub="99 of 100 wait less (tech: p99; the slowest web server's figure)" />
          <Stat label="Server errors" value={n(S.errors_5xx_total)} tone={S.errors_5xx_total ? "bad" : "ok"} sub="times a server failed to answer" />
          <Stat label="Servers running" value={`${S.servers_up} of ${S.servers_total}`} tone={S.servers_up === S.servers_total ? "ok" : "bad"} sub={`${webs} web server${webs === 1 ? "" : "s"} + ${workers} worker${workers === 1 ? "" : "s"}`} />
          <Stat label="Slowed by rate limit" value={n(pulse.flow.rate_limited_global)} sub="told to wait a second (all sales)" />
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="How fast the site answers" note="Under about a quarter of a second feels instant. If the orange line shoots up, some people are waiting." right={<Legend items={[{ color: PAL.lime, label: "typical", shape: "bar" }, { color: PAL.warn, label: "slow (1 in 20)", shape: "bar" }]} />}>
          <ResponsiveContainer width="100%" height={180}><LineChart data={ph}><CartesianGrid {...grid} /><XAxis dataKey="t" tickFormatter={clock} {...axis} /><YAxis {...axis} unit=" ms" />
            <Tooltip {...chartTip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} /><Line type="monotone" dataKey="typical wait" stroke={PAL.lime} dot={false} connectNulls /><Line type="monotone" dataKey="slow wait" stroke={PAL.warn} dot={false} connectNulls /></LineChart></ResponsiveContainer></Panel>
        <Panel title="Requests being handled at once" note="The crowd at the door, inside the servers." right={<Legend items={[{ color: PAL.ice, label: "in progress", shape: "bar" }]} />}>
          <ResponsiveContainer width="100%" height={180}><AreaChart data={ph}><CartesianGrid {...grid} /><XAxis dataKey="t" tickFormatter={clock} {...axis} /><YAxis {...axis} />
            <Tooltip {...chartTip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} /><Area type="monotone" dataKey="handled at once" stroke={PAL.ice} fill={PAL.ice + "33"} /></AreaChart></ResponsiveContainer></Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="The servers" note={`${webs} web server${webs === 1 ? "" : "s"} share the crowd; ${workers} background worker${workers === 1 ? "" : "s"} do${workers === 1 ? "es" : ""} the slow jobs.`}>
          <ul className="space-y-2.5 text-sm">{S.replicas.map((r: any) => <li key={r.id} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Led tone={r.up ? "lime" : "hot"} />{r.id === "worker" ? "Background worker" : "Web server " + String(r.id).replace("api-", "")}</span><span className="text-right text-xs text-mute">{r.up ? `${n(r.requests)} requests · ${n(r.inflight)} in progress` : "DOWN"}</span></li>)}</ul></Panel>
        <Panel title="Fast memory (Redis)" note="Holds the live state: who has a ticket, who has entered, the clock.">
          <div className="grid grid-cols-2 gap-3">{[[`${D.redis.memory_mb.toFixed(0)} MB`, "memory used"], [n(D.redis.ops_per_sec), "operations per second"], [n(D.redis.clients), "open connections"], [n(D.redis.keys), "items stored (all sales)"]].map(([v, l]) => <div key={l}><div className="display num text-3xl">{v}</div><div className="text-xs text-mute">{l}</div></div>)}</div></Panel>
        <Panel title="Permanent records (Postgres)" note="The permanent copy. Nothing here is ever edited, only added to. Counts cover every sale on this server, not just the one you picked.">
          <div className="grid grid-cols-2 gap-3">{[[n(D.postgres.audit_entries), "events in the tamper-proof log (all sales)"], [n(D.postgres.entry_rows), "entries saved (all sales)"], [`${D.postgres.size_mb.toFixed(0)} MB`, "database size"], [n(D.postgres.connections), "open connections"]].map(([v, l]) => <div key={l}><div className="display num text-3xl">{v}</div><div className="text-xs text-mute">{l}</div></div>)}</div></Panel>
      </div>
    </div>
  );
}
