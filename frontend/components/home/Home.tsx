"use client";
// The landing page as a 4-minute presentation: one pinned 3D arena, eight DOM chapters scrolling over it.
import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { prog } from "./store";
import Rail, { MARKS } from "./Rail";
import Hero from "./Hero";
import Problem from "./Problem";
import Bots from "./Bots";
import Journey from "./Journey";
import Methods from "./Methods";
import How from "./How";
import Proof from "./Proof";
import Shows from "./Shows";

const Stage = dynamic(() => import("./Stage"), { ssr: false });

// seconds on the talk clock at the start of each chapter (hero = before the clock starts), then the end
const CLOCK = [0, 0, 40, 80, 120, 160, 200, 230, 240];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** CSS-only stage for browsers without WebGL (or if the 3D scene crashes). All chapter text still shows. */
function Fallback() {
  return (
    <div className="absolute inset-0" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(255,194,51,.22), transparent 70%), radial-gradient(50% 45% at 85% 20%, rgba(139,108,255,.3), transparent 70%), radial-gradient(60% 40% at 10% 100%, rgba(255,59,92,.16), transparent 70%)" }}>
      <div className="beams" />
    </div>
  );
}
class Boundary extends React.Component<{ children: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? <Fallback /> : this.props.children; }
}

export default function Home() {
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const lenis = useRef<Lenis | null>(null);
  const [cap, setCap] = useState<{ ok: boolean; n: number; narrow: boolean } | null>(null);
  const [tick, setTick] = useState(-1);

  // what can this device do?
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    prog.reduced = reduced;
    const narrow = window.innerWidth < 768;
    let ok = false;
    try {
      const c = document.createElement("canvas"), gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
      ok = !!gl; gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { ok = false; }
    let n = reduced ? 1200 : narrow ? 1800 : 4200;
    if (!reduced && (navigator.hardwareConcurrency || 8) <= 4) n = Math.round(n * 0.7);
    setCap({ ok, n, narrow });
  }, []);

  // scroll: Lenis smooth scroll + ScrollTrigger; writes prog.u for the 3D stage and drives the timer rail
  useEffect(() => {
    const el = root.current; if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const reduced = prog.reduced;
    let lns: Lenis | null = null, raf: ((t: number) => void) | null = null;
    if (!reduced) {
      lns = new Lenis({ lerp: 0.09, anchors: true });
      lenis.current = lns;
      lns.on("scroll", ScrollTrigger.update);
      raf = (t: number) => lns!.raf(t * 1000);
      gsap.ticker.add(raf); gsap.ticker.lagSmoothing(0);
    }
    const chapters = Array.from(el.querySelectorAll<HTMLElement>("[data-chapter]"));
    let lastTick = -2, lastClock = "";
    // chapter geometry is measured only when the layout changes (never per scroll tick: no forced layout while scrolling)
    let tops: number[] = [], hs: number[] = [];
    const measure = () => { const y = window.scrollY; tops = chapters.map((c) => c.getBoundingClientRect().top + y); hs = chapters.map((c) => c.offsetHeight); };
    const update = () => {
      const cy = window.scrollY + window.innerHeight * 0.5;
      let i = 0;
      for (let k = 0; k < tops.length; k++) if (tops[k] <= cy) i = k;
      const f = Math.min(0.999, Math.max(0, (cy - tops[i]) / Math.max(1, hs[i])));
      prog.u = i + f; prog.ping?.();
      const p = Math.min(1, Math.max(0, prog.u - 1) / (MARKS.length - 1));
      rail.current?.style.setProperty("--p", String(p));
      const c = fmt(CLOCK[i] + (CLOCK[i + 1] - CLOCK[i]) * f);
      if (c !== lastClock && clock.current) { clock.current.textContent = c; lastClock = c; }
      const t = Math.max(-1, i - 1);
      if (t !== lastTick) { lastTick = t; setTick(t); }
    };
    measure();
    const st = ScrollTrigger.create({ start: 0, end: "max", onUpdate: update, onRefresh: () => { measure(); update(); } });
    update();
    let ro: ResizeObserver | null = null, rt = 0;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => { clearTimeout(rt); rt = window.setTimeout(() => { measure(); update(); }, 120); }); ro.observe(el); }
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    const ctx = gsap.context(() => {
      if (reduced) return;
      gsap.from("[data-line]", { yPercent: 112, duration: 1.1, ease: "expo.out", stagger: 0.12, delay: 0.15 });
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((e) => gsap.from(e, { y: 36, autoAlpha: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: e, start: "top 90%", once: true } }));
    }, el);

    return () => {
      ctx.revert(); st.kill(); ro?.disconnect(); clearTimeout(rt);
      if (raf) gsap.ticker.remove(raf);
      lns?.destroy(); lenis.current = null; prog.u = 0;
    };
  }, []);

  const jump = (ch: number) => {
    const t = root.current?.querySelector<HTMLElement>(`[data-chapter="${ch}"]`); if (!t) return;
    if (lenis.current) lenis.current.scrollTo(t, { offset: -56, duration: 1.6 }); else t.scrollIntoView();
  };

  return (
    <div ref={root} className="relative pb-11 md:pb-0">
      {/* the pinned arena; it never takes clicks and stays inside this page (so the footer is not lit by it) */}
      <div aria-hidden className="pointer-events-none sticky top-0 z-0 -mt-14 -mb-[calc(100dvh-3.5rem)] h-dvh overflow-hidden">
        {cap?.ok ? <Boundary><Stage n={cap.n} narrow={cap.narrow} /></Boundary> : <Fallback />}
      </div>
      <Rail active={tick} onJump={jump} rootRef={rail} clockRef={clock} />
      <div className="relative z-10">
        <Hero /><Problem /><Bots /><Journey /><Methods /><How /><Proof /><Shows />
      </div>
    </div>
  );
}
