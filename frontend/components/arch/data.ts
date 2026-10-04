// Everything the architecture page draws, in one place. Every fact here comes from docs/ARCHITECTURE.md, docs/ARCHITECTURE_DECISIONS.md,
// docs/DEPENDENCIES.md, docker-compose.yml and infra/nginx/nginx.conf. Nothing here is a live number.
import { BOT_ORDER } from "@/components/admin/botinfo";

export type Tone = "gold" | "hot" | "violet" | "ice" | "lime" | "warn" | "mute";
export const HEX: Record<Tone, string> = { gold: "#ffc233", hot: "#ff3b5c", violet: "#8b6cff", ice: "#7fd8ff", lime: "#b8ff4a", warn: "#ff8a3d", mute: "#9a90b8" };

/** The map is drawn on a fixed 1400 x 860 grid and scaled to fit. */
export const W = 1400;
export const H = 860;

export type NodeId = "fan" | "web" | "nginx" | "api" | "api1" | "api2" | "api3" | "redis" | "worker" | "pg" | "attack" | "prom" | "graf";

export type NodeDef = {
  id: NodeId; x: number; y: number; w: number; h: number; tone: Tone;
  name: string; tech: string; role: string; tip: string;
  bullets?: string[]; rule?: string; layer: string;
};

export const NODES: NodeDef[] = [
  { id: "fan", x: 24, y: 40, w: 226, h: 190, tone: "ice", layer: "Visitors", name: "Fan's browser", tech: "runs the website's code",
    role: "Hides the ticket secret, checks receipts and proofs, re-runs the draw by itself.", rule: "One login, one secret ticket.",
    tip: "A real person's device. The clever maths happens here, so nobody has to trust the servers." },
  { id: "attack", x: 24, y: 560, w: 226, h: 230, tone: "hot", layer: "Visitors", name: "Attack engine", tech: "Python · Locust · :9200",
    role: `Plays thousands of simulated fans and ${BOT_ORDER.length} kinds of bots, then judges every decision.`,
    tip: "Our own test rig. It attacks the system and, independently, grades every answer it gets." },
  { id: "web", x: 330, y: 20, w: 230, h: 130, tone: "lime", layer: "Website", name: "Website server", tech: "Next.js 16 · React 19",
    role: "Sends the pages and the code the browser runs. Nothing else.",
    tip: "Serves pages only. It never sees a ticket, a login or an entry." },
  { id: "nginx", x: 330, y: 300, w: 230, h: 260, tone: "gold", layer: "Gateway", name: "Gateway", tech: "nginx 1.27 · :8088",
    role: "The one front door. Sends each request where it belongs.",
    bullets: ["/ to the website", "/api to the 3 servers", "/attack to the test rig", "Refuses oversized bodies", "Drops silent connections", "Retries on another server"],
    rule: "Keeps the door open. Never decides who gets in.",
    tip: "A load balancer: it spreads requests over three servers and retries on another if one fails." },
  { id: "api", x: 640, y: 20, w: 300, h: 630, tone: "violet", layer: "API servers", name: "API servers x3", tech: "Go · chi · stateless",
    role: "Three identical copies of one program. Any server can answer any request.",
    rule: "Asks: has this login already got a ticket? One atomic yes/no in Redis.",
    tip: "Identical and stateless: kill one and the other two carry on." },
  { id: "api1", x: 660, y: 66, w: 260, h: 110, tone: "violet", layer: "API servers", name: "api-1", tech: "Go · REPLICA_ID api-1",
    role: "Same code as the others. No memory of its own.", tip: "One of three identical servers." },
  { id: "api2", x: 660, y: 196, w: 260, h: 110, tone: "violet", layer: "API servers", name: "api-2", tech: "Go · REPLICA_ID api-2",
    role: "Same code as the others. No memory of its own.", tip: "One of three identical servers. The test rig can kill this one on purpose." },
  { id: "api3", x: 660, y: 326, w: 260, h: 110, tone: "violet", layer: "API servers", name: "api-3", tech: "Go · REPLICA_ID api-3",
    role: "Same code as the others. No memory of its own.", tip: "One of three identical servers." },
  { id: "redis", x: 1060, y: 30, w: 316, h: 260, tone: "ice", layer: "Data", name: "Redis", tech: "Redis 7 · in memory",
    role: "The fast lane. Every ticket and every entry lands here first.",
    bullets: ["Atomic Lua scripts", "One clock: TIME", "Sorted sets", "Streams"],
    rule: "Answers the yes/no in one indivisible step.",
    tip: "Fast, in-memory. Each decision runs as one step nothing can interrupt." },
  { id: "worker", x: 1060, y: 340, w: 316, h: 150, tone: "violet", layer: "Data", name: "Worker", tech: "Go · background",
    role: "Runs the timers. Seals the list, runs the draw, copies the record into Postgres.",
    rule: "Seals the list before the seed is revealed.",
    tip: "Not reachable by fans. It moves the sale through its stages and keeps the permanent record." },
  { id: "pg", x: 1060, y: 550, w: 316, h: 150, tone: "ice", layer: "Data", name: "Postgres", tech: "Postgres 16 · permanent",
    role: "The permanent record: entries, results and a hash-chained audit log.",
    rule: "A second, independent check of the same rule.",
    tip: "The permanent record. A fan's entry never waits for it." },
  { id: "prom", x: 640, y: 740, w: 300, h: 100, tone: "mute", layer: "Watching", name: "Prometheus", tech: "scrapes api 1-3 and the worker",
    role: "Collects every server's counters.", tip: "Watches the servers. Never part of a request." },
  { id: "graf", x: 1060, y: 740, w: 316, h: 100, tone: "mute", layer: "Watching", name: "Grafana", tech: "dashboard · :3001",
    role: "Draws those counters as charts.", tip: "Charts only. Opens at localhost:3001." },
];
export const NODE: Record<string, NodeDef> = Object.fromEntries(NODES.map((n) => [n.id, n]));

