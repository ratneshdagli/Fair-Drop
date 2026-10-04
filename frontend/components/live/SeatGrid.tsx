"use client";
// The 500 seats of the hall as one canvas (25 x 20). Seats given to real people are ice, seats given to bots are hot, empty seats are dark.
// Seats are scattered with a fixed shuffle so the share of bots is readable at a glance. A new seat flashes as it fills.
import { memo, useEffect, useRef } from "react";
import { SEATS } from "@/lib/arena";

const COLS = 25, ROWS = 20, CELL = 14, GAP = 3;
const W = COLS * CELL - GAP, H = ROWS * CELL - GAP;

// fixed shuffle (seeded), so seat k always sits at the same spot
const PERM = (() => { const p = Array.from({ length: SEATS }, (_, i) => i); let s = 12345; for (let i = SEATS - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } return p; })();

const SeatGrid = memo(function SeatGrid({ humanSeats, botSeats, solid }: { humanSeats: number; botSeats: number; solid: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = useRef({ h: 0, b: 0 });
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const tH = Math.min(SEATS, Math.max(0, Math.round(humanSeats)));
    const tB = Math.min(SEATS - tH, Math.max(0, Math.round(botSeats)));
    const draw = (h: number, b: number, fromTotal: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const T = h + b;
      const cell = (pos: number, fill: string, stroke: string, a: number, hi: boolean) => {
        const x = (pos % COLS) * CELL, y = Math.floor(pos / COLS) * CELL;
        ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.beginPath(); ctx.roundRect(x, y, CELL - GAP, CELL - GAP, 3); ctx.fill(); if (stroke) ctx.stroke();
        if (hi) { ctx.fillStyle = "#ffffff99"; ctx.beginPath(); ctx.roundRect(x, y, CELL - GAP, CELL - GAP, 3); ctx.fill(); }
      };
      ctx.lineWidth = 1;
      for (let k = 0; k < SEATS; k++) {
        if (k >= T) { cell(PERM[k], "#140f22", "#2b2342", 1, false); continue; }
        const bot = Math.floor(((k + 1) * b) / T) > Math.floor((k * b) / T);
        cell(PERM[k], bot ? "#ff3b5c" : "#7fd8ff", "", solid ? 1 : 0.6, k >= fromTotal);
      }
      ctx.globalAlpha = 1;
    };
    const from = { ...shown.current }, fromTotal = from.h + from.b;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { shown.current = { h: tH, b: tB }; draw(tH, tB, tH + tB); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      const h = Math.round(from.h + (tH - from.h) * e), b = Math.round(from.b + (tB - from.b) * e);
      shown.current = { h, b }; draw(h, b, k < 1 ? fromTotal : h + b);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [humanSeats, botSeats, solid]);
  return <canvas ref={ref} className="block h-auto w-full max-w-[350px] rounded-[3px]" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={`${humanSeats} of ${SEATS} seats went to real people, ${botSeats} to bots`} />;
});

export default SeatGrid;
