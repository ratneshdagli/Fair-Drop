package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

var (
	ErrIllegal = errors.New("illegal_transition")
	ErrBusy    = errors.New("busy")
)

var nextState = map[string]map[string]string{
	"fairdrop": {"SCHEDULED": "OPEN", "OPEN": "CLOSED", "CLOSED": "LOCKED", "LOCKED": "DRAWN", "DRAWN": "CLAIM", "CLAIM": "SETTLED"},
	"fcfs":     {"SCHEDULED": "OPEN", "OPEN": "CLOSED", "CLOSED": "SETTLED"},
}

var unlockLua = redis.NewScript(`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`)

// Advance moves a drop one step along the state machine. Any process (API replica or worker) may call it:
// a Redis lock serialises the heavy steps and a compare-and-set Lua script makes the flip itself atomic.
// There is no way to skip a phase or go backwards.
func (a *App) Advance(ctx context.Context, id, to, by string) (*Drop, error) {
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		return nil, err
	}
	want := nextState[d.Mode][d.State]
	if want == "" || want != to {
		a.rdb.HIncrBy(ctx, "integ:"+id, "illegal_transition_rejected", 1)
		return d, fmt.Errorf("%w: %s -> %s", ErrIllegal, d.State, to)
	}
	lk, tok := dk(id, "lock"), randHex(8)
	if ok, _ := a.rdb.SetNX(ctx, lk, tok, 90*time.Second).Result(); !ok {
		return d, ErrBusy
	}
	defer unlockLua.Run(context.Background(), a.rdb, []string{lk}, tok)
	if d, err = a.loadDrop(ctx, id); err != nil { // re-read under the lock
		return nil, err
	}
	if nextState[d.Mode][d.State] != to {
		return d, fmt.Errorf("%w: %s -> %s", ErrIllegal, d.State, to)
	}
	extra := map[string]any{}
	payload := map[string]any{"from": d.State, "to": to, "by": by, "at_ms": nowMS()}
	switch to {
	case "LOCKED":
		err = a.doLock(ctx, d, extra, payload)
	case "DRAWN":
		err = a.doDraw(ctx, d, extra, payload)
	case "CLAIM":
		err = a.doStartClaims(ctx, d, extra, payload)
	case "SETTLED":
		err = a.doSettle(ctx, d, extra, payload)
	}
	if err != nil {
		log.Printf("advance %s %s->%s: %v", id, d.State, to, err)
		return d, err
	}
	pj, _ := json.Marshal(payload)
	args := []any{d.State, to, string(pj), d.Epoch, id}
	for k, v := range extra {
		args = append(args, k, fmt.Sprint(v))
	}
	ok, err := advanceLua.Run(ctx, a.rdb, []string{"drop:" + id, eventsStream}, args...).Int()
	if err != nil {
		return d, err
	}
	if ok != 1 {
		return d, ErrBusy
	}
	a.m.Transitions.WithLabelValues(to).Inc()
	a.pg.Exec(ctx, "UPDATE drops SET state=$2 WHERE id=$1", id, to)
	return a.loadDrop(ctx, id)
}

func (a *App) hAdvance(w http.ResponseWriter, r *http.Request) {
	var in struct{ To string `json:"to"` }
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	d, err := a.Advance(r.Context(), chi.URLParam(r, "id"), in.To, "admin")
	switch {
	case errors.Is(err, ErrNoDrop):
		fail(w, 404, "drop_not_found")
	case errors.Is(err, ErrIllegal):
		fail(w, 409, "illegal_transition", "state", d.State, "requested", in.To, "allowed", nextState[d.Mode][d.State])
	case errors.Is(err, ErrBusy):
		fail(w, 409, "busy")
	case err != nil:
		fail(w, 500, "advance_failed", "detail", err.Error())
	default:
		writeJSON(w, 200, d.view())
	}
}

// Tick runs the timers. Called by the worker every 250ms.
func (a *App) Tick(ctx context.Context) {
	now := nowMS()
	for _, d := range a.allDrops(ctx) {
		switch {
		case d.State == "SCHEDULED" && now >= d.OpensMS:
			a.Advance(ctx, d.ID, "OPEN", "timer")
		case d.State == "OPEN" && now >= d.ClosesMS:
			a.Advance(ctx, d.ID, "CLOSED", "timer")
		case d.State == "CLAIM":
			a.expireClaims(ctx, d)
			if d.AutoDraw && a.pendingClaims(ctx, d) == 0 {
				a.Advance(ctx, d.ID, "SETTLED", "timer")
			}
		case d.AutoDraw && d.Mode == "fairdrop":
			if nx := nextState["fairdrop"][d.State]; d.State == "CLOSED" || d.State == "LOCKED" || d.State == "DRAWN" {
				a.Advance(ctx, d.ID, nx, "timer")
			}
		}
	}
}
