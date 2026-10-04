"use client";
// Miniature HTML mock-ups of the real screens (example data, drawn in code, no screenshots).
import Link from "next/link";
import { ArrowDown, Check, EyeOff, KeyRound, Lock, Stamp, Ticket } from "lucide-react";
import { Led, Stub } from "@/components/ui";

export function Screen({ url, href, children }: { url: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="solid overflow-hidden rounded-[6px] shadow-[0_24px_60px_-24px_rgba(0,0,0,.9)]">
      <div className="flex items-center gap-2 border-b border-line bg-panel2 px-3 py-2">
        <span className="flex gap-1" aria-hidden><i className="h-2 w-2 rounded-full bg-hot/70" /><i className="h-2 w-2 rounded-full bg-warn/70" /><i className="h-2 w-2 rounded-full bg-lime/70" /></span>
        <Link href={href || url} className="truncate rounded-[3px] bg-bg px-2 py-0.5 font-mono text-[12px] text-ink hover:text-gold" title="Open the real page">fairdrop{url}</Link>
        <span className="ml-auto font-mono text-[12px] uppercase tracking-[.12em] text-[#cfc7e6]">example screen</span>
      </div>
      <div className="min-h-[190px] space-y-3 bg-[#07050d] p-4">{children}</div>
    </div>
  );
}
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div><div className="eyebrow mb-1">{label}</div><div className="rounded-[4px] border border-line bg-bg px-3 py-2 font-mono text-[15px] text-ink">{children}</div></div>;
const Chip = ({ tone, children }: { tone: "lime" | "violet" | "gold" | "ice"; children: React.ReactNode }) => (
  <span className={{ lime: "border-lime/30 bg-lime/10 text-lime", violet: "border-violet/40 bg-violet/10 text-violet", gold: "border-gold/35 bg-gold/10 text-gold", ice: "border-ice/35 bg-ice/10 text-ice" }[tone] + " inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-wider"}><Led tone={tone} />{children}</span>
);

export const SignIn = () => (
  <Screen url="/login">
    <Field label="Phone number">+1 555 010 0142</Field>
    <div>
      <div className="eyebrow mb-1">6-digit code</div>
      <div className="flex gap-1.5">{"481902".split("").map((c, i) => <span key={i} className="grid h-9 w-9 place-items-center rounded-[4px] border border-gold/50 bg-bg font-mono text-lg text-gold">{c}</span>)}</div>
    </div>
    <Chip tone="lime">Verified before the cutoff</Chip>
  </Screen>
);

export const Waiting = () => (
  <Screen url="/events/…" href="/#shows">
    <div className="eyebrow">Doors open in</div>
    <div className="display num text-6xl text-gold text-glow-gold">00:42</div>
    <Chip tone="ice">You are in the waiting room</Chip>
    <p className="text-[14px] text-ink">No need to refresh or race. Arriving in second 1 or minute 59 gives the same chance.</p>
  </Screen>
);

export const Scan = () => {
  const rows: [React.ReactNode, string, string][] = [
    [<Ticket key="a" className="h-4 w-4 text-ice" />, "Your browser", "makes a secret ticket"],
    [<EyeOff key="b" className="h-4 w-4 text-violet" />, "Blind", "seals it in an opaque envelope"],
    [<Stamp key="c" className="h-4 w-4 text-gold" />, "Server", "signs the envelope, cannot read it"],
    [<KeyRound key="d" className="h-4 w-4 text-lime" />, "You", "unwrap it: a signed, anonymous ticket"],
  ];
  return (
    <Screen url="/enter/…" href="/#shows">
      <ol className="space-y-1">
        {rows.map(([i, a, b], k) => (
          <li key={k}>
            <div className="flex items-center gap-3 rounded-[4px] border border-line bg-panel px-3 py-2"><span className="grid h-7 w-7 place-items-center rounded-[3px] border border-line bg-bg">{i}</span><span className="text-[14px]"><b className="text-ink">{a}</b> <span className="text-[#cfc7e6]">{b}</span></span></div>
            {k < rows.length - 1 && <ArrowDown className="mx-auto my-0.5 h-3 w-3 text-[#cfc7e6]" aria-hidden />}
          </li>
        ))}
      </ol>
    </Screen>
  );
};

export const Enter = () => (
  <Screen url="/enter/…" href="/#shows">
    <div className="rounded-[4px] bg-gold py-2.5 text-center text-sm font-bold text-black shadow-[0_8px_26px_-10px_rgba(255,194,51,.8)]">Enter the draw</div>
    <div className="space-y-1.5 rounded-[4px] border border-dashed border-line p-3">
      <div className="eyebrow">Receipt</div>
      <div className="hash">7f3a09…c91e · tier: floor</div>
      <Chip tone="lime">Signed by the server</Chip>
      <p className="text-[14px] text-ink">Arrival time is recorded but never used to rank you.</p>
    </div>
  </Screen>
);

export const Sealed = () => (
  <Screen url="/verify">
    <div className="space-y-1 font-mono text-[13px] text-[#cfc7e6]">{["a41f…07", "9be2…c4", "03dd…5a", "f7c0…e1", "5b19…88"].map((h, i) => <div key={h} className="flex items-center gap-2" style={{ opacity: 1 - i * 0.08 }}><span className="h-px flex-1 bg-line" />{h}</div>)}</div>
    <ArrowDown className="mx-auto h-4 w-4 text-violet" aria-hidden />
    <div className="rounded-[4px] border border-violet/50 bg-violet/10 p-3 text-center">
      <div className="eyebrow flex items-center justify-center gap-2 text-violet"><Lock className="h-3 w-3" />List sealed: its fingerprint</div>
      <div className="mt-1 break-all font-mono text-sm text-ink">9c1e5a…b04d</div>
    </div>
  </Screen>
);

export const Draw = () => (
  <Screen url="/verify?drop=…" href="/verify">
    <Field label="Secret seed (revealed after sealing)">e83b…77f0</Field>
    <div className="rounded-[4px] border border-gold/60 py-2 text-center font-mono text-[13px] font-bold uppercase tracking-wider text-gold">Re-run the draw here</div>
    <div className="flex items-center gap-2 rounded-[4px] border border-lime/30 bg-lime/10 px-3 py-2 text-[14px] text-lime"><Check className="h-4 w-4" aria-hidden />Same list + same seed = same winners. Checked in this browser.</div>
  </Screen>
);

// a fixed pseudo-QR so server and client render the same markup
const QR = Array.from({ length: 81 }, (_, i) => ((i * 7 + (i >> 3) * 5 + ((i * i) % 11)) % 3) !== 0);
export const Claim = () => (
  <Screen url="/events/…" href="/#shows">
    <Stub accent="lime" tear={<div className="flex items-center justify-between gap-3"><div><div className="eyebrow">Seat</div><div className="display text-3xl text-lime">F-017</div></div><div className="grid h-16 w-16 grid-cols-9 gap-px bg-ink p-1" aria-hidden>{QR.map((on, i) => <i key={i} className={on ? "bg-black" : "bg-ink"} />)}</div></div>}>
      <div className="eyebrow">You won. Claim within the window</div>
      <div className="display mt-1 text-2xl">Your ticket</div>
    </Stub>
  </Screen>
);
