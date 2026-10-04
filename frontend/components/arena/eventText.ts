// Plain-language wording for one live event. Shared by the "watch the bots work" panel.
import type { LiveEvent } from "@/lib/arena";

// what the account did, and how it ended (key = stage/outcome from the live feed)
const SAY: Record<string, string> = {
  "token/ok": "asked for a ticket → got one",
  "token/already_issued": "asked for a second ticket → refused",
  "token/ineligible": "tried to join but signed up too late → refused",
  "token/closed": "came after the sale closed → refused",
  "token/not_open": "came before the sale opened → refused",
  "register/ok": "got into the draw",
  "register/replay": "sent the same request again → same receipt, no second entry",
  "register/spent": "tried to reuse a used ticket → refused",
  "register/closed": "came after the sale closed → refused",
  "register/bad_sig": "sent a fake ticket → refused",
  "tarpit/tarpit": "fell for the decoy trap",
  "buy/ok": "bought a seat (old way)",
  "buy/capped": "hit the per-account limit (old way) → refused",
  "buy/closed": "came after the sale closed → refused",
  "buy/soldout": "was told: sold out",
  "limit/ip": "sent too many clicks from one address → slowed down",
  "limit/account": "sent too many clicks from one account → slowed down",
};
const SUFFIX: Record<LiveEvent["v"], string> = { accepted: "→ let in", rejected: "→ refused", decoy: "→ trapped", absorbed: "→ ignored" };

export const sayEvent = (e: LiveEvent): string => SAY[e.s + "/" + e.o] || `${e.s} ${e.o} ${SUFFIX[e.v] || ""}`.trim();

export const verdictColor = (v: string): string =>
  v === "accepted" ? "#22c55e" : v === "rejected" ? "#ef4444" : v === "decoy" ? "#a855f7" : "#8fa1b8";

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
