"use client";
import { useState } from "react";
import { Ban, Check, Hand, ShieldCheck } from "lucide-react";
import BotGlyph from "@/components/BotGlyph";
import { BOT_HANDLING, BOT_ORDER, BOTS } from "@/components/admin/botinfo";
import { Led, cn } from "@/components/ui";
import { Chapter, Kicker, Looking, Poster, Wrap } from "./parts";

type Tone = "lime" | "warn" | "hot" | "ice";
// One short plain-words line and a verdict per kind. Everything else on the card comes straight from botinfo.ts.
const SHORT: Record<string, [string, string, Tone]> = {
  SPEED_BOT: ["Tries to be first in line.", "Capped at 1 entry", "lime"],
  FLOOD_BOT: ["Tries to drown the door in requests.", "Capped at 1 entry", "lime"],
  RETRY_BOT: ["Tries to be counted twice.", "Capped at 1 entry", "lime"],
  PROXY_ROTATOR: ["Tries to look like a thousand visitors.", "Capped at 1 entry", "lime"],
  SYBIL_OPERATOR: ["Owns many real, verified accounts.", "Not blocked, by design", "hot"],
  API_SCRAPER: ["Sneaks in through a hidden side door.", "Caught by the decoy", "warn"],
  UI_MIMIC: ["Pretends to be a slow human.", "Treated as a person", "lime"],
  CRYPTO_SWARM: ["Plays by the real rules, in bulk.", "Capped at 1 entry", "lime"],
  SMART_SCRAPER: ["Reads our code to dodge the traps.", "Capped at 1 entry", "lime"],
  STATE_SNIPER: ["Fires at the exact second the sale opens or closes.", "Nothing gets in outside the sale", "lime"],
  CLAIM_SNIPER: ["Tries to steal a seat in the claiming window.", "No seat given twice", "lime"],
  HUMAN: ["Just wants a ticket.", "Everyone eligible gets in", "ice"],
};
// "Controls / can never control", worded from each bot's does / stoppedBy / expect text in botinfo.ts
const CTRL: Record<string, [string[], string[]]> = {
  SPEED_BOT: [["its speed: it clicks the instant the sale opens", "how many clicks it keeps sending"], ["a second entry for its account", "a better place for arriving first"]],
  FLOOD_BOT: [["how many mixed requests its one account sends", "how hard it tries to overload the site"], ["a second ticket: every extra one is refused", "getting its flood through at full speed"]],
  RETRY_BOT: [["how often it re-sends the same request", "how many copies it fires at once"], ["being counted twice", "using a used ticket again"]],
  PROXY_ROTATOR: [["which internet address each request comes from"], ["the one-per-person rule, which never looks at addresses", "a second entry, however many addresses it uses"]],
  SYBIL_OPERATOR: [["how many real verified accounts it bought", "using every one of them properly"], ["its place in the draw", "more than 1 entry per account", "the sealed list or the seed"]],
  API_SCRAPER: [["whether it finds and takes the hidden fast endpoint"], ["a real entry: the decoy gives it a worthless receipt"]],
  UI_MIMIC: [["how slowly and human-like it walks the steps"], ["more than 1 entry per account", "any edge from looking human"]],
  CRYPTO_SWARM: [["making real tickets itself, with the real maths, for many accounts"], ["more than 1 entry per account", "slowing the real path for real people"]],
  SMART_SCRAPER: [["reading our code to find the real steps", "avoiding the decoy", "which addresses it uses, and how fast it runs"], ["the one-entry-per-account rule", "any way around the rule everyone else obeys"]],
  STATE_SNIPER: [["when it fires: bursts right around opening and closing"], ["the clock: the server alone decides open or closed", "an accepted entry outside the sale"]],
  CLAIM_SNIPER: [["when and how often it presses claim"], ["its place in the draw: a seat belongs to a place, not a click", "a seat given to two people"]],
  HUMAN: [["one device, one attempt, polite retries"], ["a better place by clicking faster"]],
};
const GROUPS: { k: string; title: string; sub: string; ids: string[]; danger?: boolean }[] = [
  { k: "01", title: "Speed and volume", sub: "Try to win by being faster and louder.", ids: ["SPEED_BOT", "FLOOD_BOT", "RETRY_BOT", "PROXY_ROTATOR"] },
  { k: "02", title: "Disguise", sub: "Try to look like ordinary people.", ids: ["UI_MIMIC", "CRYPTO_SWARM"] },
  { k: "03", title: "Smart attackers", sub: "Read our site and look for the side doors.", ids: ["API_SCRAPER", "SMART_SCRAPER"] },
  { k: "04", title: "Timing attackers", sub: "Aim for one exact moment.", ids: ["STATE_SNIPER", "CLAIM_SNIPER"] },
  { k: "05", title: "The one we cannot block, by design", sub: "It does nothing wrong: every account is real and verified.", ids: ["SYBIL_OPERATOR"], danger: true },
];
const verdict = { lime: "border-lime/30 bg-lime/10 text-lime", warn: "border-warn/35 bg-warn/10 text-warn", hot: "border-hot/40 bg-hot/10 text-hot", ice: "border-ice/35 bg-ice/10 text-ice" };

