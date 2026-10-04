// Small shared helpers for the Booking Theatre: every number the live screen shows is derived from useArena() here, nowhere else.
import type { Arena, MethodView } from "@/lib/arena";
import { SEATS } from "@/lib/arena";

export const N = (x: number) => Math.round(Number(x) || 0).toLocaleString();
export const fmtPct = (p: number) => (!Number.isFinite(p) ? "0%" : (p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10) + "%");
export const fmtClock = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export type MethodKey = "fcfs" | "naive" | "fair";
export const METHOD_NAME: Record<MethodKey, string> = { fcfs: "First come, first served", naive: "Simple lottery", fair: "Fair Drop" };
export const STATUS_WORDS: Record<MethodView["status"], string> = { waiting: "waiting", live: "live", expected: "expected", estimate: "estimate", final: "final" };

/** Plain numbers drawn from the live model. */
export function facts(a: Arena) {
  const bots = a.profiles.filter((p) => p.id !== "HUMAN");
  const human = a.profiles.find((p) => p.id === "HUMAN");
  const sum = (f: (p: Arena["profiles"][number]) => number, list = a.profiles) => list.reduce((s, p) => s + f(p), 0);
  const reason = (k: string) => sum((p) => p.reasons[k] || 0);
  const entries = sum((p) => p.gotInFair);
  const m = a.methods;
  const taken = (x: MethodView) => x.humanSeats + x.botSeats;
  return {
    bots, human, reason, entries,
    botBlocked: sum((p) => p.blocked, bots),
    humanBlocked: human?.blocked || 0,
    tickets: sum((p) => p.tickets), botTickets: sum((p) => p.tickets, bots), humanTickets: human?.tickets || 0,
    oldRequests: a.gate.old.ok + a.gate.old.no + a.gate.old.decoy,
    oldRefused: a.gate.old.no,
    decoy: a.gate.fair.decoy,
    taken: { fcfs: taken(m.fcfs), naive: taken(m.naive), fair: taken(m.fair) },
    oldCrowd: m.fcfs.humanAccounts + m.fcfs.botAccounts,
  };
}

export type StState = "idle" | "active" | "done";
export type Count = { v: number; label: string; tone?: "ice" | "hot" | "lime" | "warn" | "mute" };

const ORDER = ["SCHEDULED", "OPEN", "CLOSED", "LOCKED", "DRAWN", "CLAIM", "SETTLED"];

/** Which of the 7 Fair Drop stations are lit, from the real sale state. */
export function fairStates(a: Arena): StState[] {
  const i = a.fairId ? ORDER.indexOf(a.fairState) : -1;
  const I: StState = "idle", A: StState = "active", D: StState = "done";
  if (i <= 0) return [I, I, I, I, I, I, I];
  if (i === 1) return [A, A, A, A, I, I, I];
  if (i === 2) return [D, D, D, D, A, I, I];
  if (i === 3) return [D, D, D, D, D, A, I];
  if (i === 4) return [D, D, D, D, D, D, I];
  if (i === 5) return [D, D, D, D, D, D, A];
  return [D, D, D, D, D, D, D];
}

/** The four old-way stations, from the old sale's state and its real seat count. */
export function fcfsStates(a: Arena): StState[] {
  const I: StState = "idle", A: StState = "active", D: StState = "done";
  const sold = a.methods.fcfs.humanSeats + a.methods.fcfs.botSeats >= SEATS;
  if (!a.oldId || a.oldState === "" || a.oldState === "SCHEDULED") return [I, I, I, I];
  if (a.oldState === "OPEN") return [A, A, sold ? D : A, sold ? A : I];
  return [D, D, D, D];
}

/** The four simple-lottery stations. The draw is calculated only after the Fair Drop sale closes. */
export function naiveStates(a: Arena): StState[] {
  const I: StState = "idle", A: StState = "active", D: StState = "done";
  const i = a.fairId ? ORDER.indexOf(a.fairState) : -1;
  const fin = a.methods.naive.status === "final";
  if (i <= 0) return [I, I, I, I];
  if (i === 1) return [A, A, I, I];
  return [D, D, fin ? D : A, fin ? D : I];
}

/** The big plain-words phase. */
export function phaseWords(a: Arena): string {
  switch (a.phase) {
    case "idle": return "Waiting for the show to start";
    case "starting": return "Getting the doors ready";
    case "fair": return "Doors open: Fair Drop sale running";
    case "wrapup": return "Sale closed: sealing the list and drawing";
    case "old": return "Old first-come-first-served sale running";
    default: return "Finished: here is the result";
  }
}

/** Does the finished result say Fair Drop held the bots to their share of the crowd? (computed, never typed) */
export function fairHeld(a: Arena) {
  const f = a.methods.fair;
  if (!a.verdictFinal || !(f.botCrowdSharePct > 0)) return null;
  const held = f.botSeatSharePct <= f.botCrowdSharePct * 1.25 + 0.5;
  return { held, ratio: f.botSeatSharePct / f.botCrowdSharePct };
}

/** One sentence that says what is happening now, using the real numbers. */
export function narrate(a: Arena): string {
  const f = facts(a), c = a.crowd, m = a.methods;
  const who = `${N(c.humans)} real people and ${N(c.bots)} bots`;
  switch (a.phase) {
    case "idle": return "Press start and a crowd of real people and bots will rush the doors of three booking methods for the same 500 seats. You watch who gets in.";
    case "starting": return "Setting up the sale and the crowd. In a moment people and bots start arriving.";
    case "fair": return c.total ? `${who} are at the door. Fair Drop asks each one for a verified ID and gives one ticket per person. Bot requests turned away so far: ${N(f.botBlocked)}.` : "The doors are open and the first people are arriving.";
    case "wrapup": return `The sale is closed. The list of ${N(f.entries)} entries is being sealed so nobody can change it, then the draw picks the winners. Anyone can re-run the draw.`;
    case "old": return `Now the same crowd rushes the old first-come-first-served door: the fastest clicks win. ${N(f.taken.fcfs)} of ${SEATS} seats are taken so far, bots hold ${N(m.fcfs.botSeats)} of them.`;
    default: {
      if (!a.verdictFinal) return "The test is finished. The exact numbers for the simple lottery are still being worked out, so some figures are estimates.";
      return `The result: bots were ${fmtPct(m.fair.botCrowdSharePct)} of the crowd. They took ${fmtPct(m.fcfs.botSeatSharePct)} of the seats with first-come-first-served, ${fmtPct(m.naive.botSeatSharePct)} with the simple lottery and ${fmtPct(m.fair.botSeatSharePct)} with Fair Drop.`;
    }
  }
}
