"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ShieldCheck, Siren, X } from "lucide-react";
import { api, entries, usePoll } from "@/lib/api";
import { Bundle, Check as Chk, verifyBundle } from "@/lib/fdcrypto";
import { Button, Callout, Input, Label, Led, Select, Spinner, cn } from "@/components/ui";
import JourneyRail from "@/components/fan/JourneyRail";
import { Backstage } from "@/components/fan/kit";

// The checks keep their exact technical names (shown small); a fan reads the plain sentence.
function plain(c: Chk): { say: string; bad: string } {
  const n = c.name;
  if (n.startsWith("Seed commitment")) return { say: "The secret seed matches the promise made before the sale.", bad: "The revealed seed does NOT match the promise made before the sale." };
  if (n.startsWith("Entry list has unique")) return { say: "No entry appears twice on the list.", bad: "Some entry appears twice on the list." };
  if (n.startsWith("Merkle root recomputed")) return { say: "The list's fingerprint, rebuilt from every entry, equals the published one.", bad: "The fingerprint rebuilt from the entries is different from the published one." };
  if (n.startsWith("Root equals the root you saw")) return { say: "It is the same fingerprint you saw when the list was sealed, before the seed was revealed.", bad: "The fingerprint is not the one you saw when the list was sealed." };
  if (n.startsWith("Final randomness")) return { say: "The draw's random number was rebuilt from the seed, the sealed list and the public beacon.", bad: "The draw's random number does not come out the same." };
  if (n.startsWith("Tier ")) { const t = n.split(":")[0]; return { say: `${t}: winners and waiting list come out in exactly the published order.`, bad: `${t}: the winners and waiting list come out in a different order than published.` }; }
  if (n.startsWith("YOUR RECEIPT")) return { say: "Your receipt is on the sealed list.", bad: "Your receipt is NOT on the sealed list." };
  if (n.startsWith("Your receipt has a valid")) return { say: "A short proof ties your entry to the list's fingerprint.", bad: "The proof for your entry does not tie to the fingerprint." };
  if (n.startsWith("Your outcome")) return { say: "Your result, recomputed in this browser.", bad: "Your result could not be recomputed." };
  return { say: n, bad: n };
}

