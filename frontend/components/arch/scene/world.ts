// Floor, glow, cable and barrier materials for the architecture hero. No React.
import * as THREE from "three";

export const FLOOR_W = 46, FLOOR_D = 26;

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Dark semi-opaque overlay with faint circuit traces; the reflective floor shows through. Edges fade to the page black. */
export function floorTexture() {
  const W = 2048, H = Math.round((W * FLOOR_D) / FLOOR_W), c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!, r = rng(7);
  x.fillStyle = "rgba(7,5,13,.62)"; x.fillRect(0, 0, W, H);
  x.lineCap = "round"; x.lineJoin = "round";
  for (let i = 0; i < 90; i++) {
    let px = r() * W, py = r() * H; const horiz = r() < 0.7; x.beginPath(); x.moveTo(px, py);
    const segs = 2 + Math.floor(r() * 3);
    for (let s = 0; s < segs; s++) { const len = 60 + r() * 220, d = horiz ? 1 : 0; px += (d ? len : (r() < 0.5 ? -1 : 1) * 40) * (r() < 0.2 ? -1 : 1); py += d ? (r() < 0.5 ? -1 : 1) * (30 + r() * 60) * 0.5 : len; x.lineTo(px, py); }
    const a = 0.07 + r() * 0.16; x.strokeStyle = `rgba(139,108,255,${a})`; x.lineWidth = 2 + r() * 1.5; x.stroke();
    x.beginPath(); x.arc(px, py, 5, 0, 7); x.strokeStyle = `rgba(139,108,255,${a + 0.1})`; x.lineWidth = 2; x.stroke();
  }
  for (let i = 0; i < 14; i++) { const w = 80 + r() * 120, h = 60 + r() * 90, px = r() * (W - w), py = r() * (H - h); x.strokeStyle = "rgba(139,108,255,.1)"; x.lineWidth = 2; x.strokeRect(px, py, w, h); for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(px + 10 + k * (w / 6), py); x.lineTo(px + 10 + k * (w / 6), py - 14); x.stroke(); } }
  x.save(); x.setTransform(1, 0, 0, H / W, 0, 0);
  const g = x.createRadialGradient(W / 2, W / 2, W * 0.26, W / 2, W / 2, W * 0.52); g.addColorStop(0, "rgba(7,5,13,0)"); g.addColorStop(1, "rgba(7,5,13,1)");
  x.fillStyle = g; x.fillRect(0, 0, W, W); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,.85)"); g.addColorStop(0.4, "rgba(255,255,255,.25)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Glowing pulses running along a cable (uv.x runs along the tube). */
export function pulseMaterial(hex: string, length: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(hex) }, uL: { value: length } },
    vertexShader: "varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform float uT, uL; uniform vec3 uC; varying float vU; void main(){ float b = pow(.5 + .5 * sin((vU * uL - uT * 2.2) * 2.85), 7.); gl_FragColor = vec4(uC * (.3 + b * 1.4), 1.); }",
  });
}

/** Energy barrier with a ripple per blocked bot. uHits = (z, y, startTime, active). */
export const BARRIER_W = 13.4, BARRIER_H = 3.5;
export function barrierMaterial(hits: THREE.Vector4[]) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uHits: { value: hits }, uC: { value: new THREE.Color("#8b6cff") }, uS: { value: new THREE.Vector2(BARRIER_W, BARRIER_H) } },
    vertexShader: "varying vec2 vP; void main(){ vP = position.zy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `uniform float uT; uniform vec4 uHits[6]; uniform vec3 uC; uniform vec2 uS; varying vec2 vP;
void main(){
  vec2 q = vec2(vP.x, vP.y);
  float dx = uS.x * .5 - abs(q.x), dy = min(q.y, uS.y - q.y);
  float e = 1. - smoothstep(0., .45, min(dx, dy));
  vec2 gq = abs(fract(q * vec2(1.4, 1.4)) - .5); float grid = smoothstep(.46, .5, max(gq.x, gq.y)) * .1;
  float scan = (1. - smoothstep(0., .07, abs(fract(q.y * .45 - uT * .12) - .5))) * .1;
  float r = 0.;
  for (int i = 0; i < 6; i++) { float age = uT - uHits[i].z; if (uHits[i].w > 0. && age > 0. && age < 1.7) { float d = length(q - uHits[i].xy); float w = (d - age * 4.5) * 2.6; r += exp(-w * w) * (1. - age / 1.7) * .55 + exp(-d * d * 3.) * max(0., 1. - age * 2.5) * .5; } }
  float a = .06 + grid * 1.5 + scan * 1.3 + e * .35 + r;
  vec3 c = mix(uC, vec3(1., .5, .42), clamp(r, 0., 1.));
  gl_FragColor = vec4(c * (1. + r * .4), min(a, .55));
}`,
  });
}
