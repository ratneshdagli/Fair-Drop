package app

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"fairdrop/internal/fdcrypto"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// testkit: TEST_MODE + X-Test-Key only. Synthetic identities (no phones, no SMS, no Gmail).

func pwHash(p string) string { h := sha256.Sum256([]byte("fairdrop/testpw/" + p)); return hex.EncodeToString(h[:]) }

func (a *App) hTestSeed(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Count    int    `json:"count"`
		Password string `json:"password"`
	}
	if decode(r, &in) != nil || in.Count <= 0 || in.Count > 500000 {
		fail(w, 400, "bad_count")
		return
	}
	if in.Password == "" {
		in.Password = "test-pass"
	}
	ctx := r.Context()
	// all synthetic users are verified in the year 2000, i.e. before any cutoff
	tag, err := a.pg.Exec(ctx, `INSERT INTO users(id,phone,verified_at,is_test)
		SELECT 't_'||lpad(i::text,6,'0'), 'test:'||lpad(i::text,6,'0'), '2000-01-01T00:00:00Z', true FROM generate_series(1,$1) i ON CONFLICT DO NOTHING`, in.Count)
	if err != nil {
		fail(w, 500, "db", "detail", err.Error())
		return
	}
	vat := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli()
	pipe := a.rdb.Pipeline()
	for i := 1; i <= in.Count; i++ {
		pipe.HSet(ctx, "users:verified", fmt.Sprintf("t_%06d", i), vat)
		if i%5000 == 0 {
			pipe.Exec(ctx)
		}
	}
	pipe.Exec(ctx)
	a.rdb.Set(ctx, "test:pw", pwHash(in.Password), 0)
	a.pg.Exec(ctx, "INSERT INTO kv(k,v) VALUES('test:pw',$1) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v", pwHash(in.Password))
	var total int64
	a.pg.QueryRow(ctx, "SELECT count(*) FROM users WHERE is_test").Scan(&total)
	writeJSON(w, 200, map[string]any{"created": tag.RowsAffected(), "total_test_users": total, "user_id_format": "t_000001..t_%06d", "verified_at": "2000-01-01T00:00:00Z", "is_test": true})
}

func (a *App) testPW(ctx context.Context) string {
	if s, err := a.rdb.Get(ctx, "test:pw").Result(); err == nil {
		return s
	}
	var v string
	if a.pg.QueryRow(ctx, "SELECT v FROM kv WHERE k='test:pw'").Scan(&v) == nil {
		a.rdb.Set(ctx, "test:pw", v, 0)
	}
	return v
}

func (a *App) hTestLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID   string `json:"user_id"`
		Password string `json:"password"`
	}
	if decode(r, &in) != nil || !strings.HasPrefix(in.UserID, "t_") {
		fail(w, 400, "bad_request")
		return
	}
	if want := a.testPW(r.Context()); want == "" || subtle.ConstantTimeCompare([]byte(want), []byte(pwHash(in.Password))) != 1 {
		fail(w, 401, "bad_credentials")
		return
	}
	vat, ok := a.userVerifiedAt(r, in.UserID)
	if !ok {
		fail(w, 404, "no_such_test_user")
		return
	}
	tok, _ := a.sign(in.UserID, "user", vat, true, 12*time.Hour)
	writeJSON(w, 200, map[string]any{"token": tok, "user_id": in.UserID, "verified_at_ms": vat})
}

func (a *App) hTestAdminToken(w http.ResponseWriter, r *http.Request) {
	tok, _ := a.sign("admin:testkit", "admin", 0, true, 12*time.Hour)
	writeJSON(w, 200, map[string]any{"token": tok})
}

