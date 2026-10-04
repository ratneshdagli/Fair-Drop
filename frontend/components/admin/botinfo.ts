// Plain-English words for everything the control room shows. One place, so the wording stays consistent.

// why a request was turned away: [what it means, how we re-checked it]
export const REASON: Record<string, [string, string]> = {
  rate_limited: ["Too many clicks from one address", "re-checked: the server really counted more than its limit in that second"],
  token_already_used: ["Ticket already used", "re-checked: that ticket really had an earlier accepted entry"],
  already_issued: ["Asked for a second ticket", "re-checked: that person really already had one"],
  not_eligible: ["Signed up too late", "re-checked: the verification time really is after the cutoff"],
  window_closed: ["Came after the sale closed", "re-checked: the clock really was past the closing time"],
  forged_signature: ["Fake or altered ticket", "re-checked: the signature was verified again and really is invalid"],
  decoy_endpoint: ["Fell for the decoy trap", "by design the decoy never reaches the real list"],
  per_account_cap: ["Over the per-account limit (old sale)", "re-checked: the account really had the maximum"],
  sold_out: ["Sold out (old sale)", "re-checked: that tier really was sold out"],
};

export type BotInfo = { icon: string; name: string; color: string; does: string; stoppedBy: string; expect: string };

// order = the order of the lanes on the stage
export const BOT_ORDER = ["SPEED_BOT", "FLOOD_BOT", "RETRY_BOT", "PROXY_ROTATOR", "SYBIL_OPERATOR", "API_SCRAPER", "UI_MIMIC", "CRYPTO_SWARM", "SMART_SCRAPER", "STATE_SNIPER", "CLAIM_SNIPER"];

export const BOTS: Record<string, BotInfo> = {
  SPEED_BOT: { icon: "⚡", name: "Speed bot", color: "#fbbf24", does: "Clicks the very instant the sale opens and keeps hammering, with no pauses.", stoppedBy: "Speed buys nothing: arriving in second 1 or minute 59 gives the same chance. Extra clicks are ignored.", expect: "at most 1 entry per account, every extra click blocked" },
  FLOOD_BOT: { icon: "🌊", name: "Flooder", color: "#f97316", does: "One account sending hundreds of mixed requests to overload the site and grab extra tickets.", stoppedBy: "One ticket per person. Its flood is slowed by the rate limit and every extra ticket is refused.", expect: "at most 1 entry per account, the flood slowed and refused" },
  RETRY_BOT: { icon: "🔁", name: "Retry-spammer", color: "#f43f5e", does: "Re-sends the same request over and over, even several at once, hoping to be counted twice.", stoppedBy: "A repeat gets the same receipt back and no second entry. A used ticket can't be used again.", expect: "at most 1 entry per account, repeats collapsed into one" },
  PROXY_ROTATOR: { icon: "🎭", name: "Address-hopper", color: "#e879f9", does: "Uses a different internet address for every request so the per-address limit never notices it.", stoppedBy: "The address limit isn't what stops it. The ticket is: one per verified person, however many addresses it uses.", expect: "at most 1 entry per account, address-hopping makes no difference" },
  SYBIL_OPERATOR: { icon: "🏭", name: "Identity farm", color: "#fb7185", does: "Bought many real, verified accounts and uses every one of them properly.", stoppedBy: "Not stopped, by design: each bought account gets exactly one entry like a person. The only defence is cost (each account costs money).", expect: "1 entry per bought account: the one thing we cannot block (it costs money)" },
  API_SCRAPER: { icon: "🕷️", name: "Shortcut seeker", color: "#a78bfa", does: "Reads the website's API, spots a hidden 'fast' endpoint and uses it.", stoppedBy: "The decoy trap: it burns its ticket and gets a convincing but worthless receipt.", expect: "0 entries: it takes the decoy and gets a worthless receipt" },
  UI_MIMIC: { icon: "🥸", name: "Human mimic", color: "#fdba74", does: "Walks through the real steps slowly, like a person would.", stoppedBy: "Looks exactly like a person, so it is treated like one: one entry per account, no more.", expect: "looks human, so 1 entry per account like a person" },
  CRYPTO_SWARM: { icon: "🔐", name: "Real-ticket bot", color: "#a3e635", does: "Makes its own ticket the real way, doing the secret-code maths itself with no shortcut, for many accounts at once.", stoppedBy: "Nothing to stop: a ticket made the real way is a normal ticket, so it gets one entry per account like a person. This shows the real ticket path holds up under bot load.", expect: "1 entry per account, and the real ticket path stays fast for real people" },
  SMART_SCRAPER: { icon: "🧠", name: "Careful scraper", color: "#818cf8", does: "Reads the website's code, finds the real steps, avoids anything that looks like a shortcut, then runs the proper steps fast from many internet addresses.", stoppedBy: "Not caught by the decoy, because it never touches it. It is held by the same rule as everyone: one entry per verified account, however fast or from however many addresses.", expect: "1 entry per account, it avoids the decoy, so the decoy is not what stops it" },
  STATE_SNIPER: { icon: "🎯", name: "Boundary sniper", color: "#f9a8d4", does: "Syncs to the server's clock and fires bursts of requests in the fraction of a second around the sale opening and closing, trying to slip in just before or just after.", stoppedBy: "The server decides open or closed with one clock, inside the same step that records the entry. Anything accepted is in the sealed list; anything late is refused.", expect: "nothing accepted outside the sale, every accepted entry in the sealed list (0 violations)" },
  CLAIM_SNIPER: { icon: "🏹", name: "Seat sniper", color: "#cbd5e1", does: "Enters normally, then hammers the 'claim my seat' button for the whole claiming time, trying to grab a seat the instant someone else's reservation runs out.", stoppedBy: "A seat belongs to a place in the draw, not to whoever clicks first. A waiting-list seat only opens for the next person in line, and one seat can never go to two people.", expect: "its draw place alone decides, no seat given twice (0 double-booked)" },
  HUMAN: { icon: "🧑", name: "Real person", color: "#38bdf8", does: "A real person, one device, one attempt, polite retries.", stoppedBy: "", expect: "everyone eligible gets in" },
};

