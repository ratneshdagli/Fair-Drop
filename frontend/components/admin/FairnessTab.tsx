"use client";
// Detailed results of recorded bot tests: the same crowd, sold three ways.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend as RLegend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw, Scale } from "lucide-react";
import { api, fmtTime, usePoll } from "@/lib/api";
import { Button, Callout, Select, Spinner, Stat } from "@/components/ui";
import { Explain, Legend, Mono, Panel, PAL, Verdict, axis, chartTip, grid, th, td } from "./kit";

const C = { old: PAL.hot, lottery: PAL.violet, fair: PAL.gold, live: "#b32744" };
const f3 = (x: any) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(3));
const NAMES = { old: "Old way (first come)", lottery: "Simple lottery", fair: "Fair Drop", live: "Old way (live test)" };

function pols(r: any) {
  const P = r.policies || {};
  return [[NAMES.old, P.fcfs, C.old], [NAMES.lottery, P.naive_expected, C.lottery], [NAMES.fair, P.fairdrop_expected, C.fair], ...(P.fcfs_live ? [[NAMES.live, P.fcfs_live, C.live]] : [])] as [string, any, string][];
}
const MethodKey = () => <Legend items={[{ color: PAL.hot, label: "Old way (first come)", shape: "bar" }, { color: PAL.violet, label: "Simple lottery", shape: "bar" }, { color: PAL.gold, label: "Fair Drop", shape: "bar" }]} />;
const xl = { ...axis, fontSize: 12 };

