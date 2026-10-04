package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"fairdrop/internal/fdcrypto"
)

// Integration tests need Redis + Postgres: scripts/test.sh runs them against redis db 15 + postgres db fairdrop_test.

type tenv struct {
	t   *testing.T
	a   *App
	h   http.Handler
	adm string
}

func newEnv(t *testing.T, testMode bool) *tenv {
	cfg := LoadConfig()
	cfg.TestMode, cfg.DrandEnabled, cfg.RedisDB = testMode, false, 15
	if os.Getenv("REDIS_ADDR") == "" {
		t.Skip("no REDIS_ADDR; run scripts/test.sh")
	}
	ctx, cancel := context.WithCancel(context.Background())
	a, err := New(ctx, cfg)
	if err != nil {
		t.Skip("stack unavailable: ", err)
	}
	a.rdb.FlushDB(ctx)
	a.rdb.HSet(ctx, "config:guard", "enabled", "0") // guard has its own tests; here we hammer single identities on purpose
	go a.RunLedger(ctx)
	t.Cleanup(func() { cancel(); a.Close() })
	adm, _ := a.sign("admin:test", "admin", 0, true, time.Hour)
	return &tenv{t: t, a: a, h: a.Router(), adm: adm}
}

func (e *tenv) do(method, path string, body any, hdr map[string]string) (int, map[string]any) {
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.RemoteAddr = fmt.Sprintf("10.%d.%d.%d:1", rand8(), rand8(), rand8())
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func rand8() int { b := make([]byte, 1); rand.Read(b); return int(b[0]) }

func (e *tenv) user(id string, vat int64) map[string]string {
	tok, _ := e.a.sign(id, "user", vat, true, time.Hour)
	return map[string]string{"Authorization": "Bearer " + tok, "X-Test-Key": e.a.cfg.TestKey}
}

func (e *tenv) admin() map[string]string { return map[string]string{"Authorization": "Bearer " + e.adm} }

func (e *tenv) mkDrop(seats map[string]int, claimSec int, cutoffOffsetMS int64) string {
	var tiers []map[string]any
	for _, n := range []string{"gold", "general"} {
		if s, ok := seats[n]; ok {
			tiers = append(tiers, map[string]any{"name": n, "price_cents": 100, "seats": s})
		}
	}
	c, ev := e.do("POST", "/admin/events", map[string]any{"name": "T", "venue": "V", "tiers": tiers}, e.admin())
	if c != 201 {
		e.t.Fatal("event", c, ev)
	}
	c, d := e.do("POST", "/admin/drops", map[string]any{"event_id": ev["id"], "window_sec": 600, "claim_sec": claimSec,
		"cutoff_at": time.Now().Add(time.Duration(cutoffOffsetMS) * time.Millisecond).UTC().Format(time.RFC3339Nano)}, e.admin())
	if c != 201 {
		e.t.Fatal("drop", c, d)
	}
	id := d["id"].(string)
	e.adv(id, "OPEN", 200)
	return id
}

func (e *tenv) adv(id, to string, want int) map[string]any {
	c, r := e.do("POST", "/admin/drops/"+id+"/advance", map[string]any{"to": to}, e.admin())
	if c != want {
		e.t.Fatalf("advance %s: got %d want %d: %v", to, c, want, r)
	}
	return r
}

type token struct{ msg, sig string }

func (e *tenv) getToken(drop, user string, tier string) (token, int) {
	c, r := e.do("POST", "/drops/"+drop+"/test-token", map[string]any{"tier": tier}, e.user(user, 1))
	if c != 200 {
		return token{}, c
	}
	return token{r["token_msg"].(string), r["sig"].(string)}, 200
}

func (e *tenv) register(drop string, tk token, tier, idem string) (int, map[string]any) {
	h := map[string]string{}
	if idem != "" {
		h["Idempotency-Key"] = idem
	}
	return e.do("POST", "/drops/"+drop+"/register", map[string]any{"token_msg": tk.msg, "sig": tk.sig, "tier": tier}, h)
}

func ridOf(drop string, tk token) string {
	tb, _ := base64.StdEncoding.DecodeString(tk.msg)
	return fdcrypto.ReceiptID(drop, tb)
}

func TestAuthAndTestkitHidden(t *testing.T) {
	e := newEnv(t, false) // production mode
	for _, p := range []string{"/test/seed", "/test/reset", "/test/login", "/test/labels", "/test/malicious"} {
		if c, _ := e.do("POST", p, map[string]any{}, map[string]string{"X-Test-Key": e.a.cfg.TestKey}); c != 404 {
			t.Fatalf("%s must not exist in production mode, got %d", p, c)
		}
	}
	if c, _ := e.do("GET", "/admin/events", nil, nil); c != 401 {
		t.Fatal("admin without token", c)
	}
	if c, _ := e.do("GET", "/admin/events", nil, e.user("u1", 1)); c != 403 {
		t.Fatal("user token on admin route", c)
	}
	if c, _ := e.do("GET", "/admin/events", nil, map[string]string{"Authorization": "Bearer garbage"}); c != 401 {
		t.Fatal("garbage jwt", c)
	}
	c, r := e.do("POST", "/auth/otp", map[string]any{"phone": "+15550001111"}, nil)
	if c != 200 || r["simulated"] != true {
		t.Fatal(c, r)
	}
	if c, _ := e.do("POST", "/auth/verify", map[string]any{"phone": "+15550001111", "otp": "badotp"}, nil); c != 401 {
		t.Fatal("bad otp accepted")
	}
	c, v := e.do("POST", "/auth/verify", map[string]any{"phone": "+15550001111", "otp": r["otp"]}, nil)
	if c != 200 || v["token"] == nil {
		t.Fatal("verify", c, v)
	}
}

func TestEligibilityCutoff(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 0) // cutoff = now
	late := time.Now().Add(time.Hour).UnixMilli()
	if c, r := e.do("POST", "/drops/"+d+"/test-token", map[string]any{}, e.user("late", late)); c != 403 || r["error"] != "not_eligible" {
		t.Fatal("verified after cutoff must not enter", c, r)
	}
	if _, c := e.getToken(d, "early", "gold"); c != 200 {
		t.Fatal("verified before cutoff must enter", c)
	}
	if c, _ := e.do("GET", "/drops/"+d, nil, nil); c != 200 {
		t.Fatal("ineligible users can still browse")
	}
}

