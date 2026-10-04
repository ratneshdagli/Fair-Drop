"use client";
// The narrator (one sentence about what is happening now) and the "what the backend is doing now" strip.
// Every figure is a live number from useArena(); the stage wording follows DESIGN.md.
import { Database, Cog, Router, Server } from "lucide-react";
import type { Arena } from "@/lib/arena";
import { SEATS } from "@/lib/arena";
import { Led } from "@/components/ui";
import { N, facts, narrate } from "./derive";

type Cell = { icon: typeof Server; who: string; what: string };

function backend(a: Arena): Cell[] | null {
  if (a.phase === "idle") return null;
  const f = facts(a), r = a.rates;
  const rate = a.running && r.rps > 0 ? `${N(r.rps)} requests per second` : "the incoming requests";
  const cut = a.running && r.rps > 0 ? ` ${N(r.blockedPerSec)} per second are turned away.` : "";
  const st = a.phase === "old" ? "OLD_OPEN" : a.phase === "starting" ? "SCHEDULED" : a.fairState;
  const C = (gateway: string, servers: string, redis: string, worker: string): Cell[] => [
    { icon: Router, who: "Gateway", what: gateway }, { icon: Server, who: "3 servers", what: servers }, { icon: Database, who: "Redis", what: redis }, { icon: Cog, who: "Worker", what: worker }];
  switch (st) {
    case "OLD_OPEN": return C(`Passing ${rate} straight to the servers.`, "Hand out seats in the order clicks arrive. No ID check.", `Counting seats: ${N(f.taken.fcfs)} of ${SEATS} taken.${cut}`, "Nothing to do: this method has no sealed list and no draw.");
    case "SCHEDULED": return C("Waiting. Nothing is accepted yet.", "Idle.", "Empty, ready for the first entry.", "Idle.");
    case "OPEN": return C(`Spreading ${rate} over 3 servers.`, `Each one checks ID, rate limit and one ticket per person, and signs the ticket without seeing it.${cut}`, `Recording every entry: ${N(f.entries)} so far.`, "Waiting for the sale to close.");
    case "CLOSED": return C("Refusing new entries.", "The list is frozen.", `Holds ${N(f.entries)} entries.`, "About to start sealing the list.");
    case "LOCKED": return C("Refusing new entries.", "Waiting for the fingerprint.", `Holds ${N(f.entries)} entries.`, "Building the sealed fingerprint of every entry and publishing it before the draw seed is revealed.");
    case "DRAWN": return C("Showing the result.", "Ranked all entries with the revealed seed. Anyone can re-run it.", "Holds the final list.", "The seed is revealed; the draw is done.");
    case "CLAIM": return C("Taking seat claims.", "Winners claim within a time window.", "Tracking each claim.", "Unclaimed seats pass down the waiting list.");
    case "SETTLED": return C("Quiet.", "Finished.", "Finished.", "Finished: the record is permanent in Postgres.");
    default: return null;
  }
}

export default function Narrator({ a, compact }: { a: Arena; compact?: boolean }) {
  const cells = backend(a);
  return (
    <div className="space-y-3">
      <div className="panel flex items-start gap-4 border-l-4 border-l-gold px-5 py-4">
        <Led tone={a.running ? "gold" : "mute"} pulse={!!a.running} className="mt-2.5" />
        <div className="min-w-0"><div className="eyebrow">What is happening now</div><p className={compact ? "text-lg leading-snug" : "text-xl leading-snug text-ink 2xl:text-2xl"}>{narrate(a)}</p></div>
      </div>
      {cells && (
        <div className="panel px-5 py-3">
          <div className="eyebrow mb-2 text-violet">What the backend is doing now</div>
          <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
            {cells.map((c) => (
              <li key={c.who} className="flex items-start gap-3">
                <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-violet" aria-hidden />
                <div className="min-w-0"><div className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-ink">{c.who}</div><div className="text-[13px] leading-snug text-mute">{c.what}</div></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
