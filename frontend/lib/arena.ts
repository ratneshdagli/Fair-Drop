"use client";
// The one data layer behind the Live Arena (/live) and the admin "Live Arena" tab.
// It polls the same admin APIs as the old Control Room and returns ONE tidy model, so every screen shows the same numbers.
// Nothing here decides anything: it only reads what the server and the independent judge already recorded.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, testKey, usePoll } from "@/lib/api";
import { BOT_ORDER } from "@/components/admin/botinfo";

export const SEATS = 500;   // the demo hall's size (a venue constant of this show, not a measured value)
export type Mode = "fairdrop" | "fcfs";
export type LiveEvent = { id: string; t: number; s: string; o: string; v: "accepted" | "rejected" | "decoy" | "absorbed"; k: string; pf: string; a: string; ip: string; op: string; mode: Mode };

/** What one method (old way / naive lottery / Fair Drop) did with the 500 seats. */
export type MethodView = {
  key: "fcfs" | "naive" | "fair";
  /** waiting = no data yet · live = real numbers so far · expected = fair math on entries so far · estimate = calculated from the same traffic · final = the finished result */
  status: "waiting" | "live" | "expected" | "estimate" | "final";
  humanAccounts: number;      // real-person accounts that took part
  botAccounts: number;        // bot accounts that took part
  humanSeats: number;         // seats that went to real people
  botSeats: number;           // seats that went to bots
  botAccountsWithSeat: number | null;   // how many different bot accounts hold at least one seat (null = not known yet)
  humanChancePct: number | null;        // chance a real person gets a seat
  botChancePct: number | null;          // chance an average bot account gets a seat
  botSeatSharePct: number;              // % of the seats that went to bots
  botCrowdSharePct: number;             // % of the crowd (accounts) that are bots
  note: string;               // one plain sentence about how this number was obtained
};

/** One kind of bot (or the real people), merged across both sales. */
export type ProfileView = {
  id: string;                 // SPEED_BOT … or HUMAN
  accounts: number;           // accounts of this kind in the test
  requests: number;           // requests they sent to the Fair Drop sale
  tickets: number;            // of those, the ones that reached the entry step (what a "every request is a ticket" lottery would count)
  blocked: number;            // requests turned away (incl. decoy)
  gotInFair: number;          // accounts that got an entry in the fair sale
  gotInOld: number;           // accounts that bought at least one seat in the old sale
  seatsOld: number;           // seats this kind bought in the old sale
  reasons: Record<string, number>;  // why they were turned away (REASON keys)
};

export type Science = { all: any; human: any; bot: any; arrivals: Record<string, number[]>; decisions: number };
export type Run = { id: string; status: "running" | "done" | "failed"; started: number; experiment: string };
export type Phase = "idle" | "starting" | "fair" | "wrapup" | "old" | "done";

export type Arena = {
  ready: boolean;
  authed: boolean;
  running?: Run;
  phase: Phase;
  fairId: string; oldId: string;
  fairState: string; oldState: string;
  closesInMs: number | null;
  crowd: { humans: number; bots: number; total: number };
  methods: { fcfs: MethodView; naive: MethodView; fair: MethodView };
  profiles: ProfileView[];                 // every kind of bot (BOT_ORDER) that is in the test, then HUMAN last
  events: LiveEvent[];                     // newest first, both sales, ~600 most recent
  rates: { rps: number; letInPerSec: number; blockedPerSec: number; active: number };
  feedStat: { skew: number; exact: Partial<Record<Mode, number>> };  // server clock minus browser clock, and the server's exact requests/s (last 3 s) per sale: events are SAMPLED under load, so per-kind rates are scaled to these
  gate: { fair: { ok: number; no: number; decoy: number }; old: { ok: number; no: number; decoy: number }; seats: number };  // exact decision totals per sale (for the gate picture)
  checks: { label: string; ok: boolean; detail: string }[];   // live self-checks: do the numbers on screen agree with each other?
  science: { fair: Science | null; old: Science | null };   // the judge's raw confusion matrix and arrival histograms, for the research-metrics panel
  decisions: number; wrong: number;        // judge: how many decisions were checked, how many it says were wrong
  verdictFinal: boolean;                   // the exact (final) numbers have arrived
  start: (spec: { people: number; bots: Record<string, number>; protection: boolean; seconds?: number }) => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  busy: boolean; msg: string; clearMsg: () => void;
};