func TestConcurrentDuplicateIssuance(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	rt, _, _ := e.a.rt(context.Background(), d)
	var ok, dup atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tok := make([]byte, 32)
			rand.Read(tok)
			bl, _, _, _ := fdcrypto.ClientBlind(rt.pub, tok) // different blinded message every time
			c, r := e.do("POST", "/drops/"+d+"/token", map[string]any{"blinded_msg": base64.StdEncoding.EncodeToString(bl), "tier": "gold"}, e.user("sybil", 1))
			switch {
			case c == 200:
				ok.Add(1)
			case c == 409 && r["error"] == "already_issued":
				dup.Add(1)
			default:
				t.Errorf("unexpected %d %v", c, r)
			}
		}()
	}
	wg.Wait()
	if ok.Load() != 1 || dup.Load() != 199 {
		t.Fatalf("one token per identity violated: ok=%d dup=%d", ok.Load(), dup.Load())
	}
	tok := make([]byte, 32)
	rand.Read(tok)
	bl, _, _, _ := fdcrypto.ClientBlind(rt.pub, tok)
	body := map[string]any{"blinded_msg": base64.StdEncoding.EncodeToString(bl), "tier": "gold"}
	_, r1 := e.do("POST", "/drops/"+d+"/token", body, e.user("u-retry", 1))
	_, r2 := e.do("POST", "/drops/"+d+"/token", body, e.user("u-retry", 1))
	if r1["blind_sig"] == nil || r1["blind_sig"] != r2["blind_sig"] {
		t.Fatal("retry must return the same blind signature", r1, r2)
	}
}

