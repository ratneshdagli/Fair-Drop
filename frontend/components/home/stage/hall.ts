// The concert hall: raked tiers + balcony, instanced seats, entrance gates, stage with LED wall / truss / moving heads, people flow.
// Pure three.js (no React). buildHall() returns update / camera / mood driven by the scroll position u (0..8).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BEAM, KEYCOL, MOOD, PATH, STAGES } from "../layouts";
import { AIS, ARC, CZ, GATE_R, GATE_Y, HALF_AISLE, REAR_R, ROWS, WALL_R, polar, rowR, rowY, treadStart, type Seat } from "./layout";
import { makeCrowd } from "./crowd";
import { buildWorld } from "./world";
import { buildSpeakers } from "./speakers";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type V = [number, number, number];

export type View = { fov: number; sx: number; sy: number };

// ---- camera spline data, built once from PATH
const KV = PATH.map((k) => [...k.p, ...k.l, k.fov, k.sx, k.sy]), KN = KV[0].length;
const KM = KV.map((v, i) => { const a = Math.max(0, i - 1), b = Math.min(KV.length - 1, i + 1), h = PATH[b].u - PATH[a].u || 1; return v.map((_, c) => (KV[b][c] - KV[a][c]) / h); });
const camTmp = new Array<number>(KN);
function sampleCam(u: number) {
  const uu = Math.min(Math.max(u, PATH[0].u), PATH[PATH.length - 1].u);
  let s = 0; while (s < PATH.length - 2 && PATH[s + 1].u <= uu) s++;
  const u0 = PATH[s].u, h = PATH[s + 1].u - u0, f = (uu - u0) / h, f2 = f * f, f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
  for (let c = 0; c < KN; c++) camTmp[c] = h00 * KV[s][c] + h10 * h * KM[s][c] + h01 * KV[s + 1][c] + h11 * h * KM[s + 1][c];
  return camTmp;
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, aniso = 8) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!; draw(ctx);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { t, redraw: () => { ctx.clearRect(0, 0, w, h); draw(ctx); t.needsUpdate = true; } };
}

// ---- stepped terraces (treads + risers) as sectors of arcs, with correct normals
type Buf = { pos: number[]; nor: number[]; col: number[] };
function surface(b: Buf, thLo: (R: number) => number, thHi: (R: number) => number, seg: number, tc: number[], rc: number[], lift: number, rows: number[]) {
  const th = (R: number, f: number) => lerp(thLo(R), thHi(R), f);
  const P = (R: number, f: number, y: number, n: number[], c: number[]) => { const a = th(R, f); b.pos.push(Math.sin(a) * R, y, CZ + Math.cos(a) * R); b.nor.push(...n); b.col.push(...c); };
  for (const r of rows) {
    const r0 = treadStart(r), r1 = r < ROWS - 1 ? treadStart(r + 1) : REAR_R, y = rowY(r) + lift, yPrev = r > 0 ? rowY(r - 1) + lift : lift, up = [0, 1, 0];
    for (let s = 0; s < seg; s++) {
      const f0 = s / seg, f1 = (s + 1) / seg;
      P(r0, f0, y, up, tc); P(r1, f0, y, up, tc); P(r1, f1, y, up, tc); P(r0, f0, y, up, tc); P(r1, f1, y, up, tc); P(r0, f1, y, up, tc);
      const Rr = r0 - lift, a0 = th(Rr, f0), a1 = th(Rr, f1), n0 = [-Math.sin(a0), 0, -Math.cos(a0)], n1 = [-Math.sin(a1), 0, -Math.cos(a1)];
      P(Rr, f0, yPrev, n0, rc); P(Rr, f1, y, n1, rc); P(Rr, f1, yPrev, n1, rc); P(Rr, f0, yPrev, n0, rc); P(Rr, f0, y, n0, rc); P(Rr, f1, y, n1, rc);
    }
  }
}
function toGeo(b: Buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  return g;
}
const lin = (hex: string) => new THREE.Color(hex).toArray();

