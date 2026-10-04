"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Download, Loader2, ScanLine, X } from "lucide-react";
import { api, ApiError, entries, fmtTime, LocalEntry, randId, session } from "@/lib/api";
import { b64, blindToken, unb64, verifyReceiptSig } from "@/lib/fdcrypto";
import { Button, Callout, Led, SectionHead, Spinner, cn, fmtDur } from "@/components/ui";
import JourneyRail, { journeyStep } from "@/components/fan/JourneyRail";
import GoldenTicket from "@/components/fan/GoldenTicket";
import { Backstage, BACKEND_BY_STATE, Narrator, OneTicket, Poster, TierStub, friendly } from "@/components/fan/kit";
import { useFan } from "@/components/fan/useFan";
import { money } from "@/lib/api";

type Step = { id: string; label: string; status: "todo" | "run" | "ok" | "fail"; note?: string };
// Each step: what a fan reads (plain words), the technical name (small "how" line), and what the backend is doing meanwhile.
const COPY: Record<string, { title: string; how: string; backend: string }> = {
  elig: { title: "The door checks your ID card", how: "how: phone verified before the cutoff time", backend: "The server compares when your phone was verified with the cutoff this sale published. It checks again for real in the next steps." },
  blind: { title: "Your browser makes a secret ticket and blindfolds it", how: "how: random token, blinded (RFC 9474 blind RSA)", backend: "Nothing yet. This happens only inside your browser; the server has not been contacted." },
  sign: { title: "The door stamps it without seeing it", how: "how: one-ticket-per-person check, then blind signature", backend: "One of the web servers checks your ID and the rate limit, makes sure this ID has not had a ticket yet, then signs your blindfolded ticket. It cannot read it." },
  unblind: { title: "Your browser takes the blindfold off", how: "how: unblind the signature", backend: "Nothing: your browser alone removes the blindfold. You now hold a ticket the door recognises but cannot link to your ID." },
  reg: { title: "You walk in with no ID attached", how: "how: token + signature registered, no session sent", backend: "A server checks the stamp, checks the ticket was never used, and records the entry in Redis. It sees a ticket, not a person." },
  rcpt: { title: "You get a receipt and check it yourself", how: "how: signed receipt verified locally (ECDSA P-256)", backend: "The server signed a receipt (ticket id, tier, time). Your browser checks that signature with the sale's published public key." },
};
const initial: Step[] = [
  { id: "elig", label: "Eligibility check (verified before the cutoff)", status: "todo" },
  { id: "blind", label: "Browser creates a random secret token and blinds it", status: "todo" },
  { id: "sign", label: "Server checks one-token-per-identity and signs the blinded token", status: "todo" },
  { id: "unblind", label: "Browser unblinds the signature (server never saw the token)", status: "todo" },
  { id: "reg", label: "Register token + signature with no session attached", status: "todo" },
  { id: "rcpt", label: "Signed receipt received and verified locally", status: "todo" },
];

