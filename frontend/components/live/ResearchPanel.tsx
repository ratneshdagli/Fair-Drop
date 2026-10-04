"use client";
// HOW THE RESEARCH SCORES THIS: the industry way to score a bot-detection gate (from the research review): false-positive rate first,
// precision/recall instead of plain accuracy, and "does the crowd arrive like people?" (flash crowd vs botnet).
// Everything is computed from the judge's records of THIS test, nothing is typed in. Fair Drop does not allocate by detection
// (it caps entries per verified person), so these numbers show how clean the gate is, not what the fairness rests on.
import { useMemo } from "react";
import type { Arena, Science } from "@/lib/arena";
import { BOT_ORDER, n } from "@/components/admin/botinfo";
import BotGlyph from "@/components/BotGlyph";
import { Eyebrow, SectionHead, cn } from "@/components/ui";
import { kindName } from "./botText";

const num = (x: any) => Number(x) || 0;
export const pc = (x: number, d = 2) => (Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "-");

export function confMetrics(c: any) {
  const TP = num(c.TP), FP = num(c.FP), FN = num(c.FN), TN = num(c.TN), N = TP + FP + FN + TN;
  const P = TP + FN, Neg = FP + TN;
  const precision = TP + FP ? TP / (TP + FP) : NaN, recall = P ? TP / P : NaN, fpr = Neg ? FP / Neg : NaN, tnr = Neg ? TN / Neg : NaN;
  return {
    TP, FP, FN, TN, N, positives: P, negatives: Neg, imbalance: N ? P / N : NaN, precision, recall, fpr,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : NaN,
    accuracy: N ? (TP + TN) / N : NaN, balanced: P && Neg ? (recall + tnr) / 2 : NaN,
    upper: FP === 0 && Neg ? 3 / Neg : NaN,   // "rule of three": with 0 errors in N tries, the true rate is below 3/N (95% confidence)
  };
}

// arrival pattern of one kind: per-second request counts -> busiest second, burstiness (variance / mean), KL distance and correlation to the real people's arrivals
function arrival(series: number[], people: number[]) {
  const L = Math.max(series.length, people.length);
  const a = Array.from({ length: L }, (_, i) => series[i] || 0), h = Array.from({ length: L }, (_, i) => people[i] || 0);
  const tot = a.reduce((x, y) => x + y, 0), htot = h.reduce((x, y) => x + y, 0);
  if (!tot || !htot || L < 3) return null;
  const first = a.findIndex((v) => v > 0);
  const act = a.slice(first), mean = act.reduce((x, y) => x + y, 0) / act.length, varr = act.reduce((x, y) => x + (y - mean) ** 2, 0) / act.length;
  const eps = 1e-6, p = a.map((v) => v / tot + eps), q = h.map((v) => v / htot + eps), sp = p.reduce((x, y) => x + y, 0), sq = q.reduce((x, y) => x + y, 0);
  const kl = p.reduce((x, v, i) => x + (v / sp) * Math.log2(v / sp / (q[i] / sq)), 0);
  const ma = tot / L, mh = htot / L;
  const cov = a.reduce((x, v, i) => x + (v - ma) * (h[i] - mh), 0), sa = Math.sqrt(a.reduce((x, v) => x + (v - ma) ** 2, 0)), sh = Math.sqrt(h.reduce((x, v) => x + (v - mh) ** 2, 0));
  return { total: tot, peak: Math.max(...a), burst: mean ? varr / mean : 0, kl, corr: sa && sh ? cov / (sa * sh) : NaN };
}

/** one dial: big number, its plain name, and what it means */
function Dial({ name, value, means, tech }: { name: string; value: string; means: string; tech: string }) {
  return (
    <div className="border-t border-line pt-2.5" title={tech}>
      <div className="flex items-baseline justify-between gap-3"><span className="text-[13px] font-semibold text-ink">{name}</span><span className="display num text-2xl text-ink">{value}</span></div>
      <p className="mt-0.5 text-xs leading-[17px] text-mute"><span className="font-mono text-[10px] uppercase tracking-wider text-gold/80">What this means </span>{means}</p>
    </div>
  );
}

