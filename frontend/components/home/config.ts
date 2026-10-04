// Constants of the DESIGN of our test show and one recorded result. None of these is live data.
import { SEATS } from "@/lib/arena";

export const CONFIG = {
  seats: SEATS,   // seats in the test show (lib/arena.ts, same constant the live screens use)
  fans: 50000,    // verified accounts the attack engine seeds (attack_engine/config.py POPULATION)
};

// Recorded result of experiment 2 "Proxy flood" (README results table, raw data in reports/). Not live: the live screen shows fresh runs.
const operators = 20, identitiesEach = 10;
export const PROXY_FLOOD = {
  botAccounts: operators * identitiesEach,
  botCrowdPct: ((operators * identitiesEach) / CONFIG.fans) * 100, // = 0.4
  oldBotSeatPct: 20, fairBotSeatPct: 0.4, fairAdvantage: 0.95,
  get oldAdvantage() { return Math.round(this.oldBotSeatPct / this.botCrowdPct); }, // = 50
  label: `recorded in our "Proxy flood" test: ${operators} bot operators x ${identitiesEach} accounts among ${CONFIG.fans.toLocaleString("en-US")}`,
};