// hTestToken: server does the blinding so Locust needn't do RFC 9474 maths. It goes through the SAME issue()
// path (eligibility + atomic one-token-per-identity) as the real endpoint. It also records token->user,
// used ONLY by the evaluation (labels / counterfactuals), never by allocation.
func (a *App) hTestToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	rt, _, err := a.rt(ctx, id)
	if err != nil || rt.Mode != "fairdrop" {
		fail(w, 404, "drop_not_found")
		return
	}
	var in struct {
		Tier string `json:"tier"`
	}
	decode(r, &in)
	if in.Tier == "" {
		in.Tier = rt.Tiers[0].ID
	}
	if rt.tier(in.Tier) == nil {
		fail(w, 400, "bad_tier")
		return
	}
	c := claimsOf(r)
	if c.VerifiedAt == 0 || c.VerifiedAt > rt.CutoffMS {
		a.live(ctx, id, "rejected_ineligible", 1)
		a.feed(id, "token", "ineligible", a.actorOf(r, c.Subject), clientIP(a, r))
		fail(w, 403, "not_eligible")
		return
	}
	tok := make([]byte, 32)
	randRead(tok)
	var blinded []byte
	var st interface{}
	var finalize func(sig []byte) ([]byte, error)
	if a.cfg.BlindMode == "plain" {
		blinded = tok
		finalize = func(s []byte) ([]byte, error) { return s, nil }
	} else {
		b, bs, cl, err := fdcrypto.ClientBlind(rt.pub, tok)
		if err != nil {
			fail(w, 500, "blind")
			return
		}
		blinded, st = b, bs
		finalize = func(s []byte) ([]byte, error) { return cl.Finalize(bs, s) }
	}
	_ = st
	bsig, code, ecode := a.issue(ctx, rt, c.Subject, in.Tier, blinded)
	a.feedToken(id, a.actorOf(r, c.Subject), clientIP(a, r), code, ecode)
	if code != 200 {
		fail(w, code, ecode)
		return
	}
	sig, err := finalize(bsig)
	if err != nil {
		fail(w, 500, "finalize")
		return
	}
	rid := fdcrypto.ReceiptID(id, tok)
	a.rdb.HSet(ctx, dk(id, "tok2user"), rid, c.Subject)
	writeJSON(w, 200, map[string]any{"token_msg": b64(tok), "sig": b64(sig), "tier": in.Tier, "receipt_id": rid})
}

