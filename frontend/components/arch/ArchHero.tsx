"use client";
// Lazy 3D hero with a DOM fallback (the existing 2D map) when WebGL is missing, the context is lost, or the scene throws.
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import ArchMap from "./ArchMap";

const Box = ({ children }: { children: ReactNode }) => <div className="flex h-[620px] items-center justify-center rounded-md border border-line bg-panel text-[15px] text-ink md:h-[600px]">{children}</div>;
const Hero3D = dynamic(() => import("./Hero3D"), { ssr: false, loading: () => <Box>Loading the 3D view...</Box> });

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

export default function ArchHero() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try { const c = document.createElement("canvas"); setOk(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setOk(false); }
  }, []);
  const fallback = (
    <div className="space-y-3">
      <p className="text-[15px] text-ink">The 3D view needs WebGL, which this browser is not offering. Here is the same road as a flat map.</p>
      <ArchMap />
    </div>
  );
  if (ok === null) return <Box>Loading the 3D view...</Box>;
  if (!ok) return fallback;
  return <Boundary fallback={fallback}><Hero3D onFail={() => setOk(false)} /></Boundary>;
}
