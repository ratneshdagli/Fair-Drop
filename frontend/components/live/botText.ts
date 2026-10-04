// Plain-language wording for the live panels (BotWall, TrafficLog, FollowFan). One place, so the words stay consistent.
import type { LiveEvent } from "@/lib/arena";
import { BOTS, REASON, SHORT, reasonOf } from "@/components/admin/botinfo";

// what the account did, and how it ended (key = stage/outcome from the live feed)
const SAY: Record<string, string> = {
  "token/ok": "asked for a ticket, got one",
  "token/already_issued": "asked for a second ticket: refused",
  "token/ineligible": "tried to join but signed up too late: refused",
  "token/closed": "came after the sale closed: refused",
  "token/not_open": "came before the sale opened: refused",
  "register/ok": "got into the draw",
  "register/replay": "sent the same request again: same receipt, no second entry",
  "register/spent": "tried to reuse a used ticket: refused",
  "register/closed": "came after the sale closed: refused",
  "register/bad_sig": "sent a fake ticket: refused",
  "tarpit/tarpit": "fell for the decoy trap",
  "buy/ok": "bought a seat (old way)",
  "buy/capped": "hit the per-account limit (old way): refused",
  "buy/closed": "came after the sale closed: refused",
  "buy/soldout": "was told: sold out",
  "limit/ip": "sent too many clicks from one address: slowed down",
  "limit/account": "sent too many clicks from one account: slowed down",
};
const SUFFIX: Record<LiveEvent["v"], string> = { accepted: "let in", rejected: "refused", decoy: "trapped", absorbed: "ignored" };

export const sayEvent = (e: LiveEvent): string => SAY[e.s + "/" + e.o] || `${e.s} ${e.o} ${SUFFIX[e.v] || ""}`.trim();

// DESIGN.md tokens: lime = let in, hot = turned away, warn = decoy, mute = ignored
export const VCOLOR: Record<string, string> = { accepted: "#b8ff4a", rejected: "#ff3b5c", decoy: "#ff8a3d", absorbed: "#9a90b8" };
export const verdictColor = (v: string): string => VCOLOR[v] || VCOLOR.absorbed;

export const kindName = (id: string): string => (id === "HUMAN" ? "Real people" : BOTS[id]?.name || id);

/** the two sales, always coloured the same: Fair Drop = gold, old way = hot */
export const MODE_TAG = {
  fairdrop: { t: "FAIR DROP", c: "#ffc233", tip: "Fair Drop sale" },
  fcfs: { t: "OLD WAY", c: "#ff3b5c", tip: "Old first-come-first-served sale" },
} as const;

/** where in the booking journey a feed stage sits, in plain words */
export const STATION: Record<string, string> = {
  limit: "Rate limit check",
  token: "Asked for a ticket (ID check)",
  register: "Entered the draw with the ticket",
  tarpit: "Took the decoy shortcut",
  buy: "Tried to buy a seat (old way)",
};
export const stationName = (s: string): string => STATION[s] || s;

/** the verdict of one event in words: "let in", "turned away: second ticket refused" … */
export function verdictWords(e: LiveEvent): string {
  if (e.v === "accepted") return e.s === "buy" ? "Got a seat" : e.s === "register" ? "Let in: one entry on the list" : e.s === "token" ? "Got a ticket" : "Let in";
  if (e.v === "decoy") return "Trapped by the decoy: a convincing but worthless receipt";
  if (e.v === "absorbed") return "Ignored: a repeat, still only one entry";
  const r = reasonOf(e.s, e.o);
  const w = SHORT[r] || REASON[r]?.[0];
  return w ? `Turned away: ${w.charAt(0).toLowerCase()}${w.slice(1)}` : "Turned away";
}

/** long account ids → at most 14 characters */
export const shortId = (a: string): string => {
  const s = String(a || "?");
  return s.length <= 14 ? s : s.slice(0, 6) + "…" + s.slice(-7);
};

/** event time in epoch milliseconds (tolerates seconds) */
export const tms = (t: number): number => (t > 0 && t < 1e11 ? t * 1000 : t);

const p = (x: number, w = 2) => String(x).padStart(w, "0");
/** HH:MM:SS.mmm */
export const clock = (t: number): string => {
  const d = new Date(tms(t));
  return isNaN(d.getTime()) ? "--:--:--.---" : `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

/** what the backend did with one raw request, in plain words (from the route + the status it answered with) */
export function backendDid(ep: string, method: string, c: number): string {
  const e = ep || "";
  if (e.endsWith("/register-fast")) return "Decoy door: it looks real and hands back a receipt, but the entry never reaches the real list.";
  if (e.endsWith("token")) {
    const rig = e.endsWith("/test-token") ? " (Test-rig shortcut: the load generator asks in one step; the checks are the same.)" : "";
    if (c === 200) return "Checked ID and rate limit, then signed a one-time ticket without seeing what is inside it." + rig;
    if (c === 403) return "Checked ID: not eligible (signed up after the cutoff). No ticket.";
    if (c === 409) return "This login already holds its one ticket. A second one refused.";
    if (c === 429) return "Too many useless clicks from this address: slowed down.";
    return "Ticket request refused.";
  }
  if (e.endsWith("/register")) {
    if (c === 200) return "Checked the ticket's signature, then recorded one entry on the list (a repeat returns the same receipt).";
    if (c === 409) return "That ticket was already used: no second entry.";
    if (c === 410) return "The sale is closed: entry refused.";
    if (c === 400) return "The ticket did not check out (bad signature): refused.";
    if (c === 429) return "Too many useless clicks from this address: slowed down.";
    return "Entry refused.";
  }
  if (e.endsWith("/claim")) return c === 200 ? "A winner claimed their seat." : "Claim refused: not a winner, too late, or the seat is taken.";
  if (e.includes("/baseline/") && e.endsWith("/buy")) return c === 200 ? "Old way: sold a seat to whoever clicked first (up to 4 per account)." : c === 409 ? "Old way: refused, sold out or this account hit its 4-seat limit." : c === 410 ? "Old way: the sale is closed." : "Old way: purchase refused.";
  if (method === "GET") return "Read-only look at the sale. Nothing is changed.";
  return "Handled by the gateway.";
}
