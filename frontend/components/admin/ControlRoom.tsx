"use client";
// Live show, "Detailed view": the dot picture of every decision at the door, with exact per-second numbers,
// the decision feed and a live "do the numbers add up?" check. (Attack buttons live in Test lab, server health in Server,
// scorecards in Proof: nothing was dropped, only moved.)
import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Radio, Scale } from "lucide-react";
import { api, usePoll } from "@/lib/api";
import { Callout, Led, Select, Stat, cn } from "@/components/ui";
import DotStage, { StageHandle } from "./DotStage";
import { saleLabel } from "./StatusBand";
import { BOTS, BOT_ORDER, n, reasonOf } from "./botinfo";
import { Explain, Legend, Mono, NeedSale, Panel, PAL, TicketRule, Verdict, axis, chartTip, clock, grid, upTo, useMaxSeats, useDropPoll } from "./kit";

// what one decision looks like in words
const sentence = (e: any) => {
  const who = e.k === "bot" ? `${BOTS[e.pf]?.name || "Bot"}` : e.k === "human" ? "A person" : "A visitor";
  const what: Record<string, string> = {
    "token/already_issued": "asked for a second ticket (refused)", "token/ineligible": "signed up too late (refused)", "token/closed": "came after the sale closed", "token/not_open": "came before the sale opened",
    "register/ok": "got into the draw", "register/replay": "retried (no second entry made)", "register/spent": "tried to reuse a used ticket", "register/closed": "came after the sale closed", "register/bad_sig": "sent a fake ticket",
    "tarpit/tarpit": "fell for the decoy trap", "buy/ok": "bought a seat", "buy/capped": "hit the per-account limit", "buy/soldout": "found it sold out",
    "limit/ip": "was slowed: too many clicks from one address", "limit/account": "was slowed: too many clicks from one account",
  };
  return `${who} ${what[e.s + "/" + e.o] || e.s + " " + e.o}`;
};
const dotColor = (v: string) => (v === "accepted" ? PAL.lime : v === "rejected" ? PAL.hot : v === "decoy" ? PAL.warn : PAL.mute);

