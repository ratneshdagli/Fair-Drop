"use client";
// 3D hero for /architecture: a data-centre / control-room render of the road a request takes through Fair Drop.
// Fans and bots -> load balancer -> energy barrier -> 3 API servers -> Redis -> worker -> Postgres. Packets are a schematic, not live traffic.
// One EffectComposer (bloom + output), one rAF loop, no React state per frame, everything disposed on unmount.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { HEX, NODE, type NodeId, type Tone } from "./data";
import { buildApi, buildAttack, buildFan, buildNginx, buildPg, buildRedis, buildWorker, disposeTree, type Node3D } from "./scene/models";
import { BARRIER_H, BARRIER_W, FLOOR_D, FLOOR_W, barrierMaterial, floorTexture, glowTexture, pulseMaterial } from "./scene/world";

type N3 = { id: NodeId; label: string; short: string; tone: Tone; p: [number, number, number]; half: number; top: number; api?: number; build: () => Node3D };
const N3S: N3[] = [
  { id: "fan", label: "Fan's browser", short: "Fans", tone: "ice", p: [-11, 0, -4.4], half: 1.4, top: 2.9, build: buildFan },
  { id: "attack", label: "Attack engine", short: "Attack", tone: "hot", p: [-11, 0, 4], half: 1.7, top: 2.7, build: buildAttack },
  { id: "nginx", label: "Load balancer", short: "Balancer", tone: "gold", p: [-6, 0, 0], half: 1.2, top: 3.3, build: buildNginx },
  { id: "api1", label: "API server 1", short: "API 1", tone: "violet", p: [-0.8, 0, -5], half: 0.8, top: 2.85, api: 0, build: () => buildApi(0, "api-1") },
  { id: "api2", label: "API server 2", short: "API 2", tone: "violet", p: [-0.8, 0, 0], half: 0.8, top: 2.85, api: 1, build: () => buildApi(1, "api-2") },
  { id: "api3", label: "API server 3", short: "API 3", tone: "violet", p: [-0.8, 0, 5], half: 0.8, top: 2.85, api: 2, build: () => buildApi(2, "api-3") },
  { id: "redis", label: "Redis", short: "Redis", tone: "lime", p: [3.6, 0, 0], half: 0.97, top: 3.75, build: buildRedis },
  { id: "worker", label: "Worker", short: "Worker", tone: "violet", p: [7.8, 0, 2], half: 1.3, top: 3.45, build: buildWorker },
  { id: "pg", label: "Postgres", short: "Postgres", tone: "lime", p: [11.8, 0, -0.4], half: 1.1, top: 3.0, build: buildPg },
];
const NM = Object.fromEntries(N3S.map((n) => [n.id, n])) as Record<NodeId, N3>;
const BX = -2.75; // x of the energy barrier, just in front of the API servers
const CY = 0.78; // cable height

// ── cables ──
const LUT = 48;
type Cable = { c: THREE.CubicBezierCurve3; lut: Float32Array; len: number; col: string };
function cable(a: NodeId, b: NodeId, col: string, za = 0, zb = 0): Cable {
  const A = NM[a], B = NM[b];
  const s = new THREE.Vector3(A.p[0] + A.half, CY, A.p[2] + za), e = new THREE.Vector3(B.p[0] - B.half, CY, B.p[2] + zb), k = (e.x - s.x) * 0.45;
  const c = new THREE.CubicBezierCurve3(s, s.clone().add(new THREE.Vector3(k, 0, 0)), e.clone().sub(new THREE.Vector3(k, 0, 0)), e);
  const lut = new Float32Array(LUT * 3); c.getSpacedPoints(LUT - 1).forEach((v, i) => { lut[i * 3] = v.x; lut[i * 3 + 1] = v.y; lut[i * 3 + 2] = v.z; });
  return { c, lut, len: c.getLength(), col };
}
const API: NodeId[] = ["api1", "api2", "api3"];
const SRC = [cable("fan", "nginx", HEX.ice), cable("attack", "nginx", HEX.hot)];
const TOAPI = API.map((a, i) => cable("nginx", a, HEX.violet, (i - 1) * 0.9));
const TORED = API.map((a, i) => cable(a, "redis", HEX.gold, 0, (i - 1) * 0.3));
const R2W = cable("redis", "worker", HEX.lime), W2P = cable("worker", "pg", HEX.lime);
const ALL = [...SRC, ...TOAPI, ...TORED, R2W, W2P];
const FHIT = TOAPI.map((cb) => { for (let j = 1; j < LUT; j++) if (cb.lut[j * 3] >= BX) { const x0 = cb.lut[(j - 1) * 3], x1 = cb.lut[j * 3]; return (j - 1 + (BX - x0) / (x1 - x0)) / (LUT - 1); } return 0.5; });
const humanSeg = (s: number, k: number) => [SRC[0], TOAPI[s], TORED[s], R2W, W2P][k];
const botSeg = (s: number, k: number) => [SRC[1], TOAPI[s]][k];

