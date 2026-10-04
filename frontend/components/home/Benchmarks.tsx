"use client";
// Research metrics on the landing page: the two headline numbers (live from the arena when a test has run) and the
// "recognised ground" table. Only the sources the owner verified are cited; no other statistic appears here.
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useScience } from "./useLandingData";
import { confMetrics, pc } from "@/components/live/ResearchPanel";
import { n } from "@/components/admin/botinfo";
import ResearchReview from "@/components/admin/ResearchReview";

const EMPTY = "Run a test to fill this in.";

const ROWS: { name: string; means: string; use: string; href: string; src: string }[] = [
  { name: "OWASP OAT-005 \"Scalping\"", means: "The industry's name for this exact attack: buying limited goods, best known in ticketing, by unfair methods.", use: "It defines the threat Fair Drop is built against.", href: "https://owasp.org/www-project-automated-threats-to-web-applications/assets/oats/EN/OAT-005_Scalping", src: "OWASP" },
  { name: "US BOTS Act of 2016", means: "Bans getting around a site's security or purchase limits to buy tickets. The FTC enforces it; its first cases were in January 2021.", use: "The same one-per-person limit the law protects, enforced by design.", href: "https://www.ftc.gov/news-events/news/press-releases/2021/01/ftc-brings-first-ever-cases-under-bots-act", src: "FTC" },
  { name: "UK Digital Economy Act 2017, s.106", means: "With the 2018 ticket-limit regulations, it is a criminal offence to use bots to buy beyond the ticket limit.", use: "Same reason: a ticket limit that cannot be dodged.", href: "https://www.legislation.gov.uk/ukpga/2017/30/section/106", src: "legislation.gov.uk" },
  { name: "Rule of three (Hanley and Lippman-Hand, JAMA 1983)", means: "If nothing went wrong in n tries, you can still say the true failure rate is below 3 divided by n, with 95% confidence.", use: "The upper bound under \"real people wrongly turned away\".", href: "https://jhanley.biostat.mcgill.ca/c607/ch08/zero_numerator.pdf", src: "paper" },
  { name: "Precision and recall (Saito and Rehmsmeier, PLOS ONE 2015)", means: "On lopsided data, plain accuracy flatters. Precision and recall show what the gate really does.", use: "Bad requests caught, turned-away requests that deserved it, and F1.", href: "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0118432", src: "PLOS ONE" },
  { name: "KL divergence (Kullback and Leibler, 1951)", means: "A distance between two patterns. Here: how different a bot crowd's arrival timing is from real people's.", use: "The timing table on the live screen, as a side signal only.", href: "https://projecteuclid.org/journals/annals-of-mathematical-statistics/volume-22/issue-1/On-Information-and-Sufficiency/10.1214/aoms/1177729694.full", src: "Annals of Math. Stat." },
];

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[.12em] text-gold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">source: {children}<ExternalLink className="h-3 w-3" aria-hidden /></a>;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return <div className="border-t border-line pt-3"><div className="font-mono text-[12px] uppercase tracking-[.14em] text-[#e4def5]">{label}</div><div className={`display num text-[clamp(1.5rem,2.6vw,2.4rem)] leading-none ${tone}`}>{value}</div><div className="num text-[14px] text-[#e4def5]">{sub}</div></div>;
}

