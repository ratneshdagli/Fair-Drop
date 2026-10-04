"use client";
// Every test, every stage and every word, in plain language. If a word needs explaining, it is explained here.
import { Bug, Code2, FlaskConical, GitCompareArrows, Route, ShieldCheck, Swords, Terminal, type LucideIcon } from "lucide-react";
import { STAGE, STATES } from "@/components/ui";
import { Panel, PAL } from "./kit";

const TESTS: { name: string; tech: string; q: string; how: string; where: string; color: string; icon: LucideIcon }[] = [
  { name: "Bot attack", tech: "load test", q: "What happens when thousands of people AND bots rush the site at once?", how: "A crowd (you choose the size) plus every kind of bot tries to get tickets, first in the new fair sale and then in the old first-come-first-served sale. You watch it live.", where: "Test lab, Bot attack: press Start the attack.", color: PAL.ice, icon: Swords },
  { name: "Quick safety check", tech: "self-test", q: "Does the gate let the right people in and keep the wrong ones out?", how: "A fixed list of requests where the right answer was written down before sending: an honest person, a retry after a glitch, a fake ticket, a reused ticket, a late sign-up, a flood from one address, and so on. Each shows a tick (as expected) or a cross (a mistake).", where: "Test lab, Break-in tests (takes seconds; the table shows how many checks ran).", color: PAL.lime, icon: ShieldCheck },
  { name: "Try to break it", tech: "red team", q: "Can a clever bot owner find a way to cheat?", how: "We play the attacker with a list of real tricks, such as turning one phone number into many accounts, guessing login codes, hijacking someone’s retry, sending giant requests, or faking an address. Anything that works is a hole we must fix. The Test lab shows how many worked the first time (and were then closed) next to the live result.", where: "Test lab, Break-in tests (takes seconds; the table shows how many tricks ran).", color: PAL.warn, icon: Bug },
  { name: "Old way vs new way", tech: "before / after, counterfactual", q: "Is the new fair sale really fairer than the old one?", how: "The very same crowd is run through three ways of selling: first-come-first-served (old), a plain random lottery, and Fair Drop (new). Bars show how many seats the bots ended up with and a real person’s chance of getting one.", where: "Proof, Results, after a bot attack.", color: PAL.violet, icon: GitCompareArrows },
  { name: "Full walkthrough", tech: "smoke test", q: "Does one whole sale work from the very start to the very end?", how: "A small crowd and a handful of seats. It opens the sale, hands out tickets, lets people enter, closes, seals the list, picks winners, lets them claim, replaces two who stay silent with the next people waiting, and finally checks the safety counters are all zero and the tamper-proof log is unbroken. Prints “SMOKE OK” if everything held.", where: "Developer command: python tests/smoke.py", color: PAL.gold, icon: Route },
  { name: "Code checks", tech: "unit tests", q: "Is each small piece of the program correct on its own?", how: "Many tiny automatic checks: the maths of the sealed list, the draw giving the same winners every time, one ticket per person even if 200 requests arrive at once, seats never sold twice, a dishonest server being caught, and a regression check for every hole the red team found.", where: "Developer command: bash scripts/test.sh", color: PAL.mute, icon: Code2 },
  { name: "The 7 big experiments", tech: "attack experiments 1–7", q: "How does it behave in seven specific situations, at full size?", how: "1 a normal day with no bots · 2 bots hopping between thousands of addresses · 3 one operator buying 100, 1,000 or 10,000 accounts · 4 one human against 50,000 bot attempts · 5 the decoy trap · 6 a server dies mid-sale · 7 a dishonest server secretly drops someone. Each writes a report in the reports folder.", where: "Test lab, Tools, or bash scripts/run_all_experiments.sh", color: PAL.hot, icon: FlaskConical },
];