export default function ControlRoom({ dropId, setDropId, drops }: { dropId: string; setDropId: (s: string) => void; drops: any[] }) {
  const stage = useRef<StageHandle>(null);
  const cap = useMaxSeats();
  const [feed, setFeed] = useState<any[]>([]);
  const [live, setLive] = useState({ active: 0, rps: 0, okps: 0, nops: 0 });
  const [hist, setHist] = useState<any[]>([]);
  const { data: prot } = useDropPoll(dropId, "protection", 3000);
  const { data: pulse } = useDropPoll(dropId, "pulse", 1500);

  // the newest test's two sales: AFTER (fair) and BEFORE (old way)
  const exp = drops.filter((d: any) => d.id.startsWith("exp-")).sort((a: any, b: any) => b.opens_at_ms - a.opens_at_ms);
  const fairD = exp.find((d: any) => d.mode === "fairdrop");
  const fcfsD = fairD ? drops.find((d: any) => d.id === fairD.id.replace("-fairdrop-", "-fcfs-")) : undefined;
  const drop = drops.find((d: any) => d.id === dropId);
  const isOld = drop?.mode === "fcfs";

  // decision feed -> dots, ticker, per-second chart
  useEffect(() => {
    stage.current?.reset(); setFeed([]); setHist([]); setLive({ active: 0, rps: 0, okps: 0, nops: 0 });
    if (!dropId) return;
    let cursor = "", alive = true, first = true;
    const tick = async () => {
      try {
        const r = await api<any>(`/admin/drops/${dropId}/feed${cursor ? "?after=" + cursor : ""}`, { auth: "admin" });
        if (!alive) return;
        cursor = r.cursor || cursor;
        const evs: any[] = r.events || [];
        if (!first) stage.current?.push(evs.map((e) => ({ ...e, r: reasonOf(e.s, e.o) })));          // on a reload, start calm: exact numbers come from the scorecard
        const p = r.per_sec_3s || {};
        const sum = (vs: string[]) => ["human", "bot", "unknown"].reduce((a, k) => a + vs.reduce((b, v) => b + (p[k + "/" + v] || 0), 0), 0);
        setLive({ active: r.active_users_3s, rps: p.all || 0, okps: sum(["accepted"]), nops: sum(["rejected", "decoy"]) });
        setHist((h) => [...h.slice(-59), { t: Date.now(), "people let in": +(p["human/accepted"] || 0).toFixed(1), "bots let in": +(p["bot/accepted"] || 0).toFixed(1), "people turned away": +(p["human/rejected"] || 0).toFixed(1), "bot requests turned away": +((p["bot/rejected"] || 0) + (p["bot/decoy"] || 0)).toFixed(1) }]);
        if (!first && evs.length) setFeed((f) => [...evs.slice(-12).reverse(), ...f].slice(0, 12));
        first = false;
      } catch { /* keep polling */ }
    };
    tick(); const t = setInterval(tick, 500);
    return () => { alive = false; clearInterval(t); };
  }, [dropId]);

  // exact numbers from the scorecard
  const c = prot?.confusion?.all, ch = prot?.confusion?.human;
  const rq = prot?.requests_by_kind || {};
  const sum = (v: string) => ["human", "bot", "unknown"].reduce((a, k) => a + (rq[k]?.[v] || 0), 0);
  const counts = { ok: sum("accepted"), no: sum("rejected"), decoy: sum("decoy") };
  const ppl = prot?.people || {};
  const bp = prot?.by_profile || {};
  const wrong = (c?.FP || 0) + (c?.FN || 0);
  const decided = c ? c.TP + c.TN + c.FP + c.FN : 0;
  const lanes: Record<string, { entered: number; blocked: number }> = {};
  [...BOT_ORDER, "HUMAN"].forEach((id) => { if (bp[id]) lanes[id] = { entered: bp[id].Entered, blocked: bp[id].Rejected + bp[id].Decoy }; });
  const humanSold = bp.HUMAN?.Reasons?.sold_out || 0;
  const botIn = ppl.bot?.entered || 0, botAcc = ppl.bot?.attempted || 0, botBlocked = (rq.bot?.rejected || 0) + (rq.bot?.decoy || 0);

  if (!dropId) return <NeedSale />;
  return (
    <div className="space-y-6">
      <Explain title="What this shows" icon={Radio}>Every dot is one decision the door made. Dots start on the left in the colour of who they are, reach the gold line (the door), and turn the colour of what the door decided. The big numbers are exact; when it is very busy only a sample of dots is drawn.</Explain>

      <div className="flex flex-wrap items-center gap-3">
        <Mono>Watching</Mono>
        <button onClick={() => fairD && setDropId(fairD.id)} disabled={!fairD} className={cn("rounded-[4px] border px-3 py-2 text-sm font-semibold transition disabled:opacity-40", drop && !isOld ? "border-gold bg-gold/10 text-gold" : "border-line text-mute hover:text-ink")}>Fair sale (new way)</button>
        <button onClick={() => fcfsD && setDropId(fcfsD.id)} disabled={!fcfsD} className={cn("rounded-[4px] border px-3 py-2 text-sm font-semibold transition disabled:opacity-40", isOld ? "border-hot bg-hot/10 text-hot" : "border-line text-mute hover:text-ink")}>Old way (first come)</button>
        <Select aria-label="Another sale" className="max-w-[260px]" value={drops.some((d: any) => d.id === dropId) ? dropId : ""} onChange={(e) => setDropId(e.target.value)}><option value="">Another sale…</option>{drops.map((d: any) => <option key={d.id} value={d.id}>{saleLabel(d)}</option>)}</Select>
        <TicketRule old={isOld} className="ml-auto" />
      </div>

      {/* narrator + verdict banner */}
      <p className="flex items-center gap-3 rounded-[5px] border border-line bg-panel2/60 px-4 py-3 text-[15px]"><Led tone={live.rps > 0 ? "lime" : "mute"} pulse={live.rps > 0} />
        {live.rps > 0 ? <span><b>{n(live.active)}</b> {live.active === 1 ? "visitor is" : "visitors are"} on the site right now. The door is letting in <b className="text-lime">{n(Math.round(live.okps))}</b> and turning away <b className="text-hot">{n(Math.round(live.nops))}</b> requests every second.</span> : <span className="text-mute">Quiet at the door right now. Start a test in the Test lab, or open a sale and let people join.</span>}</p>
      {!prot || !decided ? null
        : wrong > 0 ? <Callout tone="bad" title={`The protection made ${wrong} mistake${wrong > 1 ? "s" : ""}`}>{c.FP ? `${c.FP} good request(s) were wrongly turned away. ` : ""}{c.FN ? `${c.FN} bad request(s) were wrongly let in. ` : ""}See Proof, then Right or wrong, for exactly which.</Callout>
          : isOld ? <Callout tone="warn" title="You are watching the old way (first come first served)">It made no mistakes, but it is unfair: only <b>{n(ppl.human?.entered)}</b> of <b>{n(ppl.human?.attempted)}</b> real people got a seat. The other <b>{n(ppl.human?.not_entered)}</b> were told &ldquo;sold out&rdquo;: whoever&rsquo;s click lands first wins in this sale.</Callout>
            : <Callout tone="ok" title="The protection is working">{n(decided)} decisions were re-checked by an independent judge: <b>0 mistakes</b>. <b>{n(ppl.human?.entered)} of {n(ppl.human?.attempted)}</b> real people got into the draw. <b>{n(botAcc)}</b> bot accounts took part and got <b>{n(botIn)}</b> entries (one each, the most any account can get). <b>{n(botBlocked)}</b> bot requests were turned away.</Callout>}

      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Visitors now" value={n(live.active)} sub="different accounts, last 3 seconds" />
          <Stat label="Decisions per second" value={n(Math.round(live.rps))} sub="requests the door ruled on, last 3 seconds" />
          <Stat label="Let in per second" value={n(Math.round(live.okps))} tone="ok" sub="lime dots" />
          <Stat label="Turned away per second" value={n(Math.round(live.nops))} tone="bad" sub="red dots" />
          <Stat label={isOld ? "Real people with a seat" : "Real people in the draw"} value={`${n(ppl.human?.entered)} of ${n(ppl.human?.attempted)}`} tone={isOld ? "warn" : "ok"} sub={isOld ? "the old way tells most 'sold out'" : "everyone eligible gets in, then the draw decides"} />
          <Stat label="Bot accounts that got in" value={`${n(botIn)} of ${n(botAcc)}`} tone="warn" sub={isOld ? `these accounts bought ${n(rq.bot?.accepted || 0)} seats: the old way lets one login buy ${upTo(cap)}` : "one entry each at most; extra tries blocked"} />
          <Stat label="Bot requests turned away" value={n(botBlocked)} tone="ok" sub="cheating attempts stopped" />
          {isOld ? <Stat label="People told sold out" value={n(humanSold)} tone="warn" sub="the old way's unfairness" /> : <Stat label="Real people wrongly turned away" value={n(ch?.FP || 0)} tone={ch?.FP ? "bad" : "ok"} sub="should always be 0" />}
        </div>
      </section>

      <Panel title="Every decision at the door" note="Left: who is knocking (real people on top, then each kind of bot). Middle: the door. Right: where they end up."
        right={<Legend items={[{ color: PAL.ice, label: "real person" }, { color: PAL.hot, label: "bot", shape: "diamond" }, { color: PAL.lime, label: "let in" }, { color: PAL.hot, label: "turned away" }, { color: PAL.warn, label: "caught by decoy" }]} />}>
        <DotStage ref={stage} counts={counts} lanes={lanes} seats={pulse?.tickets?.total} />
        <p className="mt-2 text-sm text-mute">A circle is a person, a diamond is a bot. Dots change colour at the door.</p>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Let in, per second" note="Real people and bots the door let in.">
            <ResponsiveContainer width="100%" height={190}><AreaChart data={hist}><CartesianGrid {...grid} /><XAxis dataKey="t" tickFormatter={clock} {...axis} /><YAxis {...axis} /><Tooltip {...chartTip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} />
              <Area type="monotone" stackId="1" dataKey="people let in" stroke={PAL.ice} fill={PAL.ice + "44"} /><Area type="monotone" stackId="1" dataKey="bots let in" stroke={PAL.hot} fill={PAL.hot + "44"} /></AreaChart></ResponsiveContainer>
            <Legend className="mt-2" items={[{ color: PAL.ice, label: "people", shape: "bar" }, { color: PAL.hot, label: "bots", shape: "bar" }]} /></Panel>
          <Panel title="Turned away, per second" note="Requests the door refused on purpose.">
            <ResponsiveContainer width="100%" height={190}><AreaChart data={hist}><CartesianGrid {...grid} /><XAxis dataKey="t" tickFormatter={clock} {...axis} /><YAxis {...axis} /><Tooltip {...chartTip} labelFormatter={(v) => new Date(v as number).toLocaleTimeString()} />
              <Area type="monotone" stackId="2" dataKey="people turned away" stroke={PAL.ice} fill={PAL.ice + "44"} /><Area type="monotone" stackId="2" dataKey="bot requests turned away" stroke={PAL.hot} fill={PAL.hot + "44"} /></AreaChart></ResponsiveContainer>
            <Legend className="mt-2" items={[{ color: PAL.ice, label: "people", shape: "bar" }, { color: PAL.hot, label: "bots", shape: "bar" }]} /></Panel>
        </div>
        <Panel title="What just happened" note="The newest decisions, in words.">
          <ul className="space-y-1.5 text-sm">{feed.map((e) => <li key={e.id} className="flex items-start gap-2"><i className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(e.v), boxShadow: `0 0 8px ${dotColor(e.v)}` }} /><span className="text-ink/90">{sentence(e)}</span></li>)}{!feed.length && <li className="text-mute">Waiting for activity…</li>}</ul></Panel>
      </div>

      {c && ppl.human && (() => {
        const att = (ppl.human.attempted || 0) + (ppl.bot?.attempted || 0), inn = (ppl.human.entered || 0) + (ppl.bot?.entered || 0), out = (ppl.human.not_entered || 0) + (ppl.bot?.not_entered || 0);
        const dec = (c.TP || 0) + (c.TN || 0) + (c.FP || 0) + (c.FN || 0) + (c.Absorbed || 0) + (c.Throttled || 0);
        const laneSum = Object.values(bp).reduce((a: number, v: any) => a + (v.Entered || 0), 0);
        const rows: [string, boolean, string][] = [
          ["Everyone is counted once: in + not in = all accounts", inn + out === att, `${n(inn)} + ${n(out)} = ${n(att)}`],
          ["The bot lanes add up to the people and bots who got in", laneSum === inn, `lanes ${n(laneSum)} · total ${n(inn)}`],
          ["Every decision is graded by the judge", dec === (prot?.decisions || 0), `${n(dec)} graded of ${n(prot?.decisions || 0)} recorded`],
          ["No real person was wrongly turned away", (c.FP || 0) === 0 || isOld, `${n(ch?.FP || 0)} people, ${n(c.FP || 0)} requests`],
        ];
        return (
          <Panel title="Do the numbers add up?" right={<Scale className="h-4 w-4 text-mute" />} note="Four live cross-checks for the sale you are watching. If one fails, the screens disagree with each other.">
            <ul className="space-y-2">{rows.map(([t, ok, d]) => <li key={t} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"><Verdict ok={ok} /><span>{t}</span><span className="font-mono text-xs text-mute">{d}</span></li>)}</ul>
            <p className="mt-3 text-sm text-mute">Accounts and seats differ in the old way: one login can buy {upTo(cap)}, so seats can be more than accounts.</p>
          </Panel>);
      })()}
    </div>
  );
}
