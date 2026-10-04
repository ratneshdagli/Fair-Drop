package app

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type ctxKey int

const (
	ckClaims ctxKey = iota
)

type Claims struct {
	jwt.RegisteredClaims
	Role       string `json:"role"`
	VerifiedAt int64  `json:"vat"`
	Test       bool   `json:"test,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code string, extra ...any) {
	m := map[string]any{"error": code}
	for i := 0; i+1 < len(extra); i += 2 {
		m[extra[i].(string)] = extra[i+1]
	}
	writeJSON(w, status, m)
}

// decode reads a small JSON body. Every real request here is a few hundred bytes (a 2,048-bit signature is ~350 base64
// characters), so 64 KB is generous; anything bigger is refused before it is parsed (a bot sending huge bodies
// must not be able to eat server memory). Bulk test uploads use decodeMax.
func decode(r *http.Request, v any) error { return decodeMax(r, v, 64<<10) }

func decodeMax(r *http.Request, v any, max int64) error {
	r.Body = http.MaxBytesReader(nil, r.Body, max)
	return json.NewDecoder(r.Body).Decode(v)
}

func clientIP(a *App, r *http.Request) string {
	if a.cfg.TestMode {
		if s := r.Header.Get("X-Sim-IP"); s != "" {
			return s
		}
	}
	if s := r.Header.Get("X-Real-IP"); s != "" {
		return s
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

// simActor is the attack engine's ground-truth identity, recorded for evaluation only (TEST_MODE).
// Nothing in allocation code ever reads it.
func (a *App) simActor(r *http.Request) string {
	if a.cfg.TestMode {
		return r.Header.Get("X-Sim-Actor")
	}
	return ""
}

func (a *App) sign(sub, role string, vat int64, test bool, ttl time.Duration) (string, error) {
	c := Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: sub, ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)), IssuedAt: jwt.NewNumericDate(time.Now())},
		Role: role, VerifiedAt: vat, Test: test}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(a.jwtKey)
}

func (a *App) parseToken(r *http.Request) (*Claims, bool) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		// SSE (EventSource) cannot set headers; allow ?access_token= for the admin live stream only.
		if t := r.URL.Query().Get("access_token"); t != "" && strings.HasSuffix(r.URL.Path, "/live") {
			h = "Bearer " + t
		} else {
			return nil, false
		}
	}
	c := &Claims{}
	t, err := jwt.ParseWithClaims(strings.TrimPrefix(h, "Bearer "), c, func(t *jwt.Token) (any, error) { return a.jwtKey, nil },
		jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !t.Valid {
		return nil, false
	}
	return c, true
}

func (a *App) requireRole(role string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, ok := a.parseToken(r)
		if !ok {
			fail(w, 401, "unauthorized")
			return
		}
		if role != "" && c.Role != role {
			fail(w, 403, "forbidden")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ckClaims, c)))
	}
}

func claimsOf(r *http.Request) *Claims { return r.Context().Value(ckClaims).(*Claims) }

func (a *App) requireTest(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.cfg.TestMode {
			http.NotFound(w, r) // not exposed in production mode
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Test-Key")), []byte(a.cfg.TestKey)) != 1 {
			fail(w, 401, "bad_test_key")
			return
		}
		if r.Method != http.MethodGet { // a test mutation must be visible to the admin screens immediately
			a.adm.mu.Lock()
			a.adm.ents = map[string]*cacheEnt{}
			a.adm.mu.Unlock()
		}
		next(w, r)
	}
}

type statusRec struct {
	http.ResponseWriter
	code int
}

func (s *statusRec) WriteHeader(c int) { s.code = c; s.ResponseWriter.WriteHeader(c) }
func (s *statusRec) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (a *App) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		a.inflight.Add(1)
		sr := &statusRec{ResponseWriter: w, code: 200}
		next.ServeHTTP(sr, r)
		a.inflight.Add(-1)
		ep := chi.RouteContext(r.Context()).RoutePattern()
		if ep == "" {
			ep = "unmatched"
		}
		d := time.Since(start)
		a.reqTotal.Add(1)
		a.m.observe(ep, r.Method, sr.code, d)
		a.traceReq(r, ep, sr.code, d)
		if sr.code >= 500 {
			a.err5xx.Add(1)
		}
		// response time is what a FAN experiences: the admin screens' own polling must not skew it
		if !strings.HasSuffix(ep, "/live") && ep != "/metrics" && !strings.HasPrefix(ep, "/admin") && (!strings.HasPrefix(ep, "/test") || ep == "/test/login") {
			a.lat.add(d)
		}
	})
}

func (a *App) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(a.instrument)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("X-Replica", a.cfg.ReplicaID)
			next.ServeHTTP(w, req)
		})
	})
	r.Handle("/metrics", promhttp.HandlerFor(a.m.reg, promhttp.HandlerOpts{}))
	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		if err := a.rdb.Ping(ctx).Err(); err != nil {
			fail(w, 503, "redis_down")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "replica": a.cfg.ReplicaID, "test_mode": a.cfg.TestMode, "token_mode": a.cfg.BlindMode})
	})

	// auth
	r.With(a.guardIP).Post("/auth/otp", a.hOTP)
	r.With(a.guardIP).Post("/auth/verify", a.hVerify)
	r.With(a.guardIP).Post("/admin/login", a.hAdminLogin)

	// public drop info
	r.Get("/drops", a.hListDrops)
	r.Get("/drops/{id}", a.hGetDrop)
	r.Get("/drops/{id}/proof/{receipt}", a.hProof)
	r.Get("/drops/{id}/result/{receipt}", a.hResult)
	r.Get("/drops/{id}/verify", a.hVerifyBundle)
	r.Get("/drops/{id}/seats", a.hSeats)

	// fan flow
	// No per-address ceiling on getting a ticket or entering: only USELESS requests (forged, reused, repeated: see badIP) count against an
	// address, so a flooder sharing an office / campus / carrier address can never lock real people out. (Volumetric DDoS belongs to a CDN/WAF in front.)
	r.With(a.mw("user"), a.guardAcct).Post("/drops/{id}/token", a.hToken)
	r.Post("/drops/{id}/register", a.hRegister)
	r.Post("/drops/{id}/register-fast", a.hTarpit) // decoy, see entry.go
	r.With(a.guardIPHard, a.mw("user"), a.guardAcct).Post("/drops/{id}/claim", a.hClaim)
	r.Get("/me/tickets", a.requireRole("user", a.hTickets))
	r.With(a.guardIPHard, a.mw("user"), a.guardAcct).Post("/baseline/{id}/buy", a.hBaselineBuy)

	// admin
	r.Route("/admin", func(ad chi.Router) {
		ad.Use(a.mw("admin"))
		ad.Use(a.adminLayer)
		ad.Post("/events", a.hCreateEvent)
		ad.Get("/events", a.hListEvents)
		ad.Post("/drops", a.hCreateDrop)
		ad.Get("/drops", a.hAdminListDrops)
		ad.Post("/drops/{id}/advance", a.hAdvance)
		ad.Get("/drops/{id}/live", a.hLive)
		ad.Get("/drops/{id}/counterfactuals", a.hCounterfactuals)
		ad.Get("/drops/{id}/audit", a.hAudit)
		ad.Get("/drops/{id}/integrity", a.hIntegrity)
		ad.Get("/drops/{id}/feed", a.hFeed)
		ad.Get("/drops/{id}/trace", a.hTrace)
		ad.Get("/drops/{id}/protection", a.hProtection)
		ad.Get("/drops/{id}/pulse", a.hPulse)
		ad.Get("/drops/{id}/claims", a.hClaimsSummary)
		ad.Get("/drops/{id}/baseline", a.hBaselineResult)
		ad.Get("/experiments", a.hListExperiments)
		ad.Get("/experiments/{id}", a.hGetExperiment)
		ad.Get("/config", a.hGetConfig)
	})

	// testkit (TEST_MODE + X-Test-Key only)
	r.Post("/test/seed", a.requireTest(a.hTestSeed))
	r.Post("/test/login", a.requireTest(a.hTestLogin))
	r.Post("/test/reset", a.requireTest(a.hTestReset))
	r.Post("/test/clear", a.requireTest(a.hTestClear))
	r.Post("/test/labels", a.requireTest(a.hTestLabels))
	r.Get("/test/labels", a.requireTest(a.hTestGetLabels))
	r.Post("/test/malicious", a.requireTest(a.hTestMalicious))
	r.Post("/test/config", a.requireTest(a.hTestConfig))
	r.Post("/test/experiments", a.requireTest(a.hTestPostExperiment))
	r.Post("/test/die", a.requireTest(a.hTestDie))
	r.Post("/test/tamper-audit", a.requireTest(a.hTestTamper))
	r.Get("/baseline/{id}/status", a.hBaselineStatus)
	r.Post("/drops/{id}/test-token", a.requireTest(a.requireRole("user", a.hTestToken)))
	r.Post("/drops/{id}/test-link", a.requireTest(a.requireRole("user", a.hTestLink)))
	r.Post("/test/admin-token", a.requireTest(a.hTestAdminToken))
	return r
}

var errBadReq = errors.New("bad request")

// mw is requireRole as chi middleware.
func (a *App) mw(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler { return a.requireRole(role, next.ServeHTTP) }
}
