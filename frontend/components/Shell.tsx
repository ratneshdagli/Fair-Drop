"use client";
import { usePathname } from "next/navigation";
import { Marquee } from "./ui";

// Page frame. "/" and "/live" are full-bleed (the page owns its width), "/admin" is wide, everything else is a centred column.
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  if (path === "/" ) return <main>{children}<Footer /></main>;
  if (path.startsWith("/live")) return <main className="px-3 py-3 md:px-5">{children}</main>;
  if (path.startsWith("/admin")) return <><main className="mx-auto max-w-[1700px] px-4 py-5 md:px-6">{children}</main><Footer /></>;
  return <><main className="mx-auto max-w-6xl px-4 py-8 md:py-12">{children}</main><Footer /></>;
}

function Footer() {
  return (
    <footer className="mt-16">
      <Marquee items={["One verified person, one entry", "Speed, volume and IP hopping buy no extra odds", "The list is sealed before the draw", "Anyone can re-run the draw", "Demo: phone check simulated, payments mock"]} />
      <div className="mx-auto max-w-[1700px] px-4 py-6 text-xs leading-relaxed text-mute md:px-6">
        <b className="text-ink">Fair Drop is a hackathon demo.</b> The phone check is simulated and payments are mock. We claim: network speed, request volume and IP rotation do not change your odds.
        We do <b className="text-ink">not</b> claim that bots cannot exist, or that buying many real verified identities is impossible: each bought identity still gets only one entry.
      </div>
    </footer>
  );
}