export const MODULES = ["Login & ID check", "Ticket issuer", "Entry", "Rate-limit guard", "Sale lifecycle", "Draw", "Claim", "Old-way baseline", "Ledger"];

export type EdgeDef = { id: string; pts: [number, number][]; label?: string; at?: [number, number]; tone?: Tone };
const trunk = (id: string, m: number, xr: number, yr: number): EdgeDef => ({ id, pts: [[920, m], [xr, m], [xr, yr], [1060, yr]] });
export const EDGES: EdgeDef[] = [
  { id: "fan_nginx", pts: [[250, 140], [290, 140], [290, 360], [330, 360]], label: "page & /api calls", at: [290, 252] },
  { id: "nginx_web", pts: [[445, 300], [445, 150]], label: "/ pages", at: [445, 225] },
  { id: "atk_nginx", pts: [[250, 700], [445, 700], [445, 560]], label: "/api/* from the test rig", at: [347, 683] },
  { id: "nginx_atk", pts: [[330, 520], [290, 520], [290, 610], [250, 610]], label: "/attack", at: [290, 566] },
  { id: "nginx_api1", pts: [[560, 430], [600, 430], [600, 121], [660, 121]], label: "/api/*", at: [600, 430] },
  { id: "nginx_api2", pts: [[560, 430], [600, 430], [600, 251], [660, 251]] },
  { id: "nginx_api3", pts: [[560, 430], [600, 430], [600, 381], [660, 381]] },
  { ...trunk("api1_redis", 121, 960, 90), label: "tickets & entries", at: [1000, 62] },
  trunk("api2_redis", 251, 985, 160),
  trunk("api3_redis", 381, 1010, 230),
  { id: "api3_pg", pts: [[920, 410], [1030, 410], [1030, 625], [1060, 625]], label: "accounts & results", at: [1030, 520] },
  { id: "redis_worker", pts: [[1218, 290], [1218, 340]], label: "audit stream", at: [1218, 315] },
  { id: "worker_pg", pts: [[1218, 490], [1218, 550]], label: "hash-chained record", at: [1218, 520] },
  { id: "api_prom", pts: [[790, 650], [790, 740]], label: "metrics", at: [790, 695] },
  { id: "prom_graf", pts: [[940, 790], [1060, 790]], label: "dashboards", at: [1000, 772] },
];
export const EDGE: Record<string, EdgeDef> = Object.fromEntries(EDGES.map((e) => [e.id, e]));

