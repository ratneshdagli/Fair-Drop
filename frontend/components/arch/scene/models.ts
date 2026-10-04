// Hand-modelled nodes for the /architecture 3D hero. Pure three.js, no React. Every builder returns a group, a top height (for the DOM label),
// and a tick(t, active, flash) that animates it. disposeTree() frees everything a builder created.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HEX } from "../data";

export type Node3D = { group: THREE.Group; top: number; half: number; tick: (t: number, a: number, fl: number) => void };

const col = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const std = (color: string, rough = 0.4, metal = 0.8, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o });
const rbox = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, r);
const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };

/** Emissive "light" materials (unlit, over-bright so bloom picks them up) whose intensity can be scaled together. */
class Glow {
  list: { m: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  mat(hex: string, k = 2.4) { const m = new THREE.MeshBasicMaterial({ color: col(hex, k), toneMapped: false }); this.list.push({ m, base: m.color.clone() }); return m; }
  set(k: number) { for (const g of this.list) g.m.color.copy(g.base).multiplyScalar(k); }
}

const hitProxy = (g: THREE.Group, w: number, h: number, d: number) => { const m = add(g, new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }), 0, h / 2, 0); m.name = "hit"; };

export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) { for (const v of Object.values(mt)) if (v instanceof THREE.Texture) v.dispose(); mt.dispose(); }
    if ((c as THREE.InstancedMesh).isInstancedMesh) (c as THREE.InstancedMesh).dispose();
  });
}

// ── canvas textures ──
function tex(c: HTMLCanvasElement) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) { x.beginPath(); x.roundRect(a, b, w, h, r); }

function screenTexture() {
  const c = document.createElement("canvas"); c.width = 768; c.height = 480; const x = c.getContext("2d")!;
  x.fillStyle = "#0c0817"; x.fillRect(0, 0, 768, 480);
  x.fillStyle = "#171126"; x.fillRect(0, 0, 768, 56);
  [HEX.hot, HEX.gold, HEX.lime].forEach((k, i) => { x.fillStyle = k; x.beginPath(); x.arc(30 + i * 26, 28, 8, 0, 7); x.fill(); });
  x.fillStyle = "#241b3d"; rr(x, 140, 12, 440, 32, 16); x.fill();
  x.fillStyle = HEX.ice; x.beginPath(); x.arc(164, 28, 6, 0, 7); x.fill();
  x.fillStyle = "#3a2f5c"; rr(x, 186, 23, 180, 10, 5); x.fill();
  // ticket card
  x.strokeStyle = HEX.gold; x.lineWidth = 3; rr(x, 56, 100, 400, 250, 14); x.stroke();
  x.setLineDash([7, 7]); x.beginPath(); x.moveTo(340, 108); x.lineTo(340, 342); x.stroke(); x.setLineDash([]);
  x.fillStyle = "#4a3d78"; rr(x, 82, 132, 170, 18, 9); x.fill(); rr(x, 82, 166, 220, 11, 5); x.fill(); rr(x, 82, 190, 190, 11, 5); x.fill(); rr(x, 82, 214, 150, 11, 5); x.fill();
  x.fillStyle = HEX.gold; rr(x, 82, 282, 160, 42, 9); x.fill();
  x.fillStyle = "#0c0817"; rr(x, 104, 298, 90, 10, 5); x.fill();
  x.fillStyle = HEX.gold; for (let i = 0; i < 5; i++) { x.globalAlpha = 0.9 - i * 0.14; rr(x, 362, 140 + i * 36, 68 - i * 6, 14, 5); x.fill(); } x.globalAlpha = 1;
  // side column
  x.fillStyle = "rgba(127,216,255,.16)"; rr(x, 490, 100, 230, 120, 12); x.fill();
  x.fillStyle = HEX.ice; x.beginPath(); x.arc(540, 150, 20, 0, 7); x.fill(); rr(x, 576, 134, 110, 12, 6); x.fill(); rr(x, 576, 160, 80, 10, 5); x.fill();
  x.fillStyle = "#3a2f5c"; for (let i = 0; i < 4; i++) { rr(x, 490, 244 + i * 28, 230 - i * 36, 12, 6); x.fill(); }
  x.fillStyle = HEX.lime; x.beginPath(); x.arc(500, 420, 7, 0, 7); x.fill(); x.fillStyle = "#3a2f5c"; rr(x, 520, 414, 140, 12, 6); x.fill();
  return tex(c);
}
function keysTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const x = c.getContext("2d")!;
  x.fillStyle = "#14102a"; x.fillRect(0, 0, 512, 256);
  x.fillStyle = "#2f2750"; for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) { rr(x, 14 + k * 35, 14 + r * 30, 29, 22, 4); x.fill(); }
  x.fillStyle = "#3a2f5c"; rr(x, 120, 170, 270, 24, 4); x.fill();
  return tex(c);
}
function plateTexture(text: string, hex: string) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const x = c.getContext("2d")!;
  x.fillStyle = "#0a0714"; x.fillRect(0, 0, 512, 128);
  x.fillStyle = hex; x.font = "700 64px 'JetBrains Mono', ui-monospace, monospace"; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(text, 70, 68);
  x.beginPath(); x.arc(34, 64, 12, 0, 7); x.fill();
  return tex(c);
}

