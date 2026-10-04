package app

import (
	"bytes"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Admin read layer: (1) 1 s TTL cache + request coalescing so N open dashboard tabs cost ONE computation per
// (path+query), (2) a per-IP token bucket. Both sit AFTER auth, so a cached body is never served to an unauthenticated caller.
// Writes (non-GET) are never cached and wipe the cache; /live (SSE) and X-Test-Key requests bypass both.
// ponytail: per-process cache (3 replicas => up to 3 computations/s per key, staleness <= 1 s); share via Redis only if that shows up.

const adminTTL = time.Second

type cacheEnt struct {
	done   chan struct{}
	status int
	ctype  string
	body   []byte
	at     time.Time
}

type adminLayer struct {
	mu      sync.Mutex
	ents    map[string]*cacheEnt
	buckets map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

const (
	adminRate  = 20.0 // requests/s per IP
	adminBurst = 40.0
)

func newAdminLayer() *adminLayer {
	return &adminLayer{ents: map[string]*cacheEnt{}, buckets: map[string]*bucket{}}
}

func (l *adminLayer) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.buckets[ip]
	if b == nil {
		if len(l.buckets) > 4096 { // bound memory: forget idle addresses
			for k, v := range l.buckets {
				if now.Sub(v.last) > time.Minute {
					delete(l.buckets, k)
				}
			}
		}
		b = &bucket{tokens: adminBurst, last: now}
		l.buckets[ip] = b
	}
	b.tokens += now.Sub(b.last).Seconds() * adminRate
	if b.tokens > adminBurst {
		b.tokens = adminBurst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

type bufRec struct {
	h      http.Header
	status int
	buf    bytes.Buffer
}

func (b *bufRec) Header() http.Header         { return b.h }
func (b *bufRec) WriteHeader(c int)           { b.status = c }
func (b *bufRec) Write(p []byte) (int, error) { return b.buf.Write(p) }

func (a *App) adminLayer(next http.Handler) http.Handler {
	l := a.adm
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (a.cfg.TestMode && r.Header.Get("X-Test-Key") == a.cfg.TestKey && a.cfg.TestKey != "") || strings.HasSuffix(r.URL.Path, "/live") {
			next.ServeHTTP(w, r)
			return
		}
		if !l.allow(clientIP(a, r), time.Now()) {
			a.m.RateLimited.WithLabelValues("admin_ip").Inc()
			w.Header().Set("Retry-After", "1")
			fail(w, 429, "rate_limited")
			return
		}
		if r.Method != http.MethodGet {
			l.mu.Lock()
			l.ents = map[string]*cacheEnt{}
			l.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}
		key := r.URL.Path + "?" + r.URL.RawQuery
		l.mu.Lock()
		e := l.ents[key]
		if e != nil {
			select {
			case <-e.done: // finished: fresh enough?
				if time.Since(e.at) >= adminTTL {
					e = nil
				}
			default: // in flight: join it
			}
		}
		if e == nil {
			if len(l.ents) > 256 {
				for k, v := range l.ents {
					select {
					case <-v.done:
						if time.Since(v.at) >= adminTTL {
							delete(l.ents, k)
						}
					default:
					}
				}
			}
			e = &cacheEnt{done: make(chan struct{})}
			l.ents[key] = e
			l.mu.Unlock()
			rec := &bufRec{h: http.Header{}, status: 200}
			func() {
				defer func() { // a panic must not leave waiters hanging
					if recover() != nil {
						rec.status = 500
						rec.buf.Reset()
						rec.buf.WriteString(`{"error":"internal"}` + "\n")
					}
					e.status, e.ctype, e.body, e.at = rec.status, rec.h.Get("Content-Type"), rec.buf.Bytes(), time.Now()
					if e.status != 200 { // only successes are kept
						l.mu.Lock()
						if l.ents[key] == e {
							delete(l.ents, key)
						}
						l.mu.Unlock()
					}
					close(e.done)
				}()
				next.ServeHTTP(rec, r)
			}()
		} else {
			l.mu.Unlock()
			select {
			case <-e.done:
			case <-r.Context().Done():
				return
			}
		}
		if e.ctype != "" {
			w.Header().Set("Content-Type", e.ctype)
		}
		w.WriteHeader(e.status)
		w.Write(e.body)
	})
}
