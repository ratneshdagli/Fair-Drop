package app

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

// The live request log: the raw HTTP calls the servers really received (method, path, status, time taken, which replica, which account / address).
// It exists so a judge can WATCH the traffic and see what each bot is really sending, instead of trusting a summary.
// TEST_MODE only. It records only; nothing here is read by allocation. It is switched on only while an admin screen is polling it (zero cost otherwise),
// writes are batched off the request path, and if the buffer is full a record is dropped (availability first).

const traceMax = 20000

type traceRec struct {
	drop string
	v    []any
}

func (a *App) startTrace(ctx context.Context) {
	a.traceCh = make(chan traceRec, 20000)
	go func() { // is anybody watching? (the key is refreshed by every poll of /trace and expires on its own)
		for {
			if on, err := a.rdb.Exists(ctx, "trace:on").Result(); err == nil {
				a.traceOn.Store(on > 0)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
		}
	}()
	go func() {
		for {
			var batch []traceRec
			select {
			case <-ctx.Done():
				return
			case r := <-a.traceCh:
				batch = append(batch, r)
			}
			t := time.After(20 * time.Millisecond)
		fill:
			for len(batch) < 500 {
				select {
				case r := <-a.traceCh:
					batch = append(batch, r)
				case <-t:
					break fill
				}
			}
			pipe := a.rdb.Pipeline()
			for _, r := range batch {
				pipe.XAdd(ctx, &redis.XAddArgs{Stream: dk(r.drop, "trace"), MaxLen: traceMax, Approx: true, Values: r.v})
			}
			pipe.Exec(ctx)
		}
	}()
}

// traceReq is called by the instrument middleware once a fan-facing request has finished.
func (a *App) traceReq(r *http.Request, ep string, code int, d time.Duration) {
	if !a.cfg.TestMode || a.traceCh == nil || !a.traceOn.Load() {
		return
	}
	drop := dropFromPath(r.URL.Path)
	if drop == "" || strings.HasPrefix(ep, "/admin") || strings.HasPrefix(ep, "/test") || strings.HasSuffix(ep, "/live") {
		return
	}
	v := []any{"t", nowMS(), "m", r.Method, "p", r.URL.Path, "ep", ep, "c", code, "us", d.Microseconds(), "a", a.simActor(r), "ip", clientIP(a, r), "rep", a.cfg.ReplicaID}
	select {
	case a.traceCh <- traceRec{drop, v}:
	default:
	}
}

// GET /admin/drops/{id}/trace?after=<id>: the newest raw requests (sampled for drawing when very busy), the bot kind of each (evaluation labels), and exact
// counts for the last 3 seconds by status class and by replica.
func (a *App) hTrace(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	a.rdb.SetEx(ctx, "trace:on", "1", 15*time.Second)
	key := dk(id, "trace")
	after := r.URL.Query().Get("after")
	lbl := a.labels(ctx)
	var msgs []redis.XMessage
	if after == "" {
		msgs, _ = a.rdb.XRevRangeN(ctx, key, "+", "-", 60).Result()
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
	} else {
		msgs, _ = a.rdb.XRangeN(ctx, key, "("+after, "+", 4000).Result()
	}
	cursor := after
	if len(msgs) > 0 {
		cursor = msgs[len(msgs)-1].ID
	}
	step := 1
	if len(msgs) > 120 {
		step = len(msgs)/120 + 1
	}
	out := make([]map[string]any, 0, 130)
	for i, m := range msgs {
		if i%step != 0 {
			continue
		}
		ac := strVal(m.Values["a"])
		k, _ := kindOp(lbl, ac)
		out = append(out, map[string]any{"id": m.ID, "t": atoi64(strVal(m.Values["t"])), "m": strVal(m.Values["m"]), "p": strVal(m.Values["p"]), "ep": strVal(m.Values["ep"]),
			"c": atoi(strVal(m.Values["c"])), "us": atoi64(strVal(m.Values["us"])), "a": ac, "ip": strVal(m.Values["ip"]), "rep": strVal(m.Values["rep"]), "k": k, "pf": profOf(lbl, ac)})
	}
	now := nowMS()
	recent, _ := a.rdb.XRevRangeN(ctx, key, "+", "-", 12000).Result()
	byClass, byRep := map[string]int{}, map[string]int{}
	total3 := 0
	for _, m := range recent {
		if atoi64(strVal(m.Values["t"])) < now-3000 {
			break
		}
		c := atoi(strVal(m.Values["c"]))
		byClass[string(rune('0'+c/100))+"xx"]++
		byRep[strVal(m.Values["rep"])]++
		total3++
	}
	total, _ := a.rdb.XLen(ctx, key).Result()
	writeJSON(w, 200, map[string]any{"events": out, "cursor": cursor, "total": total, "per_sec": float64(total3) / 3, "by_class_3s": byClass, "by_replica_3s": byRep, "now_ms": now})
}
