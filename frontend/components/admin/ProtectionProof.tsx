"use client";
// Proof, part 2: is the protection right (every decision re-judged), what each bot did, and old way vs new way.
import { useEffect, useState } from "react";
import { CircleAlert, Gavel, Swords } from "lucide-react";
import { api, usePoll } from "@/lib/api";
import { Badge, Callout, cn } from "@/components/ui";
import BotGlyph from "@/components/BotGlyph";
import { BOTS, BOT_CONTROL, BOT_ORDER, REASON, n } from "./botinfo";
import { Controls, Explain, Legend, Meter, Mono, NeedSale, Panel, PAL, TicketRule, Verdict, th, td, upTo, useMaxSeats, useDropPoll } from "./kit";

function useProt(dropId: string, drops: any[]) {
  const { data: prot } = useDropPoll(dropId, "protection", 3000);
  const isOld = drops.find((d) => d.id === dropId)?.mode === "fcfs";
  return { prot, isOld };
}

/** The scorecard: every decision is re-judged by a separate checker. */
export function RightOrWrong({ dropId, drops }: { dropId: string; drops: any[] }) {
  const { prot, isOld } = useProt(dropId, drops);
  if (!dropId) return <NeedSale />;
  const c = prot?.confusion?.all, ppl = prot?.people || {};
  const decided = c ? c.TP + c.TN + c.FP + c.FN : 0;
  const acc = decided ? ((c.TP + c.TN) / decided) * 100 : null;
  const cell = (v: number, label: string, mistake: boolean, hint: string) => (
    <div className={cn("rounded-[5px] border p-4", mistake ? (v ? "alarm border-hot bg-hot/15" : "border-line bg-panel2") : "border-lime/35 bg-lime/[.07]")}>
      <div className={cn("display num text-4xl", mistake ? (v ? "text-hot" : "text-mute") : "text-lime")}>{n(v)}</div>
      <div className={cn("mt-1 text-sm font-bold", mistake && v ? "text-hot" : "text-ink")}>{label}</div><div className="text-xs text-mute">{hint}</div>
    </div>
  );
  return (
    <div className="space-y-6">
      <Explain title="What this proves" tone="gold" icon={Gavel}>That the door&rsquo;s decisions were right. Every time the server let someone in or turned them away, a separate checker re-judged it using facts the server did not decide. We count the mistakes: a real person wrongly turned away, or a bot wrongly let in. Both should be zero.</Explain>
      <Panel title="Right and wrong decisions" right={acc !== null && <Badge tone={acc >= 99.9 ? "green" : acc >= 99 ? "amber" : "red"}>{acc.toFixed(2)}% of decisions correct</Badge>}
        note="The checker's verdict on every decision for the sale you picked. Each person passes two checks (get a ticket, then enter), so the correct &lsquo;let in&rsquo; count is about double the number of people let in; every refused bot request adds to the other correct count.">
        {!c ? <p className="text-sm text-mute">Nothing to judge yet. Pick a sale that has had traffic, or start a test in the Test lab.</p> : (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <div className="grid grid-cols-[100px_1fr_1fr] items-stretch gap-2">
                <div /><Mono className="self-end text-center">Server turned it away</Mono><Mono className="self-end text-center">Server let it in</Mono>
                <Mono className="self-center text-right">Should have been turned away</Mono>
                {cell(c.TP, "Correct", false, "bad request, stopped")}
                {cell(c.FN, "Mistake: bad let in", true, "a bot slipped through")}
                <Mono className="self-center text-right">Should have been let in</Mono>
                {cell(c.FP, "Mistake: good turned away", true, "a real person blocked")}
                {cell(c.TN, "Correct", false, "good request, let in")}
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-[5px] border border-line p-4"><Mono className="text-ice">Real people</Mono>
                  {ppl.human?.attempted ? <div className="mt-1.5 leading-relaxed">Tried: <b>{n(ppl.human.attempted)}</b> · got in: <b className="text-lime">{n(ppl.human.entered)}</b> · did not: <b className={ppl.human.not_entered ? "text-warn" : ""}>{n(ppl.human.not_entered)}</b>{ppl.human.delayed_then_entered ? <div className="mt-1 text-xs text-mute">{n(ppl.human.delayed_then_entered)} were asked to wait a second by the rate limit, retried, and got in.</div> : null}</div> : <div className="mt-1 text-mute">none labelled in this sale</div>}</div>
                <div className="rounded-[5px] border border-line p-4"><Mono>Slowed down, not blocked</Mono><div className="mt-1.5 leading-relaxed">{n(c.Throttled)} first tries were asked to wait a second. {n(c.Absorbed)} retries were recognised and did not create a second entry.</div></div>
              </div>
            </div>
            <div>
              <Mono>Were the rejections right? Each one re-checked.</Mono>
              <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px]">
                <thead><tr><th className={th}>Why it was turned away</th><th className={th + " text-right"}>Turned away</th><th className={th + " text-right"}>Confirmed right</th><th className={th + " text-right"}>Wrong</th><th className={th + " pl-4"}>How it was re-checked</th></tr></thead>
                <tbody>{Object.entries(prot.audit || {}).sort((a: any, b: any) => b[1].Rejected - a[1].Rejected).map(([k, v]: any) => (
                  <tr key={k} className="border-t border-line"><td className={td}>{REASON[k]?.[0] || k}</td><td className={td + " num text-right"}>{n(v.Rejected)}</td><td className={td + " num text-right text-lime"}>{n(v.Verified + (v.Unverifiable || 0))}</td><td className={cn(td, "num text-right", v.Wrong && "font-bold text-hot")}>{n(v.Wrong)}</td><td className={td + " pl-4 text-mute"}>{REASON[k]?.[1]}</td></tr>))}</tbody></table></div>
              {!Object.keys(prot.audit || {}).length && <p className="mt-2 text-sm text-mute">No rejections yet.</p>}
            </div>
            {isOld && <p className="text-sm text-mute">You are looking at the old way: it makes no mistakes by its own rules, but the rules are unfair to people.</p>}
          </div>)}
      </Panel>
    </div>
  );
}