export default function Enter() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { d, sess, ready, toOpen, eligible } = useFan(id);
  const [tier, setTier] = useState("");
  const [steps, setSteps] = useState<Step[]>(initial);
  const [err, setErr] = useState<{ code: string; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<LocalEntry | null>(null);
  const [fresh, setFresh] = useState(false);

  useEffect(() => { setLocal(entries.get(id)); }, [id]);
  useEffect(() => { if (d && !tier) setTier(d.tiers[0].id); }, [d, tier]);
  useEffect(() => { if (ready && !session.get()) router.replace(`/login?next=/enter/${id}`); }, [ready, id, router]);

  const set = (sid: string, status: Step["status"], note?: string) => setSteps((s) => s.map((x) => (x.id === sid ? { ...x, status, note } : x)));

  const finishReceipt = async (le: LocalEntry, r: any) => {
    const ok = await verifyReceiptSig(d.receipt_public_key, id, r.receipt_id, r.tier, r.arrival_ms, r.server_sig);
    const full = { ...le, receipt: { ...r, sig_ok: ok } };
    entries.set(full); setLocal(full);
    set("rcpt", ok ? "ok" : "fail", ok ? "signature verified with the drop's published key" : "receipt signature did not verify!");
    if (ok) setFresh(true);
  };

  const enter = async () => {
    setErr(null); setBusy(true); setSteps(initial);
    try {
      set("elig", "run");
      if (!eligible) throw new ApiError(403, "not_eligible", {});
      set("elig", "ok", `verified ${fmtTime(sess!.verified_at_ms)} ≤ cutoff ${fmtTime(d.cutoff_at_ms)}`);
      let le = entries.get(id);
      if (le && !le.sig) le = null;
      if (!le) {
        set("blind", "run");
        const bt = await blindToken(d.public_key_jwk, d.token_mode);
        set("blind", "ok", d.token_mode === "blind" ? "RFC 9474 RSABSSA-SHA384-PSS" : "fallback: token sent unblinded");
        set("sign", "run");
        let bs: any;
        for (let i = 0; ; i++) {
          try { bs = await api(`/drops/${id}/token`, { body: { blinded_msg: b64(bt.blinded), tier }, auth: "user", idem: true }); break; }
          catch (e: any) { if (e.status === 429 && i < 6) { await new Promise((r) => setTimeout(r, 600 + i * 400)); continue; } throw e; }
        }
        set("sign", "ok");
        set("unblind", "run");
        const sig = await bt.finalize(unb64(bs.blind_sig));
        set("unblind", "ok");
        le = { drop_id: id, token_msg: b64(bt.msg), sig: b64(sig), tier, idem: randId() };
        entries.set(le); setLocal(le); // persist BEFORE registering: a crash here is recoverable
      } else { ["blind", "sign", "unblind"].forEach((s) => set(s, "ok", "resumed from this device")); }
      set("reg", "run");
      let rec: any;
      for (let i = 0; ; i++) {
        try { rec = await api(`/drops/${id}/register`, { body: { token_msg: le.token_msg, sig: le.sig, tier: le.tier }, headers: { "Idempotency-Key": le.idem } }); break; }
        catch (e: any) { if ((e.status === 429 || e.status >= 500) && i < 8) { await new Promise((r) => setTimeout(r, 500 + i * 400)); continue; } throw e; }
      }
      set("reg", "ok", `accepted by ${rec.replica}`);
      set("rcpt", "run");
      await finishReceipt(le, rec);
    } catch (e: any) {
      const code = e.code || "error";
      setErr({ code, ...friendly(code, e.message) });
      setSteps((s) => s.map((x) => (x.status === "run" ? { ...x, status: "fail" } : x)));
    }
    setBusy(false);
  };

  const download = () => { const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fairdrop-receipt-${id}.json`; a.click(); };

  if (!d) return <Spinner label="Walking to the door…" />;
  if (d.mode === "fcfs") return <Callout tone="warn" title="This is the old way">This is a classic first-come-first-served sale, with no ticket scan. <Link className="underline" href={`/baseline/${id}`}>Open the classic page</Link>.</Callout>;
  const done = local?.receipt;
  const showSteps = busy || !!err || !!done;
  const step = journeyStep(d.state, { signedIn: !!sess, hasEntry: !!done });
  const myTier = d.tiers.find((t: any) => t.id === (done?.tier || tier));
  const canEnter = d.state === "OPEN" && eligible !== false && !!sess;

  return (
    <div className="space-y-6">
      <Poster d={d} kicker="Scan and get your ticket" />
      <JourneyRail step={step} />
      <p className="text-[14px] text-mute">What you are looking at: the door. Pick a tier, press the button, and watch your browser and the server do the six steps that put you in the draw.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* ---------- left: choose & go ---------- */}
        <section className="space-y-5">
          {!done && (
            <>
              <SectionHead n="01" kicker="At the door" title="Pick a tier, then scan" />
              {d.state !== "OPEN" && (
                <Callout tone="warn" title={d.state === "SCHEDULED" ? "The doors are not open yet" : "The doors have closed"}>
                  {d.state === "SCHEDULED" ? <>Doors open at {fmtTime(d.opens_at_ms)}{toOpen !== null && <> (in <b>{fmtDur(toOpen)}</b>)</>}. Waiting costs you nothing: arriving first earns nothing extra.</> : "Entries are closed for this sale."}
                </Callout>
              )}
              {eligible === false && (
                <Callout tone="bad" title="Your ID was verified too late">
                  Your phone was verified at {fmtTime(sess!.verified_at_ms)}, after this sale's cutoff ({fmtTime(d.cutoff_at_ms)}). Accounts created during a sale cannot enter, so a bot farm signing up in a hurry gets zero entries. You can still look around.
                </Callout>
              )}
              <div role="radiogroup" aria-label="Choose your tier" className="space-y-3">
                {d.tiers.map((t: any, i: number) => <TierStub key={t.id} t={t} i={i} selected={tier === t.id} onClick={() => setTier(t.id)} sub={tier === t.id ? "your pick" : "tap to pick"} />)}
              </div>
              <div className="panel space-y-3 p-4">
                <OneTicket />
                <p className="text-[14.5px] leading-snug text-ink/90"><b>You will get exactly one ticket.</b> Pressing the button twice gives you the same ticket back. Trying again from another device is refused, because the door already gave this ID its one ticket.</p>
                <Button size="lg" className="w-full" disabled={busy || !canEnter} onClick={enter}><ScanLine className="h-5 w-5" />{busy ? "Scanning…" : "Scan my ID and get my ticket"}</Button>
                <p className="text-xs text-mute">Arrival time does not affect your chances. Your secret ticket never leaves this browser until you register it, and the server cannot link it to your account.</p>
              </div>
            </>
          )}

          {err && (
            <Callout tone={err.code === "not_eligible" ? "bad" : "warn"} title={err.title}>
              {err.body}{" "}
              {(err.code === "token_spent" || err.code === "already_issued") && <Link className="font-semibold underline" href={`/status/${id}`}>Open My entry</Link>}
            </Callout>
          )}

          {done && (
            <>
              <SectionHead n="03" kicker="You are in" title="Golden ticket" />
              <GoldenTicket reveal={fresh} event={d.event_name} tier={myTier?.name || done.tier} receipt={done.receipt_id} sigOk={done.sig_ok} acceptedMs={done.arrival_ms} />
              <div className="panel space-y-3 p-4 text-[14px]">
                <div className="eyebrow text-gold">Keep this</div>
                <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
                  <li>Your secret ticket lives <b>only in this browser</b>. You need it to claim a seat if you win.</li>
                  <li>Download a copy now. The receipt is also your proof if the final list ever leaves you out.</li>
                  <li>One login, one ticket. You do not need to do anything else until the draw.</li>
                </ul>
                <Narrator tone="lime">{BACKEND_BY_STATE[d.state]}</Narrator>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={download}><Download className="h-4 w-4" />Download receipt and ticket</Button>
                  <Link href={`/status/${id}`}><Button>Go to my entry</Button></Link>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---------- right: the scanner ---------- */}
        <section className="space-y-4">
          <SectionHead n="02" kicker="The scanner" title="Six steps, in plain words" />
          <div className={cn("panel relative overflow-hidden", busy && "glow-gold")}>
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[.2em]">
              <span className="flex items-center gap-2 text-ink"><Led tone={busy ? "gold" : err ? "hot" : done ? "lime" : "mute"} pulse={busy} />Door scanner</span>
              <span className="text-mute">{busy ? "scanning" : err ? "stopped" : done ? "ticket issued" : "ready"}</span>
            </div>
            <ol>
              {steps.map((s, i) => {
                const c = COPY[s.id];
                return (
                  <li key={s.id} className={cn("relative flex gap-3 overflow-hidden border-b border-line/70 px-4 py-3.5 last:border-b-0", s.status === "run" && "bg-gold/[.06]", s.status === "fail" && "bg-hot/10")}>
                    {s.status === "run" && <div aria-hidden className="fan-scan pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-gold/25 to-transparent" />}
                    <span className={cn("relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold",
                      s.status === "ok" && "border-lime/60 bg-lime/15 text-lime", s.status === "run" && "border-gold text-gold", s.status === "fail" && "border-hot bg-hot/15 text-hot", s.status === "todo" && "border-line text-mute")}>
                      {s.status === "ok" ? <Check className="h-4 w-4" strokeWidth={3} /> : s.status === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : s.status === "fail" ? <X className="h-4 w-4" strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="relative min-w-0 space-y-1">
                      <div className={cn("text-[15px] font-semibold leading-snug", s.status === "todo" && !showSteps ? "text-ink" : s.status === "todo" ? "text-mute" : "")}>{c.title}</div>
                      <div className="font-mono text-[10.5px] uppercase tracking-[.1em] text-violet" title={s.label}>{c.how}</div>
                      {s.note && <div className={cn("text-[12.5px]", s.status === "fail" ? "text-hot" : "text-lime")}>{s.note}</div>}
                      <Backstage short className="!text-[12px]">{c.backend}</Backstage>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="text-[12.5px] leading-relaxed text-mute">Why the blindfold? The door has to be sure you are a real, verified person, yet it must not be able to tell which ticket is yours. The blind stamp does both. {myTier && !done && <>You are entering the <b className="text-ink">{myTier.name}</b> tier at {money(myTier.price_cents)} (you pay only if you win).</>}</p>
        </section>
      </div>
    </div>
  );
}