const H = () => ({ "X-Test-Key": testKey.get() });
const num = (x: any) => Number(x) || 0;
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const sumVals = (o: any, keys?: string[]) => Object.entries(o || {}).reduce((a, [k, v]) => (keys ? (keys.includes(k) ? a + num(v) : a) : k === "all" ? a : a + num(v)), 0);

const empty = (key: MethodView["key"]): MethodView => ({ key, status: "waiting", humanAccounts: 0, botAccounts: 0, humanSeats: 0, botSeats: 0, botAccountsWithSeat: null, humanChancePct: null, botChancePct: null, botSeatSharePct: 0, botCrowdSharePct: 0, note: "Waiting for a test to start." });

function finish(m: MethodView): MethodView {
  const seats = m.humanSeats + m.botSeats;
  return { ...m,
    botSeatSharePct: pct(m.botSeats, seats),
    botCrowdSharePct: pct(m.botAccounts, m.humanAccounts + m.botAccounts),
    humanChancePct: m.humanAccounts ? Math.min(100, pct(m.humanSeats, m.humanAccounts)) : null,
    botChancePct: !m.botAccounts ? null : m.botAccountsWithSeat !== null ? Math.min(100, pct(m.botAccountsWithSeat, m.botAccounts)) : m.key === "fair" ? Math.min(100, pct(m.botSeats, m.botAccounts)) : null };  // one seat per account only in the fair sale
}