func TestEntryValidReusedBadSigIdempotent(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	tk, _ := e.getToken(d, "u1", "gold")
	c, r1 := e.register(d, tk, "gold", "key-1")
	if c != 200 {
		t.Fatal(c, r1)
	}
	rt, _, _ := e.a.rt(context.Background(), d)
	sig, _ := base64.StdEncoding.DecodeString(r1["server_sig"].(string))
	if !fdcrypto.VerifyEC(&rt.key.EC.PublicKey, fdcrypto.ReceiptMessage(d, r1["receipt_id"].(string), "gold", int64(r1["arrival_ms"].(float64))), sig) {
		t.Fatal("receipt signature invalid")
	}
	var wg sync.WaitGroup
	var bad atomic.Int32
	for i := 0; i < 300; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c, r := e.register(d, tk, "gold", "key-1")
			if c != 200 || r["receipt_id"] != r1["receipt_id"] || r["arrival_ms"] != r1["arrival_ms"] {
				bad.Add(1)
			}
		}()
	}
	wg.Wait()
	if bad.Load() != 0 {
		t.Fatal("idempotent retries diverged")
	}
	if c, r := e.register(d, tk, "gold", ""); c != 409 || r["error"] != "token_spent" {
		t.Fatal("reuse without key must be 409 token_spent", c, r)
	}
	if n, _ := e.a.rdb.HLen(context.Background(), dk(d, "entries")).Result(); n != 1 {
		t.Fatal("expected exactly 1 entry, got", n)
	}
	forged := token{base64.StdEncoding.EncodeToString(make([]byte, 32)), tk.sig}
	if c, r := e.register(d, forged, "gold", ""); c != 400 || r["error"] != "bad_sig" {
		t.Fatal("forged token accepted", c, r)
	}
	if c, _ := e.register(d, tk, "nope", ""); c != 400 {
		t.Fatal("bad tier")
	}
}

func TestTarpitBurnsToken(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	tk, _ := e.getToken(d, "scraper", "gold")
	c, r := e.do("POST", "/drops/"+d+"/register-fast", map[string]any{"token_msg": tk.msg, "sig": tk.sig, "tier": "gold"}, nil)
	if c != 200 || r["receipt_id"] == nil {
		t.Fatal("tarpit must look like success", c, r)
	}
	if c, _ := e.register(d, tk, "gold", ""); c != 409 {
		t.Fatal("tarpit token must be burned, got", c)
	}
	if n, _ := e.a.rdb.HLen(context.Background(), dk(d, "entries")).Result(); n != 0 {
		t.Fatal("tarpit must never create a real entry")
	}
}

func TestIllegalTransitionsAndWindowClosed(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 1}, 5, 3600_000)
	for _, to := range []string{"SCHEDULED", "LOCKED", "DRAWN", "CLAIM", "SETTLED", "OPEN"} {
		e.adv(d, to, 409)
	}
	tk, _ := e.getToken(d, "u1", "gold")
	e.adv(d, "CLOSED", 200)
	if c, r := e.register(d, tk, "gold", ""); c != 410 || r["error"] != "window_closed" {
		t.Fatal("register after close", c, r)
	}
	if _, c := e.getToken(d, "u2", "gold"); c != 410 {
		t.Fatal("token after close", c)
	}
	e.adv(d, "CLOSED", 409)
	e.adv(d, "LOCKED", 200)
	e.adv(d, "DRAWN", 200)
	e.adv(d, "LOCKED", 409)
}