function samp(cb: Cable, f: number, o: THREE.Vector3) {
  const t = Math.min(1, Math.max(0, f)) * (LUT - 1), j = Math.min(Math.floor(t), LUT - 2), r = t - j, a = j * 3, b = a + 3, l = cb.lut;
  return o.set(l[a] + (l[b] - l[a]) * r, l[a + 1] + (l[b + 1] - l[a + 1]) * r, l[a + 2] + (l[b + 2] - l[a + 2]) * r);
}

type Ripple = { hits: THREE.Vector4[]; n: number; flash: number[] };

function Cables({ still }: { still: boolean }) {
  const root = useMemo(() => {
    const g = new THREE.Group(), glass = new THREE.MeshStandardMaterial({ color: "#2a2345", roughness: 0.22, metalness: 0.9, transparent: true, opacity: 0.38, depthWrite: false });
    const collar = new THREE.MeshStandardMaterial({ color: "#3a3358", roughness: 0.3, metalness: 0.95 }), cg = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 14);
    for (const cb of ALL) {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(cb.c, 72, 0.08, 10), glass));
      const inner = new THREE.Mesh(new THREE.TubeGeometry(cb.c, 72, 0.034, 8), pulseMaterial(cb.col, cb.len)); inner.name = "pulse"; g.add(inner);
      for (const p of [cb.c.v0, cb.c.v3]) { const m = new THREE.Mesh(cg, collar); m.position.copy(p); m.rotation.z = Math.PI / 2; g.add(m); }
    }
    return g;
  }, []);
  useEffect(() => () => { disposeTree(root); }, [root]);
  useFrame(({ clock }) => { const t = still ? 0 : clock.elapsedTime; root.children.forEach((c) => { if (c.name === "pulse") ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uT.value = t; }); });
  return <primitive object={root} />;
}

// ── packets: capsules (real people) and diamonds (bots) with fading trails ──
const NH = 56, NB = 30, TR = 4, TS = TR + 1;
const C_ICE = new THREE.Color(HEX.ice), C_LIME = new THREE.Color(HEX.lime), C_HOT = new THREE.Color(HEX.hot), C_WARN = new THREE.Color(HEX.warn), C_W = new THREE.Color("#ffffff");
const UP = new THREE.Vector3(0, 1, 0);

