"use client";
// The crowd flowing through one door. Every dot is one real decision the server recorded (sampled when very busy; the numbers
// in the pipeline are exact). Circle = real person (ice), diamond = bot (hot). After the gate a dot takes the colour of what
// happened to it: lime = let in, hot = turned away, orange = fell for the decoy trap. Pauses when the tab is hidden, honours reduced motion.
import { useEffect, useRef } from "react";
import type { LiveEvent } from "@/lib/arena";
import { reasonOf, SHORT } from "@/components/admin/botinfo";

export type FlowKind = "fcfs" | "lottery" | "fair";
const W = 600, H = 232, GATE = 292, HAT = { x: 486, y: 150 };
const C = { ice: "#7fd8ff", hot: "#ff3b5c", lime: "#b8ff4a", warn: "#ff8a3d", violet: "#8b6cff", gold: "#ffc233", mute: "#9a90b8" };
const MONO = '"JetBrains Mono Variable", ui-monospace, Menlo, Consolas, monospace';

type Dot = { born: number; dur: number; sx: number; sy: number; gy: number; tx: number; ty: number; v: string; bot: boolean; unk: boolean; why: string; hit: boolean; hold: number; bx: number; by: number };
type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; c: string };

const bez = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
const ease = (t: number) => t * t * (3 - 2 * t);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export default function Flow({ kind, events, live, accent }: { kind: FlowKind; events: LiveEvent[]; live: boolean; accent: string }) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const spawnRef = useRef<(e: LiveEvent[]) => void>(() => {});
  const clearRef = useRef<() => void>(() => {});

  // new events -> new dots (each decision exactly once; old history is never replayed as motion)
  useEffect(() => {
    if (!events.length) { seen.current = new Set(); clearRef.current(); return; }
    const fresh = events.filter((e) => !seen.current.has(e.id));
    fresh.forEach((e) => seen.current.add(e.id));
    if (seen.current.size > 5000) seen.current = new Set(events.map((e) => e.id));
    if (fresh.length && live) spawnRef.current(fresh.slice(0, 60).reverse());
  }, [events, live]);

  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dots: Dot[] = []; let sparks: Spark[] = [];
    let rings: { y: number; born: number; c: string }[] = [], pops: { y: number; born: number; text: string; c: string }[] = [];
    let flash = 0, flashCol = C.hot, lastPop = 0;

    const glow: Record<string, HTMLCanvasElement> = {};
    const sprite = (col: string) => {
      if (glow[col]) return glow[col];
      const o = document.createElement("canvas"); o.width = o.height = 64; const x = o.getContext("2d")!;
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col + "ff"); g.addColorStop(0.28, col + "88"); g.addColorStop(1, col + "00");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (glow[col] = o);
    };
    const txt = (s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = "left", weight = 600) => { ctx.font = `${weight} ${size}px ${MONO}`; ctx.fillStyle = col; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = "left"; };

    // static backdrop, drawn once
    const bg = document.createElement("canvas"); bg.width = W * dpr; bg.height = H * dpr;
    {
      const b = bg.getContext("2d")!; b.scale(dpr, dpr);
      const g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0d0919"); g.addColorStop(1, "#07050d"); b.fillStyle = g; b.fillRect(0, 0, W, H);
      b.fillStyle = "#2b234266"; for (let x = 12; x < W; x += 22) for (let y = 12; y < H; y += 22) b.fillRect(x, y, 1.3, 1.3);
      const sp = b.createRadialGradient(W / 2, -30, 10, W / 2, -30, 330); sp.addColorStop(0, accent + "33"); sp.addColorStop(1, accent + "00"); b.fillStyle = sp; b.fillRect(0, 0, W, H);
      const set = (x: number, y: number, w: number, h: number, col: string) => { b.fillStyle = col + "14"; b.strokeStyle = col + "55"; b.lineWidth = 1; b.beginPath(); b.roundRect(x, y, w, h, 6); b.fill(); b.stroke(); };
      const lab = (s: string, x: number, y: number, col: string, align: CanvasTextAlign = "left") => { b.font = `700 10px ${MONO}`; b.fillStyle = col; b.textAlign = align; b.fillText(s, x, y); };
      lab("THE CROWD", 14, 18, C.mute);
      if (kind === "lottery") {
        // the hat
        b.strokeStyle = C.violet; b.fillStyle = C.violet + "22"; b.lineWidth = 2.5;
        b.beginPath(); b.moveTo(HAT.x - 70, HAT.y - 28); b.lineTo(HAT.x - 56, HAT.y + 62); b.quadraticCurveTo(HAT.x, HAT.y + 80, HAT.x + 56, HAT.y + 62); b.lineTo(HAT.x + 70, HAT.y - 28); b.stroke();
        b.beginPath(); b.ellipse(HAT.x, HAT.y - 28, 70, 11, 0, 0, 7); b.fill(); b.stroke();
        lab("THE HAT", HAT.x, 18, C.violet, "center");
        lab("every request = one ticket", HAT.x, H - 10, C.violet + "cc", "center");
      } else {
        set(452, 30, 134, 130, C.lime);
        lab(kind === "fair" ? "ENTRIES" : "SEATS TAKEN", 519, 18, C.lime, "center");
        lab(kind === "fair" ? "into the draw" : "bought at once", 519, 150, C.lime + "99", "center");
        if (kind === "fair") { set(452, 176, 134, 44, C.warn); lab("DECOY TRAP", 519, 202, C.warn, "center"); }
        lab(kind === "fair" ? "ID SCAN" : "NO ID CHECK", GATE, 18, kind === "fair" ? C.gold : C.hot, "center");
      }
      const vg = b.createRadialGradient(W / 2, H / 2, 140, W / 2, H / 2, 420); vg.addColorStop(0, "#0000"); vg.addColorStop(1, "#0009"); b.fillStyle = vg; b.fillRect(0, 0, W, H);
    }

    spawnRef.current = (evs) => {
      const now = performance.now();
      evs.forEach((e, i) => {
        const bot = e.k === "bot", unk = e.k !== "bot" && e.k !== "human";
        const sy = rnd(34, H - 30), lot = kind === "lottery";
        const accepted = e.v === "accepted" || e.v === "absorbed";
        const dest = lot ? { x: HAT.x + rnd(-34, 34), y: HAT.y + rnd(18, 54) } : e.v === "decoy" ? { x: rnd(466, 574), y: rnd(190, 212) } : accepted ? { x: rnd(466, 574), y: rnd(44, 146) } : { x: GATE - rnd(70, 130), y: rnd(36, H - 36) };
        dots.push({ born: now + (i / Math.max(1, evs.length)) * 650, dur: reduce ? 1 : rnd(1500, 2100), sx: rnd(10, 70), sy, gy: lot ? HAT.y - 40 : sy * 0.55 + (H / 2) * 0.45 + rnd(-26, 26), tx: dest.x, ty: dest.y,
          v: lot ? "ticket" : e.v, bot, unk, why: reasonOf(e.s, e.o), hit: false, hold: reduce ? 2600 : 0, bx: rnd(-1, 1), by: rnd(-1, 1) });
      });
      if (dots.length > 320) dots.splice(0, dots.length - 320);
    };
    clearRef.current = () => { dots.length = 0; sparks = []; rings = []; pops = []; };

    const pos = (d: Dot, t: number): [number, number] => {
      if (kind === "lottery") {   // arc over to the hat, then drop in
        if (t < 0.6) { const u = ease(t / 0.6); return [bez(d.sx, (d.sx + HAT.x) / 2, HAT.x + (d.tx - HAT.x) * 0.4, u), bez(d.sy, Math.min(d.sy, 60) - 30, d.gy, u)]; }
        const u = ease((t - 0.6) / 0.4); return [bez(HAT.x + (d.tx - HAT.x) * 0.4, d.tx, d.tx, u), bez(d.gy, d.gy + 10, d.ty, u)];
      }
      if (t < 0.5) { const u = ease(t / 0.5); return [bez(d.sx, d.sx + 130, GATE - 6, u), bez(d.sy, d.sy, d.gy, u)]; }
      const u = ease((t - 0.5) / 0.5);
      if (d.v === "rejected") return [bez(GATE - 6, GATE + 6, d.tx, u), bez(d.gy, d.gy - 26 - d.by * 18, d.ty, u)];   // bounced back off the door
      return [bez(GATE + 6, GATE + 120, d.tx, u), bez(d.gy, d.gy, d.ty, u)];
    };

    const shape = (x: number, y: number, bot: boolean, r: number) => {
      ctx.beginPath();
      if (bot) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); } else ctx.arc(x, y, r * 0.78, 0, 7);
      ctx.fill();
    };

    let raf = 0, last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.drawImage(bg, 0, 0, W, H);
      flash = Math.max(0, flash - dt * 3.2);

      // the gate
      if (kind !== "lottery") {
        const col = kind === "fair" ? C.gold : C.hot;
        const gg = ctx.createLinearGradient(GATE - 22, 0, GATE + 22, 0); gg.addColorStop(0, col + "00"); gg.addColorStop(0.5, col + (kind === "fair" ? "40" : "22")); gg.addColorStop(1, col + "00");
        ctx.fillStyle = gg; ctx.fillRect(GATE - 22, 24, 44, H - 38);
        ctx.fillStyle = col + (kind === "fair" ? "dd" : "88");
        if (kind === "fair") ctx.fillRect(GATE - 1, 24, 2, H - 38);
        else { ctx.fillRect(GATE - 1, 24, 2, 26); ctx.fillRect(GATE - 1, H - 40, 2, 26); for (let y = 54; y < H - 44; y += 12) ctx.fillRect(GATE - 0.5, y, 1, 5); }   // an open doorway with no check
        if (kind === "fair") {   // the scanning beam sweeps up and down the gate
          const sw = reduce ? H / 2 : 24 + ((Math.sin(now / 520) + 1) / 2) * (H - 56);
          const sg = ctx.createLinearGradient(0, sw - 34, 0, sw + 34); sg.addColorStop(0, C.gold + "00"); sg.addColorStop(0.5, "#fff3c8cc"); sg.addColorStop(1, C.gold + "00");
          ctx.fillStyle = sg; ctx.fillRect(GATE - 30, sw - 34, 60, 68);
          const cone = ctx.createLinearGradient(GATE, 0, GATE - 120, 0); cone.addColorStop(0, C.gold + "26"); cone.addColorStop(1, C.gold + "00");
          ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(GATE, sw - 3); ctx.lineTo(GATE - 120, sw - 46); ctx.lineTo(GATE - 120, sw + 46); ctx.lineTo(GATE, sw + 3); ctx.fill();
        }
        if (flash > 0) { const fg = ctx.createLinearGradient(GATE - 40, 0, GATE + 40, 0); fg.addColorStop(0, flashCol + "00"); fg.addColorStop(0.5, flashCol + Math.round(flash * 120).toString(16).padStart(2, "0")); fg.addColorStop(1, flashCol + "00"); ctx.fillStyle = fg; ctx.fillRect(GATE - 40, 20, 80, H - 30); }
      }

      // dots (additive glow)
      ctx.globalCompositeOperation = "lighter";
      let w = 0;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i], age = now - d.born;
        if (age < 0) { dots[w++] = d; continue; }
        const t = Math.min(1, age / d.dur);
        if (age > d.dur + d.hold + 350) continue;
        dots[w++] = d;
        if (t >= 0.5 && !d.hit && kind !== "lottery") {
          d.hit = true;
          const col = d.v === "rejected" ? C.hot : d.v === "decoy" ? C.warn : C.lime;
          if (d.v !== "accepted" && d.v !== "absorbed") {
            flash = 1; flashCol = col; rings.push({ y: d.gy, born: now, c: col });
            if (d.v === "rejected" && sparks.length < 400) for (let s = 0; s < 6; s++) { const a = Math.random() * 6.28, sp = rnd(40, 110); sparks.push({ x: GATE, y: d.gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: now, life: rnd(420, 700), c: col }); }
            if (d.why && SHORT[d.why] && now - lastPop > 150 && pops.length < 10) { lastPop = now; pops.push({ y: d.gy, born: now, text: SHORT[d.why], c: col }); }
          } else if (kind === "fair") rings.push({ y: d.gy, born: now, c: C.lime });
        }
        const gone = Math.max(0, (age - d.dur - d.hold) / 350);
        const after = t >= 0.5 && kind !== "lottery";
        const col = after ? (d.v === "rejected" ? C.hot : d.v === "decoy" ? C.warn : C.lime) : d.unk ? C.mute : d.bot ? C.hot : C.ice;
        const dim = (after && d.v === "rejected" ? 0.55 * (1 - t) / 0.5 + 0.2 : 1) * (1 - gone);
        if (!reduce) for (let k = 3; k >= 1; k--) { const tt = t - k * 0.024; if (tt < 0) continue; const [x, y] = pos(d, tt); ctx.globalAlpha = (0.24 / k) * dim; ctx.drawImage(sprite(col), x - 11, y - 11, 22, 22); }
        const [x, y] = pos(d, t);
        ctx.globalAlpha = 0.85 * dim; ctx.drawImage(sprite(col), x - 12, y - 12, 24, 24);
        ctx.globalAlpha = Math.min(1, dim * 1.1); ctx.fillStyle = col; shape(x, y, d.bot, 4.6);
        ctx.globalAlpha = dim * 0.9; ctx.fillStyle = "#fff"; shape(x, y, d.bot, 1.9);
      }
      dots.length = w;

      sparks = sparks.filter((s) => now - s.born < s.life);
      for (const s of sparks) { const u = (now - s.born) / s.life; ctx.globalAlpha = (1 - u) * 0.9; ctx.drawImage(sprite(s.c), s.x + s.vx * u * 0.5 - 5, s.y + s.vy * u * 0.5 - 5 + 28 * u * u, 10, 10); }
      rings = rings.filter((r) => now - r.born < 380);
      ctx.lineWidth = 1.6;
      for (const r of rings) { const u = (now - r.born) / 380; ctx.globalAlpha = (1 - u) * 0.8; ctx.strokeStyle = r.c; ctx.beginPath(); ctx.ellipse(GATE, r.y, 5 + u * 16, 8 + u * 22, 0, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      pops = pops.filter((q) => now - q.born < 1100);
      for (const q of pops) { const u = (now - q.born) / 1100; ctx.globalAlpha = Math.min(1, (1 - u) * 1.6); txt(q.text, GATE - 6, q.y - 12 - u * 18, 11, q.c, "right", 700); }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(draw); } };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); spawnRef.current = () => {}; clearRef.current = () => {}; };
  }, [kind, accent]);

  const label = kind === "fair" ? "Live picture of the crowd going through the Fair Drop ID scan" : kind === "fcfs" ? "Live picture of the crowd rushing the old first-come-first-served door" : "Live picture of every request dropping into the lottery hat as one ticket";
  return <canvas ref={cvs} className="block h-auto w-full rounded-[4px] border border-line" style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={label} />;
}