func TestFullDrawIsReproducibleFromBundle(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 3, "general": 4}, 5, 3600_000)
	var toks []token
	for i := 0; i < 40; i++ {
		tier := []string{"gold", "general"}[i%2]
		tk, c := e.getToken(d, fmt.Sprintf("u%d", i), tier)
		if c != 200 {
			t.Fatal(c)
		}
		if c, _ := e.register(d, tk, tier, ""); c != 200 {
			t.Fatal(c)
		}
		toks = append(toks, tk)
	}
	e.adv(d, "CLOSED", 200)
	locked := e.adv(d, "LOCKED", 200)
	if locked["seed"] != nil {
		t.Fatal("seed must stay hidden until the draw")
	}
	if c, _ := e.do("GET", "/drops/"+d+"/verify", nil, nil); c != 409 {
		t.Fatal("bundle must not exist before draw")
	}
	drawn := e.adv(d, "DRAWN", 200)
	_, b := e.do("GET", "/drops/"+d+"/verify", nil, nil)
	seed, _ := hex.DecodeString(b["seed"].(string))
	sh := sha256.Sum256(seed)
	if h := hex.EncodeToString(sh[:]); h != b["seed_hash"] || h != drawn["seed_hash"] {
		t.Fatal("seed commitment mismatch")
	}
	var es []fdcrypto.Entry
	for _, x := range b["entries"].([]any) {
		p := x.([]any)
		es = append(es, fdcrypto.Entry{ReceiptID: p[0].(string), Tier: p[1].(string)})
	}
	tr, err := fdcrypto.BuildTree(es)
	if err != nil {
		t.Fatal(err)
	}
	root := tr.Root()
	if hex.EncodeToString(root[:]) != b["merkle_root"] || b["merkle_root"] != locked["merkle_root"] {
		t.Fatal("merkle root differs from the one published BEFORE the seed reveal")
	}
	fin := fdcrypto.FinalRandomness(seed, root, nil)
	byTier := map[string][]string{}
	for _, x := range es {
		byTier[x.Tier] = append(byTier[x.Tier], x.ReceiptID)
	}
	for tier, ids := range byTier {
		want := fdcrypto.Order(fin, ids)
		got := b["results"].(map[string]any)[tier].([]any)
		for i := range want {
			if got[i].(string) != want[i] {
				t.Fatalf("tier %s rank %d differs", tier, i)
			}
		}
	}
	for _, tk := range toks {
		rid := ridOf(d, tk)
		_, p := e.do("GET", "/drops/"+d+"/proof/"+rid, nil, nil)
		var path []fdcrypto.ProofStep
		pj, _ := json.Marshal(p["path"])
		json.Unmarshal(pj, &path)
		leaf := fdcrypto.Entry{ReceiptID: rid, Tier: p["leaf"].(map[string]any)["tier"].(string)}
		if !fdcrypto.VerifyProof(leaf, path, root) {
			t.Fatal("inclusion proof failed")
		}
	}
	c, cf := e.do("GET", "/admin/drops/"+d+"/counterfactuals", nil, e.admin())
	if c != 200 || cf["attempts_total"].(float64) != 40 {
		t.Fatal("counterfactuals", c, cf["attempts_total"])
	}
}

func TestClaimsRaceExpiryCascadeNoOversell(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 5}, 2, 3600_000)
	type ent struct {
		u string
		t token
	}
	var all []ent
	for i := 0; i < 20; i++ {
		u := fmt.Sprintf("u%d", i)
		tk, _ := e.getToken(d, u, "gold")
		e.register(d, tk, "gold", "")
		all = append(all, ent{u, tk})
	}
	for _, s := range []string{"CLOSED", "LOCKED", "DRAWN", "CLAIM"} {
		e.adv(d, s, 200)
	}
	var wg sync.WaitGroup
	var won sync.Map
	for _, x := range all {
		for k := 0; k < 5; k++ {
			wg.Add(1)
			go func(x ent) {
				defer wg.Done()
				c, r := e.do("POST", "/drops/"+d+"/claim", map[string]any{"token_msg": x.t.msg}, e.user(x.u, 1))
				if c == 200 {
					won.Store(x.u, int(r["seat_no"].(float64)))
				} else if c != 403 {
					t.Errorf("claim: %d %v", c, r)
				}
			}(x)
		}
	}
	wg.Wait()
	seats := map[int]string{}
	n := 0
	won.Range(func(k, v any) bool {
		if prev, dup := seats[v.(int)]; dup {
			t.Errorf("seat %d given to %s and %s", v, prev, k)
		}
		seats[v.(int)] = k.(string)
		n++
		return true
	})
	if n != 5 {
		t.Fatalf("expected exactly 5 claimed seats, got %d", n)
	}

	// nobody claims => cascade walks the waitlist, every live reservation has a unique seat
	d2 := e.mkDrop(map[string]int{"gold": 2}, 1, 3600_000)
	var toks []ent
	for i := 0; i < 6; i++ {
		u := fmt.Sprintf("v%d", i)
		tk, _ := e.getToken(d2, u, "gold")
		e.register(d2, tk, "gold", "")
		toks = append(toks, ent{u, tk})
	}
	for _, s := range []string{"CLOSED", "LOCKED", "DRAWN", "CLAIM"} {
		e.adv(d2, s, 200)
	}
	time.Sleep(1200 * time.Millisecond)
	dd, _ := e.a.loadDrop(context.Background(), d2)
	e.a.expireClaims(context.Background(), dd)
	reserved := map[string]string{}
	for _, x := range toks {
		rid := ridOf(d2, x.t)
		s, _ := e.a.rdb.HGetAll(context.Background(), dk(d2, "seat:"+rid)).Result()
		if s["status"] == "reserved" {
			if o, dup := reserved[s["seat_no"]]; dup {
				t.Fatalf("seat %s reserved twice (%s, %s)", s["seat_no"], o, rid)
			}
			reserved[s["seat_no"]] = rid
		}
	}
	if len(reserved) != 2 {
		t.Fatalf("cascade must keep exactly 2 live reservations, got %d", len(reserved))
	}
	ids, _ := e.a.rdb.LRange(context.Background(), dk(d2, "result:gold"), 0, 0).Result()
	for _, x := range toks {
		if ridOf(d2, x.t) == ids[0] {
			if c, r := e.do("POST", "/drops/"+d2+"/claim", map[string]any{"token_msg": x.t.msg}, e.user(x.u, 1)); c != 410 {
				t.Fatal("expired claim must be 410", c, r)
			}
		}
	}
}

