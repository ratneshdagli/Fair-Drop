"use client";
// Summary: the whole picture for the picked sale on one page.
import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { api, testKey, usePoll } from "@/lib/api";
import { Button, Callout, Select, Stat, StateBadge, Led } from "@/components/ui";
import { BACKEND_CONTROL, BACKEND_NOW, BACKEND_NOW_OLD } from "./botinfo";
import { Explain, Mono, NeedSale, POPULATION, Panel, TicketRule, useLive, useDropPoll } from "./kit";
import { n } from "./botinfo";

const STEP: Record<string, Record<string, [string, string]>> = {
  fairdrop: { SCHEDULED: ["OPEN", "Open the sale"], OPEN: ["CLOSED", "Stop letting people join"], CLOSED: ["LOCKED", "Seal and publish the entry list"], LOCKED: ["DRAWN", "Run the random draw"], DRAWN: ["CLAIM", "Let winners claim seats"], CLAIM: ["SETTLED", "Finish the sale"] },
  fcfs: { SCHEDULED: ["OPEN", "Open the sale"], OPEN: ["CLOSED", "Close the sale"], CLOSED: ["SETTLED", "Finish the sale"] },
};
const pct = (x: any) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export default function OverviewTab({ dropId, go }: { dropId: string; go: (t: string) => void }) {
  const { data: drops, reload } = usePoll(() => api<any[]>("/admin/drops", { auth: "admin" }), 3000);
  const { s } = useLive(dropId);
  const { data: integ } = useDropPoll(dropId, "integrity", 4000);
  const { data: exps } = usePoll(() => api<any[]>("/admin/experiments", { auth: "admin" }), 6000);
  const [last, setLast] = useState<any>(null);
  const latest = exps?.find((x) => !x.name.includes("live FCFS") && !x.name.includes("exp1") && !x.name.includes("exp6") && !x.name.includes("exp7"));
  useEffect(() => { if (latest) api(`/admin/experiments/${latest.id}`, { auth: "admin" }).then(setLast).catch(() => {}); }, [latest?.id]);

  const { data: runs } = usePoll(() => api<any[]>("/runs", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }), 3000);
  const running = runs?.find((r) => r.status === "running");
  const [msg, setMsg] = useState("");
  const [size, setSize] = useState("0.1");
  const startBots = async () => {
    setMsg("");
    try { await api("/run", { method: "POST", base: "/attack", headers: { "X-Test-Key": testKey.get() }, body: { experiment: "exp2", scale: +size, also_fcfs: true } }); setMsg("Started. Bots and people are now trying to enter. Their sale will appear in the Sale menu in a few seconds."); }
    catch (e: any) { setMsg("Could not start: " + (e.body?.detail || e.message)); }
  };
  const next = async () => {
    const d = drops?.find((x) => x.id === dropId); if (!d) return;
    const st = STEP[d.mode]?.[d.state]; if (!st) return;
    try { await api(`/admin/drops/${dropId}/advance`, { body: { to: st[0] }, auth: "admin" }); } catch (e: any) { setMsg(e.message); }
    reload();
  };

  const d = drops?.find((x) => x.id === dropId);
  const old = d?.mode === "fcfs";
  const step = d ? STEP[d.mode]?.[d.state] : undefined;
  const lab = s?.labels;
  const f = last?.policies;
  const bad = integ && !integ.ok;

  return (
    <div className="space-y-6">
      <Explain title="What this page is">The whole sale in one screen: where it is, who is in it, whether it is healthy and honest, and how bots fared in the latest test. Each section has a button that opens the full detail.</Explain>

      {!dropId ? <NeedSale /> : (<>
        <Panel title="1 · Where the sale is now" right={d && <span className="flex items-center gap-3"><TicketRule old={old} /><StateBadge state={d.state} /></span>}
          note={d ? (old ? BACKEND_NOW_OLD[d.state] : BACKEND_NOW[d.state]) : undefined}>
          {d && <p className="mb-4 text-sm text-ink/85"><Mono className="mr-2 text-gold">Who is in control</Mono>{BACKEND_CONTROL[d.state]}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {step ? <Button size="lg" onClick={next}>Next step: {step[1]}<ArrowRight className="h-5 w-5" /></Button> : <span className="text-sm text-mute">{d ? "This sale has reached its last stage." : "Reading the sale…"}</span>}
            <Button variant="secondary" onClick={() => go("drops")}>Open the full stage control</Button>
          </div>
        </Panel>

        {s && (<>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3"><h2 className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-gold">2 · Who is in this sale</h2><TicketRule old={old} /></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Asked to join" value={s.tokens_issued.toLocaleString()} sub="verified logins given a ticket" />
              <Stat label="In the draw" value={s.entries_registered.toLocaleString()} sub="entries completed" tone="gold" />
              <Stat label="Real people" value={lab ? lab.entries_human.toLocaleString() : "unknown"} sub={lab ? "from test labels" : "no test labels loaded"} tone="ok" />
              <Stat label="Bots" value={lab ? lab.entries_bot.toLocaleString() : "unknown"} sub={lab ? "from test labels" : "the system can't tell bots apart on its own"} tone={lab && lab.entries_bot > 0 ? "warn" : undefined} />
            </div>
            <p className="max-w-4xl text-sm text-mute">{s.seats_total} seats for sale. {lab && lab.entries_human + lab.entries_bot < s.entries_registered ? `Warning: the bot/people labels only cover ${(lab.entries_human + lab.entries_bot).toLocaleString()} of the ${s.entries_registered.toLocaleString()} entries, because labels are kept only for the most recent bot test. Pick that test's sale for exact counts. ` : ""}In a real sale no one knows who is a bot, which is why the draw ignores speed and request volume.</p>
          </section>
          <section className="space-y-3">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-gold">3 · Is the sale healthy and honest?</h2>
            {bad ? <Callout tone="bad" title="Problem found">The safety checks found {integ.total_violations} problem(s). Open Proof, then Tamper checks, to see what.</Callout>
              : <Callout tone="ok" title="All checks passed">No seat sold twice, no one entered twice, nothing missing from the sealed list.</Callout>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Web requests per second" value={s.rps == null ? "-" : Math.round(s.rps).toLocaleString()} sub="all traffic on all servers, every sale" />
              <Stat label="Slowest 1% wait" value={s.p99_ms > 0 ? `${s.p99_ms.toFixed(0)} ms` : "-"} sub="under 500 ms is good" tone={s.p99_ms > 500 ? "warn" : "ok"} />
              <Stat label="Servers running" value={`${s.replicas.filter((r: any) => r.healthy).length} of ${s.replicas.length}`} sub="if one stops, others take over" tone={s.replicas.some((r: any) => !r.healthy) ? "bad" : "ok"} />
              <Stat label="Blocked attempts" value={((s.counters?.rejected_reused || 0) + (s.counters?.rejected_bad_sig || 0) + (s.counters?.rejected_already_issued || 0)).toLocaleString()} sub="tried to enter twice or cheat" />
            </div>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => go("audit")}>Open the tamper checks</Button><Button size="sm" variant="secondary" onClick={() => go("live")}>Open the server details</Button></div>
          </section>
        </>)}
      </>)}

      <Panel title="Test it with bots" note="Sends a crowd of normal people plus bots (some hammering from thousands of fake addresses) at two sales: the usual first-come-first-served one, and ours. Then it shows who got the seats. For the full set of options use the Test lab.">
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label="Size of the test" value={size} onChange={(e) => setSize(e.target.value)} className="max-w-xs">{[["0.05", "Tiny"], ["0.1", "Small"], ["1", "Full"]].map(([v, name]) => <option key={v} value={v}>{name}: {n(+v * POPULATION)} people</option>)}</Select>
          <Button onClick={startBots} disabled={!!running}><Play className="h-4 w-4" />{running ? "Running…" : "Start the bots"}</Button>
          <Button variant="ghost" onClick={() => go("lab")}>More test options</Button>
        </div>
        {running && <p className="mt-3 flex items-center gap-2 text-sm text-warn"><Led tone="warn" pulse />A test is running. Watch the numbers above change; the top bar follows its newest sale.</p>}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </Panel>

      {f && (
        <Panel title="Who got the seats in the latest bot test?" note={last?.meta?.scenario?.description ? `Test: ${last.meta.scenario.description}` : "The newest recorded bot test."}>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Bots were this share of all people" value={pct(f.fairdrop_expected?.bot_identity_share)} />
            <Stat label="Old way gave bots" value={pct(f.fcfs?.bot_seat_share)} sub="of the seats" tone="bad" />
            <Stat label="Fair Drop gave bots" value={pct(f.fairdrop_expected?.bot_seat_share)} sub="of the seats" tone="gold" />
          </div>
          <p className="mt-3 text-sm">{f.fairdrop_expected?.bot_seat_share <= (f.fairdrop_expected?.bot_identity_share || 0) * 1.5
            ? "With Fair Drop, bots got about the same as their share of people, so being fast or sending lots of requests gave them nothing extra."
            : "Bots got more than their share. That is a problem worth investigating."}</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => go("fair")}>See the full charts</Button>
        </Panel>
      )}
    </div>
  );
}