// hTestLink: TEST_MODE only. When a bot does its own RFC 9474 blinding and calls the real POST /token, the server (by design) cannot
// tell which account holds which receipt, so the EVALUATION could not credit that bot's wins to it. The bot reports its
// token here, exactly the receipt->account note that hTestToken makes for the shortcut. Used ONLY by the evaluation
// (counterfactuals, labels, live split), never by allocation. Not a decision stage: nothing is written to the decision feed.
func (a *App) hTestLink(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		TokenMsg string `json:"token_msg"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	tok, err := unb64(in.TokenMsg)
	if err != nil || len(tok) < 16 || len(tok) > 128 {
		fail(w, 400, "bad_token")
		return
	}
	if _, _, err := a.rt(r.Context(), id); err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	rid := fdcrypto.ReceiptID(id, tok)
	a.rdb.HSet(r.Context(), dk(id, "tok2user"), rid, claimsOf(r).Subject)
	writeJSON(w, 200, map[string]any{"receipt_id": rid})
}

// ---- reset ----

func (a *App) scanDel(ctx context.Context, pattern string, keep ...string) int {
	n := 0
	var cursor uint64
	for {
		keys, cur, err := a.rdb.Scan(ctx, cursor, pattern, 1000).Result()
		if err != nil {
			return n
		}
		var del []string
		for _, k := range keys {
			skip := false
			for _, kp := range keep {
				if k == kp {
					skip = true
				}
			}
			if !skip {
				del = append(del, k)
			}
		}
		if len(del) > 0 {
			a.rdb.Del(ctx, del...)
			n += len(del)
		}
		cursor = cur
		if cursor == 0 {
			return n
		}
	}
}

func (a *App) waitLedger(ctx context.Context, max time.Duration) {
	end := time.Now().Add(max)
	for time.Now().Before(end) {
		if lag, err := a.rdb.Get(ctx, "ledger:lag").Int64(); err != nil || lag == 0 {
			// ledger:lag has a 10s TTL and is refreshed by the worker; absent => worker idle or down
			time.Sleep(300 * time.Millisecond)
			if lag, err := a.rdb.Get(ctx, "ledger:lag").Int64(); err != nil || lag == 0 {
				return
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func (a *App) hTestReset(w http.ResponseWriter, r *http.Request) {
	var in struct {
		DropID    string `json:"drop_id"`
		State     string `json:"state"`
		WindowSec int    `json:"window_sec"`
		ClaimSec  int    `json:"claim_sec"`
		CutoffNow bool   `json:"cutoff_now"`
	}
	if decode(r, &in) != nil || in.DropID == "" {
		fail(w, 400, "bad_request")
		return
	}
	ctx := r.Context()
	id := in.DropID
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if in.State == "" {
		in.State = "OPEN"
	}
	if in.State != "OPEN" && in.State != "SCHEDULED" {
		fail(w, 400, "bad_state")
		return
	}
	if in.WindowSec <= 0 {
		in.WindowSec = 3600
	}
	a.waitLedger(ctx, 10*time.Second)
	lk, tok := dk(id, "lock"), randHex(8)
	if ok, _ := a.rdb.SetNX(ctx, lk, tok, 60*time.Second).Result(); !ok {
		fail(w, 409, "busy")
		return
	}
	defer unlockLua.Run(context.Background(), a.rdb, []string{lk}, tok)
	seed, _, blob, fields, err := newMaterial()
	if err != nil {
		fail(w, 500, "crypto")
		return
	}
	// wipe all hot state for this drop; users, labels and experiments survive
	a.scanDel(ctx, "drop:"+id+":*", lk)
	a.scanDel(ctx, "idem:"+id+":*")
	a.scanDel(ctx, "rl:*")
	a.scanDel(ctx, "base:"+id+":*")
	a.rdb.Del(ctx, "live:"+id, "integ:"+id, "test:malicious:"+id, "live:global")
	var cursor uint64
	for { // forget this drop's tickets in users' sets
		keys, cur, _ := a.rdb.Scan(ctx, cursor, "user:*:tickets", 500).Result()
		for _, k := range keys {
			ms, _ := a.rdb.SMembers(ctx, k).Result()
			for _, m := range ms {
				if strings.HasPrefix(m, id+"|") {
					a.rdb.SRem(ctx, k, m)
				}
			}
		}
		cursor = cur
		if cursor == 0 {
			break
		}
	}
	now := time.Now()
	opens := now
	if in.State == "SCHEDULED" {
		opens = now.Add(time.Hour)
	}
	closes := opens.Add(time.Duration(in.WindowSec) * time.Second)
	epoch := d.Epoch + 1
	f := map[string]any{"state": in.State, "epoch": epoch, "opens_at_ms": opens.UnixMilli(), "closes_at_ms": closes.UnixMilli()}
	if in.CutoffNow {
		f["cutoff_at_ms"] = now.UnixMilli()
	}
	if in.ClaimSec > 0 {
		f["claim_sec"] = in.ClaimSec
	}
	for k, v := range fields {
		f[k] = v
	}
	a.rdb.HDel(ctx, "drop:"+id, "merkle_root", "entry_count", "seed", "final", "beacon", "beacon_sig", "beacon_round", "locked_at_ms", "drawn_at_ms", "claim_started_ms", "at_OPEN", "at_CLOSED", "at_LOCKED", "at_DRAWN", "at_CLAIM", "at_SETTLED")
	a.rdb.HSet(ctx, "drop:"+id, f)
	a.rdb.HSet(ctx, dk(id, "secret"), map[string]any{"seed": hex.EncodeToString(seed), "key": blob})
	// postgres: permanent rows for the old epoch are removed; the append-only audit log is NOT touched
	for _, q := range []string{"DELETE FROM entries WHERE drop_id=$1", "DELETE FROM draw_results WHERE drop_id=$1",
		"DELETE FROM counterfactuals WHERE drop_id=$1", "DELETE FROM allocations WHERE drop_id=$1"} {
		a.pg.Exec(ctx, q, id)
	}
	cl := d.ClaimSec
	if in.ClaimSec > 0 {
		cl = in.ClaimSec
	}
	a.pg.Exec(ctx, `UPDATE drops SET state=$2, epoch=$3, opens_at=$4, closes_at=$5, claim_sec=$6, seed_hash=$7, public_key=$8,
		seed=NULL, merkle_root=NULL, entry_count=NULL, beacon_round=NULL, beacon=NULL WHERE id=$1`,
		id, in.State, epoch, opens, closes, cl, fields["seed_hash"], fields["public_key"])
	a.pg.Exec(ctx, "UPDATE drop_secrets SET seed=$2, key_blob=$3 WHERE drop_id=$1", id, hex.EncodeToString(seed), blob)
	a.rts.Range(func(k, _ any) bool {
		if strings.HasPrefix(k.(string), id+":") {
			a.rts.Delete(k)
		}
		return true
	})
	a.trees.Range(func(k, _ any) bool {
		if strings.HasPrefix(k.(string), id+":") {
			a.trees.Delete(k)
		}
		return true
	})
	a.emit(ctx, id, epoch, "drop_reset", map[string]any{"state": in.State, "epoch": epoch, "seed_hash": fields["seed_hash"], "public_key": fields["public_key"]})
	d, _ = a.loadDrop(ctx, id)
	writeJSON(w, 200, d.view())
}

// hTestClear is the "Restart" button: forget every test sale (ids starting "exp-") and its results, reset the protection
// settings and the rate-limit counters. Real sales, users and the append-only audit log are not touched.
func (a *App) hTestClear(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	a.waitLedger(ctx, 10*time.Second) // let queued writes land first, so nothing re-appears afterwards
	ids, _ := a.rdb.SMembers(ctx, "drops").Result()
	// a test sale can exist in Postgres while missing from the Redis set (after a Redis restart); it must still be cleared,
	// otherwise the next test re-uses its old row and shows the previous test's numbers
	if rows, err := a.pg.Query(ctx, "SELECT id FROM drops WHERE id LIKE 'exp-%'"); err == nil {
		seen := map[string]bool{}
		for _, id := range ids {
			seen[id] = true
		}
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil && !seen[id] {
				ids = append(ids, id)
			}
		}
		rows.Close()
	}
	// sales made by the self-test and the smoke test are test data too, even though their ids are not "exp-…"
	force := map[string]bool{}
	if rows, err := a.pg.Query(ctx, "SELECT d.id FROM drops d JOIN events_catalog e ON e.id=d.event_id WHERE e.name IN ('Protection self-test','Smoke Fest','Blind e2e')"); err == nil {
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				force[id] = true
				ids = append(ids, id)
			}
		}
		rows.Close()
	}
	gone := 0
	for _, id := range ids {
		if !strings.HasPrefix(id, "exp-") && !force[id] {
			continue
		}
		a.rdb.SRem(ctx, "drops", id)
		if force[id] {
			for _, pat := range []string{"drop:" + id + "*", "idem:" + id + "*", "base:" + id + "*", "live:" + id + "*", "integ:" + id + "*"} {
				a.scanDel(ctx, pat)
			}
		}
		for _, q := range []string{"DELETE FROM entries WHERE drop_id=$1", "DELETE FROM draw_results WHERE drop_id=$1", "DELETE FROM counterfactuals WHERE drop_id=$1", "DELETE FROM allocations WHERE drop_id=$1"} {
			a.pg.Exec(ctx, q, id)
		}
		a.pg.Exec(ctx, "DELETE FROM drop_secrets WHERE drop_id=$1", id)
		a.pg.Exec(ctx, "DELETE FROM drops WHERE id=$1", id) // test sales have fixed names, so the row must go or they cannot be created again
		gone++
	}
	for _, pat := range []string{"drop:exp-*", "idem:exp-*", "base:exp-*", "live:exp-*", "integ:exp-*", "rl:*", "adminfail:*"} {
		a.scanDel(ctx, pat)
	}
	var cursor uint64
	for { // forget test tickets in users' sets
		keys, cur, _ := a.rdb.Scan(ctx, cursor, "user:*:tickets", 500).Result()
		for _, k := range keys {
			ms, _ := a.rdb.SMembers(ctx, k).Result()
			for _, m := range ms {
				if strings.HasPrefix(m, "exp-") {
					a.rdb.SRem(ctx, k, m)
				}
			}
		}
		cursor = cur
		if cursor == 0 {
			break
		}
	}
	a.rdb.Del(ctx, "live:global", "config:guard")
	a.guardAt.Store(0)
	a.pg.Exec(ctx, "DELETE FROM experiments")
	for _, m := range []*sync.Map{&a.rts, &a.trees} {
		m.Range(func(k, _ any) bool {
			if strings.HasPrefix(k.(string), "exp-") {
				m.Delete(k)
			}
			return true
		})
	}
	writeJSON(w, 200, map[string]any{"sales_cleared": gone})
}

// ---- labels (evaluation only) ----

type labelIn struct {
	UserID     string `json:"user_id"`
	Kind       string `json:"kind"` // bot | human
	OperatorID string `json:"operator_id"`
	Profile    string `json:"profile"` // bot type, for the live view (evaluation only)
}

func (a *App) hTestLabels(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Labels  []labelIn `json:"labels"`
		Replace bool      `json:"replace"`
	}
	if decodeMax(r, &in, 16<<20) != nil {
		fail(w, 400, "bad_request")
		return
	}
	ctx := r.Context()
	if in.Replace {
		a.rdb.Del(ctx, "labels")
		a.pg.Exec(ctx, "DELETE FROM test_labels")
	}
	for i := 0; i < len(in.Labels); i += 5000 {
		j := min(i+5000, len(in.Labels))
		ids, kinds, ops := []string{}, []string{}, []string{}
		kv := []any{}
		for _, l := range in.Labels[i:j] {
			if l.Kind != "bot" && l.Kind != "human" {
				fail(w, 400, "bad_kind")
				return
			}
			ids, kinds, ops = append(ids, l.UserID), append(kinds, l.Kind), append(ops, l.OperatorID)
			kv = append(kv, l.UserID, l.Kind+"|"+l.OperatorID+"|"+l.Profile)
		}
		a.rdb.HSet(ctx, "labels", kv...)
		if _, err := a.pg.Exec(ctx, `INSERT INTO test_labels(user_id,kind,operator_id) SELECT * FROM unnest($1::text[],$2::text[],$3::text[])
			ON CONFLICT (user_id) DO UPDATE SET kind=EXCLUDED.kind, operator_id=EXCLUDED.operator_id`, ids, kinds, ops); err != nil {
			fail(w, 500, "db")
			return
		}
	}
	n, _ := a.rdb.HLen(ctx, "labels").Result()
	writeJSON(w, 200, map[string]any{"stored": len(in.Labels), "total_labels": n, "note": "labels are evaluation-only and never read by allocation"})
}

func (a *App) hTestGetLabels(w http.ResponseWriter, r *http.Request) {
	m, _ := a.rdb.HGetAll(r.Context(), "labels").Result()
	out := make([]labelIn, 0, len(m))
	for u, v := range m {
		p := strings.SplitN(v, "|", 3)
		for len(p) < 3 {
			p = append(p, "")
		}
		out = append(out, labelIn{u, p[0], p[1], p[2]})
	}
	writeJSON(w, 200, map[string]any{"labels": out})
}

// ---- malicious server demo ----

func (a *App) hTestMalicious(w http.ResponseWriter, r *http.Request) {
	var in struct {
		DropID    string `json:"drop_id"`
		Enabled   bool   `json:"enabled"`
		ReceiptID string `json:"receipt_id"`
		UserID    string `json:"user_id"`
	}
	if decode(r, &in) != nil || in.DropID == "" {
		fail(w, 400, "bad_request")
		return
	}
	ctx := r.Context()
	key := "test:malicious:" + in.DropID
	if !in.Enabled {
		a.rdb.Del(ctx, key)
		writeJSON(w, 200, map[string]any{"enabled": false})
		return
	}
	rid := in.ReceiptID
	if rid == "" && in.UserID != "" {
		m, _ := a.rdb.HGetAll(ctx, dk(in.DropID, "tok2user")).Result()
		for k, v := range m {
			if v == in.UserID {
				rid = k
			}
		}
	}
	if rid == "" {
		ks, _ := a.rdb.HKeys(ctx, dk(in.DropID, "entries")).Result()
		if len(ks) == 0 {
			fail(w, 409, "no_entries")
			return
		}
		rid = ks[time.Now().UnixNano()%int64(len(ks))]
	}
	if ok, _ := a.rdb.HExists(ctx, dk(in.DropID, "entries"), rid).Result(); !ok {
		fail(w, 404, "unknown_receipt")
		return
	}
	a.rdb.SAdd(ctx, key, rid)
	// NOTE: deliberately NOT written to the audit log - a cheating server would not log it.
	writeJSON(w, 200, map[string]any{"enabled": true, "will_drop_receipt_id": rid, "applies_at": "LOCKED transition"})
}

// ---- config / experiments / chaos ----

func (a *App) hTestConfig(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Guard map[string]any `json:"guard"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	if g := in.Guard; g != nil {
		kv := []any{}
		for k, v := range g {
			switch k {
			case "enabled":
				kv = append(kv, k, b2s(v == true))
			case "ip_limit", "acct_limit", "window_ms":
				kv = append(kv, k, fmt.Sprint(int(v.(float64))))
			}
		}
		if len(kv) > 0 {
			a.rdb.HSet(r.Context(), "config:guard", kv...)
		}
	}
	a.guardAt.Store(0)
	writeJSON(w, 200, a.guardConfig(r.Context()))
}