func TestMaliciousServerDetected(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	var victim string
	for i := 0; i < 10; i++ {
		tk, _ := e.getToken(d, fmt.Sprintf("u%d", i), "gold")
		_, r := e.register(d, tk, "gold", "")
		if i == 3 {
			victim = r["receipt_id"].(string)
		}
	}
	if c, r := e.do("POST", "/test/malicious", map[string]any{"drop_id": d, "enabled": true, "receipt_id": victim}, map[string]string{"X-Test-Key": e.a.cfg.TestKey}); c != 200 {
		t.Fatal(c, r)
	}
	e.adv(d, "CLOSED", 200)
	locked := e.adv(d, "LOCKED", 200)
	if locked["entry_count"].(float64) != 9 {
		t.Fatal("entry should have been dropped")
	}
	if c, r := e.do("GET", "/drops/"+d+"/proof/"+victim, nil, nil); c != 404 || r["error"] != "not_included" {
		t.Fatal("victim must get not_included", c, r)
	}
	time.Sleep(2 * time.Second)
	_, in := e.do("GET", "/admin/drops/"+d+"/integrity", nil, e.admin())
	if in["violations"].(map[string]any)["missing_receipts"].(float64) != 1 {
		t.Fatal("integrity check must flag the missing receipt", in)
	}
}

func TestBaselineFCFSNoOversell(t *testing.T) {
	e := newEnv(t, true)
	_, ev := e.do("POST", "/admin/events", map[string]any{"name": "B", "venue": "V", "tiers": []map[string]any{{"name": "gold", "seats": 10, "price_cents": 1}}}, e.admin())
	_, d := e.do("POST", "/admin/drops", map[string]any{"event_id": ev["id"], "mode": "fcfs", "window_sec": 600}, e.admin())
	id := d["id"].(string)
	e.adv(id, "OPEN", 200)
	var wg sync.WaitGroup
	var ok atomic.Int32
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for k := 0; k < 3; k++ {
				if c, _ := e.do("POST", "/baseline/"+id+"/buy", map[string]any{"tier": "gold"}, e.user(fmt.Sprintf("u%d", i%7), 1)); c == 200 {
					ok.Add(1)
				}
			}
		}(i)
	}
	wg.Wait()
	if ok.Load() != 10 {
		t.Fatalf("sold %d of 10", ok.Load())
	}
	_, in := e.do("GET", "/admin/drops/"+id+"/integrity", nil, e.admin())
	if in["violations"].(map[string]any)["oversold"].(float64) != 0 {
		t.Fatal(in)
	}
}

