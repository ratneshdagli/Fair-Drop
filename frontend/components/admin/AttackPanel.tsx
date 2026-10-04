"use client";
// Test lab, part 1: send a crowd of people and bots at the sale; and the two "do we hold up?" checks.
import { useEffect, useState } from "react";
import { Bug, Play, RotateCcw, ShieldCheck, Siren } from "lucide-react";
import { api, testKey } from "@/lib/api";
import { Badge, Button, Callout, Led, cn } from "@/components/ui";
import { Explain, Mono, POPULATION, Panel, TicketRule, Verdict, th, td } from "./kit";
import { n } from "./botinfo";

// people = size x the test population (kit.POPULATION)
const SIZES: [string, string][] = [["0.05", "Tiny"], ["0.1", "Small"], ["0.3", "Medium"], ["1", "Full"]];
const hdr = () => ({ "X-Test-Key": testKey.get() });

export function AttackPanel({ running, setDropId, onStarted }: { running: boolean; setDropId: (s: string) => void; onStarted: () => void }) {
  const [size, setSize] = useState("0.1");
  const [guardOn, setGuardOn] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [armed, setArmed] = useState(false);
  const start = async () => {
    setMsg(null);
    try {
      await api("/test/config", { body: { guard: { enabled: guardOn } }, headers: hdr() });
      await api("/run", { method: "POST", base: "/attack", headers: hdr(), body: { experiment: "show", scale: +size, also_fcfs: true } });
      onStarted(); setMsg({ ok: true, t: "Started. First the fair sale runs (the new way), then the same crowd tries the old way (first come first served). Watch it in Live show." });
    } catch (e: any) { setMsg({ ok: false, t: "Could not start: " + (e.body?.detail || e.body?.error || e.message) }); }
  };
  const restart = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 8000); return; }
    setArmed(false); setRestarting(true); setMsg({ ok: true, t: "Stopping and clearing…" }); setDropId("");
    let cleared = 0, err = "";
    // stop the load generators (a failure must not skip the clearing), then clear; twice, because a dying run can create one last sale
    for (let i = 0; i < 2; i++) {
      try { await api("/stop", { method: "POST", base: "/attack", headers: hdr(), body: { forget: true } }); } catch (e: any) { err = "stop: " + (e.body?.error || e.message); }
      try { const r = await api<any>("/test/clear", { method: "POST", headers: hdr(), body: {} }); cleared += Number(r.sales_cleared) || 0; err = ""; } catch (e: any) { err = "clear: " + (e.body?.detail || e.body?.error || e.message); }
      if (i === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    setGuardOn(true); onStarted();
    setMsg(err ? { ok: false, t: "Could not fully clear (" + err + ")" } : { ok: true, t: `Everything stopped and cleared (${cleared} test sale(s) removed). Nothing is running, protection is ON. Press Start the attack to begin again.` });
    setRestarting(false);
  };
  return (
    <Panel title="Send a crowd at the sale" right={running ? <Badge tone="amber"><Led tone="warn" pulse />a test is running</Badge> : <Badge tone="gray">idle</Badge>}
      note="One press sends a crowd of normal people plus every kind of bot at two sales: first the fair one, then the old first-come-first-served one. You watch who gets in, live, in the Live show.">
      <div className="space-y-5">
        <div>
          <Mono>1 · How big a crowd?</Mono>
          <div role="radiogroup" aria-label="Crowd size" className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {SIZES.map(([v, name]) => (
              <button key={v} role="radio" aria-checked={size === v} onClick={() => setSize(v)} className={cn("rounded-[5px] border p-3 text-left transition", size === v ? "border-gold bg-gold/10 glow-gold" : "border-line hover:border-mute/60")}>
                <div className={cn("display text-2xl", size === v && "text-gold")}>{name}</div><div className="text-sm text-mute">{n(+v * POPULATION)} people</div>
              </button>))}
          </div>
        </div>
        <div>
          <Mono>2 · Protection</Mono>
          <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-[5px] border border-line p-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#ffc233]" checked={guardOn} onChange={(e) => setGuardOn(e.target.checked)} />
            <span className="text-sm"><b>Protection ON</b> <span className="text-mute">(the rate limit that keeps the site up). Untick to see the attack hit the app unprotected: who gets seats still doesn&rsquo;t change, because the draw never looks at speed.</span></span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={start} disabled={running}><Play className="h-5 w-5" />{running ? "Test running…" : "Start the attack"}</Button>
          <Button variant={armed ? "danger" : "secondary"} onClick={restart} disabled={restarting}><RotateCcw className="h-4 w-4" />{restarting ? "Clearing…" : armed ? "Click again: stop & wipe everything" : "Restart: clear everything"}</Button>
          <TicketRule />
        </div>
        {msg && <Callout tone={msg.ok ? "info" : "bad"}>{msg.t}</Callout>}
      </div>
    </Panel>
  );
}