// ── Fan's browser: a laptop with a live-looking screen + a floating ghost window ──
export function buildFan(): Node3D {
  const g = new THREE.Group(), body = new THREE.Group(), gl = new Glow(); g.add(body); g.rotation.y = 0.42;
  const alu = std("#2b2745", 0.34, 0.9), screen = screenTexture();
  add(body, rbox(2.5, 0.1, 1.7, 0.04), alu, 0, 0.6, 0);
  const keys = add(body, new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.6, metalness: 0.3 }), 0, 0.652, -0.1); keys.rotation.x = -Math.PI / 2;
  add(body, rbox(0.8, 0.012, 0.42, 0.005), std("#3a3560", 0.3, 0.9), 0, 0.652, 0.58);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.62, -0.82); hinge.rotation.x = -0.22; body.add(hinge);
  add(hinge, rbox(2.5, 1.6, 0.07, 0.04), alu, 0, 0.8, 0);
  const sc = add(hinge, new THREE.PlaneGeometry(2.3, 1.43), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false, color: col("#ffffff", 1.25) }), 0, 0.8, 0.04);
  sc.name = "screen";
  add(body, new THREE.BoxGeometry(2.46, 0.02, 0.02), gl.mat(HEX.ice, 2.2), 0, 0.57, 0.85);
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: screen, transparent: true, opacity: 0.5, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  ghost.position.set(1.7, 2.35, -0.3); ghost.rotation.y = -0.4; g.add(ghost);
  const ring = add(g, new THREE.TorusGeometry(1.9, 0.02, 8, 96), gl.mat(HEX.ice, 1.6), 0, 0.03, 0); ring.rotation.x = Math.PI / 2;
  hitProxy(g, 2.6, 2.4, 2);
  return { group: g, top: 2.9, half: 1.4, tick: (t, a) => { body.position.y = Math.sin(t * 1.1) * 0.07; ghost.position.y = 2.35 + Math.sin(t * 1.3 + 1) * 0.1; gl.set(0.8 + a * 1.2); sc.scale.setScalar(1); } };
}