func (a *App) hGetConfig(w http.ResponseWriter, r *http.Request) {
	g := a.guardConfig(r.Context())
	writeJSON(w, 200, map[string]any{"guard": g, "test_mode": a.cfg.TestMode, "token_mode": a.cfg.BlindMode, "max_per_account": a.cfg.MaxPerAcct, "drand": a.cfg.DrandEnabled})
}

func (a *App) hTestPostExperiment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID     string          `json:"id"`
		Name   string          `json:"name"`
		Result json.RawMessage `json:"result"`
	}
	if decodeMax(r, &in, 32<<20) != nil || in.Name == "" || len(in.Result) == 0 {
		fail(w, 400, "bad_request")
		return
	}
	if in.ID == "" {
		in.ID = "exp_" + randHex(4)
	}
	if _, err := a.pg.Exec(r.Context(), "INSERT INTO experiments(id,name,result) VALUES($1,$2,$3) ON CONFLICT (id) DO UPDATE SET result=EXCLUDED.result, name=EXCLUDED.name", in.ID, in.Name, []byte(in.Result)); err != nil {
		fail(w, 500, "db", "detail", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"id": in.ID})
}

func (a *App) hListExperiments(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pg.Query(r.Context(), "SELECT id,name,created_at,COALESCE(result->'headline','{}'::jsonb) FROM experiments ORDER BY created_at DESC LIMIT 200")
	if err != nil {
		fail(w, 500, "db")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name string
		var ts time.Time
		var h json.RawMessage
		rows.Scan(&id, &name, &ts, &h)
		out = append(out, map[string]any{"id": id, "name": name, "created_at": ts, "headline": h})
	}
	writeJSON(w, 200, out)
}

