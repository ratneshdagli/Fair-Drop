# Fair Drop: design brief ("Doors Open")

Every screen of the web app follows this. It is a **concert night**, not a SaaS dashboard: stage black, spotlight gold, laser colours, poster type, ticket stubs. Judges should feel they walked into a show and can *watch the booking happen*.

## The idea in one line
A sold-out concert, three ways of letting people in. Every screen answers: **who is at the door, what is the door checking, who got a seat, and can I see it happen?**

## Colour tokens (Tailwind classes exist: `bg-gold`, `text-hot`, `border-line` …)
| token | hex | meaning (use ONLY for this meaning) |
|---|---|---|
| `bg` | `#07050d` | stage black (page) |
| `panel` / `panel2` | `#0f0b1a` / `#171126` | surfaces, one step up each |
| `line` | `#2b2342` | hairlines |
| `ink` / `mute` | `#f4f0ff` / `#9a90b8` | text / secondary text |
| `gold` | `#ffc233` | **Fair Drop**, the golden ticket, primary buttons, headline accent |
| `hot` | `#ff3b5c` | **old first-come-first-served way**, bots, danger, refusals |
| `violet` | `#8b6cff` | **simple lottery**, sealed / cryptographic things, ambient stage light |
| `ice` | `#7fd8ff` | **real people** |
| `lime` | `#b8ff4a` | let in, winner, check passed, "OK" |
| `warn` | `#ff8a3d` | caution, slowed, decoy |
Old class names still compile and are re-mapped: `accent`=gold, `accent2`=violet, `ok`=lime, `bad`=hot. Prefer the new names in new code.
Bots keep their per-kind colour from `components/admin/botinfo.ts`, shown through `<BotGlyph />` (never emoji in chrome).
Three methods are always coloured **old way = hot, simple lottery = violet, Fair Drop = gold**, on every screen, forever.

## Type
- **Display**: `font-display` (Anton), UPPERCASE, `leading-[.9]`, huge. Headlines, big numbers, marquee. Use the `.display` class.
- **Text**: Instrument Sans (default `font-sans`). 15-16px body. Plain language, short sentences.
- **Data / labels**: `font-mono` (JetBrains Mono), uppercase, tracking `.18em`, 11-12px for eyebrows (`.eyebrow`), tabular numbers for counters (`.num`).
No gradient-text headlines except the single hero line on the landing page. No Inter, no system-ui look.

## Shape and surface
- Corners are small (4-6px). Tickets (`.ticket`) have notched side cut-outs and a dashed perforation (`.perf`). Panels (`.panel`) are 1px hairline boxes on near-black, no gradient borders, no big soft shadows.
- Depth comes from **light**: spotlight beams (`.beams`), glows (`.glow-gold|hot|violet|lime`), a fixed film-grain overlay (already on `body`).
- Sections are separated by marquee bars (`<Marquee>`) and big numbered kickers ("01 / THE DOOR"), not by identical rounded cards in a 3-column grid. Vary rhythm: full-bleed bands, a tall hero, an asymmetric split, a dense instrument panel.
- Icons: `lucide-react` only. **No emoji in UI chrome** (✔ ✘ → ⏸ 🖥 etc. are banned). Status = LED dot (`<Led tone>`) + word.

## Motion
- Ambient: slow beam sweep, LED pulse, marquee. Interaction: 150-250ms ease-out, transform/opacity only.
- Numbers tick (use `<Counter>`), dots/seats animate with canvas or GSAP, never layout-thrash.
- Landing story uses Lenis + GSAP ScrollTrigger + R3F; everything else CSS/canvas.
- ALWAYS honour `prefers-reduced-motion` (`.beams` and `.marquee-track` already stop; canvases must check `matchMedia`).
- Canvas/rAF effects must pause when the tab is hidden and clean up on unmount.

## Copy rules (standing rule from the owner)
Plain words anyone understands. Say "real people", "bots", "seats", "the door", "the list is sealed", "the draw". Never unexplained jargon on first sight (Merkle, RSA, commit-reveal): put the technical name in a `title=` tooltip or a small "how" line. Never claim more than is true: **Fair Drop caps entries per verified person; it does not stop someone who owns many real verified accounts.** Numbers on screen come from the live data, never typed in.

## Responsive and a11y
- Mobile first for fan pages (390px). `/live` and `/admin` are desktop-first but must not break below 1024px (stack, scroll inside panels).
- Text contrast AA on `bg`/`panel`. Visible focus ring (gold). Buttons are `<button>`, links are `<a>`/`Link`, icon-only buttons need `aria-label`. Hover-only info must also work on focus/tap.

## Layout shells (`components/Shell.tsx`)
- `/` landing: full-bleed, the page controls its own width.
- `/live`: full-bleed "screen" for a second monitor; compact nav.
- `/admin`: wide (`max-w-[1700px]`) with its own left rail.
- everything else: centred `max-w-6xl`.

