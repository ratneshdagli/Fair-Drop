package app

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// GET /admin/drops/{id}/pulse: everything an admin wants on one screen, in one call (polled every 2 s):
// tickets sold/left, what is being processed right now, how fast the site answers, errors, the database, and the servers.
// All numbers are read from state the system already keeps (replica heartbeats, Redis INFO, Postgres stats); nothing here
// is estimated or invented, and nothing in it is read by allocation.

type pulseCache struct {
	at  time.Time
	val map[string]any
}

var pulseC sync.Map

func (a *App) hPulse(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if c, ok := pulseC.Load(id); ok && time.Since(c.(*pulseCache).at) < 1500*time.Millisecond {
		writeJSON(w, 200, c.(*pulseCache).val)
		return
	}
	v, err := a.pulse(r.Context(), id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	pulseC.Store(id, &pulseCache{time.Now(), v})
	writeJSON(w, 200, v)
}

func redisInfo(ctx context.Context, a *App) map[string]string {
	out := map[string]string{}
	s, err := a.rdb.Info(ctx, "clients", "memory", "stats").Result()
	if err != nil {
		return out
	}
	for _, ln := range strings.Split(s, "\n") {
		if k, v, ok := strings.Cut(strings.TrimSpace(ln), ":"); ok {
			out[k] = v
		}
	}
	return out
}

func (a *App) pulse(ctx context.Context, id string) (map[string]any, error) {
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		return nil, err
	}
	lv, _ := a.rdb.HGetAll(ctx, "live:"+id).Result()
	gl, _ := a.rdb.HGetAll(ctx, "live:global").Result()
	entries, _ := a.rdb.HLen(ctx, dk(id, "entries")).Result()
	issued, _ := a.rdb.HLen(ctx, dk(id, "issued")).Result()

	// tickets
	total := d.totalSeats()
	sold, basis := 0, "pending"
	tiers := []map[string]any{}
	if d.Mode == "fcfs" {
		sm, _ := a.rdb.HGetAll(ctx, "base:"+id+":sold").Result()
		basis = "bought"
		for _, t := range d.Tiers {
			n := atoi(sm[t.ID])
			sold += n
			tiers = append(tiers, map[string]any{"id": t.ID, "name": t.Name, "seats": t.Seats, "sold": n, "left": t.Seats - n})
		}
	} else if stateOrder[d.State] >= stateOrder["CLAIM"] {
		n, _ := a.rdb.HLen(ctx, dk(id, "seatown")).Result()
		sold, basis = int(n), "claimed"
		for _, t := range d.Tiers {
			tiers = append(tiers, map[string]any{"id": t.ID, "name": t.Name, "seats": t.Seats})
		}
	} else {
		for _, t := range d.Tiers {
			tiers = append(tiers, map[string]any{"id": t.ID, "name": t.Name, "seats": t.Seats})
		}
	}

	// servers
	reps := a.replicaStatus(ctx)
	var inflight, requests, errs int64
	var p50s []float64
	var p95, p99 float64
	up := 0
	rid := []map[string]any{}
	for _, r := range reps {
		h, _ := r["healthy"].(bool)
		row := map[string]any{"id": r["id"], "up": h}
		if h {
			up++
			inflight += r["inflight"].(int64)
			requests += r["requests"].(int64)
			errs += r["errors5xx"].(int64)
			f50, _ := strconv.ParseFloat(strVal2(r["p50_ms"]), 64)
			f95, _ := strconv.ParseFloat(strVal2(r["p95_ms"]), 64)
			f99, _ := strconv.ParseFloat(strVal2(r["p99_ms"]), 64)
			if r["role"] == "api" && f99 > 0 { // a server that has answered nothing yet has no wait time to report
				p50s = append(p50s, f50)
				p95 = maxf(p95, f95)
				p99 = maxf(p99, f99)
			}
			row["role"], row["requests"], row["inflight"], row["p50_ms"], row["p99_ms"], row["uptime_s"] = r["role"], r["requests"], r["inflight"], f50, f99, r["uptime_s"]
		}
		rid = append(rid, row)
	}
	sort.Float64s(p50s)
	typical := 0.0
	if len(p50s) > 0 {
		typical = p50s[len(p50s)/2]
	}

	// database / cache
	ri := redisInfo(ctx, a)
	dbsize, _ := a.rdb.DBSize(ctx).Result()
	hits, miss := atoi64(ri["keyspace_hits"]), atoi64(ri["keyspace_misses"])
	hitRate := 0.0
	if hits+miss > 0 {
		hitRate = float64(hits) / float64(hits+miss)
	}
	lag, _ := a.rdb.Get(ctx, "ledger:lag").Int64()
	var conns, dbBytes, auditSeq int64
	a.pg.QueryRow(ctx, `SELECT numbackends, pg_database_size(current_database()) FROM pg_stat_database WHERE datname=current_database()`).Scan(&conns, &dbBytes)
	a.pg.QueryRow(ctx, `SELECT coalesce(max(seq),0) FROM audit_head`).Scan(&auditSeq)
	var entriesRows int64
	a.pg.QueryRow(ctx, `SELECT coalesce(n_live_tup,0) FROM pg_stat_user_tables WHERE relname='entries'`).Scan(&entriesRows)

	feedLen, _ := a.rdb.XLen(ctx, dk(id, "feed")).Result()
	return map[string]any{
		"now_ms": nowMS(), "state": d.State, "mode": d.Mode, "closes_at_ms": d.view()["closes_at_ms"], "merkle_root": d.MerkleRoot, "seed_hash": d.SeedHash,
		"tickets": map[string]any{"total": total, "sold": sold, "left": total - sold, "basis": basis, "tiers": tiers},
		"flow": map[string]any{"tokens_issued": issued, "entries": entries, "decisions_recorded": feedLen,
			"counters": lv, "rate_limited_global": atoi64(gl["rate_limited"])},
		"queue": map[string]any{"in_flight": inflight, "db_writes_waiting": lag, "waiting_room": false},
		"server": map[string]any{"servers_up": up, "servers_total": len(reps), "requests_total": requests, "errors_5xx_total": errs,
			"typical_ms": typical, "slow_ms": p95, "slowest_ms": p99, "replicas": rid},
		"database": map[string]any{
			"redis": map[string]any{"memory_mb": float64(atoi64(ri["used_memory"])) / 1048576, "clients": atoi64(ri["connected_clients"]), "ops_per_sec": atoi64(ri["instantaneous_ops_per_sec"]), "keys": dbsize, "hit_rate": hitRate},
			"postgres": map[string]any{"connections": conns, "size_mb": float64(dbBytes) / 1048576, "audit_entries": auditSeq, "entry_rows": entriesRows},
		},
	}, nil
}

func strVal2(x any) string {
	switch v := x.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', 3, 64)
	}
	return ""
}

func maxf(a, b float64) float64 {
	if b > a {
		return b
	}
	return a
}
