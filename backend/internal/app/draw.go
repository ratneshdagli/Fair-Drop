package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"fairdrop/internal/fdcrypto"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// doLock closes the entry list: builds the deterministic Merkle tree and publishes the root BEFORE the seed
// is revealed. After this point the server cannot change the list without changing the published root.
func (a *App) doLock(ctx context.Context, d *Drop, extra map[string]any, payload map[string]any) error {
	raw, err := a.rdb.HGetAll(ctx, dk(d.ID, "entries")).Result()
	if err != nil {
		return err
	}
	dropped, _ := a.rdb.SMembers(ctx, "test:malicious:"+d.ID).Result() // TEST_MODE misconduct demo
	skip := map[string]bool{}
	for _, x := range dropped {
		skip[x] = true
	}
	es := make([]fdcrypto.Entry, 0, len(raw))
	for rid, v := range raw {
		if skip[rid] {
			continue
		}
		es = append(es, fdcrypto.Entry{ReceiptID: rid, Tier: strings.SplitN(v, "|", 2)[0]})
	}
	t, err := fdcrypto.BuildTree(es)
	if err != nil {
		return err
	}
	var sb strings.Builder
	for _, e := range t.Entries {
		sb.WriteString(e.ReceiptID + "," + e.Tier + "\n")
	}
	if err := a.rdb.Set(ctx, dk(d.ID, "locked"), sb.String(), 0).Err(); err != nil {
		return err
	}
	root := t.Root()
	rh := hex.EncodeToString(root[:])
	round := fdcrypto.DrandRoundAfter(time.Now().Unix())
	if !a.cfg.DrandEnabled {
		round = 0
	}
	extra["merkle_root"], extra["entry_count"], extra["beacon_round"], extra["locked_at_ms"] = rh, len(es), round, nowMS()
	payload["merkle_root"], payload["entry_count"], payload["beacon_round"] = rh, len(es), round
	a.pg.Exec(ctx, "UPDATE drops SET merkle_root=$2, entry_count=$3, beacon_round=$4 WHERE id=$1", d.ID, rh, len(es), int64(round))
	return nil
}

type drandResp struct {
	Round      uint64 `json:"round"`
	Randomness string `json:"randomness"`
	Signature  string `json:"signature"`
}

func (a *App) fetchBeacon(ctx context.Context, round uint64) (*drandResp, error) {
	url := fmt.Sprintf("%s/%s/public/%d", strings.TrimRight(a.cfg.DrandURL, "/"), fdcrypto.DrandChain, round)
	deadline := time.Now().Add(25 * time.Second)
	var last error
	for time.Now().Before(deadline) {
		req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
		resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
		if err == nil {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode == 200 {
				var r drandResp
				if json.Unmarshal(b, &r) == nil && len(r.Randomness) == 64 {
					return &r, nil
				}
			}
			last = fmt.Errorf("drand status %d", resp.StatusCode)
		} else {
			last = err
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(1500 * time.Millisecond):
		}
	}
	return nil, last
}

