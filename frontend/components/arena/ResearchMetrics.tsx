"use client";
import { useMemo } from "react";
import type { Arena, Science } from "@/lib/arena";
import { BOTS, BOT_ORDER, n } from "@/components/admin/botinfo";

// The industry way to score a bot-detection system (from the research review): false-positive rate first, precision/recall instead of plain accuracy,
// and "does the crowd arrive like people?" (flash crowd vs botnet). Everything is computed from the judge's records of THIS test, nothing is typed in.
// Fair Drop does not allocate by detection (it caps entries per verified person), so these numbers show how clean the gate is and how different bots look;
// they are not what the fairness rests on.

const num = (x: any) => Number(x) || 0;
const pc = (x: number, d = 2) => (Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "-");

function confMetrics(c: any) {
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

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1 text-sm" title={hint}><span className="text-mute">{k}</span><span className="font-bold tabular-nums">{v}</span></div>;
}

function Detect({ title, s }: { title: string; s: Science | null }) {
  const m = useMemo(() => (s ? confMetrics(s.all) : null), [s]);
  const hm = useMemo(() => (s ? confMetrics(s.human) : null), [s]);
  if (!m || !m.N) return <div className="rounded-xl border border-line bg-panel/60 p-4 text-sm text-mute"><b className="text-ink">{title}</b><br />No decisions yet.</div>;
  const people = hm && hm.negatives ? hm : m;
  const strict = Number.isFinite(people.upper) ? (people.upper <= 0.001 ? "ok" : "short") : people.FP ? "bad" : "short";
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-4">
      <div className="mb-2 font-bold">{title}</div>
      <Row k="Real people wrongly turned away" v={`${n(people.FP)} of ${n(people.negatives)}  (${pc(people.fpr, 3)})`} hint="False-positive rate: the number the research says matters most. Blocking a real fan is the worst mistake." />
      <div className={"my-1 rounded-lg px-2 py-1 text-xs " + (strict === "ok" ? "bg-ok/10 text-ok" : strict === "bad" ? "bg-bad/10 text-bad" : "bg-warn/10 text-warn")}>
        {strict === "ok" ? `Strict target (under 0.1% wrongly blocked) is met: with ${n(people.negatives)} good requests and none wrongly blocked, the true rate is below ${pc(people.upper, 3)} (95% confidence).`
          : strict === "bad" ? "Some real people were wrongly turned away. See Proof & checks for exactly which."
          : `None wrongly blocked so far, but ${n(people.negatives)} good requests is too few to prove the strict 0.1% target (needs about 3,000).`}
      </div>
      <Row k="Bad requests caught (recall)" v={pc(m.recall)} hint="Of all requests that should be turned away, how many were." />
      <Row k="Turned-away requests that were right (precision)" v={pc(m.precision)} hint="Of all requests turned away, how many deserved it." />
      <Row k="Balance of the two (F1)" v={pc(m.f1)} />
      <Row k="Plain accuracy" v={pc(m.accuracy)} hint="Looks great when one side dominates, which is why the research says not to rely on it." />
      <Row k="Accuracy that ignores the imbalance (balanced)" v={pc(m.balanced)} />
      <Row k="Share of requests that were bad" v={pc(m.imbalance, 1)} hint="Class imbalance: how lopsided the traffic is." />
    </div>
  );
}

export default function ResearchMetrics({ a }: { a: Arena }) {
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
  if (!sc && !a.science.old) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">How the research scores this</h2>
        <p className="text-sm text-mute">The bot-detection research review says to judge a gate by how many real people it wrongly blocks, by precision and recall instead of plain accuracy, and by whether a bot crowd arrives differently from a human crowd. Here is each one, worked out from this test. Fair Drop does not decide by spotting bots (it gives each verified person one entry), so these show how clean the gate is, not what the fairness rests on.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Detect title="Fair Drop gate" s={a.science.fair} />
        <Detect title="Old first-come-first-served sale" s={a.science.old} />
      </div>

      <div className="rounded-xl border border-line bg-panel/60 p-4">
        <div className="mb-1 font-bold">Do bots arrive like a human crowd?</div>
        <p className="mb-2 text-xs text-mute">Arrivals are counted per second. <b>Burstiness</b> is how spiky it is (1 is a steady crowd, much higher is a synchronised burst). <b>Distance from people</b> (in bits) is how different the arrival timing is from the real people&apos;s (0 means identical). <b>Matches people</b> is how closely the two timelines move together (1 is identical).</p>
        {arr.length === 0 ? <div className="text-sm text-mute">Not enough arrivals yet.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-mute"><tr><th className="pb-1">Kind</th><th className="text-right">Busiest second</th><th className="text-right">Burstiness</th><th className="text-right">Distance from people</th><th className="text-right">Matches people</th><th className="pl-3">Reads as</th></tr></thead>
            <tbody>{arr.map(({ id, r }) => {
              const few = r!.total < 50, spiky = !few && (r!.burst > 8 || r!.kl > 1.5);
              return (
                <tr key={id} className="border-t border-line/50">
                  <td className="py-1 font-semibold" style={{ color: BOTS[id]?.color }}>{BOTS[id]?.icon} {BOTS[id]?.name}</td>
                  <td className="text-right tabular-nums">{n(r!.peak)}/s</td>
                  <td className="text-right tabular-nums">{r!.burst.toFixed(1)}</td>
                  <td className="text-right tabular-nums">{r!.kl.toFixed(2)}</td>
                  <td className="text-right tabular-nums">{Number.isFinite(r!.corr) ? r!.corr.toFixed(2) : "-"}</td>
                  <td className={"pl-3 text-xs " + (few ? "text-mute" : spiky ? "text-warn" : "text-ok")}>{few ? `Only ${n(r!.total)} requests: too few to judge` : spiky ? "Different from people: easy to tell apart by timing" : "Arrives much like people"}</td>
                </tr>);
            })}</tbody>
          </table></div>)}
        {hr && <p className="mt-2 text-xs text-mute">Real people: busiest second {n(hr.peak)} requests, spread over {n(hr.secs)} seconds. This is a simulated crowd, so it shows the method, not how a real crowd would look.</p>}
      </div>

      <div className="grid gap-2 text-xs text-mute md:grid-cols-3">
        <p className="rounded-xl border border-line bg-panel/60 p-3"><b className="text-ink">Precision-recall curve (PR-AUC):</b> not applicable. It needs a score with a movable threshold; our gate is a set of fixed rules with a single operating point, so we report that point (precision and recall above) instead of a curve.</p>
        <p className="rounded-xl border border-line bg-panel/60 p-3"><b className="text-ink">Mouse movement and browser fingerprints:</b> not used. We never try to tell a bot from a person by behaviour. A bot that looks human (the human mimic) simply gets one entry, like a person. That is by design, and the honest cost is that we cannot <i>block</i> a well-disguised bot, only cap it.</p>
        <p className="rounded-xl border border-line bg-panel/60 p-3"><b className="text-ink">Timing is a side signal only:</b> even where bots arrive differently, the seats do not depend on it. Arrive first or last and the odds are the same, so a bot that copies human timing gains nothing.</p>
      </div>
    </section>
  );
}
