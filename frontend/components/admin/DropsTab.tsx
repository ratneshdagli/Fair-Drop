"use client";
// "Run a sale": the stage track, the one big "next phase" button, and the forms that create events and sales.
import { useState } from "react";
import { ArrowRight, Check, KeyRound, Lock, Plus, ShieldCheck, UserX, X } from "lucide-react";
import { api, fmtTime, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Hash, Input, Label, Led, Select, StateBadge, STAGE, cn } from "@/components/ui";
import { BACKEND_CONTROL, BACKEND_NOW, BACKEND_NOW_OLD } from "./botinfo";
import { Explain, Legend, Mono, Panel, PAL, TicketRule, th, td } from "./kit";

const STEPS: Record<string, string[]> = {
  fairdrop: ["SCHEDULED", "OPEN", "CLOSED", "LOCKED", "DRAWN", "CLAIM", "SETTLED"],
  fcfs: ["SCHEDULED", "OPEN", "CLOSED", "SETTLED"],
};
const NAME: Record<string, string> = { SCHEDULED: "Not open", OPEN: "Open", CLOSED: "Closed", LOCKED: "Sealed", DRAWN: "Drawn", CLAIM: "Claiming", SETTLED: "Finished" };
// the button text for moving INTO a stage, and a plain sentence about what that step does
const LABEL: Record<string, string> = { OPEN: "Open the sale", CLOSED: "Stop letting people join", LOCKED: "Seal the list", DRAWN: "Run the draw", CLAIM: "Let winners claim seats", SETTLED: "Finish the sale" };
const DOES: Record<string, string> = {
  OPEN: "People can start joining. In the fair sale, joining early or late makes no difference.",
  CLOSED: "No more entries are accepted. The list is final but not yet sealed.",
  LOCKED: "The final list is sealed and its fingerprint is published. Nobody can add, remove or swap an entry after this.",
  DRAWN: "The draw secret is revealed and winners are picked by a draw anyone can re-run. You cannot influence who wins.",
  CLAIM: "Winners get a short time to claim their seat. Unclaimed seats go to the next person waiting.",
  SETTLED: "All seats are given out and the sale is over.",
};
const NEXT: Record<string, Record<string, string>> = {
  fairdrop: { SCHEDULED: "OPEN", OPEN: "CLOSED", CLOSED: "LOCKED", LOCKED: "DRAWN", DRAWN: "CLAIM", CLAIM: "SETTLED" },
  fcfs: { SCHEDULED: "OPEN", OPEN: "CLOSED", CLOSED: "SETTLED" },
};