// ───────────────────────── explainer scenarios ─────────────────────────
/** One stream of dots. `e` is a chain of edge ids; a leading "-" walks that edge backwards. */
export type Flow = { e: string[]; c: Tone; s?: "c" | "d"; fail?: boolean; heavy?: boolean };
export type Step = { title: string; text: string; nodes: NodeId[]; flows: Flow[]; down?: NodeId[] };
export type Scenario = { id: string; label: string; blurb: string; tone: Tone; steps: Step[] };

export const SCENARIOS: Scenario[] = [
  {
    id: "fan", label: "A fan enters the draw", tone: "ice", blurb: "One real person, from opening the page to holding a receipt.",
    steps: [
      { title: "The fan opens the website", text: "The browser asks the gateway for the page. The gateway forwards it to the website server, which sends back the page and the code the browser will run.", nodes: ["fan", "nginx", "web"],
        flows: [{ e: ["fan_nginx", "nginx_web"], c: "ice" }, { e: ["-nginx_web", "-fan_nginx"], c: "lime" }] },
      { title: "The browser makes a secret ticket and hides it", text: "Before anything is sent, the browser makes a random secret and blinds it, like sealing it in an envelope. The server will sign it without ever seeing it. Nothing travels yet.", nodes: ["fan"], flows: [] },
      { title: "It asks for a ticket", text: "The fan sends the sealed ticket and the login to the gateway. The gateway takes turns between the three servers; this time it is api-1.", nodes: ["fan", "nginx", "api1"],
        flows: [{ e: ["fan_nginx", "nginx_api1"], c: "ice" }] },
      { title: "The server checks, then signs blind", text: "The rate-limit guard checks the speed (a speed limit, never a judge). Then one atomic question goes to Redis: has this login already got a ticket for this sale? If not, the server signs the sealed ticket without seeing what is inside.", nodes: ["api1", "redis"],
        flows: [{ e: ["api1_redis"], c: "gold" }] },
      { title: "The signed ticket comes back", text: "The signature travels back through the gateway. The browser removes the envelope and now holds a valid ticket that nobody can link to the login.", nodes: ["redis", "api1", "nginx", "fan"],
        flows: [{ e: ["-api1_redis", "-nginx_api1", "-fan_nginx"], c: "gold" }] },
      { title: "It enters, with no login attached", text: "The entry carries the ticket but not the login, and may land on a different server (api-3). The server checks its own signature, then Redis does one atomic step: mark the ticket spent, store the entry, add an event to the stream.", nodes: ["fan", "nginx", "api3", "redis"],
        flows: [{ e: ["fan_nginx", "nginx_api3", "api3_redis"], c: "ice" }] },
      { title: "A signed receipt comes back", text: "The fan keeps the receipt. It proves the entry was accepted. The time of arrival is recorded but never used: second one or minute ten, the odds are the same.", nodes: ["redis", "api3", "nginx", "fan"],
        flows: [{ e: ["-api3_redis", "-nginx_api3", "-fan_nginx"], c: "lime" }] },
      { title: "In the background, the record becomes permanent", text: "The worker copies each event from the Redis stream into Postgres, inside a hash chain, so the history cannot be quietly rewritten. The fan never waits for this.", nodes: ["redis", "worker", "pg"],
        flows: [{ e: ["redis_worker", "worker_pg"], c: "violet" }] },
    ],
  },
  {
    id: "flood", label: "A bot floods the door", tone: "hot", blurb: "Thousands of requests a second. What the system does, and what it never does.",
    steps: [
      { title: "The attack engine unleashes the bots", text: "Thousands of requests per second: flooding, retrying, hopping between internet addresses. The bots control their speed, volume and addresses. That is all they control.", nodes: ["attack", "nginx"],
        flows: [{ e: ["atk_nginx"], c: "hot", s: "d", heavy: true }] },
      { title: "The gateway guards the door", text: "A body over 64 KB is refused at the door. A connection that goes quiet (the Slowloris trick) is dropped after 10 seconds. Whatever is left is spread over three servers.", nodes: ["nginx", "api1", "api2", "api3"],
        flows: [{ e: ["atk_nginx", "nginx_api1"], c: "hot", s: "d", heavy: true }, { e: ["atk_nginx", "nginx_api2"], c: "hot", s: "d", heavy: true }, { e: ["atk_nginx", "nginx_api3"], c: "hot", s: "d", heavy: true }] },
      { title: "Each server slows the flooder", text: "The rate-limit guard (a bucket per address and per account, kept in Redis) tells the flood 'too many requests'. It exists to keep the site alive for real people. It never picks winners.", nodes: ["api1", "api2", "api3", "redis"],
        flows: [{ e: ["nginx_api1", "api1_redis"], c: "warn", s: "d", heavy: true }, { e: ["nginx_api2", "api2_redis"], c: "warn", s: "d", heavy: true }, { e: ["nginx_api3", "api3_redis"], c: "warn", s: "d", heavy: true }] },
      { title: "One login is still one entry", text: "However many requests and addresses, Redis gives the same answer: this login has its ticket, or this ticket is already spent. Repeats get the same receipt back. Extras are refused.", nodes: ["redis", "api1", "api2", "api3", "nginx", "attack"],
        flows: [{ e: ["-api2_redis", "-nginx_api2", "-atk_nginx"], c: "hot", heavy: true }, { e: ["-api1_redis", "-nginx_api1", "-atk_nginx"], c: "hot", heavy: true }] },
      { title: "The draw never looks at the flood", text: "The draw ranks the set of accepted entries. Arrival order, request count and address never enter the score. Turning the defences off would not change who wins.", nodes: ["redis", "worker"],
        flows: [{ e: ["redis_worker"], c: "violet" }] },
      { title: "The attack engine judges the result", text: "The test rig also knows which accounts are bots, and re-checks every decision on its own. That is how we can show the result is not just our word.", nodes: ["attack"], flows: [] },
    ],
  },
  {
    id: "die", label: "A server dies mid-sale", tone: "warn", blurb: "api-2 is killed during the sale. Nobody loses an entry.",
    steps: [
      { title: "api-2 is killed", text: "The test rig sends the kill command (POST /test/die) and api-2 stops dead with exit code 137, while fans are mid-request.", nodes: ["api2", "attack"], down: ["api2"], flows: [] },
      { title: "A request arrives for api-2", text: "The gateway had picked api-2. The connection fails within one second (the connect timeout).", nodes: ["fan", "nginx", "api2"], down: ["api2"],
        flows: [{ e: ["fan_nginx", "nginx_api2"], c: "ice", fail: true }] },
      { title: "The gateway tries another server", text: "nginx marks api-2 as failed for two seconds and sends the same request to another server, up to three tries. That is safe because every write is idempotent: the same request twice gives the same receipt, never a second entry.", nodes: ["nginx", "api1", "redis"], down: ["api2"],
        flows: [{ e: ["fan_nginx", "nginx_api1", "api1_redis"], c: "ice" }] },
      { title: "Nothing is lost: servers hold no state", text: "The receipt comes back as normal. Every decision lives in Redis, so no server had to remember anything. The fan never noticed.", nodes: ["redis", "api1", "nginx", "fan"], down: ["api2"],
        flows: [{ e: ["-api1_redis", "-nginx_api1", "-fan_nginx"], c: "lime" }] },
      { title: "Docker restarts api-2", text: "The container is set to restart unless stopped. api-2 comes back, the live monitor goes from DOWN to healthy, and the integrity counters must stay at zero.", nodes: ["api2"], flows: [{ e: ["nginx_api2"], c: "lime" }] },
    ],
  },
  {
    id: "draw", label: "The sale closes and the draw runs", tone: "violet", blurb: "From the last entry to a result anyone can re-check.",
    steps: [
      { title: "The clock runs out", text: "A timer in the worker moves the sale from open to closed through one atomic switch in Redis. A server or an admin could try at the same moment; only one wins. New entries are refused.", nodes: ["worker", "redis"],
        flows: [{ e: ["-redis_worker"], c: "violet" }] },
      { title: "The list is sealed", text: "The worker reads every entry, builds a sealed fingerprint of the whole list (a Merkle tree), and stores and publishes it BEFORE the seed is revealed. Nobody can add, remove or swap an entry any more.", nodes: ["worker", "redis"],
        flows: [{ e: ["redis_worker"], c: "violet" }, { e: ["-redis_worker"], c: "gold" }] },
      { title: "The seed is revealed", text: "The secret seed is revealed. When switched on, a public random value from a round that did not exist at sealing time (drand) is mixed in, so nobody can grind for a lucky seed.", nodes: ["worker"], flows: [] },
      { title: "Every entry is ranked", text: "Ranking is over the set of accepted entries. Arrival time, request volume and address never enter the score. Seats go in rank order; the rest is the waiting list.", nodes: ["worker", "redis"],
        flows: [{ e: ["redis_worker"], c: "violet" }] },
      { title: "The result goes into the permanent record", text: "Winners are written to Postgres, together with what the other two methods (old first-come-first-served, simple lottery) would have done with the very same attempts.", nodes: ["worker", "pg"],
        flows: [{ e: ["worker_pg"], c: "violet" }] },
      { title: "Anyone can re-run the draw", text: "A fan's browser asks for the proof bundle and re-runs the ranking itself. If its answer differs from ours, it says so.", nodes: ["fan", "nginx", "api3", "pg"],
        flows: [{ e: ["fan_nginx", "nginx_api3", "api3_pg"], c: "ice" }, { e: ["-api3_pg", "-nginx_api3", "-fan_nginx"], c: "lime" }] },
    ],
  },
];

