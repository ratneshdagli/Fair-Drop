"use client";
// Backstage pass: the live screen reads the organiser's APIs, so it needs the admin login.
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api, adminToken } from "@/lib/api";
import { Button, Callout, Input, Label, Stub } from "@/components/ui";

export default function SignIn() {
  const [f, setF] = useState({ username: "admin", password: "" });
  const [err, setErr] = useState("");
  const go = async () => { setErr(""); try { const r = await api<any>("/admin/login", { body: f }); adminToken.set(r.token); } catch (e: any) { setErr(e.status === 401 ? "Wrong username or password." : e.message); } };
  return (
    <div className="relative mx-auto max-w-lg pt-10 md:pt-20">
      <div className="beams" />
      <div className="relative z-10 space-y-6">
        <div className="space-y-2 text-center">
          <div className="eyebrow text-gold">Backstage only</div>
          <h1 className="display text-6xl md:text-7xl">Show your <span className="text-gold">pass</span></h1>
          <p className="mx-auto max-w-md text-[15px] text-mute">The live booking screen reads the organiser&apos;s numbers: who is at the door, who got in, who got a seat. So it needs the organiser login.</p>
        </div>
        <Stub accent="gold">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gold"><KeyRound className="h-4 w-4" /><span className="eyebrow text-gold">Organiser login</span></div>
            <div><Label>Username</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
            <div><Label>Password</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && go()} /></div>
            {err && <Callout tone="bad">{err}</Callout>}
            <Button onClick={go} className="w-full" size="lg">Let me in</Button>
            <p className="text-center font-mono text-[11px] uppercase tracking-[.14em] text-mute">demo login: admin / admin-demo-pass (local demo only)</p>
          </div>
        </Stub>
      </div>
    </div>
  );
}