function Gate({ title, accent, s }: { title: string; accent: "gold" | "hot"; s: Science | null }) {
  const m = useMemo(() => (s ? confMetrics(s.all) : null), [s]);
  const hm = useMemo(() => (s ? confMetrics(s.human) : null), [s]);
  const top = accent === "gold" ? "bg-gold" : "bg-hot";
  if (!m || !m.N) return <div className="panel overflow-hidden"><div className={cn("h-1.5", top)} /><div className="p-5 text-sm text-mute"><div className="eyebrow" style={{ color: accent === "gold" ? "#ffc233" : "#ff3b5c" }}>{title}</div><p className="mt-3">No decisions graded yet. The old way is judged once its sale has run.</p></div></div>;
  const people = hm && hm.negatives ? hm : m;
  const strict = Number.isFinite(people.upper) ? (people.upper <= 0.001 ? "ok" : "short") : people.FP ? "bad" : "short";
  return (
    <div className="panel overflow-hidden">
      <div className={cn("h-1.5", top)} />
      <div className="p-5">
        <div className="eyebrow" style={{ color: accent === "gold" ? "#ffc233" : "#ff3b5c" }}>{title}</div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-1" title="False-positive rate: the number the research says matters most. Blocking a real fan is the worst mistake.">
          <div>
            <div className="text-[13px] font-semibold">Real people wrongly turned away</div>
            <div className="display num text-5xl" style={{ color: strict === "bad" ? "#ff3b5c" : "#b8ff4a" }}>{pc(people.fpr, 3)}</div>
            <p className="mt-1 max-w-sm text-sm leading-5 text-[#cfc7e6]">Headline metric 1, false-positive rate: blocking a real fan is the worst failure.</p>
          </div>
          <div className="num pb-1 font-mono text-xs text-mute">{n(people.FP)} of {n(people.negatives)} good requests</div>
        </div>
        <div className={cn("mt-2 rounded-[4px] border px-3 py-2 text-xs leading-[17px]", strict === "ok" ? "border-lime/30 bg-lime/10 text-lime" : strict === "bad" ? "border-hot/35 bg-hot/10 text-hot" : "border-warn/35 bg-warn/10 text-warn")}>
          {strict === "ok" ? `Strict target (under 0.1% wrongly blocked) is met: with ${n(people.negatives)} good requests and none wrongly blocked, the true rate is below ${pc(people.upper, 3)} (95% confidence).`
            : strict === "bad" ? "Some real people were wrongly turned away. See the number checks for exactly which."
            : `None wrongly blocked so far, but ${n(people.negatives)} good requests is too few to prove the strict 0.1% target (needs about 3,000).`}
        </div>

        <p className="mt-4 text-sm leading-5 text-[#cfc7e6]">Headline metric 2, precision and recall (with F1): traffic is lopsided, so these say more than plain accuracy.</p>
        <div className="mt-3 grid gap-x-8 gap-y-3 md:grid-cols-2">
          <Dial name="Bad requests caught" value={pc(m.recall)} tech="Recall" means="Of every 100 requests that should be turned away, this many were." />
          <Dial name="Turned-away requests that deserved it" value={pc(m.precision)} tech="Precision" means="Of every 100 requests turned away, this many were really bad." />
          <Dial name="Balance of the two" value={pc(m.f1)} tech="F1 score" means="One number that is only high when both of the dials above are high." />
          <Dial name="Plain accuracy" value={pc(m.accuracy)} tech="Accuracy" means="Looks great when one side dominates, which is why the research says not to rely on it." />
          <Dial name="Accuracy that ignores the imbalance" value={pc(m.balanced)} tech="Balanced accuracy" means="Gives good and bad requests equal weight, so a lopsided crowd cannot flatter it." />
          <Dial name="Share of requests that were bad" value={pc(m.imbalance, 1)} tech="Class imbalance" means="How lopsided the traffic is: how much of it was bad in the first place." />
        </div>
      </div>
    </div>
  );
}

