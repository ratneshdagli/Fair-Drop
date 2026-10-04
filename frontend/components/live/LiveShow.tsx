"use client";
// The Booking Theatre: the main live screen. Used full-bleed by /live and (embedded) inside the admin page.
import { useArena } from "@/lib/arena";
import { cn } from "@/components/ui";
import Header from "./Header";
import Narrator from "./Narrator";
import SignIn from "./SignIn";
import Invite from "./Invite";
import Theatre from "./Theatre";
import Verdict from "./Verdict";
import DirectorConsole from "./DirectorConsole";
import FollowFan from "./FollowFan";
import BotWall from "./BotWall";
import TrafficLog from "./TrafficLog";
import Checks from "./Checks";
import ResearchPanel from "./ResearchPanel";

export default function LiveShow({ embedded = false }: { embedded?: boolean }) {
  const a = useArena();
  if (!a.ready) return null;
  if (!a.authed) return <SignIn />;
  const idle = a.phase === "idle";
  return (
    <div className={cn("mx-auto space-y-6 2xl:space-y-8", embedded ? "" : "max-w-[2200px]")}>
      <Header a={a} compact={embedded} />
      <Narrator a={a} compact={embedded} />
      <DirectorConsole a={a} />
      {idle ? <Invite a={a} /> : (
        <>
          <Theatre a={a} compact={embedded} />
          <Verdict a={a} compact={embedded} />
          <FollowFan a={a} />
          <BotWall a={a} />
          <TrafficLog a={a} />
          <Checks a={a} />
          <ResearchPanel a={a} />
        </>
      )}
    </div>
  );
}