// ── Load balancer: gold multi-port switch, 1 port in, 3 out, spinning rings, prism ──
export function buildNginx(): Node3D {
  const g = new THREE.Group(), gl = new Glow(); const gold = std("#ffc233", 0.22, 1, { emissive: new THREE.Color("#ffc233"), emissiveIntensity: 0.04 });
  const dark = std("#120d22", 0.4, 0.8);
  add(g, rbox(2.9, 0.2, 3.3, 0.06), dark, 0, 0.1, 0);
  add(g, rbox(2.2, 1.5, 2.7, 0.16), gold, 0, 0.95, 0);
  add(g, rbox(1.7, 0.05, 2.2, 0.02), dark, 0, 1.7, 0);
  const port = (x: number, z: number, dir: number) => { const r = add(g, new THREE.TorusGeometry(0.2, 0.05, 10, 32), gl.mat(HEX.gold, 2.6), x, 0.78, z); r.rotation.y = Math.PI / 2; add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 24), std("#05030a", 0.6, 0.4), x - dir * 0.0, 0.78, z).rotation.z = Math.PI / 2; };
  port(-1.12, 0, -1); [-0.9, 0, 0.9].forEach((z) => port(1.12, z, 1));
  const leds: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.MeshBasicMaterial({ color: col(HEX.gold, 2), toneMapped: false }); leds.push(m); add(g, new THREE.BoxGeometry(0.14, 0.06, 0.03), m, -0.77 + i * 0.22, 1.35, 1.36); }
  add(g, new THREE.BoxGeometry(1.7, 0.03, 0.02), gl.mat(HEX.gold, 1.8), 0, 0.5, 1.36);
  const prism = add(g, new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshPhysicalMaterial({ color: "#ffc233", metalness: 1, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.4 }), 0, 2.55, 0); prism.scale.y = 1.5;
  const r1 = new THREE.Group(), r2 = new THREE.Group(); r1.position.y = r2.position.y = 2.55; g.add(r1, r2);
  const t1 = add(r1, new THREE.TorusGeometry(1.6, 0.045, 12, 96), gl.mat(HEX.gold, 2.4)); t1.rotation.x = Math.PI / 2 + 0.3;
  const t2 = add(r2, new THREE.TorusGeometry(1.25, 0.03, 12, 96), gl.mat(HEX.gold, 1.8)); t2.rotation.x = Math.PI / 2 - 0.35;
  hitProxy(g, 3, 3.4, 3.4);
  return { group: g, top: 3.5, half: 1.2, tick: (t, a) => { prism.rotation.y = t * 0.9; prism.position.y = 2.55 + Math.sin(t * 1.4) * 0.08; r1.rotation.y = t * 0.55; r2.rotation.y = -t * 0.8; gl.set(0.85 + a * 0.9); leds.forEach((m, i) => m.color.set(HEX.gold).multiplyScalar(0.4 + 2 * Math.max(0, Math.sin(t * 5 - i * 0.8)))); } };
}

