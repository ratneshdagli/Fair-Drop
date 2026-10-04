"use client";
import { useEffect, useRef } from "react";
import { EDGE, H, HEX, W, type Flow, type Tone } from "./data";

// The travelling dots. One canvas over the map, drawn in map units (1400 x 860) and scaled to the box. Pauses when the tab is hidden.
export type Path = { pts: [number, number][]; cum: number[]; len: number };
export function buildPath(chain: string[]): Path {
  const pts: [number, number][] = [];
  for (const raw of chain) {
    const rev = raw.startsWith("-");
    const e = EDGE[rev ? raw.slice(1) : raw];
    if (!e) continue;
    pts.push(...(rev ? [...e.pts].reverse() : e.pts));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] || 1 };
}
const at = (p: Path, d: number): [number, number] => {
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const seg = p.cum[i] - p.cum[i - 1] || 1, k = Math.min(1, Math.max(0, (d - p.cum[i - 1]) / seg));
  return [p.pts[i - 1][0] + (p.pts[i][0] - p.pts[i - 1][0]) * k, p.pts[i - 1][1] + (p.pts[i][1] - p.pts[i - 1][1]) * k];
};

export type Emitter = { path: Path; tone: Tone; shape: "c" | "d"; every: number; fail?: boolean };
export const toEmitters = (flows: Flow[]): Emitter[] => flows.map((f) => ({ path: buildPath(f.e), tone: f.c, shape: f.s || "c", every: f.heavy ? 0.11 : 0.62, fail: f.fail }));

/** Live mode: dots per second, and what share of them each answer class / server gets (all from real counts). */
export type LiveFeed = { rate: number; cls: [string, number][]; rep: [string, number][] };
const LIVE_TONE: Record<string, Tone> = { "2xx": "lime", "3xx": "lime", "4xx": "warn", "5xx": "hot" };
const LIVE_PATHS: Record<string, Path> = {};
const livePath = (rep: string) => LIVE_PATHS[rep] || (LIVE_PATHS[rep] = buildPath(["atk_nginx", `nginx_${rep.replace("-", "")}`, `${rep.replace("-", "")}_redis`]));
const pick = (a: [string, number][]) => {
  const t = a.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * t;
  for (const [k, v] of a) { if ((r -= v) <= 0) return k; }
  return a[0]?.[0] || "";
};

type Dot = { p: Path; d: number; hex: string; sh: "c" | "d"; fail: boolean; v: number };
const SPEED = 360;

export default function DotCanvas({ emit, live, run }: { emit: Emitter[]; live: LiveFeed | null; run: boolean }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const dots = useRef<Dot[]>([]), acc = useRef<number[]>([]), liveAcc = useRef(0);
  const cfg = useRef({ emit, live, run });
  cfg.current = { emit, live, run };
  useEffect(() => { dots.current = []; acc.current = emit.map(() => 9); }, [emit]);

  useEffect(() => {
    const c = cv.current!, b = box.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0, last = performance.now(), k = 1;
    const size = () => {
      const r = b.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      k = (r.width / W) * dpr;
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(b);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const { emit: em, live: lv, run: go } = cfg.current;
      if (document.hidden || reduce.matches) { ctx.clearRect(0, 0, c.width, c.height); return; }
      if (!go) return; // paused: keep the last picture
      const ds = dots.current;
      em.forEach((e, i) => { acc.current[i] = (acc.current[i] ?? 9) + dt; if (acc.current[i] >= e.every) { acc.current[i] = 0; if (ds.length < 260) ds.push({ p: e.path, d: 0, hex: HEX[e.tone], sh: e.shape, fail: !!e.fail, v: 0 }); } });
      if (lv && lv.rate > 0) {
        liveAcc.current += lv.rate * dt;
        while (liveAcc.current >= 1) {
          liveAcc.current -= 1;
          if (ds.length >= 260) break;
          const kcl = pick(lv.cls) || "2xx";
          ds.push({ p: livePath(pick(lv.rep) || "api-1"), d: 0, hex: HEX[LIVE_TONE[kcl] || "lime"], sh: "c", fail: false, v: 0 });
        }
      } else liveAcc.current = 0;
      ctx.clearRect(0, 0, c.width, c.height);
      for (let i = ds.length - 1; i >= 0; i--) {
        const o = ds[i];
        o.d += SPEED * dt;
        if (o.d >= o.p.len) { ds.splice(i, 1); continue; }
        const [x, y] = at(o.p, o.d);
        const f = Math.min(1, o.d / 24, (o.p.len - o.d) / 24);
        const lost = o.fail && o.d > o.p.len - 70;
        const col = lost ? HEX.hot : o.hex;
        ctx.globalAlpha = 0.22 * f; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x * k, y * k, 11 * k, 0, 7); ctx.fill();
        ctx.globalAlpha = f; ctx.fillStyle = col;
        ctx.beginPath();
        if (o.sh === "d") { const r = 6 * k; ctx.moveTo(x * k, y * k - r); ctx.lineTo(x * k + r, y * k); ctx.lineTo(x * k, y * k + r); ctx.lineTo(x * k - r, y * k); ctx.closePath(); }
        else ctx.arc(x * k, y * k, (lost ? 3.2 : 4.6) * k, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <div ref={box} className="pointer-events-none absolute inset-0 z-20" aria-hidden><canvas ref={cv} className="h-full w-full" /></div>;
}
