"use client";
// DO THE NUMBERS ADD UP? The arena checks itself: every figure on screen is tested against the others, live. Nothing is hard-coded.
import { Check, X } from "lucide-react";
import type { Arena } from "@/lib/arena";
import { Led, SectionHead, cn } from "@/components/ui";

export default function Checks({ a }: { a: Arena }) {
  const total = a.checks.length;
  const bad = a.checks.filter((c) => !c.ok).length;
  const ok = total - bad;
  return (
    <section className="space-y-5">
      <SectionHead kicker="The proof checks itself" title="Do the numbers add up?">
        Every figure on this screen is tested against the others, live. Totals must equal the sum of their parts and no method may hand out more seats than exist. If any check fails, this turns red and says so.
      </SectionHead>

      {total === 0 ? (
        <div className="panel border-dashed p-8 text-center text-sm text-mute">The checks appear as soon as a test has people in it.</div>
      ) : (
        <div className={cn("panel grid overflow-hidden md:grid-cols-[260px_1fr]", bad ? "border-hot/60 alarm" : "border-lime/40")}>
          <div className={cn("flex flex-col justify-center gap-2 border-b p-6 md:border-b-0 md:border-r", bad ? "border-hot/40 bg-hot/10" : "border-lime/25 bg-lime/[.06]")}>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.2em]" style={{ color: bad ? "#ff3b5c" : "#b8ff4a" }}><Led tone={bad ? "hot" : "lime"} pulse />{bad ? "Not all checks pass" : "All checks pass"}</div>
            <div className="display num text-7xl" style={{ color: bad ? "#ff3b5c" : "#b8ff4a" }}>{ok}<span className="text-4xl text-mute">/{total}</span></div>
            <div className="text-xs leading-[17px] text-mute">{bad ? `${bad} check${bad > 1 ? "s" : ""} failed: read the red lines.` : "Every sum on the screen agrees with every other."}</div>
          </div>
          <ul className="divide-y divide-line/70">
            {a.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-5 py-3">
                <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-lime/15 text-lime" : "bg-hot/15 text-hot")} aria-label={c.ok ? "Passed" : "Failed"}>{c.ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
                <div className="min-w-0">
                  <div className="text-sm text-ink/90">{c.label}</div>
                  <div className="num mt-0.5 font-mono text-[12px] text-mute">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.running && total > 0 && <p className="text-xs text-mute">While a test is running, some checks can briefly differ because the sale is still taking entries. They settle once it finishes.</p>}
    </section>
  );
}