// ── API server: chamfered rack unit with 4 drawers, instanced vents, blinking LEDs, label plate ──
export function buildApi(idx: number, name: string): Node3D {
  const g = new THREE.Group(), gl = new Glow();
  const dark = std("#160f29", 0.38, 0.85);
  add(g, rbox(1.75, 0.12, 1.55, 0.04), std("#0d0819", 0.5, 0.7), 0, 0.06, 0);
  add(g, rbox(1.5, 2.2, 1.3, 0.09), dark, 0, 1.22, 0);
  [-0.74, 0.74].forEach((x) => add(g, new THREE.BoxGeometry(0.03, 2.0, 0.03), gl.mat(HEX.violet, 2), x, 1.22, 0.66));
  const drawerM = std("#241b3d", 0.45, 0.8), ventM = new THREE.MeshBasicMaterial({ color: "#05030a" });
  const vents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.2, 0.02), ventM, 4 * 9), leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.036, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 12);
  const m4 = new THREE.Matrix4(); let vi = 0, li = 0;
  for (let i = 0; i < 4; i++) {
    const y = 0.4 + i * 0.46;
    add(g, rbox(1.32, 0.38, 0.07, 0.025), drawerM, 0, y, 0.67);
    for (let k = 0; k < 9; k++) { m4.makeTranslation(-0.02 + k * 0.075, y, 0.71); vents.setMatrixAt(vi++, m4); }
    for (let k = 0; k < 3; k++) { m4.makeTranslation(-0.5 + k * 0.12, y, 0.715); leds.setMatrixAt(li, m4); leds.setColorAt(li++, new THREE.Color(0)); }
    add(g, new THREE.BoxGeometry(0.5, 0.012, 0.012), gl.mat(HEX.violet, 1.3), 0.3, y - 0.17, 0.715);
  }
  vents.instanceMatrix.needsUpdate = true; leds.instanceMatrix.needsUpdate = true; leds.frustumCulled = false; g.add(vents, leds);
  add(g, rbox(1.22, 0.3, 0.05, 0.02), std("#0a0714", 0.5, 0.6), 0, 2.08, 0.66);
  const plate = add(g, new THREE.PlaneGeometry(1.16, 0.26), new THREE.MeshBasicMaterial({ map: plateTexture(name.toUpperCase(), HEX.violet), toneMapped: false, color: col("#ffffff", 1.3) }), 0, 2.08, 0.69);
  plate.name = "plate";
  hitProxy(g, 1.8, 2.6, 1.7);
  const base = new THREE.Color(HEX.lime), vio = new THREE.Color(HEX.violet), warn = new THREE.Color(HEX.warn), c = new THREE.Color();
  return { group: g, top: 2.85, half: 0.8, tick: (t, a, fl) => {
    gl.set(0.8 + a * 1.1 + fl * 1.5);
    for (let i = 0; i < 12; i++) {
      const b = 0.25 + 0.75 * Math.max(0, Math.sin(t * (2.6 + (i % 3)) + i * 1.9 + idx * 2.3));
      c.copy(i % 3 === 0 ? base : vio).lerp(warn, Math.min(1, fl * 1.2)).multiplyScalar((b * 2.2) + fl * 2);
      leds.setColorAt(i, c);
    }
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  } };
}

// ── Redis: glowing lime memory stack in a glass shell, bolt on top, fast pulse rings ──
export function buildRedis(): Node3D {
  const g = new THREE.Group(), gl = new Glow(), dark = std("#14221a", 0.28, 0.92);
  add(g, new THREE.CylinderGeometry(1.2, 1.3, 0.14, 48), std("#0d0819", 0.5, 0.7), 0, 0.07, 0);
  for (let i = 0; i < 4; i++) { add(g, new THREE.CylinderGeometry(0.82, 0.82, 0.34, 48), dark, 0, 0.35 + i * 0.52, 0); add(g, new THREE.CylinderGeometry(0.7, 0.7, 0.18, 40), gl.mat(HEX.lime, 1.5), 0, 0.35 + i * 0.52 + 0.26, 0); }
  add(g, new THREE.CylinderGeometry(0.97, 0.97, 2.4, 56, 1, true), new THREE.MeshStandardMaterial({ color: HEX.lime, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 }), 0, 1.3, 0);
  add(g, new THREE.TorusGeometry(0.97, 0.03, 8, 64), gl.mat(HEX.lime, 2.2), 0, 2.5, 0).rotation.x = Math.PI / 2;
  const s = new THREE.Shape(); [[0.14, 0.62], [-0.24, -0.02], [-0.02, -0.02], [-0.16, -0.62], [0.26, 0.1], [0.04, 0.1], [0.14, 0.62]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const bolt = add(g, new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }), gl.mat(HEX.lime, 2.2), 0, 3.1, -0.05);
  const rings = [0, 1].map(() => { const m = new THREE.MeshBasicMaterial({ color: col(HEX.lime, 2), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); const r = add(g, new THREE.TorusGeometry(1, 0.03, 8, 72), m, 0, 0.06, 0); r.rotation.x = Math.PI / 2; return { r, m }; });
  hitProxy(g, 2.2, 3.5, 2.2);
  const lime = new THREE.Color(HEX.lime);
  return { group: g, top: 3.75, half: 0.97, tick: (t, a) => {
    gl.set(0.85 + a * 1.0 + 0.2 * Math.sin(t * 6)); bolt.rotation.y = t * 1.2; bolt.position.y = 3.1 + Math.sin(t * 2) * 0.06;
    rings.forEach((o, i) => { const u = ((t * 1.15 + i * 0.5) % 1); o.r.scale.setScalar(1.15 + u * 1.5); o.m.color.copy(lime).multiplyScalar((1 - u) * (1 - u) * 2.2); });
  } };
}

