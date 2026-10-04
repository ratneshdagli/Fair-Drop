"use client";
// Server details: the counters the server keeps for one sale, streamed live.
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Led, Stat, StateBadge } from "@/components/ui";
import { Explain, Legend, NeedSale, Panel, PAL, TicketRule, axis, chartTip, clock, grid, useLive } from "./kit";

type Pt = { t: number; rps: number; entries: number; tokens: number; p99: number };

export default function LiveTab({ dropId }: { dropId: string }) {
  const { s, ok } = useLive(dropId);
  const [hist, setHist] = useState<Pt[]>([]);
  const conn = ok ? "live" : "reconnecting…";
  useEffect(() => { setHist([]); }, [dropId]);
  useEffect(() => {
    if (!s) return;
    setHist((h) => [...h.slice(-90), { t: Date.now(), rps: Math.round(s.rps ?? 0), entries: s.entries_registered, tokens: s.tokens_issued, p99: Math.round(s.p99_ms) }]);
  }, [s?.now_ms]);
  if (!dropId) return <NeedSale />;
  if (!s) return <div className="flex items-center gap-2 text-sm text-mute"><Led tone="warn" pulse />Connecting to the server…</div>;
  const c = s.counters || {};
  const rejected = (c.rejected_reused || 0) + (c.rejected_bad_sig || 0) + (c.rejected_ineligible || 0) + (c.rejected_closed || 0) + (c.rejected_already_issued || 0);
  const healthy = s.replicas.filter((r: any) => r.healthy).length;
  const old = s.drop.mode === "fcfs";
  return (
    <div className="space-y-6">
      <Explain title="What these counters are">Everything the server counted for this sale, streamed live. &ldquo;Tickets&rdquo; are the one-per-person passes people trade in to enter; &ldquo;entries&rdquo; are people actually in the draw; the red-labelled counters are requests the rules turned away on purpose.</Explain>
      <div className="flex flex-wrap items-center gap-3"><StateBadge state={s.drop.state} /><Badge tone={conn === "live" ? "green" : "amber"}><Led tone={conn === "live" ? "lime" : "warn"} pulse />{conn === "live" ? "streaming live" : conn}</Badge><TicketRule old={old} /><span className="font-mono text-xs text-mute">{dropId}</span></div>

      <section className="space-y-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-gold">Who is in</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tickets issued" value={s.tokens_issued.toLocaleString()} sub="one per verified login" />
          <Stat label="Entries registered" value={s.entries_registered.toLocaleString()} sub="people in the draw" tone="gold" />
          <Stat label="Attempts recorded" value={s.attempts.toLocaleString()} sub={`${rejected.toLocaleString()} turned away`} />
          <Stat label="Seats up for grabs" value={String(s.seats_total)} sub={old ? `${c.sold_out_rejects || 0} told sold out` : s.seats_claimed !== undefined ? `${s.seats_claimed} claimed so far` : "decided by the draw"} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-gold">What the rules turned away</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Stat label="Ticket reused" value={(c.rejected_reused || 0).toLocaleString()} sub="the server's own count of reuse attempts; Proof's judge may list fewer" tone={c.rejected_reused ? "warn" : undefined} />
          <Stat label="Fake ticket" value={(c.rejected_bad_sig || 0).toLocaleString()} sub="signature did not check out" tone={c.rejected_bad_sig ? "warn" : undefined} />
          <Stat label="Signed up too late" value={(c.rejected_ineligible || 0).toLocaleString()} sub="after the cutoff" />
          <Stat label="Second ticket asked" value={(c.rejected_already_issued || 0).toLocaleString()} sub="already had one" />
          <Stat label="Caught by decoy" value={(c.tarpit_hits || 0).toLocaleString()} sub="took the fake fast lane" tone={c.tarpit_hits ? "warn" : undefined} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-gold">How the servers are coping</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Web requests per second" value={s.rps == null ? "-" : Math.round(s.rps).toLocaleString()} sub="all traffic on all servers, every sale; includes this screen's own refreshes" />
          <Stat label="Slowest 1% wait" value={s.p99_ms > 0 ? `${s.p99_ms.toFixed(0)} ms` : "-"} sub="worst server (tech: p99)" tone={s.p99_ms > 500 ? "warn" : "ok"} />
          <Stat label="Servers healthy" value={`${healthy} / ${s.replicas.length}`} sub={`${s.replicas.filter((r: any) => r.id !== "worker").length} web servers + ${s.replicas.filter((r: any) => r.id === "worker").length} worker`} tone={healthy < s.replicas.length ? "bad" : "ok"} />
          <Stat label="Slowed by rate limit" value={(s.rate_limited_global || 0).toLocaleString()} sub="all sales; keeps the site up only" tone={s.rate_limited_global ? "warn" : undefined} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Traffic and waiting time" note="Gold: requests per second. Orange: how long the slowest 1% waited, in milliseconds." right={<Legend items={[{ color: PAL.gold, label: "requests / s", shape: "bar" }, { color: PAL.warn, label: "slow wait (ms)", shape: "bar" }]} />}>
          <ResponsiveContainer width="100%" height={220}><AreaChart data={hist}><CartesianGrid {...grid} /><XAxis dataKey="t" tickFormatter={clock} {...axis} /><YAxis {...axis} />
            <Tooltip {...chartTip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} />
            <Area type="monotone" dataKey="rps" stroke={PAL.gold} fill={PAL.gold + "33"} /><Area type="monotone" dataKey="p99" stroke={PAL.warn} fill={PAL.warn + "22"} /></AreaChart></ResponsiveContainer></Panel>
        <Panel title="Tickets handed out vs entries made" note="Violet: tickets handed out. Lime: entries completed. Entries can never exceed tickets." right={<Legend items={[{ color: PAL.violet, label: "tickets", shape: "bar" }, { color: PAL.lime, label: "entries", shape: "bar" }]} />}>
          <ResponsiveContainer width="100%" height={220}><AreaChart data={hist}><CartesianGrid {...grid} /><XAxis dataKey="t" tickFormatter={clock} {...axis} /><YAxis {...axis} />
            <Tooltip {...chartTip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} />
            <Area type="monotone" dataKey="tokens" stroke={PAL.violet} fill={PAL.violet + "33"} /><Area type="monotone" dataKey="entries" stroke={PAL.lime} fill={PAL.lime + "33"} /></AreaChart></ResponsiveContainer></Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="The servers" note="Each web server and the background worker.">
          <ul className="space-y-2.5 text-sm">{s.replicas.map((r: any) => (
            <li key={r.id} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Led tone={r.healthy ? "lime" : "hot"} />{r.id} <span className="text-xs text-mute">{r.role}</span></span>
              {r.healthy ? <span className="text-right text-xs text-mute">slow wait {Number(r.p99_ms).toFixed(0)} ms · {r.inflight} in progress · {r.requests.toLocaleString()} requests</span> : <Badge tone="red">DOWN</Badge>}</li>))}</ul></Panel>
        <Panel title="Seat inventory" note="How many seats exist and what happened to them.">
          <div className="space-y-1.5 text-sm text-mute"><div>Total seats <b className="text-ink">{s.seats_total}</b></div>
            {s.seats_claimed !== undefined && <div>Claimed <b className="text-ink">{s.seats_claimed}</b> · expired {c.claims_expired || 0} · passed down the waiting list {c.claims_promoted || 0}</div>}
            {old && <div>Sold in the old way <b className="text-ink">{s.baseline_seats_sold}</b> · told sold out {c.sold_out_rejects || 0}</div>}</div></Panel>
        <Panel title="Real people vs bots" note="From the labels of a test run. Labels are for judging only: the draw never reads them.">
          {s.labels ? <div className="space-y-1.5 text-sm"><div className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-ice" />Real people in the draw: <b>{s.labels.entries_human.toLocaleString()}</b></div><div className="flex items-center gap-2"><i className="h-2.5 w-2.5 rotate-45 bg-hot" />Bots in the draw: <b>{s.labels.entries_bot.toLocaleString()}</b></div></div> : <div className="text-sm text-mute">No labels loaded. Labels appear after a bot test (Test lab).</div>}</Panel>
      </div>
    </div>
  );
}
