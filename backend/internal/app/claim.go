package app

import (
	"context"
	"net/http"
	"sort"
	"strconv"

	"fairdrop/internal/fdcrypto"

	"github.com/redis/go-redis/v9"

	"github.com/go-chi/chi/v5"
)

// Seats are bound to the draw rank (winner #i of a tier gets seat offset+i+1; a forfeited seat passes to the
// next waitlisted receipt), so who clicks first never changes who sits where.

func (a *App) doStartClaims(ctx context.Context, d *Drop, extra map[string]any, payload map[string]any) error {
	now := nowMS()
	deadline := now + int64(d.ClaimSec)*1000
	pipe := a.rdb.Pipeline()
	reserved := 0
	pipe.Del(ctx, dk(d.ID, "elig"), dk(d.ID, "seatown"), dk(d.ID, "seatstate"), dk(d.ID, "claimed_by"), dk(d.ID, "wlptr"))
	for _, tr := range d.Tiers {
		off := d.tierOffset(tr.ID)
		ids, err := a.rdb.LRange(ctx, dk(d.ID, "result:"+tr.ID), 0, int64(tr.Seats-1)).Result()
		if err != nil {
			return err
		}
		pipe.HSet(ctx, dk(d.ID, "wlptr"), tr.ID, tr.Seats-1)
		for i := 0; i < tr.Seats; i++ {
			seat := off + i + 1
			if i < len(ids) {
				pipe.HSet(ctx, dk(d.ID, "seat:"+ids[i]), "tier", tr.ID, "seat_no", seat, "status", "reserved", "deadline", deadline)
				pipe.ZAdd(ctx, dk(d.ID, "elig"), redis.Z{Score: float64(deadline), Member: ids[i]})
				pipe.HSet(ctx, dk(d.ID, "seatstate"), strconv.Itoa(seat), "reserved")
				reserved++
			} else {
				pipe.HSet(ctx, dk(d.ID, "seatstate"), strconv.Itoa(seat), "unclaimed")
			}
		}
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	a.m.Reservations.Add(float64(reserved))
	extra["claim_started_ms"] = now
	payload["reserved"], payload["claim_deadline_ms"] = reserved, deadline
	return nil
}

func (a *App) expireClaims(ctx context.Context, d *Drop) {
	n, err := expireLua.Run(ctx, a.rdb, []string{"drop:" + d.ID, dk(d.ID, "elig"), dk(d.ID, "seatstate"), dk(d.ID, "wlptr"), eventsStream},
		d.ID, int64(d.ClaimSec)*1000, d.Epoch).Int()
	if err == nil && n > 0 {
		a.m.Reservations.Add(float64(n))
	}
}

func (a *App) pendingClaims(ctx context.Context, d *Drop) int64 {
	n, _ := a.rdb.ZCard(ctx, dk(d.ID, "elig")).Result()
	return n
}

func (a *App) doSettle(ctx context.Context, d *Drop, extra map[string]any, payload map[string]any) error {
	if d.Mode == "fcfs" {
		return nil
	}
	left, _ := a.rdb.ZRange(ctx, dk(d.ID, "elig"), 0, -1).Result()
	for _, rid := range left {
		seat, _ := a.rdb.HGet(ctx, dk(d.ID, "seat:"+rid), "seat_no").Result()
		a.rdb.HSet(ctx, dk(d.ID, "seat:"+rid), "status", "expired")
		a.rdb.HSet(ctx, dk(d.ID, "seatstate"), seat, "unclaimed")
	}
	a.rdb.Del(ctx, dk(d.ID, "elig"))
	claimed, _ := a.rdb.HLen(ctx, dk(d.ID, "seatown")).Result()
	payload["claimed"], payload["unclaimed"], payload["total_seats"] = claimed, int64(d.totalSeats())-claimed, d.totalSeats()
	return nil
}

func (a *App) hClaim(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	rt, _, err := a.rt(ctx, id)
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	var in struct {
		TokenMsg string `json:"token_msg"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	tok, err := unb64(in.TokenMsg)
	if err != nil || len(tok) < 16 {
		fail(w, 400, "bad_token")
		return
	}
	rid := fdcrypto.ReceiptID(id, tok) // possession of the token secret proves ownership of the entry
	user := claimsOf(r).Subject
	res, err := claimLua.Run(ctx, a.rdb, []string{"drop:" + id, dk(id, "seat:"+rid), dk(id, "elig"), dk(id, "seatown"), dk(id, "seatstate"),
		dk(id, "claimed_by"), eventsStream, "user:" + user + ":tickets", "integ:" + id}, rid, user, rt.Epoch, id).StringSlice()
	if err != nil {
		fail(w, 503, "redis", "detail", err.Error())
		return
	}
	switch res[0] {
	case "state":
		a.m.Claims.WithLabelValues("not_claim_phase").Inc()
		fail(w, 409, "not_claim_phase", "state", res[1])
	case "not_winner":
		a.m.Claims.WithLabelValues("not_winner").Inc()
		fail(w, 403, "not_winner")
	case "expired":
		a.m.Claims.WithLabelValues("expired").Inc()
		fail(w, 410, "claim_expired")
	case "conflict":
		a.m.Claims.WithLabelValues("conflict").Inc()
		fail(w, 409, "seat_conflict")
	case "ok":
		seat := atoi(res[1])
		if len(res) < 4 {
			a.m.Claims.WithLabelValues("ok").Inc()
			a.m.Allocations.Inc()
		} else {
			a.m.Claims.WithLabelValues("replay").Inc()
		}
		writeJSON(w, 200, a.ticketJSON(rt, rid, res[2], seat))
	}
}

func (a *App) ticketJSON(rt *dropRT, rid, tier string, seat int) map[string]any {
	sig, _ := fdcrypto.SignEC(rt.key.EC, fdcrypto.TicketMessage(rt.ID, rid, tier, seat))
	return map[string]any{"drop_id": rt.ID, "event_name": rt.EventName, "venue": rt.Venue, "receipt_id": rid, "seat_no": seat, "tier": tier,
		"ticket_sig": b64(sig), "qr_payload": "fairdrop:ticket:v1:" + rt.ID + ":" + rid + ":" + tier + ":" + strconv.Itoa(seat) + ":" + b64(sig)}
}

func (a *App) hTickets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := claimsOf(r).Subject
	members, _ := a.rdb.SMembers(ctx, "user:"+user+":tickets").Result()
	out := []map[string]any{}
	for _, m := range members {
		var did, rid string
		for i := range m {
			if m[i] == '|' {
				did, rid = m[:i], m[i+1:]
				break
			}
		}
		rt, _, err := a.rt(ctx, did)
		if err != nil {
			continue
		}
		s, _ := a.rdb.HGetAll(ctx, dk(did, "seat:"+rid)).Result()
		if s["status"] == "claimed" {
			out = append(out, a.ticketJSON(rt, rid, s["tier"], atoi(s["seat_no"])))
		}
	}
	writeJSON(w, 200, out)
}

// hSeats: public seat map (no identities).
func (a *App) hSeats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	d, err := a.loadDrop(ctx, chi.URLParam(r, "id"))
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	st, _ := a.rdb.HGetAll(ctx, dk(d.ID, "seatstate")).Result()
	tiers := []map[string]any{}
	for _, t := range d.Tiers {
		off := d.tierOffset(t.ID)
		seats := make([]string, t.Seats)
		for i := range seats {
			seats[i] = "open"
			if s, ok := st[strconv.Itoa(off+i+1)]; ok {
				seats[i] = s
			}
		}
		tiers = append(tiers, map[string]any{"id": t.ID, "name": t.Name, "offset": off, "seats": seats})
	}
	writeJSON(w, 200, map[string]any{"state": d.State, "tiers": tiers})
}

func (a *App) hClaimsSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	d, err := a.loadDrop(ctx, chi.URLParam(r, "id"))
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	st, _ := a.rdb.HGetAll(ctx, dk(d.ID, "seatstate")).Result()
	counts := map[string]int{}
	byTier := []map[string]any{}
	for _, t := range d.Tiers {
		off := d.tierOffset(t.ID)
		c := map[string]int{}
		for i := 0; i < t.Seats; i++ {
			s := st[strconv.Itoa(off+i+1)]
			if s == "" {
				s = "open"
			}
			c[s]++
			counts[s]++
		}
		byTier = append(byTier, map[string]any{"tier": t.ID, "seats": t.Seats, "counts": c})
	}
	lv, _ := a.rdb.HGetAll(ctx, "live:"+d.ID).Result()
	writeJSON(w, 200, map[string]any{"state": d.State, "totals": counts, "tiers": byTier, "pending": a.pendingClaims(ctx, d),
		"expired": atoi(lv["claims_expired"]), "promoted": atoi(lv["claims_promoted"]), "claimed": atoi(lv["seats_claimed"])})
}

var _ = sort.Strings