// ── Worker: turbine / gear wheel on a pedestal ──
export function buildWorker(): Node3D {
  const g = new THREE.Group(), gl = new Glow(), vio = std("#8b6cff", 0.28, 0.92, { emissive: new THREE.Color("#8b6cff"), emissiveIntensity: 0.12 }), dark = std("#1a1330", 0.35, 0.85);
  add(g, new THREE.CylinderGeometry(1.1, 1.25, 0.3, 40), dark, 0, 0.15, 0);
  add(g, new THREE.CylinderGeometry(0.16, 0.16, 1.2, 16), dark, 0, 0.9, -0.1);
  const wheel = new THREE.Group(); wheel.position.set(0, 1.85, 0); g.add(wheel);
  const ring = new THREE.Group(), blades = new THREE.Group(); wheel.add(ring, blades);
  add(ring, new THREE.TorusGeometry(1.0, 0.13, 16, 72), vio);
  const tooth = new THREE.BoxGeometry(0.2, 0.3, 0.18);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, m = add(ring, tooth, vio, Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0); m.rotation.z = a - Math.PI / 2; }
  const bg = new THREE.BoxGeometry(0.09, 0.82, 0.04);
  for (let i = 0; i < 9; i++) { const p = new THREE.Group(); p.rotation.z = (i / 9) * Math.PI * 2; blades.add(p); const m = add(p, bg, std("#cfc2ff", 0.25, 0.95), 0, 0.52, 0); m.rotation.y = 0.65; }
  add(wheel, new THREE.CylinderGeometry(0.2, 0.2, 0.32, 20), std("#ffffff", 0.2, 1), 0, 0, 0).rotation.x = Math.PI / 2;
  add(wheel, new THREE.SphereGeometry(0.11, 14, 10), gl.mat(HEX.violet, 3), 0, 0, 0.17);
  add(wheel, new THREE.TorusGeometry(0.82, 0.02, 8, 64), gl.mat(HEX.violet, 1.8), 0, 0, 0.1);
  hitProxy(g, 2.7, 3.3, 1.6);
  return { group: g, top: 3.45, half: 1.3, tick: (t, a) => { ring.rotation.z = t * 0.3; blades.rotation.z = -t * (1.1 + a * 1.4); gl.set(0.9 + a * 1.0); vio.emissiveIntensity = 0.12 + a * 0.5; } };
}

// ── Postgres: stacked steel discs with a vault wheel and a scanning light ──
export function buildPg(): Node3D {
  const g = new THREE.Group(), gl = new Glow(), steel = std("#232b36", 0.26, 0.95);
  add(g, new THREE.CylinderGeometry(1.25, 1.35, 0.14, 56), std("#0d0819", 0.5, 0.7), 0, 0.07, 0);
  for (let i = 0; i < 5; i++) { const y = 0.34 + i * 0.44; add(g, new THREE.CylinderGeometry(1.05, 1.05, 0.36, 64), steel, 0, y, 0); add(g, new THREE.TorusGeometry(1.06, 0.022, 8, 72), gl.mat(HEX.lime, 1.9), 0, y + 0.19, 0).rotation.x = Math.PI / 2; }
  const wheel = new THREE.Group(); wheel.position.set(0, 1.2, 1.07); g.add(wheel);
  add(wheel, new THREE.CylinderGeometry(0.58, 0.58, 0.08, 40), std("#0b1117", 0.3, 0.95), 0, 0, 0).rotation.x = Math.PI / 2;
  add(wheel, new THREE.TorusGeometry(0.58, 0.04, 10, 48), gl.mat(HEX.lime, 2.2), 0, 0, 0.04);
  const spin = new THREE.Group(); wheel.add(spin);
  add(spin, new THREE.TorusGeometry(0.34, 0.035, 10, 40), std("#8f9bb0", 0.25, 1), 0, 0, 0.09);
  for (let i = 0; i < 3; i++) { const sp = add(spin, new THREE.BoxGeometry(0.76, 0.05, 0.05), std("#8f9bb0", 0.25, 1), 0, 0, 0.09); sp.rotation.z = (i / 3) * Math.PI; }
  add(spin, new THREE.SphereGeometry(0.09, 12, 10), gl.mat(HEX.lime, 2.4), 0, 0, 0.13);
  const scan = add(g, new THREE.TorusGeometry(1.1, 0.025, 8, 72), gl.mat(HEX.lime, 3), 0, 0.4, 0); scan.rotation.x = Math.PI / 2;
  hitProxy(g, 2.4, 2.6, 2.4);
  return { group: g, top: 3.0, half: 1.1, tick: (t, a) => { spin.rotation.z = Math.sin(t * 0.5) * 0.8; scan.position.y = 0.34 + (0.5 + 0.5 * Math.sin(t * 1.2)) * 1.9; gl.set(0.85 + a * 1.0); } };
}