function Packets({ still, ripple }: { still: boolean; ripple: Ripple }) {
  const st = useMemo(() => {
    const mk = (geo: THREE.BufferGeometry, n: number) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n);
      m.frustumCulled = false; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < n; i++) { m.setMatrixAt(i, z); m.setColorAt(i, C_W); } return m;
    };
    const hum = mk(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), NH * TS), bot = mk(new THREE.OctahedronGeometry(0.15), NB * TS);
    const PH = new Float32Array(NH), SH = new Float32Array(NH), VH = new Uint8Array(NH), PB = new Float32Array(NB), SB = new Float32Array(NB), VB = new Uint8Array(NB), D = new Float32Array(NB);
    let rr = 0;
    for (let i = 0; i < NH; i++) { PH[i] = Math.random() * 5; SH[i] = 0.26 + Math.random() * 0.1; VH[i] = rr++ % 3; }
    for (let i = 0; i < NB; i++) { PB[i] = Math.random() * 1.8; SB[i] = 0.34 + Math.random() * 0.14; VB[i] = rr++ % 3; }
    return { hum, bot, PH, SH, VH, PB, SB, VB, D, rr: { v: rr }, a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), c: new THREE.Color(), s: new THREE.Vector3(), e: new THREE.Euler() };
  }, []);
  useEffect(() => () => { for (const m of [st.hum, st.bot]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); } }, [st]);

  useFrame(({ clock }, dtRaw) => {
    const dt = still ? 0 : Math.min(dtRaw, 0.05), t = still ? 0 : clock.elapsedTime, { a, b, q, m, c, s, e } = st;
    const put = (mesh: THREE.InstancedMesh, idx: number, scale: number, mult: number) => { m.compose(a, q, s.setScalar(scale)); mesh.setMatrixAt(idx, m); mesh.setColorAt(idx, c.multiplyScalar(mult)); };
    const hide = (mesh: THREE.InstancedMesh, base: number) => { s.setScalar(0); for (let j = 0; j < TS; j++) { m.compose(a, q, s); mesh.setMatrixAt(base + j, m); } };
    for (let i = 0; i < NH; i++) {
      let P = st.PH[i] + dt * st.SH[i]; if (P >= 5) { P = -Math.random() * 1.2; st.VH[i] = st.rr.v++ % 3; st.SH[i] = 0.26 + Math.random() * 0.1; } st.PH[i] = P;
      if (P < 0) { hide(st.hum, i * TS); continue; }
      const k = Math.min(4, Math.floor(P)), f = P - k, sv = st.VH[i], cb = humanSeg(sv, k), lim = k === 1 ? FHIT[sv] : 0.5;
      const lime = k >= 2 ? 1 : k === 1 ? THREE.MathUtils.smoothstep(f, lim - 0.03, lim + 0.03) : 0, fade = Math.min(1, P / 0.12, (5 - P) / 0.25);
      samp(cb, f + 0.02, b);
      for (let j = 0; j < TS; j++) {
        const fj = f - (j * 0.34) / cb.len;
        if (fj < 0 && j > 0) { s.setScalar(0); m.compose(a, q, s); st.hum.setMatrixAt(i * TS + j, m); continue; }
        samp(cb, fj, a); samp(cb, fj + 0.02, b); q.setFromUnitVectors(UP, b.sub(a).normalize()); c.copy(C_ICE).lerp(C_LIME, lime);
        put(st.hum, i * TS + j, j === 0 ? 1 : 0.85 - j * 0.14, (j === 0 ? 2.6 : 1.5 * Math.pow(1 - j / TS, 1.6)) * fade);
      }
    }
    for (let i = 0; i < NB; i++) {
      const base = i * TS, sv = st.VB[i];
      if (st.D[i] > 0) {
        st.D[i] += dt; const u = st.D[i] / 0.75;
        if (u >= 1) { st.D[i] = 0; st.PB[i] = -Math.random() * 1.5; st.VB[i] = st.rr.v++ % 3; hide(st.bot, base); continue; }
        samp(botSeg(sv, 1), FHIT[sv], a); e.set(t * 3 + i, t * 2, 0); q.setFromEuler(e); c.copy(C_W).lerp(C_WARN, Math.min(1, u * 2.2)); put(st.bot, base, 1 + u * 2.6, (1 - u) * 3);
        s.setScalar(0); for (let j = 1; j < TS; j++) { m.compose(a, q, s); st.bot.setMatrixAt(base + j, m); }
        continue;
      }
      const P = st.PB[i] + dt * st.SB[i]; st.PB[i] = P;
      if (P < 0) { hide(st.bot, base); continue; }
      const k = Math.min(1, Math.floor(P)), f = P - k, cb = botSeg(sv, k);
      if (!still && k === 1 && f >= FHIT[sv]) { st.D[i] = 1e-4; samp(cb, FHIT[sv], a); ripple.hits[ripple.n++ % 6].set(a.z, a.y, clock.elapsedTime, 1); ripple.flash[sv] = 1; continue; }
      const fade = Math.min(1, P / 0.12);
      for (let j = 0; j < TS; j++) {
        const fj = f - (j * 0.34) / cb.len;
        if (fj < 0 && j > 0) { s.setScalar(0); m.compose(a, q, s); st.bot.setMatrixAt(base + j, m); continue; }
        samp(cb, fj, a); e.set(t * 3 + i, t * 2 + j, 0); q.setFromEuler(e); c.copy(C_HOT);
        put(st.bot, base + j, j === 0 ? 1 : 0.8 - j * 0.14, (j === 0 ? 2.4 : 1.4 * Math.pow(1 - j / TS, 1.6)) * fade);
      }
    }
    for (const mesh of [st.hum, st.bot]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  });
  return <><primitive object={st.hum} /><primitive object={st.bot} /></>;
}

