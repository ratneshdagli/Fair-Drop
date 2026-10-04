"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { BOTS, BOT_ORDER, SHORT } from "./botinfo";

// The live picture. Every dot is one decision the server really made (the feed is sampled when it is very busy;
// the numbers in the panels are exact). Dots start in the colour of WHO they are (blue person, orange bot), reach
// the protection gate, and change to the colour of what the gate DECIDED: green = let in, red = turned away,
// purple = fell for the decoy. A circle is a person, a diamond is a bot.

export type StageEvent = { v: string; k: string; pf?: string; r?: string };
export type StageHandle = { push: (evs: StageEvent[]) => void; reset: () => void };
export type StageProps = {
  counts: { ok: number; no: number; decoy: number };
  lanes: Record<string, { entered: number; blocked: number }>;
  seats?: number;
};

// the height follows the number of bot lanes (7 lanes = 560, the original size; every extra lane adds 48)
const W = 1000, GATE = 500, H = Math.max(560, 206 + BOT_ORDER.length * 48 + 18);
const KIND = { human: "#7fd8ff", bot: "#ff3b5c", unknown: "#9a90b8" } as Record<string, string>;
const VERD = { accepted: "#b8ff4a", rejected: "#ff3b5c", decoy: "#ff8a3d", absorbed: "#9a90b8" } as Record<string, string>;
const SANS = "'Instrument Sans Variable', system-ui, sans-serif", MONO = "'JetBrains Mono Variable', ui-monospace, monospace", GOLD = "#ffc233";
const PEOPLE = { x: 20, y: 40, w: 215, h: 118 }, VISIT = { x: 20, y: 166, w: 215, h: 30 };
const laneY = (i: number) => 206 + i * 48;
const BINS = { ok: { x: 765, y: 40, w: 215, h: 210 }, decoy: { x: 765, y: 262, w: 215, h: 72 }, no: { x: 765, y: 346, w: 215, h: H - 366 } };

type Dot = { why?: string; hit?: boolean; born: number; dur: number; sx: number; sy: number; gy: number; tx: number; ty: number; v: string; k: string; jit: number };
type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; c: string };

