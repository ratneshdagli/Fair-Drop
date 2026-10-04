package app

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"fairdrop/internal/fdcrypto"
	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

// The decision feed: one record per decision the protection layer makes (accept / reject, and why).
// It is what the admin "Live Show" draws and what /protection audits. It never feeds allocation.
// Writes are batched off the request path; if the buffer is full the record is dropped (availability first).

const feedMax = 800000

func (a *App) startFeed(ctx context.Context) {
	a.feedCh = make(chan feedRec, 50000)
	go func() {
		for {
			var batch []feedRec
			select {
			case <-ctx.Done():
				return
			case r := <-a.feedCh:
				batch = append(batch, r)
			}
			t := time.After(15 * time.Millisecond)
		fill:
			for len(batch) < 500 {
				select {
				case r := <-a.feedCh:
					batch = append(batch, r)
				case <-t:
					break fill
				}
			}
			pipe := a.rdb.Pipeline()
			for _, r := range batch {
				pipe.XAdd(ctx, &redis.XAddArgs{Stream: dk(r.drop, "feed"), MaxLen: feedMax, Approx: true, Values: r.v})
			}
			pipe.Exec(ctx)
		}
	}()
}

type feedRec struct {
	drop string
	v    []any
}

// feed records one decision. stage: token|register|tarpit|buy|limit. (Claim requests and the TEST_MODE test-link note are not decisions
// of this kind: they write no feed record, so protection() neither counts nor grades them; seat safety is checked by integrity().) In production (no TEST_MODE) token events
// carry no actor/ip so the feed cannot be used to link a token to a later anonymous registration.
func (a *App) feed(drop, stage, outcome, actor, ip string, kv ...any) {
	a.feedAt(drop, nowMS(), stage, outcome, actor, ip, kv...)
}

// feedAt is feed with an explicit decision time (Redis TIME where the decision was made atomically), so that
// the audit can order decisions exactly instead of by when this replica happened to write them down.
func (a *App) feedAt(drop string, at int64, stage, outcome, actor, ip string, kv ...any) {
	if drop == "" || a.feedCh == nil {
		return
	}
	if !a.cfg.TestMode && stage == "token" {
		actor, ip = "", ""
	}
	v := append([]any{"t", at, "s", stage, "o", outcome, "a", actor, "ip", ip}, kv...)
	select {
	case a.feedCh <- feedRec{drop, v}:
	default:
	}
}