export default function DropsTab({ dropId, setDropId }: { dropId: string; setDropId: (s: string) => void }) {
  const { data: drops, reload } = usePoll(() => api<any[]>("/admin/drops", { auth: "admin" }), 1500);
  const { data: events, reload: reloadEv } = usePoll(() => api<any[]>("/admin/events", { auth: "admin" }), 8000);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [busy, setBusy] = useState("");
  const sel = drops?.find((d) => d.id === dropId);

  const advance = async (to: string) => {
    setBusy(to); setMsg(null);
    try { await api(`/admin/drops/${dropId}/advance`, { body: { to }, auth: "admin" }); setMsg({ tone: "ok", t: `Moved on: the sale is now "${NAME[to]}".` }); }
    catch (e: any) { setMsg({ tone: "bad", t: `${e.code}: ${e.body?.state ? `state is ${e.body.state}, allowed next: ${e.body.allowed}` : e.message}` }); }
    setBusy(""); reload();
  };

  // ---- event form ----
  const [ev, setEv] = useState({ name: "Aurora Live 2026", venue: "Eden Arena", starts: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 16),
    tiers: [{ name: "Gold", price: 250, seats: 100 }, { name: "Silver", price: 150, seats: 150 }, { name: "General", price: 80, seats: 250 }] });
  const createEvent = async () => {
    try { const r = await api("/admin/events", { auth: "admin", body: { name: ev.name, venue: ev.venue, starts_at: new Date(ev.starts).toISOString(), tiers: ev.tiers.map((t) => ({ name: t.name, price_cents: Math.round(t.price * 100), seats: +t.seats })) } }); setMsg({ tone: "ok", t: `Event ${r.id} created. Now create a sale for it (step 2).` }); reloadEv(); setDr((x) => ({ ...x, event_id: r.id })); }
    catch (e: any) { setMsg({ tone: "bad", t: e.message }); }
  };
  // ---- drop form ----
  const [dr, setDr] = useState({ event_id: "", mode: "fairdrop", opens_in: 0, window: 600, cutoff: "now", claim: 60, auto: false });
  const createDrop = async () => {
    const now = Date.now();
    try {
      const r = await api("/admin/drops", { auth: "admin", body: { event_id: dr.event_id || events?.[0]?.id, mode: dr.mode, opens_at: new Date(now + dr.opens_in * 1000).toISOString(),
        closes_at: new Date(now + (dr.opens_in + dr.window) * 1000).toISOString(), cutoff_at: new Date(now + (dr.cutoff === "now" ? 0 : dr.cutoff === "1h" ? 3600e3 : 0)).toISOString(), claim_sec: +dr.claim, auto_draw: dr.auto } });
      setMsg({ tone: "ok", t: `Sale ${r.id} created. The draw secret's fingerprint ${r.seed_hash.slice(0, 16)}… and the ticket-signing public key are now published.` }); setDropId(r.id); reload();
    } catch (e: any) { setMsg({ tone: "bad", t: e.message }); }
  };

  const steps = sel ? STEPS[sel.mode] || STEPS.fairdrop : [];
  const idx = sel ? steps.indexOf(sel.state) : -1;
  const next = sel ? NEXT[sel.mode]?.[sel.state] : undefined;
  const old = sel?.mode === "fcfs";
  const backend = (s: string) => (old ? BACKEND_NOW_OLD[s] : BACKEND_NOW[s]) || BACKEND_NOW[s];

  return (
    <div className="space-y-6">
      <Explain title="How a sale works" tone="gold" icon={ShieldCheck}>
        Every sale moves through fixed stages, in order, and only one step at a time. You press the button to move on; the server refuses any other order. <b>Admins run the phases. They cannot pick winners.</b> The draw depends only on a secret committed before the sale and on the sealed list.
      </Explain>
      {msg && <Callout tone={msg.tone === "ok" ? "ok" : "bad"}>{msg.t}</Callout>}

      {sel ? (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel2/60 px-5 py-3">
            <div className="flex flex-wrap items-center gap-3"><Mono className="text-gold">Phase control</Mono><span className="display text-2xl">{sel.event_name}</span><Badge tone={old ? "red" : "gold"}>{old ? "Old way · first come first served" : "Fair Drop · draw"}</Badge></div>
            <div className="flex items-center gap-3"><TicketRule old={old} /><span className="font-mono text-xs text-mute">{sel.id}</span></div>
          </div>
          {/* the stage track */}
          <div className="no-scrollbar overflow-x-auto px-5 pb-2 pt-6">
            <ol className="grid min-w-[880px] gap-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((s, i) => {
                const done = i < idx, now = i === idx;
                return (
                  <li key={s} className="relative px-2 text-center">
                    {i > 0 && <span aria-hidden className={cn("absolute left-0 top-[22px] h-0.5 w-1/2", i <= idx ? "bg-lime/70" : "bg-line")} />}
                    {i < steps.length - 1 && <span aria-hidden className={cn("absolute right-0 top-[22px] h-0.5 w-1/2", i < idx ? "bg-lime/70" : now ? "bg-gold/40" : "bg-line")} />}
                    <div className={cn("relative mx-auto grid h-11 w-11 place-items-center rounded-full border-2 font-display text-lg", done ? "border-lime bg-lime/15 text-lime" : now ? "glow-gold border-gold bg-gold text-black" : "border-line bg-panel2 text-mute")} title={STAGE[s]?.[1]}>
                      {done ? <Check className="h-5 w-5" strokeWidth={3} /> : i + 1}
                    </div>
                    <div className={cn("mt-3 text-base font-bold", now ? "text-gold" : done ? "text-lime" : "text-mute")}>{NAME[s]}</div>
                    <div className="mt-1 text-xs leading-snug text-mute">{STAGE[s]?.[0]}</div>
                    <div className={cn("mt-2 rounded-[4px] border p-2 text-left text-xs leading-snug", now ? "border-gold/40 bg-gold/[.07] text-ink/90" : "border-line bg-panel2/50 text-mute")}>
                      <span className={cn("block font-mono text-xs font-semibold uppercase tracking-wider", now ? "text-gold" : "text-mute")}>Backend does</span>{backend(s)}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          {/* the one action */}
          <div className="m-5 grid gap-4 rounded-[5px] border border-line bg-bg/60 p-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Led tone={next ? "gold" : "mute"} pulse={!!next} /><Mono>{next ? "Next step" : "Nothing left to do"}</Mono></div>
              {next ? (<>
                <div className="display text-3xl">{LABEL[next]}</div>
                <p className="max-w-xl text-sm leading-relaxed text-ink/85">{DOES[next]}</p>
                <Button size="lg" disabled={!!busy} onClick={() => advance(next)}>{busy ? "Working…" : <>Advance to next phase<ArrowRight className="h-5 w-5" /></>}</Button>
              </>) : <p className="text-sm text-ink/85">This sale has reached its last stage. Create a new sale below to run another.</p>}
            </div>
            <div className="space-y-2 border-t border-line pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <Mono>Who can do what</Mono>
              <div className="flex gap-2 text-ink/90"><Check className="mt-0.5 h-4 w-4 shrink-0 text-lime" /><span><b>Admins can:</b> move the sale to its next phase. The server rejects any other order (a 409 error).</span></div>
              <div className="flex gap-2 text-ink/90"><UserX className="mt-0.5 h-4 w-4 shrink-0 text-hot" /><span><b>Nobody can:</b> pick winners, change an entry, or change the draw secret after it is committed.</span></div>
              <div className="flex gap-2 text-mute"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-violet" /><span>Right now: {BACKEND_CONTROL[sel.state]}</span></div>
            </div>
          </div>
          {/* fingerprints and schedule */}
          <div className="grid gap-6 border-t border-line p-5 md:grid-cols-2">
            <div className="space-y-3">
              <Mono className="flex items-center gap-2 text-violet"><KeyRound className="h-4 w-4" />Sealed things (cryptographic)</Mono>
              <Hash label="Draw-secret fingerprint (published when the sale was created)" v={sel.seed_hash} />
              <Hash label="Ticket-signing public key" v={sel.public_key ? sel.public_key.slice(0, 120) + "…" : ""} />
              <Hash label="Sealed-list fingerprint (Merkle root)" v={sel.merkle_root} />
              <Hash label="Draw secret (shown only after the draw)" v={sel.seed} />
              {!sel.merkle_root && !sel.seed && <p className="text-xs text-mute">The sealed-list fingerprint and the draw secret appear when those stages are reached.</p>}
            </div>
            <dl className="grid content-start gap-x-4 gap-y-2.5 text-sm [&_dt]:font-mono [&_dt]:text-xs [&_dt]:uppercase [&_dt]:tracking-wider [&_dt]:text-mute">
              <div><dt>Opens</dt><dd>{fmtTime(sel.opens_at_ms)}</dd></div>
              <div><dt>Closes</dt><dd>{fmtTime(sel.closes_at_ms)}</dd></div>
              <div><dt>Sign-up cutoff (who may enter)</dt><dd>{fmtTime(sel.cutoff_at_ms)}</dd></div>
              <div><dt>Claim window</dt><dd>{sel.claim_sec} seconds</dd></div>
              <div><dt>Entries in the sealed list</dt><dd>{sel.entry_count ?? "not sealed yet"}</dd></div>
              <div><dt>Ticket mode</dt><dd>{sel.token_mode}</dd></div>
            </dl>
          </div>
        </section>
      ) : <Explain title="Pick a sale" tone="gold">Choose one in the bar at the top, or create one at the bottom of this page.</Explain>}

      <Panel title="All sales" note="Every sale on the server. Pick one to run it. Fair Drop sales are gold, old first-come-first-served sales are red." right={<Legend items={[{ color: PAL.gold, label: "Fair Drop", shape: "bar" }, { color: PAL.hot, label: "Old way", shape: "bar" }]} />}>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead><tr><th className={th}>Sale</th><th className={th}>Event</th><th className={th}>Method</th><th className={th}>Stage</th><th className={th}>Seats</th><th /></tr></thead>
          <tbody>{(drops || []).map((d) => (
            <tr key={d.id} className={cn("border-t border-line", d.id === dropId && "bg-gold/[.06]")}>
              <td className={cn(td, "font-mono text-xs")}>{d.id}</td><td className={td}>{d.event_name}</td>
              <td className={td}><Badge tone={d.mode === "fcfs" ? "red" : "gold"}>{d.mode === "fcfs" ? "Old way" : "Fair Drop"}</Badge></td><td className={td}><StateBadge state={d.state} /></td>
              <td className={cn(td, "text-mute")}>{d.tiers.map((t: any) => `${t.name} ${t.seats}`).join(" · ")}</td>
              <td className={cn(td, "text-right")}><Button size="sm" variant={d.id === dropId ? "primary" : "secondary"} onClick={() => setDropId(d.id)}>{d.id === dropId ? "Selected" : "Select"}</Button></td>
            </tr>))}
            {drops && !drops.length && <tr><td colSpan={6} className="py-6 text-center text-sm text-mute">No sales yet. Create an event and a sale below.</td></tr>}</tbody></table></div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="1 · Create the event" note="The concert itself: its name, where, when, and the ticket sections with their prices and number of seats. The form is prefilled with example values: change them.">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Event name</Label><Input value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} /></div><div><Label>Venue</Label><Input value={ev.venue} onChange={(e) => setEv({ ...ev, venue: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Date</Label><Input type="datetime-local" value={ev.starts} onChange={(e) => setEv({ ...ev, starts: e.target.value })} /></div></div>
            <div className="grid grid-cols-[1fr_90px_90px_36px] gap-2 font-mono text-xs uppercase tracking-wider text-mute"><span>Section</span><span>Price (USD)</span><span>Seats</span><span /></div>
            {ev.tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_90px_36px] gap-2"><Input aria-label="Section name" value={t.name} onChange={(e) => setEv({ ...ev, tiers: ev.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input aria-label="Price in USD" type="number" value={t.price} onChange={(e) => setEv({ ...ev, tiers: ev.tiers.map((x, j) => (j === i ? { ...x, price: +e.target.value } : x)) })} />
                <Input aria-label="Seats" type="number" value={t.seats} onChange={(e) => setEv({ ...ev, tiers: ev.tiers.map((x, j) => (j === i ? { ...x, seats: +e.target.value } : x)) })} />
                <Button variant="ghost" size="sm" aria-label="Remove this section" onClick={() => setEv({ ...ev, tiers: ev.tiers.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button></div>))}
            <div className="flex flex-wrap gap-2 pt-1"><Button variant="secondary" size="sm" onClick={() => setEv({ ...ev, tiers: [...ev.tiers, { name: "Tier", price: 50, seats: 50 }] })}><Plus className="h-4 w-4" />Add a section</Button><Button onClick={createEvent}>Create event</Button></div>
          </div>
        </Panel>
        <Panel title="2 · Create the sale" note="The ticket sale for that event. Creating it generates the draw secret and the ticket-signing key, and publishes their fingerprints.">
          <div className="space-y-3">
            <div><Label>Event</Label><Select value={dr.event_id} onChange={(e) => setDr({ ...dr, event_id: e.target.value })}><option value="">(the latest event)</option>{(events || []).map((e) => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}</Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Method</Label><Select value={dr.mode} onChange={(e) => setDr({ ...dr, mode: e.target.value })}><option value="fairdrop">Fair Drop (draw)</option><option value="fcfs">Old way (first come first served)</option></Select></div>
              <div><Label>Opens in (seconds)</Label><Input type="number" value={dr.opens_in} onChange={(e) => setDr({ ...dr, opens_in: +e.target.value })} /></div>
              <div><Label>Sale lasts (seconds)</Label><Input type="number" value={dr.window} onChange={(e) => setDr({ ...dr, window: +e.target.value })} /></div>
              <div><Label>Who may enter</Label><Select value={dr.cutoff} onChange={(e) => setDr({ ...dr, cutoff: e.target.value })}><option value="now">Only people already verified (new sign-ups can&apos;t)</option><option value="1h">New sign-ups for the next hour can enter</option></Select></div>
              <div><Label>Claim time (seconds)</Label><Input type="number" value={dr.claim} onChange={(e) => setDr({ ...dr, claim: +e.target.value })} /></div>
              <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#ffc233]" checked={dr.auto} onChange={(e) => setDr({ ...dr, auto: e.target.checked })} />Move on automatically after it closes</label>
            </div>
            <Button onClick={createDrop}>Create the sale</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
