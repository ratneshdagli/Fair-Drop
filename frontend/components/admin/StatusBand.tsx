"use client";
// The always-visible top band: which sale, what stage, how many are in, how busy, is it honest.
import { useRef } from "react";
import { LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, usePoll } from "@/lib/api";
import { Button, Counter, Led, Select, StateBadge, cn, stageName } from "@/components/ui";
import { Mono, TicketRule, useDropPoll } from "./kit";
import { BACKEND_CONTROL, BACKEND_NOW, BACKEND_NOW_OLD } from "./botinfo";

export const saleLabel = (d: any) => `${String(d.event_name).replace("Fair Drop Experiment: ", "Bot test: ")} · ${d.mode === "fcfs" ? "old way" : "fair sale"} · ${stageName(d.state)} · #${String(d.id).slice(-6)}`;

function Read({ label, caption, children }: { label: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="xl:min-w-[104px]">
      <Mono>{label}</Mono>
      <div className="flex items-center gap-2 leading-none">{children}</div>
      <div className="mt-0.5 hidden text-xs text-mute xl:block">{caption}</div>
    </div>
  );
}

export default function StatusBand({ drops, dropId, onPick, onSignOut }: { drops: any[] | null; dropId: string; onPick: (id: string) => void; onSignOut: () => void }) {
  const drop = drops?.find((d) => d.id === dropId);
  const { data: pulse } = useDropPoll(dropId, "pulse", 2000);
  const { data: integ } = useDropPoll(dropId, "integrity", 4000);
  // requests per second: read only the newest slice of the decision feed (same call the detailed view uses)
  const cursor = useRef({ id: "", c: "" });
  const { data: rpsRaw } = usePoll(async () => {
    if (!dropId) return null;
    if (cursor.current.id !== dropId) cursor.current = { id: dropId, c: "" };
    const r = await api<any>(`/admin/drops/${dropId}/feed${cursor.current.c ? "?after=" + cursor.current.c : ""}`, { auth: "admin" });
    cursor.current.c = r.cursor || cursor.current.c;
    return { id: dropId, v: (r.per_sec_3s?.all || 0) as number };
  }, 2000, [dropId]);
  const rps = rpsRaw && rpsRaw.id === dropId ? rpsRaw.v : null;   // never show the previous sale's rate under a new sale

  const state: string | undefined = pulse?.state || drop?.state;
  const old = (pulse?.mode || drop?.mode) === "fcfs";
  const entries = old ? pulse?.tickets?.sold : pulse?.flow?.entries;
  const bad = integ && !integ.ok;

  return (
    <div className="sticky top-14 z-40 -mx-4 border-b border-line bg-bg/85 px-4 backdrop-blur-xl md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5 xl:gap-x-8">
        <div className="min-w-[200px] max-w-[360px] flex-1">
          <Mono>Sale being watched</Mono>
          <Select aria-label="Sale being watched" value={drops?.some((d) => d.id === dropId) ? dropId : ""} onChange={(e) => onPick(e.target.value)} className="mt-1">
            <option value="">{drops?.length ? "Choose a sale…" : "No sales yet"}</option>
            {(drops || []).map((d) => <option key={d.id} value={d.id}>{saleLabel(d)}</option>)}
          </Select>
        </div>
        <Read label="Stage" caption={state ? (old ? "old way (first come)" : "fair sale") : "pick a sale"}>
          {state ? <><StateBadge state={state} /><Led tone={state === "OPEN" ? "lime" : state === "SETTLED" ? "mute" : "gold"} pulse={state === "OPEN"} /></> : <span className="text-mute">none</span>}
        </Read>
        <Read label={old ? "Seats sold" : "Entries so far"} caption={old ? "bought in the old way" : "people in the draw"}>
          <span className="display num text-3xl text-gold">{entries == null ? "-" : <Counter value={entries} />}</span>
        </Read>
        <Read label="Decisions per second" caption="door decisions for this sale, last 3 s">
          <span className="display num text-3xl">{rps == null ? "-" : <Counter value={Math.round(rps)} />}</span>
        </Read>
        <Read label="Integrity" caption={integ ? (bad ? "something is wrong, see Proof" : "all safety counts are zero") : dropId ? "checking…" : "no sale picked"}>
          {integ ? (bad
            ? <span role="alert" className="alarm inline-flex items-center gap-2 rounded-[3px] border border-hot bg-hot/15 px-2.5 py-1 font-mono text-sm font-bold uppercase text-hot"><ShieldAlert className="h-4 w-4" />{integ.total_violations} problem{integ.total_violations === 1 ? "" : "s"}</span>
            : <span className="inline-flex items-center gap-2 rounded-[3px] border border-lime/35 bg-lime/10 px-2.5 py-1 font-mono text-sm font-bold uppercase text-lime"><ShieldCheck className="h-4 w-4" />Clean</span>)
            : <span className="text-mute">-</span>}
        </Read>
        <Button variant="ghost" size="sm" className={cn("ml-auto")} onClick={onSignOut}><LogOut className="h-4 w-4" />Sign out</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-line/70 py-2">
        <TicketRule old={old} />
        {state ? (
          <p className="min-w-0 flex-1 basis-[420px] text-[13px] leading-snug text-ink/90">
            <Mono className="mr-2 text-gold">What the backend is doing now</Mono>{(old ? BACKEND_NOW_OLD[state] : BACKEND_NOW[state]) || BACKEND_NOW[state]}
            <span className="ml-2 text-mute">Who is in control: <span className="text-ink/90">{BACKEND_CONTROL[state]}</span></span>
          </p>
        ) : <p className="text-[13px] text-mute">Pick a sale to see what the backend is doing for it right now.</p>}
      </div>
    </div>
  );
}