func TestAllocateCapAndOrder(t *testing.T) {
	tiers := []Tier{{ID: "g", Seats: 3}}
	seq := []attempt{{ID: "1", Tier: "g", Actor: "bot"}, {ID: "2", Tier: "g", Actor: "bot"}, {ID: "3", Tier: "g", Actor: "bot"},
		{ID: "4", Tier: "g", Actor: "h1"}, {ID: "5", Tier: "g", Actor: "h2"}}
	w := allocate(seq, tiers, 2)["g"]
	if len(w) != 3 || w[0].Actor != "bot" || w[1].Actor != "bot" || w[2].Actor != "h1" {
		t.Fatalf("%+v", w)
	}
	_ = strings.Join
}

// ---- found by the red team (attack_engine/redteam.py): each of these was a real hole before the fix ----

func TestOnePhoneIsOneIdentityAndCodesAreCapped(t *testing.T) {
	e := newEnv(t, false)
	ids := map[string]bool{}
	for _, p := range []string{"+1 555 000 2222", "15550002222", "+1-(555)-000-2222"} {
		_, r := e.do("POST", "/auth/otp", map[string]any{"phone": p}, nil)
		c, v := e.do("POST", "/auth/verify", map[string]any{"phone": p, "otp": r["otp"]}, nil)
		if c != 200 {
			t.Fatal("verify", c, v)
		}
		ids[v["user_id"].(string)] = true
	}
	if len(ids) != 1 {
		t.Fatalf("one phone written 3 ways made %d identities", len(ids))
	}
	if c, _ := e.do("POST", "/auth/otp", map[string]any{"phone": "15550002222"}, nil); c != 429 {
		t.Fatal("4th code in 10 minutes must be refused, got", c)
	}
}

func TestWrongGuessesKillTheCodeAndAdminIsLockedOut(t *testing.T) {
	e := newEnv(t, false)
	_, r := e.do("POST", "/auth/otp", map[string]any{"phone": "15550003333"}, nil)
	good := r["otp"].(string)
	bad := "000000"
	if good == bad {
		bad = "000001"
	}
	for i := 0; i < 4; i++ {
		if c, _ := e.do("POST", "/auth/verify", map[string]any{"phone": "15550003333", "otp": bad}, nil); c != 401 {
			t.Fatal("wrong guess", i, c)
		}
	}
	if c, _ := e.do("POST", "/auth/verify", map[string]any{"phone": "15550003333", "otp": bad}, nil); c != 429 {
		t.Fatal("5th wrong guess must lock", c)
	}
	if c, _ := e.do("POST", "/auth/verify", map[string]any{"phone": "15550003333", "otp": good}, nil); c == 200 {
		t.Fatal("the code must be dead after too many wrong guesses")
	}
	ip := map[string]string{"X-Real-IP": "203.0.113.9"}
	for i := 0; i < 5; i++ {
		if c, _ := e.do("POST", "/admin/login", map[string]any{"username": "admin", "password": "nope"}, ip); c != 401 {
			t.Fatal("wrong password", c)
		}
	}
	if c, _ := e.do("POST", "/admin/login", map[string]any{"username": e.a.cfg.AdminUser, "password": e.a.cfg.AdminPass}, ip); c != 429 {
		t.Fatal("a locked address must stay locked even with the right password", c)
	}
	if c, _ := e.do("POST", "/admin/login", map[string]any{"username": e.a.cfg.AdminUser, "password": e.a.cfg.AdminPass}, map[string]string{"X-Real-IP": "203.0.113.10"}); c != 200 {
		t.Fatal("another address is unaffected", c)
	}
}

func TestRetryKeyBelongsToItsOwnTicketAndBigBodiesAreRefused(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	tv, _ := e.getToken(d, "victim", "gold")
	ta, _ := e.getToken(d, "attacker", "gold")
	c1, r1 := e.register(d, tv, "gold", "same-key")
	e.register(d, ta, "gold", "same-key") // the attacker reuses the victim's retry key
	c2, r2 := e.register(d, tv, "gold", "same-key")
	if c1 != 200 || c2 != 200 || r1["receipt_id"] != r2["receipt_id"] {
		t.Fatal("the victim's retry must still return the victim's own receipt", c2, r2)
	}
	huge := strings.Repeat("A", 100_000)
	if c, r := e.do("POST", "/drops/"+d+"/register", map[string]any{"token_msg": huge, "sig": huge, "tier": "gold"}, nil); c != 400 || r["error"] != "bad_request" {
		t.Fatal("an oversized body must be refused before parsing", c, r)
	}
}