export function buildHall(gl: THREE.WebGLRenderer, scene: THREE.Scene, opt: { n: number; narrow: boolean }) {
  const narrow = opt.narrow;
  const root = new THREE.Group();
  const D: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (D.push(x), x);
  let dead = false;
  const prev = { bg: scene.background, fog: scene.fog, env: scene.environment, ei: scene.environmentIntensity };
  const pm = new THREE.PMREMGenerator(gl), envScene = new RoomEnvironment(), envRT = pm.fromScene(envScene, 0.04);
  scene.environment = envRT.texture; scene.environmentIntensity = narrow ? 0.6 : 0.55;
  scene.background = new THREE.Color("#06040c"); scene.fog = new THREE.FogExp2("#0b0818", narrow ? 0.011 : 0.0085);

  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const o = new THREE.Object3D();
  const mat = <M extends THREE.Material>(m: M) => own(m);
  const metal = mat(new THREE.MeshStandardMaterial({ color: "#2a2935", metalness: 0.85, roughness: 0.36 }));
  const chrome = mat(new THREE.MeshStandardMaterial({ color: "#8a8a9c", metalness: 0.7, roughness: 0.42 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: "#14111f", metalness: 0.3, roughness: 0.7 }));
  const add = <T extends THREE.Object3D>(x: T, parent: THREE.Object3D = root) => (parent.add(x), x);

  // ---------- ground + tiers
  const tiled = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, rep: number) => { const k = canvasTex(w, h, draw, 8); own(k.t); k.t.wrapS = k.t.wrapT = THREE.RepeatWrapping; k.t.repeat.set(rep, rep); return k.t; };
  // the world around the hall (wet asphalt, skyline, poles, concourse) lives in world.ts
  const hazeTex = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.5, "rgba(255,255,255,.28)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }, 1);
  own(hazeTex.t);
  const world = buildWorld({ root, own, narrow, glow: hazeTex.t, canvasTex });
  const allRows = Array.from({ length: ROWS }, (_, i) => i);
  const tb: Buf = { pos: [], nor: [], col: [] };
  surface(tb, () => -ARC - 0.04, () => ARC + 0.04, 64, lin("#2a2040"), lin("#171026"), 0, allRows);
  add(new THREE.Mesh(own(toGeo(tb)), mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }))));
  // aisle carpet strips (lighter, so the aisles read)
  const ab: Buf = { pos: [], nor: [], col: [] };
  for (const a of AIS) surface(ab, (R) => a - (HALF_AISLE - 0.12) / R, (R) => a + (HALF_AISLE - 0.12) / R, 1, lin("#4a3a62"), lin("#2c2142"), 0.012, allRows);
  add(new THREE.Mesh(own(toGeo(ab)), mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }))));

  // side cheek walls + the balcony parapet (double sided, simple)
  const cheek: number[] = [], cheekN: number[] = [];
  for (const s of [-1, 1]) {
    const th = s * (ARC + 0.05), nx = -s * Math.cos(th), nz = s * Math.sin(th);
    for (let r = 0; r < ROWS; r++) {
      const r0 = treadStart(r), r1 = r < ROWS - 1 ? treadStart(r + 1) : REAR_R, top = rowY(r) + 1.0;
      const A = polar(r0, th, 0), B = polar(r1, th, 0), C = polar(r1, th, top), Dd = polar(r0, th, top);
      cheek.push(...A, ...B, ...C, ...A, ...C, ...Dd); for (let k = 0; k < 6; k++) cheekN.push(nx, 0, nz);
    }
  }
  const cheekG = own(new THREE.BufferGeometry()); cheekG.setAttribute("position", new THREE.Float32BufferAttribute(cheek, 3)); cheekG.setAttribute("normal", new THREE.Float32BufferAttribute(cheekN, 3));
  add(new THREE.Mesh(cheekG, mat(new THREE.MeshStandardMaterial({ color: "#1d1730", roughness: 0.85, side: THREE.DoubleSide }))));
  const parR = treadStart(8) + 0.14, parH = 0.95, par: number[] = [], parN: number[] = [], PS = 56;
  for (let s = 0; s < PS; s++) {
    const a = -ARC - 0.04 + ((2 * ARC + 0.08) * s) / PS, b = -ARC - 0.04 + ((2 * ARC + 0.08) * (s + 1)) / PS, y0 = rowY(8), y1 = y0 + parH;
    const A = polar(parR, a, y0), B = polar(parR, b, y0), C = polar(parR, b, y1), Dd = polar(parR, a, y1);
    par.push(...A, ...C, ...B, ...A, ...Dd, ...C); for (const t of [a, b, b, a, a, b]) parN.push(-Math.sin(t), 0, -Math.cos(t));
  }
  const parG = own(new THREE.BufferGeometry()); parG.setAttribute("position", new THREE.Float32BufferAttribute(par, 3)); parG.setAttribute("normal", new THREE.Float32BufferAttribute(parN, 3));
  add(new THREE.Mesh(parG, mat(new THREE.MeshStandardMaterial({ color: "#241c38", roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }))));
  const railLine = own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => { const t = -ARC - 0.04 + ((2 * ARC + 0.08) * i) / 24, p = polar(parR, t, rowY(8) + parH + 0.03); return new THREE.Vector3(...p); })), 96, 0.035, 6));
  add(new THREE.Mesh(railLine, mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.85, 0.25), toneMapped: false }))));

  // back wall: four pieces with the three gate openings, a lintel over each gate, acoustic ribs
  const GW = 3.4 / WALL_R, WH = 24, edges = [-ARC - 0.05, AIS[0] - GW, AIS[0] + GW, AIS[1] - GW, AIS[1] + GW, AIS[2] - GW, AIS[2] + GW, ARC + 0.05];
  const wallMat = mat(new THREE.MeshStandardMaterial({ color: "#241d36", roughness: 0.85, metalness: 0.1, side: THREE.BackSide }));
  const wallPiece = (a: number, b: number, y0: number, y1: number) => add(new THREE.Mesh(own(new THREE.CylinderGeometry(WALL_R, WALL_R, y1 - y0, 24, 1, true, a, b - a).translate(0, (y0 + y1) / 2, CZ)), wallMat));
  for (let k = 0; k < 4; k++) wallPiece(edges[k * 2], edges[k * 2 + 1], 0, WH);
  for (let k = 0; k < 3; k++) wallPiece(AIS[k] - GW, AIS[k] + GW, GATE_Y + 5.4, WH);
  const ribs: [number, number][] = [];
  for (let k = 0; k < 4; k++) for (let a = edges[k * 2] + 0.02; a < edges[k * 2 + 1] - 0.02; a += 1.7 / WALL_R) ribs.push([a, ribs.length]);
  const ribM = add(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(0.6, 16)), mat(new THREE.MeshStandardMaterial({ color: "#352b4d", roughness: 0.6, metalness: 0.3 })), ribs.length));
  const stripM = add(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(0.08, 15)), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.32, 1.1), toneMapped: false })), ribs.length));
  ribs.forEach(([a], i) => { const p = polar(WALL_R - 0.2, a, 9); o.position.set(p[0], p[1], p[2]); o.rotation.set(0, a + Math.PI, 0); o.scale.set(1, 1, 1); o.updateMatrix(); ribM.setMatrixAt(i, o.matrix); const q = polar(WALL_R - 0.3, a + 0.85 / WALL_R, 9); o.position.set(q[0], q[1], q[2]); o.updateMatrix(); stripM.setMatrixAt(i, o.matrix); });

  // ---------- seats: one merged, rounded, two-tone geometry, one InstancedMesh, per-seat colour + gold emissive
  const sg = (g: THREE.BufferGeometry, k: number) => { const n = g.getAttribute("position").count, c = new Float32Array(n * 3).fill(k); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); return g; };
  const pieces = [
    sg(new RoundedBoxGeometry(0.52, 0.12, 0.5, 2, 0.045).translate(0, 0.45, 0.03), 1),                      // seat pan
    sg(new RoundedBoxGeometry(0.52, 0.62, 0.1, 2, 0.045).rotateX(-0.16).translate(0, 0.82, -0.25), 1),       // backrest
    sg(new RoundedBoxGeometry(0.07, 0.07, 0.44, 1, 0.03).translate(-0.3, 0.64, 0.02), 0.38),                // armrests
    sg(new RoundedBoxGeometry(0.07, 0.07, 0.44, 1, 0.03).translate(0.3, 0.64, 0.02), 0.38),
    sg(new RoundedBoxGeometry(0.05, 0.22, 0.05, 1, 0.02).translate(-0.3, 0.52, -0.16), 0.38),               // arm posts
    sg(new RoundedBoxGeometry(0.05, 0.22, 0.05, 1, 0.02).translate(0.3, 0.52, -0.16), 0.38),
    sg(new RoundedBoxGeometry(0.12, 0.36, 0.26, 1, 0.03).translate(0, 0.18, -0.06), 0.3),                   // pedestal
  ];
  const seatGeo = own(mergeGeometries(pieces)!); pieces.forEach((g) => g.dispose());
  const seatsData: Seat[] = [], pitch = narrow ? 0.9 : 0.62;
  const WINE = new THREE.Color("#7c1f3c"), CHAR = new THREE.Color("#3a3a52"), GOLDF = new THREE.Color("#cf8212");
  const baseCol: number[] = [], rowKey: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    const R = rowR(r), cnt = Math.floor((2 * ARC * R) / pitch);
    for (let k = 0; k < cnt; k++) {
      const th = -ARC + ((k + 0.5) * 2 * ARC) / cnt;
      if (AIS.some((a) => Math.abs(th - a) * R < HALF_AISLE + 0.3)) continue;
      const aisle = AIS.reduce((bi, a, i) => (Math.abs(th - a) < Math.abs(th - AIS[bi]) ? i : bi), 0);
      const p = polar(R, th, rowY(r)); seatsData.push({ x: p[0], y: p[1], z: p[2], th, R, row: r, aisle });
      const c = (r >= 8 ? CHAR : WINE).clone().multiplyScalar(0.82 + rnd() * 0.36); baseCol.push(c.r, c.g, c.b); rowKey.push(r * 0.6 + rnd() * 7);
    }
  }
  const NS = seatsData.length, order = Array.from({ length: NS }, (_, i) => i).sort((a, b) => rowKey[a] - rowKey[b]);
  const emA = new THREE.InstancedBufferAttribute(new Float32Array(NS * 3), 3); emA.setUsage(THREE.DynamicDrawUsage); seatGeo.setAttribute("aEm", emA);
  const seatMat = mat(new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, metalness: 0.05, roughness: 0.66 }));
  seatMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aEm; varying vec3 vEm;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvEm = aEm;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vEm;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm;");
  };
  const seats = add(new THREE.InstancedMesh(seatGeo, seatMat, NS)); own(seats);
  seats.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NS * 3), 3); seats.instanceColor.setUsage(THREE.DynamicDrawUsage);
  seatsData.forEach((p, i) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, 0, 0); o.lookAt(0, p.y, CZ); o.scale.set(1, 1, 1); o.updateMatrix(); seats.setMatrixAt(i, o.matrix); });
  seats.computeBoundingSphere();
  const icArr = seats.instanceColor.array as Float32Array, emArr = emA.array as Float32Array;
  const fillS = new Float32Array(NS), tgtS = new Float32Array(NS), popS = new Float32Array(NS);
  for (let s = 0; s < NS; s++) icArr.set([baseCol[s * 3], baseCol[s * 3 + 1], baseCol[s * 3 + 2]], s * 3);
  let seatsDirty = true;

  // aisle step lights, handrails
  const sl: [number, number, number, number][] = [];
  for (const a of AIS) for (let r = 1; r < ROWS; r++) { const R = treadStart(r) + 0.05, p = polar(R, a, rowY(r) + 0.035); sl.push([p[0], p[1], p[2], a]); }
  const stepL = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(HALF_AISLE * 1.8, 0.035, 0.05)), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 0.22), toneMapped: false })), sl.length));
  sl.forEach((s, i) => { o.position.set(s[0], s[1], s[2]); o.rotation.set(0, s[3], 0); o.updateMatrix(); stepL.setMatrixAt(i, o.matrix); });
  const posts: [number, number, number][] = []; // post tops
  for (const a of AIS) for (const sd of [-1, 1]) for (let r = 0; r < ROWS; r++) { const R = rowR(r), p = polar(R, a + (sd * (HALF_AISLE - 0.02)) / R, rowY(r)); posts.push(p); }
  const postM = add(new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8)), chrome, posts.length));
  posts.forEach((p, i) => { o.position.set(p[0], p[1] + 0.475, p[2]); o.rotation.set(0, 0, 0); o.updateMatrix(); postM.setMatrixAt(i, o.matrix); });
  const bars: [THREE.Vector3, THREE.Vector3, number][] = []; // truss bars

  // ---------- stage
  const deckMat = mat(new THREE.MeshStandardMaterial({ color: "#0c0a16", metalness: 0.1, roughness: 0.55, envMapIntensity: 0.35, transparent: true, opacity: 0.85 }));
  const DECK_Y = 2.2;
  add(new THREE.Mesh(own(new THREE.PlaneGeometry(38, 15).rotateX(-Math.PI / 2)), deckMat)).position.set(0, DECK_Y, CZ - 0.5);
  const skirt = new THREE.Mesh(own(new THREE.BoxGeometry(38, DECK_Y, 0.2)), dark); skirt.position.set(0, DECK_Y / 2, -23.1); add(skirt);
  for (const s of [-1, 1]) { const sd = new THREE.Mesh(own(new THREE.BoxGeometry(0.2, DECK_Y, 15)), dark); sd.position.set(s * 19, DECK_Y / 2, CZ - 0.5); add(sd); }
  const riser = add(new THREE.Mesh(own(new RoundedBoxGeometry(9, 0.7, 6, 3, 0.08)), mat(new THREE.MeshStandardMaterial({ color: "#1b1730", metalness: 0.05, roughness: 0.7, envMapIntensity: 0.4 })))); riser.position.set(0, DECK_Y + 0.35, CZ - 4);
  const lipMat = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.3, 0.35), toneMapped: false }));
  const lip = add(new THREE.Mesh(own(new THREE.BoxGeometry(38, 0.06, 0.1)), lipMat)); lip.position.set(0, DECK_Y + 0.03, -23.02);
  const skirtGlow = add(new THREE.Mesh(own(new THREE.BoxGeometry(38, 0.05, 0.05)), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.38, 1.4), toneMapped: false })))); skirtGlow.position.set(0, 0.3, -23.0);

  // LED wall: crisp 2048 mark + shader-animated soft gradient bars + LED pixel grid that fades with distance
  const mark = canvasTex(2048, 768, (c) => {
    c.clearRect(0, 0, 2048, 768);
    const ink = c.createLinearGradient(0, 230, 0, 520); ink.addColorStop(0, "#fff0b8"); ink.addColorStop(0.5, "#ffc233"); ink.addColorStop(1, "#d98f10");
    // ticket outline with side notches
    c.strokeStyle = "rgba(255,194,51,.85)"; c.lineWidth = 7; c.beginPath();
    const x0 = 250, x1 = 1798, y0 = 130, y1 = 638, r = 26, nr = 46, ym = 384;
    c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.quadraticCurveTo(x1, y0, x1, y0 + r); c.lineTo(x1, ym - nr); c.arc(x1, ym, nr, -Math.PI / 2, Math.PI / 2, true);
    c.lineTo(x1, y1 - r); c.quadraticCurveTo(x1, y1, x1 - r, y1); c.lineTo(x0 + r, y1); c.quadraticCurveTo(x0, y1, x0, y1 - r); c.lineTo(x0, ym + nr); c.arc(x0, ym, nr, Math.PI / 2, -Math.PI / 2, true);
    c.lineTo(x0, y0 + r); c.quadraticCurveTo(x0, y0, x0 + r, y0); c.closePath(); c.stroke();
    c.setLineDash([3, 16]); c.lineWidth = 4; c.strokeStyle = "rgba(255,194,51,.4)"; c.beginPath(); c.moveTo(1560, y0 + 18); c.lineTo(1560, y1 - 18); c.stroke(); c.setLineDash([]);
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.font = '400 330px Anton, Impact, "Arial Black", sans-serif'; c.fillStyle = ink; c.fillText("FAIR DROP", 905, 470);
    c.font = '500 40px "JetBrains Mono Variable","JetBrains Mono", ui-monospace, monospace'; c.fillStyle = "rgba(244,240,255,.82)";
    (c as unknown as { letterSpacing: string }).letterSpacing = "10px"; c.fillText("1 LOGIN  /  1 TICKET  /  1 SEAT", 905, 560);
    c.save(); c.translate(1670, 384); c.rotate(-Math.PI / 2); c.font = '500 34px "JetBrains Mono Variable","JetBrains Mono", monospace'; c.fillStyle = "rgba(255,194,51,.85)"; c.fillText("ADMIT ONE", 0, 12); c.restore();
  });
  own(mark.t);
  if (typeof document !== "undefined" && document.fonts) Promise.all([document.fonts.load("400 300px Anton"), document.fonts.load('500 40px "JetBrains Mono Variable"')]).then(() => { if (!dead) mark.redraw(); }).catch(() => {});
  const screenMat = mat(new THREE.ShaderMaterial({
    uniforms: { map: { value: mark.t }, uT: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uLvl: { value: 1.3 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: /* glsl */ `uniform sampler2D map; uniform float uT; uniform vec3 uA; uniform vec3 uB; uniform float uLvl; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        vec3 col = mix(vec3(.012,.008,.03), vec3(.05,.03,.11), uv.y);
        col += mix(uA, uB, uv.x) * (.5 + .5 * sin(uv.x * 3. - uT * .35)) * .045 * (1. - uv.y * .5);
        float cols = 64., cx = uv.x * cols, id = floor(cx), fx = fract(cx);
        float h = .2 + .13 * sin(uT * .55 + id * .43) + .09 * sin(uT * .31 - id * .91) + .05 * sin(uT * .8 + id * 2.1);
        float bar = smoothstep(h, h - .14, uv.y) * smoothstep(0., .14, fx) * smoothstep(1., .86, fx);
        col += mix(uA, uB, clamp(uv.x * .7 + .15 * sin(id * .3 + uT * .2), 0., 1.)) * bar * .2 * (1. - uv.y / max(h, .05));
        vec4 m = texture2D(map, uv); col = mix(col, m.rgb, m.a);
        vec2 g = uv * vec2(256., 96.), f = fract(g) - .5; float dotm = smoothstep(.5, .34, max(abs(f.x), abs(f.y)));
        float fw = max(fwidth(g.x), fwidth(g.y)); col *= mix(1., .7 + .3 * dotm, 1. - smoothstep(.3, .8, fw));
        col *= 1. - .22 * smoothstep(.15, .75, length(uv - .5));
        gl_FragColor = vec4(col * uLvl, 1.);
      }`,
  }));
  const screen = add(new THREE.Mesh(own(new THREE.PlaneGeometry(34, 12.75)), screenMat)); screen.position.set(0, 9.7, CZ - 7.6);
  const sideTex = canvasTex(64, 256, (c) => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#07050d"); g.addColorStop(0.65, "#2a1a5c"); g.addColorStop(1, "#a87410"); c.fillStyle = g; c.fillRect(0, 0, 64, 256); c.fillStyle = "rgba(0,0,0,.4)"; for (let y = 0; y < 256; y += 4) c.fillRect(0, y, 64, 1.5); }, 4);
  own(sideTex.t);
  const sideMat = mat(new THREE.MeshBasicMaterial({ map: sideTex.t, toneMapped: false })), sideGeo = own(new THREE.PlaneGeometry(5, 12));
  const panels: THREE.Mesh[] = [];
  for (const s of [-1, 1]) { const m = add(new THREE.Mesh(sideGeo, sideMat)); m.position.set(s * 21.5, 8.5, CZ - 5.5); m.rotation.y = -s * 0.4; panels.push(m); }
  // reflections: the screen, the panels and the lip mirrored about the deck plane
  const mirror = add(new THREE.Group()); mirror.position.y = DECK_Y * 2; mirror.scale.y = -1;
  for (const m of [screen, lip, ...panels]) { const c = m.clone(); mirror.add(c); }

  // truss rig: all bars in one InstancedMesh (the handrails ride along)
  const tr = (p0: V, p1: V, u: V, v: V, w: number, step: number) => {
    const A = new THREE.Vector3(...p0), B = new THREE.Vector3(...p1), d = B.clone().sub(A), len = d.length(), cnt = Math.max(1, Math.round(len / step));
    const U = new THREE.Vector3(...u), Vv = new THREE.Vector3(...v);
    const cor = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => U.clone().multiplyScalar((a * w) / 2).add(Vv.clone().multiplyScalar((b * w) / 2)));
    const at = (i: number, k: number) => A.clone().addScaledVector(d, i / cnt).add(cor[k]);
    for (let i = 0; i <= cnt; i++) for (let k = 0; k < 4; k++) {
      bars.push([at(i, k), at(i, (k + 1) % 4), 0.07]);
      if (i < cnt) { bars.push([at(i, k), at(i + 1, k), 0.12]); bars.push([at(i, k), at(i + 1, (k + 1) % 4), 0.06]); }
    }
  };
  const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1];
  tr([-19, 17.7, -27], [19, 17.7, -27], Y, Z, 1.2, 1.3); tr([-15, 21.7, -33], [15, 21.7, -33], Y, Z, 1.2, 1.3);
  for (const s of [-1, 1]) tr([s * 19.4, 2.2, -27], [s * 19.4, 18.3, -27], X, Z, 1.2, 1.3);
  const barMesh = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), metal, bars.length));
  bars.forEach(([a, b, t], i) => { o.position.copy(a).add(b).multiplyScalar(0.5); o.rotation.set(0, 0, 0); o.lookAt(b); o.scale.set(t, t, a.distanceTo(b)); o.updateMatrix(); barMesh.setMatrixAt(i, o.matrix); });
  o.scale.set(1, 1, 1);
  // speaker stacks
  const speakers = buildSpeakers({ root, own, narrow, glow: hazeTex.t, canvasTex }, DECK_Y, dark);
  o.rotation.set(0, 0, 0);

  // ---------- moving heads, volumetric cones, light pools on the floor
  const fix: V[] = [];
  for (let k = 0; k < 8; k++) fix.push([-14 + k * 4, 17.0, -27]);
  if (!narrow) for (let k = 0; k < 4; k++) fix.push([-9 + k * 6, 21.0, -33]);
  const NB = fix.length;
  const body = add(new THREE.InstancedMesh(own(new RoundedBoxGeometry(0.6, 0.85, 0.6, 2, 0.1)), metal, NB));
  const lens = add(new THREE.InstancedMesh(own(new THREE.CircleGeometry(0.2, 16).rotateX(Math.PI / 2)), mat(new THREE.MeshBasicMaterial({ toneMapped: false })), NB));
  fix.forEach((p, i) => { o.position.set(p[0], p[1] - 0.45, p[2]); o.updateMatrix(); body.setMatrixAt(i, o.matrix); o.position.y -= 0.43; o.updateMatrix(); lens.setMatrixAt(i, o.matrix); });
  const BH = 26;
  const beamMat = mat(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uI: { value: 1 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vC;
      void main(){ vUv = uv; vC = instanceColor; mat4 m = modelViewMatrix * instanceMatrix; vN = normalize(mat3(m) * normal); vec4 mv = m * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uI; varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vC;
      void main(){ float f = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0., 1.), 2.6); float vy = clamp(vUv.y, 0., 1.); float a = f * pow(vy, 1.7) * smoothstep(0., .18, vy) * uI * .16; a = clamp(a, 0., 1.); gl_FragColor = vec4(vC, a); }`,
  }));
  const beams = add(new THREE.InstancedMesh(own(new THREE.ConeGeometry(1.9, BH, 32, 1, true).translate(0, -BH / 2, 0)), beamMat, NB)); beams.frustumCulled = false;
  const poolMat = mat(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uI: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform float uI; varying vec2 vUv; varying vec3 vC; void main(){ float d = length(vUv * 2. - 1.); gl_FragColor = vec4(vC, smoothstep(1., .05, d) * .045 * uI); }`,
  }));
  const pools = add(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), poolMat, NB)); pools.frustumCulled = false;
  for (const m of [lens, beams, pools]) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3);
  const tgt: V[] = fix.map((p, k) => [p[0] * 0.75, k % 3 === 0 ? DECK_Y + 0.03 : 0.03, k % 3 === 0 ? -30 : -17 + (k % 4) * 2]);

  // ---------- haze: a few large soft sprites around the stage
  const hazeCols = ["#ffb347", "#8b6cff", "#ff4f8b", "#8b6cff", "#ffc233", "#6c8bff"];
  const haze = hazeCols.map((c, i) => {
    const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: hazeTex.t, color: c, transparent: true, opacity: 0.032, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    s.scale.setScalar(26 + (i % 3) * 8); s.position.set((i - 2.5) * 7, 7 + (i % 3) * 2.5, -27 + (i % 2) * 6); add(s); return s;
  });

  // ---------- entrance gates (arches + turnstile pedestals + the scanning barrier bots crash into)
  const signTex = canvasTex(512, 96, (c) => { c.clearRect(0, 0, 512, 96); c.fillStyle = "#ffc233"; c.font = '400 70px Anton, Impact, sans-serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("THE DOOR", 256, 52); }, 4);
  own(signTex.t); document.fonts?.load("400 70px Anton").then(() => { if (!dead) signTex.redraw(); }).catch(() => {});
  const signMat = mat(new THREE.MeshBasicMaterial({ map: signTex.t, transparent: true, toneMapped: false, color: new THREE.Color(1.1, 1.1, 1.1), side: THREE.DoubleSide }));
  const postG = own(new RoundedBoxGeometry(0.5, 4.8, 0.7, 2, 0.1)), beamG = own(new RoundedBoxGeometry(7, 0.7, 0.8, 2, 0.1)), stripG = own(new THREE.BoxGeometry(6, 0.07, 0.1)), pedG = own(new RoundedBoxGeometry(0.4, 1.0, 1.1, 2, 0.08)), pedTop = own(new THREE.BoxGeometry(0.3, 0.04, 0.9));
  const goldGlow = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0.25), toneMapped: false })), signG = own(new THREE.PlaneGeometry(3.4, 0.64));
  const barrierMats: THREE.ShaderMaterial[] = [];
  const flash = [0, 0, 0];
  AIS.forEach((a, gi) => {
    const g = add(new THREE.Group()), p = polar(GATE_R, a, GATE_Y); g.position.set(p[0], p[1], p[2]); g.rotation.y = a;
    for (const s of [-1, 1]) { const pt = add(new THREE.Mesh(postG, metal), g); pt.position.set(s * 3.2, 2.4, 0); }
    add(new THREE.Mesh(beamG, metal), g).position.set(0, 4.95, 0);
    add(new THREE.Mesh(stripG, goldGlow), g).position.set(0, 4.55, 0.0);
    for (const s of [1, -1]) { const sg2 = add(new THREE.Mesh(signG, signMat), g); sg2.position.set(0, 5.0, s * 0.42); if (s < 0) sg2.rotation.y = Math.PI; }
    for (const s of [-1, 1]) { add(new THREE.Mesh(pedG, dark), g).position.set(s * 2.35, 0.5, 0); add(new THREE.Mesh(pedTop, goldGlow), g).position.set(s * 2.35, 1.03, 0); }
    const bm = mat(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uF: { value: 0 }, uT: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: /* glsl */ `uniform float uF; uniform float uT; varying vec2 vUv;
        void main(){ float edge = smoothstep(0., .08, vUv.x) * smoothstep(0., .08, 1. - vUv.x); float scan = .5 + .5 * sin(vUv.y * 70. - uT * 2.);
          float a = (.05 + .04 * scan) * edge * (1. - vUv.y * .5) + uF * (.4 + .3 * scan) * edge;
          gl_FragColor = vec4(mix(vec3(.45, .8, 1.), vec3(1., .15, .25), clamp(uF * 2., 0., 1.)), a); }`,
    }));
    barrierMats.push(bm); add(new THREE.Mesh(own(new THREE.PlaneGeometry(5.4, 3.7)), bm), g).position.set(0, 1.95, 0);
  });
  // ---------- the concourse in front of the gates: floor light strips along each lane, queue posts with ropes, planters
  { const lanes: [number, number][] = []; for (const a of AIS) for (const d of [-2.2, 2.2]) lanes.push([a, d]);
    const strip = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.14, 0.04, 36)), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.85, 0.22), toneMapped: false })), lanes.length));
    lanes.forEach(([a, d], i) => { const p = polar(61, a, GATE_Y + 0.03); o.position.set(p[0] + Math.cos(a) * d, p[1], p[2] - Math.sin(a) * d); o.rotation.set(0, a, 0); o.scale.set(1, 1, 1); o.updateMatrix(); strip.setMatrixAt(i, o.matrix); });
    const qp: number[][] = []; for (const a of AIS) for (const d of [-3.1, 3.1]) for (let R = 45; R <= 73; R += 4) qp.push([a, R, d]);
    const NQ = qp.length, pos = (q: number[]) => { const p = polar(q[1], q[0], GATE_Y); return [p[0] + Math.cos(q[0]) * q[2], p[1], p[2] - Math.sin(q[0]) * q[2]]; };
    const post = add(new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 10).translate(0, 0.5, 0)), chrome, NQ));
    const cap = add(new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.11, 10, 8)), goldGlow, NQ));
    qp.forEach((q, i) => { const p = pos(q); o.position.set(p[0], p[1], p[2]); o.rotation.set(0, 0, 0); o.updateMatrix(); post.setMatrixAt(i, o.matrix); o.position.y += 1.04; o.updateMatrix(); cap.setMatrixAt(i, o.matrix); });
    const ropes = qp.filter((q) => q[1] < 73); const rope = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.04, 0.04, 4)), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.2, 0.35), toneMapped: false })), ropes.length));
    ropes.forEach((q, i) => { const a = pos(q), b = pos([q[0], q[1] + 4, q[2]]); o.position.set((a[0] + b[0]) / 2, GATE_Y + 0.85, (a[2] + b[2]) / 2); o.rotation.set(0, q[0], 0); o.updateMatrix(); rope.setMatrixAt(i, o.matrix); });
    // planters between the lanes: dark boxes with a glowing rim and a soft violet-lit bush
    const pl: [number, number][] = [[-0.62, 52], [-0.2, 52], [0.2, 52], [0.62, 52], [-0.66, 62], [0.66, 62]];
    const box = add(new THREE.InstancedMesh(own(new RoundedBoxGeometry(2.4, 0.9, 2.4, 2, 0.1)), dark, pl.length));
    const rim = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(2.5, 0.04, 2.5)), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.38, 1.3), toneMapped: false })), pl.length));
    const bush = add(new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1.0, 1)), mat(new THREE.MeshStandardMaterial({ color: "#1f4a40", roughness: 0.9, emissive: "#0b2a2a", emissiveIntensity: 0.35 })), pl.length));
    pl.forEach(([a, R], i) => { const p = polar(R, a, GATE_Y); o.rotation.set(0, a, 0); o.scale.set(1, 1, 1); o.position.set(p[0], p[1] + 0.45, p[2]); o.updateMatrix(); box.setMatrixAt(i, o.matrix); o.position.y = p[1] + 0.03; o.updateMatrix(); rim.setMatrixAt(i, o.matrix); o.position.y = p[1] + 1.35; o.scale.set(1, 0.8, 1); o.updateMatrix(); bush.setMatrixAt(i, o.matrix); });
    o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); }
  o.scale.set(1, 1, 1);
  // handrail bars between the aisle posts
  const railBars: [THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k < posts.length; k++) if (k % ROWS < ROWS - 1) railBars.push([new THREE.Vector3(posts[k][0], posts[k][1] + 0.95, posts[k][2]), new THREE.Vector3(posts[k + 1][0], posts[k + 1][1] + 0.95, posts[k + 1][2])]);
  const railM = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), chrome, railBars.length));
  railBars.forEach(([a, b], i) => { o.position.copy(a).add(b).multiplyScalar(0.5); o.rotation.set(0, 0, 0); o.lookAt(b); o.scale.set(0.04, 0.04, a.distanceTo(b)); o.updateMatrix(); railM.setMatrixAt(i, o.matrix); });
  o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0);

  // ---------- the people flow
  const crowdMax = opt.narrow ? 420 : Math.min(900, Math.max(500, Math.round(opt.n / 5)));
  const crowd = makeCrowd(crowdMax, seatsData, order, {
    arrive: (s) => { tgtS[s] = 1; popS[s] = 1; seatsDirty = true; },
    unfill: (s) => { tgtS[s] = 0; seatsDirty = true; },
    flash: (g) => { flash[g] = 1; },
  }, (() => { let sd = 99; return () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296); })());
  add(crowd.mesh);

  // ---------- real lights (no shadows: cheap, the forms are read by the key + rim)
  scene.add(root);
  const hemi = new THREE.HemisphereLight(0x8070d0, 0x2a1c38, 2.2);
  const key = new THREE.DirectionalLight(0xffb866, 2.4); key.position.set(0, 16, -36); key.target.position.set(0, 0, 4);
  const rim = new THREE.DirectionalLight(0x8fa8ff, 1.8); rim.position.set(0, 34, 34); rim.target.position.set(0, 0, -10);
  const spill = new THREE.SpotLight(0xffc233, 500, 70, 0.9, 1, 2); spill.position.set(0, 20, -25); spill.target.position.set(0, 2, -6);
  const pit = new THREE.PointLight(0xff3d8a, 70, 36, 2); pit.position.set(0, 6, -16);
  for (const l of [hemi, key, rim, spill, pit]) add(l);
  add(key.target); add(rim.target); add(spill.target);

  // ---------- per frame
  const c1 = new THREE.Color(), c2 = new THREE.Color(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), q = new THREE.Quaternion(), mm = new THREE.Matrix4(), sc = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const split = (u: number) => { const uu = Math.min(Math.max(u, 0), STAGES - 1e-3), i = Math.floor(uu), f = uu - i; return { i, f, j: Math.min(i + 1, STAGES - 1), te: sstep(0.6, 1, f) }; };
  const mix = (arr: number[], s: { i: number; j: number; te: number }) => lerp(arr[s.i], arr[s.j], s.te);
  const col3 = (a: number[], b: number[], te: number, out: THREE.Color) => out.setRGB(lerp(a[0], b[0], te), lerp(a[1], b[1], te), lerp(a[2], b[2], te));
  let lastFill = -1, lastU = 0, extra = 0; // extra: seats that keep filling while you linger, so the flow never dies (undone when scrolling back)

  function update(u: number, t: number, dt: number, calm: boolean) {
    const s = split(u), { i, j, te } = s;
    // chapter lighting
    col3(KEYCOL[i], KEYCOL[j], te, c1); key.color.copy(c1); key.intensity = mix(MOOD.keyI, s); spill.color.copy(c1); pit.color.copy(c1).lerp(c2.set("#ff3d8a"), 0.5);
    // shared beat clock: 2 Hz kick with a fast decay, accented on every fourth beat (static in reduced motion)
    const bp = t * 2, kick = calm ? 0.25 : Math.exp(-(bp - Math.floor(bp)) * 7) * (Math.floor(bp) % 4 === 0 ? 1 : 0.78);
    world.update(t, kick, key.color); speakers.update(t, kick); pit.intensity = 70 * (1 + 0.3 * kick);
    // crowd and seats
    const du = u - lastU; lastU = u;
    if (!calm) { if (du < -0.0005) extra = Math.max(0, extra - -du * 500); else extra = Math.min(NS * 0.3, extra + dt * mix(MOOD.rate, s) * 0.8); }
    const target = Math.min(Math.round(NS * 0.97), Math.round(mix(MOOD.fill, s) * NS + extra));
    crowd.update(dt, { rate: mix(MOOD.rate, s), bots: mix(MOOD.bots, s), pace: mix(MOOD.pace, s) }, target, calm);
    if (calm && target !== lastFill) { lastFill = target; for (let k = 0; k < NS; k++) tgtS[order[k]] = k < target ? 1 : 0; seatsDirty = true; }
    for (const g of [0, 1, 2]) { flash[g] = Math.max(0, flash[g] - dt * 2.4); const m = barrierMats[g].uniforms; m.uF.value = flash[g]; m.uT.value = t; }
    if (seatsDirty) {
      let any = false;
      for (let k = 0; k < NS; k++) {
        const tg = tgtS[k]; let f = fillS[k], p = popS[k];
        if (f !== tg) { f += Math.sign(tg - f) * Math.min(Math.abs(tg - f), calm ? 1 : dt * 3.5); fillS[k] = f; }
        if (p > 0) p = popS[k] = Math.max(0, p - dt * 1.4);
        if (f !== tg || p > 0) any = true;
        const bi = k * 3, e = 0.09 * f + 0.7 * p;
        icArr[bi] = lerp(baseCol[bi], GOLDF.r, f); icArr[bi + 1] = lerp(baseCol[bi + 1], GOLDF.g, f); icArr[bi + 2] = lerp(baseCol[bi + 2], GOLDF.b, f);
        emArr[bi] = 1.0 * e; emArr[bi + 1] = 0.55 * e; emArr[bi + 2] = 0.08 * e;
      }
      seats.instanceColor!.needsUpdate = true; emA.needsUpdate = true; seatsDirty = any;
    }
    // beams: colour per chapter, synchronised slow sweeps (one wave travelling across the rig)
    const inten = lerp(BEAM[i].i, BEAM[j].i, te);
    beamMat.uniforms.uI.value = inten; poolMat.uniforms.uI.value = inten;
    const ic0 = lens.instanceColor!, ic1 = beams.instanceColor!, ic2 = pools.instanceColor!;
    for (let k = 0; k < NB; k++) {
      const a = BEAM[i].cols[k % 5], b = BEAM[j].cols[k % 5];
      c1.setRGB(a[0], a[1], a[2]); c2.setRGB(b[0], b[1], b[2]); c1.lerp(c2, te);
      ic1.setXYZ(k, c1.r, c1.g, c1.b); ic2.setXYZ(k, c1.r, c1.g, c1.b); ic0.setXYZ(k, c1.r * 2.2, c1.g * 2.2, c1.b * 2.2);
      const f = fix[k], g = tgt[k], ph = t * 0.32 + k * 0.28, sg = f[0] < 0 ? -1 : 1;
      const tx = g[0] + Math.sin(ph) * 5.5 * (k % 2 ? 1 : -1) * sg * 0.6 + Math.sin(ph) * 2.5, tz = g[2] + Math.cos(t * 0.24 + k * 0.28) * 2.6;
      v3.set(tx - f[0], g[1] - (f[1] - 0.9), tz - f[2]); const len = v3.length(); v3.divideScalar(len);
      q.setFromUnitVectors(down, v3); const sk = len / BH;
      v4.set(f[0], f[1] - 0.9, f[2]); sc.set(sk, sk, sk); mm.compose(v4, q, sc); beams.setMatrixAt(k, mm);
      v4.set(tx, g[1] + 0.03, tz); const pr = 2 * 1.9 * sk * 1.2; sc.set(pr, 1, pr); q.identity(); mm.compose(v4, q, sc); pools.setMatrixAt(k, mm);
    }
    ic0.needsUpdate = ic1.needsUpdate = ic2.needsUpdate = true; beams.instanceMatrix.needsUpdate = true; pools.instanceMatrix.needsUpdate = true;
    // LED wall colours follow the chapter
    const ca = BEAM[i].cols[0], cb = BEAM[i].cols[1], na = BEAM[j].cols[0], nb = BEAM[j].cols[1];
    col3(ca, na, te, screenMat.uniforms.uA.value); col3(cb, nb, te, screenMat.uniforms.uB.value); screenMat.uniforms.uT.value = t;
    haze.forEach((h, k) => { h.position.x = (k - 2.5) * 7 + Math.sin(t * 0.07 + k) * 4; h.position.y = 7 + (k % 3) * 2.5 + Math.sin(t * 0.05 + k * 2) * 1.2; });
  }

  // camera: scroll position -> pose along the spline, plus a damped handheld drift
  function camera(u: number, t: number, calm: boolean, pos: THREE.Vector3, look: THREE.Vector3, view: View) {
    const k = sampleCam(u);
    pos.set(k[0], k[1], k[2]); look.set(k[3], k[4], k[5]);
    if (!calm) {
      pos.x += Math.sin(t * 0.37) * 0.2 + Math.sin(t * 0.93) * 0.05; pos.y += Math.sin(t * 0.29 + 1) * 0.13 + Math.sin(t * 0.77) * 0.04;
      look.x += Math.sin(t * 0.21 + 2) * 0.4; look.y += Math.sin(t * 0.33) * 0.25;
    }
    view.fov = narrow ? Math.min(78, k[6] + 20) : k[6]; view.sx = narrow ? 0 : k[7]; view.sy = narrow ? k[8] : 0;
  }
  const moodAt = (u: number) => { const s = split(u); return { expo: mix(MOOD.expo, s), vig: mix(MOOD.vig, s), wash: mix(MOOD.wash, s) }; };

  const dispose = () => {
    dead = true; scene.remove(root); crowd.dispose();
    for (const x of D) x.dispose();
    envScene.dispose(); envRT.dispose(); pm.dispose();
    scene.background = prev.bg; scene.fog = prev.fog; scene.environment = prev.env; scene.environmentIntensity = prev.ei;
  };
  return { update, camera, mood: moodAt, dispose, stats: { seats: NS, people: crowdMax } };
}