func (a *App) hGetExperiment(w http.ResponseWriter, r *http.Request) {
	var b []byte
	id := chi.URLParam(r, "id")
	if err := a.pg.QueryRow(r.Context(), "SELECT result FROM experiments WHERE id=$1", id).Scan(&b); err != nil {
		if err == pgx.ErrNoRows {
			fail(w, 404, "not_found")
			return
		}
		fail(w, 500, "db")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

// hTestDie hard-kills this replica (no graceful shutdown) for the replica-failure experiment.
func (a *App) hTestDie(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"dying": a.cfg.ReplicaID})
	go func() { time.Sleep(50 * time.Millisecond); os.Exit(137) }()
}

// hTestTamper edits a stored audit row so the hash chain visibly breaks (and repairs it again) - demo of tamper evidence.
func (a *App) hTestTamper(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Seq    int64 `json:"seq"`
		Repair bool  `json:"repair"`
	}
	decode(r, &in)
	ctx := r.Context()
	if in.Repair {
		tag, _ := a.pg.Exec(ctx, "UPDATE audit_log SET payload = rtrim(payload) WHERE payload LIKE '% '")
		writeJSON(w, 200, map[string]any{"repaired_rows": tag.RowsAffected()})
		return
	}
	if in.Seq == 0 {
		a.pg.QueryRow(ctx, "SELECT seq FROM audit_log ORDER BY seq DESC OFFSET 3 LIMIT 1").Scan(&in.Seq)
	}
	tag, err := a.pg.Exec(ctx, "UPDATE audit_log SET payload = payload || ' ' WHERE seq=$1", in.Seq)
	if err != nil || tag.RowsAffected() == 0 {
		fail(w, 404, "no_such_seq")
		return
	}
	writeJSON(w, 200, map[string]any{"tampered_seq": in.Seq})
}