export default function TestsExplained() {
  return (
    <div className="space-y-6">
      <Panel title="The tests, in plain words" note="Every kind of test in this project: what question it answers, how it works, and where to run it.">
        <div className="grid gap-4 xl:grid-cols-2">
          {TESTS.map((t) => { const I = t.icon; return (
            <article key={t.name} className="rounded-[5px] border border-line bg-panel2/50 p-4" style={{ borderLeft: `4px solid ${t.color}` }}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[4px] border border-line bg-bg/60" style={{ color: t.color }}><I className="h-5 w-5" /></span>
                <div><div className="text-lg font-bold leading-tight">{t.name}</div><div className="text-xs text-mute">technical name: {t.tech}</div></div>
              </div>
              <div className="mt-3 text-[15px] font-semibold" style={{ color: t.color }}>{t.q}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{t.how}</p>
              <div className="mt-3 flex items-start gap-2 border-t border-line pt-2.5 text-sm text-mute"><Terminal className="mt-0.5 h-4 w-4 shrink-0" />{t.where}</div>
            </article>); })}
        </div>
      </Panel>
      <Panel title="The stages of a sale, in plain words" note="Every sale walks these stages in order. The old first-come-first-served sale only has four: Not open yet, Open, Closed, Finished.">
        <ol className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {STATES.map((s, i) => (
            <li key={s} className="flex gap-3"><span className="display grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/10 text-lg text-gold">{i + 1}</span>
              <span className="text-sm"><b className="text-base">{STAGE[s][0]}</b> <span className="text-xs text-mute">technical name: {s}</span><br /><span className="text-mute">{STAGE[s][1]}</span></span></li>))}
        </ol>
      </Panel>
    </div>
  );
}

const WORDS: [string, string][] = [
  ["Sale / drop", "One ticket sale for one event."],
  ["Entry", "A person's one chance in the draw. One login gets one entry."],
  ["1 login · 1 ticket · 1 seat at most", "The Fair Drop rule. One verified login gets one ticket, makes one entry, and can win at most one seat. The old way lets one login buy several seats (the server's per-account cap), and a simple lottery counts every request as a ticket."],
  ["The draw", "In the fair sale everyone eligible gets in, then a draw nobody can rig picks the winners. Clicking faster doesn’t help."],
  ["Seal the list", "Publishing a fingerprint of all entries before the draw, so nobody can add or remove entries afterwards."],
  ["First-come-first-served", "The usual way: fastest wins. Bots love it."],
  ["Bot advantage", "Bots' share of seats divided by their share of the crowd. 1 means fair. Higher means bots beat people."],
  ["Claim", "A winner confirming they want their seat. If they don't in time, the next person gets it."],
  ["Integrity check", "Automatic checks that nothing was sold twice or tampered with."],
  ["Request / click", "One message from a person’s phone or a bot to the website (“get me a ticket”, “enter me”). “Clicks per second” = requests per second."],
  ["Typical wait (p50)", "Line everyone up from fastest to slowest answer: the one in the middle. Half of people waited less than this."],
  ["Slow wait (p95)", "19 out of 20 people waited less than this. It shows what an unlucky visitor feels."],
  ["Slowest wait (p99)", "99 out of 100 waited less than this. The really unlucky 1%."],
  ["Server error (5xx)", "The website itself failed to answer properly (a crash or overload). Should be 0. Different from being turned away on purpose."],
  ["Turned away", "The rules said no on purpose: a used ticket, a fake ticket, too many clicks, sale closed, and so on. It is not a failure."],
  ["False positive", "A good request wrongly turned away: a real person blocked by mistake."],
  ["False negative", "A bad request wrongly let in: a bot that slipped through."],
  ["Rate limit (429)", "‘Slow down, try again in a second.’ A pause for someone clicking too fast, not a final no."],
  ["Decoy trap", "A fake ‘fast lane’ that only bots find. Anyone who uses it gets a worthless receipt."],
  ["Identity farm", "A bot owner who buys many real verified accounts. Each gets one entry. It costs money per account, which is the only brake."],
  ["Redis / Postgres", "Redis is the fast memory that holds the live state. Postgres is the permanent, never-edited record kept for audits."],
  ["In flight / queue", "Requests the servers are working on right now, and records waiting to be written to the permanent database."],
];

export function Glossary() {
  return (
    <Panel title="What the words mean" note="Every technical word on these screens, in plain English.">
      <dl className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {WORDS.map(([k, v]) => <div key={k} className="border-l-2 border-line pl-4"><dt className="font-semibold text-ink">{k}</dt><dd className="mt-0.5 text-sm leading-relaxed text-mute">{v}</dd></div>)}
      </dl>
    </Panel>
  );
}