const DotStage = forwardRef<StageHandle, StageProps>(function DotStage(props, ref) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const dots = useRef<Dot[]>([]);
  const sparks = useRef<Spark[]>([]);
  const rings = useRef<{ y: number; born: number; c: string }[]>([]);
  const pops = useRef<{ y: number; born: number; text: string; c: string }[]>([]);
  const lastPop = useRef(0);
  const P = useRef(props); P.current = props;
  const shown = useRef({ ok: 0, no: 0, decoy: 0 });

  useImperativeHandle(ref, () => ({
    reset() { dots.current = []; sparks.current = []; rings.current = []; pops.current = []; shown.current = { ok: 0, no: 0, decoy: 0 }; },
    push(evs) {
      const now = performance.now();
      evs.forEach((e, i) => {
        const bot = e.k === "bot", human = e.k === "human";
        const li = bot ? Math.max(0, BOT_ORDER.indexOf(e.pf || "")) : -1;
        const sy = bot ? laneY(li) + 22 + (Math.random() - 0.5) * 26 : human ? PEOPLE.y + 24 + Math.random() * (PEOPLE.h - 36) : VISIT.y + 8 + Math.random() * 14;
        const bin = e.v === "accepted" ? BINS.ok : e.v === "decoy" ? BINS.decoy : e.v === "rejected" ? BINS.no : BINS.ok;
        const tx = bin.x + 24 + Math.random() * (bin.w - 48), ty = bin.y + 44 + Math.random() * (bin.h - 64);
        const gy = sy * 0.6 + 290 * 0.4 + (Math.random() - 0.5) * 36;
        dots.current.push({ born: now + (i / Math.max(1, evs.length)) * 480, why: e.r, dur: 1500 + Math.random() * 500, sx: 245, sy, gy, tx, ty, v: e.v, k: e.k, jit: Math.random() * 6.28 });
      });
      if (dots.current.length > 700) dots.current.splice(0, dots.current.length - 700);
    },
  }), []);

  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const glow: Record<string, HTMLCanvasElement> = {};
    const sprite = (col: string) => {
      if (glow[col]) return glow[col];
      const o = document.createElement("canvas"); o.width = o.height = 64; const x = o.getContext("2d")!;
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col + "ff"); g.addColorStop(0.25, col + "88"); g.addColorStop(1, col + "00");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (glow[col] = o);
    };
    // static backdrop, drawn once
    const bg = document.createElement("canvas"); bg.width = W * dpr; bg.height = H * dpr;
    { const b = bg.getContext("2d")!; b.scale(dpr, dpr);
      const g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#110c1f"); g.addColorStop(1, "#07050d"); b.fillStyle = g; b.fillRect(0, 0, W, H);
      b.fillStyle = "#2b2342"; for (let x = 10; x < W; x += 24) for (let y = 10; y < H; y += 24) b.fillRect(x, y, 1.2, 1.2);
      const v = b.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620); v.addColorStop(0, "#0000"); v.addColorStop(1, "#000a"); b.fillStyle = v; b.fillRect(0, 0, W, H); }

    const panel = (x: number, y: number, w: number, h: number, col: string, fill = 0.07) => {
      ctx.fillStyle = col + Math.round(fill * 255).toString(16).padStart(2, "0"); ctx.strokeStyle = col + "66"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
    };
    const txt = (s: string, x: number, y: number, font: string, col: string, align: CanvasTextAlign = "left") => { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = "left"; };
    const bez = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
    const ease = (t: number) => t * t * (3 - 2 * t);
    let raf = 0, last = performance.now();

    const pos = (d: Dot, t: number): [number, number] => {
      if (t < 0.5) { const u = ease(t / 0.5); return [bez(d.sx, d.sx + 140, GATE - 6, u), bez(d.sy, d.sy, d.gy, u)]; }
      const u = ease((t - 0.5) / 0.5);
      if (d.v === "rejected") return [bez(GATE + 6, GATE + 120, d.tx, u), bez(d.gy, d.gy + (d.ty - d.gy) * 0.2, d.ty, u)];
      return [bez(GATE + 6, GATE + 140, d.tx, u), bez(d.gy, d.gy, d.ty, u)];
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(bg, 0, 0, W, H);
      const p = P.current;

      // numbers glide to their targets
      const sh = shown.current;
      (["ok", "no", "decoy"] as const).forEach((k) => { sh[k] += (p.counts[k] - sh[k]) * Math.min(1, dt * 6); if (Math.abs(p.counts[k] - sh[k]) < 0.6) sh[k] = p.counts[k]; });

      // left: who is knocking
      panel(PEOPLE.x, PEOPLE.y, PEOPLE.w, PEOPLE.h, KIND.human);
      ctx.fillStyle = KIND.human; ctx.beginPath(); ctx.arc(PEOPLE.x + 18, PEOPLE.y + 18, 4.5, 0, 7); ctx.fill();
      txt("REAL PEOPLE", PEOPLE.x + 30, PEOPLE.y + 22, `700 12px ${MONO}`, KIND.human);
      txt("one device, one try", PEOPLE.x + 12, PEOPLE.y + 40, `12px ${SANS}`, "#9a90b8");
      const hl = p.lanes.HUMAN;
      if (hl) { txt(`got in: ${hl.entered.toLocaleString()}`, PEOPLE.x + 12, PEOPLE.y + PEOPLE.h - 26, `700 13px ${SANS}`, VERD.accepted); txt(`turned away: ${hl.blocked.toLocaleString()}`, PEOPLE.x + 12, PEOPLE.y + PEOPLE.h - 9, `700 13px ${SANS}`, hl.blocked ? VERD.rejected : "#9a90b8"); }
      panel(VISIT.x, VISIT.y, VISIT.w, VISIT.h, KIND.unknown, 0.05);
      txt("VISITORS (not labelled)", VISIT.x + 12, VISIT.y + 20, `600 12px ${MONO}`, "#9a90b8");
      BOT_ORDER.forEach((id, i) => {
        const b = BOTS[id], y = laneY(i), ln = p.lanes[id];
        panel(20, y, 215, 44, b.color, 0.07);
        ctx.save(); ctx.translate(40, y + 13); ctx.rotate(Math.PI / 4); ctx.fillStyle = b.color; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
        txt(b.name, 52, y + 18, `700 13px ${SANS}`, b.color);
        txt(ln ? `in ${ln.entered.toLocaleString()} · stopped ${ln.blocked.toLocaleString()}` : "no traffic yet", 32, y + 35, `12px ${SANS}`, "#9a90b8");
      });

      // right: where they end up
      const bin = (r: typeof BINS.ok, col: string, title: string, big: number, sub: string) => {
        panel(r.x, r.y, r.w, r.h, col, 0.08);
        txt(title, r.x + 14, r.y + 22, `700 12px ${MONO}`, col);
        txt(Math.round(big).toLocaleString(), r.x + 14, r.y + 52, `400 32px Anton, ${SANS}`, "#f4f0ff");
        txt(sub, r.x + 14, r.y + 72, `12px ${SANS}`, "#9a90b8");
      };
      bin(BINS.ok, VERD.accepted, "LET IN", sh.ok, p.seats ? `${p.seats} seats up for grabs` : "accepted");
      bin(BINS.decoy, VERD.decoy, "DECOY TRAP", sh.decoy, "");
      bin(BINS.no, VERD.rejected, "TURNED AWAY", sh.no, "blocked by the rules");
      // the gate
      const sweep = (now / 14) % (H + 120) - 60;
      const gg = ctx.createLinearGradient(GATE - 14, 0, GATE + 14, 0); gg.addColorStop(0, "#ffc23300"); gg.addColorStop(0.5, "#ffc23355"); gg.addColorStop(1, "#ffc23300");
      ctx.fillStyle = gg; ctx.fillRect(GATE - 14, 24, 28, H - 48);
      ctx.fillStyle = "#ffc233dd"; ctx.fillRect(GATE - 1, 24, 2, H - 48);
      const sg = ctx.createLinearGradient(0, sweep - 50, 0, sweep + 50); sg.addColorStop(0, "#ffc23300"); sg.addColorStop(0.5, "#ffe9a899"); sg.addColorStop(1, "#ffc23300");
      ctx.fillStyle = sg; ctx.fillRect(GATE - 2, Math.max(24, sweep - 50), 4, 100);
      txt("THE DOOR", GATE, 16, `700 12px ${MONO}`, GOLD, "center");
      txt("the server's rules decide here", GATE, H - 8, `12px ${SANS}`, "#ffc233cc", "center");

      // dots (additive glow)
      ctx.globalCompositeOperation = "lighter";
      const keep: Dot[] = [];
      for (const d of dots.current) {
        const t = (now - d.born) / d.dur;
        if (t < 0) { keep.push(d); continue; }
        if (t >= 1) continue;
        if (t >= 0.5 && !d.hit) {
          d.hit = true;
          const col = VERD[d.v] || "#9a90b8";
          rings.current.push({ y: d.gy, born: now, c: col });
          if (d.why && SHORT[d.why] && now - lastPop.current > 140 && pops.current.length < 14) { lastPop.current = now; pops.current.push({ y: d.gy, born: now, text: SHORT[d.why], c: col }); }
          if (d.v === "rejected" && sparks.current.length < 500) for (let s = 0; s < 6; s++) { const a = Math.random() * 6.28, sp = 40 + Math.random() * 90; sparks.current.push({ x: GATE, y: d.gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: now, life: 420 + Math.random() * 280, c: col }); }
        }
        keep.push(d);
        const after = t >= 0.5;
        const col = after ? VERD[d.v] || "#9a90b8" : KIND[d.k] || "#9a90b8";
        const dim = after && d.v === "rejected" ? 0.6 : 1;
        for (let k = 3; k >= 0; k--) {                         // comet tail
          const tt = t - k * 0.022; if (tt < 0) continue;
          const [x, y] = pos(d, tt); const a = (k === 0 ? 0.95 : 0.22 / k) * dim;
          ctx.globalAlpha = a; ctx.drawImage(sprite(col), x - 9, y - 9, 18, 18);
        }
        const [x, y] = pos(d, t);
        ctx.globalAlpha = 0.95 * dim; ctx.fillStyle = "#fff";
        if (d.k === "bot") { ctx.beginPath(); ctx.moveTo(x, y - 3.6); ctx.lineTo(x + 3.6, y); ctx.lineTo(x, y + 3.6); ctx.lineTo(x - 3.6, y); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); }
      }
      dots.current = keep;
      // sparks + gate ripples
      sparks.current = sparks.current.filter((s) => now - s.born < s.life);
      for (const s of sparks.current) { const u = (now - s.born) / s.life; ctx.globalAlpha = (1 - u) * 0.9; ctx.drawImage(sprite(s.c), s.x + s.vx * u * 0.5 - 5, s.y + s.vy * u * 0.5 - 5 + 30 * u * u, 10, 10); }
      rings.current = rings.current.filter((r) => now - r.born < 380);
      ctx.lineWidth = 1.6;
      for (const r of rings.current) { const u = (now - r.born) / 380; ctx.globalAlpha = (1 - u) * 0.8; ctx.strokeStyle = r.c; ctx.beginPath(); ctx.ellipse(GATE, r.y, 5 + u * 16, 8 + u * 22, 0, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      // the reason, spoken at the gate ("Fake ticket", "Too many clicks"...)
      pops.current = pops.current.filter((q) => now - q.born < 1100);
      for (const q of pops.current) { const u = (now - q.born) / 1100; ctx.globalAlpha = Math.min(1, (1 - u) * 1.6); txt(q.text, GATE + 20 + u * 14, q.y - u * 22, `700 13px ${SANS}`, q.c); }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={cvs} className="w-full rounded-[5px]" style={{ aspectRatio: `${W} / ${H}` }} aria-label="Live picture of requests reaching the door: lime let in, red turned away, orange caught by the decoy" />;
});

export default DotStage;