function Barrier({ still, ripple }: { still: boolean; ripple: Ripple }) {
  const mat = useMemo(() => barrierMaterial(ripple.hits), [ripple]);
  const geo = useMemo(() => new THREE.PlaneGeometry(BARRIER_W, BARRIER_H).translate(0, BARRIER_H / 2, 0).rotateY(Math.PI / 2), []);
  useEffect(() => () => { mat.dispose(); geo.dispose(); }, [mat, geo]);
  useFrame(({ clock }) => { mat.uniforms.uT.value = still ? 0 : clock.elapsedTime; });
  return (
    <group position={[BX, 0, 0]}>
      <mesh geometry={geo} material={mat} />
      {[-BARRIER_W / 2, BARRIER_W / 2].map((z) => (
        <mesh key={z} position={[0, BARRIER_H / 2, z]}><boxGeometry args={[0.1, BARRIER_H + 0.2, 0.1]} /><meshStandardMaterial color="#2a2345" metalness={0.9} roughness={0.3} emissive="#8b6cff" emissiveIntensity={0.5} /></mesh>
      ))}
    </group>
  );
}

// ── nodes ──
function NodeView({ n, active, still, ripple, glow, onHover, onPick }: { n: N3; active: boolean; still: boolean; ripple: Ripple; glow: THREE.Texture; onHover: (id: NodeId | null) => void; onPick: (id: NodeId) => void }) {
  const model = useMemo(() => n.build(), [n]);
  useEffect(() => () => disposeTree(model.group), [model]);
  const a = useRef(0), pool = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    const t = still ? 0 : clock.elapsedTime, tgt = active ? 1 : 0, fl = n.api !== undefined ? ripple.flash[n.api] : 0;
    a.current = still ? tgt : a.current + (tgt - a.current) * Math.min(1, dt * 8);
    if (n.api !== undefined && !still) ripple.flash[n.api] = Math.max(0, fl - dt * 2);
    model.tick(t, a.current, fl);
    if (pool.current) (pool.current.material as THREE.MeshBasicMaterial).opacity = 0.22 + a.current * 0.4 + fl * 0.3;
  });
  return (
    <group position={n.p}>
      <mesh ref={pool} rotation-x={-Math.PI / 2} position-y={0.03}>
        <circleGeometry args={[n.half * 2.4, 40]} /><meshBasicMaterial map={glow} color={HEX[n.tone]} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <primitive object={model.group}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(n.id); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = ""; }}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onPick(n.id); }} />
    </group>
  );
}

// ── floor, environment, post-processing ──
function Floor() {
  const o = useMemo(() => {
    const g = new THREE.Group(), geo = new THREE.PlaneGeometry(FLOOR_W, FLOOR_D);
    const refl = new Reflector(geo, { textureWidth: 512, textureHeight: 320, color: 0x332d4a, clipBias: 0.003 }); refl.rotation.x = -Math.PI / 2; g.add(refl);
    const ov = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false, toneMapped: false })); ov.rotation.x = -Math.PI / 2; ov.position.y = 0.012; g.add(ov);
    return g;
  }, []);
  useEffect(() => () => { disposeTree(o); }, [o]);
  return <primitive object={o} />;
}

function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl), room = new RoomEnvironment(), rt = pm.fromScene(room, 0.04);
    scene.environment = rt.texture; scene.environmentIntensity = 0.55;
    return () => { scene.environment = null; rt.dispose(); pm.dispose(); room.dispose(); };
  }, [gl, scene]);
  return null;
}

function Post() {
  const { gl, scene, camera, size } = useThree();
  const { c: comp, bloom } = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(size.width, size.height, { type: THREE.HalfFloatType, samples: 2 });
    const c = new EffectComposer(gl, rt);
    c.addPass(new RenderPass(scene, camera)); const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.25, 0.45, 1.05); c.addPass(bloom); c.addPass(new OutputPass());
    return { c, bloom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => { comp.setPixelRatio(gl.getPixelRatio()); comp.setSize(size.width, size.height); bloom.setSize(size.width / 2, size.height / 2); }, [comp, bloom, gl, size.width, size.height]);
  useEffect(() => () => comp.dispose(), [comp]);
  useFrame((_, dt) => comp.render(dt), 1);
  return null;
}