// ───────────────────────── sale stages (what the backend does now) ─────────────────────────
export type StageDef = { nodes: NodeId[]; text: string; flows: Flow[] };
export const STAGES: Record<string, StageDef> = {
  SCHEDULED: { nodes: ["nginx", "api", "api1", "api2", "api3", "redis", "worker"], flows: [],
    text: "Waiting. The sale is set up and the servers are ready, but nothing is accepted yet." },
  OPEN: { nodes: ["fan", "attack", "web", "nginx", "api", "api1", "api2", "api3", "redis", "worker", "pg"],
    text: "The gateway spreads requests over 3 servers. Each one checks the ID and the rate limit, makes sure this login has no ticket yet, signs the ticket without seeing it, and records the entry in Redis.",
    flows: [{ e: ["fan_nginx", "nginx_api1", "api1_redis"], c: "ice" }, { e: ["atk_nginx", "nginx_api2", "api2_redis"], c: "hot", s: "d" }, { e: ["atk_nginx", "nginx_api3", "api3_redis"], c: "hot", s: "d" }, { e: ["redis_worker", "worker_pg"], c: "violet" }] },
  CLOSED: { nodes: ["nginx", "api", "api1", "api2", "api3", "redis", "worker"],
    text: "New entries are refused. The list is frozen.",
    flows: [{ e: ["-api1_redis", "-nginx_api1", "-fan_nginx"], c: "hot" }] },
  LOCKED: { nodes: ["worker", "redis", "pg"],
    text: "The worker builds the sealed fingerprint (Merkle root) of every entry and publishes it BEFORE the seed is revealed.",
    flows: [{ e: ["redis_worker"], c: "violet" }, { e: ["-redis_worker"], c: "gold" }] },
  DRAWN: { nodes: ["worker", "redis", "pg", "nginx", "api", "api3", "fan"],
    text: "The seed is revealed, the server ranks all entries, and anyone can re-run it.",
    flows: [{ e: ["worker_pg"], c: "violet" }, { e: ["fan_nginx", "nginx_api3", "api3_pg"], c: "ice" }] },
  CLAIM: { nodes: ["fan", "nginx", "api", "api1", "api2", "api3", "redis", "worker"],
    text: "Winners claim their seat within a window. Unclaimed seats pass down the waiting list.",
    flows: [{ e: ["fan_nginx", "nginx_api1", "api1_redis"], c: "ice" }] },
  SETTLED: { nodes: ["pg", "worker", "graf", "prom"],
    text: "All seats are given out. The record is permanent in Postgres.",
    flows: [{ e: ["worker_pg"], c: "violet" }] },
};

