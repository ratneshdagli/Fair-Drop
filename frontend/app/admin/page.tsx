"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, DoorOpen, FlaskConical, KeyRound, Microscope, LayoutDashboard, Monitor, Radio, Server, ShieldCheck, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { api, adminToken, testKey, usePoll } from "@/lib/api";
import { Button, Callout, Input, Label, Stub, cn } from "@/components/ui";
import StatusBand from "@/components/admin/StatusBand";
import { Mono } from "@/components/admin/kit";
import ResearchSection from "@/components/admin/ResearchSection";
import { Ctx, GuideSection, LabSection, LiveSection, ProofSection, SaleSection, ServerSection, SummarySection } from "@/components/admin/Sections";

// The left rail: seven places, each with a one-line caption.
const RAIL: { id: string; label: string; cap: string; icon: LucideIcon }[] = [
  { id: "live", label: "Live show", cap: "Watch the doors as it happens", icon: Radio },
  { id: "sale", label: "Run a sale", cap: "Open, close, seal, draw", icon: SlidersHorizontal },
  { id: "proof", label: "Proof", cap: "Was it fair? Was it tampered with?", icon: ShieldCheck },
  { id: "server", label: "Server", cap: "Is the website coping?", icon: Server },
  { id: "research", label: "Research", cap: "The scores researchers use, live", icon: Microscope },
  { id: "lab", label: "Test lab", cap: "Send bots, try to break it", icon: FlaskConical },
  { id: "summary", label: "Summary", cap: "The whole picture on one page", icon: LayoutDashboard },
  { id: "guide", label: "Guide", cap: "What every word and test means", icon: BookOpen },
];
const SECTION_KEY = "fd:admin-sec";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [sec, setSec] = useState("live");
  const [pf, setPf] = useState("results");        // sub-tab inside Proof
  const [dropId, setDropId] = useState("");
  const [follow, setFollow] = useState(true);     // follow the newest test sale while a test runs
  const [f, setF] = useState({ username: "admin", password: "" });
  const [err, setErr] = useState("");

  useEffect(() => {
    setAuthed(!!adminToken.get());
    try { setDropId(sessionStorage.getItem("fd:admin-drop") || ""); const s = sessionStorage.getItem(SECTION_KEY); if (s && RAIL.some((r) => r.id === s)) setSec(s); } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (dropId) try { sessionStorage.setItem("fd:admin-drop", dropId); } catch {} }, [dropId]);
  const open = useCallback((id: string) => { setSec(id); try { sessionStorage.setItem(SECTION_KEY, id); } catch {} }, []);
  const go = useCallback((t: string) => {
    if (t === "fair" || t === "audit") { setPf(t === "fair" ? "results" : "audit"); open("proof"); }
    else open(({ arena: "live", show: "live", drops: "sale", live: "server", lab: "lab", home: "summary" } as Record<string, string>)[t] || t);
  }, [open]);

  const { data: drops } = usePoll(() => (authed ? api<any[]>("/admin/drops", { auth: "admin" }) : Promise.resolve(null)), 2500, [authed]);
  const { data: runs } = usePoll(() => (authed ? api<any[]>("/runs", { base: "/attack", headers: { "X-Test-Key": testKey.get() } }) : Promise.resolve(null)), 3000, [authed]);
  const running = !!runs?.find((r) => r.status === "running");

  // with nothing (or a vanished sale) chosen, follow the newest fair sale so every screen has something to show
  useEffect(() => {
    if (!authed || !drops) return;
    if (dropId && drops.some((d) => d.id === dropId)) return;
    const d = drops.filter((x) => x.mode === "fairdrop").sort((x, y) => y.opens_at_ms - x.opens_at_ms)[0] || drops[0];
    setDropId(d ? d.id : "");
  }, [authed, drops, dropId]);
  // while a bot test runs, jump to whichever of its two sales (new way, then old way) is open
  const exp = (drops || []).filter((d) => d.id.startsWith("exp-")).sort((a, b) => b.opens_at_ms - a.opens_at_ms);
  const fairD = exp.find((d) => d.mode === "fairdrop");
  const fcfsD = fairD ? (drops || []).find((d) => d.id === fairD.id.replace("-fairdrop-", "-fcfs-")) : undefined;
  useEffect(() => {
    if (!follow || !running) return;
    const o = [fairD, fcfsD].find((d) => d?.state === "OPEN");
    if (o && o.id !== dropId) setDropId(o.id);
  }, [running, fairD?.state, fcfsD?.state, follow, dropId]);

  const login = async () => {
    setErr("");
    try { const r = await api<any>("/admin/login", { body: f }); adminToken.set(r.token); setAuthed(true); }
    catch (e: any) { setErr(e.status === 401 ? "Wrong username or password." : e.message); }
  };
  if (!ready) return null;

  if (!authed) return (
    <div className="relative mx-auto grid max-w-5xl items-center gap-10 py-8 lg:min-h-[68vh] lg:grid-cols-[1.15fr_1fr]">
      <div className="beams" />
      <div className="relative z-10 space-y-6">
        <Mono className="text-gold">Staff entrance</Mono>
        <h1 className="display text-7xl md:text-8xl">Control<br /><span className="text-gold text-glow-gold">room</span></h1>
        <p className="max-w-lg text-base leading-relaxed text-ink/85">This is where the people running Fair Drop watch the sale and check the evidence. You can run the stages of a sale, watch the doors live, send test bots at it, and verify that nothing was tampered with.</p>
        <ul className="max-w-lg space-y-2.5 text-sm text-ink/85">
          {([[DoorOpen, "Run the stages", "open, close, seal the list, run the draw"], [Radio, "Watch it live", "who is at the door and what the door decides"], [ShieldCheck, "Check the proof", "fairness results and tamper checks"]] as [LucideIcon, string, string][]).map(([I, t, d]) => (
            <li key={t} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-[4px] border border-line bg-panel2 text-gold"><I className="h-4 w-4" /></span><span><b>{t}</b> <span className="text-mute">· {d}</span></span></li>
          ))}
        </ul>
        <p className="max-w-lg border-l-2 border-gold/60 pl-4 text-sm text-mute"><b className="text-ink">Admins run the phases. They cannot pick winners.</b> The draw is decided by a secret committed in advance and the sealed list, not by anyone here.</p>
      </div>
      <Stub accent="gold" className="relative z-10 w-full max-w-md justify-self-center lg:justify-self-end"
        tear={<div className="flex items-start gap-3 text-sm text-mute"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><span>demo login: <b className="font-mono text-ink">admin</b> / <b className="font-mono text-ink">admin-demo-pass</b> <span className="block text-xs">(local demo only)</span></span></div>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); login(); }}>
          <div><div className="display text-3xl">Admin sign-in</div><p className="mt-1 text-sm text-mute">Staff only. Fans book seats on the main site.</p></div>
          <div><Label>Username</Label><Input autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div><Label>Password</Label><Input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          {err && <Callout tone="bad">{err}</Callout>}
          <Button type="submit" size="lg" className="w-full">Enter the control room</Button>
        </form>
      </Stub>
    </div>
  );

  const pick = (id: string) => { setFollow(false); setDropId(id); };
  const ctx: Ctx = { dropId, setDropId, pick, drops: drops || [], running, go, pf, setPf, startFollow: () => setFollow(true) };
  return (
    <div>
      <StatusBand drops={drops} dropId={dropId} onPick={pick} onSignOut={() => { adminToken.clear(); setAuthed(false); }} />
      <div className="grid gap-5 pt-5 md:grid-cols-[60px_minmax(0,1fr)] md:gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Control room sections" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 xl:sticky xl:top-[13.5rem] md:mx-0 xl:max-h-[calc(100vh-14.5rem)] md:flex-col md:self-start md:overflow-visible md:px-0">
          <div className="hidden px-3 pb-2 xl:block"><Mono>Control room</Mono></div>
          {RAIL.map((r) => {
            const on = sec === r.id, I = r.icon;
            return (
              <button key={r.id} onClick={() => open(r.id)} title={`${r.label}: ${r.cap}`} aria-current={on ? "page" : undefined}
                className={cn("group relative flex shrink-0 items-center gap-3 rounded-[4px] border px-2.5 py-2.5 text-left transition duration-150 md:justify-center xl:justify-start xl:px-3",
                  on ? "border-gold/50 bg-gold/10 text-gold glow-gold" : "border-transparent text-mute hover:border-line hover:bg-panel2 hover:text-ink")}>
                <I className="h-5 w-5 shrink-0" strokeWidth={on ? 2.4 : 2} />
                <span className="min-w-0 xl:block md:hidden"><span className={cn("block text-sm font-bold leading-tight", on ? "text-gold" : "text-ink")}>{r.label}</span><span className="hidden text-xs leading-snug text-mute xl:block">{r.cap}</span></span>
                <span className="text-sm font-semibold md:hidden">{r.label}</span>
                {on && <i className="absolute right-3 top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_10px_#ffc233] xl:block" />}
              </button>
            );
          })}
          <Link href="/live" className="mt-3 hidden items-center gap-3 rounded-[4px] border border-line px-3 py-2.5 text-sm text-mute transition hover:border-hot/60 hover:text-ink md:flex md:justify-center xl:justify-start" title="The public live screen, made to be shown on a second monitor">
            <Monitor className="h-5 w-5 shrink-0" /><span className="hidden xl:block"><span className="block font-bold text-ink">Public live screen</span><span className="block text-xs">for a second monitor</span></span>
          </Link>
        </nav>
        <div key={sec} className="fade-in min-w-0 space-y-6 pb-10">
          {sec === "live" && <LiveSection ctx={ctx} />}
          {sec === "sale" && <SaleSection ctx={ctx} />}
          {sec === "proof" && <ProofSection ctx={ctx} />}
          {sec === "server" && <ServerSection ctx={ctx} />}
          {sec === "research" && <ResearchSection />}
          {sec === "lab" && <LabSection ctx={ctx} />}
          {sec === "summary" && <SummarySection ctx={ctx} />}
          {sec === "guide" && <GuideSection ctx={ctx} />}
        </div>
      </div>
    </div>
  );
}
