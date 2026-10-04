"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { session } from "@/lib/api";
import { cn, Led } from "./ui";

const LINKS = [["/", "The show"], ["/architecture", "Architecture"], ["/#shows", "Book a seat"], ["/verify", "Check a draw"], ["/admin", "Control room"], ["/guide", "Judge's tour"]];

export default function Nav() {
  const path = usePathname() || "";
  const screen = path.startsWith("/live");
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => { setUser(session.get()?.user_id || null); }, [path]);
  const here = (h: string) => (h === "/" ? path === "/" : !h.includes("#") && path.startsWith(h));
  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-bg/80 backdrop-blur-xl">
      <nav className={cn("mx-auto flex items-center justify-between gap-4 px-4 md:px-6", screen ? "h-11" : "h-14 max-w-[1700px]")}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Fair Drop home">
          <span className="grid h-7 w-7 -rotate-6 place-items-center rounded-[3px] bg-gold text-black"><Ticket className="h-4 w-4" strokeWidth={2.6} /></span>
          <span className="display text-[22px] leading-none tracking-wide">Fair<span className="text-gold">Drop</span></span>
        </Link>
        <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[.16em]">
          {LINKS.map(([h, l]) => (
            <Link key={h} href={h} className={cn("hidden rounded-[3px] px-3 py-2 text-mute transition hover:text-ink md:block", here(h) && "text-gold")}>{l}</Link>
          ))}
          <Link href="/live" className={cn("ml-1 flex items-center gap-2 rounded-[3px] border px-3 py-1.5 font-semibold transition", path.startsWith("/live") ? "border-hot bg-hot/15 text-hot" : "border-hot/50 text-hot hover:bg-hot/10")}>
            <Led tone="hot" pulse />Live
          </Link>
          {!screen && (user ? (
            <button className="ml-1 hidden rounded-[3px] border border-line px-3 py-1.5 text-mute hover:text-ink md:block" onClick={() => { session.clear(); setUser(null); location.href = "/"; }} title="sign out">{user.slice(0, 8)}</button>
          ) : (
            <Link href="/login" className="ml-1 rounded-[3px] bg-gold px-3 py-1.5 font-bold text-black hover:brightness-110">Sign in</Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