/** One card per kind of bot: what it does, what it controls, what it never controls, and what happened. */
export function BotsTable({ dropId, drops }: { dropId: string; drops: any[] }) {
  const { prot, isOld } = useProt(dropId, drops);
  if (!dropId) return <NeedSale />;
  const c = prot?.confusion?.all, bp = prot?.by_profile || {};
  const wrong = (c?.FP || 0) + (c?.FN || 0);
  const ids = [...BOT_ORDER, "HUMAN"].filter((id) => bp[id]);
  return (
    <div className="space-y-6">
      <Explain title="What this shows" icon={Swords}>Every kind of bot in the test, what it tries, what it is in control of, what it can never control, and what happened to it. Real people are shown for comparison. Each card is one kind of bot; the numbers come from the sale you picked.</Explain>
      <div className="flex flex-wrap items-center gap-4"><Mono>Colour key</Mono><Legend items={[{ color: PAL.ice, label: "real person" }, { color: PAL.hot, label: "bot", shape: "diamond" }]} /><TicketRule old={isOld} /></div>
      {ids.length === 0 ? <Callout tone="info">No labelled test traffic in this sale yet. Start a bot attack in the Test lab and each kind of bot appears here.</Callout> : (
        <div className="grid gap-4 xl:grid-cols-2">{ids.map((id) => {
          const b = BOTS[id], r = bp[id], away = r.Rejected + r.Decoy, top = Object.entries(r.Reasons || {}).sort((x: any, y: any) => y[1] - x[1])[0] as any;
          const out: [string, string] = isOld && id !== "HUMAN" ? (r.Entered > 0 ? ["red", "grabbed seats: speed wins here"] : ["amber", "shut out"]) : id === "HUMAN" ? ["gray", isOld ? "most get 'sold out'" : "all get in"] : r.Entered === 0 && r.Identities > 0 ? ["green", "caught completely"] : id === "SYBIL_OPERATOR" ? ["red", "1 entry per bought account (not stoppable)"] : ["amber", "1 entry per account, cheating blocked"];
          // checked against the numbers: no account may hold more than one entry (the shortcut seeker must get none), and the judge found no mistakes
          const asExpected = (id === "API_SCRAPER" ? r.Entered === 0 : r.Entered <= r.Identities) && !wrong;
          return (
            <article key={id} className="panel p-5" style={{ borderTop: `3px solid ${b.color}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: b.color }}><BotGlyph id={id} size={20} />{b.name}</h3><Badge tone={out[0] as any}>{out[1]}</Badge></div>
              <p className="mt-2 text-sm leading-relaxed text-ink/90">{b.does}</p>
              {id !== "HUMAN" && b.stoppedBy && <p className="mt-1 text-sm leading-relaxed text-mute"><b className="text-ink/80">Why it fails:</b> {b.stoppedBy}</p>}
              <Controls className="mt-3 rounded-[4px] border border-line bg-panel2/60 p-3" ctl={BOT_CONTROL[id][0]} never={BOT_CONTROL[id][1]} />
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[["Accounts", n(r.Identities)], ["Got in", n(r.Entered)], ["Requests", n(r.Requests)], ["Turned away", n(away) + (r.Requests ? ` (${Math.round((away / r.Requests) * 100)}%)` : "")]].map(([l, v]) => <div key={l} className="rounded-[4px] border border-line bg-bg/50 p-2"><div className="display num text-xl">{v}</div><div className="text-xs text-mute">{l}</div></div>)}
              </div>
              <div className="mt-3 space-y-1 text-sm text-mute">
                <div>Main reason it was stopped: <b className="text-ink">{top ? `${REASON[top[0]]?.[0] || top[0]} (${n(top[1])} times)` : "none needed"}</b></div>
                <div className="flex items-start gap-2">We expected: {b.expect}{!isOld && id !== "HUMAN" && <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 font-semibold", asExpected ? "text-lime" : "text-hot")}><Verdict ok={asExpected} />{asExpected ? "as expected" : "NOT as expected"}</span>}</div>
              </div>
            </article>);
        })}</div>
      )}
      <p className="flex gap-2 text-sm text-mute"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><span><b className="text-ink/90">Honest limit:</b> a bot that owns many <i>genuinely verified</i> accounts (the identity farm) gets one entry per account, exactly like many different people would. Nothing in the entry flow can tell them apart; the defence is that each verified account costs real money. The cards show every other bot held to one entry per account.</span></p>
    </div>
  );
}

/** Old way vs simple lottery vs Fair Drop for the newest recorded test. */
export function Compare() {
  const cap = useMaxSeats();
  const { data: exps } = usePoll(() => api<any[]>("/admin/experiments", { auth: "admin" }), 6000);
  const last = (exps || []).find((e: any) => (e.name.includes("show_bot_zoo") || e.name.includes("custom_mix")) && !e.name.includes("live FCFS")) || (exps || []).find((e: any) => e.name.includes("exp2") && !e.name.includes("live FCFS"));
  const [full, setFull] = useState<any>(null);
  useEffect(() => { if (last) api(`/admin/experiments/${last.id}`, { auth: "admin" }).then(setFull).catch(() => {}); }, [last?.id]);
  const f = full?.policies;
  return (
    <Panel title="Old way vs simple lottery vs Fair Drop" note="The same crowd, three ways of selling the same seats (newest recorded test). If a coloured bar is much longer than the grey one, bots are getting more than their fair share.">
      {!f ? <p className="text-sm text-mute">Run a bot attack in the Test lab to see the comparison.</p> : (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-3">
            {([["Old way (first come first served)", f.fcfs, PAL.hot, `${upTo(cap)} per login`], ["Simple lottery", f.naive_expected, PAL.violet, "every request is a ticket"], ["Fair Drop", f.fairdrop_expected, PAL.gold, "1 login · 1 ticket · 1 seat at most"]] as [string, any, string, string][]).map(([name, p, col, rule]) => p && (
              <div key={name} className="rounded-[5px] border border-line bg-bg/50 p-4" style={{ borderTop: `3px solid ${col}` }}>
                <div className="font-bold" style={{ color: col }}>{name}</div><div className="mb-3 text-xs text-mute">{rule}</div>
                <Meter label="Bots end up with this share of seats" v={p.bot_seat_share} color={col} />
                <Meter label="Bots are only this share of the crowd" v={p.bot_identity_share} color={PAL.mute} />
                <Meter label="A real person's chance of a seat" v={p.human_win_rate} color={PAL.ice} max={Math.max(0.02, p.human_win_rate * 2)} />
              </div>))}
          </div>
          {full?.meta?.scenario?.description && <p className="text-sm text-mute">{full.meta.scenario.description}</p>}
        </div>)}
    </Panel>
  );
}