// doDraw reveals the seed and computes the draw. final = H(seed || merkle_root || beacon?), score = H(final || receipt_id).
func (a *App) doDraw(ctx context.Context, d *Drop, extra map[string]any, payload map[string]any) error {
	seedHex, err := a.rdb.HGet(ctx, dk(d.ID, "secret"), "seed").Result()
	if err != nil {
		return err
	}
	seed, _ := hex.DecodeString(seedHex)
	if sh := sha256.Sum256(seed); hex.EncodeToString(sh[:]) != d.SeedHash {
		return errors.New("seed does not match published commitment")
	}
	rootB, _ := hex.DecodeString(d.MerkleRoot)
	var root [32]byte
	copy(root[:], rootB)
	var beacon []byte
	if d.BeaconRound > 0 {
		if br, err := a.fetchBeacon(ctx, d.BeaconRound); err == nil {
			beacon, _ = hex.DecodeString(br.Randomness)
			extra["beacon"], extra["beacon_sig"] = br.Randomness, br.Signature
			payload["beacon"], payload["beacon_round"] = br.Randomness, br.Round
		} else {
			payload["beacon_unavailable"] = err.Error() // honest: drawn without beacon, flagged in the audit log
			extra["beacon_round"] = 0
		}
	}
	final := fdcrypto.FinalRandomness(seed, root, beacon)
	fh := hex.EncodeToString(final[:])
	t, err := a.tree(ctx, d)
	if err != nil {
		return err
	}
	byTier := map[string][]string{}
	for _, e := range t.Entries {
		byTier[e.Tier] = append(byTier[e.Tier], e.ReceiptID)
	}
	pipe := a.rdb.Pipeline()
	pipe.Del(ctx, dk(d.ID, "rank"))
	var rows [][]any
	for _, tr := range d.Tiers {
		pipe.Del(ctx, dk(d.ID, "result:"+tr.ID))
		order := fdcrypto.Order(final, byTier[tr.ID])
		for i := 0; i < len(order); i += 5000 {
			j := min(i+5000, len(order))
			args := make([]any, 0, j-i)
			rk := make([]any, 0, 2*(j-i))
			for k := i; k < j; k++ {
				args = append(args, order[k])
				oc := "waitlist"
				if k < tr.Seats {
					oc = "won"
				}
				rk = append(rk, order[k], fmt.Sprintf("%s|%d|%s", tr.ID, k+1, oc))
			}
			pipe.RPush(ctx, dk(d.ID, "result:"+tr.ID), args...)
			pipe.HSet(ctx, dk(d.ID, "rank"), rk...)
		}
		for k, rid := range order {
			oc := "waitlist"
			if k < tr.Seats {
				oc = "won"
			}
			sc := fdcrypto.Score(final, rid)
			rows = append(rows, []any{d.ID, tr.ID, k + 1, rid, hex.EncodeToString(sc[:]), oc})
		}
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	a.pg.Exec(ctx, "DELETE FROM draw_results WHERE drop_id=$1", d.ID)
	if _, err := a.pg.CopyFrom(ctx, pgx.Identifier{"draw_results"}, []string{"drop_id", "tier_id", "rank", "receipt_id", "score", "outcome"}, pgx.CopyFromRows(rows)); err != nil {
		return err
	}
	a.pg.Exec(ctx, "UPDATE drops SET seed=$2 WHERE id=$1", d.ID, seedHex)
	if err := a.computeCounterfactuals(ctx, d, final, fh); err != nil {
		return err
	}
	extra["seed"], extra["final"], extra["drawn_at_ms"] = seedHex, fh, nowMS()
	payload["seed"], payload["final_randomness"], payload["merkle_root"] = seedHex, fh, d.MerkleRoot
	a.m.DrawsDone.Inc()
	return nil
}

// ---------- counterfactuals: FCFS vs naive lottery vs Fair Drop on the SAME attempts ----------

type attempt struct {
	ID, Tier, Outcome, Receipt, Actor string
	T                                 int64
}

type cfWin struct {
	Ref   string `json:"ref"`
	Actor string `json:"actor"`
	Rank  int    `json:"rank"`
}

func (a *App) readAttempts(ctx context.Context, d *Drop) ([]attempt, error) {
	tok2user, _ := a.rdb.HGetAll(ctx, dk(d.ID, "tok2user")).Result() // TEST_MODE evaluation link only
	var out []attempt
	start := "-"
	for {
		msgs, err := a.rdb.XRangeN(ctx, dk(d.ID, "attempts"), start, "+", 20000).Result()
		if err != nil {
			return nil, err
		}
		for _, m := range msgs {
			if m.ID == start {
				continue
			}
			at := attempt{ID: m.ID}
			at.T = atoi64(fmt.Sprint(m.Values["t"]))
			at.Tier, _ = m.Values["tier"].(string)
			at.Outcome, _ = m.Values["o"].(string)
			at.Receipt, _ = m.Values["r"].(string)
			at.Actor, _ = m.Values["a"].(string)
			if at.Actor == "" {
				at.Actor = tok2user[at.Receipt]
			}
			if at.Actor == "" {
				at.Actor = "anon:" + at.ID
			}
			out = append(out, at)
		}
		if len(msgs) < 20000 {
			break
		}
		start = msgs[len(msgs)-1].ID
	}
	return out, nil
}

// allocate walks a ranked sequence and hands out seats: at most `cap` per account, at most Seats per tier.
func allocate(seq []attempt, tiers []Tier, capPer int) map[string][]cfWin {
	left := map[string]int{}
	for _, t := range tiers {
		left[t.ID] = t.Seats
	}
	per := map[string]int{}
	out := map[string][]cfWin{}
	for _, at := range seq {
		if left[at.Tier] <= 0 || per[at.Actor] >= capPer {
			continue
		}
		left[at.Tier]--
		per[at.Actor]++
		out[at.Tier] = append(out[at.Tier], cfWin{Ref: at.ID, Actor: at.Actor, Rank: len(out[at.Tier]) + 1})
	}
	return out
}

func (a *App) computeCounterfactuals(ctx context.Context, d *Drop, final [32]byte, fh string) error {
	all, err := a.readAttempts(ctx, d)
	if err != nil {
		return err
	}
	// Both counterfactual worlds drop only requests that arrived after the window closed.
	// Rate-limited requests never reached the allocator and are excluded (conservative for the baselines).
	var at []attempt
	for _, x := range all {
		if x.Outcome != "closed" && x.Tier != "" {
			at = append(at, x)
		}
	}
	fcfs := append([]attempt(nil), at...)
	sort.SliceStable(fcfs, func(i, j int) bool { return fcfs[i].T < fcfs[j].T })
	naive := append([]attempt(nil), at...)
	type sc struct {
		i int
		s [32]byte
	}
	scs := make([]sc, len(naive))
	for i := range naive {
		scs[i] = sc{i, fdcrypto.Score(final, naive[i].ID)}
	}
	sort.Slice(scs, func(i, j int) bool { return hex.EncodeToString(scs[i].s[:]) < hex.EncodeToString(scs[j].s[:]) })
	nv := make([]attempt, len(naive))
	for i, s := range scs {
		nv[i] = naive[s.i]
	}
	tok2user, _ := a.rdb.HGetAll(ctx, dk(d.ID, "tok2user")).Result()
	fair := map[string][]cfWin{}
	entriesBy := map[string]map[string]int{}
	rawEntries, _ := a.rdb.HGetAll(ctx, dk(d.ID, "entries")).Result()
	actorOf := func(rid string) string {
		if u := tok2user[rid]; u != "" {
			return u
		}
		return rid
	}
	t, err := a.tree(ctx, d)
	if err != nil {
		return err
	}
	locked := map[string]bool{}
	for _, e := range t.Entries {
		locked[e.ReceiptID] = true
	}
	for rid, v := range rawEntries {
		if !locked[rid] {
			continue
		}
		tier := strings.SplitN(v, "|", 2)[0]
		if entriesBy[tier] == nil {
			entriesBy[tier] = map[string]int{}
		}
		entriesBy[tier][actorOf(rid)]++
	}
	for _, tr := range d.Tiers {
		ids, _ := a.rdb.LRange(ctx, dk(d.ID, "result:"+tr.ID), 0, int64(tr.Seats-1)).Result()
		for i, rid := range ids {
			fair[tr.ID] = append(fair[tr.ID], cfWin{Ref: rid, Actor: actorOf(rid), Rank: i + 1})
		}
	}
	capPer := a.cfg.MaxPerAcct
	pol := map[string]map[string][]cfWin{"fcfs": allocate(fcfs, d.Tiers, capPer), "naive": allocate(nv, d.Tiers, capPer), "fairdrop": fair}
	att := map[string]int{}
	attTier := map[string]map[string]int{}
	for _, x := range at {
		att[x.Actor]++
		if attTier[x.Tier] == nil {
			attTier[x.Tier] = map[string]int{}
		}
		attTier[x.Tier][x.Actor]++
	}
	cf := map[string]any{"drop_id": d.ID, "final": fh, "max_per_account": capPer, "policies": pol,
		"attempts_total": len(at), "attempts_by_actor": att, "attempts_by_tier_actor": attTier,
		"entries_by_tier_actor": entriesBy, "tiers": d.Tiers, "generated_ms": nowMS(),
		"definitions": map[string]string{
			"fcfs":     "earliest arrival wins; one seat per request; max_per_account seats per account",
			"naive":    "every request is a lottery ticket (retries and floods multiply odds); same cap",
			"fairdrop": "one entry per verified identity; cryptographic draw; allocation ignores time, volume and IP"}}
	b, _ := json.Marshal(cf)
	a.rdb.Set(ctx, dk(d.ID, "cf"), b, 0)
	a.pg.Exec(ctx, "DELETE FROM counterfactuals WHERE drop_id=$1", d.ID)
	var rows [][]any
	for p, tm := range pol {
		for tier, ws := range tm {
			for _, w := range ws {
				rows = append(rows, []any{d.ID, p, tier, w.Rank, w.Ref, w.Actor})
			}
		}
	}
	if len(rows) > 0 {
		if _, err := a.pg.CopyFrom(ctx, pgx.Identifier{"counterfactuals"}, []string{"drop_id", "policy", "tier_id", "rank", "ref_id", "actor"}, pgx.CopyFromRows(rows)); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) hCounterfactuals(w http.ResponseWriter, r *http.Request) {
	b, err := a.rdb.Get(r.Context(), dk(chi.URLParam(r, "id"), "cf")).Bytes()
	if err != nil {
		fail(w, 409, "not_drawn")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

// ---------- public verification bundle ----------

func (a *App) hVerifyBundle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	d, err := a.loadDrop(ctx, chi.URLParam(r, "id"))
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if stateOrder[d.State] < stateOrder["DRAWN"] {
		fail(w, 409, "not_drawn", "state", d.State, "merkle_root", d.MerkleRoot, "seed_hash", d.SeedHash)
		return
	}
	t, err := a.tree(ctx, d)
	if err != nil {
		fail(w, 500, "tree")
		return
	}
	entries := make([][2]string, len(t.Entries))
	for i, e := range t.Entries {
		entries[i] = [2]string{e.ReceiptID, e.Tier}
	}
	results := map[string][]string{}
	tiers := []map[string]any{}
	for _, tr := range d.Tiers {
		ids, _ := a.rdb.LRange(ctx, dk(d.ID, "result:"+tr.ID), 0, -1).Result()
		results[tr.ID] = ids
		tiers = append(tiers, map[string]any{"id": tr.ID, "seats": tr.Seats})
	}
	var beacon any
	if d.Beacon != "" {
		beacon = map[string]any{"round": d.BeaconRound, "randomness": d.Beacon, "signature": d.BeaconSig, "chain": fdcrypto.DrandChain,
			"verify_at": fmt.Sprintf("https://api.drand.sh/%s/public/%d", fdcrypto.DrandChain, d.BeaconRound)}
	}
	writeJSON(w, 200, map[string]any{"drop_id": d.ID, "seed_hash": d.SeedHash, "seed": d.Seed, "merkle_root": d.MerkleRoot,
		"entry_count": len(entries), "beacon": beacon, "final_randomness": d.Final, "tiers": tiers, "entries": entries, "results": results,
		"formats": map[string]string{"leaf": "sha256(0x00||receipt_id||0x1f||tier)", "node": "sha256(0x01||left||right)",
			"final": "sha256('fairdrop/final/v1'||seed||root||flag[||beacon])", "score": "sha256('fairdrop/score/v1'||final||receipt_id)"}})
}