const verdictText = { lime: "text-lime", warn: "text-warn", hot: "text-hot", ice: "text-ice" };

function Tile({ id, on, onPick }: { id: string; on: boolean; onPick: (id: string, e: "hover" | "click") => void }) {
  const b = BOTS[id], [line, v, tone] = SHORT[id];
  return (
    <button type="button" aria-expanded={on} onMouseEnter={() => onPick(id, "hover")} onFocus={() => onPick(id, "hover")} onClick={() => onPick(id, "click")}
      className={cn("group relative flex w-full items-center gap-3 overflow-hidden rounded-[5px] border p-3.5 text-left transition duration-150 hover:bg-[#171126]", on ? "border-gold/80 bg-[#171126]" : "border-[#3a3057] bg-[rgba(10,7,20,.94)]")}>
      <i className="absolute inset-y-0 left-0 w-1" style={{ background: b.color, opacity: on ? 1 : 0.55 }} />
      <span className="ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-[4px] border border-line bg-bg" style={{ boxShadow: on ? `0 0 18px -4px ${b.color}` : undefined }}><BotGlyph id={id} size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight text-[#f4f0ff]">{b.name}</span>
        <span className="mt-0.5 block text-[15px] leading-snug text-[#cfc7e6]">{line}</span>
        <span className={cn("mt-1.5 flex items-center gap-1.5 font-mono text-[12px] font-bold uppercase tracking-wider", verdictText[tone])}><Led tone={tone} />{v}</span>
      </span>
    </button>
  );
}

function Detail({ id, compact }: { id: string; compact?: boolean }) {
  const b = BOTS[id], [line, v, tone] = SHORT[id], [can, cannot] = CTRL[id];
  const human = id === "HUMAN", H = BOT_HANDLING[id];
  return (
    <div className={cn("overflow-hidden rounded-[6px] border", compact ? "mt-1" : "")} style={{ borderColor: b.color + "44", background: "rgba(10,7,20,.93)" }}>
      <div className="flex items-start gap-4 border-b border-line/70 p-5" style={{ background: `linear-gradient(90deg, ${b.color}22, transparent)` }}>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[5px] border bg-bg" style={{ borderColor: b.color + "44", boxShadow: `0 0 28px -6px ${b.color}` }}><BotGlyph id={id} size={30} /></span>
        <div className="min-w-0">
          <div className="display text-4xl leading-none">{b.name}</div>
          <p className="mt-1.5 text-[17px] text-[#f4f0ff]">{line}</p>
          <span className={cn("mt-2 inline-block rounded-[3px] border px-2 py-1 font-mono text-[12px] font-bold uppercase tracking-wider", verdict[tone])}>{v}</span>
        </div>
      </div>
      <dl className="space-y-5 p-5 text-[16px] leading-relaxed">
        <Row k={human ? "Who" : "How it attacks"} v={b.does} />
        <Row k="What stops it" v={human ? "Nothing to stop: a real person is welcome." : b.stoppedBy} />
        <Row k="What we expect to see" v={b.expect} />
      </dl>
      <div className="border-t border-gold/40 bg-gold/[.07] p-5">
        <div className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-[.16em] text-gold"><ShieldCheck className="h-4 w-4" />How Fair Drop handles it</div>
        <p className="mt-2 text-[17px] font-semibold leading-snug text-[#f4f0ff]">{H.layer}</p>
        <p className="mt-2 text-[16px] leading-relaxed text-[#cfc7e6]"><b className="font-mono text-[12px] uppercase tracking-[.14em] text-warn">Honest limit </b><br />{H.limit}</p>
      </div>
      <div className="grid border-t border-line/70 sm:grid-cols-2">
        <div className="space-y-2 p-5 sm:border-r sm:border-line/70">
          <div className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-[.16em] text-warn"><Hand className="h-4 w-4" />It controls</div>
          <ul className="space-y-1.5 text-[16px] leading-snug text-[#f4f0ff]">{can.map((x) => <li key={x} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-warn" />{x}</li>)}</ul>
        </div>
        <div className="space-y-2 border-t border-line/70 p-5 sm:border-t-0">
          <div className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-[.16em] text-lime"><Ban className="h-4 w-4" />It can never control</div>
          <ul className="space-y-1.5 text-[16px] leading-snug text-[#f4f0ff]">{cannot.map((x) => <li key={x} className="flex gap-2"><Ban className="mt-1 h-4 w-4 shrink-0 text-lime" />{x}</li>)}</ul>
        </div>
      </div>
      <p className="border-t border-line/70 px-5 py-3 font-mono text-[12px] uppercase tracking-[.12em] text-[#cfc7e6]">Nobody controls: the draw seed, the sealed list, or anyone&apos;s place in the draw.</p>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div><dt className="mb-1 font-mono text-[12px] font-bold uppercase tracking-[.16em] text-gold">{k}</dt><dd className="text-[#f4f0ff]">{v}</dd></div>;

export default function Bots() {
  const [sel, setSel] = useState<string | null>(null);
  const pick = (id: string, how: "hover" | "click") => {
    const desk = window.matchMedia("(min-width: 1024px)").matches;
    if (how === "hover") { if (desk) setSel(id); return; } // on touch screens only a tap opens a card
    setSel((s) => (!desk && s === id ? null : id));
  };
  const shown = sel ?? "SPEED_BOT";
  const tile = (id: string) => (
    <div key={id}>
      <Tile id={id} on={sel === id || (sel === null && shown === id)} onPick={pick} />
      {sel === id && <div className="lg:hidden"><Detail id={id} compact /></div>}
    </div>
  );
  return (
    <Chapter id="bots" idx={2} className="py-24 md:py-32">
      <Wrap>
        <div className="grid items-end gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Kicker n="02" label="Meet the bots" time="0:40" tone="hot" />
            <Poster className="mt-4"><span className="num text-hot text-glow-hot">{BOT_ORDER.length}</span> kinds of<br />bot at the door.</Poster>
          </div>
          <Looking>The full cast of attackers we built and let loose on our own system, plus a real person as the baseline. Hover (or tap) a name to see how it attacks, what stops it and what we expect. Each colour here is that bot&apos;s colour everywhere in the app.</Looking>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
          <div className="thin-scroll max-h-[78vh] space-y-6 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0" data-lenis-prevent>
            <div>
              <GroupHead k="00" title="The baseline: a real person" sub="Every other card is measured against this one." />
              <div className="mt-2">{tile("HUMAN")}</div>
            </div>
            {GROUPS.map((g) => (
              <div key={g.k} className={cn(g.danger && "rounded-[6px] border border-hot/50 p-3 [background:repeating-linear-gradient(135deg,rgba(255,59,92,.09)_0_10px,transparent_10px_20px)]")}>
                <GroupHead k={g.k} title={g.title} sub={g.sub} danger={g.danger} />
                <div className={cn("mt-2 grid gap-2", g.ids.length > 1 && "xl:grid-cols-2")}>{g.ids.map(tile)}</div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block"><div className="sticky top-20"><Detail id={shown} /></div></div>
        </div>
        <Matrix />
      </Wrap>
    </Chapter>
  );
}

function GroupHead({ k, title, sub, danger }: { k: string; title: string; sub: string; danger?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 rounded-[4px] bg-[rgba(7,5,13,.88)] px-3 py-2">
      <span className={cn("eyebrow", danger ? "text-hot" : "text-gold")}>{k}</span>
      <div><div className={cn("display text-2xl leading-none", danger && "text-hot")}>{title}</div><div className="mt-1 text-[15px] text-[#cfc7e6]">{sub}</div></div>
    </div>
  );
}

const ROWS = ["HUMAN", ...BOT_ORDER];
function Matrix() {
  const head = "font-mono text-[12px] font-bold uppercase tracking-[.16em]";
  return (
    <div className="mt-16" style={{ background: "rgba(10,7,20,.93)" }}>
      <div className="border border-gold/40 p-5 md:p-6">
        <div className={cn(head, "text-gold")}>Handling matrix</div>
        <div className="display mt-1 text-3xl md:text-4xl">What each one tries, and what answers it</div>
        <p className="mt-2 max-w-3xl text-[16px] text-[#cfc7e6]">Fair Drop caps entries per verified person. It does not stop someone who owns many real verified accounts: that row is the one honest gap.</p>
      </div>
      <div className="hidden border-x border-line md:grid md:grid-cols-[1.1fr_1.4fr_2fr_1.3fr]">
        {["Who", "What it tries", "The defence that answers it", "Result"].map((h) => <div key={h} className={cn(head, "border-b border-line bg-[#171126] px-4 py-3 text-[#cfc7e6]")}>{h}</div>)}
      </div>
      <div className="border border-line md:border-t-0">
        {ROWS.map((id) => {
          const b = BOTS[id], H = BOT_HANDLING[id], [, v, tone] = SHORT[id];
          return (
            <div key={id} className={cn("grid gap-x-4 gap-y-2 border-b border-line px-4 py-4 text-[15px] leading-snug text-[#f4f0ff] last:border-b-0 md:grid-cols-[1.1fr_1.4fr_2fr_1.3fr]", id === "SYBIL_OPERATOR" && "bg-hot/[.08]")}>
              <div className="flex items-center gap-2.5 text-[16px] font-semibold"><BotGlyph id={id} size={20} />{b.name}</div>
              <div><span className={cn(head, "block text-[#cfc7e6] md:hidden")}>What it tries</span>{H.tries}</div>
              <div><span className={cn(head, "block text-[#cfc7e6] md:hidden")}>Defence</span>{H.layer}</div>
              <div className={cn("font-semibold", verdictText[tone])}><span className={cn(head, "block text-[#cfc7e6] md:hidden")}>Result</span>{v}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
