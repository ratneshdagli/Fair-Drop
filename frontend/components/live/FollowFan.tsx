"use client";
// FOLLOW ONE PERSON: the booking made visible for ONE account at a time, drawn as a ticket-stub timeline of its real recorded events.
// Sample accounts come from the live feed (and, for a kind that has been quiet, from its recorded history). Only what is in the data is shown.
import { useEffect, useMemo, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import type { Arena, LiveEvent } from "@/lib/arena";
import { BOTS, BOT_ORDER } from "@/components/admin/botinfo";
import BotGlyph from "@/components/BotGlyph";
import { Button, Eyebrow, SectionHead, cn } from "@/components/ui";
import { MODE_TAG, clock, kindName, shortId, stationName, tms, verdictColor, verdictWords } from "./botText";

const ORDER = ["HUMAN", ...BOT_ORDER];
const MAX_SEEN = 6000;
const isHuman = (e: LiveEvent) => e.pf === "HUMAN" || e.k === "human";
const inKind = (e: LiveEvent, kind: string) => (kind === "HUMAN" ? isHuman(e) : e.pf === kind);

type Step = { e: LiveEvent; last: LiveEvent; count: number; extra: string };

/** an "extra try": asking for more than the one ticket / entry a login is allowed, or clicking past the old way's limit */
function extraOf(e: LiveEvent, entered: boolean): string {
  const k = e.s + "/" + e.o;
  if (e.mode === "fairdrop") {
    if (k === "token/already_issued" || k === "register/spent" || k === "register/replay") return "extra try: refused";
    if (entered && (e.s === "token" || e.s === "register") && e.v !== "accepted") return "extra try: refused";
    if (e.s === "limit" && e.v !== "accepted") return "extra try: slowed down";
  } else if (k === "buy/capped") return "extra try: refused (4-seat limit)";
  return "";
}

/** merge runs of the same step into one line ("x12") so a hammering bot does not bury the story */
function steps(evs: LiveEvent[]): Step[] {
  const out: Step[] = [];
  let entered = false;
  for (const e of evs) {
    const extra = extraOf(e, entered);
    if (e.s === "register" && e.o === "ok") entered = true;
    const p = out[out.length - 1];
    if (p && p.e.s === e.s && p.e.o === e.o && p.e.v === e.v && p.extra === extra) { p.count++; p.last = e; } else out.push({ e, last: e, count: 1, extra });
  }
  return out;
}

function Column({ mode, evs, other }: { mode: LiveEvent["mode"]; evs: LiveEvent[]; other: boolean }) {
  const m = MODE_TAG[mode];
  const st = useMemo(() => steps(evs), [evs]);
  const rule = mode === "fairdrop" ? "This login can get 1 entry." : "This login can buy up to 4 seats.";
  return (
    <div className="panel overflow-hidden">
      <div className="h-1.5" style={{ background: m.c }} />
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="display text-2xl" style={{ color: m.c }}>{mode === "fairdrop" ? "Fair Drop" : "Old way"}</div>
          <div className="font-mono text-[11px] uppercase tracking-[.14em] text-mute">{mode === "fairdrop" ? "ticket, then the draw" : "first click wins"}</div>
        </div>
        <p className="mt-1 text-[13px] font-semibold text-ink">{rule}</p>
        <hr className="perf my-3" />
        {st.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-line p-3 text-[13px] text-mute">{other ? `This account has no recorded moves in the ${mode === "fairdrop" ? "Fair Drop" : "old-way"} sale yet.` : "No recorded moves yet."}</p>
        ) : (
          <div className="thin-scroll max-h-[560px] overflow-y-auto pr-1"><ol className="relative ml-2 space-y-2 border-l-2 border-dashed border-line pl-5">
            {st.map((s, i) => {
              const c = verdictColor(s.e.v);
              return (
                <li key={s.e.id + i} className="relative">
                  <i className="led absolute -left-[27px] top-3.5" style={{ color: c }} aria-hidden />
                  <div className={cn("rounded-[4px] border bg-panel2 px-3 py-2", s.extra ? "border-hot/40" : "border-line")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold">{stationName(s.e.s)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-mute">{clock(s.e.t)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ color: c }}>
                      <span>{verdictWords(s.e)}</span>
                      {s.count > 1 && <span className="font-mono text-[11px] text-mute">x{s.count}, until {clock(s.last.t)}</span>}
                      {s.extra && <span className="rounded-[3px] border border-hot/40 bg-hot/10 px-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-hot">{s.extra}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol></div>
        )}
      </div>
    </div>
  );
}

export default function FollowFan({ a }: { a: Arena }) {
  const kinds = useMemo(() => ORDER.filter((id) => a.profiles.some((p) => p.id === id)), [a.profiles]);
  const [kind, setKind] = useState("HUMAN");
  const cur = kinds.includes(kind) ? kind : kinds[0] || "HUMAN";
  const [pick, setPick] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, LiveEvent[]>>({});

  // quiet kinds fall out of the short live list: fetch the last recorded actions of the chosen kind once, so there is always someone to follow
  useEffect(() => { setExtra({}); setPick({}); }, [a.fairId, a.running?.id]);
  useEffect(() => {
    if (!cur || !a.fairId || extra[cur]) return;
    let alive = true;
    (async () => {
      const got: LiveEvent[] = [];
      for (const [id, mode] of [[a.fairId, "fairdrop"], [a.oldId, "fcfs"]] as const) {
        if (!id) continue;
        try { const r = await api<any>(`/admin/drops/${id}/feed?pf=${cur}`, { auth: "admin" }); got.push(...(r.events || []).map((e: any) => ({ ...e, mode }))); } catch { /* ignore */ }
      }
      if (alive) setExtra((x) => ({ ...x, [cur]: got }));
    })();
    return () => { alive = false; };
  }, [cur, a.fairId, a.oldId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // remember every event seen, so an account stays followable after it scrolls out of the live list
  const seen = useRef<{ drop: string; m: Map<string, LiveEvent> }>({ drop: "", m: new Map() });
  const pool = useMemo(() => {
    if (seen.current.drop !== a.fairId) seen.current = { drop: a.fairId, m: new Map() };
    const m = seen.current.m;
    for (const e of [...a.events, ...(extra[cur] || [])]) m.set(e.mode + e.id, e);
    if (m.size > MAX_SEEN) { const keep = [...m.entries()].slice(-MAX_SEEN); m.clear(); keep.forEach(([k, v]) => m.set(k, v)); }
    return [...m.values()];
  }, [a.events, extra, cur, a.fairId]);

  // accounts of this kind, the most interesting first: seen in both sales, then the most moves
  const cands = useMemo(() => {
    const g = new Map<string, { id: string; n: number; modes: Set<string> }>();
    for (const e of pool) if (inKind(e, cur) && e.a) { const x = g.get(e.a) || { id: e.a, n: 0, modes: new Set() }; x.n++; x.modes.add(e.mode); g.set(e.a, x); }
    return [...g.values()].sort((x, y) => y.modes.size - x.modes.size || y.n - x.n);
  }, [pool, cur]);
  useEffect(() => { if (!pick[cur] && cands[0]) setPick((p) => ({ ...p, [cur]: cands[0].id })); }, [cur, cands, pick]);
  const acct = pick[cur] && cands.some((c) => c.id === pick[cur]) ? pick[cur] : cands[0]?.id || "";
  const next = () => {
    const i = cands.findIndex((c) => c.id === acct);
    const n = cands[(i + 1) % cands.length];
    if (n) setPick((p) => ({ ...p, [cur]: n.id }));
  };

  const mine = useMemo(() => pool.filter((e) => e.a === acct).sort((x, y) => tms(x.t) - tms(y.t) || (x.id < y.id ? -1 : 1)), [pool, acct]);
  const fair = mine.filter((e) => e.mode === "fairdrop"), old = mine.filter((e) => e.mode === "fcfs");
  const both = fair.length > 0 && old.length > 0;
  const human = cur === "HUMAN";
  const b = BOTS[cur];

  // the story so far, counted from the account's own events
  const cnt = (evs: LiveEvent[], f: (e: LiveEvent) => boolean) => evs.filter(f).length;
  const entries = cnt(fair, (e) => e.s === "register" && e.o === "ok");
  const refused = cnt(fair, (e) => e.v === "rejected");
  const trapped = cnt(fair, (e) => e.v === "decoy");
  const bought = cnt(old, (e) => e.s === "buy" && e.o === "ok");
  const oldNo = cnt(old, (e) => e.v === "rejected");
  const parts: string[] = [];
  if (fair.length) parts.push(entries ? `In Fair Drop it got ${entries} entry on the list${refused ? `, and ${refused} more ${refused === 1 ? "try was" : "tries were"} refused` : ""}${trapped ? `, and ${trapped} ${trapped === 1 ? "move" : "moves"} fell into the decoy trap` : ""}.` : `In Fair Drop it has no entry${refused ? ` (${refused} ${refused === 1 ? "try" : "tries"} turned away)` : ""}${trapped ? `, and ${trapped} ${trapped === 1 ? "move" : "moves"} fell into the decoy trap` : ""}.`);
  if (old.length) parts.push(bought ? `In the old way it bought ${bought} seat${bought === 1 ? "" : "s"}${oldNo ? ` and was refused ${oldNo} time${oldNo === 1 ? "" : "s"}` : ""}.` : `In the old way it has not bought a seat${oldNo ? ` (refused ${oldNo} time${oldNo === 1 ? "" : "s"})` : ""}.`);
  const first = mine[0];

  return (
    <section className="space-y-5">
      <SectionHead kicker="One person at a time" title="Follow one person">
        Pick someone from the crowd and watch their booking, step by step, exactly as the servers recorded it. The live feed is a sample of all decisions, so a quick step can be missing.
      </SectionHead>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Who to follow">
        {kinds.map((id) => {
          const color = id === "HUMAN" ? "#7fd8ff" : BOTS[id]?.color;
          return (
            <button key={id} role="tab" aria-selected={cur === id} onClick={() => setKind(id)}
              className={cn("inline-flex shrink-0 items-center gap-2 rounded-[4px] border px-3 py-2 text-sm font-semibold transition", cur === id ? "bg-panel2" : "border-line text-mute hover:text-ink")}
              style={cur === id ? { borderColor: color, color } : undefined}>
              <BotGlyph id={id} size={15} />{kindName(id)}
            </button>
          );
        })}
        <Button variant="secondary" size="sm" onClick={next} disabled={cands.length < 2} className="ml-auto shrink-0 self-center"><SkipForward size={14} />Next person</Button>
      </div>

      {kinds.length === 0 || !acct ? (
        <div className="panel border-dashed p-8 text-center text-sm text-mute">{kinds.length === 0 ? "Nobody to follow yet. Press Start and pick someone from the crowd here." : `No recorded moves for ${kindName(cur).toLowerCase()} yet. They appear here the moment this kind acts.`}</div>
      ) : (
        <>
          <div className="panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[4px] border border-line bg-panel2"><BotGlyph id={cur} size={22} /></span>
              <div className="min-w-0">
                <Eyebrow>{human ? "A real person" : "A bot"}{cands.length > 1 ? ` · ${cands.indexOf(cands.find((c) => c.id === acct)!) + 1} of ${cands.length} sampled` : ""}</Eyebrow>
                <div className="display text-3xl" style={{ color: human ? "#7fd8ff" : b?.color }}>{kindName(cur)}</div>
              </div>
              <div className="ml-auto font-mono text-[11px] text-mute" title={acct}>account <b className="text-ink">{shortId(acct)}</b>{first?.ip ? <> · address <b className="text-ink">{first.ip}</b></> : null}</div>
            </div>
            <p className="mt-3 max-w-3xl text-[15px] text-ink/90"><b>What this account is trying to do. </b>{human ? "A real person: one device, one attempt, polite retries." : b?.does}</p>
            <p className="mt-2 max-w-3xl text-[15px] text-ink/90" aria-live="polite"><b className="text-gold">So far. </b>{parts.length ? parts.join(" ") : "Nothing recorded yet."}</p>
            <p className="mt-3 inline-block rounded-[4px] border border-gold/40 bg-gold/10 px-3 py-1.5 text-[13px] font-semibold text-gold">This login can get 1 entry. Every extra try is marked below.</p>
          </div>

          <div className={cn("grid gap-4", "md:grid-cols-2")}>
            <Column mode="fairdrop" evs={fair} other={both || old.length > 0} />
            <Column mode="fcfs" evs={old} other={both || fair.length > 0} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] uppercase tracking-[.14em] text-mute">
            <span className="flex items-center gap-1.5"><i className="led text-lime" aria-hidden />let in</span>
            <span className="flex items-center gap-1.5"><i className="led text-hot" aria-hidden />turned away</span>
            <span className="flex items-center gap-1.5"><i className="led text-warn" aria-hidden />caught by the decoy</span>
            <span className="flex items-center gap-1.5"><i className="led text-mute" aria-hidden />ignored repeat</span>
          </div>
        </>
      )}
    </section>
  );
}
