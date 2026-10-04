// The world around the hall: wet dark asphalt (shader noise, no tiling), the raised polished-stone concourse with its skirt and trim,
// light poles with banners and floor pools, painted road lines, a backstage compound, a far skyline / tree line with horizon glow,
// a perimeter wall and drifting low haze. Pure three.js, a handful of draw calls (everything repeated is instanced).
import * as THREE from "three";
import { AIS, CZ, GATE_R, GATE_Y, REAR_R } from "./layout";

type Own = <T extends { dispose(): void }>(x: T) => T;
export type Ctx = {
  root: THREE.Group; own: Own; narrow: boolean; glow: THREE.Texture;
  canvasTex: (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, aniso?: number) => { t: THREE.CanvasTexture; redraw: () => void };
};

const NOISE = /* glsl */ `float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ return .65 * vn(p) + .35 * vn(p * 2.07 + 7.); }`;

/** World-space noise on a standard material: soft albedo mottling plus glossy "wet" patches (low roughness) that never repeat. */
function wetLook(m: THREE.MeshStandardMaterial, puddle: number, mottle: number) {
  m.customProgramCacheKey = () => `wet${puddle}_${mottle}`;
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWP;\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\ndiffuseColor.rgb *= ${(1 - mottle / 2).toFixed(2)} + ${mottle.toFixed(2)} * fbm(vWP.xz * .21);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nfloat wet = smoothstep(.56, .76, fbm(vWP.xz * .05 + 3.)) * ${puddle.toFixed(2)}; roughnessFactor = mix(roughnessFactor, .16, wet); diffuseColor.rgb *= 1. - .3 * wet;`);
  };
}

export function buildWorld(c: Ctx) {
  const { root, own, narrow, glow, canvasTex } = c;
  let seed = 31; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const o = new THREE.Object3D();
  const add = <T extends THREE.Object3D>(x: T) => (root.add(x), x);
  const std = (color: string, rough: number, metal: number, extra: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  // physical so the specular can be tinted violet: with plain white specular the warm key lights turned the ground tan
  const phys = (color: string, rough: number, extra: THREE.MeshPhysicalMaterialParameters) => own(new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  const basic = (r: number, g: number, b: number, extra: THREE.MeshBasicMaterialParameters = {}) => own(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false, ...extra }));
  const rep = (t: THREE.Texture, n: number) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n, n); return t; };
  const xz = (R: number, th: number): [number, number] => [Math.sin(th) * R, CZ + Math.cos(th) * R];
  const CA = 0.78, PR = 80; // concourse half-angle and outer radius

  // ---------- ground: cool dark asphalt with fine grain, glossy wet patches from shader noise (nothing tiles, nothing checkered)
  const grain = rep(own(canvasTex(256, 256, (g) => {
    g.fillStyle = "#a4a6b8"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.14)"; g.fillRect(rnd() * 256, rnd() * 256, 1 + ((rnd() * 2) | 0), 1); }
  }, 8).t), 400 / 6);
  const groundMat = phys("#0b0d20", 0.8, { map: grain, envMapIntensity: 1.0, specularColor: new THREE.Color("#5560ff"), specularIntensity: 0.5 });
  wetLook(groundMat, 1, 0.4);
  add(new THREE.Mesh(own(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2).translate(0, 0, CZ)), groundMat));

  // ---------- the raised concourse: polished slate with hairline seams (1 m slabs, almost no contrast), skirt wall and glow trim
  const stone = rep(own(canvasTex(512, 512, (g) => {
    g.fillStyle = "#c4c3d6"; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 64; i++) { const v = (rnd() - 0.5) * 0.05; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v * 2})`; g.fillRect((i % 8) * 64, Math.floor(i / 8) * 64, 64, 64); }
    for (let i = 0; i < 4500; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.08)"; g.fillRect(rnd() * 512, rnd() * 512, 1, 1); }
    g.strokeStyle = "rgba(255,255,255,.035)"; g.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(rnd() * 512, rnd() * 512); g.bezierCurveTo(rnd() * 512, rnd() * 512, rnd() * 512, rnd() * 512, rnd() * 512, rnd() * 512); g.stroke(); }
    for (let i = 0; i < 8; i++) { g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(i * 64 - 0.5, 0, 1, 512); g.fillRect(0, i * 64 - 0.5, 512, 1); g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(i * 64 + 0.5, 0, 1, 512); g.fillRect(0, i * 64 + 0.5, 512, 1); }
  }, 8).t), 1);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], S = 32;
  for (let s = 0; s < S; s++) {
    const a = -CA + (2 * CA * s) / S, b = -CA + (2 * CA * (s + 1)) / S;
    for (const [R, t] of [[REAR_R, a], [PR, a], [PR, b], [REAR_R, a], [PR, b], [REAR_R, b]] as [number, number][]) { const [x, z] = xz(R, t); pos.push(x, GATE_Y, z); nor.push(0, 1, 0); uv.push(x / 8, z / 8); }
  }
  const cg = own(new THREE.BufferGeometry());
  cg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); cg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const stoneMat = phys("#15152c", 0.62, { map: stone, envMapIntensity: 0.7, specularColor: new THREE.Color("#6d6cff"), specularIntensity: 0.7 });
  add(new THREE.Mesh(cg, stoneMat));
  // skirt: a dark wall from the ground up to the concourse around its outer arc and both sides
  const sk: number[] = [];
  const wall = (a: [number, number], b: [number, number]) => sk.push(a[0], 0, a[1], b[0], 0, b[1], b[0], GATE_Y, b[1], a[0], 0, a[1], b[0], GATE_Y, b[1], a[0], GATE_Y, a[1]);
  for (let s = 0; s < 48; s++) wall(xz(PR, -CA + (2 * CA * s) / 48), xz(PR, -CA + (2 * CA * (s + 1)) / 48));
  for (const t of [-CA, CA]) wall(xz(REAR_R, t), xz(PR, t));
  const skg = own(new THREE.BufferGeometry()); skg.setAttribute("position", new THREE.Float32BufferAttribute(sk, 3));
  add(new THREE.Mesh(skg, std("#15132a", 0.7, 0.2, { flatShading: true, side: THREE.DoubleSide })));
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) edge.push(new THREE.Vector3(...xz(REAR_R + ((PR - REAR_R) * i) / 6, -CA)));
  for (let i = 1; i < 48; i++) edge.push(new THREE.Vector3(...xz(PR, -CA + (2 * CA * i) / 48)));
  for (let i = 6; i >= 0; i--) edge.push(new THREE.Vector3(...xz(REAR_R + ((PR - REAR_R) * i) / 6, CA)));
  edge.forEach((p) => (p.y = GATE_Y + 0.05));
  const trimG = own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, false, "centripetal"), 240, 0.07, 5));
  add(new THREE.Mesh(trimG, basic(1.4, 0.95, 0.25)));
  const trimLow = add(new THREE.Mesh(trimG, basic(0.5, 0.36, 1.2))); trimLow.position.y = 0.3 - GATE_Y - 0.05;

  // ---------- poles: warm-lit ring outside the concourse, cool distant ring, four on the concourse edge; each has a head, a floor pool and (some) a banner
  type P = { R: number; th: number; y0: number; h: number; cool: boolean; banner: boolean };
  const poles: P[] = [];
  for (let k = 0; k < 24; k++) poles.push({ R: 64, th: 0.95 + ((k + 0.5) * (2 * Math.PI - 1.9)) / 24, y0: 0, h: 11, cool: false, banner: k % 2 === 0 });
  for (let k = 0; k < 32; k++) poles.push({ R: 98, th: (k / 32) * Math.PI * 2, y0: 0, h: 15, cool: true, banner: false });
  for (const th of [-0.7, -0.21, 0.21, 0.7]) poles.push({ R: 78, th, y0: GATE_Y, h: 8, cool: false, banner: true });
  const NP = poles.length, warm = poles.filter((p) => !p.cool), NW = warm.length; // pools only for the near (warm) poles: big additive quads are fill-rate
  const poleM = add(new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.1, 0.16, 1, 8).translate(0, 0.5, 0)), std("#1c1a2c", 0.6, 0.5), NP));
  const headM = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(1.8, 0.16, 0.7)), basic(1, 1, 1), NP));
  const WARM = new THREE.Color(1.8, 1.3, 0.55), COOL = new THREE.Color(0.7, 0.95, 1.8);
  const banners = poles.filter((p) => p.banner), NBN = banners.length;
  const bannerTex = own(canvasTex(128, 384, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, "#2a1a5c"); gr.addColorStop(1, "#0d0a1c"); g.fillStyle = gr; g.fillRect(0, 0, 128, 384);
    g.fillStyle = "#ffc233"; g.fillRect(0, 0, 128, 10); g.fillRect(0, 374, 128, 10);
    g.save(); g.translate(64, 192); g.rotate(-Math.PI / 2); g.fillStyle = "#ffc233"; g.font = '400 84px Anton, Impact, "Arial Black", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("FAIR DROP", 0, 4); g.restore();
  }, 4).t);
  const bannerM = add(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1.5, 4.6)), basic(0.9, 0.9, 0.9, { map: bannerTex, side: THREE.DoubleSide }), NBN));
  const poolM = add(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })), NW + 6));
  poolM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((NW + 6) * 3), 3); poolM.frustumCulled = false;
  let bi = 0, pi = 0;
  poles.forEach((p, i) => {
    const [x, z] = xz(p.R, p.th);
    o.position.set(x, p.y0, z); o.rotation.set(0, 0, 0); o.scale.set(1, p.h, 1); o.updateMatrix(); poleM.setMatrixAt(i, o.matrix);
    const [hx, hz] = xz(p.R - 0.9, p.th);
    o.position.set(hx, p.y0 + p.h, hz); o.rotation.set(0, p.th, 0); o.scale.set(1, 1, 1); o.updateMatrix(); headM.setMatrixAt(i, o.matrix); headM.setColorAt(i, p.cool ? COOL : WARM);
    if (!p.cool) { const pr = p.h * 2.4; o.position.set(hx, p.y0 + 0.03, hz); o.rotation.set(0, 0, 0); o.scale.set(pr, 1, pr); o.updateMatrix(); poolM.setMatrixAt(pi, o.matrix); poolM.instanceColor!.setXYZ(pi++, 0.1, 0.09, 0.16); }
    if (p.banner) { const [bx, bz] = xz(p.R - 0.9, p.th); o.position.set(bx, p.y0 + p.h * 0.62, bz); o.rotation.set(0, p.th + Math.PI, 0); o.scale.set(1, 1, 1); o.updateMatrix(); bannerM.setMatrixAt(bi++, o.matrix); }
  });
  // reflected glow: stage-side pools (tinted by the chapter, pulsing with the beat) and warm pools under each gate lane
  const stagePools: [number, number, number][] = [[-34, -30, 26], [34, -30, 26], [0, -56, 34]];
  stagePools.forEach(([x, z, r], k) => { o.position.set(x, 0.04, z); o.rotation.set(0, 0, 0); o.scale.set(r * 2, 1, r * 2); o.updateMatrix(); poolM.setMatrixAt(NW + k, o.matrix); });
  AIS.forEach((a, k) => {
    const [x, z] = xz(GATE_R + 9, a); o.position.set(x, GATE_Y + 0.03, z); o.rotation.set(0, a, 0); o.scale.set(10, 1, 26); o.updateMatrix(); poolM.setMatrixAt(NW + 3 + k, o.matrix);
    poolM.instanceColor!.setXYZ(NW + 3 + k, 0.16, 0.12, 0.05);
  });

  // ---------- road: edge lines and a dashed centre line on the ring road around the hall
  const roadMat = basic(0.26, 0.26, 0.4);
  for (const R of [84, 96]) { const r = add(new THREE.Mesh(own(new THREE.RingGeometry(R - 0.1, R + 0.1, 160).rotateX(-Math.PI / 2).translate(0, 0.02, CZ)), roadMat)); r.frustumCulled = false; }
  const ND = 110, dash = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.28, 0.02, 3.2)), basic(0.4, 0.4, 0.6), ND));
  for (let i = 0; i < ND; i++) { const th = (i / ND) * Math.PI * 2, [x, z] = xz(90, th); o.position.set(x, 0.03, z); o.rotation.set(0, th + Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix(); dash.setMatrixAt(i, o.matrix); }
  dash.frustumCulled = false;

  // ---------- backstage compound: stage house, a row of tour trailers
  const houseMat = std("#17152b", 0.65, 0.35);
  const house = add(new THREE.Mesh(own(new THREE.BoxGeometry(56, 14, 16)), houseMat)); house.position.set(0, 7, -62);
  const hr = add(new THREE.Mesh(own(new THREE.BoxGeometry(56, 0.14, 0.14)), basic(0.5, 0.36, 1.2))); hr.position.set(0, 14.05, -53.9);
  const trailers = add(new THREE.InstancedMesh(own(new THREE.BoxGeometry(11, 3.6, 3)), houseMat, 7));
  for (let k = 0; k < 7; k++) { o.position.set(-36 + k * 12, 1.8, -76); o.rotation.set(0, (rnd() - 0.5) * 0.06, 0); o.updateMatrix(); trailers.setMatrixAt(k, o.matrix); }

  // ---------- far field: perimeter wall, then a skyline with an arena, masts, tree line and horizon glow (fog-free, baked)
  const wallTex = rep(own(canvasTex(512, 64, (g) => {
    g.fillStyle = "#b9b8d0"; g.fillRect(0, 0, 512, 64); g.fillStyle = "rgba(0,0,0,.5)";
    for (let i = 0; i < 8; i++) g.fillRect(i * 64, 0, 2, 64);
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 44, 512, 20); g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, 8, 512, 2);
  }, 4).t), 1); wallTex.repeat.set(12, 1);
  const perim = add(new THREE.Mesh(own(new THREE.CylinderGeometry(112, 112, 5, 96, 1, true).translate(0, 2.5, CZ)), std("#2a2848", 0.85, 0.1, { map: wallTex, side: THREE.BackSide })));
  perim.frustumCulled = false;
  const perimLine = add(new THREE.Mesh(own(new THREE.CylinderGeometry(111.9, 111.9, 0.18, 96, 1, true).translate(0, 5.0, CZ)), basic(0.5, 0.36, 1.1, { side: THREE.BackSide }))); perimLine.frustumCulled = false;
  const W = 2048, Hh = 256;
  const sky = own(canvasTex(W, Hh, (g) => {
    g.clearRect(0, 0, W, Hh);
    let gr = g.createLinearGradient(0, Hh, 0, 40); gr.addColorStop(0, "rgba(139,108,255,.6)"); gr.addColorStop(0.2, "rgba(110,80,220,.24)"); gr.addColorStop(1, "rgba(110,80,220,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    gr = g.createLinearGradient(0, Hh, 0, 196); gr.addColorStop(0, "rgba(255,194,51,.3)"); gr.addColorStop(1, "rgba(255,194,51,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    const winCols = ["rgba(255,194,51,.6)", "rgba(127,216,255,.45)", "rgba(139,108,255,.55)"];
    const city = (fill: string, hMin: number, hMax: number, lit: number) => {
      for (let x = -40; x < W; ) {
        const w = 18 + rnd() * 46, h = hMin + rnd() * (hMax - hMin);
        for (const dx of [0, W]) { g.fillStyle = fill; g.fillRect(x - dx, Hh - h, w, h);
          if (lit) for (let wy = Hh - h + 6; wy < Hh - 6; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rnd() < lit) { g.fillStyle = winCols[(rnd() * 3) | 0]; g.fillRect(wx - dx, wy, 2, 2); } }
        x += w + rnd() * 4;
      }
    };
    city("#15112b", 40, 120, 0); city("#0c0919", 20, 80, 0.16);
    // the arena behind the stage (u = .5 is straight behind it) with a lit rim and floodlight masts
    g.fillStyle = "#08060f"; g.beginPath(); g.ellipse(1024, Hh, 190, 64, 0, Math.PI, 0); g.fill();
    g.fillStyle = "rgba(255,194,51,.55)"; g.fillRect(860, Hh - 16, 330, 3); g.fillStyle = "rgba(139,108,255,.6)"; g.fillRect(900, Hh - 8, 250, 2);
    for (const mx of [790, 860, 1190, 1260]) { g.fillStyle = "#08060f"; g.fillRect(mx, Hh - 120, 3, 120); g.fillStyle = "rgba(255,244,214,.95)"; g.fillRect(mx - 5, Hh - 124, 13, 5); }
    g.fillStyle = "rgba(255,59,92,.9)"; g.fillRect(1022, Hh - 112, 3, 3);
    // tree line: darkest layer
    g.fillStyle = "#06040c"; for (let x = 0; x < W; x += 5) { const r = 6 + rnd() * 10; g.beginPath(); g.arc(x, Hh - r * 0.5, r, 0, Math.PI * 2); g.fill(); }
  }, 8).t);
  sky.wrapS = THREE.RepeatWrapping;
  const skyline = add(new THREE.Mesh(own(new THREE.CylinderGeometry(150, 150, 60, 96, 1, true).translate(0, 29, CZ)), own(new THREE.MeshBasicMaterial({ map: sky, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }))));
  skyline.frustumCulled = false; skyline.renderOrder = -1;

  // ---------- low haze drifting over the ground
  const hazes = [0, 1, 2, 3, 4].map((i) => {
    const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glow, color: i % 2 ? "#6a58d0" : "#4a6ab0", transparent: true, opacity: narrow ? 0.05 : 0.07, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    s.scale.set(90, 18, 1); add(s); return s;
  });
  const tint = new THREE.Color(), VIO = new THREE.Color(0.55, 0.42, 1);
  return {
    update(t: number, kick: number, key: THREE.Color) {
      hazes.forEach((h, i) => { const a = i * 1.26 + t * 0.012; h.position.set(Math.sin(a) * 60 + Math.sin(t * 0.05 + i) * 6, 3 + (i % 3) * 1.5, CZ + Math.cos(a) * 60); });
      const ic = poolM.instanceColor!, k = 0.1 + 0.07 * kick;
      tint.copy(key).lerp(VIO, 0.55); stagePools.forEach((_, j) => ic.setXYZ(NW + j, tint.r * k * (j === 2 ? 0.5 : 1), tint.g * k * (j === 2 ? 0.5 : 1), tint.b * k * (j === 2 ? 0.5 : 1) + 0.03));
      ic.needsUpdate = true;
    },
  };
}