export default function ResearchPanel({ a }: { a: Arena }) {
  const sc = a.science.fair;
  const arr = useMemo(() => {
    if (!sc) return [];
    const people = sc.arrivals["HUMAN"] || [];
    return BOT_ORDER.map((id) => ({ id, r: sc.arrivals[id] ? arrival(sc.arrivals[id], people) : null })).filter((x) => x.r);
  }, [sc]);
  const hr = useMemo(() => {
    if (!sc) return null;
    const h = sc.arrivals["HUMAN"] || [];
    return h.reduce((x, y) => x + y, 0) ? { peak: Math.max(...h), secs: h.length } : null;
  }, [sc]);
  const empty = !sc && !a.science.old;

  return (
    <section className="space-y-5">
      <SectionHead kicker="Scored the way researchers score it" title="How the research scores this">
        Bot-detection research says to judge a gate by how many real people it wrongly blocks, by precision and recall instead of plain accuracy, and by whether a bot crowd arrives differently from a human crowd. Each one is worked out below from this test. Fair Drop does not decide by spotting bots (it gives each verified person one entry), so these show how clean the gate is, not what the fairness rests on.
      </SectionHead>

      {empty ? <div className="panel border-dashed p-8 text-center text-sm text-mute">Nothing to score yet. These instruments fill in as the judge grades the first decisions of a test.</div> : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Gate title="Fair Drop gate" accent="gold" s={a.science.fair} />
            <Gate title="Old first-come-first-served sale" accent="hot" s={a.science.old} />
          </div>

          <div className="panel p-5">
            <Eyebrow className="text-gold">Do bots arrive like a human crowd?</Eyebrow>
            <div className="mt-3 grid gap-3 text-xs leading-[17px] text-mute md:grid-cols-3">
              <p><b className="text-ink">Burstiness</b> is how spiky the arrivals are per second: 1 is a steady crowd, much higher is a synchronised burst.</p>
              <p><b className="text-ink">Distance from people</b> (in bits) is how different the arrival timing is from the real people&apos;s: 0 means identical.</p>
              <p><b className="text-ink">Matches people</b> is how closely the two timelines rise and fall together: 1 is identical.</p>
            </div>
            {arr.length === 0 ? <div className="mt-3 text-sm text-mute">Not enough arrivals yet.</div> : (
              <div className="thin-scroll mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
                <thead className="text-left font-mono text-[10px] uppercase tracking-[.16em] text-mute"><tr><th className="pb-1.5 font-normal">Kind</th><th className="text-right font-normal">Busiest second</th><th className="text-right font-normal">Burstiness</th><th className="text-right font-normal">Distance from people</th><th className="text-right font-normal">Matches people</th><th className="pl-4 font-normal">Reads as</th></tr></thead>
                <tbody>{arr.map(({ id, r }) => {
                  const few = r!.total < 50, spiky = !few && (r!.burst > 8 || r!.kl > 1.5);
                  return (
                    <tr key={id} className="border-t border-line/60">
                      <td className="py-1.5 font-semibold"><span className="inline-flex items-center gap-2"><BotGlyph id={id} size={14} />{kindName(id)}</span></td>
                      <td className="num text-right">{n(r!.peak)}/s</td>
                      <td className="num text-right">{r!.burst.toFixed(1)}</td>
                      <td className="num text-right">{r!.kl.toFixed(2)}</td>
                      <td className="num text-right">{Number.isFinite(r!.corr) ? r!.corr.toFixed(2) : "-"}</td>
                      <td className={cn("pl-4 text-xs", few ? "text-mute" : spiky ? "text-warn" : "text-lime")}>{few ? `Only ${n(r!.total)} requests: too few to judge` : spiky ? "Different from people: easy to tell apart by timing" : "Arrives much like people"}</td>
                    </tr>);
                })}</tbody>
              </table></div>)}
            {hr && <p className="mt-3 text-xs text-mute">Real people: busiest second {n(hr.peak)} requests, spread over {n(hr.secs)} seconds. This is a simulated crowd, so it shows the method, not how a real crowd would look.</p>}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Precision-recall curve (PR-AUC): not applicable", "It needs a score with a movable threshold. Our gate is a set of fixed rules with a single operating point, so we report that point (precision and recall above) instead of a curve."],
              ["Mouse movement and browser fingerprints: not used", "We never try to tell a bot from a person by behaviour. A bot that looks human (the human mimic) simply gets one entry, like a person. That is by design, and the honest cost is that we cannot block a well-disguised bot, only cap it."],
              ["Timing is a side signal only", "Even where bots arrive differently, the seats do not depend on it. Arrive first or last and the odds are the same, so a bot that copies human timing gains nothing."],
            ].map(([h, t]) => (
              <div key={h} className="rounded-[6px] border border-dashed border-line p-4"><div className="text-[13px] font-semibold text-ink">{h}</div><p className="mt-1 text-xs leading-[17px] text-mute">{t}</p></div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
