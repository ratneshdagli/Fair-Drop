# Judge walkthrough: 4 minutes, start to end

**Before the judges sit down (2 minutes, once):** `docker compose up -d`, then `docker exec fd-nginx nginx -s reload`. Open **two browser tabs** on http://localhost:8088.
- Tab 2: go to `/live`, sign in (`admin` / `admin-demo-pass`), press **Run the 4-minute show**. The sale takes about 5 minutes, so start it now and it will be mid-action when you switch to it.
- Tab 1: stay on `/` (the presentation).

**The rule to say out loud:** *one login = one entry = at most one seat.* In the old first-come sale one account can take up to 4 seats; in the simple lottery every request is a ticket.

| time | where | do this | say this |
|---|---|---|---|
| 0:00 | Tab 1 `/` hero | Scroll slowly. | "500 seats, 50,000 fans, and bots that click faster than humans." |
| 0:40 | the bots chapter | Hover two or three bots (Speed bot, Identity farm). | "Eleven kinds of attacker. Each card says what the bot controls and what it can never control." |
| 1:20 | the fan's journey | Scroll through the steps. | "Show ID once, get one ticket without the server seeing it, enter, the list is sealed, the draw is public, then claim." |
| 2:00 | three methods | Point at the three posters. | "First-come: speed wins. Lottery: more requests mean more tickets. Fair Drop: one login, one ticket." |
| 2:40 | what we do | Scroll the protection layers and the stage strip. | "Each request meets these checks in order. Defences keep the site alive; they never decide who wins." |
| 3:00 | **Switch to Tab 2 `/live`** | Show the three doors, then the verdict bars. | "Same crowd, same 500 seats, three doors. Bots are red diamonds, people are blue circles." |
| 3:20 | `/live` further down | Hover a bot card; open **Follow one person**; glance at the traffic log. | "Every line is a real web request recorded by the server. This one account tried twice and was refused the second time." |
| 3:40 | `/architecture` | Press **A fan enters the draw**, then **Live**. | "Gateway spreads requests over three servers; Redis is the fast path; Postgres is the permanent record." |
| 3:50 | `/verify` or `/admin` | Open `/verify` (re-run a draw in your own browser) or the control room. | "Don't trust us: check it yourself." |

**Honest limits to mention if asked:** someone who owns many real verified accounts still gets one entry per account (cost is the only brake); most simulated people use a test shortcut for the ticket; measured on one laptop.
