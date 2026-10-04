// The people flow: a restrained set of light streaks (<= max instances).
// Real people (ice discs) walk in through the gates, up the aisles and along a row to their seat, which then turns gold.
// Bots (hot diamonds, faster) sprint at the gate, hit the flashing barrier and are thrown back. Fans without a seat are turned away softly.
import * as THREE from "three";
import { AIS, CZ, GATE_R, GATE_Y, rowR, yWalk, type Seat } from "./layout";

const ICE = [0.5, 0.85, 1], HOT = [1, 0.18, 0.3];
const OUT_R = 50; // where fans appear (outside the gates, in the dark)

export type CrowdHooks = { arrive: (seat: number) => void; unfill: (seat: number) => void; flash: (gate: number) => void };

export function makeCrowd(max: number, seats: Seat[], order: number[], hooks: CrowdHooks, rnd: () => number) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1); // a=x in 0..1 along the streak (0 tail, 1 head), b=y in -1..1 across
  geo.index = quad.index; geo.setAttribute("position", quad.getAttribute("position"));
  const A = (n: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const iPos = A(3), iVel = A(3), iCol = A(3), iMeta = A(3); // meta: size, kind (0 person, 1 bot), alpha
  geo.setAttribute("iPos", iPos); geo.setAttribute("iVel", iVel); geo.setAttribute("iCol", iCol); geo.setAttribute("iMeta", iMeta);
  geo.instanceCount = max;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uGain: { value: 1 } },
    vertexShader: /* glsl */ `attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iCol; attribute vec3 iMeta;
      varying vec2 vQ; varying vec3 vC; varying float vA; varying float vKind; varying vec2 vDim;
      void main(){
        float size = iMeta.x; vC = iCol; vKind = iMeta.y;
        vec4 c = viewMatrix * vec4(iPos, 1.);
        float dist = -c.z;
        vec2 vv = (viewMatrix * vec4(iVel, 0.)).xy * .17;       // streak = 0.17 s of travel, foreshortened by the view
        float L = length(vv); vec2 dir = L > 1e-4 ? vv / L : vec2(1., 0.); vec2 perp = vec2(-dir.y, dir.x);
        float tot = size + L;
        vQ = vec2(position.x + .5, position.y * 2.); vDim = vec2(tot, size);
        float along = (position.x + .5 - 1.) * tot + size * .5;
        c.xy += dir * along + perp * (position.y * size);
        vA = iMeta.z * (1. - smoothstep(75., 135., dist)) * smoothstep(1.2, 5., dist);
        gl_Position = projectionMatrix * c;
        if (iMeta.z < .01) gl_Position = vec4(2., 2., 2., 1.);
      }`,
    fragmentShader: /* glsl */ `uniform float uGain; varying vec2 vQ; varying vec3 vC; varying float vA; varying float vKind; varying vec2 vDim;
      void main(){
        float tot = vDim.x, size = vDim.y, s = vQ.x * tot, hc = tot - size * .5;      // s: distance from the tail
        vec2 p = vec2(s - hc, vQ.y * size * .5) / (size * .5);                          // head-centred, radius 1
        float head = vKind > .5 ? 1. - smoothstep(.62, 1., abs(p.x) + abs(p.y)) : 1. - smoothstep(.55, 1., length(p));
        float t = clamp(s / max(hc, 1e-4), 0., 1.);
        float tail = s < hc ? pow(t, 1.8) * (1. - smoothstep(.2, 1., abs(vQ.y))) * .5 : 0.;
        float a = (head + tail) * vA;
        gl_FragColor = vec4(vC * uGain, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5;

  // ---- per person state
  const act = new Uint8Array(max); // 0 off, 1 walk in, 2 bot sprint, 3 thrown back / turned away
  const kind = new Uint8Array(max), accepted = new Uint8Array(max);
  const d = new Float32Array(max), Lr = new Float32Array(max), Ltot = new Float32Array(max), spd = new Float32Array(max), lane = new Float32Array(max);
  const gate = new Uint8Array(max), seat = new Int32Array(max).fill(-1), age = new Float32Array(max), Rw = new Float32Array(max), thS = new Float32Array(max), R0 = new Float32Array(max);
  const holder = new Int32Array(seats.length).fill(-1); // seat -> the person walking to it
  let ptr = 0, cursor = 0, acc = 0, wasCalm = false;
  const H = 1.15; // dot height above the floor

  function spawn(bot: boolean, pace: number, canSeat: boolean) {
    let i = -1; for (let k = 0; k < max; k++) { const j = (cursor + k) % max; if (!act[j]) { i = j; cursor = j + 1; break; } }
    if (i < 0) return;
    age[i] = 0; d[i] = 0; accepted[i] = 0; seat[i] = -1; lane[i] = (rnd() - 0.5) * 1.5; kind[i] = bot ? 1 : 0;
    const col = bot ? HOT : ICE; const k = bot ? 1.3 : 0.6; iCol.setXYZ(i, col[0] * k, col[1] * k, col[2] * k);
    if (bot) {
      gate[i] = Math.floor(rnd() * 3); R0[i] = OUT_R + 14 + rnd() * 14; spd[i] = 15 + rnd() * 4; act[i] = 2;
    } else if (canSeat && ptr < order.length) {
      const s = order[ptr++], st = seats[s]; seat[i] = s; holder[s] = i; accepted[i] = 1; gate[i] = st.aisle;
      R0[i] = OUT_R + rnd() * 3; Rw[i] = rowR(st.row) - 0.55; thS[i] = st.th; spd[i] = (4.2 + rnd() * 1.2) * pace; act[i] = 1;
      Lr[i] = R0[i] - Rw[i]; const thE = AIS[gate[i]] + lane[i] / Rw[i]; Ltot[i] = Lr[i] + Math.abs(st.th - thE) * Rw[i];
    } else { // a fan with no seat: walks up to the barrier, is turned away
      gate[i] = Math.floor(rnd() * 3); R0[i] = OUT_R + rnd() * 3; spd[i] = (4 + rnd()) * pace; act[i] = 1; Rw[i] = GATE_R + 1.6; Lr[i] = R0[i] - Rw[i]; Ltot[i] = Lr[i];
    }
  }

  function put(i: number, R: number, th: number, y: number, vr: number, vt: number, size: number, alpha: number) {
    const s = Math.sin(th), c = Math.cos(th);
    iPos.setXYZ(i, s * R, y, CZ + c * R);
    iVel.setXYZ(i, s * vr + c * vt, 0, c * vr - s * vt); // vr outward along the radius, vt along +theta
    iMeta.setXYZ(i, size, kind[i], alpha);
  }

  function clear() { for (let i = 0; i < max; i++) { act[i] = 0; iMeta.setXYZ(i, 0, 0, 0); } holder.fill(-1); iMeta.needsUpdate = true; }

  /** target = number of seats that should be gold now */
  function update(dt: number, flow: { rate: number; bots: number; pace: number }, target: number, calm: boolean) {
    if (calm) { if (!wasCalm) clear(); wasCalm = true; ptr = Math.min(Math.round(target), order.length); return; }
    wasCalm = false;
    // scrolling back: release the latest seats
    while (ptr > target + 1) { const s = order[--ptr]; holder[s] = -1; hooks.unfill(s); }
    const behind = Math.max(0, target - ptr);
    acc += dt * flow.rate * (1 + Math.min(3, behind / 25));
    while (acc >= 1) {
      acc -= 1;
      if (rnd() < flow.bots) spawn(true, flow.pace, false);
      else spawn(false, flow.pace, ptr < target);
    }
    for (let i = 0; i < max; i++) {
      const a = act[i]; if (!a) continue;
      age[i] += dt;
      if (a === 1) {
        d[i] += spd[i] * dt; // pace is baked into spd at spawn
        const di = d[i], fade = Math.min(1, age[i] / 0.5);
        if (accepted[i]) {
          if (di >= Ltot[i]) { act[i] = 0; iMeta.setXYZ(i, 0, 0, 0); const s = seat[i]; if (holder[s] === i) { holder[s] = -1; hooks.arrive(s); } continue; }
          const sp = spd[i];
          const end = Math.min(1, (Ltot[i] - di) / 0.6) * fade;
          if (di < Lr[i]) { const R = R0[i] - di, th = AIS[gate[i]] + lane[i] / R; put(i, R, th, yWalk(R) + H, -sp, 0, 0.3, fade); }
          else {
            const thE = AIS[gate[i]] + lane[i] / Rw[i], sg = Math.sign(thS[i] - thE) || 1;
            put(i, Rw[i], thE + sg * (di - Lr[i]) / Rw[i], yWalk(Rw[i]) + H, 0, sg * sp, 0.3, end);
          }
        } else if (di >= Lr[i]) { act[i] = 3; age[i] = 0; spd[i] = 0; }
        else { const R = R0[i] - di, th = AIS[gate[i]] + lane[i] / R; put(i, R, th, yWalk(R) + H, -spd[i], 0, 0.34, fade * 0.8); }
      } else if (a === 2) {
        const R = R0[i] - spd[i] * age[i];
        if (R <= GATE_R + 0.9) { act[i] = 3; age[i] = 0; R0[i] = GATE_R + 0.9; spd[i] = 0; hooks.flash(gate[i]); }
        else put(i, R, AIS[gate[i]] + lane[i] / R, GATE_Y + H + 0.1, -spd[i], 0, 0.6, Math.min(1, age[i] / 0.3));
      } else { // thrown back / turned away: slides out and dissolves
        const life = kind[i] ? 0.9 : 0.7, k = age[i] / life;
        if (k >= 1) { act[i] = 0; iMeta.setXYZ(i, 0, 0, 0); continue; }
        const away = kind[i] ? 9 * k * (1 - 0.5 * k) : 1.2 * k, R = (kind[i] ? GATE_R + 0.9 : Rw[i]) + away;
        const th = AIS[gate[i]] + lane[i] / R + (kind[i] ? (lane[i] > 0 ? 1 : -1) * k * 0.05 : 0);
        put(i, R, th, GATE_Y + H + (kind[i] ? 0.1 + k * 0.6 : 0), kind[i] ? 9 * (1 - k) : 1, 0, kind[i] ? 0.6 * (1 - 0.4 * k) : 0.3, (1 - k) * (kind[i] ? 1 : 0.55));
      }
    }
    iPos.needsUpdate = true; iVel.needsUpdate = true; iMeta.needsUpdate = true; iCol.needsUpdate = true;
  }

  return { mesh, update, clear, get ptr() { return ptr; }, dispose: () => { geo.dispose(); quad.dispose(); mat.dispose(); } };
}