/** "Quick safety check" (18 requests with known answers) and "Try to break it" (14 attacker tricks). */
export function SafetyTests() {
  const [st, setSt] = useState<any>(null); const [stBusy, setStBusy] = useState(false);
  const [rt, setRt] = useState<any>(null); const [rtBusy, setRtBusy] = useState(false); const [before, setBefore] = useState<any>(null);
  useEffect(() => { api("/redteam/before", { base: "/attack", headers: hdr() }).then(setBefore).catch(() => {}); }, []);
  const selftest = async () => { setStBusy(true); setSt(null); try { setSt(await api("/selftest", { method: "POST", base: "/attack", headers: hdr(), body: {} })); } catch (e: any) { setSt({ error: e.body?.error || e.message }); } setStBusy(false); };
  const redteam = async () => { setRtBusy(true); setRt(null); try { setRt(await api("/redteam", { method: "POST", base: "/attack", headers: hdr(), body: {} })); } catch (e: any) { setRt({ error: e.body?.error || e.message }); } setRtBusy(false); };
  return (
    <div className="space-y-6">
      <Explain title="What these two tests are" icon={ShieldCheck} tone="gold">Two quick ways to check the door works. The <b>safety check</b> sends requests where the right answer was written down first. <b>Try to break it</b> plays a bot owner trying real tricks. Anything that works is a hole we must close.</Explain>

      <Panel title="Quick safety check" right={<Button onClick={selftest} disabled={stBusy}><ShieldCheck className="h-4 w-4" />{stBusy ? "Checking…" : "Run the checks"}</Button>}
        note="Requests where we already know the right answer: an honest person, a retry, a fake ticket, a reused ticket, a late sign-up, a flood, a decoy.">
        {stBusy && <p className="flex items-center gap-2 text-sm text-mute"><Led tone="warn" pulse />Running a fresh mini-sale with honest people, forgers, a flood, a late arrival and a decoy…</p>}
        {st?.error && <Callout tone="bad">{st.error}</Callout>}
        {st?.total ? <div className="mb-3"><Badge tone={st.all_passed ? "green" : "red"}>{st.passed} of {st.total} behaved as expected</Badge></div> : null}
        {st?.cases && <div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr><th className={th} /><th className={th}>What we tried</th><th className={th}>What should happen</th><th className={th}>What happened</th></tr></thead>
          <tbody>{st.cases.map((x: any, i: number) => <tr key={i} className="border-t border-line"><td className={td + " w-8"}><Verdict ok={x.pass} /></td><td className={td}><b>{x.name}</b><div className="text-xs text-mute">{x.tried}</div></td><td className={td}>{x.expected}</td><td className={cn(td, !x.pass && "font-bold text-hot")}>{x.actual}</td></tr>)}</tbody></table></div>}
        {!st && !stBusy && <p className="text-sm text-mute">Not run yet.</p>}
      </Panel>

      <Panel title="Try to break it" right={<Button variant="danger" onClick={redteam} disabled={rtBusy}><Siren className="h-4 w-4" />{rtBusy ? "Trying…" : "Try the tricks"}</Button>}
        note="We play the bot owner and try every trick we can think of against our own system, then fix whatever works. Security people call this a red team.">
        {rtBusy && <p className="flex items-center gap-2 text-sm text-mute"><Led tone="warn" pulse />Trying different tricks on the live system…</p>}
        {rt?.error && <Callout tone="bad">{rt.error}</Callout>}
        <div className="mb-3 flex flex-wrap gap-2">
          {rt?.total ? <Badge tone={rt.all_held ? "green" : "red"}>{rt.held} stopped · {rt.broken} got through</Badge> : null}
          {before?.total ? <Badge tone="amber"><Bug className="h-3.5 w-3.5" />first full run: {before.broken} holes found, then fixed</Badge> : null}
        </div>
        {!rt && !rtBusy && before?.probes && <p className="mb-3 text-sm text-mute">Press the button to run them live. Below is what happened the first time we attacked it: that run found real holes, which we then closed.</p>}
        {(rt?.probes || before?.probes) ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr><th className={th} /><th className={th}>The trick</th><th className={th}>What the attacker wants</th><th className={th}>What we did</th><th className={th}>{rt ? "Result now" : "Result, first run (before our fixes)"}</th><th className={th}>First time</th></tr></thead>
            <tbody>{(rt?.probes || before.probes).map((p: any) => { const b = before?.probes?.find((x: any) => x.id === p.id); const bad = p.verdict === "BROKEN"; return (
              <tr key={p.id} className="border-t border-line">
                <td className={td + " w-8"}><Verdict ok={p.verdict === "held"} warn={!bad && p.verdict !== "held"} /></td>
                <td className={td + " font-bold"}>{p.title}</td><td className={td + " text-ink/80"}>{p.goal}</td><td className={td + " text-mute"}>{p.move}</td>
                <td className={td}><div className={bad ? "font-bold text-hot" : ""}>{p.result}</div><div className="text-xs text-mute">{p.why}</div></td>
                <td className={td}>{rt && b ? (b.verdict === "BROKEN" ? <Badge tone="red">was broken</Badge> : <Badge tone="green">held</Badge>) : <span className="text-mute">-</span>}</td>
              </tr>); })}</tbody></table></div>
        ) : !rtBusy && <p className="text-sm text-mute">Not run yet.</p>}
        <p className="mt-3 text-sm text-mute">The &ldquo;demo secret&rdquo; row works in this demo on purpose (it runs with published demo passwords); the server refuses to start with them outside demo mode.</p>
      </Panel>
    </div>
  );
}
