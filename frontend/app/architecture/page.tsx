import type { Metadata } from "next";
import ArchHero from "@/components/arch/ArchHero";
import ArchMap from "@/components/arch/ArchMap";
import { BuildStack, EntryStrip, Legend, LinkRow, WhyShape } from "@/components/arch/Sections";
import { Marquee, SectionHead } from "@/components/ui";

export const metadata: Metadata = { title: "How it is built - Fair Drop", description: "The real architecture of Fair Drop: gateway, three servers, Redis, Postgres, and how a request travels through them." };

export default function Architecture() {
  return (
    <div className="space-y-16 md:space-y-24">
      <section className="relative">
        <div className="beams opacity-60" />
        <div className="relative z-10 space-y-6">
          <div className="eyebrow flex items-center gap-3 text-gold"><span>The architecture</span><span className="h-px w-10 bg-gold/50" /><span>what you are looking at</span></div>
          <h1 className="display text-6xl md:text-8xl">How a request <span className="text-gold text-glow-gold">travels</span></h1>
          <p className="max-w-2xl text-lg text-ink/85">Every part of Fair Drop, from a fan&apos;s browser to the permanent record. Press a story and watch a request travel along the real routes. Click any box to open it.</p>
          <ArchHero />
          <Legend />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHead n="01" kicker="the map" title="Where everything lives">
          Left to right: the people, the front door, the three servers, then the memory and the record. The gold line on a box says what that part does for our one rule.
        </SectionHead>
        <ArchMap />
      </section>

      <Marquee items={["One gateway", "Three identical servers", "Redis is the fast lane", "Postgres is the record", "No server remembers anything", "The draw never reads the clock"]} />

      <section className="space-y-6">
        <SectionHead n="02" kicker="how we built it" title="The build, layer by layer">What we wrote, what it runs on, and the rig we use to attack it. The container count is read from our docker-compose file.</SectionHead>
        <BuildStack />
      </section>

      <section className="space-y-6">
        <SectionHead n="03" kicker="why this shape" title="Four decisions">Each one is a choice we made on purpose, and what it buys.</SectionHead>
        <WhyShape />
      </section>

      <section className="space-y-6">
        <SectionHead n="04" kicker="one entry, start to finish" title="Ten hops">Hover or tap a hop to read what happens there. Follow it on the map above with the story called &quot;A fan enters the draw&quot;.</SectionHead>
        <EntryStrip />
      </section>

      <section className="space-y-4">
        <div className="eyebrow">See it for real</div>
        <LinkRow />
      </section>
    </div>
  );
}
