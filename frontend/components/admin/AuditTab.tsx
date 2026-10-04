"use client";
// Tamper checks: the six safety counts and the hash-chained record of everything that happened.
import { useState } from "react";
import { FileSearch, Link2, Wrench } from "lucide-react";
import { api, testKey, usePoll } from "@/lib/api";
import { Badge, Button, Callout, Led, Spinner, Stat } from "@/components/ui";
import { Explain, NeedSale, Panel, th, td, useDropPoll } from "./kit";

const ROWS: [string, string, string][] = [
  ["oversold", "Oversold seats", "seats sold beyond what exists"],
  ["duplicate_entries", "Extra entries", "entries beyond tickets handed out"],
  ["duplicate_seats", "Double-booked seats", "a seat or receipt given out twice"],
  ["missing_receipts", "Missing receipts", "accepted entries absent from the sealed list"],
  ["broken_merkle", "Broken fingerprint", "published fingerprint differs from a recount"],
  ["invalid_transitions", "Illegal stage changes", "stages that skipped the order"],
];

export default function AuditTab({ dropId }: { dropId: string }) {
  const [chain, setChain] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const { data: integ } = useDropPoll(dropId, "integrity", 3000);
  const { data: log, reload: rL } = useDropPoll(dropId, "audit?limit=60", 3000);
  if (!dropId) return <NeedSale />;
  const verify = async () => { setBusy(true); try { const r = await api<any>(`/admin/drops/${dropId}/audit?limit=1&verify=1`, { auth: "admin" }); setChain(r.chain); } finally { setBusy(false); } };
  const tamper = async (repair: boolean) => {
    try { const r = await api<any>("/test/tamper-audit", { body: { repair }, headers: { "X-Test-Key": testKey.get() } }); setNote(repair ? `Repaired ${r.repaired_rows} row(s). Verify the chain again.` : `Stored event #${r.tampered_seq} was edited (one trailing space). Now press Verify the chain.`); setChain(null); rL(); }
    catch (e: any) { setNote(e.message); }
  };
  const v = integ?.violations || {};
  return (
    <div className="space-y-6">
      <Explain title="What this proves" tone="gold" icon={FileSearch}>That nothing was sold twice, no one entered twice, nothing is missing from the sealed list, and the permanent record has not been edited. Every event is chained to the one before it, like numbered envelopes sealed with wax: change one and every seal after it breaks. If anything below turns red, something is wrong.</Explain>

      <Panel title="Safety counts" note="Six things that must always be zero. Each is recounted from independent records, not from the server&rsquo;s own say-so."
        right={integ && (integ.ok ? <Badge tone="green"><Led tone="lime" />all six are zero</Badge> : <Badge tone="red" className="alarm"><Led tone="hot" />{integ.total_violations} problem(s)</Badge>)}>
        {!integ ? <Spinner label="Counting…" /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {ROWS.map(([k, name, d]) => <Stat key={k} label={name} value={v[k] === null || v[k] === undefined ? "wait" : v[k]} sub={v[k] === null || v[k] === undefined ? "checked after the list is sealed" : d} tone={v[k] > 0 ? "bad" : v[k] === 0 ? "ok" : "warn"} />)}
          </div>
        )}
        {integ?.violations?.missing_receipts > 0 && <Callout tone="bad" title="Missing receipt(s) detected" className="mt-4">The independent log recorded an accepted entry that is absent from the published sealed list: {integ.info.missing_receipt_examples?.join(", ")}. This is what a dishonest server would look like.</Callout>}
        {integ && <p className="mt-4 text-sm text-mute">For this sale: <b className="text-ink">{integ.info.tokens_issued}</b> tickets handed out · <b className="text-ink">{integ.info.entries_registered}</b> entries · <b className="text-ink">{integ.info.allocations_pg}</b> seats recorded in Postgres · <b className="text-ink">{integ.info.seats_owned_redis}</b> seats held in Redis · <b className="text-ink">{integ.info.rejected_reused_tokens}</b> reused tickets blocked · record lag {integ.info.ledger_lag}</p>}
      </Panel>

      <Panel title="The chained record" note="Every event the system writes is stored with a fingerprint that includes the previous event&rsquo;s fingerprint."
        right={<Button size="sm" onClick={verify} disabled={busy}><Link2 className="h-4 w-4" />{busy ? "Verifying…" : "Verify the chain"}</Button>}>
        <div className="space-y-4">
          {chain && (chain.ok
            ? <Callout tone="ok" title="Chain verified">{chain.length.toLocaleString()} events, each fingerprint commits to the one before. Latest fingerprint: <span className="hash">{chain.head_hash}</span></Callout>
            : <Callout tone="bad" title={`Chain BROKEN at event #${chain.broken_at}`}>{chain.reason}. Someone changed the permanent record after it was written.</Callout>)}
          <div className="flex flex-wrap items-center gap-3 rounded-[5px] border border-warn/35 bg-warn/[.06] p-3.5">
            <Wrench className="h-5 w-5 shrink-0 text-warn" />
            <div className="min-w-[220px] flex-1 text-sm"><b className="text-warn">Try to tamper (demo)</b><div className="text-mute">Edits one stored event on purpose, so you can watch the chain check catch it. Test mode only.</div></div>
            <Button size="sm" variant="warn" onClick={() => tamper(false)}>Edit a stored event</Button><Button size="sm" variant="secondary" onClick={() => tamper(true)}>Repair it</Button>
            {note && <div className="basis-full text-sm text-ink/90">{note}</div>}
          </div>
          <div className="thin-scroll max-h-[26rem] overflow-auto rounded-[4px] border border-line"><table className="w-full min-w-[640px]"><thead className="sticky top-0 bg-panel2"><tr><th className={th + " pl-3"}>#</th><th className={th}>Time</th><th className={th}>Event</th><th className={th}>What was recorded</th><th className={th}>Fingerprint</th></tr></thead>
            <tbody>{(log?.events || []).map((e: any) => <tr key={e.seq} className="border-t border-line"><td className={td + " pl-3 text-mute"}>{e.seq}</td><td className={td + " whitespace-nowrap"}>{new Date(e.at).toLocaleTimeString()}</td><td className={td + " font-semibold"}>{e.type}</td><td className={td + " font-mono text-xs text-mute"}>{JSON.stringify(e.payload).slice(0, 110)}</td><td className={td + " font-mono text-xs text-mute"}>{e.hash.slice(0, 12)}…</td></tr>)}</tbody></table></div>
          <p className="text-sm text-mute">{(log?.total ?? 0).toLocaleString()} events recorded for this sale · record lag {log?.ledger_lag ?? 0}. The newest 60 are shown.</p>
        </div>
      </Panel>
    </div>
  );
}
