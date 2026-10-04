// The numbered booking pipeline of each door: plain-words copy plus the REAL live count of each station.
// A station only gets a count when the data really has one; otherwise it shows the name alone.
import type { Arena } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import { Count, StState, facts, fairStates, fcfsStates, naiveStates, N, MethodKey } from "./derive";

export type Station = { title: string; line: string; what: string; pass: string; stop: string; state: StState; counts: Count[] };

type Copy = Omit<Station, "state" | "counts">;

const ALL_RUSH: Copy = {
  title: "Everyone rushes the door",
  line: "The whole crowd arrives at once: real people and bots.",
  what: "Real people and bots all open the booking page the moment the sale starts.",
  pass: "Everyone.", stop: "Nobody yet.",
};

const COPY: Record<MethodKey, Copy[]> = {
  fcfs: [
    ALL_RUSH,
    { title: "Click Buy", line: "No identity check at all.", what: "Each click goes straight to the server. The server never asks who you are.", pass: "Every click.", stop: "Nothing is checked here, so a bot can click thousands of times a second." },
    { title: "First click gets the seat", line: "One account can take several.", what: "Seats are handed out in the order the clicks arrive.", pass: "The fastest clicks.", stop: "Everyone slower than the fastest. That is usually real people: bots click faster." },
    { title: "Sold out", line: "All 500 seats are gone.", what: "When the 500th seat is taken the door shuts.", pass: "Nobody more.", stop: "Everyone who is still clicking." },
  ],
  naive: [
    ALL_RUSH,
    { title: "Every request is a ticket in the hat", line: "A bot sending 100 requests holds 100 tickets.", what: "The lottery counts every request as one ticket, not every person. So whoever sends the most requests holds the most tickets.", pass: "Every request.", stop: "Nothing: the hat does not check who you are." },
    { title: "Random draw", line: "The hat is shaken once the sale is over.", what: "Tickets are pulled at random. Fair-looking, but a bot with 100 tickets has 100 chances.", pass: "Random tickets.", stop: "Random tickets: a person with one ticket is simply outnumbered." },
    { title: "Winners", line: "500 tickets are pulled, those people get seats.", what: "The owners of the 500 pulled tickets get the seats.", pass: "The 500 pulled tickets.", stop: "Everyone else." },
  ],
  fair: [
    { title: "Waiting room", line: "Everyone queues. Arriving first gives no edge.", what: "The crowd waits in a queue. Joining in second 1 or in the last minute gives exactly the same chance.", pass: "Everyone can queue.", stop: "Floods of useless clicks are slowed down." },
    { title: "ID scan", line: "A verified phone, before the cutoff.", what: "The server checks that you verified your phone number before the sale's cutoff time.", pass: "People who verified in time.", stop: "Accounts made too late and visitors who never verified." },
    { title: "One ticket per person", line: "The server signs it blind.", what: "Each verified person gets exactly one ticket. The server signs it without being able to link it to you afterwards (a blind signature).", pass: "The first ticket request of each person.", stop: "Any second ticket request: a bot asking again and again is refused." },
    { title: "Enter with the ticket, get a receipt", line: "A genuine ticket buys one entry.", what: "You hand in your ticket to enter the draw and receive a signed receipt as proof.", pass: "A genuine ticket that was not used before.", stop: "Fake, altered or already-used tickets, and anyone who takes the decoy shortcut that only bots find." },
    { title: "Sale closes: list sealed", line: "Nobody can add, remove or swap an entry.", what: "When the sale ends, the list of entries is locked and its fingerprint is published (a Merkle root, if you want the technical name).", pass: "Every entry already on the list.", stop: "Anything late, and any change to the list." },
    { title: "Public draw", line: "Random, and anyone can re-run it.", what: "Winners are picked at random from the sealed list, in a way anyone can repeat and check.", pass: "The winners.", stop: "Nobody can buy, hurry or rig their way in." },
    { title: "Claim seat + QR ticket", line: "Winners claim, with a QR ticket.", what: "Winners claim their seat within a short time and get a QR-code ticket. Unclaimed seats go to the next person on the waiting list.", pass: "Winners.", stop: "Seats nobody claims pass on to the next person." },
  ],
};

export function stationsFor(key: MethodKey, a: Arena): Station[] {
  const f = facts(a);
  const c: Count[][] = COPY[key].map(() => []);
  const states = key === "fair" ? fairStates(a) : key === "fcfs" ? fcfsStates(a) : naiveStates(a);
  const m = a.methods[key];
  const sealed = ["LOCKED", "DRAWN", "CLAIM", "SETTLED"].includes(a.fairState);

  if (key === "fair" && a.crowd.total > 0) {
    c[0] = [{ v: a.crowd.total, label: "accounts at the door", tone: "ice" }];
    if (f.reason("rate_limited") > 0) c[0].push({ v: f.reason("rate_limited"), label: "flood clicks slowed", tone: "warn" });
    c[1] = [{ v: f.reason("not_eligible"), label: "turned away at the scan", tone: "hot" }];
    c[2] = [{ v: f.reason("already_issued"), label: "second tickets refused", tone: "hot" }];
    c[3] = [{ v: f.entries, label: "entries received", tone: "lime" }, { v: f.reason("token_already_used") + f.reason("forged_signature"), label: "fake or used tickets", tone: "hot" }];
    if (f.decoy > 0) c[3].push({ v: f.decoy, label: "fell for the decoy", tone: "warn" });
    if (sealed) c[4] = [{ v: f.entries, label: "entries in the sealed list", tone: "lime" }];
    if (m.status === "final") c[5] = [{ v: m.humanSeats + m.botSeats, label: "seats drawn", tone: "lime" }];
  }
  if (key === "fcfs" && f.oldCrowd > 0 && a.oldId) {
    c[0] = [{ v: f.oldCrowd, label: "accounts at the door", tone: "ice" }];
    c[1] = [{ v: f.oldRequests, label: "clicks on Buy", tone: "mute" }];
    c[2] = [{ v: f.taken.fcfs, label: "seats taken", tone: "lime" }, { v: f.oldRefused, label: "clicks turned away", tone: "hot" }];
    if (f.taken.fcfs >= SEATS) c[3] = [{ v: SEATS, label: "seats all sold", tone: "hot" }];
  }
  if (key === "naive" && a.crowd.total > 0) {
    c[0] = [{ v: a.crowd.total, label: "accounts at the door", tone: "ice" }];
    c[1] = [{ v: f.humanTickets, label: "tickets held by real people", tone: "ice" }, { v: f.botTickets, label: "tickets held by bots", tone: "hot" }];
    if (m.status === "final") c[3] = [{ v: m.humanSeats + m.botSeats, label: "seats drawn", tone: "lime" }];
  }
  return COPY[key].map((s, i) => ({ ...s, state: states[i], counts: c[i] }));
}

/** A one-line honest caption for a door that is not running (yet). */
export function dormant(key: MethodKey, a: Arena): string {
  if (key === "fcfs" && !a.oldId) return a.running ? "Waits for its turn: it runs after the Fair Drop sale, with the very same crowd." : "No old-way run yet.";
  if (key === "fcfs" && a.oldState === "SCHEDULED") return "Getting ready: it runs right after the Fair Drop sale.";
  if (key === "naive" && a.methods.naive.status !== "final") return a.fairId ? "Has no live run of its own: it is calculated on the Fair Drop traffic once that sale closes. Waiting until then." : "";
  return "";
}

export const seatsLabel = (k: MethodKey, a: Arena) => `${N(a.methods[k].humanSeats + a.methods[k].botSeats)} of ${SEATS} seats`;
