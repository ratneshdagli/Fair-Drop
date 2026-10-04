# Research metrics: what we took from the review, and what we did not

An outside review ("resarch_metric") listed how bot-detection systems are scored in industry. Here is every point, what we did with it, and where to see it. The numbers are computed live from each test's own records on the **Live Arena** page, section **How the research scores this**. Nothing is typed in.

| Point in the review | Done? | Where / how |
|---|---|---|
| **False-positive rate at a strict threshold (0.1%)**: blocking a real fan is the worst failure | Yes | Real people wrongly turned away, as a count and a rate. With zero wrong, we report the 95% upper bound (3 / number of good requests, the "rule of three") and say plainly whether the 0.1% target is proven yet (needs about 3,000 good requests). |
| **Precision and recall instead of plain accuracy** (traffic is lopsided) | Yes | Recall (bad requests caught), precision (turned-away requests that deserved it), F1, plain accuracy next to balanced accuracy, and the share of traffic that was bad (class imbalance). Shown for the Fair Drop gate and the old sale. |
| **PR-AUC** | Not applicable | A curve needs a score with a movable threshold. Our gate is a set of fixed rules with one operating point, so we show that point (precision and recall) instead of inventing a curve. |
| **Flow correlation / information distance** (human flash crowd vs bot flood; KL distance; Weibull-style human arrivals) | Yes (simplified) | Per bot kind, from per-second arrivals: busiest second, burstiness (variance / mean), KL distance from the real people's arrival timing, and correlation with the people's timeline. Kinds with fewer than 50 requests say "too few to judge". The simulated people do not follow a measured Weibull law, so this shows the method, not a real crowd. |
| **Mouse dynamics** (M4D dataset, BeCAPTCHA-Mouse, DELBOT-Mouse) | Not used | We never separate bots from people by behaviour. The human mimic gets one entry like a person. Honest cost: a well-disguised bot cannot be blocked, only capped. |
| **Browser fingerprinting** (FingerprintJS, headless-browser checks, ycrawl-bench) | Not used | Same reason: allocation never depends on spotting bots. |
| **Detection of advanced web bots combining logs and mouse biometrics** | Not used | Same reason. |

Why most "not used" rows are fine: Fair Drop does not allocate seats by detecting bots. It gives each verified person one entry, so a bot that looks perfectly human still gets only one entry per account. Detection metrics here show how clean the gate is, not what the fairness rests on.

Second review ("new_bots"): the four extra bot kinds (real-ticket bot, careful scraper, boundary sniper, seat sniper) are implemented; see `docs/RED_TEAM.md` (Round 3) and `docs/ATTACK_ENGINE.md`.
