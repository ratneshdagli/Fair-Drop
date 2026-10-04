package app

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// hBaselineBuy is the classic first-come-first-served sale (demo baseline, PRD "FCFS comparison").
// Whoever's request lands first gets the seat; per-account cap is MAX_PER_ACCOUNT (default 4, like real ticketing).
func (a *App) hBaselineBuy(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	if d.Mode != "fcfs" {
		fail(w, 400, "wrong_mode")
		return
	}
	var in struct {
		Tier string `json:"tier"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	t := d.tier(in.Tier)
	if t == nil {
		fail(w, 400, "bad_tier")
		return
	}
	user := claimsOf(r).Subject
	actor := a.simActor(r)
	if actor == "" {
		actor = user
	}
	res, err := baselineLua.Run(ctx, a.rdb, []string{"drop:" + id, "base:" + id + ":buyers", "base:" + id + ":sold", "base:" + id + ":seats",
		dk(id, "attempts"), eventsStream, "live:" + id},
		user, t.ID, t.Seats, d.tierOffset(t.ID), a.cfg.MaxPerAcct, a.cfg.ReplicaID, clientIP(a, r), d.Epoch, id).StringSlice()
	if err != nil {
		fail(w, 503, "redis", "detail", err.Error())
		return
	}
	at := nowMS()
	if len(res) > 2 {
		at = atoi64(res[2]) // the time Redis made the decision, so the audit orders sales exactly
	}
	a.feedAt(id, at, "buy", res[0], actor, clientIP(a, r), "tier", t.ID)
	switch res[0] {
	case "closed":
		fail(w, 410, "sale_closed")
	case "soldout":
		fail(w, 409, "sold_out")
	case "capped":
		fail(w, 409, "limit_reached", "max_per_account", a.cfg.MaxPerAcct)
	default:
		writeJSON(w, 200, map[string]any{"seat_no": atoi(res[1]), "tier": t.ID, "arrival_ms": atoi64(res[2])})
	}
}

// hBaselineResult: who got which seat in the FCFS sale (admin; used by the experiment scorer).
func (a *App) hBaselineResult(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	seats, _ := a.rdb.HGetAll(r.Context(), "base:"+id+":seats").Result()
	buyers, _ := a.rdb.HGetAll(r.Context(), "base:"+id+":buyers").Result()
	att := map[string]int{}
	if d, err := a.loadDrop(r.Context(), id); err == nil {
		if all, err := a.readAttempts(r.Context(), d); err == nil {
			for _, x := range all {
				att[x.Actor]++
			}
		}
	}
	writeJSON(w, 200, map[string]any{"seats": seats, "buyers": buyers, "max_per_account": a.cfg.MaxPerAcct, "attempts_by_actor": att})
}

// hBaselineStatus: public live stock for the classic sale page.
func (a *App) hBaselineStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := a.loadDrop(r.Context(), id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	sold, _ := a.rdb.HGetAll(r.Context(), "base:"+id+":sold").Result()
	tiers := []map[string]any{}
	for _, t := range d.Tiers {
		tiers = append(tiers, map[string]any{"id": t.ID, "name": t.Name, "price_cents": t.PriceCents, "seats": t.Seats, "sold": atoi(sold[t.ID])})
	}
	writeJSON(w, 200, map[string]any{"state": d.State, "tiers": tiers, "server_time_ms": nowMS(), "max_per_account": a.cfg.MaxPerAcct})
}
