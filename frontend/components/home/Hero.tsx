"use client";
import { ArrowDown, Radio, Ticket } from "lucide-react";
import { Marquee } from "@/components/ui";
import { BOT_ORDER, LAYERS } from "@/components/admin/botinfo";
import { CONFIG } from "./config";
import { Chapter, LandingStyles, Legend, LinkBtn, Looking, Wrap } from "./parts";

export default function Hero() {
  return (
    <Chapter id="top" idx={0} className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-end overflow-hidden">
      <LandingStyles /><div className="beams" />
      <Wrap className="relative z-10 pb-6 pt-10 md:pt-14">
        <div className="md:max-w-[54%]">
        <div className="eyebrow mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-gold" data-reveal>
          <Ticket className="h-4 w-4" aria-hidden /><span>Tonight: a bot-proof ticket lottery</span><span className="h-px w-8 bg-gold/50" /><span className="text-ink">a 4-minute tour</span>
        </div>
        <h1 className="display text-[clamp(3.2rem,7.4vw,7.6rem)] leading-[.86]" aria-label={`${CONFIG.seats} seats. ${CONFIG.fans.toLocaleString("en-US")} fans. Zero bot advantage.`}>
          <span className="block overflow-hidden"><span data-line className="block">{CONFIG.seats} seats.</span></span>
          <span className="block overflow-hidden"><span data-line className="block">{CONFIG.fans.toLocaleString("en-US")} fans.</span></span>
          <span className="block overflow-hidden pb-[.04em]">
            <span data-line className="block bg-gradient-to-r from-gold via-gold to-hot bg-clip-text text-transparent">
              <span className="block">Zero bot </span><span className="block">advantage.</span>
            </span>
          </span>
        </h1>
        <div className="solid mt-8 max-w-xl space-y-5 rounded-[6px] p-6" data-reveal>
          <p className="text-[19px] leading-snug text-ink md:text-[21px]">
            Bots click faster than people. Here, clicking faster buys nothing: <b className="text-gold">1 login, 1 ticket, 1 seat at most</b>, then a random draw anyone can re-run.
          </p>
          <div className="flex flex-wrap gap-3">
            <LinkBtn href="/live" variant="primary"><Radio className="h-4 w-4" />Watch it live</LinkBtn>
            <LinkBtn href="#shows">Book a seat</LinkBtn>
            <LinkBtn href="#problem" variant="ghost"><ArrowDown className="h-4 w-4" />Start the 4-minute tour</LinkBtn>
          </div>
          <Looking>A concert hall before the doors open. Each streak of light is one person walking to a seat: ice-blue is a real person, a red diamond is a bot. A seat turns gold when someone is let in. Scroll and the camera takes you through the whole story.</Looking>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="eyebrow flex flex-wrap gap-x-6 gap-y-1">
            <span><b className="text-ink">{BOT_ORDER.length}</b> kinds of bot attack it</span><span><b className="text-ink">{LAYERS.length}</b> protection layers</span><span>no trust required</span>
          </div>
          <Legend className="hidden md:flex" />
        </div>
        </div>
      </Wrap>
      <Marquee className="relative z-10" items={[`${CONFIG.seats} seats`, `${CONFIG.fans.toLocaleString("en-US")} fans`, "zero bot advantage", "1 login · 1 ticket · 1 seat at most", "the list is sealed before the draw", "anyone can re-run the draw"]} />
    </Chapter>
  );
}