export const n = (x: any) => (Number(x) || 0).toLocaleString();
export const ms = (x: number) => (x >= 1000 ? (x / 1000).toFixed(2) + " s" : Math.round(x) + " ms");

// the reason a decision was a "no", from the feed's stage/outcome (same keys as REASON)
export const reasonOf = (s: string, o: string): string => ({
  "limit/ip": "rate_limited", "limit/account": "rate_limited", "register/spent": "token_already_used", "token/already_issued": "already_issued",
  "token/ineligible": "not_eligible", "token/closed": "window_closed", "token/not_open": "window_closed", "register/closed": "window_closed", "buy/closed": "window_closed",
  "register/bad_sig": "forged_signature", "tarpit/tarpit": "decoy_endpoint", "buy/capped": "per_account_cap", "buy/soldout": "sold_out",
} as Record<string, string>)[s + "/" + o] || "";

// the words popped up at the gate when a request is turned away
export const SHORT: Record<string, string> = {
  rate_limited: "Too many clicks", token_already_used: "Ticket already used", already_issued: "Second ticket refused", not_eligible: "Signed up too late",
  window_closed: "Sale closed", forged_signature: "Fake ticket", decoy_endpoint: "Decoy trap!", sold_out: "Sold out", per_account_cap: "Limit reached",
};

