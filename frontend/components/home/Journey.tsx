"use client";
import { ArrowUpRight, Server } from "lucide-react";
import { cn } from "@/components/ui";
import { Chapter, Kicker, LinkBtn, Looking, Poster, Term, Wrap } from "./parts";
import { Claim, Draw, Enter, Scan, SignIn, Sealed, Waiting } from "./mocks";

type Step = { t: string; you: string; behind: React.ReactNode; mock: React.ReactNode; link?: [string, string] };
const STEPS: Step[] = [
  { t: "Sign in with your phone", you: "You type your phone number and the code we text you.", mock: <SignIn />, link: ["/login", "Open the real sign-in"],
    behind: <>Your number is checked once, <b className="text-ink">before the cutoff</b>. Only verified people can ask for a ticket at all, and one login is one person.</> },
  { t: "Doors open: the waiting room", you: "You wait in the room. There is nothing to refresh and nobody to race.", mock: <Waiting />, link: ["/#shows", "See the shows"],
    behind: <>The sale opens at a set time. Arriving in second 1 or minute 59 gives the <b className="text-ink">same chance</b>, so speed is worthless.</> },
  { t: "Scan: make your secret ticket", you: "You press one button. Your browser makes a ticket nobody else has.", mock: <Scan />,
    behind: <>Your browser makes a secret ticket and <Term word="blinds it" plain="seals it in an opaque envelope" />. The server signs the envelope without seeing inside: it knows the ticket is real, but not whose it is. <span className="text-[#cfc7e6]">(technical name: blind signature)</span></> },
  { t: "Enter with the ticket", you: "You press Enter and get a signed receipt. That is your proof you are in.", mock: <Enter />, link: ["/#shows", "Pick a show to enter"],
    behind: <>The server checks the signature, that the ticket is unused and the sale is open, then records <b className="text-ink">one entry</b>: 1 login, 1 ticket, 1 seat at most. Sending it twice returns the same receipt.</> },
  { t: "Sale closes: the list is sealed", you: "Entry stops. The final list is locked and its fingerprint appears on screen.", mock: <Sealed />, link: ["/verify", "See a sealed list"],
    behind: <>Every entry is combined into one <Term word="fingerprint" plain="technical name: Merkle root" /> and published <b className="text-ink">before</b> the draw. Change one entry and the fingerprint changes.</> },
  { t: "The draw anyone can re-run", you: "Winners appear. You can re-run the whole draw in your own browser.", mock: <Draw />, link: ["/verify", "Re-run a draw"],
    behind: <>A secret <Term word="seed" plain="a random number committed in advance" /> plus public randomness gives every entry a score, and the lowest scores win. Same list + same seed = same winners on any computer.</> },
  { t: "Claim your seat", you: "If you won, you claim within a short window and get a QR ticket.", mock: <Claim />, link: ["/#shows", "Find your show"],
    behind: <>A seat belongs to a <b className="text-ink">place in the draw</b>, not to whoever clicks first. If a winner does not claim in time, the next person on the waiting list gets it.</> },
];

export default function Journey() {
  return (
    <Chapter id="journey" idx={3} className="py-24 md:py-32">
      <Wrap>
        <div className="grid items-end gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <Kicker n="03" label="The fan's journey" time="1:20" tone="violet" />
            <Poster className="mt-4">What a real fan<br />does, <span className="text-ice">step by step.</span></Poster>
          </div>
          <Looking>A storyboard of {STEPS.length} screens. On the left or right, a miniature of the real screen (drawn here with example data). Underneath, what the system quietly does behind it. The light tunnel behind the page is the fan walking through the gates.</Looking>
        </div>

        <ol className="mt-16 space-y-16 md:space-y-24">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative grid items-center gap-6 lg:grid-cols-2 lg:gap-14" data-reveal>
              <div className={cn("relative", i % 2 === 1 && "lg:order-2")}>
                <div className="display pointer-events-none absolute -top-10 -z-10 select-none text-[9rem] leading-none text-ink/[.12] md:-top-14 md:text-[12rem]">{String(i + 1).padStart(2, "0")}</div>
                <div className="relative mx-auto max-w-md">{s.mock}</div>
              </div>
              <div className={cn("solid rounded-[6px] space-y-5 p-6 md:p-8", i % 2 === 1 ? "lg:order-1 lg:text-right" : "")}>
                <div className={cn("eyebrow flex items-center gap-3 text-gold", i % 2 === 1 && "lg:justify-end")}><span className="font-bold">Step {i + 1} of {STEPS.length}</span><span className="h-px w-8 bg-gold/50" />{i === STEPS.length - 1 ? "you are in" : "next"}</div>
                <h3 className="display text-[clamp(2rem,4.2vw,3.5rem)]">{s.t}</h3>
                <p className="text-[19px] leading-snug text-ink md:text-[20px]">{s.you}</p>
                <div className={cn("flex gap-3 rounded-[5px] border border-violet/25 bg-[#171126] p-4 text-left text-[17px] leading-relaxed text-ink", i % 2 === 1 && "lg:ml-auto")}>
                  <Server className="mt-0.5 h-5 w-5 shrink-0 text-violet" aria-hidden />
                  <p><span className="eyebrow mb-1 block text-violet">Behind the scenes</span>{s.behind}</p>
                </div>
                {s.link && <div className={cn(i % 2 === 1 && "lg:text-right")}><LinkBtn href={s.link[0]} size="sm" variant="secondary">{s.link[1]}<ArrowUpRight className="h-3.5 w-3.5" /></LinkBtn></div>}
              </div>
            </li>
          ))}
        </ol>
      </Wrap>
    </Chapter>
  );
}
