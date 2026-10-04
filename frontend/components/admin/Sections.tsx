"use client";
// The seven places of the control room. Each opens with a title and a one-line "what you are looking at".
import { useState } from "react";
import { api, usePoll } from "@/lib/api";
import { Tabs } from "@/components/ui";
import LiveShow from "@/components/live/LiveShow";
import DropsTab from "./DropsTab";
import LiveTab from "./LiveTab";
import ServerHealth from "./ServerHealth";
import FairnessTab from "./FairnessTab";
import AuditTab from "./AuditTab";
import ControlRoom from "./ControlRoom";
import OverviewTab from "./OverviewTab";
import TestLabTab from "./TestLabTab";
import { AttackPanel, SafetyTests } from "./AttackPanel";
import BotLab from "./BotLab";
import HowItWorks from "./HowItWorks";
import TestsExplained, { Glossary } from "./TestsExplained";
import { BotsTable, Compare, RightOrWrong } from "./ProtectionProof";
import { NeedSale, SectionTitle, useDropPoll } from "./kit";

export type Ctx = {
  dropId: string; setDropId: (s: string) => void; pick: (s: string) => void; drops: any[]; running: boolean;
  go: (t: string) => void; pf: string; setPf: (s: string) => void; startFollow: () => void;
};

export function LiveSection({ ctx }: { ctx: Ctx }) {
  const [v, setV] = useState("show");
  return (
    <>
      <SectionTitle n="01" kicker="Live show" title="The doors, live" what="the whole booking as it happens: who is at the door, what the door checks, who gets a seat. The Detailed view adds exact per-second numbers." />
      <Tabs tabs={[{ id: "show", label: "The show" }, { id: "detail", label: "Detailed view" }]} value={v} onChange={setV} />
      {v === "show" ? <LiveShow embedded /> : <ControlRoom dropId={ctx.dropId} setDropId={ctx.pick} drops={ctx.drops} />}
    </>
  );
}

export function SaleSection({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <SectionTitle n="02" kicker="Run a sale" title="Run a sale" what="the stages of the selected sale, from not open to finished. You press one button to move to the next stage; below you can create new events and sales." />
      <DropsTab dropId={ctx.dropId} setDropId={ctx.setDropId} />
    </>
  );
}

export function ProofSection({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <SectionTitle n="03" kicker="Proof" title="Proof" what="evidence that the sale was fair and that nothing was tampered with. Each tab starts by saying what it proves." />
      <Tabs tabs={[{ id: "results", label: "Detailed results" }, { id: "right", label: "Right or wrong" }, { id: "bots", label: "The bots" }, { id: "audit", label: "Tamper checks" }]} value={ctx.pf} onChange={ctx.setPf} />
      {ctx.pf === "results" && <><Compare /><FairnessTab /></>}
      {ctx.pf === "right" && <RightOrWrong dropId={ctx.dropId} drops={ctx.drops} />}
      {ctx.pf === "bots" && <BotsTable dropId={ctx.dropId} drops={ctx.drops} />}
      {ctx.pf === "audit" && <AuditTab dropId={ctx.dropId} />}
    </>
  );
}

export function ServerSection({ ctx }: { ctx: Ctx }) {
  const [v, setV] = useState("health");
  return (
    <>
      <SectionTitle n="04" kicker="Server" title="The server" what="whether the website itself is coping: servers, waiting times, queues and databases, plus every counter the server keeps for the sale." />
      <Tabs tabs={[{ id: "health", label: "Health" }, { id: "counters", label: "Sale counters" }]} value={v} onChange={setV} />
      {v === "health" ? <ServerHealth dropId={ctx.dropId} /> : <LiveTab dropId={ctx.dropId} />}
    </>
  );
}

export function LabSection({ ctx }: { ctx: Ctx }) {
  const [v, setV] = useState("attack");
  const [msg, setMsg] = useState("");
  return (
    <>
      <SectionTitle n="05" kicker="Test lab" title="Test lab" what="where you attack your own system on purpose: send crowds and bots, try to break it, and use the developer tools. Test mode only." />
      <Tabs tabs={[{ id: "attack", label: "Bot attack" }, { id: "break", label: "Break-in tests" }, { id: "tools", label: "Tools" }]} value={v} onChange={setV} />
      {v === "attack" && <>
        <AttackPanel running={ctx.running} setDropId={ctx.setDropId} onStarted={ctx.startFollow} />
        <BotLab running={ctx.running} onStarted={(m) => { ctx.startFollow(); setMsg(m); }} />
        {msg && <p className="rounded-[5px] border border-lime/30 bg-lime/10 p-3 text-sm">{msg}</p>}
      </>}
      {v === "break" && <SafetyTests />}
      {v === "tools" && <TestLabTab dropId={ctx.dropId} />}
    </>
  );
}

export function SummarySection({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <SectionTitle n="06" kicker="Summary" title="Summary" what="the selected sale on one page: where it is, who is in it, whether it is healthy and honest, and how bots fared in the latest test." />
      <OverviewTab dropId={ctx.dropId} go={ctx.go} />
    </>
  );
}

export function GuideSection({ ctx }: { ctx: Ctx }) {
  const [v, setV] = useState("how");
  // the guide teaches the fair sale: if the old-way sale is the one being watched, show the newest fair sale's live numbers instead
  const cur = ctx.drops.find((d) => d.id === ctx.dropId);
  const fair = cur?.mode === "fcfs" ? ctx.drops.filter((d) => d.mode === "fairdrop").sort((x, y) => y.opens_at_ms - x.opens_at_ms)[0] : cur;
  const gid = fair?.id || ctx.dropId;
  const { data: pulse } = useDropPoll(gid, "pulse", 2000);
  const { data: prot } = useDropPoll(gid, "protection", 3000);
  return (
    <>
      <SectionTitle n="07" kicker="Guide" title="Guide" what="a plain-language manual: how a sale works, what each test means, and what every technical word stands for." />
      <Tabs tabs={[{ id: "how", label: "How it works" }, { id: "tests", label: "Tests and stages" }, { id: "words", label: "The words" }]} value={v} onChange={setV} />
      {v === "how" && gid !== ctx.dropId && <p className="rounded-[5px] border border-gold/30 bg-gold/[.06] p-3 text-sm text-ink/90">The sale you picked at the top is the old way, which has no draw. These steps show the newest <b>fair</b> sale instead (<span className="font-mono text-xs">{gid}</span>).</p>}
      {v === "how" && (gid ? <HowItWorks pulse={pulse} prot={prot} dropId={gid} isOld={fair?.mode === "fcfs"} /> : <NeedSale>The steps below light up with live numbers for the sale you pick in the bar at the top.</NeedSale>)}
      {v === "tests" && <TestsExplained />}
      {v === "words" && <Glossary />}
    </>
  );
}