// The protection, as the layers a request meets in order. `keys` are the reasons (REASON keys) that each layer produces.
export const LAYERS: { icon: string; name: string; asks: string; stops: string; keys: string[]; color: string }[] = [
  { icon: "🪪", name: "Real, verified person", asks: "Did you verify with a phone number before the deadline?", stops: "People who sign up after the cutoff; unverified visitors cannot even ask for a ticket.", keys: ["not_eligible"], color: "#38bdf8" },
  { icon: "🎟️", name: "One ticket per person", asks: "Have you already been given your ticket?", stops: "Anyone asking for a second ticket, however fast or from wherever.", keys: ["already_issued"], color: "#22c55e" },
  { icon: "✍️", name: "Genuine ticket", asks: "Is this ticket really signed by the server?", stops: "Forged or altered tickets.", keys: ["forged_signature"], color: "#ef4444" },
  { icon: "♻️", name: "One use per ticket", asks: "Has this ticket already been used to enter?", stops: "Repeats and duplicates: one ticket can only ever make one entry.", keys: ["token_already_used"], color: "#ec4899" },
  { icon: "🚦", name: "Slow down", asks: "Are you sending an unusual number of useless requests from one address?", stops: "Floods. Only useless requests count, so real neighbours on the same address are not blocked.", keys: ["rate_limited"], color: "#eab308" },
  { icon: "🪤", name: "Decoy trap", asks: "Did you take the fake fast lane that only bots find?", stops: "Scrapers that read the API and take the shortcut.", keys: ["decoy_endpoint"], color: "#a855f7" },
  { icon: "⏰", name: "Sale window", asks: "Is the sale open right now?", stops: "Anything before opening or after closing.", keys: ["window_closed"], color: "#f97316" },
  { icon: "🔒", name: "Sealed list + public draw", asks: "(after the sale) Is the final list locked and the draw checkable?", stops: "Nothing needs stopping here: nobody can add, remove or reorder entries, and speed gives no advantage.", keys: [], color: "#2dd4bf" },
  { icon: "🏷️", name: "Old sale: sold out / limit", asks: "(old way only) Is there any seat left, is this account over its cap?", stops: "In the old first-come sale, the only protection is running out of seats, which is what hurts real people.", keys: ["sold_out", "per_account_cap"], color: "#94a3b8" },
];

// ── additive (admin control room): who controls what ──
// [what the bot controls, what it can never control]
export const BOT_CONTROL: Record<string, [string, string]> = {
  SPEED_BOT: ["how fast it clicks and how many clicks it sends", "its place in the draw, or a second entry for one account"],
  FLOOD_BOT: ["how many requests one account sends", "a second ticket, or its place in the draw"],
  RETRY_BOT: ["how often it repeats the same request", "a second entry: repeats collapse into one"],
  PROXY_ROTATOR: ["which internet address each request comes from", "its account: one ticket per login, whatever the address"],
  SYBIL_OPERATOR: ["how many real verified accounts it buys", "more than one entry per account, or its place in the draw"],
  API_SCRAPER: ["which endpoints it calls (it takes the shortcut)", "a real entry: the decoy gives a worthless receipt"],
  UI_MIMIC: ["how slowly and humanly it behaves", "anything beyond one entry per account"],
  CRYPTO_SWARM: ["how many accounts it runs, and it makes its own tickets", "a second ticket per account, or the draw secret"],
  SMART_SCRAPER: ["whether it avoids the decoy, and which addresses it uses", "more than one entry per account, or the sealed list"],
  STATE_SNIPER: ["exactly when it fires around opening and closing", "getting in outside the sale window, or the sealed list"],
  CLAIM_SNIPER: ["when it presses claim", "a seat that is not its draw place, or one seat for two people"],
  HUMAN: ["when they join and how often they retry", "nothing special: the same one entry as everyone"],
};