function ExperimentView({ r }: { r: any }) {
  const ps = pols(r).filter((p) => p[1]);
  const opNames = Array.from(new Set(ps.flatMap(([, p]) => Object.keys(p.operators)))).sort((a, b) => Math.max(...ps.map((p) => p[1].operators[b]?.seats || 0)) - Math.max(...ps.map((p) => p[1].operators[a]?.seats || 0))).slice(0, 12);
  const seats = opNames.map((o) => ({ op: o, ...Object.fromEntries(ps.map(([n, p]) => [n, +(p.operators[o]?.seats || 0).toFixed(1)])) }));
  const ratio = ps.map(([n, p, c]) => ({ n, v: p.bot_advantage_ratio ?? 0, c }));
  const hwr = ps.map(([n, p, c]) => ({ n, v: p.human_win_rate ?? 0, c }));
  const share = ps.map(([n, p]) => ({ n, "bot share of seats": +p.bot_seat_share.toFixed(4), "bot share of the crowd": +p.bot_identity_share.toFixed(4) }));
  const bots = opNames.filter((o) => o !== "humans" && o !== "unknown");
  const cost = bots.map((o) => ({ op: o, ...Object.fromEntries(ps.map(([n, p]) => [n, +(p.operators[o]?.cost_per_seat_usd || 0).toFixed(2)])) }));
  const lat = Object.entries(r.latency || {}).filter(([, v]: any) => v.requests > 20).sort((a: any, b: any) => b[1].requests - a[1].requests).slice(0, 8);
  const integ = r.integrity;
  const v = r.verification;
  return (
    <div className="space-y-6">
      <Callout tone="info" title={r.meta.scenario.description}>{r.meta.actors.toLocaleString()} verified accounts ({r.traffic.humans.toLocaleString()} real people, {r.traffic.bot_identities.toLocaleString()} bot accounts run by {r.meta.operators} operators) · {r.traffic.client_requests.toLocaleString()} requests sent · each bot account assumed to cost <b>${r.meta.identity_cost_usd}</b>. All three methods are worked out on the <b>same recorded attempts</b>.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bot advantage: old way" value={f3(r.policies.fcfs?.bot_advantage_ratio)} tone="bad" sub="bots' share of seats ÷ their share of the crowd" />
        <Stat label="Bot advantage: lottery" value={f3(r.policies.naive_expected?.bot_advantage_ratio)} tone="warn" sub="average over many random re-draws" />
        <Stat label="Bot advantage: Fair Drop" value={f3(r.policies.fairdrop_expected?.bot_advantage_ratio)} tone="gold" sub="1 is fair; the target is 1 or less" />
        <Stat label="Safety checks" value={integ ? (integ.ok ? "All zero" : `${integ.total_violations} problem(s)`) : "n/a"} tone={integ?.ok ? "ok" : "bad"} sub={v ? (v.reference_verifier_ok ? "independent verifier agrees" : "independent verifier FAILED") : ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3"><Mono>Colour key</Mono><MethodKey /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Seats won, by who" note="Each group of bars is one bot operator (or the real people). Taller means more seats won under that method."><ResponsiveContainer width="100%" height={290}><BarChart data={seats}><CartesianGrid {...grid} /><XAxis dataKey="op" {...xl} angle={-30} textAnchor="end" height={60} /><YAxis {...axis} /><Tooltip {...chartTip} cursor={{ fill: "#ffffff0a" }} /><RLegend wrapperStyle={{ fontSize: 13 }} />
          {ps.map(([n, , c]) => <Bar key={n} dataKey={n} fill={c} />)}</BarChart></ResponsiveContainer></Panel>
        <Panel title="Bots' share of seats vs of the crowd" note="If the first bar is much taller than the second, bots are getting more than their fair share."><ResponsiveContainer width="100%" height={290}><BarChart data={share}><CartesianGrid {...grid} /><XAxis dataKey="n" {...xl} /><YAxis {...axis} /><Tooltip {...chartTip} cursor={{ fill: "#ffffff0a" }} /><RLegend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="bot share of seats" fill={PAL.hot} /><Bar dataKey="bot share of the crowd" fill={PAL.mute} /></BarChart></ResponsiveContainer></Panel>
        <Panel title="Bot advantage" note="Bots' share of seats divided by their share of the crowd. The white line at 1 is fair."><ResponsiveContainer width="100%" height={250}><BarChart data={ratio}><CartesianGrid {...grid} /><XAxis dataKey="n" {...xl} /><YAxis {...axis} /><Tooltip {...chartTip} cursor={{ fill: "#ffffff0a" }} /><ReferenceLine y={1} stroke="#fff" strokeDasharray="4 4" /><Bar dataKey="v" name="advantage">{ratio.map((d, i) => <Cell key={i} fill={d.c} />)}</Bar></BarChart></ResponsiveContainer></Panel>
        <Panel title="A real person's chance" note="Real people who won a seat ÷ real people who entered."><ResponsiveContainer width="100%" height={250}><BarChart data={hwr}><CartesianGrid {...grid} /><XAxis dataKey="n" {...xl} /><YAxis {...axis} /><Tooltip {...chartTip} cursor={{ fill: "#ffffff0a" }} /><Bar dataKey="v" name="chance of a seat">{hwr.map((d, i) => <Cell key={i} fill={d.c} />)}</Bar></BarChart></ResponsiveContainer></Panel>
        {bots.length > 0 && <Panel title="What a seat costs the bot owner" note={`In dollars per seat won (0 means no seat won). Cost = accounts bought × $${r.meta.identity_cost_usd} ÷ seats won. It shows what extra odds cost; it does not claim bots are impossible.`}><ResponsiveContainer width="100%" height={260}><BarChart data={cost}><CartesianGrid {...grid} /><XAxis dataKey="op" {...xl} angle={-30} textAnchor="end" height={60} /><YAxis {...axis} /><Tooltip {...chartTip} cursor={{ fill: "#ffffff0a" }} /><RLegend wrapperStyle={{ fontSize: 13 }} />
          {ps.map(([n, , c]) => <Bar key={n} dataKey={n} fill={c} />)}</BarChart></ResponsiveContainer></Panel>}
        <Panel title="How fast the site answered" note="Measured by the attack tool, per kind of request.">
          <div className="overflow-x-auto"><table className="w-full min-w-[460px]"><thead><tr><th className={th}>Request</th><th className={th + " text-right"}>Sent</th><th className={th + " text-right"}>Per sec</th><th className={th + " text-right"} title="typical wait, ms">Typical</th><th className={th + " text-right"} title="19 in 20 wait less, ms">Slow</th><th className={th + " text-right"} title="99 in 100 wait less, ms">Slowest</th><th className={th + " text-right"}>Errors</th></tr></thead>
            <tbody>{lat.map(([k, x]: any) => <tr key={k} className="border-t border-line"><td className={td}>{k}</td><td className={td + " text-right"}>{x.requests}</td><td className={td + " text-right"}>{x.rps.toFixed(0)}</td><td className={td + " text-right"}>{x.p50_ms.toFixed(0)}</td><td className={td + " text-right"}>{x.p95_ms.toFixed(0)}</td><td className={td + " text-right"}>{x.p99_ms.toFixed(0)}</td><td className={td + " text-right " + (x.errors ? "text-hot" : "")}>{x.errors}</td></tr>)}</tbody></table></div>
          <p className="mt-2 text-xs text-mute">Typical, slow and slowest wait are in milliseconds.</p></Panel>
      </div>
      {r.extras && Object.keys(r.extras).length > 0 && <Panel title="Raw evidence from this test" note="The unedited extra measurements the test recorded."><pre className="thin-scroll max-h-72 overflow-auto text-xs text-mute">{JSON.stringify(r.extras, null, 1)}</pre></Panel>}
      {v && <Panel title="Independent re-check" note="A separate program re-did the maths from the raw records and compared."><ul className="space-y-1.5 text-sm">{v.checks.map((c: any, i: number) => <li key={i} className="flex items-start gap-2"><Verdict ok={c.ok} className="mt-0.5" /><span className={c.ok ? "text-ink/90" : "font-semibold text-hot"}>{c.name}</span></li>)}</ul></Panel>}
    </div>
  );
}

export default function FairnessTab() {
  const { data: list, reload } = usePoll(() => api<any[]>("/admin/experiments", { auth: "admin" }), 5000);
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [ra, setRa] = useState<any>(null); const [rb, setRb] = useState<any>(null);
  useEffect(() => { if (a) api(`/admin/experiments/${a}`, { auth: "admin" }).then(setRa); else setRa(null); }, [a]);
  useEffect(() => { if (b) api(`/admin/experiments/${b}`, { auth: "admin" }).then(setRb); else setRb(null); }, [b]);
  useEffect(() => { if (!a && list?.length) setA(list.find((x) => !x.name.includes("live FCFS"))?.id || list[0].id); }, [list, a]);
  return (
    <div className="space-y-6">
      <Explain title="What this proves" tone="gold" icon={Scale}>That Fair Drop gives bots no more than their fair share. Each recorded test sent a real crowd of people and bots at the live system. Afterwards, the very same recorded attempts were sold three ways: the old first-come way, a simple lottery, and Fair Drop. Every number and chart below is read from those recorded results. Nothing here is mocked or typed in.</Explain>
      <Panel className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div><Mono>Test to show</Mono><Select className="mt-1" value={a} onChange={(e) => setA(e.target.value)}><option value="">choose a test…</option>{(list || []).map((x) => <option key={x.id} value={x.id}>{x.name} · {fmtTime(x.created_at)}</option>)}</Select></div>
        <div><Mono>Compare with (optional)</Mono><Select className="mt-1" value={b} onChange={(e) => setB(e.target.value)}><option value="">nothing</option>{(list || []).map((x) => <option key={x.id} value={x.id}>{x.name} · {fmtTime(x.created_at)}</option>)}</Select></div>
        <Button variant="secondary" className="self-end" onClick={() => reload()}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </Panel>
      {!list && <Spinner label="Loading recorded tests…" />}
      {list && list.length === 0 && <Callout tone="warn">No tests recorded yet. Start one in the Test lab.</Callout>}
      {ra && rb && (
        <Panel title="Side by side" note="The two tests you picked, line by line.">
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr><th className={th}>Measure</th><th className={th}>{ra.meta.experiment} {ra.meta.tag}</th><th className={th}>{rb.meta.experiment} {rb.meta.tag}</th></tr></thead><tbody>
            {[["Real people", (r: any) => r.traffic.humans], ["Bot accounts", (r: any) => r.traffic.bot_identities], ["Requests sent", (r: any) => r.traffic.client_requests], ["Bot advantage, old way", (r: any) => f3(r.policies.fcfs?.bot_advantage_ratio ?? r.policies.fcfs_live?.bot_advantage_ratio)], ["Bot advantage, lottery", (r: any) => f3(r.policies.naive_expected?.bot_advantage_ratio)], ["Bot advantage, Fair Drop", (r: any) => f3(r.policies.fairdrop_expected?.bot_advantage_ratio)], ["A person's chance, old way", (r: any) => f3(r.policies.fcfs?.human_win_rate)], ["A person's chance, Fair Drop", (r: any) => f3(r.policies.fairdrop_expected?.human_win_rate)], ["Safety checks", (r: any) => (r.integrity?.ok ? "all zero" : `${r.integrity?.total_violations} problems`)]].map(([k, f]: any) => <tr key={k} className="border-t border-line"><td className={td + " text-mute"}>{k}</td><td className={td}>{f(ra)}</td><td className={td}>{f(rb)}</td></tr>)}</tbody></table></div></Panel>
      )}
      {ra && <ExperimentView r={ra} />}
    </div>
  );
}
