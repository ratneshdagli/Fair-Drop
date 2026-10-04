// Live PA stacks: woofers that pump with the shared beat (a 2 Hz kick with decay), glowing surrounds / dust caps, tweeters that shimmer,
// LED edge strips, step-quantised equaliser bars, shock rings and a bass glow on the ground. Seven draw calls, all instanced.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Ctx } from "./world";

const SX = 23, SZ = -24.5, TIERS = 5, CAB_H = 1.72;
const VIO = new THREE.Color(0.55, 0.42, 1), GOLD = new THREE.Color(1, 0.76, 0.2), ICE = new THREE.Color(0.5, 0.85, 1), HOT = new THREE.Color(1, 0.2, 0.3), LIME = new THREE.Color(0.6, 1, 0.35);

export function buildSpeakers(c: Ctx, deckY: number, cabMat: THREE.Material) {
  const { root, own } = c;
  const add = <T extends THREE.Object3D>(x: T) => (root.add(x), x);
  const o = new THREE.Object3D();
  const NC = 2 * TIERS;
  // cabinets (same boxes as before) and the plinth under each stack so they stand on something
  const cab = add(new THREE.InstancedMesh(own(new RoundedBoxGeometry(2.4, 1.7, 1.9, 2, 0.08)), cabMat, NC));
  const cabM: THREE.Matrix4[] = [], tier: number[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < TIERS; k++) {
    o.position.set(s * SX, deckY + 0.85 + k * CAB_H, SZ); o.rotation.set(0, -s * 0.3, 0); o.scale.set(1, 1, 1); o.updateMatrix();
    cab.setMatrixAt(cabM.length, o.matrix); cabM.push(o.matrix.clone()); tier.push(k);
  }
  const plinth = add(new THREE.InstancedMesh(own(new RoundedBoxGeometry(3.4, deckY, 3, 2, 0.06)), cabMat, 2));
  const plM: THREE.Matrix4[] = [];
  [-1, 1].forEach((s, i) => { o.position.set(s * SX, deckY / 2, SZ); o.rotation.set(0, -s * 0.3, 0); o.updateMatrix(); plinth.setMatrixAt(i, o.matrix); plM.push(o.matrix.clone()); });

  // woofer cones: lathe profile (surround, cone, dust cap), recessed into the front face; they slide out on every kick
  const prof = [[0.5, 0], [0.46, 0.03], [0.4, 0], [0.16, -0.14], [0.14, -0.15], [0.1, -0.11], [0.05, -0.09], [0, -0.085]].map(([r, d]) => new THREE.Vector2(r, d));
  const coneGeo = own(new THREE.LatheGeometry(prof, 24).rotateX(Math.PI / 2));
  const cones = add(new THREE.InstancedMesh(coneGeo, own(new THREE.MeshStandardMaterial({ color: "#0b0a14", metalness: 0.5, roughness: 0.38, side: THREE.DoubleSide })), NC * 2));
  // glowing rim + dust cap (woofers) and tweeter heads: one unit geometry scaled per instance
  const rimGeo = (() => { const a = new THREE.TorusGeometry(1, 0.07, 6, 32), b = new THREE.CircleGeometry(0.22, 16); const m = mergeGeometries([a, b])!; a.dispose(); b.dispose(); return own(m); })();
  type Part = { ci: number; x: number; y: number; z: number; sc: number; amp: number; tw: boolean };
  const parts: Part[] = [];
  for (let i = 0; i < NC; i++) { const amp = [1, 0.9, 0.6, 0.45, 0.35][tier[i]]; for (const x of [-0.62, 0.62]) parts.push({ ci: i, x, y: 0, z: 0.96, sc: 0.5, amp, tw: false }); parts.push({ ci: i, x: 0, y: 0.58, z: 0.96, sc: 0.24, amp: 0, tw: true }); }
  const NR = parts.length;
  const rims = add(new THREE.InstancedMesh(rimGeo, own(new THREE.MeshBasicMaterial({ toneMapped: false })), NR));
  rims.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NR * 3), 3); rims.frustumCulled = false; cones.frustumCulled = false;

  // LEDs (one unit box): 8 equaliser bars per cabinet, 2 edge strips per cabinet, 1 glow line per plinth
  const BARS = 8, NL = NC * BARS + NC * 2 + 2;
  const leds = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshBasicMaterial({ toneMapped: false })), NL));
  leds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NL * 3), 3); leds.frustumCulled = false;
  const tmp = new THREE.Matrix4(), tr = new THREE.Matrix4(), v = new THREE.Vector3(), col = new THREE.Color();
  const place = (m: THREE.Matrix4, base: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number) => { tr.makeTranslation(x, y, z); m.multiplyMatrices(base, tr); m.scale(v.set(sx, sy, sz)); };
  for (let i = 0; i < NC; i++) for (const sd of [-1, 1]) { place(tmp, cabM[i], sd * 1.16, 0, 0.955, 0.045, 1.5, 0.045); leds.setMatrixAt(NC * BARS + i * 2 + (sd > 0 ? 1 : 0), tmp); }
  for (let i = 0; i < 2; i++) { place(tmp, plM[i], 0, deckY / 2 - 0.03, 1.51, 3.4, 0.06, 0.06); leds.setMatrixAt(NC * BARS + NC * 2 + i, tmp); }

  // ground: shock rings (one is born on every beat) and a soft bass glow in front of each stack
  const ringTex = own(c.canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(0.6, "rgba(255,255,255,0)"); r.addColorStop(0.8, "rgba(255,255,255,.9)"); r.addColorStop(0.9, "rgba(255,255,255,.25)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 256, 256); }, 4).t);
  const flat = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const gmat = (map: THREE.Texture) => own(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  const rings = add(new THREE.InstancedMesh(flat, gmat(ringTex), 4)), bass = add(new THREE.InstancedMesh(flat, gmat(c.glow), 2));
  for (const m of [rings, bass]) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((m === rings ? 4 : 2) * 3), 3); m.frustumCulled = false; }
  const gx = (i: number) => (i % 2 ? 1 : -1) * (SX + 1.5);

  return {
    update(t: number, kick: number) {
      // woofers + tweeters
      let wi = 0;
      for (let i = 0; i < NR; i++) {
        const p = parts[i];
        const sh = p.tw ? Math.max(0, Math.sin(t * 37 + i * 2.3) * Math.sin(t * 23 + i * 1.1)) : 0;
        const off = p.tw ? 0 : p.amp * (0.08 * kick + 0.012 * Math.sin(t * 31 + i));
        tr.makeTranslation(p.x, p.y, p.z + off); tmp.multiplyMatrices(cabM[p.ci], tr);
        if (!p.tw) { cones.setMatrixAt(wi++, tmp); }
        tmp.scale(v.setScalar(p.sc)); rims.setMatrixAt(i, tmp);
        if (p.tw) col.copy(ICE).multiplyScalar(0.35 + 2.3 * sh * sh + 0.5 * kick);
        else col.copy(VIO).lerp(GOLD, Math.min(1, kick * 1.3)).multiplyScalar(0.25 + 2.8 * kick * (0.45 + 0.55 * p.amp));
        rims.instanceColor!.setXYZ(i, col.r, col.g, col.b);
      }
      // equaliser bars (5 LED steps), strips chase up the stack, plinth line breathes
      const lc = leds.instanceColor!;
      for (let i = 0; i < NC; i++) {
        const amp = [1, 0.9, 0.6, 0.45, 0.35][tier[i]];
        for (let j = 0; j < BARS; j++) {
          const b = 0.5 + 0.5 * Math.sin(t * (3.1 + j * 0.83) + i * 1.7 + j * 2.1);
          const lv = Math.min(1, 0.12 + 0.5 * b * b + kick * (0.8 - 0.07 * j) * (0.5 + 0.5 * amp)), n = Math.max(1, Math.ceil(lv * 5)), h = n * 0.05 - 0.008;
          place(tmp, cabM[i], -0.84 + j * 0.24, -0.8 + h / 2, 0.96, 0.15, h, 0.03); leds.setMatrixAt(i * BARS + j, tmp);
          col.copy(n >= 5 ? HOT : n >= 4 ? GOLD : i % 2 ? ICE : LIME).multiplyScalar(n >= 5 ? 1.9 : n >= 4 ? 1.7 : 1.3);
          lc.setXYZ(i * BARS + j, col.r, col.g, col.b);
        }
        const sw = 0.5 + 0.5 * Math.sin(t * 4 - tier[i] * 0.9);
        col.copy(VIO).multiplyScalar(0.5 + 1.6 * sw + 1.6 * kick);
        lc.setXYZ(NC * BARS + i * 2, col.r, col.g, col.b); lc.setXYZ(NC * BARS + i * 2 + 1, col.r, col.g, col.b);
      }
      col.copy(VIO).lerp(GOLD, kick).multiplyScalar(0.8 + 2.4 * kick);
      for (let i = 0; i < 2; i++) lc.setXYZ(NC * BARS + NC * 2 + i, col.r, col.g, col.b);
      leds.instanceMatrix.needsUpdate = true; lc.needsUpdate = true; cones.instanceMatrix.needsUpdate = true; rims.instanceMatrix.needsUpdate = true; rims.instanceColor!.needsUpdate = true;
      // shock rings: each lives 1 s, one is born per beat per stack; the bass glow follows the kick
      const b = t * 2;
      for (let i = 0; i < 4; i++) {
        const p = (((b + (i >> 1)) % 2) + 2) % 2 / 2, a = (1 - p) * (1 - p) * 0.55;
        o.position.set(gx(i), 0.06, SZ); o.rotation.set(0, 0, 0); const r = 2 * (2 + p * 10); o.scale.set(r, 1, r); o.updateMatrix(); rings.setMatrixAt(i, o.matrix);
        col.copy(VIO).lerp(GOLD, 1 - p).multiplyScalar(a); rings.instanceColor!.setXYZ(i, col.r, col.g, col.b);
      }
      for (let i = 0; i < 2; i++) { o.position.set(gx(i), 0.05, SZ + 1); o.scale.set(26, 1, 26); o.updateMatrix(); bass.setMatrixAt(i, o.matrix); col.copy(VIO).multiplyScalar(0.07 + 0.3 * kick); bass.instanceColor!.setXYZ(i, col.r, col.g, col.b); }
      rings.instanceMatrix.needsUpdate = bass.instanceMatrix.needsUpdate = true; rings.instanceColor!.needsUpdate = bass.instanceColor!.needsUpdate = true;
    },
  };
}