// ── camera + label projection ──
function Rig({ group, labels, still }: { group: MutableRefObject<THREE.Group | null>; labels: MutableRefObject<(HTMLElement | null)[]>; still: boolean }) {
  const cur = useRef({ x: 0, y: 0 });
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock, camera, size, pointer }) => {
    const g = group.current; if (!g) return;
    const aspect = size.width / size.height, portrait = aspect < 0.95;
    g.rotation.y = portrait ? -Math.PI / 2 : 0;
    const tan = Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360);
    const t = still ? 0 : clock.elapsedTime;
    if (!still) { cur.current.x += (pointer.x - cur.current.x) * 0.04; cur.current.y += (pointer.y - cur.current.y) * 0.04; }
    const sp = still ? 0 : Math.min(1, Math.max(0, window.scrollY / 700));
    const el = (portrait ? 0.8 : 0.56) + Math.sin(t * 0.1) * 0.03 - cur.current.y * 0.05 + sp * 0.1;
    const az = (portrait ? 0 : 0.2) + Math.sin(t * 0.11) * (portrait ? 0.08 : 0.14) + cur.current.x * 0.1 + sp * 0.12;
    const hw = portrait ? 7 : 14.8, hh = portrait ? 14.2 : 4.9;
    const D = Math.max(hh / tan, hw / (tan * aspect)) * 1.04;
    camera.position.set(Math.sin(az) * Math.cos(el) * D, Math.sin(el) * D + 0.9, Math.cos(az) * Math.cos(el) * D);
    camera.lookAt(0.2, portrait ? 0.6 : 0.9, 0); camera.updateMatrixWorld(); g.updateMatrixWorld(true);
    N3S.forEach((n, i) => {
      const l = labels.current[i]; if (!l) return;
      v.set(n.p[0], n.top, n.p[2]); g.localToWorld(v); v.project(camera);
      l.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%) translate(0, -6px)`;
      l.style.opacity = "1";
    });
  });
  return null;
}

function SceneContent({ active, still, labels, onHover, onPick }: { active: NodeId | null; still: boolean; labels: MutableRefObject<(HTMLElement | null)[]>; onHover: (id: NodeId | null) => void; onPick: (id: NodeId) => void }) {
  const group = useRef<THREE.Group>(null);
  const ripple = useMemo<Ripple>(() => ({ hits: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)), n: 0, flash: [0, 0, 0] }), []);
  const glow = useMemo(glowTexture, []);
  const dust = useMemo(() => {
    const geo = new THREE.BufferGeometry(), a = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) { a[i * 3] = (Math.random() - 0.5) * 40; a[i * 3 + 1] = 0.5 + Math.random() * 7; a[i * 3 + 2] = (Math.random() - 0.5) * 22; }
    geo.setAttribute("position", new THREE.BufferAttribute(a, 3)); return geo;
  }, []);
  useEffect(() => () => { glow.dispose(); dust.dispose(); }, [glow, dust]);
  return (
    <>
      <color attach="background" args={["#07050d"]} />
      <fog attach="fog" args={["#07050d", 26, 62]} />
      <Env />
      <hemisphereLight args={["#8b7cff", "#07050d", 0.55]} />
      <directionalLight position={[6, 12, 9]} intensity={2.3} color="#fff1d6" />
      <directionalLight position={[-9, 6, -8]} intensity={1.7} color="#8b6cff" />
      <pointLight position={[-6, 3.6, 2.5]} intensity={9} distance={9} color={HEX.gold} />
      <pointLight position={[3.6, 3.4, 2.5]} intensity={3} distance={8} color={HEX.lime} />
      <pointLight position={[-11, 2.8, 4.5]} intensity={7} distance={8} color={HEX.hot} />
      <Rig group={group} labels={labels} still={still} />
      <group ref={group}>
        <Floor />
        <points geometry={dust}><pointsMaterial color="#8b6cff" size={0.06} transparent opacity={0.45} depthWrite={false} sizeAttenuation /></points>
        <Cables still={still} />
        <Barrier still={still} ripple={ripple} />
        {N3S.map((n) => <NodeView key={n.id} n={n} active={active === n.id} still={still} ripple={ripple} glow={glow} onHover={onHover} onPick={onPick} />)}
        <Packets still={still} ripple={ripple} />
      </group>
      <Post />
    </>
  );
}

// ── page-level component ──
function Dot({ shape, color }: { shape: "disc" | "diamond" | "ring"; color: string }) {
  return <span aria-hidden className="inline-block h-3 w-3 shrink-0" style={shape === "ring" ? { border: `2px solid ${color}`, borderRadius: 99 } : { background: color, borderRadius: shape === "disc" ? 99 : 1, transform: shape === "diamond" ? "rotate(45deg)" : undefined }} />;
}

export default function Hero3D({ onFail }: { onFail: () => void }) {
  const [hover, setHover] = useState<NodeId | null>(null);
  const [pin, setPin] = useState<NodeId | null>(null);
  const [reduced, setReduced] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)"); setReduced(mq.matches);
    const m = () => setReduced(mq.matches), vis = () => setTabVisible(!document.hidden);
    mq.addEventListener("change", m); document.addEventListener("visibilitychange", vis);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.01 });
    if (box.current) io.observe(box.current);
    return () => { mq.removeEventListener("change", m); document.removeEventListener("visibilitychange", vis); io.disconnect(); document.body.style.cursor = ""; };
  }, []);

  const active = hover ?? pin;
  const def = active ? NODE[active] : null;
  const rule = def ? def.rule ?? (active?.startsWith("api") ? NODE.api.rule : undefined) : undefined;
  const run = tabVisible && inView && !reduced;

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-[15px] text-ink"><b className="text-gold">What you are looking at:</b> the road a request takes through Fair Drop, drawn as a schematic. Real people and bots both arrive at the load balancer, which hands them to the three API servers in turn. Bots hit the energy barrier and dissolve; accepted entries move on to Redis, the worker and Postgres.</p>
      <div ref={box} className="relative h-[620px] overflow-hidden rounded-md border border-line md:h-[600px]" style={{ background: "radial-gradient(ellipse at 50% 40%, #171126 0%, #07050d 70%)" }}>
        <Canvas className="!absolute inset-0" style={{ touchAction: "pan-y" }} dpr={[1, 1.5]} frameloop={run ? "always" : "demand"}
          camera={{ fov: 36, near: 0.1, far: 100, position: [0, 8, 24] }} gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onFail(); })}
          onPointerMissed={() => setPin(null)}>
          <SceneContent active={active} still={reduced} labels={labels} onHover={setHover} onPick={(id) => setPin((p) => (p === id ? null : id))} />
        </Canvas>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {N3S.map((n, i) => (
            <button key={n.id} ref={(el) => { labels.current[i] = el; }} type="button" aria-pressed={pin === n.id}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
              onClick={() => setPin((p) => (p === n.id ? null : n.id))}
              className="pointer-events-auto absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap rounded border bg-panel px-2 py-1 text-[15px] font-semibold leading-none text-ink opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              style={{ borderColor: active === n.id ? HEX[n.tone] : "#2b2342", willChange: "transform" }}>
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: HEX[n.tone], boxShadow: `0 0 8px ${HEX[n.tone]}` }} /><span className="md:hidden">{n.short}</span><span className="hidden md:inline">{n.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div aria-live="polite" className="min-h-[132px] rounded-md border bg-panel2 p-4" style={{ borderColor: def ? HEX[def.tone] : "#2b2342" }}>
          {def ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3"><span className="display text-3xl" style={{ color: HEX[def.tone] }}>{def.name}</span><span className="font-mono text-[15px] uppercase tracking-[.12em] text-mute">{def.tech}</span></div>
              <p className="mt-2 text-[15px] text-ink">{def.tip}</p>
              {rule && <p className="mt-2 text-[15px] text-gold">{rule}</p>}
            </>
          ) : (
            <p className="text-[15px] text-ink">Hover, tap or click any machine, or its label, to read what it does in plain words. Click empty space to clear.</p>
          )}
        </div>
        <ul className="space-y-2 rounded-md border border-line bg-panel2 p-4 text-[15px] text-ink">
          <li className="flex items-center gap-2"><Dot shape="disc" color={HEX.ice} />Real person (ice capsule)</li>
          <li className="flex items-center gap-2"><Dot shape="diamond" color={HEX.hot} />Bot (red diamond)</li>
          <li className="flex items-center gap-2"><Dot shape="disc" color={HEX.lime} />Let in: on to Redis, then Postgres</li>
          <li className="flex items-center gap-2"><Dot shape="ring" color={HEX.violet} />Ripple on the barrier: turned away at an API server by the rate limit and the one-ticket rule</li>
          <li className="text-mute">Schematic: the packets illustrate the path, they are not live traffic.</li>
        </ul>
      </div>
    </div>
  );
}
