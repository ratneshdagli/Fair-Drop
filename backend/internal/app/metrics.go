package app

import (
	"context"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

type metrics struct {
	reg           *prometheus.Registry
	reqs          *prometheus.CounterVec
	dur           *prometheus.HistogramVec
	Rejected      *prometheus.CounterVec
	TokensIssued  prometheus.Counter
	Entries       prometheus.Counter
	TokenReuse    prometheus.Counter
	TarpitHits    prometheus.Counter
	RateLimited   *prometheus.CounterVec
	Claims        *prometheus.CounterVec
	Allocations   prometheus.Counter
	Reservations  prometheus.Counter
	QueueSize     prometheus.Gauge
	DrawsDone     prometheus.Counter
	Transitions   *prometheus.CounterVec
	LedgerWritten prometheus.Counter
}

func newMetrics() *metrics {
	m := &metrics{reg: prometheus.NewRegistry()}
	f := func(c prometheus.Collector) { m.reg.MustRegister(c) }
	m.reqs = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fd_http_requests_total", Help: "HTTP requests"}, []string{"endpoint", "method", "status"})
	m.dur = prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "fd_http_request_seconds", Help: "latency",
		Buckets: []float64{.001, .0025, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10}}, []string{"endpoint"})
	m.Rejected = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fd_requests_rejected_total", Help: "rejected by reason"}, []string{"reason"})
	m.TokensIssued = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_tokens_issued_total", Help: "tokens issued"})
	m.Entries = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_entries_registered_total", Help: "entries"})
	m.TokenReuse = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_token_reuse_total", Help: "reused tokens"})
	m.TarpitHits = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_tarpit_hits_total", Help: "tarpit hits"})
	m.RateLimited = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fd_rate_limited_total", Help: "rate limited"}, []string{"scope"})
	m.Claims = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fd_claim_total", Help: "claims by result"}, []string{"result"})
	m.Allocations = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_allocation_total", Help: "seats allocated"})
	m.Reservations = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_reservation_total", Help: "seat reservations at draw / cascade"})
	m.QueueSize = prometheus.NewGauge(prometheus.GaugeOpts{Name: "fd_ledger_queue_size", Help: "ledger events pending"})
	m.DrawsDone = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_draws_total", Help: "draws"})
	m.Transitions = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "fd_transitions_total", Help: "state transitions"}, []string{"to"})
	m.LedgerWritten = prometheus.NewCounter(prometheus.CounterOpts{Name: "fd_ledger_written_total", Help: "audit rows"})
	for _, c := range []prometheus.Collector{m.reqs, m.dur, m.Rejected, m.TokensIssued, m.Entries, m.TokenReuse, m.TarpitHits,
		m.RateLimited, m.Claims, m.Allocations, m.Reservations, m.QueueSize, m.DrawsDone, m.Transitions, m.LedgerWritten,
		collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{})} {
		f(c)
	}
	return m
}

func (m *metrics) observe(ep, method string, code int, d time.Duration) {
	m.reqs.WithLabelValues(ep, method, strconv.Itoa(code)).Inc()
	m.dur.WithLabelValues(ep).Observe(d.Seconds())
}

// latTracker keeps the last N request latencies for the replica heartbeat (p50/p99 in the admin monitor).
type latTracker struct {
	mu  sync.Mutex
	buf [8192]float32
	n   int
}

func newLat() *latTracker { return &latTracker{} }
func (l *latTracker) add(d time.Duration) {
	l.mu.Lock()
	l.buf[l.n%len(l.buf)] = float32(d.Seconds() * 1000)
	l.n++
	l.mu.Unlock()
}
func (l *latTracker) pct() (p50, p95, p99 float64) {
	l.mu.Lock()
	c := l.n
	if c > len(l.buf) {
		c = len(l.buf)
	}
	xs := make([]float32, c)
	copy(xs, l.buf[:c])
	l.mu.Unlock()
	if c == 0 {
		return
	}
	sort.Slice(xs, func(i, j int) bool { return xs[i] < xs[j] })
	return float64(xs[c/2]), float64(xs[int(float64(c)*0.95)]), float64(xs[int(float64(c)*0.99)])
}

func (a *App) Registry() *prometheus.Registry { return a.m.reg }

// Heartbeat publishes this replica's health to Redis (TTL 4s) so the admin monitor sees replicas die.
func (a *App) Heartbeat(ctx context.Context) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		p50, p95, p99 := a.lat.pct()
		key := "replica:" + a.cfg.ReplicaID
		a.rdb.SAdd(ctx, "replicas:known", a.cfg.ReplicaID)
		a.rdb.HSet(ctx, key, map[string]any{"role": a.cfg.Mode, "requests": a.reqTotal.Load(), "inflight": a.inflight.Load(), "errors5xx": a.err5xx.Load(),
			"p50_ms": p50, "p95_ms": p95, "p99_ms": p99, "started": a.started.UnixMilli(), "ts": nowMS()})
		a.rdb.Expire(ctx, key, 4*time.Second)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
