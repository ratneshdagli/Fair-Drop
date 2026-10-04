"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fingerprint, MessageSquareText, Smartphone } from "lucide-react";
import { api, fmtTime, session } from "@/lib/api";
import { Button, Callout, Input, Label, Led } from "@/components/ui";
import JourneyRail from "@/components/fan/JourneyRail";
import { OneTicket, friendly } from "@/components/fan/kit";

function Login() {
  const router = useRouter();
  const raw = useSearchParams().get("next") || "/";
  const next = /^\/(?!\/)/.test(raw) ? raw : "/"; // only ever bounce to a page on this site
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState<any>(null);
  const [err, setErr] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<ReturnType<typeof session.get>>(null);
  const [drop, setDrop] = useState<any>(null);
  useEffect(() => { setMe(session.get()); }, []);
  // if we were sent here by a drop page, show that drop's cutoff: it is the whole reason to sign in early
  useEffect(() => {
    const m = next.match(/^\/(?:enter|events|status|claim|baseline)\/([^/?#]+)/);
    if (m) api<any>(`/drops/${m[1]}`).then(setDrop).catch(() => {});
  }, [next]);

  const send = async () => {
    setErr(null); setBusy(true);
    try { const r = await api("/auth/otp", { body: { phone } }); setSent(r); setOtp(r.otp); }
    catch (e: any) { setErr(friendly(e.code, String(e.message))); }
    setBusy(false);
  };
  const verify = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/verify", { body: { phone, otp } });
      session.set({ token: r.token, user_id: r.user_id, verified_at_ms: r.verified_at_ms, phone });
      router.push(next);
    } catch (e: any) { setErr(friendly(e.code, String(e.message))); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <JourneyRail step={1} />
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-x-12">
        <section className="space-y-5 lg:col-start-1 lg:row-start-1">
          <div className="eyebrow flex items-center gap-3 text-gold"><span>01</span><span className="h-px w-8 bg-gold/50" /><span>The door</span></div>
          <h1 className="display text-[clamp(3rem,10vw,6rem)] text-glow-gold">Show your ID at the door</h1>
          <p className="max-w-xl text-[16px] leading-relaxed text-ink/90">
            One verified phone is one person, and one person gets one ticket. The door checks your phone once so nobody can walk in a hundred times.
          </p>
        </section>
        <section className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="ticket overflow-hidden border border-line bg-panel" style={{ "--notch-y": "130px" } as React.CSSProperties}>
            <div className="flex items-center justify-between bg-gold px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[.22em] text-black"><span>Fair Drop</span><span>ID check</span></div>
            <div className="space-y-5 p-5 pt-6">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full border border-gold/50 bg-gold/10 text-gold"><Fingerprint className="h-6 w-6" /></span>
                <div>
                  <div className="display text-3xl leading-none">{sent ? "Enter the code" : "Your phone number"}</div>
                  <div className="eyebrow mt-1">Step {sent ? 2 : 1} of 2</div>
                </div>
              </div>
              <hr className="perf -mx-5" />
              {me && (
                <Callout tone="ok" title="You are already signed in">
                  Verified {fmtTime(me.verified_at_ms)}. <button className="underline" onClick={() => router.push(next)}>Continue</button> or sign in again with another number below.
                </Callout>
              )}
              <div>
                <Label>Phone number</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 010 2030" disabled={!!sent} inputMode="tel" autoComplete="tel" className="pl-9" />
                  </div>
                  {sent && <Button variant="ghost" size="sm" onClick={() => { setSent(null); setOtp(""); setErr(null); }}>Change</Button>}
                </div>
              </div>
              {!sent ? (
                <Button onClick={send} disabled={busy || phone.replace(/\D/g, "").length < 7} size="lg" className="w-full">{busy ? "Sending…" : "Send me a code"}</Button>
              ) : (
                <>
                  <div className="rounded-[5px] border border-violet/40 bg-violet/10 p-3">
                    <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[.18em] text-violet"><MessageSquareText className="h-3.5 w-3.5" />Simulated text message</div>
                    <div className="display num mt-1 text-5xl tracking-[.18em] text-gold">{sent.otp}</div>
                    <div className="mt-1 text-[12.5px] text-mute">No SMS was sent. The server returned this code to the page and we filled it in below. It works for 5 minutes.</div>
                  </div>
                  <div><Label>One-time code</Label><Input value={otp} onChange={(e) => setOtp(e.target.value)} className="mono text-lg tracking-[.3em]" inputMode="numeric" autoComplete="one-time-code" /></div>
                  <Button onClick={verify} disabled={busy || otp.length < 4} size="lg" className="w-full">{busy ? "Checking…" : "Verify and take my ID card"}</Button>
                </>
              )}
              {err && <Callout tone="bad" title={err.title}>{err.body}</Callout>}
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-mute">
            <b className="text-ink">Demo note.</b> In this hackathon build the phone check is simulated. Tap <i>Send me a code</i> and the server hands the 6-digit code straight back to this page (the box above), pre-filled for you. In a real launch the same code would arrive by text message.
          </p>
        </section>
        <section className="space-y-5 lg:col-start-1 lg:row-start-2">
          <p className="max-w-xl text-[16px] leading-relaxed text-mute">
            Your phone must be verified <b className="text-ink">before the cutoff time</b> the sale publishes. Phones verified later can look around but cannot enter, so sign in now, before the sale, and you are ready when the doors open.
          </p>
          <OneTicket />
          {drop && (
            <div className="flex items-start gap-3 rounded-[5px] border border-gold/40 bg-gold/5 p-3 text-sm">
              <Led tone="gold" pulse className="mt-1.5" />
              <div>You are heading to <b>{drop.event_name}</b>. Its cutoff is <b className="text-gold">{fmtTime(drop.cutoff_at_ms)}</b>: verify before then to be allowed in.</div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }
