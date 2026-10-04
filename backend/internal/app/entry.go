package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"net/http"
	"strings"
	"time"

	"fairdrop/internal/fdcrypto"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

// ---------------- ISSUER: POST /drops/{id}/token ----------------

func (a *App) windowErr(w http.ResponseWriter, state string) {
	switch state {
	case "SCHEDULED":
		fail(w, 409, "not_open_yet")
	default:
		fail(w, 410, "window_closed")
	}
}

// issue performs the atomic one-token-per-identity step and returns the blind signature.
// blinded is the client's blinded message (or the plain token in BLIND_MODE=plain).
func (a *App) issue(ctx context.Context, rt *dropRT, user, tier string, blinded []byte) (sig []byte, status int, code string) {
	hb := sha256.Sum256(blinded)
	res, err := issueLua.Run(ctx, a.rdb, []string{"drop:" + rt.ID, dk(rt.ID, "issued"), eventsStream, "live:" + rt.ID},
		user, hex.EncodeToString(hb[:]), tier, rt.Epoch, rt.ID).StringSlice()
	if err != nil {
		return nil, 500, "redis"
	}
	switch res[0] {
	case "closed":
		a.m.Rejected.WithLabelValues("window_closed").Inc()
		if res[1] == "SCHEDULED" {
			return nil, 409, "not_open_yet"
		}
		return nil, 410, "window_closed"
	case "already":
		a.m.Rejected.WithLabelValues("already_issued").Inc()
		return nil, 409, "already_issued"
	}
	if res[0] == "ok" {
		a.m.TokensIssued.Inc()
	}
	if a.cfg.BlindMode == "plain" {
		sig, err = rt.key.PlainSign(blinded)
	} else {
		sig, err = rt.key.BlindSign(blinded) // deterministic => replays after a crash return the same signature
	}
	if err != nil {
		return nil, 500, "sign"
	}
	return sig, 200, ""
}

func (a *App) validBlinded(rt *dropRT, b []byte) bool {
	if a.cfg.BlindMode == "plain" {
		return len(b) >= 16 && len(b) <= 128
	}
	k := (rt.pub.N.BitLen() + 7) / 8
	return len(b) == k && new(big.Int).SetBytes(b).Cmp(rt.pub.N) < 0
}

func (a *App) hToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	rt, state, err := a.rt(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if rt.Mode != "fairdrop" {
		fail(w, 400, "wrong_mode")
		return
	}
	var in struct {
		BlindedMsg string `json:"blinded_msg"`
		Tier       string `json:"tier"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	c := claimsOf(r)
	// Eligibility: verified at or before the cutoff. Everyone else can browse but never enter.
	if c.VerifiedAt == 0 || c.VerifiedAt > rt.CutoffMS {
		a.live(ctx, id, "rejected_ineligible", 1)
		a.feed(id, "token", "ineligible", a.actorOf(r, c.Subject), clientIP(a, r))
		a.m.Rejected.WithLabelValues("not_eligible").Inc()
		fail(w, 403, "not_eligible", "verified_at_ms", c.VerifiedAt, "cutoff_at_ms", rt.CutoffMS)
		return
	}
	if in.Tier != "" && rt.tier(in.Tier) == nil {
		fail(w, 400, "bad_tier")
		return
	}
	blinded, err := unb64(in.BlindedMsg)
	if err != nil || !a.validBlinded(rt, blinded) {
		fail(w, 400, "bad_blinded_msg")
		return
	}
	_ = state
	sig, st, code := a.issue(ctx, rt, c.Subject, in.Tier, blinded)
	if code == "already_issued" && a.badIP(w, r) { // asking again for a ticket you already have earns nothing: charge it to the address
		return
	}
	a.feedToken(id, a.actorOf(r, c.Subject), clientIP(a, r), st, code)
	if st != 200 {
		fail(w, st, code)
		return
	}
	writeJSON(w, 200, map[string]any{"blind_sig": b64(sig), "token_mode": a.cfg.BlindMode})
}

// ---------------- ENTRY: POST /drops/{id}/register ----------------

type regIn struct {
	TokenMsg string `json:"token_msg"`
	Sig      string `json:"sig"`
	Tier     string `json:"tier"`
}

func (a *App) attemptBad(ctx context.Context, d, tier, outcome, receipt, actor, ip string) {
	pipe := a.rdb.Pipeline()
	pipe.XAdd(ctx, &redis.XAddArgs{Stream: dk(d, "attempts"), MaxLen: 5000000, Approx: true,
		Values: []any{"t", nowMS(), "tier", tier, "o", outcome, "r", receipt, "a", actor, "ip", ip, "rep", a.cfg.ReplicaID}})
	pipe.HIncrBy(ctx, "live:"+d, "rejected_"+outcome, 1)
	pipe.Exec(ctx)
}

func (a *App) parseReg(w http.ResponseWriter, r *http.Request, rt *dropRT) (in regIn, tok []byte, ok bool) {
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	if rt.tier(in.Tier) == nil {
		fail(w, 400, "bad_tier")
		return
	}
	tok, err := unb64(in.TokenMsg)
	sig, err2 := unb64(in.Sig)
	if err != nil || err2 != nil || len(tok) < 16 || len(tok) > 128 {
		fail(w, 400, "bad_sig")
		return
	}
	if fdcrypto.VerifyToken(rt.pub, tok, sig) != nil {
		if a.badIP(w, r) {
			return
		}
		a.m.Rejected.WithLabelValues("bad_sig").Inc()
		a.attemptBad(r.Context(), rt.ID, in.Tier, "bad_sig", "", a.simActor(r), clientIP(a, r))
		a.feed(rt.ID, "register", "bad_sig", a.simActor(r), clientIP(a, r), "tk", clip(in.TokenMsg), "sg", clip(in.Sig))
		fail(w, 400, "bad_sig")
		return
	}
	return in, tok, true
}

func (a *App) receiptJSON(rt *dropRT, receipt, tier string, arrival int64, replica string, fast bool) map[string]any {
	msg := fdcrypto.ReceiptMessage(rt.ID, receipt, tier, arrival)
	sig, _ := fdcrypto.SignEC(rt.key.EC, msg)
	return map[string]any{"drop_id": rt.ID, "receipt_id": receipt, "tier": tier, "arrival_ms": arrival,
		"server_sig": b64(sig), "replica": replica, "note": "arrival time does not affect your chances"}
}

func (a *App) hRegister(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	rt, state, err := a.rt(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if rt.Mode != "fairdrop" {
		fail(w, 400, "wrong_mode")
		return
	}
	in, tok, ok := a.parseReg(w, r, rt)
	if !ok {
		return
	}
	receipt := fdcrypto.ReceiptID(id, tok)
	idem := r.Header.Get("Idempotency-Key")
	if len(idem) > 128 {
		idem = idem[:128]
	}
	res, err := registerLua.Run(ctx, a.rdb,
		// the retry key is scoped to its own ticket: another person reusing/guessing the same key can never touch this entry's retries
		[]string{"drop:" + id, dk(id, "spent"), dk(id, "entries"), "idem:" + id + ":reg:" + receipt + ":" + idem, dk(id, "attempts"), eventsStream, "live:" + id},
		receipt, in.Tier, a.cfg.ReplicaID, idem, 600, a.simActor(r), clientIP(a, r), rt.Epoch, id).StringSlice()
	if err != nil {
		fail(w, 503, "redis", "detail", err.Error())
		return
	}
	_ = state
	if res[0] == "spent" || res[0] == "replay" { // a repeat earned nothing: charge it to the sender's address
		if a.badIP(w, r) {
			return
		}
	}
	a.feed(id, "register", res[0], a.simActor(r), clientIP(a, r), "r", receipt, "tier", in.Tier)
	switch res[0] {
	case "closed":
		a.m.Rejected.WithLabelValues("window_closed").Inc()
		fail(w, 410, "window_closed")
	case "spent":
		a.m.TokenReuse.Inc()
		a.m.Rejected.WithLabelValues("token_spent").Inc()
		fail(w, 409, "token_spent", "receipt_id", receipt)
	case "ok", "replay":
		parts := strings.Split(res[1], "|") // tier|arrival|replica
		if res[0] == "ok" {
			a.m.Entries.Inc()
		}
		writeJSON(w, 200, a.receiptJSON(rt, receipt, parts[0], atoi64(parts[1]), parts[2], false))
	}
}

// hTarpit is the decoy "fast" endpoint (PRD: Could). Naive API scrapers that find it burn their token and
// receive a convincing but worthless receipt; it never reaches the real entry list.
// Honest limit: it only catches bots that take the bait.
func (a *App) hTarpit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	rt, _, err := a.rt(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	in, tok, ok := a.parseReg(w, r, rt)
	if !ok {
		return
	}
	fake := fdcrypto.ReceiptID(id+"#fast", tok)
	// the token is burned under its REAL receipt id so it cannot be replayed on /register
	real := fdcrypto.ReceiptID(id, tok)
	res, err := tarpitLua.Run(ctx, a.rdb, []string{"drop:" + id, dk(id, "spent"), dk(id, "tarpit"), dk(id, "attempts"), "live:" + id, eventsStream},
		real, in.Tier, a.cfg.ReplicaID, a.simActor(r), clientIP(a, r), rt.Epoch, id).StringSlice()
	if err != nil {
		fail(w, 503, "redis", "detail", err.Error())
		return
	}
	a.m.TarpitHits.Inc()
	a.feed(id, "tarpit", "tarpit", a.simActor(r), clientIP(a, r), "r", real, "tier", in.Tier)
	switch res[0] {
	case "closed":
		fail(w, 410, "window_closed")
	case "spent":
		fail(w, 409, "token_spent")
	default:
		a.rdb.HSet(ctx, dk(id, "tarpit_fake"), fake, real)
		writeJSON(w, 200, a.receiptJSON(rt, fake, in.Tier, atoi64(res[1]), a.cfg.ReplicaID, true))
	}
}

// ---------------- PROOF / RESULT ----------------

func (a *App) tree(ctx context.Context, d *Drop) (*fdcrypto.Tree, error) {
	ck := d.ID + ":" + d.MerkleRoot
	if v, ok := a.trees.Load(ck); ok {
		return v.(*fdcrypto.Tree), nil
	}
	blob, err := a.rdb.Get(ctx, dk(d.ID, "locked")).Result()
	if err != nil {
		return nil, err
	}
	es := parseLocked(blob)
	t, err := fdcrypto.BuildTree(es)
	if err != nil {
		return nil, err
	}
	a.trees.Store(ck, t)
	return t, nil
}

func parseLocked(blob string) []fdcrypto.Entry {
	var es []fdcrypto.Entry
	for _, ln := range strings.Split(blob, "\n") {
		if p := strings.SplitN(ln, ",", 2); len(p) == 2 {
			es = append(es, fdcrypto.Entry{ReceiptID: p[0], Tier: p[1]})
		}
	}
	return es
}

var stateOrder = map[string]int{"SCHEDULED": 0, "OPEN": 1, "CLOSED": 2, "LOCKED": 3, "DRAWN": 4, "CLAIM": 5, "SETTLED": 6}

func (a *App) hProof(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	d, err := a.loadDrop(ctx, chi.URLParam(r, "id"))
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if stateOrder[d.State] < stateOrder["LOCKED"] || d.MerkleRoot == "" {
		fail(w, 409, "not_locked")
		return
	}
	t, err := a.tree(ctx, d)
	if err != nil {
		fail(w, 500, "tree")
		return
	}
	rid := chi.URLParam(r, "receipt")
	i := t.Index(rid)
	if i < 0 {
		fail(w, 404, "not_included", "merkle_root", d.MerkleRoot, "entry_count", len(t.Entries))
		return
	}
	writeJSON(w, 200, map[string]any{"merkle_root": d.MerkleRoot, "entry_count": len(t.Entries), "index": i,
		"leaf": t.Entries[i], "path": t.Proof(i)})
}

func (a *App) hResult(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	rid := chi.URLParam(r, "receipt")
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if stateOrder[d.State] < stateOrder["DRAWN"] {
		in, _ := a.rdb.HExists(ctx, dk(id, "entries"), rid).Result()
		tp, _ := a.rdb.HExists(ctx, dk(id, "tarpit_fake"), rid).Result()
		if !in && !tp {
			fail(w, 404, "unknown_receipt")
			return
		}
		writeJSON(w, 200, map[string]any{"outcome": "pending", "state": d.State})
		return
	}
	if ok, _ := a.rdb.HExists(ctx, dk(id, "tarpit_fake"), rid).Result(); ok {
		writeJSON(w, 200, map[string]any{"outcome": "lost", "state": d.State, "rank": 0})
		return
	}
	v, err := a.rdb.HGet(ctx, dk(id, "rank"), rid).Result()
	if err != nil {
		fail(w, 404, "not_included", "merkle_root", d.MerkleRoot)
		return
	}
	p := strings.Split(v, "|") // tier|rank|outcome
	rank := atoi(p[1])
	tier := d.tier(p[0])
	out := map[string]any{"state": d.State, "tier": p[0], "rank": rank, "outcome": p[2]}
	if p[2] == "waitlist" {
		out["waitlist_position"] = rank - tier.Seats
	}
	if stateOrder[d.State] >= stateOrder["CLAIM"] {
		if s, err := a.rdb.HGetAll(ctx, dk(id, "seat:"+rid)).Result(); err == nil && len(s) > 0 {
			out["claim"] = map[string]any{"status": s["status"], "seat_no": atoi(s["seat_no"]), "deadline_ms": atoi64(s["deadline"]), "promoted": s["promoted"] == "1"}
			if s["promoted"] == "1" {
				out["outcome"] = "won"
			}
		} else if p[2] == "waitlist" && d.State == "SETTLED" {
			out["outcome"] = "lost"
		}
	}
	writeJSON(w, 200, out)
}

var _ = time.Now