// ── Attack engine: dark base, arc of red emitters, spiked crown, spinning core ──
export function buildAttack(): Node3D {
  const g = new THREE.Group(), gl = new Glow(), dark = std("#1c0a12", 0.32, 0.92), red = std("#3a0c18", 0.3, 0.95, { emissive: new THREE.Color("#ff3b5c"), emissiveIntensity: 0.15 });
  add(g, rbox(2.3, 0.4, 2.9, 0.1), dark, 0, 0.2, 0);
  add(g, new THREE.BoxGeometry(2.1, 0.03, 0.03), gl.mat(HEX.hot, 2.4), 0, 0.42, 1.43);
  const tips: THREE.MeshBasicMaterial[] = [];
  for (let k = 0; k < 5; k++) {
    const piv = new THREE.Group(); piv.position.set(0.2, 1.05, (k - 2) * 0.52); piv.rotation.y = -(k - 2) * 0.2; g.add(piv);
    add(piv, new THREE.CylinderGeometry(0.2, 0.26, 0.4, 14), dark, 0, 0, 0).rotation.z = Math.PI / 2;
    add(piv, new THREE.ConeGeometry(0.2, 1.1, 14), red, 0.75, 0, 0).rotation.z = -Math.PI / 2;
    const m = new THREE.MeshBasicMaterial({ color: col(HEX.hot, 3), toneMapped: false }); tips.push(m); add(piv, new THREE.SphereGeometry(0.1, 12, 10), m, 1.34, 0, 0);
  }
  const crown = new THREE.Group(); crown.position.set(-0.45, 0.4, 0); g.add(crown);
  const spike = new THREE.ConeGeometry(0.1, 0.62, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(crown, spike, red, Math.cos(a) * 0.62, 0.31, Math.sin(a) * 0.62); }
  const core = add(g, new THREE.OctahedronGeometry(0.4, 0), gl.mat(HEX.hot, 2.8), -0.45, 1.55, 0);
  const ring = add(g, new THREE.TorusGeometry(0.85, 0.025, 8, 64), gl.mat(HEX.hot, 2), -0.45, 1.55, 0); ring.rotation.x = Math.PI / 2 - 0.4;
  hitProxy(g, 3, 2.4, 3);
  const hot = new THREE.Color(HEX.hot);
  return { group: g, top: 2.7, half: 1.7, tick: (t, a) => { crown.rotation.y = t * 0.5; core.rotation.y = t * 1.3; core.rotation.x = t * 0.7; ring.rotation.y = t * 0.9; gl.set(0.85 + a * 0.9); red.emissiveIntensity = 0.15 + a * 0.5; tips.forEach((m, i) => m.color.copy(hot).multiplyScalar(1.2 + 2.2 * Math.max(0, Math.sin(t * 6 - i * 1.1)))); } };
}
