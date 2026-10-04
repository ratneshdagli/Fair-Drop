"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link2, Printer, ShieldCheck } from "lucide-react";
import { api, money, seatLabel, session } from "@/lib/api";
import { Button, Callout, Hash, Spinner } from "@/components/ui";
import JourneyRail from "@/components/fan/JourneyRail";
import ConcertTicket from "@/components/fan/ConcertTicket";
import { OneTicket } from "@/components/fan/kit";

export default function Ticket() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<any>(null);
  const [d, setD] = useState<any>(null);
  const [qr, setQr] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!session.get()) { router.replace(`/login?next=/ticket/${id}`); return; }
    Promise.all([api<any[]>("/me/tickets", { auth: "user" }), api<any>(`/drops/${id}`)]).then(async ([ts, drop]) => {
      const mine = ts.find((x) => x.drop_id === id);
      setD(drop);
      if (!mine) { setErr("No confirmed ticket for this drop on this account."); return; }
      setT(mine); setQr(await QRCode.toDataURL(mine.qr_payload, { margin: 1, width: 360, errorCorrectionLevel: "M" }));
    }).catch((e) => setErr(e.message));
  }, [id, router]);
  if (err) return <div className="space-y-6"><JourneyRail step={7} /><Callout tone="warn" title="No ticket yet">{err} <Link className="underline" href={`/claim/${id}`}>Go to the box office</Link></Callout></div>;
  if (!t || !d) return <Spinner label="Printing your ticket…" />;
  const tier = d.tiers.find((x: any) => x.id === t.tier);
  const verifyHref = `/verify?drop=${id}&receipt=${t.receipt_id}`;

  return (
    <div className="space-y-6">
      <JourneyRail step={8} />
      <div className="grid items-start gap-8 lg:grid-cols-[26rem_1fr] lg:gap-14">
        <ConcertTicket event={t.event_name} venue={t.venue} startsAt={d.starts_at} seat={seatLabel(t.tier, t.seat_no)} tier={tier?.name} paid={tier && money(tier.price_cents)} receipt={t.receipt_id} qr={qr}
          note={`Seat ${t.seat_no} was assigned by draw rank, not by click order.`} />

        <div className="fan-noprint no-print space-y-6">
          <div className="space-y-3">
            <div className="eyebrow flex items-center gap-3 text-gold"><span>The night</span><span className="h-px w-8 bg-gold/50" /></div>
            <h1 className="display text-[clamp(3rem,9vw,6rem)] text-glow-gold">See you at the show</h1>
            <p className="max-w-lg text-[15.5px] leading-relaxed text-ink/90">This is your ticket. Show the QR code at the entrance. It holds a payload signed with this sale's own key, so a copy someone made up would not check out.</p>
            <OneTicket />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => window.print()}><Printer className="h-4 w-4" />Print my ticket</Button>
            <Link href={verifyHref}><Button size="lg" variant="secondary"><ShieldCheck className="h-4 w-4" />Verify the draw</Button></Link>
          </div>
          <div className="panel space-y-3 p-5">
            <div className="eyebrow flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-violet" />Verification link</div>
            <p className="text-[13.5px] text-mute">Anyone you share this link with can re-run the whole draw and see that your seat came from a random, sealed list, not from speed or a favour.</p>
            <div className="hash select-all rounded-[4px] border border-line bg-bg px-3 py-2">{typeof window !== "undefined" ? window.location.origin : ""}{verifyHref}</div>
            <Hash label="Receipt (your entry's fingerprint)" v={t.receipt_id} />
          </div>
          <div className="panel p-5 text-[13.5px] leading-relaxed text-mute">
            <b className="text-ink">How you got here.</b> You signed in once, got one ticket at the door, the sealed list was drawn at random, and you claimed within your time window. Nobody was let in faster for clicking faster.
          </div>
        </div>
      </div>
    </div>
  );
}