func TestFlooderCannotLockOutNeighboursOnTheSameAddress(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	tk, _ := e.getToken(d, "neighbour", "gold")
	e.a.rdb.HSet(context.Background(), "config:guard", "enabled", "1", "ip_limit", "5")
	e.a.guardAt.Store(0)
	same := map[string]string{"X-Real-IP": "198.51.100.7"}
	limited := 0
	for i := 0; i < 40; i++ { // the flooder: forged tickets from the shared address
		if c, _ := e.do("POST", "/drops/"+d+"/register", map[string]any{"token_msg": base64.StdEncoding.EncodeToString(make([]byte, 32)), "sig": "AA==", "tier": "gold"}, same); c == 429 {
			limited++
		}
	}
	if limited == 0 {
		t.Fatal("the flood itself must be slowed down")
	}
	if c, r := e.do("POST", "/drops/"+d+"/register", map[string]any{"token_msg": tk.msg, "sig": tk.sig, "tier": "gold"}, same); c != 200 {
		t.Fatal("a real person on the same address must still get in, got", c, r)
	}
}

// A bot that does its own RFC 9474 blinding (attack_engine CRYPTO_SWARM) uses the real POST /token. The evaluation-only
// test-link note must credit its receipt to its account, must stay TEST_MODE-only, and the sale page must report the real
// open/close instants (the attack engine's boundary check reads them).
func TestRealBlindFlowTestLinkAndBoundaryFields(t *testing.T) {
	e := newEnv(t, true)
	d := e.mkDrop(map[string]int{"gold": 2}, 5, 3600_000)
	ctx := context.Background()
	rt, _, _ := e.a.rt(ctx, d)
	tok := make([]byte, 32)
	rand.Read(tok)
	bl, st, cl, err := fdcrypto.ClientBlind(rt.pub, tok)
	if err != nil {
		t.Fatal(err)
	}
	c, r := e.do("POST", "/drops/"+d+"/token", map[string]any{"blinded_msg": base64.StdEncoding.EncodeToString(bl), "tier": "gold"}, e.user("swarm-1", 1))
	if c != 200 {
		t.Fatal("real token request", c, r)
	}
	bs, _ := base64.StdEncoding.DecodeString(r["blind_sig"].(string))
	sig, err := cl.Finalize(st, bs)
	if err != nil {
		t.Fatal(err)
	}
	tk := token{base64.StdEncoding.EncodeToString(tok), base64.StdEncoding.EncodeToString(sig)}
	if c, r := e.register(d, tk, "gold", "k-swarm"); c != 200 {
		t.Fatal("register with a client-blinded token", c, r)
	}
	link := map[string]any{"token_msg": tk.msg}
	if c, _ := e.do("POST", "/drops/"+d+"/test-link", link, nil); c != 401 {
		t.Fatal("test-link needs the test key, got", c)
	}
	if c, _ := e.do("POST", "/drops/"+d+"/test-link", map[string]any{"token_msg": "AAAA"}, e.user("swarm-1", 1)); c != 400 {
		t.Fatal("a too-short token must be refused, got", c)
	}
	if c, r := e.do("POST", "/drops/"+d+"/test-link", link, e.user("swarm-1", 1)); c != 200 || r["receipt_id"] != ridOf(d, tk) {
		t.Fatal("test-link", c, r)
	}
	if u, _ := e.a.rdb.HGet(ctx, dk(d, "tok2user"), ridOf(d, tk)).Result(); u != "swarm-1" {
		t.Fatal("the evaluation link must name the account, got", u)
	}
	_, v := e.do("GET", "/drops/"+d, nil, nil)
	if v["opened_at_ms"] == nil || v["closed_at_ms"] != nil {
		t.Fatal("an open sale reports when it opened and nothing about closing", v)
	}
	e.adv(d, "CLOSED", 200)
	_, v = e.do("GET", "/drops/"+d, nil, nil)
	if v["closed_at_ms"] == nil || v["closed_at_ms"].(float64) < v["opened_at_ms"].(float64) {
		t.Fatal("a closed sale reports when it closed", v)
	}
}
