"use client";
import Link from "next/link";
import { ArrowUpRight, Check, MonitorPlay, ScanSearch, SlidersHorizontal } from "lucide-react";
import { Led } from "@/components/ui";
import Benchmarks from "./Benchmarks";
import { CONFIG } from "./config";
import { Chapter, Kicker, Looking, Poster, Wrap } from "./parts";

const CHECKS: [string, string][] = [
  ["Re-run the draw", "Open Verify, load a finished show and run the draw in your own browser. The same list and the same seed give the same winners."],
  ["Look for your entry", "Your receipt must appear in the sealed list. If a dishonest server had dropped it, your own screen would turn red."],
  ["Watch a refusal get re-checked", "On the live screen every turned-away request is checked again by an independent test. Refused means refused for the stated reason."],
  ["Read where each number comes from", "Every figure says what it counts and where it comes from: live from the server, an exact test result, or calculated."],
];

export default function Proof() {
  return (
    <Chapter id="proof" idx={6} className="py-24 md:py-32">
      <Wrap>
        <div className="mx-auto max-w-5xl text-center">
          <Kicker n="06" label="The proof" time="3:20" tone="lime" className="justify-center" />
          <Poster className="mt-4 !text-[clamp(3rem,10vw,9rem)]">Don&apos;t trust us.<br /><span className="text-lime">Check.</span></Poster>
          <Looking className="mx-auto mt-6 text-left">The gold ticket floats above the {CONFIG.seats} lime seats it was drawn for. Below are three real screens of the app where you can see for yourself.</Looking>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:grid-rows-2">
          <Link href="/live" data-reveal className="panel-glass group relative flex flex-col justify-between gap-8 overflow-hidden border-hot/40 p-6 transition hover:border-hot lg:row-span-2 lg:p-8">
            <div className="absolute inset-0 -z-10 opacity-40 [background:radial-gradient(520px_260px_at_80%_0%,rgba(255,59,92,.35),transparent_70%)]" />
            <div className="flex items-center justify-between"><span className="eyebrow flex items-center gap-2 text-hot"><Led tone="hot" pulse />Live</span><ArrowUpRight className="h-5 w-5 text-mute transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-hot" aria-hidden /></div>
            <div>
              <MonitorPlay className="mb-4 h-9 w-9 text-hot" aria-hidden />
              <h3 className="display text-[clamp(2.6rem,5vw,4.6rem)]">Watch bots attack,<br />in real time</h3>
              <p className="mt-3 max-w-md text-[15px] text-ink/85">A screen made for a second monitor: the bots on stage, the door deciding on every request, and the three methods side by side.</p>
            </div>
            <div className="flex items-end gap-1.5" aria-hidden>{[9, 14, 6, 18, 11, 22, 8, 16, 12, 24, 10, 15].map((h, i) => <i key={i} className="w-full rounded-t-[2px] bg-hot/70" style={{ height: h * 2.2 }} />)}</div>
          </Link>
          <Link href="/verify" data-reveal className="panel-glass group flex flex-col gap-4 border-violet/40 p-6 transition hover:border-violet">
            <div className="flex items-center justify-between"><ScanSearch className="h-7 w-7 text-violet" aria-hidden /><ArrowUpRight className="h-5 w-5 text-mute transition group-hover:text-violet" aria-hidden /></div>
            <h3 className="display text-4xl">Re-run a draw in your own browser</h3>
            <p className="text-[14px] text-ink/85">Nothing to install and nobody to ask. Your computer replays the whole draw and tells you if it matches.</p>
            <div className="flex items-center gap-2 font-mono text-[11px] text-lime"><Check className="h-4 w-4" aria-hidden />same list + same seed = same winners</div>
          </Link>
          <Link href="/admin" data-reveal className="panel-glass group flex flex-col gap-4 border-gold/40 p-6 transition hover:border-gold">
            <div className="flex items-center justify-between"><SlidersHorizontal className="h-7 w-7 text-gold" aria-hidden /><ArrowUpRight className="h-5 w-5 text-mute transition group-hover:text-gold" aria-hidden /></div>
            <h3 className="display text-4xl">The control room</h3>
            <p className="text-[14px] text-ink/85">Create a show, let loose any of the bots yourself and read every number the tests recorded. Sign-in needed.</p>
          </Link>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <div className="eyebrow mb-4 flex items-center gap-3 text-lime"><span className="font-bold">06b</span><span className="h-px w-8 bg-lime/50" />What a judge can re-check, independently</div>
          <ol className="grid gap-px overflow-hidden rounded-[6px] border border-line bg-line md:grid-cols-2">
            {CHECKS.map(([t, d], i) => (
              <li key={t} className="flex gap-4 bg-bg/85 p-5">
                <span className="display text-5xl leading-none text-lime/80">{i + 1}</span>
                <div><div className="display text-2xl">{t}</div><p className="mt-1 text-[14px] leading-snug text-ink/85">{d}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <Benchmarks />
      </Wrap>
    </Chapter>
  );
}
