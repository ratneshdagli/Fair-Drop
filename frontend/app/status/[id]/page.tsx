"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Download, Lock, ShieldCheck, Siren } from "lucide-react";
import { api, ApiError, entries, fmtTime, LocalEntry } from "@/lib/api";
import { verifyProof, receiptId, unb64 } from "@/lib/fdcrypto";
import { Button, Callout, Hash, Led, SectionHead, Spinner, STATES, Timeline, cn, fmtDur } from "@/components/ui";
import JourneyRail, { journeyStep } from "@/components/fan/JourneyRail";
import GoldenTicket from "@/components/fan/GoldenTicket";
import { Backstage, BACKEND_BY_STATE, Narrator, OneTicket, Poster } from "@/components/fan/kit";
import { useFan } from "@/components/fan/useFan";

export default function Status() {
  const { id } = useParams<{ id: string }>();
  const { d, sess, toClose } = useFan(id);
  const [local, setLocal] = useState<LocalEntry | null>(null);
  const [proof, setProof] = useState<{ ok: boolean; missing?: boolean; detail?: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLocal(entries.get(id)); setLoaded(true); }, [id]);

  const rid = local?.receipt?.receipt_id || (local ? receiptId(id, unb64(local.token_msg)) : undefined);
  const ord = d ? STATES.indexOf(d.state) : 0;

  // remember the root the first time we see it (it is published BEFORE the seed reveal)
  useEffect(() => {
    if (local && d?.merkle_root && !local.root_at_lock) { const n = { ...local, root_at_lock: d.merkle_root }; entries.set(n); setLocal(n); }
  }, [d?.merkle_root, local]);

  useEffect(() => {
    if (!d || !rid || ord < 3 || !d.merkle_root) return;
    (async () => {
      try {
        const p = await api<any>(`/drops/${id}/proof/${rid}`);
        const ok = verifyProof(p.leaf.receipt_id, p.leaf.tier, p.path, d.merkle_root) && p.merkle_root === d.merkle_root && (!local?.root_at_lock || local.root_at_lock === d.merkle_root);
        setProof({ ok, detail: ok ? `${p.path.length}-step proof against root ${d.merkle_root.slice(0, 16)}…, ${p.entry_count} ${p.entry_count === 1 ? "entry" : "entries"}` : "proof did not verify against the published root" });
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 404) setProof({ ok: false, missing: true, detail: `${e.body?.entry_count ?? "?"} entries in the locked list` });
      }
    })();
  }, [d?.merkle_root, d?.state, rid, ord, id, local?.root_at_lock]);

  useEffect(() => {
    if (!d || !rid || ord < 4) return;
    const f = () => api<any>(`/drops/${id}/result/${rid}`).then(setResult).catch(() => {});
    f(); const t = setInterval(f, 2000); return () => clearInterval(t);
  }, [d?.state, rid, ord, id]);

  if (!d || !loaded) return <Spinner label="Looking for your ticket…" />;
  const download = () => { const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fairdrop-receipt-${id}.json`; a.click(); };

  if (!local) return (
    <div className="space-y-6">
      <Poster d={d} kicker="My entry" />
      <JourneyRail step={journeyStep(d.state, { signedIn: !!sess, hasEntry: false })} />
      <div className="panel space-y-3 p-6">
        <div className="display text-4xl">No ticket in this browser</div>
        <p className="max-w-xl text-[15px] text-mute">Your secret ticket lives only in the browser where you entered. If you entered on another device, open this page there. Otherwise you can still enter, if the doors are open.</p>
        <Link href={`/enter/${id}`}><Button>Go to the door<ArrowRight className="h-4 w-4" /></Button></Link>
      </div>
    </div>
  );

  const outcome = result?.outcome;
  const tier = d.tiers.find((t: any) => t.id === (result?.tier || local.receipt?.tier || local.tier));
  const step = journeyStep(d.state, { signedIn: !!sess, hasEntry: true });

  // the big poster state
  type Hero = { word: string; tone: "lime" | "hot" | "warn" | "violet" | "gold" | "ice"; sub: React.ReactNode; action?: React.ReactNode };
  let hero: Hero;
  if (outcome === "won") hero = { word: "You're in", tone: "lime", sub: <>You won a seat in <b>{tier?.name || result.tier}</b> (draw rank {result.rank}). {result.claim?.status === "claimed" ? "You claimed it: your ticket is ready." : ord === 5 ? "Claim it before the timer runs out." : ord >= 6 ? "Claims are over." : "Claims open soon."}</>, action: ord === 5 && result.claim?.status !== "claimed" ? <Link href={`/claim/${id}`}><Button size="lg">Claim my seat<ArrowRight className="h-4 w-4" /></Button></Link> : result.claim?.status === "claimed" ? <Link href={`/ticket/${id}`}><Button size="lg">See my ticket<ArrowRight className="h-4 w-4" /></Button></Link> : undefined };
  else if (outcome === "waitlist") hero = { word: `Waiting list #${result.waitlist_position}`, tone: "warn", sub: <>You did not get a seat in the first pick, but you are {result.waitlist_position === 1 ? "first" : `number ${result.waitlist_position}`} in line. If a winner does not claim in time, their seat passes down the list in order. Keep this page open.</> };
  else if (outcome === "lost") hero = { word: "Not this time", tone: "hot", sub: <>The draw was random and your entry was not among the winners or the waiting list. It was a fair chance, and anyone can re-run the draw to see why.</> };
  else if (ord >= 4) hero = { word: "The draw is done", tone: "gold", sub: "Reading your result from the server…" };
  else if (ord === 3) hero = { word: "List sealed", tone: "violet", sub: "Every entry is now on a final list with a public fingerprint. Next the secret seed is revealed and the draw picks the winners." };
  else if (ord === 2) hero = { word: "Doors closed", tone: "violet", sub: "No more entries. The list is being frozen and sealed. Your ticket is on it." };
  else if (ord === 1) hero = { word: "You're in the room", tone: "ice", sub: <>Nothing left to do but wait. Arriving early or late changes nothing: every ticket inside has the same chance.{toClose !== null && <> The doors close in <b className="num">{fmtDur(toClose)}</b>.</>}</> };
  else hero = { word: "Not open yet", tone: "gold", sub: "The sale has not started." };
  const toneText = { lime: "text-lime", hot: "text-hot", warn: "text-warn", violet: "text-violet", gold: "text-gold", ice: "text-ice" }[hero.tone];
  const toneGlow = { lime: "glow-lime", hot: "glow-hot", warn: "glow-warn", violet: "glow-violet", gold: "glow-gold", ice: "" }[hero.tone];

  return (
    <div className="space-y-6">
      {proof?.missing && (
        <div role="alert" className="alarm rounded-[6px] border-2 border-hot bg-hot/15 p-5 md:p-7">
          <div className="flex items-start gap-4">
            <Siren className="mt-1 h-9 w-9 shrink-0 text-hot" />
            <div className="space-y-3">
              <div className="display text-[clamp(2rem,7vw,3.6rem)] text-hot">Integrity warning: your entry is missing from the sealed list</div>
              <p className="max-w-3xl text-[15px] leading-relaxed">
                You hold a receipt signed by the server, but its id is <b>not in the published list</b>. Either the server dropped your entry after accepting it, or it never counted it. That receipt is cryptographic evidence of misconduct: anyone can check the server's signature on it. Download it now and keep it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={download}><Download className="h-4 w-4" />Download my receipt</Button>
                <Link href={`/verify?drop=${id}&receipt=${rid}`}><Button variant="danger">Open full verification</Button></Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <Poster d={d} kicker="My entry" />
      <JourneyRail step={step} />
      <p className="text-[14px] text-mute">What you are looking at: your own entry in this sale. The big word is where you stand right now; it changes by itself as the sale moves on.</p>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <section className={cn("panel relative overflow-hidden p-5 md:p-8", toneGlow)}>
            {hero.tone === "ice" && <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"><div className="beams" /></div>}
            <div className="eyebrow relative flex items-center gap-2"><Led tone={hero.tone} pulse />Your status</div>
            <div className={cn("display relative mt-2 text-[clamp(3.4rem,15vw,8rem)] leading-[.86]", toneText)}>{hero.word}</div>
            <p className="relative mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink/90">{hero.sub}</p>
            {hero.action && <div className="relative mt-5">{hero.action}</div>}
            {result?.claim && <div className="relative mt-4 text-sm text-mute">Claim status: <b className="text-ink">{result.claim.status}</b>{result.claim.promoted && <span className="ml-2 text-lime">promoted from the waiting list</span>}</div>}
            <Backstage className="relative mt-5 border-t border-line pt-3">{BACKEND_BY_STATE[d.state]}</Backstage>
          </section>

          <section className="space-y-4">
            <SectionHead n="02" kicker="The sealed list" title="Is my entry really in?" />
            <div className="panel space-y-4 p-5">
              {ord < 3 && <Narrator tone="violet">The sale is still {d.state === "OPEN" ? "open" : d.state.toLowerCase()}. When it closes the list is sealed and published, and your browser then checks that your receipt is inside.</Narrator>}
              {ord >= 3 && !proof && <Spinner label="Your browser is checking your entry against the sealed list…" />}
              {proof?.ok && (
                <div className="flex items-start gap-3 rounded-[5px] border border-lime/40 bg-lime/10 p-4">
                  <Led tone="lime" className="mt-2 shrink-0" />
                  <div><div className="display text-3xl text-lime">Your entry is in the sealed list</div><div className="mt-1 text-[13.5px] text-ink/85">Checked in your browser, not taken on trust. <span className="text-mute">{proof.detail}</span></div></div>
                </div>
              )}
              {proof && !proof.ok && !proof.missing && <Callout tone="bad" title="The proof did not check out">{proof.detail}. The published fingerprint and your receipt disagree. Open the full verification.</Callout>}
              <div className="grid gap-3 md:grid-cols-2">
                <div><Hash label="Fingerprint of the sealed list (Merkle root), published before the seed" v={d.merkle_root || "Published when the list is sealed."} />{d.entry_count !== undefined && <div className="mt-1 text-xs text-mute">{d.entry_count.toLocaleString()} {d.entry_count === 1 ? "entry" : "entries"} on the list</div>}</div>
                <Hash label="The draw promise, committed before the sale (seed hash)" v={d.seed_hash} />
              </div>
              {d.seed && <Hash label="The secret seed, revealed after the seal" v={d.seed} />}
              {ord >= 4 && <Link href={`/verify?drop=${id}&receipt=${rid}`}><Button variant="secondary"><ShieldCheck className="h-4 w-4" />Re-run the whole draw in my browser</Button></Link>}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <SectionHead n="01" kicker="Your ticket" title="Your 1 ticket" />
          {local.receipt ? (
            <GoldenTicket event={d.event_name} tier={tier?.name || local.receipt.tier} receipt={rid} sigOk={local.receipt.sig_ok} acceptedMs={local.receipt.arrival_ms} />
          ) : (
            <Callout tone="warn" title="Ticket stored, receipt missing">Your secret ticket is saved but we never got the receipt. <Link className="underline" href={`/enter/${id}`}>Retry registration</Link>. It is safe: it can never enter you twice.</Callout>
          )}
          <div className="panel space-y-3 p-4">
            <OneTicket />
            <p className="text-[13.5px] leading-snug text-mute">One login holds exactly one ticket in this sale, and that ticket can win at most one seat. Arrival time is not used in the draw.</p>
            <Button variant="ghost" size="sm" onClick={download}><Download className="h-4 w-4" />Download receipt and ticket</Button>
          </div>
          <div className="panel p-4"><div className="mb-3 flex items-center gap-2 eyebrow"><Lock className="h-3.5 w-3.5 text-violet" />Where the sale is</div><Timeline state={d.state} mode={d.mode} /></div>
        </aside>
      </div>
    </div>
  );
}