// what the backend is doing at each stage of the fair sale, and who is in control then (old way: BACKEND_NOW_OLD)
export const BACKEND_NOW: Record<string, string> = {
  SCHEDULED: "Waiting. Nothing is accepted yet.",
  OPEN: "The gateway spreads requests over the web servers. Each one checks ID, the rate limit and one ticket per person, signs the ticket without seeing it, and records the entry in Redis.",
  CLOSED: "New entries are refused. The list is frozen.",
  LOCKED: "The worker builds the sealed fingerprint (Merkle root) of every entry and publishes it before the draw secret is revealed.",
  DRAWN: "The secret is revealed and the server ranks every entry. Anyone can re-run it.",
  CLAIM: "Winners claim within a time window. Unclaimed seats pass down the waiting list.",
  SETTLED: "Finished. The record is permanent in Postgres.",
};
export const BACKEND_NOW_OLD: Record<string, string> = {
  SCHEDULED: "Waiting. Nothing is sold yet.",
  OPEN: "First click wins. Each click is checked against the seats left and the per-account limit. Nothing checks who is a bot.",
  CLOSED: "No more buying. Remaining seats are held.",
  SETTLED: "Finished. The record is permanent in Postgres.",
};
export const BACKEND_CONTROL: Record<string, string> = {
  SCHEDULED: "Admins decide when the sale opens.",
  OPEN: "Admins can only advance the phase. Nobody can pick winners or change an entry.",
  CLOSED: "Admins can only move on to sealing. Nobody can add or remove entries.",
  LOCKED: "Admins can only start the draw. The list cannot change, and the secret was committed before the sale.",
  DRAWN: "Nobody picks winners: the draw depends only on the secret and the sealed list.",
  CLAIM: "Winners decide whether to claim. Admins cannot change who won.",
  SETTLED: "Nothing left to control: the record is read-only.",
};

// ── additive (landing page, bots chapter): how Fair Drop handles each kind ──
// tries = one plain line of what it attempts; layer = the defence that answers it; limit = the honest limit. Facts from docs/RED_TEAM.md and the lines above.
export const BOT_HANDLING: Record<string, { tries: string; layer: string; limit: string }> = {
  SPEED_BOT: { tries: "Be first in line, then keep clicking.", layer: "One ticket per verified person. The draw ignores arrival time.", limit: "Nothing to limit: speed buys no advantage, and it still gets its one entry like anyone." },
  FLOOD_BOT: { tries: "Drown the door in hundreds of mixed requests.", layer: "Rate limit on useless requests, plus one ticket per verified person.", limit: "The rate limit only slows the flood. The one-ticket rule is what caps it at 1." },
  RETRY_BOT: { tries: "Re-send the same request to be counted twice.", layer: "Single-use ticket: a repeat gets the same receipt back.", limit: "None found: one ticket can only ever make one entry." },
  PROXY_ROTATOR: { tries: "Change internet address on every request.", layer: "One ticket per verified person. It never looks at addresses.", limit: "A per-address limit alone would miss it. Identity does the work, not the address." },
  SYBIL_OPERATOR: { tries: "Use many real, verified accounts, all properly.", layer: "Only the cost of each verified account. Fair Drop caps entries per person.", limit: "NOT stopped. Fair Drop does not stop someone who owns many real verified accounts: each gets one entry." },
  API_SCRAPER: { tries: "Find and use a hidden fast endpoint.", layer: "Decoy trap: it gets a convincing but worthless receipt.", limit: "Only catches a bot that finds the decoy. Our site code never names it." },
  UI_MIMIC: { tries: "Walk the real steps slowly, like a person.", layer: "Treated as a person: one ticket per verified account.", limit: "It cannot be told from a person, so it gets no more and no less than one entry." },
  CRYPTO_SWARM: { tries: "Make real tickets itself, in bulk.", layer: "The real blind-signed ticket path: single use, one per verified person.", limit: "A real ticket is a normal ticket, so it is not blocked. It still gets 1 entry per account." },
  SMART_SCRAPER: { tries: "Read our code, skip the decoy, run fast from many addresses.", layer: "One ticket per verified person. The decoy never touches it.", limit: "The decoy is not what stops it. Only the identity rule limits it to 1." },
  STATE_SNIPER: { tries: "Fire bursts just before opening and just after closing.", layer: "Sale window rules: the server's one clock decides, in the same step that records the entry. Sealed list.", limit: "Tested with the schedule announced to the bots. The check covers tickets and entries, not claims." },
  CLAIM_SNIPER: { tries: "Hammer claim to steal a seat the instant a reservation ends.", layer: "Claim window rules: a seat belongs to a draw place, and each claim is one atomic step.", limit: "Claim requests are judged by integrity counters, not the decision feed. Its 50 ms rounds are not an exact-millisecond race." },
  HUMAN: { tries: "Get a ticket: one device, one attempt, polite retries.", layer: "Nothing to stop. A real person is welcome.", limit: "None." },
};