## Shared kit (do not fork, extend through props)
`components/ui.tsx`: `cn Button Card CardTitle Input Select Label Badge StateBadge STAGE stageName Callout Stat Tabs Spinner Hash useCountdown fmtDur Timeline` + new `Eyebrow Led Counter Marquee Stub SectionHead`.
`components/BotGlyph.tsx`: `<BotGlyph id="SPEED_BOT" size={16} />` icon in the bot's colour (also `HUMAN`).
Data: `lib/arena.ts` (`useArena()` = the one live model), `lib/api.ts`, `lib/fdcrypto.ts`. Do not change their behaviour.

## The 4-minute rule (owner's words: "everything should be self-explanatory")
The whole product is shown to judges as a **4-minute presentation**, by someone who may not be in the room. A person who knows nothing must understand, from the screens alone: **who the bots are, what the fan's journey is, the three ways of handing out seats, what Fair Drop does and how, and the data that proves it.** Therefore on EVERY screen:
1. **A one-line "what you are looking at"** under the title, in plain words.
2. **A legend** wherever colours/shapes/dots appear (ice circle = real person, hot diamond = bot, lime = let in, hot = turned away, warn = caught by the decoy trap).
3. **A narrator line** wherever something is happening live: a sentence that says what is happening *now* ("1,200 people are in the queue. The door is checking each one's ID.").
4. **Labels are words, not codes.** Use bot names from `botinfo.ts` ("Speed bot"), never `SPEED_BOT`. Stage names via `stageName()`.
5. Every number says **what it counts** (a tiny caption) and **where it comes from** when it is not obvious ("live from the server", "exact result of the finished test", "measured in our test of 14 Oct", "calculated").
6. Order of every story: **problem → who the attackers are → what a fan does → three methods → what we do and how → proof → honest limits.**
Presentation timeline the landing page is built around (shown as a small timer rail): 0:00 problem · 0:40 the bots · 1:20 the fan's journey · 2:00 three methods · 2:40 what we do · 3:20 proof · 3:50 limits & try it.

## Working rules for agents building parts of this
- You own ONLY the files listed in your brief. Do not edit `app/globals.css`, `components/ui.tsx`, `components/Nav.tsx`, `components/Shell.tsx`, `app/layout.tsx`, `components/BotGlyph.tsx`, `lib/api.ts`, `lib/fdcrypto.ts`, `DESIGN.md`. Need a shared change? Say so in your final report; work around it locally (Tailwind classes or a local `<style>`).
- Do NOT run `next build` or `npm install` (agent A may install). Typecheck with `npx tsc --noEmit -p .` from `frontend/` and fix errors in YOUR files only (others are mid-edit).
- A dev server with hot reload is already running at **http://localhost:3000** (API proxied to the Docker stack on :8088). Admin sign-in: `admin` / `admin-demo-pass`. Attack-engine test key: `test-key-demo`. Look at your work in the built-in browser: open YOUR OWN tab with `mcp__Claude_Browser__tabs_create`, always pass your `tabId`, never touch other tabs, size 1440x900 for desktop and also check 390px. (Canvas/animation can look frozen in a hidden pane: judge motion from code, layout from screenshots.)
- Keep the data logic that works (polling, crypto, API calls, the honesty checks). You are replacing the **look, layout, copy and structure**, not the behaviour. Never type a result number that should come from live data.
- No emoji in UI. No generic "three identical icon cards" rows. No teal-on-navy. Read DESIGN.md again if unsure.
- Never add attribution lines anywhere. There is no git repo here; do not run git.
- Final report to me: files created/deleted, what you verified (with screenshots checked), known gaps. Keep it short.

## THE TICKET RULE (decided by the owner; must be stated plainly on every relevant screen)
**One login = one entry = at most one seat.** (Owner considered "one login, five tickets" and left the choice to us. We chose ONE: five per login would change the sealed list, the proofs and every measured result, and it would hand an identity farm five times the seats per bought account.)
Contrast, from the real code: the **old first-come-first-served sale lets one account buy up to 4 seats** (`MAX_PER_ACCOUNT`, default 4, "like real ticketing"). The **simple lottery counts every request as a ticket**, so a bot sending 100 requests holds 100 tickets. Fair Drop caps all of that at 1.
Say it as: "1 login · 1 ticket · 1 seat at most".

## "Who controls what" must be explicit (owner request)
Wherever a bot or a method is shown, state in plain words: **what the bot controls** (how many accounts it owns, how fast and how many requests it sends, which internet addresses it uses, whether it avoids the decoy, when it fires) and **what it can never control** (its place in the draw, a second entry for one account, the sealed list, the draw seed). And wherever the system is shown running, state **what the backend is doing right now** in plain words, by stage: SCHEDULED = waiting, nothing accepted yet; OPEN = the gateway spreads requests over 3 servers, each checks ID + rate limit + one-ticket-per-person, signs the ticket without seeing it, records the entry in Redis; CLOSED = new entries refused, the list is frozen; LOCKED = the worker builds the sealed fingerprint (Merkle root) of every entry and publishes it BEFORE the seed is revealed; DRAWN = the seed is revealed, the server ranks all entries, anyone can re-run it; CLAIM = winners claim within a window, unclaimed seats pass down the waiting list; SETTLED = finished, record is permanent in Postgres. Never invent live numbers for this: derive them from the data you have.