// ───────────────────────── click-a-box detail ─────────────────────────
export type Detail = { what: string; why: string; booking: string; dies: string; never: string; decides: string; notDecides: string };
export const DETAIL: Record<string, Detail> = {
  fan: {
    what: "A fan's web browser, running the code the website server sent.",
    why: "The secrets stay on the fan's own device. The browser makes the secret ticket, hides it, and checks everything the servers send back, so nobody has to take our word for it.",
    booking: "Makes a secret ticket and blinds it, asks for a signature, enters with the signed ticket, stores the receipt, and later checks the receipt and re-runs the whole draw itself.",
    dies: "Nothing on our side. The ticket secret and receipt are kept in the browser's own storage, so a refresh keeps them.",
    never: "Never lets the server see which ticket belongs to which login.",
    decides: "Which show to join, and when to press the button.", notDecides: "Its place in the draw.",
  },
  web: {
    what: "The Next.js server that sends the website's pages and code.",
    why: "Pages are served separately from the booking logic, so showing a page never touches a ticket.",
    booking: "Sends the page and the browser code. The clever work (hiding the ticket, checking proofs) then runs in the browser, not here.",
    dies: "New visitors cannot load pages. People already on the page can still enter, because the API servers are separate.",
    never: "Never sees a ticket, a login or an entry, and holds no data.",
    decides: "What the page looks like.", notDecides: "Who gets in, and who wins.",
  },
  nginx: {
    what: "nginx on port 8088: the gateway and load balancer. The one front door.",
    why: "One public address in front of many servers. It spreads the load, shuts out oversized or silent connections, and hides a dying server from the fan.",
    booking: "Sends / to the website, /api to one of the three servers (taking turns), /attack to the test rig. A request over 64 KB is refused. A connection quiet for 10 seconds is dropped. A failed request is retried on another server, up to three tries.",
    dies: "In this setup it is the single front door, so nobody gets in until it is back (it restarts automatically). A real launch would put a second gateway beside it.",
    never: "No business logic: it never reads a ticket, a login or a result.",
    decides: "Which server gets a request. Whether a body is too big or a connection too slow.", notDecides: "Who gets in. Who wins.",
  },
  api: {
    what: "Three identical Go servers (api-1, api-2, api-3). Each one can answer any request.",
    why: "Tens of thousands of people at once, and any one server may die. Because they keep no state, losing one costs nothing.",
    booking: "Checks the login, applies the rate limit, signs the sealed ticket once per login, accepts the entry and returns a receipt. Also serves the sale's state, seat claims and the proofs anyone can check.",
    dies: "The gateway retries the request on another server and Docker restarts the dead one. Nothing is lost, because every decision is already in Redis.",
    never: "Hold no state of their own, never compare their own clocks (there is one clock: Redis TIME), and never use the rate limit to choose winners.",
    decides: "Is this login new for this sale? Is this ticket genuine and unspent? Is the sale open (by Redis's clock)?", notDecides: "Who wins. The order of the draw.",
  },
  redis: {
    what: "Redis 7, an in-memory database. The fast lane of the system.",
    why: "50,000 people in a few seconds would jam a normal database with locks. In Redis each decision is one atomic script nothing can interrupt, so it is both fast and exact.",
    booking: "Holds the 'one ticket per login' check, the 'one spend per ticket' check, the entry itself, the rate-limit buckets, the sale's stage, the single clock (TIME) and the event stream the worker reads.",
    dies: "The live sale stops accepting entries until it is back. In this demo setup Redis runs without saving to disk, so entries not yet copied into Postgres would be lost. A real launch would add persistence.",
    never: "Not the source of truth after the sale: the permanent record is Postgres.",
    decides: "The atomic yes/no: one ticket per login, one spend per ticket, open or closed.", notDecides: "Who wins. It stores entries; it never ranks them.",
  },
  worker: {
    what: "A background Go process: the same code as the API servers, started in worker mode. Fans cannot reach it.",
    why: "Timers and slow jobs must never run inside a fan's request.",
    booking: "Moves the sale through its stages on time, seals the list, reveals the seed, runs the ranking, and copies every event from the Redis stream into Postgres inside a hash chain.",
    dies: "An admin can still advance the sale (same atomic switch in Redis). On restart it resumes from where it stopped, and the hash chain continues from the last record.",
    never: "Never serves fans, and never reads arrival time or rate limits when ranking.",
    decides: "When a stage changes. The ranking, computed from the sealed list and the seed.", notDecides: "Anything about a single fan. The seed: its hash is published when the list is sealed.",
  },
  pg: {
    what: "Postgres 16: the permanent record.",
    why: "Redis is quick but forgetful. Postgres keeps what must be provable later: the entries, the results, and a hash-chained log where changing one line breaks every line after it.",
    booking: "Receives entries, winners, comparisons with the other two methods, and the audit log. Its unique constraints are a second, independent check of the one-entry rule.",
    dies: "Entering keeps working, because it only touches Redis. Copying to the record waits and catches up afterwards. (This demo trades disk safety for speed.)",
    never: "Never in the entry path, so a slow database cannot slow the door.",
    decides: "Whether a duplicate row is allowed (it is not).", notDecides: "Who wins.",
  },
  attack: {
    what: "Our test rig: a Python / Locust load engine with a control API on port 9200, reached through /attack.",
    why: "We prove our claims by attacking ourselves, and the judge is independent of the code being tested.",
    booking: `Not part of a real booking. In a test it plays the fans and ${BOT_ORDER.length} kinds of bots, then checks every decision against what it knows (for example, 'this account is a bot').`,
    dies: "A test cannot run. Real fans are unaffected.",
    never: "Its bot labels are for grading only: the draw never reads them.",
    decides: "Bots control their speed, volume, internet addresses, how many accounts they own, whether they avoid the decoy, and when they fire.", notDecides: "Their place in the draw. A second entry for one login. The sealed list. The seed.",
  },
  prom: {
    what: "Prometheus: collects each server's counters (the three API servers and the worker) over time.",
    why: "So we can see requests, errors and speed per server, and prove what happened during a test.",
    booking: "Not involved. It reads the servers' /metrics pages on the side.",
    dies: "The charts go blank. The sale carries on.",
    never: "Never in a request's path, and nothing it holds feeds the draw.",
    decides: "Nothing.", notDecides: "Anything.",
  },
  graf: {
    what: "Grafana: the dashboard at port 3001, with a ready-made Fair Drop board fed by Prometheus.",
    why: "A picture of the same counters, for people who would rather watch than read.",
    booking: "Not involved.",
    dies: "The charts go away. The sale carries on.",
    never: "Never changes anything: view only.",
    decides: "Nothing.", notDecides: "Anything.",
  },
};

