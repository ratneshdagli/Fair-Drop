"use client";
// Test lab, part 3: the developer tools (seed users, reset, rate limits, labels, dishonest server, experiments, run logs).
import { useEffect, useRef, useState } from "react";
import { Beaker, Check, Upload, X } from "lucide-react";
import { api, testKey, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Input, Label, Select, cn } from "@/components/ui";
import { Explain, POPULATION, Panel } from "./kit";

const EXPS: [string, string][] = [["exp1", "1 · Normal day: 50,000 people, no bots"], ["exp2", "2 · Proxy flood: 20 operators × 10 accounts, hopping addresses"], ["exp3", "3 · Identity farm growing: 100 / 1,000 / 10,000 accounts"],
  ["exp4", "4 · One human against ~50,000 bot requests"], ["exp5", "5 · Decoy trap: scrapers vs human-mimicking bots"], ["exp6", "6 · Kill a server mid-sale"], ["exp7", "7 · A dishonest server drops one entry"], ["all", "All seven"]];
const Note = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-relaxed text-mute">{children}</p>;
const mono = (s: React.ReactNode) => <span className="font-mono text-[13px] text-ink/90">{s}</span>;

export default function TestLabTab({ dropId }: { dropId: string }) {
  const [key, setKey] = useState(testKey.get());
  const H = () => ({ "X-Test-Key": key });
  const [log, setLog] = useState<{ ok: boolean; t: string }[]>([]);
  const say = (ok: boolean, t: string) => setLog((l) => [{ ok, t }, ...l].slice(0, 12));
  const T = async (label: string, path: string, body: any, method = "POST", base?: string) => {
    try { const r = await api<any>(path, { method, body, headers: H(), base }); say(true, `${label}: ${JSON.stringify(r).slice(0, 200)}`); return r; }
    catch (e: any) { say(false, `${label}: ${e.code || ""} ${e.body?.detail || e.message}`); }
  };
  const [count, setCount] = useState(50000);
  const [reset, setReset] = useState({ window_sec: 3600, claim_sec: 60 });
  const [guard, setGuard] = useState<{ enabled: boolean; ip_limit: number | ""; acct_limit: number | "" }>({ enabled: true, ip_limit: "", acct_limit: "" });
  // the limits the server is using right now (not a typed-in guess)
  useEffect(() => { api<any>("/admin/config", { auth: "admin" }).then((c) => setGuard({ enabled: !!c.guard?.Enabled, ip_limit: c.guard?.IPLimit ?? "", acct_limit: c.guard?.AcctLimit ?? "" })).catch(() => {}); }, []);
  const [mal, setMal] = useState({ user_id: "", receipt_id: "" });
  const [exp, setExp] = useState({ experiment: "exp2", scale: 0.1, also_fcfs: true });
  const file = useRef<HTMLInputElement>(null);
  const { data: runs } = usePoll(() => api<any[]>("/runs", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }), 3000);
  const [open, setOpen] = useState("");
  const { data: detail } = usePoll(() => (open ? api<any>(`/runs/${open}`, { base: "/attack", headers: { "X-Test-Key": testKey.get() } }) : Promise.resolve(null)), 2500, [open]);

  const demo = async () => {
    const adm = { auth: "admin" as const };
    try {
      const ev = await api<any>("/admin/events", { ...adm, body: { name: "Aurora Live 2026", venue: "Eden Arena", starts_at: new Date(Date.now() + 30 * 864e5).toISOString(), tiers: [{ name: "Gold", price_cents: 25000, seats: 100 }, { name: "Silver", price_cents: 15000, seats: 150 }, { name: "General", price_cents: 8000, seats: 250 }] } });
      const fd = await api<any>("/admin/drops", { ...adm, body: { event_id: ev.id, window_sec: 900, claim_sec: 45, cutoff_at: new Date(Date.now() + 3600e3).toISOString() } });
      const fc = await api<any>("/admin/drops", { ...adm, body: { event_id: ev.id, mode: "fcfs", window_sec: 900 } });
      say(true, `demo ready: Fair Drop sale ${fd.id} (new sign-ups for the next hour can enter) and old-way sale ${fc.id}`);
    } catch (e: any) { say(false, e.message); }
  };
  const upload = async (f: File) => {
    try { const j = JSON.parse(await f.text()); const labels = Array.isArray(j) ? j : j.labels; await T("labels", "/test/labels", { labels, replace: true }); } catch (e: any) { say(false, "labels file: " + e.message); }
  };

  return (
    <div className="space-y-6">
      <Explain title="Test mode only" tone="warn" icon={Beaker}>These developer tools exist only when the backend runs in test mode and the right test key is sent. They are not mounted in production (the server answers 404). They are for setting up and resetting demos.</Explain>
      <Panel className="grid items-end gap-4 md:grid-cols-[1fr_auto]">
        <div><Label>Test key</Label><Input value={key} onChange={(e) => { setKey(e.target.value); testKey.set(e.target.value); }} className="font-mono" /></div>
        <Button variant="secondary" onClick={demo}>One-click demo: event + fair sale + old-way sale</Button>
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Create test users" note={<>Makes verified test accounts ({mono("t_000001…")}) with no phones, no SMS and no real email.</>}>
          <div className="flex gap-2"><Input aria-label="How many users" type="number" value={count} onChange={(e) => setCount(+e.target.value)} /><Button onClick={() => T("seed", "/test/seed", { count })}>Create</Button></div></Panel>
        <Panel title="Reset the selected sale" note={<>Clears entries, tickets, draw, claims, rate limits and counters; makes a new draw secret and keys; keeps users and labels. Sale: {mono(dropId || "(pick one at the top)")}</>}>
          <div className="grid grid-cols-2 gap-3"><div><Label>Sale lasts (s)</Label><Input type="number" value={reset.window_sec} onChange={(e) => setReset({ ...reset, window_sec: +e.target.value })} /></div><div><Label>Claim time (s)</Label><Input type="number" value={reset.claim_sec} onChange={(e) => setReset({ ...reset, claim_sec: +e.target.value })} /></div></div>
          <Button className="mt-3" disabled={!dropId} onClick={() => T("reset", "/test/reset", { drop_id: dropId, state: "OPEN", ...reset })}>Reset and reopen</Button></Panel>
        <Panel title="Rate limits" note="Rate limits only keep the site up; the draw never sees them. Turn them off to watch the attack hit the app unprotected: who gets seats still doesn't change.">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#ffc233]" checked={guard.enabled} onChange={(e) => setGuard({ ...guard, enabled: e.target.checked })} />Rate limiting on</label>
          <div className="mt-3 grid grid-cols-2 gap-3"><div><Label>Per address, per second</Label><Input type="number" value={guard.ip_limit} placeholder="not available" onChange={(e) => setGuard({ ...guard, ip_limit: e.target.value === "" ? "" : +e.target.value })} /></div><div><Label>Per account, per second</Label><Input type="number" value={guard.acct_limit} placeholder="not available" onChange={(e) => setGuard({ ...guard, acct_limit: e.target.value === "" ? "" : +e.target.value })} /></div></div>
          <Button className="mt-3" onClick={() => T("guard", "/test/config", { guard: { enabled: guard.enabled, ...(guard.ip_limit !== "" && { ip_limit: guard.ip_limit }), ...(guard.acct_limit !== "" && { acct_limit: guard.acct_limit }) } })}>Apply</Button></Panel>
        <Panel title="Real person / bot labels" note={<>A JSON list of {mono("{user_id, kind: bot|human, operator_id}")}. Used only to judge results afterwards, never to decide who gets a seat.</>}>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><Button variant="secondary" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Upload a labels file</Button></Panel>
        <Panel title="Dishonest-server demo" note="The server secretly drops one chosen entry when the list is sealed, and does not log it. Give a receipt id, or the test user who owns it. Then seal the sale and open that person's check page: the missing entry is caught.">
          <div className="grid grid-cols-2 gap-3"><div><Label>Receipt id</Label><Input value={mal.receipt_id} onChange={(e) => setMal({ ...mal, receipt_id: e.target.value })} className="font-mono" /></div><div><Label>or user id</Label><Input value={mal.user_id} onChange={(e) => setMal({ ...mal, user_id: e.target.value })} className="font-mono" /></div></div>
          <div className="mt-3 flex gap-2"><Button variant="danger" disabled={!dropId} onClick={() => T("dishonest ON", "/test/malicious", { drop_id: dropId, enabled: true, ...mal })}>Turn on (drop 1 entry)</Button><Button variant="secondary" disabled={!dropId} onClick={() => T("dishonest OFF", "/test/malicious", { drop_id: dropId, enabled: false })}>Turn off</Button></div></Panel>
        <Panel title="Run one of the seven big experiments" note="Each writes a full report into the reports folder, and into Proof. The list describes the full-size (1.0) version of each; smaller sizes shrink the crowd.">
          <Select aria-label="Experiment" value={exp.experiment} onChange={(e) => setExp({ ...exp, experiment: e.target.value })}>{EXPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <div className="mt-3 grid grid-cols-2 items-end gap-3"><div><Label>Size (1.0 = {POPULATION.toLocaleString()} people)</Label><Input type="number" step="0.05" value={exp.scale} onChange={(e) => setExp({ ...exp, scale: +e.target.value })} /></div><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#ffc233]" checked={exp.also_fcfs} onChange={(e) => setExp({ ...exp, also_fcfs: e.target.checked })} />also run the old way live</label></div>
          <Button className="mt-3" onClick={async () => { const r = await T("run", "/run", exp, "POST", "/attack"); if (r?.id) setOpen(r.id); }}>Run the experiment</Button></Panel>
      </div>
      <Panel title="Attack engine runs" note="Every test the attack engine has run. Open one to read its log.">
        <div className="space-y-2">
          {(runs || []).slice(0, 8).map((r) => <div key={r.id} className={cn("flex items-center justify-between gap-3 rounded-[4px] border px-3 py-2.5", open === r.id ? "border-gold/50 bg-gold/[.05]" : "border-line")}><span className="font-mono text-xs">{r.id} · size {r.scale}</span><span className="flex items-center gap-2"><Badge tone={r.status === "running" ? "amber" : r.status === "done" ? "green" : "red"}>{r.status}</Badge><Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>Read log</Button></span></div>)}
          {!runs?.length && <p className="text-sm text-mute">No runs yet. If you expected some, check the attack service is up.</p>}
          {detail?.log && <pre className="thin-scroll max-h-64 overflow-auto rounded-[4px] border border-line bg-bg p-3 font-mono text-xs text-mute">{detail.log}</pre>}
        </div>
      </Panel>
      <Panel title="What you just did" note="Newest first. Lime worked, red failed.">
        {log.map((l, i) => <div key={i} className={cn("flex items-start gap-2 py-0.5 font-mono text-xs", l.ok ? "text-lime" : "text-hot")}>{l.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span className="break-all">{l.t}</span></div>)}
        {!log.length && <p className="text-sm text-mute">Nothing yet.</p>}
      </Panel>
    </div>
  );
}
