package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

type labelCache struct {
	mu   sync.Mutex
	at   time.Time
	drop string
	val  map[string]any
}

var lc labelCache

func (a *App) replicaStatus(ctx context.Context) []map[string]any {
	known, _ := a.rdb.SMembers(ctx, "replicas:known").Result()
	sort.Strings(known)
	out := []map[string]any{}
	for _, id := range known {
		m, _ := a.rdb.HGetAll(ctx, "replica:"+id).Result()
		if len(m) == 0 {
			out = append(out, map[string]any{"id": id, "healthy": false})
			continue
		}
		out = append(out, map[string]any{"id": id, "healthy": true, "role": m["role"], "requests": atoi64(m["requests"]),
			"inflight": atoi64(m["inflight"]), "errors5xx": atoi64(m["errors5xx"]), "p50_ms": m["p50_ms"], "p95_ms": m["p95_ms"], "p99_ms": m["p99_ms"], "uptime_s": (nowMS() - atoi64(m["started"])) / 1000})
	}
	return out
}

// bot/human split of registered entries, from TEST_MODE labels (evaluation only; cached 3s).
func (a *App) labelSplit(ctx context.Context, drop string) map[string]any {
	if !a.cfg.TestMode {
		return nil
	}
	lc.mu.Lock()
	defer lc.mu.Unlock()
	if lc.drop == drop && time.Since(lc.at) < 3*time.Second {
		return lc.val
	}
	labels, _ := a.rdb.HGetAll(ctx, "labels").Result()
	if len(labels) == 0 {
		return nil
	}
	tok2user, _ := a.rdb.HGetAll(ctx, dk(drop, "tok2user")).Result()
	entries, _ := a.rdb.HKeys(ctx, dk(drop, "entries")).Result()
	bots, humans := 0, 0
	for _, rid := range entries {
		if strings.HasPrefix(labels[tok2user[rid]], "bot") {
			bots++
		} else if labels[tok2user[rid]] != "" {
			humans++
		}
	}
	lc.at, lc.drop, lc.val = time.Now(), drop, map[string]any{"entries_bot": bots, "entries_human": humans}
	return lc.val
}

func (a *App) snapshot(ctx context.Context, id string) (map[string]any, error) {
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		return nil, err
	}
	lv, _ := a.rdb.HGetAll(ctx, "live:"+id).Result()
	gl, _ := a.rdb.HGetAll(ctx, "live:global").Result()
	cnt := map[string]int64{}
	for k, v := range lv {
		cnt[k] = atoi64(v)
	}
	entries, _ := a.rdb.HLen(ctx, dk(id, "entries")).Result()
	issued, _ := a.rdb.HLen(ctx, dk(id, "issued")).Result()
	tarpit, _ := a.rdb.HLen(ctx, dk(id, "tarpit")).Result()
	attempts, _ := a.rdb.XLen(ctx, dk(id, "attempts")).Result()
	reps := a.replicaStatus(ctx)
	var total, maxP99 float64
	for _, r := range reps {
		if h, _ := r["healthy"].(bool); h {
			total += float64(r["requests"].(int64))
			if p, _ := fmt.Sscanf(fmt.Sprint(r["p99_ms"]), "%f", new(float64)); p == 1 {
				var f float64
				fmt.Sscanf(fmt.Sprint(r["p99_ms"]), "%f", &f)
				if f > maxP99 {
					maxP99 = f
				}
			}
		}
	}
	sold, _ := a.rdb.HGetAll(ctx, "base:"+id+":sold").Result()
	seatsSold := 0
	for _, v := range sold {
		seatsSold += atoi(v)
	}
	snap := map[string]any{
		"drop": d.view(), "now_ms": nowMS(), "counters": cnt, "rate_limited_global": atoi64(gl["rate_limited"]),
		"tokens_issued": issued, "entries_registered": entries, "tarpit_entries": tarpit, "attempts": attempts,
		"replicas": reps, "requests_total": total, "p99_ms": maxP99, "seats_total": d.totalSeats(), "baseline_seats_sold": seatsSold,
	}
	if ls := a.labelSplit(ctx, id); ls != nil {
		snap["labels"] = ls
	}
	if stateOrder[d.State] >= stateOrder["CLAIM"] {
		snap["seats_claimed"], _ = a.rdb.HLen(ctx, dk(id, "seatown")).Result()
	}
	return snap, nil
}

// hLive serves JSON, or Server-Sent Events when Accept: text/event-stream.
func (a *App) hLive(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	if !strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
		s, err := a.snapshot(ctx, id)
		if err != nil {
			fail(w, 404, "drop_not_found")
			return
		}
		writeJSON(w, 200, s)
		return
	}
	fl, ok := w.(http.Flusher)
	if !ok {
		fail(w, 500, "no_flush")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	t := time.NewTicker(time.Second)
	defer t.Stop()
	var prevReq float64
	var prevAt int64
	for {
		s, err := a.snapshot(ctx, id)
		if err != nil {
			return
		}
		cur := s["requests_total"].(float64)
		if prevAt > 0 && cur >= prevReq {
			s["rps"] = (cur - prevReq) / (float64(nowMS()-prevAt) / 1000)
		}
		prevReq, prevAt = cur, nowMS()
		b, _ := json.Marshal(s)
		fmt.Fprintf(w, "data: %s\n\n", b)
		fl.Flush()
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