export function useArena(): Arena {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { try { setAuthed(!!localStorage.getItem("fd:admin")); } catch {} setReady(true); const t = setInterval(() => { try { setAuthed(!!localStorage.getItem("fd:admin")); } catch {} }, 2000); return () => clearInterval(t); }, []);
  const on = ready && authed;

  const { data: drops } = usePoll(() => (on ? api<any[]>("/admin/drops", { auth: "admin" }) : Promise.resolve(null as any)), 2000, [on]);
  const { data: runs } = usePoll(() => (on ? api<Run[]>("/runs", { base: "/attack", headers: H() }) : Promise.resolve(null as any)), 2000, [on]);
  let running = ((runs || []) as Run[]).find((r) => r.status === "running");

  // when a test sale was created (its scheduled opening is unreliable: boundary tests open the sale by hand, much later)
  const born = (d: any) => d?.cutoff_at_ms || d?.opened_at_ms || d?.opens_at_ms || 0;
  // sales wiped by "Clear everything" vanish at once (id + birth time), without waiting for the next poll
  const dead = useRef<Set<string>>(new Set());
  const dropsRef = useRef<any[]>([]); dropsRef.current = (drops || []) as any[];
  const exp = ((drops || []) as any[]).filter((d) => String(d.id).startsWith("exp-") && !dead.current.has(d.id + ":" + born(d))).sort((a, b) => born(b) - born(a));
  const fair = exp.find((d) => d.mode === "fairdrop");
  // the old-way sale of THIS test: test sales reuse their ids, so one left over from the previous test (it opened earlier than this fair sale) must be ignored
  const oldRaw = fair ? (drops || []).find((d: any) => d.id === fair.id.replace("-fairdrop-", "-fcfs-")) : undefined;
  const old = oldRaw && born(oldRaw) >= born(fair) ? oldRaw : undefined;
  const fairId = fair?.id || "", oldId = old?.id || "";
  // degraded mode: if the attack engine's run list is not reachable at all (e.g. no /attack proxy in plain dev), an OPEN test sale still means a test is running
  if (!running && on && runs === null && (fair?.state === "OPEN" || old?.state === "OPEN")) running = { id: "unknown", status: "running", started: 0, experiment: "custom" };

  const { data: pFair } = usePoll(() => (fairId ? api<any>(`/admin/drops/${fairId}/protection`, { auth: "admin" }) : Promise.resolve(null)), 2000, [fairId]);
  const { data: pOld } = usePoll(() => (oldId ? api<any>(`/admin/drops/${oldId}/protection`, { auth: "admin" }) : Promise.resolve(null)), 2000, [oldId]);
  const { data: pulse } = usePoll(() => (fairId ? api<any>(`/admin/drops/${fairId}/pulse`, { auth: "admin" }) : Promise.resolve(null)), 1500, [fairId]);
  const { data: exps } = usePoll(() => (on ? api<any[]>("/admin/experiments", { auth: "admin" }) : Promise.resolve(null as any)), 4000, [on]);

  // the finished result (exact numbers for all three methods) of the newest test
  const last = ((exps || []) as any[]).find((e) => (e.name.includes("show_bot_zoo") || e.name.includes("custom_mix")) && !e.name.includes("live FCFS"));
  const [final, setFinal] = useState<any>(null);
  // sale ids are reused between tests, so a result only counts as this test's if it was written after this test's fair sale opened
  useEffect(() => { setFinal(null); }, [fairId, born(fair)]);
  const lastIsMine = !!(last && fair && Date.parse(last.created_at) >= born(fair));
  useEffect(() => { if (lastIsMine && fairId) api<any>(`/admin/experiments/${last.id}`, { auth: "admin" }).then((r: any) => setFinal(r?.meta?.drop_id === fairId ? r : null)).catch(() => {}); }, [last?.id, lastIsMine, fairId]);
  const pol = final?.policies;
  const finalOK = !!(pol?.fairdrop && pol?.naive) && final?.meta?.drop_id === fairId;

  // ── the live event stream (both sales), newest first ──
  const buf = useRef<LiveEvent[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [rates, setRates] = useState({ rps: 0, letInPerSec: 0, blockedPerSec: 0, active: 0 });
  const rateBy = useRef<Record<string, any>>({});
  const [feedStat, setFeedStat] = useState<Arena["feedStat"]>({ skew: 0, exact: {} });
  useEffect(() => {
    buf.current = []; setEvents([]);
    const ids: [string, Mode][] = [[fairId, "fairdrop"], [oldId, "fcfs"]].filter(([i]) => i) as any;
    if (!ids.length) return;
    let alive = true; const cur: Record<string, string> = {};
    const tick = async () => {
      if (document.hidden) return;   // background tabs do not poll
      for (const [id, mode] of ids) {
        try {
          const r = await api<any>(`/admin/drops/${id}/feed${cur[id] ? "?after=" + cur[id] : ""}`, { auth: "admin" });
          if (!alive) return;
          cur[id] = r.cursor || cur[id];
          buf.current = [...(r.events || []).map((e: any) => ({ ...e, mode })).reverse(), ...buf.current].slice(0, 600);
          rateBy.current[id] = { p: r.per_sec_3s || {}, active: num(r.active_users_3s), mode, skew: r.now_ms ? num(r.now_ms) - Date.now() : 0 };
        } catch { /* keep polling */ }
      }
      if (!alive) return;
      const live = rateBy.current[oldId]?.p?.all > 0 && !(rateBy.current[fairId]?.p?.all > 0) ? rateBy.current[oldId] : rateBy.current[fairId];
      const p = live?.p || {};
      const s = (vs: string[]) => ["human", "bot", "unknown"].reduce((a, k) => a + vs.reduce((b, v) => b + num(p[k + "/" + v]), 0), 0);
      setRates({ rps: num(p.all), letInPerSec: s(["accepted"]), blockedPerSec: s(["rejected", "decoy"]), active: num(live?.active) });
      setEvents(buf.current.slice());
      const exact: Arena["feedStat"]["exact"] = {}; let skew = 0;
      for (const [i, m] of ids) { const x = rateBy.current[i]; if (x) { exact[m] = num(x.p.all); skew = x.skew; } }
      setFeedStat({ skew, exact });
    };
    tick(); const t = setInterval(tick, 700);
    return () => { alive = false; clearInterval(t); };
  }, [fairId, oldId]);

  // ── merged per-kind table ──
  const bpF = pFair?.by_profile || {}, bpO = pOld?.by_profile || {};
  const profiles: ProfileView[] = [...BOT_ORDER, "HUMAN"].map((id) => {
    const f = bpF[id] || {}, o = bpO[id] || {};
    return { id, accounts: num(f.Identities) || num(o.Identities), requests: num(f.Requests), tickets: num(f.Accepted) + num(f.Absorbed) + num(f.Decoy) + num(f.Reasons?.token_already_used), blocked: num(f.Rejected) + num(f.Decoy), gotInFair: num(f.Entered), gotInOld: num(o.Entered), seatsOld: num(o.Accepted), reasons: f.Reasons || {} };
  }).filter((p) => p.id === "HUMAN" ? p.accounts > 0 : p.accounts > 0);

  // ── the three methods ──
  const pplF = pFair?.people || {}, pplO = pOld?.people || {};
  const hA = num(pplF.human?.attempted) || num(pplO.human?.attempted), bA = num(pplF.bot?.attempted) || num(pplO.bot?.attempted);
  const crowd = { humans: hA, bots: bA, total: hA + bA };

  let fcfs = empty("fcfs"), naive = empty("naive"), fairM = empty("fair");
  if (pOld && (pplO.human || pplO.bot)) {
    const hs = num(pOld.requests_by_kind?.human?.accepted), bs = num(pOld.requests_by_kind?.bot?.accepted);
    const withSeat = Object.entries(bpO).filter(([k]) => k !== "HUMAN").reduce((a, [, v]: any) => a + num(v.Entered), 0);
    fcfs = finish({ ...fcfs, status: "live", humanAccounts: num(pplO.human?.attempted), botAccounts: num(pplO.bot?.attempted), humanSeats: hs, botSeats: bs, botAccountsWithSeat: withSeat,
      note: "Real result of the old first-come-first-served sale: whoever's click landed first got the seat. One account can buy several seats." });
  }
  if (pFair && (pplF.human || pplF.bot)) {
    const eh = num(pplF.human?.entered), eb = num(pplF.bot?.entered), tot = eh + eb;
    const sh = tot <= SEATS ? tot : SEATS;
    fairM = finish({ ...fairM, status: "expected", humanAccounts: num(pplF.human?.attempted), botAccounts: num(pplF.bot?.attempted),
      humanSeats: tot ? Math.round(sh * eh / tot) : 0, botSeats: tot ? Math.round(sh * eb / tot) : 0, botAccountsWithSeat: null,
      note: "Every verified account gets one entry. Seats are drawn at random after the sale closes, so for now this is the expected split of the entries so far." });
    // The simple lottery depends on which of the three price tiers each request chose (bots all chase one tier), so it cannot be estimated honestly
    // from live totals. It is calculated exactly from the final list of requests the moment the sale is drawn.
    naive = { ...naive, humanAccounts: fairM.humanAccounts, botAccounts: fairM.botAccounts, note: "Calculated exactly from the final list of requests once the Fair Drop sale closes and is drawn. Until then there is nothing honest to show." };
  }
  if (finalOK) {
    const nx = pol.naive_expected || pol.naive, dx = pol.fairdrop;
    const mk = (key: MethodView["key"], x: any, note: string, withSeat: number | null): MethodView => finish({ key, status: "final",
      humanAccounts: num(x.identities_by_kind?.human), botAccounts: num(x.identities_by_kind?.bot), humanSeats: Math.round(num(x.seats_by_kind?.human)), botSeats: Math.round(num(x.seats_by_kind?.bot)), botAccountsWithSeat: withSeat, humanChancePct: null, botChancePct: null, botSeatSharePct: 0, botCrowdSharePct: 0, note });
    const winBots = (x: any) => Object.entries(x?.operators || {}).filter(([k]) => k !== "humans").reduce((a, [, v]: any) => a + Math.min(num(v.seats), num(v.identities)), 0);
    if (pol.fcfs_live) fcfs = mk("fcfs", pol.fcfs_live, "Final result of the old first-come-first-served sale. One account can buy several seats.", fcfs.botAccountsWithSeat);
    else if (fcfs.status === "waiting") fcfs = mk("fcfs", pol.fcfs, "Not run live yet: calculated by replaying the same requests first-come-first-served.", null);
    naive = mk("naive", nx, "Exact result of the “every request is a ticket” lottery, averaged over 200 random draws on the same traffic.", null);
    fairM = mk("fair", dx, "The real draw: one entry per verified account, then a random draw anyone can re-check.", winBots(dx) || null);
    if (!fairM.humanAccounts) fairM.humanAccounts = crowd.humans;
  }

  const decisions = num(pFair?.decisions) + num(pOld?.decisions);
  const cf = pFair?.confusion?.all || {}, co = pOld?.confusion?.all || {};
  const wrong = num(cf.FP) + num(cf.FN) + num(co.FP) + num(co.FN);

  const tot = (p: any, v: string) => ["human", "bot", "unknown"].reduce((x, k) => x + num(p?.requests_by_kind?.[k]?.[v]), 0);
  const gate = { fair: { ok: tot(pFair, "accepted"), no: tot(pFair, "rejected"), decoy: tot(pFair, "decoy") }, old: { ok: tot(pOld, "accepted"), no: tot(pOld, "rejected"), decoy: tot(pOld, "decoy") }, seats: num(pulse?.tickets?.total) || SEATS };

  // ── self-checks: every number on screen must agree with the others, or we say so ──
  const N = (x: number) => x.toLocaleString();
  const graded = (p: any) => { const c = p?.confusion?.all || {}; return num(c.TP) + num(c.TN) + num(c.FP) + num(c.FN) + num(c.Absorbed) + num(c.ABS) + num(c.Throttled) + num(c.THR); };
  const checks: Arena["checks"] = [];
  if (crowd.total > 0) {
    const kinds = profiles.reduce((x, p) => x + p.accounts, 0);
    checks.push({ label: "Real people + bot accounts = every account in the test", ok: kinds === crowd.total, detail: `${N(crowd.humans)} + ${N(crowd.bots)} = ${N(crowd.total)} · by kind: ${N(kinds)}` });
    const inn = num(pplF.human?.entered) + num(pplF.bot?.entered), out = num(pplF.human?.not_entered) + num(pplF.bot?.not_entered), att = num(pplF.human?.attempted) + num(pplF.bot?.attempted);
    checks.push({ label: "Fair Drop: got in + did not get in = all accounts", ok: inn + out === att, detail: `${N(inn)} + ${N(out)} = ${N(att)}` });
    const m = [fcfs, naive, fairM].filter((x) => x.status !== "waiting");
    checks.push({ label: "Every method hands out at most 500 seats", ok: m.every((x) => x.humanSeats + x.botSeats <= SEATS), detail: m.map((x) => `${x.key === "fcfs" ? "old way" : x.key === "naive" ? "simple lottery" : "Fair Drop"} ${N(x.humanSeats + x.botSeats)}`).join(" · ") });
    if (fairM.status === "final") checks.push({ label: "Fair Drop: one seat per account at most, so bot seats ≤ bot accounts", ok: fairM.botSeats <= fairM.botAccounts, detail: `${N(fairM.botSeats)} seats ≤ ${N(fairM.botAccounts)} accounts` });
    if (fcfs.status !== "waiting") checks.push({ label: "Old way: bot seats ≥ bot accounts that hold a seat (one account can buy several)", ok: fcfs.botSeats >= (fcfs.botAccountsWithSeat || 0), detail: `${N(fcfs.botSeats)} seats across ${N(fcfs.botAccountsWithSeat || 0)} accounts` });
    if (fcfs.status !== "waiting" && fairM.status === "final") checks.push({ label: "Same crowd in both sales (real-person accounts)", ok: Math.abs(fcfs.humanAccounts - fairM.humanAccounts) <= Math.max(2, fairM.humanAccounts * 0.002), detail: `old way ${N(fcfs.humanAccounts)} · Fair Drop ${N(fairM.humanAccounts)}` });
    for (const [nm, p] of [["Fair Drop", pFair], ["Old way", pOld]] as [string, any][]) if (p?.decisions) checks.push({ label: `${nm}: every decision was graded by the judge`, ok: graded(p) === num(p.decisions), detail: `${N(graded(p))} graded of ${N(num(p.decisions))} recorded` });
    checks.push({ label: "The judge found no wrong decision", ok: wrong === 0, detail: wrong === 0 ? "0 wrong" : `${N(wrong)} wrong: see Proof & checks` });
  }

  const sci = (p: any): Science | null => (p?.confusion ? { all: p.confusion.all || {}, human: p.confusion.human || {}, bot: p.confusion.bot || {}, arrivals: p.arrivals || {}, decisions: num(p.decisions) } : null);
  const science = { fair: sci(pFair), old: sci(pOld) };

  const phase: Phase = !fairId ? (running ? "starting" : "idle") : running ? (fair?.state === "OPEN" ? "fair" : old?.state === "OPEN" ? "old" : fair?.state === "SCHEDULED" ? "starting" : "wrapup") : "done";
  // a test sale is closed by the test itself when the crowd is done, so its 10-minute nominal timer is not a real countdown: show one only when it is short
  const rawClose = pulse?.closes_at_ms && pulse.state === "OPEN" ? Math.max(0, pulse.closes_at_ms - pulse.now_ms) : null;
  const closesInMs = rawClose !== null && rawClose < 120000 ? rawClose : null;

  // ── controls ──
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const start: Arena["start"] = useCallback(async ({ people, bots, protection, seconds }) => {
    setBusy(true); setMsg("");
    try {
      await api("/test/config", { body: { guard: { enabled: protection } }, headers: H() });
      await api("/run", { method: "POST", base: "/attack", headers: H(), body: { experiment: "custom", spec: { people, bots, window: seconds || 0 }, also_fcfs: true } });
      setMsg("Started. First the Fair Drop sale runs, then the same crowd tries the old first-come-first-served way.");
    } catch (e: any) { setMsg("Could not start: " + (e.body?.error || e.body?.detail || e.message)); }
    setBusy(false);
  }, []);
  const stop = useCallback(async () => { setBusy(true); try { const r = await api<any>("/stop", { method: "POST", base: "/attack", headers: H(), body: {} }); setMsg(r.stopped ? "Stopped." : "Nothing was running."); } catch (e: any) { setMsg("Could not stop: " + e.message); } setBusy(false); }, []);
  const restart = useCallback(async () => {
    setBusy(true); setMsg("Stopping everything…");
    for (const d of (dropsRef.current || [])) if (String(d.id).startsWith("exp-")) dead.current.add(d.id + ":" + (d.cutoff_at_ms || d.opened_at_ms || d.opens_at_ms || 0));
    buf.current = []; setEvents([]); setFinal(null);
    try { sessionStorage.removeItem("fd:admin-drop"); localStorage.removeItem("fd:arena-last-v2"); } catch {}
    let cleared = 0, err = "";
    // stop the load generators (a failure here must not skip the clearing), then clear; twice, because a dying run can create one last sale
    for (let i = 0; i < 2; i++) {
      try { await api("/stop", { method: "POST", base: "/attack", headers: H(), body: { forget: true } }); } catch (e: any) { err = "stop: " + (e.body?.error || e.message); }
      try { const r = await api<any>("/test/clear", { method: "POST", headers: H(), body: {} }); cleared += num(r.sales_cleared); err = ""; } catch (e: any) { err = "clear: " + (e.body?.error || e.message); }
      if (i === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    setMsg(err ? "Could not fully clear (" + err + ")" : `Everything stopped and cleared (${cleared} test sale(s) removed). Nothing is running and protection is ON.`);
    setBusy(false);
  }, []);

  return { ready, authed, running, phase, fairId, oldId, fairState: fair?.state || "", oldState: old?.state || "", closesInMs, crowd,
    methods: { fcfs, naive, fair: fairM }, profiles, events, rates, feedStat, gate, checks, science, decisions, wrong, verdictFinal: finalOK,
    start, stop, restart, busy, msg, clearMsg: () => setMsg("") };
}
