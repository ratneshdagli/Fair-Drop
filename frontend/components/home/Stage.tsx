"use client";
// The pinned concert hall (see stage/hall.ts). Driven by prog.u (written by the page on scroll); no React state per frame.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { prog } from "./store";
import { STAGES } from "./layouts";
import { buildHall, type View } from "./stage/hall";

type Rig = { hall: ReturnType<typeof buildHall>; composer: EffectComposer; bloom: UnrealBloomPass; rt: THREE.WebGLRenderTarget };

function World({ n, narrow, vig, wash, onFail }: { n: number; narrow: boolean; vig: React.RefObject<HTMLDivElement | null>; wash: React.RefObject<HTMLDivElement | null>; onFail: () => void }) {
  const { gl, scene, camera, invalidate, setDpr } = useThree();
  const rig = useRef<Rig | null>(null), lost = useRef(false);
  const [gen, setGen] = useState(0); // bumped after a context restore: GPU-only resources (env map, targets) must be rebuilt
  // built in an effect (not useMemo) so StrictMode's double mount cannot leave a second hall in the scene
  useEffect(() => {
    let r: Rig | null = null;
    try {
      const hall = buildHall(gl, scene, { n, narrow });
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 }); // MSAA: no shimmering seat edges
      const composer = new EffectComposer(gl, rt);
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.6, 0.92); // high threshold: only emissive things glow
      composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      composer.setPixelRatio(gl.getPixelRatio()); composer.setSize(gl.domElement.clientWidth || 4, gl.domElement.clientHeight || 4); bloom.setSize((gl.domElement.clientWidth || 4) / 2, (gl.domElement.clientHeight || 4) / 2); // bloom at half res (it is a soft glow)
      r = { hall, composer, bloom, rt }; rig.current = r;
    } catch (e) { console.error("hall failed", e); onFail(); return; }
    const cv = gl.domElement;
    const onLost = (e: Event) => { e.preventDefault(); lost.current = true; };
    const onRestored = () => { lost.current = false; setGen((g) => g + 1); };
    cv.addEventListener("webglcontextlost", onLost); cv.addEventListener("webglcontextrestored", onRestored);
    invalidate();
    return () => {
      cv.removeEventListener("webglcontextlost", onLost); cv.removeEventListener("webglcontextrestored", onRestored);
      rig.current = null;
      if (r) { r.hall.dispose(); r.composer.dispose(); r.rt.dispose(); r.bloom.dispose(); }
      camera.clearViewOffset?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, n, narrow, gen]);
  const size = useThree((s) => s.size), dpr = useThree((s) => s.viewport.dpr);
  useEffect(() => { const r = rig.current; if (!r) return; r.composer.setPixelRatio(dpr); r.composer.setSize(size.width, size.height); r.bloom.setSize(size.width / 2, size.height / 2); invalidate(); }, [size, dpr, gen, invalidate]);
  useEffect(() => { prog.ping =() => invalidate(); return () => { prog.ping = null; }; }, [invalidate]);

  const tmp = useMemo(() => ({ ud: prog.u, p: new THREE.Vector3(), l: new THREE.Vector3(), v: { fov: 40, sx: 0, sy: 0 } as View, vig: -1, wash: -1, fov: -1, slow: 0, frames: 0, level: 0 }), []);

  useFrame((state, dtRaw) => {
    const r = rig.current; if (!r || lost.current) return;
    const { hall, composer, bloom } = r, { width, height } = state.size;
    const dt = Math.min(dtRaw, 0.05), calm = prog.reduced, t = calm ? 0 : state.clock.elapsedTime;
    // damped scroll follow (snaps when reduced motion is on)
    tmp.ud += (prog.u - tmp.ud) * (calm ? 1 : 1 - Math.exp(-dt * 4));
    if (Math.abs(prog.u - tmp.ud) < 1e-4) tmp.ud = prog.u;
    const u = Math.min(tmp.ud, STAGES - 1e-3);
    hall.update(u, t, calm ? 0 : dt, calm);
    hall.camera(u, t, calm, tmp.p, tmp.l, tmp.v);
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.copy(tmp.p); cam.lookAt(tmp.l);
    cam.fov = tmp.v.fov; cam.aspect = width / height;
    // push the hall to the right (or up on phones) so the headline column stays clear of busy 3D
    cam.setViewOffset(width, height, -tmp.v.sx * width, tmp.v.sy * height, width, height);
    const m = hall.mood(u);
    gl.toneMappingExposure = m.expo;
    bloom.strength = calm ? 0.3 : narrow ? 0.32 : 0.4;
    const ve = vig.current, we = wash.current, v = Math.round(m.vig * 100) / 100, w = Math.round(m.wash * 100) / 100;
    if (ve && v !== tmp.vig) { tmp.vig = v; ve.style.opacity = String(v); }
    if (we && w !== tmp.wash) { tmp.wash = w; we.style.opacity = String(w); }
    composer.render(dt);
    // frame budget: if the device cannot keep up, shed resolution first, then bloom
    if (!calm && dtRaw > 0.034) tmp.slow++; else tmp.slow = Math.max(0, tmp.slow - 1);
    if (tmp.slow > 90 && tmp.level < 2) { tmp.slow = 0; tmp.level++; if (tmp.level === 1) { setDpr(1); composer.setPixelRatio(1); composer.setSize(width, height); bloom.setSize(width / 2, height / 2); } else bloom.enabled = false; }
  }, 1);
  return null;
}