// ───────────────────────── containers (counted from docker-compose.yml) ─────────────────────────
export const CONTAINERS: { n: string; t: Tone }[] = [
  { n: "nginx", t: "gold" }, { n: "frontend", t: "lime" }, { n: "api-1", t: "violet" }, { n: "api-2", t: "violet" }, { n: "api-3", t: "violet" },
  { n: "worker", t: "violet" }, { n: "redis", t: "ice" }, { n: "postgres", t: "ice" }, { n: "prometheus", t: "mute" }, { n: "grafana", t: "mute" }, { n: "attack", t: "hot" },
];

// ───────────────────────── one entry, start to finish ─────────────────────────
export const HOPS: { k: string; t: string; where: string; tone: Tone }[] = [
  { k: "Fan", where: "Browser", tone: "ice", t: "A signed-in fan picks a show. The browser makes a secret ticket and hides it in an envelope." },
  { k: "/token", where: "Gateway", tone: "gold", t: "The fan asks for a ticket: it sends the hidden ticket and the login, through the gateway to one of the three servers." },
  { k: "Guard", where: "API server + Redis", tone: "warn", t: "A speed limit per address and per account, kept in Redis. It only keeps the site alive for everyone. It never picks winners." },
  { k: "Issue", where: "API server + Redis", tone: "violet", t: "One atomic yes/no in Redis: has this login already got a ticket for this sale? If not, the server signs the hidden ticket without seeing it." },
  { k: "/register", where: "Browser to any server", tone: "ice", t: "The browser removes the envelope and enters with the signed ticket. No login is attached, and any server can take it." },
  { k: "Verify", where: "API server", tone: "violet", t: "The server checks the signature is really its own. A forged or altered ticket stops here." },
  { k: "Register", where: "Redis", tone: "ice", t: "One atomic step: mark the ticket spent, store the entry, add an event to the stream. A ticket can only be spent once." },
  { k: "Receipt", where: "Back to the browser", tone: "lime", t: "A signed receipt returns as proof of entry. Sending the same request again returns the same receipt, never a second entry." },
  { k: "Seal", where: "Worker", tone: "gold", t: "When the sale closes, the worker fingerprints the whole list and publishes it before the seed is revealed. After that nothing can change." },
  { k: "Draw", where: "Worker, then anyone's browser", tone: "gold", t: "The seed is revealed and every entry is ranked. Anyone's browser can re-run the draw and get the same answer." },
];
