"use client";
// Control room, "Research": every research value for the newest test, plus the outside review explained.
import ResearchPanel from "@/components/live/ResearchPanel";
import ResearchReview from "./ResearchReview";
import { useArena } from "@/lib/arena";
import { SectionTitle } from "./kit";

export default function ResearchSection() {
  const a = useArena();
  return (
    <>
      <SectionTitle n="08" kicker="Research" title="Research metrics" what="every research score for the newest test, for the Fair Drop gate and the old sale, then the outside review it comes from, point by point. The values are worked out from the judge's records of that test." />
      <div className="space-y-10">
        <ResearchPanel a={a} />
        <section>
          <h3 className="display mb-3 text-3xl">What the research review said, and what we did with it</h3>
          <ResearchReview />
        </section>
      </div>
    </>
  );
}
