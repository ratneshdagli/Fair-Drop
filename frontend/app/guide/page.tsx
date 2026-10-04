import Link from "next/link";
import { Eyebrow, Led } from "@/components/ui";

const STEPS: [string, string, string, string, string][] = [
  ["Before", "Tab 2 · /live", "Sign in (admin / admin-demo-pass), press Run the 4-minute show. It takes about 5 minutes, so start it first.", "", "/live"],
  ["0:00", "Tab 1 · / (hero)", "Scroll slowly.", "500 seats, 50,000 fans, and bots that click faster than humans.", "/"],
  ["0:40", "The bots chapter", "Hover two or three bots (Speed bot, Identity farm).", "Eleven kinds of attacker. Each card says what it controls and what it can never control.", "/"],
  ["1:20", "The fan's journey", "Scroll through the steps.", "Show ID once, get one ticket the server never sees, enter, list sealed, public draw, claim.", "/"],
  ["2:00", "Three methods", "Point at the three posters.", "First-come: speed wins. Lottery: more requests, more tickets. Fair Drop: 1 login, 1 ticket, 1 seat at most.", "/"],
  ["2:40", "What we do", "Scroll the protection layers and the stage strip.", "Defences keep the site alive. They never decide who wins.", "/"],
  ["3:00", "Switch to Tab 2 · /live", "Show the three doors, then the verdict bars.", "Same crowd, same 500 seats, three doors. Red diamonds are bots, blue circles are people.", "/live"],
  ["3:20", "/live, lower down", "Hover a bot card, open Follow one person, glance at the traffic log.", "Every line is a real request recorded by the server.", "/live"],
  ["3:40", "/architecture", "Press A fan enters the draw, then switch to Live.", "Gateway spreads requests over three servers; Redis is fast, Postgres is the record.", "/architecture"],
  ["3:50", "/verify or /admin", "Re-run a draw in your own browser, or open the control room.", "Don't trust us: check it yourself.", "/verify"],
];

export default function Guide() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-3">
        <Eyebrow className="text-gold">Judge&apos;s tour</Eyebrow>
        <h1 className="display text-5xl md:text-7xl">Four minutes, start to end</h1>
        <p className="max-w-2xl text-mute">Say this first: <b className="text-ink">one login = one entry = at most one seat.</b> In the old first-come sale one account can take several seats (the server's per-account cap); in the simple lottery every request is a ticket.</p>
      </div>
      <ol className="space-y-3">
        {STEPS.map(([t, where, doit, say, href], i) => (
          <li key={i} className="panel grid gap-3 p-4 md:grid-cols-[84px_1fr_auto] md:items-center">
            <div className="display text-3xl text-gold">{t}</div>
            <div className="space-y-1">
              <div className="eyebrow">{where}</div>
              <div><b>Do:</b> {doit}</div>
              {say && <div className="text-mute"><b className="text-ink">Say:</b> &ldquo;{say}&rdquo;</div>}
            </div>
            <Link href={href} className="inline-flex items-center gap-2 rounded-[4px] border border-line px-3 py-2 font-mono text-xs uppercase tracking-wider text-mute hover:border-gold hover:text-gold"><Led tone="gold" />Open</Link>
          </li>
        ))}
      </ol>
      <p className="text-sm text-mute">Honest limits if asked: an owner of many real verified accounts still gets one entry per account (cost is the only brake); most simulated people use a test shortcut for the ticket; measured on one laptop.</p>
    </div>
  );
}
