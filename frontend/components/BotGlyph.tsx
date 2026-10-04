"use client";
import { Zap, Waves, Repeat, Drama, Factory, Bug, KeyRound, Brain, Crosshair, Target, User, VenetianMask, type LucideIcon } from "lucide-react";
import { BOTS } from "@/components/admin/botinfo";

// One icon per kind of bot, in that bot's colour. Replaces the emoji used before.
const ICON: Record<string, LucideIcon> = {
  SPEED_BOT: Zap, FLOOD_BOT: Waves, RETRY_BOT: Repeat, PROXY_ROTATOR: VenetianMask, SYBIL_OPERATOR: Factory, API_SCRAPER: Bug,
  UI_MIMIC: Drama, CRYPTO_SWARM: KeyRound, SMART_SCRAPER: Brain, STATE_SNIPER: Crosshair, CLAIM_SNIPER: Target, HUMAN: User,
};

export default function BotGlyph({ id, size = 16, className, color }: { id: string; size?: number; className?: string; color?: string }) {
  const I = ICON[id] || Bug;
  return <I aria-hidden width={size} height={size} className={className} style={{ color: color || BOTS[id]?.color }} strokeWidth={2.2} />;
}