func dropFromPath(p string) string {
	parts := strings.Split(strings.Trim(p, "/"), "/")
	for i, s := range parts {
		if (s == "drops" || s == "baseline") && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func (a *App) actorOf(r *http.Request, fallback string) string {
	if s := a.simActor(r); s != "" {
		return s
	}
	return fallback
}

type labelMap struct {
	mu sync.Mutex
	at time.Time
	m  map[string]string
}

var lmap labelMap

func (a *App) labels(ctx context.Context) map[string]string {
	lmap.mu.Lock()
	defer lmap.mu.Unlock()
	if lmap.m != nil && time.Since(lmap.at) < 3*time.Second {
		return lmap.m
	}
	m, err := a.rdb.HGetAll(ctx, "labels").Result()
	if err == nil {
		lmap.m, lmap.at = m, time.Now()
	}
	return lmap.m
}

// label value is "kind|operator|profile" (profile = the bot type, evaluation only)
func kindOp(lbl map[string]string, actor string) (string, string) {
	v := lbl[actor]
	if v == "" {
		return "unknown", ""
	}
	p := strings.SplitN(v, "|", 3)
	if len(p) < 2 {
		return p[0], ""
	}
	return p[0], p[1]
}

func profOf(lbl map[string]string, actor string) string {
	p := strings.SplitN(lbl[actor], "|", 3)
	if len(p) == 3 && p[2] != "" {
		return p[2]
	}
	if len(p) > 0 && p[0] == "human" {
		return "HUMAN"
	}
	return ""
}

// plain reason a request was rejected (same keys as the audit table)
func reasonKey(s, o string) string {
	switch s + "/" + o {
	case "limit/ip", "limit/account":
		return "rate_limited"
	case "register/spent":
		return "token_already_used"
	case "token/already_issued":
		return "already_issued"
	case "token/ineligible":
		return "not_eligible"
	case "token/closed", "token/not_open", "register/closed", "buy/closed":
		return "window_closed"
	case "register/bad_sig":
		return "forged_signature"
	case "tarpit/tarpit":
		return "decoy_endpoint"
	case "buy/capped":
		return "per_account_cap"
	case "buy/soldout":
		return "sold_out"
	}
	return s + "_" + o
}

// accepted / absorbed / rejected classes for display
func verdict(stage, o string) string {
	switch {
	case o == "ok":
		return "accepted"
	case o == "replay":
		return "absorbed"
	case stage == "tarpit":
		return "decoy"
	}
	return "rejected"
}

// GET /admin/drops/{id}/feed?after=<id>: new decisions since the cursor (sampled for drawing) plus exact rates for the last 3 s.
func (a *App) hFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	after := r.URL.Query().Get("after")
	key := dk(id, "feed")
	lbl := a.labels(ctx)
	var msgs []redis.XMessage
	if pfq := r.URL.Query().Get("pf"); pfq != "" && after == "" {
		// history of ONE bot kind: the newest 40 recorded decisions of that kind, even when it has been quiet for a while (the normal feed only keeps the newest few hundred overall)
		all, _ := a.rdb.XRevRangeN(ctx, key, "+", "-", 40000).Result()
		out := make([]map[string]any, 0, 40)
		for _, m := range all {
			ac, _ := m.Values["a"].(string)
			if profOf(lbl, ac) != pfq {
				continue
			}
			st, _ := m.Values["s"].(string)
			o, _ := m.Values["o"].(string)
			if st == "token" && o == "ok" {
				continue
			}
			k, op := kindOp(lbl, ac)
			ip, _ := m.Values["ip"].(string)
			out = append(out, map[string]any{"id": m.ID, "t": atoi64(strVal(m.Values["t"])), "s": st, "o": o, "v": verdict(st, o), "k": k, "op": op, "pf": pfq, "a": ac, "ip": ip})
			if len(out) == 40 {
				break
			}
		}
		writeJSON(w, 200, map[string]any{"events": out, "cursor": "", "history": true})
		return
	}
	if after == "" {
		msgs, _ = a.rdb.XRevRangeN(ctx, key, "+", "-", 120).Result()
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
	} else {
		msgs, _ = a.rdb.XRangeN(ctx, key, "("+after, "+", 6000).Result()
	}
	cursor := after
	if len(msgs) > 0 {
		cursor = msgs[len(msgs)-1].ID
	}
	step := 1
	if len(msgs) > 300 {
		step = len(msgs)/300 + 1
	}
	type ev struct {
		ID, S, O, V, K, Op, A, IP string
		T                         int64
	}
	out := make([]map[string]any, 0, 320)
	cnt := map[string]int{}
	for i, m := range msgs {
		s, _ := m.Values["s"].(string)
		o, _ := m.Values["o"].(string)
		if s == "token" && o == "ok" {
			continue // an intermediate step, not an outcome: the person is "accepted" when they enter
		}
		ac, _ := m.Values["a"].(string)
		k, op := kindOp(lbl, ac)
		v := verdict(s, o)
		cnt[k+"/"+v]++
		if i%step == 0 {
			ip, _ := m.Values["ip"].(string)
			out = append(out, map[string]any{"id": m.ID, "t": atoi64(strVal(m.Values["t"])), "s": s, "o": o, "v": v, "k": k, "op": op, "pf": profOf(lbl, ac), "a": ac, "ip": ip})
		}
	}
	// exact rates over the last 3 s
	now := nowMS()
	recent, _ := a.rdb.XRevRangeN(ctx, key, "+", "-", 12000).Result()
	active := map[string]struct{}{}
	rc := map[string]int{}
	for _, m := range recent {
		if atoi64(strVal(m.Values["t"])) < now-3000 {
			break
		}
		s, _ := m.Values["s"].(string)
		o, _ := m.Values["o"].(string)
		ac, _ := m.Values["a"].(string)
		k, _ := kindOp(lbl, ac)
		if ac != "" {
			active[ac] = struct{}{}
		}
		if s == "token" && o == "ok" {
			continue
		}
		rc[k+"/"+verdict(s, o)]++
		rc["all"]++
	}
	total, _ := a.rdb.XLen(ctx, key).Result()
	writeJSON(w, 200, map[string]any{"events": out, "cursor": cursor, "batch": cnt, "total": total,
		"active_users_3s": len(active), "per_sec_3s": rateMap(rc, 3), "now_ms": now})
}

func rateMap(m map[string]int, secs float64) map[string]float64 {
	o := map[string]float64{}
	for k, v := range m {
		o[k] = float64(v) / secs
	}
	return o
}

func strVal(x any) string {
	if s, ok := x.(string); ok {
		return s
	}
	return ""
}

// ---------------------------------------------------------------------------------------------------
// Protection audit. Every recorded decision is re-judged by an oracle built from independent facts
// (verified_at, cutoff, window timestamps, earlier events, signature re-verification), not from the server's verdict.

type prot struct {
	at  time.Time
	val map[string]any
}

var protCache sync.Map

func (a *App) hProtection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if c, ok := protCache.Load(id); ok && time.Since(c.(*prot).at) < 3*time.Second {
		writeJSON(w, 200, c.(*prot).val)
		return
	}
	val, err := a.protection(r.Context(), id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	protCache.Store(id, &prot{time.Now(), val})
	writeJSON(w, 200, val)
}

type pev struct {
	id, s, o, a, ip, r, tier string
	t                        int64
	n, l                     int
	tk, sg                   string
}

func (a *App) protection(ctx context.Context, id string) (map[string]any, error) {
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		return nil, err
	}
	rt, _, _ := a.rt(ctx, id)
	raw, _ := a.rdb.HGetAll(ctx, "drop:"+id).Result()
	atOpen, atClosed := atoi64(raw["at_OPEN"]), atoi64(raw["at_CLOSED"])
	verified, _ := a.rdb.HGetAll(ctx, "users:verified").Result()
	lbl := a.labels(ctx)
	seatsOf := map[string]int{}
	for _, t := range d.Tiers {
		seatsOf[t.ID] = t.Seats
	}
	var evs []pev
	start := "-"
	for {
		msgs, err := a.rdb.XRangeN(ctx, dk(id, "feed"), start, "+", 20000).Result()
		if err != nil {
			break
		}
		for _, m := range msgs {
			if m.ID == start {
				continue
			}
			g := func(k string) string { return strVal(m.Values[k]) }
			evs = append(evs, pev{id: m.ID, s: g("s"), o: g("o"), a: g("a"), ip: g("ip"), r: g("r"), tier: g("tier"), t: atoi64(g("t")),
				n: atoi(g("n")), l: atoi(g("l")), tk: g("tk"), sg: g("sg")})
		}
		if len(msgs) < 20000 {
			break
		}
		start = msgs[len(msgs)-1].ID
	}
	// replicas flush their buffers independently, so stream order is not time order: judge in event-time order
	// (two decisions in the same millisecond: the accepting one is what made the later rejection correct)
	sort.SliceStable(evs, func(i, j int) bool {
		if evs[i].t != evs[j].t {
			return evs[i].t < evs[j].t
		}
		return evs[i].o == "ok" && evs[j].o != "ok"
	})
	open := func(t int64) bool { return (atOpen == 0 || t >= atOpen) && (atClosed == 0 || t < atClosed) }

	// confusion on requests: positive = "should be rejected" (oracle), predicted positive = server rejected
	type cm struct{ TP, FP, FN, TN, Absorbed, Throttled int }
	conf := map[string]*cm{"human": {}, "bot": {}, "unknown": {}, "all": {}}
	add := func(kind, cell string) {
		for _, k := range []string{kind, "all"} {
			c := conf[k]
			switch cell {
			case "TP":
				c.TP++
			case "FP":
				c.FP++
			case "FN":
				c.FN++
			case "TN":
				c.TN++
			case "ABS":
				c.Absorbed++
			case "THR":
				c.Throttled++
			}
		}
	}
	type aud struct{ Rejected, Verified, Wrong, Unverifiable int }
	audit := map[string]*aud{}
	au := func(reason string) *aud {
		if audit[reason] == nil {
			audit[reason] = &aud{}
		}
		return audit[reason]
	}
	tokOK := map[string]bool{}     // actor already holds a token
	regReceipt := map[string]bool{} // receipt already registered
	buys := map[string]int{}        // actor -> seats bought (fcfs)
	sold := map[string]int{}        // tier -> seats sold (fcfs)
	entered := map[string]bool{}
	firstOK := map[string]bool{} // actor made a first successful decision
	throttledBefore := map[string]bool{}
	delayed := map[string]bool{}
	attempted := map[string]bool{}
	reqByKind := map[string]map[string]int{"human": {}, "bot": {}, "unknown": {}}
	// per bot type: how many requests, how they ended, and the reasons they were turned away
	type prof struct {
		Requests, Accepted, Rejected, Absorbed, Decoy, Identities, Entered int
		Reasons                                                            map[string]int
	}
	byProf := map[string]*prof{}
	// arrivals: requests per second since the first decision, per bot kind (HUMAN for people). Lets the admin compare how people and bots arrive
	// (steady crowd vs synchronised bursts) without shipping every event to the browser.
	var t0 int64
	for _, e := range evs {
		if e.t > 0 && (t0 == 0 || e.t < t0) {
			t0 = e.t
		}
	}
	arrivals := map[string][]int{}
	pf := func(name string) *prof {
		if byProf[name] == nil {
			byProf[name] = &prof{Reasons: map[string]int{}}
		}
		return byProf[name]
	}
	for _, e := range evs {
		kind, _ := kindOp(lbl, e.a)
		if e.a != "" {
			attempted[e.a] = true
		}
		v := verdict(e.s, e.o)
		if !(e.s == "token" && e.o == "ok") { // getting a ticket is a step, not an outcome: count a person once (when they enter)
			reqByKind[kind][v]++
			reqByKind[kind]["all"]++
		}
		if p := profOf(lbl, e.a); p != "" && !(e.s == "token" && e.o == "ok") {
			if sec := int((e.t - t0) / 1000); sec >= 0 && sec < 3600 {
				for len(arrivals[p]) <= sec {
					arrivals[p] = append(arrivals[p], 0)
				}
				arrivals[p][sec]++
			}
			q := pf(p)
			q.Requests++
			switch v {
			case "accepted":
				q.Accepted++
			case "absorbed":
				q.Absorbed++
			case "decoy":
				q.Decoy++
				q.Reasons[reasonKey(e.s, e.o)]++
			default:
				q.Rejected++
				q.Reasons[reasonKey(e.s, e.o)]++
			}
		}
		switch e.s {
		case "limit":
			ar := au("rate_limited")
			ar.Rejected++
			if e.n > e.l && e.l > 0 {
				ar.Verified++
			} else {
				ar.Wrong++
			}
			if firstOK[e.a] {
				add(kind, "TP") // an extra request from someone who already entered, throttled
			} else {
				add(kind, "THR") // a request before the first success: only a delay, counted separately
				if e.a != "" {
					throttledBefore[e.a] = true
				}
			}
		case "token":
			elig := verified[e.a] != "" && atoi64(verified[e.a]) <= d.CutoffMS
			if e.a == "" {
				elig = true // production: actor not logged, cannot judge eligibility here
			}
			legit := elig && open(e.t) && !tokOK[e.a]
			switch e.o {
			case "ok":
				if legit {
					add(kind, "TN")
				} else {
					add(kind, "FN")
				}
				tokOK[e.a] = true
			case "ineligible":
				ar := au("not_eligible")
				ar.Rejected++
				if e.a != "" && !elig {
					ar.Verified++
					add(kind, "TP")
				} else if e.a == "" {
					ar.Unverifiable++
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			case "already_issued":
				ar := au("already_issued")
				ar.Rejected++
				if tokOK[e.a] || e.a == "" {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			case "closed", "not_open":
				ar := au("window_closed")
				ar.Rejected++
				if !open(e.t) {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			}
		case "register":
			switch e.o {
			case "ok":
				if !regReceipt[e.r] && open(e.t) {
					add(kind, "TN")
				} else {
					add(kind, "FN")
				}
				regReceipt[e.r] = true
				if e.a != "" {
					entered[e.a], firstOK[e.a] = true, true
					if throttledBefore[e.a] {
						delayed[e.a] = true
					}
				}
			case "replay":
				add(kind, "ABS")
			case "spent":
				ar := au("token_already_used")
				ar.Rejected++
				if regReceipt[e.r] {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			case "closed":
				ar := au("window_closed")
				ar.Rejected++
				if !open(e.t) {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			case "bad_sig":
				ar := au("forged_signature")
				ar.Rejected++
				tok, sig := unb64s(e.tk), unb64s(e.sg)
				if rt != nil && tok != nil && sig != nil {
					if fdcrypto.VerifyToken(rt.pub, tok, sig) != nil {
						ar.Verified++
						add(kind, "TP")
					} else {
						ar.Wrong++
						add(kind, "FP")
					}
				} else {
					ar.Unverifiable++
					add(kind, "TP")
				}
			}
		case "claim", "link":
			// never recorded today; if such a stage is ever added it is deliberately not graded here (see the comment on feed)
		case "tarpit":
			ar := au("decoy_endpoint")
			ar.Rejected++
			ar.Verified++ // the decoy path never enters the real list by construction (checked by integrity counters)
			add(kind, "TP")
		case "buy":
			switch e.o {
			case "ok":
				legit := open(e.t) && buys[e.a] < a.cfg.MaxPerAcct && sold[e.tier] < seatsOf[e.tier]
				if legit {
					add(kind, "TN")
				} else {
					add(kind, "FN")
				}
				buys[e.a]++
				sold[e.tier]++
				if e.a != "" {
					entered[e.a], firstOK[e.a] = true, true
					if throttledBefore[e.a] {
						delayed[e.a] = true
					}
				}
			case "capped":
				ar := au("per_account_cap")
				ar.Rejected++
				if buys[e.a] >= a.cfg.MaxPerAcct {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			case "soldout":
				ar := au("sold_out")
				ar.Rejected++
				if sold[e.tier] >= seatsOf[e.tier] {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			case "closed":
				ar := au("window_closed")
				ar.Rejected++
				if !open(e.t) {
					ar.Verified++
					add(kind, "TP")
				} else {
					ar.Wrong++
					add(kind, "FP")
				}
			}
		}
	}
	// per-person outcomes (needs labels)
	people := map[string]map[string]int{"human": {}, "bot": {}, "unknown": {}}
	for ac := range attempted {
		k, _ := kindOp(lbl, ac)
		people[k]["attempted"]++
		if p := profOf(lbl, ac); p != "" {
			pf(p).Identities++
			if entered[ac] {
				pf(p).Entered++
			}
		}
		if entered[ac] {
			people[k]["entered"]++
			if delayed[ac] {
				people[k]["delayed_then_entered"]++
			}
		} else {
			people[k]["not_entered"]++
		}
	}
	return map[string]any{"drop_id": id, "mode": d.Mode, "decisions": len(evs), "confusion": conf, "audit": audit, "people": people, "by_profile": byProf, "requests_by_kind": reqByKind, "arrivals": arrivals,
		"notes": map[string]string{
			"positive": "oracle says the request should be rejected (repeat, forged, late, ineligible, decoy)",
			"FP":       "a request the oracle says was fine but the server rejected",
			"FN":       "a request the oracle says should be rejected but the server accepted",
			"throttled": "429 on a first attempt: a delay for a legitimate user, not a final rejection; their final outcome is in people.*",
			"absorbed":  "idempotent replay: same receipt returned, no extra entry created"}}, nil
}

func unb64s(s string) []byte {
	if s == "" {
		return nil
	}
	b, err := unb64(s)
	if err != nil {
		return nil
	}
	return b
}

func clip(s string) string {
	if len(s) > 400 {
		return s[:400]
	}
	return s
}

func (a *App) feedToken(drop, actor, ip string, st int, code string) {
	o := "ok"
	switch code {
	case "already_issued":
		o = "already_issued"
	case "window_closed":
		o = "closed"
	case "not_open_yet":
		o = "not_open"
	default:
		if st != 200 {
			return
		}
	}
	a.feed(drop, "token", o, actor, ip)
}
