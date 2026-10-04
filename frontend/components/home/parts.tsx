"use client";
// Small shared pieces for the landing chapters.
import { useEffect, useRef, useState } from "react";
import LinkNext from "next/link";
import { Eye } from "lucide-react";
import { cn } from "@/components/ui";


// Readability layer for every landing chapter. globals.css rules are unlayered and beat Tailwind utilities, so this scoped sheet
// (loaded once, from the hero) lifts eyebrows, muted text and glass panels to AA contrast on the busy 3D scene.
export function LandingStyles() {
  return <style>{`
.lp .eyebrow{font-size:12px;color:#cfc7e6;letter-spacing:.16em}
.lp .eyebrow.text-gold{color:#ffc233}.lp .eyebrow.text-hot{color:#ff6b84}.lp .eyebrow.text-violet{color:#b4a0ff}.lp .eyebrow.text-lime{color:#b8ff4a}.lp .eyebrow.text-ice{color:#7fd8ff}.lp .eyebrow.text-ink{color:#f4f0ff}
.lp .text-mute{color:#cfc7e6}.lp .hash{color:#cfc7e6}
.lp{isolation:isolate}
.lp::before{content:'';position:absolute;inset:-12vh 0;z-index:-1;pointer-events:none;background:linear-gradient(to bottom,transparent 0,rgba(7,5,13,.55) 14%,rgba(7,5,13,.72) 50%,rgba(7,5,13,.55) 86%,transparent 100%)}
.lp .panel-glass,.lp .solid{background:rgba(10,7,20,.9);border:1px solid rgba(255,255,255,.1);-webkit-box-shadow:none}
.lp .panel-glass{font-size:16px}
`}</style>;
}

/** A chapter of the presentation: its index drives the 3D stage, `time` is the talk clock mark. */
export function Chapter({ id, idx, className, children }: { id: string; idx: number; className?: string; children: React.ReactNode }) {
  return <section id={id} data-chapter={idx} className={cn("lp relative scroll-mt-14", className)}>{children}</section>;
}

/** The content column every chapter shares (leaves room for the timer rail on desktop). */
export function Wrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1500px] px-5 md:px-12 md:pr-24", className)}>{children}</div>;
}

/** "02 / THE BOTS  ·  0:40" numbered kicker. */
export function Kicker({ n, label, time, tone = "gold", className }: { n: string; label: string; time?: string; tone?: "gold" | "hot" | "violet" | "lime"; className?: string }) {
  const c = { gold: "text-gold bg-gold/60", hot: "text-hot bg-hot/60", violet: "text-violet bg-violet/60", lime: "text-lime bg-lime/60" }[tone].split(" ");
  return (
    <div className={cn("eyebrow flex flex-wrap items-center gap-x-3 gap-y-1", c[0], className)}>
      <span className="font-bold">{n}</span><span className={cn("h-px w-8", c[1])} /><span>{label}</span>
      {time && <span className="rounded-[3px] border border-line bg-bg/60 px-1.5 py-0.5 text-ink">talk clock {time}</span>}
    </div>
  );
}

/** Poster headline. */
export function Poster({ children, className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("display text-[clamp(2.7rem,8.4vw,7.6rem)]", className)} {...rest}>{children}</h2>;
}

/** The plain "what you are looking at" line (design rule 1). */
export function Looking({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("panel-glass flex max-w-xl items-start gap-3 p-4 text-[16px] leading-relaxed text-ink", className)}>
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
      <p><span className="eyebrow mr-2 text-gold">What you are looking at</span>{children}</p>
    </div>
  );
}

/** Legend for the dots in the 3D scene (design rule 2). */
export function Legend({ className }: { className?: string }) {
  const Item = ({ children, dot }: { children: React.ReactNode; dot: React.ReactNode }) => <span className="flex items-center gap-2">{dot}{children}</span>;
  return (
    <div className={cn("panel-glass flex flex-wrap gap-x-5 gap-y-1.5 px-3.5 py-2.5 font-mono text-[12px] uppercase tracking-[.12em] text-ink", className)}>
      <Item dot={<i className="led text-ice" />}>real person</Item>
      <Item dot={<i className="inline-block h-2 w-2 rotate-45 bg-hot shadow-[0_0_10px_#ff3b5c]" />}>bot</Item>
      <Item dot={<i className="led text-lime" />}>let in</Item>
      <Item dot={<i className="led text-gold" />}>Fair Drop / golden ticket</Item>
      <Item dot={<i className="led text-violet" />}>sealed</Item>
    </div>
  );
}

const lb = "inline-flex items-center justify-center gap-2 rounded-[4px] px-5 py-3 text-sm font-semibold tracking-wide transition duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-gold";
const lbv = {
  primary: "bg-gold text-black shadow-[0_0_0_1px_rgba(255,194,51,.5),0_10px_30px_-10px_rgba(255,194,51,.65)] hover:brightness-110",
  secondary: "border border-line bg-panel2/80 text-ink hover:border-gold/60 hover:text-gold",
  ghost: "border border-transparent bg-bg/50 text-mute hover:text-ink",
  hot: "border border-hot/50 text-hot hover:bg-hot/10",
};
/** A real link (next/link or plain anchor) that looks like a Button, so we never nest a button inside an anchor. */
export function LinkBtn({ href, variant = "secondary", size = "lg", className, children }: { href: string; variant?: keyof typeof lbv; size?: "sm" | "lg"; className?: string; children: React.ReactNode }) {
  const cls = cn(lb, lbv[variant], size === "sm" && "px-3 py-1.5 text-xs", className);
  return href.startsWith("#") ? <a href={href} className={cls}>{children}</a> : <LinkNext href={href} className={cls}>{children}</LinkNext>;
}

/** A technical word with its plain meaning written right beside it. */
export function Term({ word, plain }: { word: string; plain: string }) {
  return <span title={`${word}: ${plain}`}><b className="font-semibold text-ink">{word}</b> <span className="text-mute">({plain})</span></span>;
}

/** True once the element has been on screen (for count-ups). */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}
