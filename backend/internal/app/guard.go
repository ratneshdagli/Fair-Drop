package app

import (
	"context"
	"net/http"
	"strconv"
	"time"

)

// guard: rate limits protect AVAILABILITY ONLY. Nothing in draw/claim/entry reads these counters,
// and the allocation (draw.go) never sees an IP. A rate-limited request simply gets 429.

type guardCfg struct {
	Enabled   bool
	IPLimit   int // requests per window per IP
	AcctLimit int // requests per window per account
	WindowMS  int
}

var defaultGuard = guardCfg{Enabled: true, IPLimit: 30, AcctLimit: 30, WindowMS: 1000}

func (a *App) guardConfig(ctx context.Context) guardCfg {
	if time.Now().UnixMilli()-a.guardAt.Load() < 1000 {
		if g := a.guard.Load(); g != nil {
			return *g
		}
	}
	g := defaultGuard
	if m, err := a.rdb.HGetAll(ctx, "config:guard").Result(); err == nil && len(m) > 0 {
		g.Enabled = m["enabled"] != "0"
		if v := atoi(m["ip_limit"]); v > 0 {
			g.IPLimit = v
		}
		if v := atoi(m["acct_limit"]); v > 0 {
			g.AcctLimit = v
		}
		if v := atoi(m["window_ms"]); v > 0 {
			g.WindowMS = v
		}
	}
	a.guard.Store(&g)
	a.guardAt.Store(time.Now().UnixMilli())
	return g
}

func (a *App) limited(w http.ResponseWriter, r *http.Request, scope string, n, limit int) {
	a.m.RateLimited.WithLabelValues(scope).Inc()
	a.m.Rejected.WithLabelValues("rate_limited").Inc()
	drop := dropFromPath(r.URL.Path)
	a.live(r.Context(), drop, "rate_limited", 1)
	a.feed(drop, "limit", scope, a.simActor(r), clientIP(a, r), "n", n, "l", limit)
	w.Header().Set("Retry-After", "1")
	fail(w, 429, "rate_limited")
}

func (a *App) count(ctx context.Context, key string, windowMS int) int {
	n, err := rlLua.Run(ctx, a.rdb, []string{key}, windowMS*2).Int()
	if err != nil {
		return 0 // fail open: availability guard must never block on its own failure
	}
	return n
}

func (a *App) guardIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g := a.guardConfig(r.Context())
		if g.Enabled {
			win := time.Now().UnixMilli() / int64(g.WindowMS)
			if n := a.count(r.Context(), "rl:ip:"+clientIP(a, r)+":"+strconv.FormatInt(win, 10), g.WindowMS); n > g.IPLimit {
				a.limited(w, r, "ip", n, g.IPLimit)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// guardIPHard is the safety ceiling for the fan endpoints: 10x the normal per-address limit, so a real flood from one address
// is cut off, but ordinary busy shared networks (an office, a campus, a mobile carrier) are not. Real fairness for those comes
// from badIP below: only requests that earned nothing count against an address.
func (a *App) guardIPHard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g := a.guardConfig(r.Context())
		if g.Enabled {
			win := time.Now().UnixMilli() / int64(g.WindowMS)
			if n := a.count(r.Context(), "rl:ip:"+clientIP(a, r)+":"+strconv.FormatInt(win, 10), g.WindowMS); n > g.IPLimit*10 {
				a.limited(w, r, "ip", n, g.IPLimit*10)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// badIP charges a request that earned nothing (forged, reused or repeated ticket) to its address and reports whether the address
// is over its limit (it then answers 429). A valid first-time ticket is never counted here, so a flooder sharing an address with
// real people cannot lock those people out.
func (a *App) badIP(w http.ResponseWriter, r *http.Request) bool {
	g := a.guardConfig(r.Context())
	if !g.Enabled {
		return false
	}
	win := time.Now().UnixMilli() / int64(g.WindowMS)
	if n := a.count(r.Context(), "rl:bad:"+clientIP(a, r)+":"+strconv.FormatInt(win, 10), g.WindowMS); n > g.IPLimit {
		a.limited(w, r, "ip", n, g.IPLimit)
		return true
	}
	return false
}

// guardAcct runs after auth (session endpoints only).
func (a *App) guardAcct(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g := a.guardConfig(r.Context())
		if g.Enabled {
			win := time.Now().UnixMilli() / int64(g.WindowMS)
			if n := a.count(r.Context(), "rl:acct:"+claimsOf(r).Subject+":"+strconv.FormatInt(win, 10), g.WindowMS); n > g.AcctLimit {
				a.limited(w, r, "account", n, g.AcctLimit)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