function Verify() {
  const qs = useSearchParams();
  const { data: drops } = usePoll(() => api<any[]>("/drops"), 4000);
  const [drop, setDrop] = useState(qs.get("drop") || "");
  const [receipt, setReceipt] = useState(qs.get("receipt") || "");
  const [rootAtLock, setRootAtLock] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; checks: Chk[]; ms: number; n: number; beacon?: any } | null>(null);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(0); // checks revealed one by one so you can watch them land

  useEffect(() => {
    if (drop && !receipt) { const e = entries.get(drop); if (e?.receipt) setReceipt(e.receipt.receipt_id); if (e?.root_at_lock) setRootAtLock(e.root_at_lock); }
    else if (drop) { const e = entries.get(drop); if (e?.root_at_lock && !rootAtLock) setRootAtLock(e.root_at_lock); }
  }, [drop]); // eslint-disable-line

  const run = async () => {
    setBusy(true); setErr(""); setOut(null); setShown(0);
    try {
      const t0 = performance.now();
      const b = await api<Bundle>(`/drops/${drop}/verify`);
      await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before the CPU-bound work
      const r = verifyBundle(b, receipt.trim() || undefined, rootAtLock.trim() || undefined);
      setOut({ ...r, ms: performance.now() - t0, n: b.entries.length, beacon: b.beacon });
    } catch (e: any) { setErr(e.code === "not_drawn" ? "This sale has not been drawn yet. The public record appears once the seed is revealed." : String(e.message)); }
    setBusy(false);
  };
  useEffect(() => { if (qs.get("drop") && drops?.find((d) => d.id === qs.get("drop") && ["DRAWN", "CLAIM", "SETTLED"].includes(d.state)) && !out && !busy && !err) run(); }, [drops]); // eslint-disable-line

  useEffect(() => {
    if (!out) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(out.checks.length); return; }
    setShown(0);
    const t = setInterval(() => setShown((s) => { if (s >= out.checks.length) { clearInterval(t); return s; } return s + 1; }), 260);
    return () => clearInterval(t);
  }, [out]);

  const missing = out?.checks.find((c) => c.name.startsWith("YOUR RECEIPT") && !c.ok);
  const finished = !!out && shown >= out.checks.length;
  const pass = out ? out.checks.filter((c) => c.ok).length : 0;
  const drawn = (drops || []).filter((d) => d.mode === "fairdrop");

  return (
    <div className="space-y-6">
      <JourneyRail step={6} />
      <header className="space-y-3">
        <div className="eyebrow flex items-center gap-3 text-gold"><span>The proof</span><span className="h-px w-8 bg-gold/50" /></div>
        <h1 className="display text-[clamp(3rem,10vw,6.5rem)] text-glow-gold">Don&apos;t trust us. Re-run the draw yourself.</h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-mute">
          What you are looking at: your own browser, not our server, redoing the draw from the public record (the secret seed, the full list of entries and the published results). If even one number differs from what we published, the verdict turns red.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <section className="panel space-y-4 p-5 lg:sticky lg:top-20 lg:self-start">
          <div className="eyebrow text-gold">01 / Pick the sale</div>
          <div><Label>Sale</Label>
            <Select value={drop} onChange={(e) => setDrop(e.target.value)}><option value="">Select a drawn sale…</option>
              {drawn.map((d) => <option key={d.id} value={d.id}>{d.event_name} · {d.id} · {d.state}</option>)}</Select></div>
          <div><Label>Your receipt id (optional: also checks your own entry and result)</Label><Input className="mono text-xs" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="64 hex characters" /></div>
          <div><Label>Fingerprint you saw when the list was sealed (optional, filled in from this browser)</Label><Input className="mono text-xs" value={rootAtLock} onChange={(e) => setRootAtLock(e.target.value)} /></div>
          <Button size="lg" className="w-full" onClick={run} disabled={!drop || busy}><ShieldCheck className="h-5 w-5" />{busy ? "Re-running…" : "Re-run the draw in my browser"}</Button>
          <Backstage>Only one thing: the server hands over the public record. Every check below is computed here, on your device.</Backstage>
          {err && <Callout tone="warn">{err}</Callout>}
        </section>

        <section className="space-y-4">
          <div className="eyebrow text-gold">02 / The checks</div>
          {!out && !busy && <div className="panel p-6 text-[14.5px] text-mute">Pick a sale and press the button. Each check will appear here, one by one, with a light: lime for passed, red for failed.</div>}
          {busy && <div className="panel p-6"><Spinner label="Downloading the public record and recomputing the draw…" /></div>}
          {out && (
            <>
              <ol className="panel divide-y divide-line">
                {out.checks.map((c, i) => {
                  if (i >= shown) return (
                    <li key={i} className="flex items-center gap-3 px-4 py-3.5 text-mute"><span className="grid h-7 w-7 place-items-center rounded-full border border-line font-mono text-xs">{i + 1}</span>{i === shown ? <span className="flex items-center gap-2 text-sm"><Led tone="gold" pulse />checking…</span> : <span className="text-sm opacity-50">waiting</span>}</li>
                  );
                  const p = plain(c);
                  return (
                    <li key={i} className={cn("fan-pop flex gap-3 px-4 py-3.5", !c.ok && "bg-hot/10")}>
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border", c.ok ? "border-lime/60 bg-lime/15 text-lime" : "border-hot bg-hot/20 text-hot")}>{c.ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><Led tone={c.ok ? "lime" : "hot"} /><span className={cn("text-[15px] font-semibold leading-snug", !c.ok && "text-hot")}>{c.ok ? p.say : p.bad}</span></div>
                        <div className="mt-1 font-mono text-[10.5px] leading-snug text-mute [overflow-wrap:anywhere]">how: {c.name}{c.detail ? ` · ${c.detail}` : ""}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {finished && (missing ? (
                <div role="alert" className="alarm fan-pop rounded-[6px] border-2 border-hot bg-hot/15 p-5">
                  <div className="flex items-start gap-3"><Siren className="mt-1 h-8 w-8 shrink-0 text-hot" /><div>
                    <div className="display text-[clamp(2.4rem,8vw,4.5rem)] text-hot">Your receipt is not on the list</div>
                    <p className="mt-2 text-[15px]">The server accepted your entry (you hold its signature) but the published list does not contain it. That is cryptographic proof it removed or ignored your entry. Keep your receipt file: anyone can check the signature on it.</p></div></div>
                </div>
              ) : out.ok ? (
                <div className="panel glow-lime fan-pop p-5">
                  <div className="eyebrow flex items-center gap-2 text-lime"><Led tone="lime" pulse />Verdict</div>
                  <div className="display text-[clamp(3.4rem,13vw,7.5rem)] leading-[.88] text-lime">Verified</div>
                  <p className="mt-2 text-[15px] text-ink/90">All {out.checks.length} checks passed on {out.n.toLocaleString()} {out.n === 1 ? "entry" : "entries"}, in {out.ms.toFixed(0)} ms, computed in this browser. The result matches the seed and the list that were published.</p>
                </div>
              ) : (
                <div role="alert" className="alarm fan-pop rounded-[6px] border-2 border-hot bg-hot/15 p-5">
                  <div className="eyebrow flex items-center gap-2 text-hot"><Led tone="hot" pulse />Verdict</div>
                  <div className="display text-[clamp(3rem,11vw,6.5rem)] leading-[.88] text-hot">Something does not add up</div>
                  <p className="mt-2 text-[15px]">{pass} of {out.checks.length} checks passed. At least one recomputation does not match what the server published: see the red lines above.</p>
                </div>
              ))}

              <details className="panel p-4 text-xs text-mute">
                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[.16em] text-ink">For the curious: the exact recipe</summary>
                <div className="mt-3 space-y-2 leading-relaxed">
                  <div>Beacon: {out.beacon ? <>drand quicknet round <b className="text-ink">{out.beacon.round}</b>. Cross-check it independently at <span className="mono">api.drand.sh/{out.beacon.chain || "52db9ba7…"}/public/{out.beacon.round}</span> (BLS signature verification is left to drand clients).</> : "none was mixed into this draw (the audit log records why)."}</div>
                  <div>Independent re-implementation: <span className="mono">python verifier/verify.py --url http://localhost:8088/api --drop {drop}{receipt ? ` --receipt ${receipt}` : ""}</span></div>
                  <div>Formats: leaf = SHA256(00‖receipt‖1f‖tier), node = SHA256(01‖L‖R), final = SHA256(&quot;fairdrop/final/v1&quot;‖seed‖root‖flag[‖beacon]), score = SHA256(&quot;fairdrop/score/v1&quot;‖final‖receipt), lowest score wins.</div>
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Verify /></Suspense>; }