export default function Benchmarks() {
  const s = useScience();
  const m = useMemo(() => (s ? confMetrics(s.all) : null), [s]);
  const hm = useMemo(() => (s ? confMetrics(s.human) : null), [s]);
  const live = !!m && m.N > 0;
  const people = hm && hm.negatives ? hm : m;

  return (
    <div className="mx-auto mt-20 max-w-5xl">
      <div className="eyebrow mb-4 flex items-center gap-3 text-gold"><span className="font-bold">06c</span><span className="h-px w-8 bg-gold/50" />Research metrics, scored the way researchers score it</div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-[6px] border border-white/10 bg-[rgba(10,7,20,.92)] p-5">
          <h3 className="display text-3xl text-ink">1. Real people wrongly turned away</h3>
          <p className="mt-2 text-[16px] leading-relaxed text-ink">Out of every real fan who asks for a seat, how many does the door wrongly refuse. We aim for under 0.1%.</p>
          <p className="mt-2 text-[16px] leading-relaxed text-[#e4def5]"><b className="text-ink">Why it matters:</b> blocking a real fan is the worst mistake a gate can make. If nobody was wrongly refused, we report the 95% upper bound, 3 divided by the number of good requests.</p>
          <div className="mt-4">
            {live && people ? (
              <Stat label="Fair Drop gate, this test" value={pc(people.fpr, 3)} sub={`${n(people.FP)} of ${n(people.negatives)} good requests${people.FP === 0 && Number.isFinite(people.upper) ? `. True rate below ${pc(people.upper, 3)} (95% confidence)` : ""}`} tone={people.FP ? "text-hot" : "text-lime"} />
            ) : <p className="border-t border-line pt-3 text-[16px] text-ink">Method: count wrongly refused real people, divide by all real requests. {EMPTY}</p>}
          </div>
        </article>

        <article className="rounded-[6px] border border-white/10 bg-[rgba(10,7,20,.92)] p-5">
          <h3 className="display text-3xl text-ink">2. Precision, recall and F1</h3>
          <p className="mt-2 text-[16px] leading-relaxed text-ink">Recall: of the requests that should be refused, how many were. Precision: of the requests refused, how many deserved it. F1 joins the two.</p>
          <p className="mt-2 text-[16px] leading-relaxed text-[#e4def5]"><b className="text-ink">Why it matters:</b> traffic is lopsided, so plain accuracy looks great even for a weak gate. These two show what the gate really does.</p>
          <div className="mt-4">
            {live && m ? (
              <div className="grid grid-cols-3 gap-5">
                <Stat label="Recall" value={pc(m.recall)} sub="bad caught" tone="text-ink" />
                <Stat label="Precision" value={pc(m.precision)} sub="deserved it" tone="text-ink" />
                <Stat label="F1" value={pc(m.f1)} sub="both together" tone="text-ink" />
              </div>
            ) : <p className="border-t border-line pt-3 text-[16px] text-ink">Method: compare every decision with the judge&apos;s verdict. {EMPTY}</p>}
          </div>
        </article>
      </div>
      <p className="mt-3 inline-block rounded-[4px] bg-[rgba(10,7,20,.92)] px-3 py-2 text-[15px] text-white">{live ? "From the most recent test in the control room (refreshed every 5 s while you are signed in as admin)." : "These numbers appear for a signed-in admin after a test has run. Visitors see the method only, so nothing here polls the server."} The bot-versus-people arrival timing distance (KL divergence) is on the live screen.</p>

      <div className="mt-12">
        <h3 className="display mb-4 text-4xl">The research behind it, in plain words</h3>
        <ResearchReview dark />
      </div>

      <div className="mt-12">
        <div className="mb-4 inline-block rounded-[4px] bg-[rgba(10,7,20,.92)] px-3 py-1.5 font-mono text-[13px] font-bold uppercase tracking-[.18em] text-white">Standing on recognised ground</div>
        <div className="grid gap-4 md:grid-cols-2">
          {ROWS.map((r) => (
            <article key={r.name} className="flex flex-col rounded-[6px] border border-white/10 bg-[rgba(10,7,20,.92)] p-5 ">
              <h4 className="text-[19px] font-bold leading-snug text-gold">{r.name}</h4>
              <p className="mt-2 text-[17px] leading-relaxed text-white">{r.means}</p>
              <p className="mt-3 text-[16px] leading-relaxed text-[#e4def5]"><b className="font-mono text-[12px] uppercase tracking-[.14em] text-ice">Where we use it </b><br />{r.use}</p>
              <div className="mt-auto pt-4"><Src href={r.href}>{r.src}</Src></div>
            </article>
          ))}
        </div>
        <p className="mt-4 rounded-[6px] border border-gold/30 bg-[rgba(10,7,20,.92)] p-5 text-[17px] leading-relaxed text-white"><b className="text-gold">To be straight with you:</b> there is no single certified global benchmark for fair ticket queues. These are widely used standard measures and a recognised threat definition. Our numbers come from our own simulated test, not a certified audit. The strict 0.1% target is our research review&apos;s choice, not a legal standard. We do not use mouse-movement or browser-fingerprint detection, because seats never depend on spotting bots.</p>
      </div>
    </div>
  );
}
