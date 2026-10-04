# Research notes

Sources are the standards and prior art that shaped the design; decisions are in `ARCHITECTURE_DECISIONS.md`.

1. **RFC 9474, RSA Blind Signatures** (IETF). Defines `RSABSSA` variants; we use SHA-384, PSS, *deterministic* (no salt) so a retried blind-sign request yields the same signature. Unlinkability holds because the signer sees only the blinded message. Takeaway: tokens are single-use only if the *verifier* keeps a spent set, so Redis `SADD` is part of the design.
2. **Privacy Pass (RFC 9576–9578)**. Same idea (issue once, redeem unlinkably) used by CDNs for anti-abuse. Confirms the two-endpoint shape (issue authenticated, redeem anonymous). We do not use its protocol framing; the drop-scoped key and a 1-per-identity issue rule are what Fair Drop needs.
3. **drand** (League of Entropy; quicknet chain, 3 s rounds, BLS threshold signatures). Verifiable public randomness that nobody (including the operator) can predict before the round. We pick a round strictly after the lock time and mix its randomness. Limitation: we do not verify the BLS signature in our own code; clients can with any drand library.
4. **Certificate Transparency / RFC 6962 Merkle trees.** Domain-separated leaf/node hashing prevents second-preimage attacks on the tree (`0x00`/`0x01` prefixes). We do not need consistency proofs (a single locked tree per drop), only inclusion proofs.
5. **Commit–reveal.** Standard; weakness is grinding by the committer, which is why ADR-5 adds the beacon.
6. **Ticketing bot economics.** Public reporting on the US BOTS Act and ticket-queue lotteries (verified-fan style programmes): FCFS rewards bandwidth; lotteries shift the attack to account creation. That motivated measuring *cost per seat* and the Sybil-scaling experiment rather than claiming bots are stopped.
7. **Redis for atomic admission**: Lua scripts are atomic and `TIME` inside a script is the single clock; Streams + consumer groups give an at-least-once feed to Postgres. The ledger writer is idempotent on `seq`.
8. **Locust**: `FastHttpUser` (geventhttpclient) handles thousands of concurrent users per process; `--processes` forks workers on one machine. We bypass its default "N identical users" model with an actor queue so identities, arrival times and IPs follow a plan.
9. **Counterfactual evaluation**: to compare policies fairly one must replay the *same* arrival stream through each policy (not run separate experiments with different randomness). Expectation over re-draws removes lucky/unlucky single-draw noise.