export default function Stage({ n, narrow }: { n: number; narrow: boolean }) {
  const box = useRef<HTMLDivElement>(null), vig = useRef<HTMLDivElement>(null), wash = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(true), [inView, setInView] = useState(true), [bad, setBad] = useState(false);
  useEffect(() => {
    const on = () => { prog.visible = !document.hidden; setVis(!document.hidden); };
    document.addEventListener("visibilitychange", on); on();
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    if (box.current) io.observe(box.current);
    return () => { document.removeEventListener("visibilitychange", on); io.disconnect(); };
  }, []);
  if (bad) return <div className="absolute inset-0" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(255,194,51,.22), transparent 70%), radial-gradient(50% 45% at 85% 20%, rgba(139,108,255,.3), transparent 70%)" }} />;
  return (
    <div ref={box} className="absolute inset-0" style={{ background: "#06040c" }}>
      {/* the chapters' own readability wash (parts.tsx) is very heavy and would bury the hall: lighten it, the stage dims itself behind text */}
      <style>{`.lp::before{background:linear-gradient(to bottom,transparent 0,rgba(6,4,12,.26) 14%,rgba(6,4,12,.4) 50%,rgba(6,4,12,.26) 86%,transparent 100%)!important}#top.lp::before{background:none!important}`}</style>
      <Canvas
        frameloop={!vis || !inView ? "never" : prog.reduced ? "demand" : "always"}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: narrow ? 60 : 40, near: 0.1, far: 220, position: [-14, 11.6, 9] }}
      >
        <World n={n} narrow={narrow} vig={vig} wash={wash} onFail={() => setBad(true)} />
      </Canvas>
      {/* keeps the scene quiet behind the text: soft blur + dark on the text side (strength follows the chapter) and an edge vignette */}
      <div ref={wash} className="absolute inset-0" style={{ opacity: 1, background: narrow ? "linear-gradient(to bottom, rgba(6,4,12,.78) 0, rgba(6,4,12,.62) 40%, rgba(6,4,12,.9) 62%, rgba(6,4,12,.94) 100%)" : "linear-gradient(to right, rgba(6,4,12,.9) 0, rgba(6,4,12,.72) 30%, rgba(6,4,12,.25) 48%, transparent 60%)", maskImage: narrow ? "none" : "linear-gradient(to right, #000 0, #000 32%, transparent 58%)", WebkitMaskImage: narrow ? "none" : "linear-gradient(to right, #000 0, #000 32%, transparent 58%)" }} />
      <div ref={vig} className="absolute inset-0" style={{ opacity: 0.35, background: "radial-gradient(ellipse 80% 75% at 55% 50%, transparent 35%, rgba(6,4,12,.85) 100%), linear-gradient(to bottom, rgba(6,4,12,.5), transparent 20%, transparent 74%, rgba(6,4,12,.55))" }} />
    </div>
  );
}
