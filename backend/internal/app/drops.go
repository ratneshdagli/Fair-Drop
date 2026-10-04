package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"fairdrop/internal/fdcrypto"

	"github.com/go-chi/chi/v5"
)

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slug(s string) string { return strings.Trim(slugRe.ReplaceAllString(strings.ToLower(s), "-"), "-") }

func (a *App) hCreateEvent(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name, Venue string
		StartsAt    string `json:"starts_at"`
		Tiers       []Tier `json:"tiers"`
	}
	if decode(r, &in) != nil || in.Name == "" || len(in.Tiers) == 0 {
		fail(w, 400, "bad_request")
		return
	}
	st, err := time.Parse(time.RFC3339, in.StartsAt)
	if err != nil {
		st = time.Now().Add(30 * 24 * time.Hour)
	}
	id := "ev_" + randHex(4)
	ctx := r.Context()
	tx, err := a.pg.Begin(ctx)
	if err != nil {
		fail(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "INSERT INTO events_catalog(id,name,venue,starts_at) VALUES($1,$2,$3,$4)", id, in.Name, in.Venue, st); err != nil {
		fail(w, 500, "db")
		return
	}
	for i, t := range in.Tiers {
		if t.ID == "" {
			t.ID = slug(t.Name)
		}
		if t.Seats <= 0 || t.ID == "" {
			fail(w, 400, "bad_tier")
			return
		}
		if _, err = tx.Exec(ctx, "INSERT INTO tiers(id,event_id,name,price_cents,seats,ord) VALUES($1,$2,$3,$4,$5,$6)", t.ID, id, t.Name, t.PriceCents, t.Seats, i); err != nil {
			fail(w, 400, "bad_tier")
			return
		}
	}
	if err = tx.Commit(ctx); err != nil {
		fail(w, 500, "db")
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": in.Name, "venue": in.Venue, "starts_at": st, "tiers": in.Tiers})
}

func (a *App) hListEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pg.Query(r.Context(), `SELECT e.id,e.name,e.venue,e.starts_at,
	  COALESCE(json_agg(json_build_object('id',t.id,'name',t.name,'price_cents',t.price_cents,'seats',t.seats) ORDER BY t.ord) FILTER (WHERE t.id IS NOT NULL),'[]')
	  FROM events_catalog e LEFT JOIN tiers t ON t.event_id=e.id GROUP BY e.id ORDER BY e.starts_at DESC`)
	if err != nil {
		fail(w, 500, "db")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, venue string
		var st time.Time
		var tiers json.RawMessage
		if rows.Scan(&id, &name, &venue, &st, &tiers) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "venue": venue, "starts_at": st, "tiers": tiers})
		}
	}
	writeJSON(w, 200, out)
}

// material returns fresh per-drop secrets (seed + keys) and the Redis fields that publish their commitments.
func newMaterial() (seed []byte, key *fdcrypto.IssuerKey, blob string, fields map[string]any, err error) {
	seed = make([]byte, 32)
	if _, err = randRead(seed); err != nil {
		return
	}
	if key, err = fdcrypto.NewIssuerKey(); err != nil {
		return
	}
	if blob, err = key.Serialize(); err != nil {
		return
	}
	h := sha256.Sum256(seed)
	jwk, _ := json.Marshal(key.RSAPublicJWK())
	fields = map[string]any{"seed_hash": hex.EncodeToString(h[:]), "public_key": key.RSAPublicSPKI(),
		"public_key_jwk": string(jwk), "receipt_key": key.ECPublicSPKI()}
	return
}

func (a *App) hCreateDrop(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID        string `json:"id"`
		EventID   string `json:"event_id"`
		Mode      string `json:"mode"`
		Opens     string `json:"opens_at"`
		Closes    string `json:"closes_at"`
		CutoffAt  string `json:"cutoff_at"`
		ClaimSec  int    `json:"claim_sec"`
		AutoDraw  bool   `json:"auto_draw"`
		WindowSec int    `json:"window_sec"`
	}
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	ev := in.EventID
	mode := in.Mode
	if mode == "" {
		mode = "fairdrop"
	}
	if mode != "fairdrop" && mode != "fcfs" {
		fail(w, 400, "bad_mode")
		return
	}
	pt := func(s string, d time.Time) time.Time {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t
		}
		return d
	}
	now := time.Now()
	opens := pt(in.Opens, now)
	ws := in.WindowSec
	if ws <= 0 {
		ws = 600
	}
	closes := pt(in.Closes, opens.Add(time.Duration(ws)*time.Second))
	cutoff := pt(in.CutoffAt, now)
	if !closes.After(opens) {
		fail(w, 400, "closes_before_opens")
		return
	}
	if in.ClaimSec <= 0 {
		in.ClaimSec = 120
	}
	ctx := r.Context()
	var evName, venue string
	var startsAt time.Time
	if err := a.pg.QueryRow(ctx, "SELECT name,venue,starts_at FROM events_catalog WHERE id=$1", ev).Scan(&evName, &venue, &startsAt); err != nil {
		fail(w, 404, "event_not_found")
		return
	}
	rows, err := a.pg.Query(ctx, "SELECT id,name,price_cents,seats FROM tiers WHERE event_id=$1 ORDER BY ord", ev)
	if err != nil {
		fail(w, 500, "db")
		return
	}
	var tiers []Tier
	for rows.Next() {
		var t Tier
		rows.Scan(&t.ID, &t.Name, &t.PriceCents, &t.Seats)
		tiers = append(tiers, t)
	}
	rows.Close()
	id := in.ID
	if id == "" {
		id = "drop_" + randHex(4)
	}
	seed, _, blob, fields, err := newMaterial()
	if err != nil {
		fail(w, 500, "crypto")
		return
	}
	// A sale id can be created again after it was deleted (test sales are). The permanent audit log still holds the earlier sale's rows, so the new one
	// starts in the next epoch: every per-sale check (sealed list vs recorded entries, counts) then only looks at THIS sale's rows.
	var epoch int
	a.pg.QueryRow(ctx, "SELECT COALESCE(max(epoch)+1,0) FROM audit_log WHERE drop_id=$1", id).Scan(&epoch)
	tj, _ := json.Marshal(tiers)
	f := map[string]any{"id": id, "event_id": ev, "event_name": evName, "venue": venue, "starts_at_ms": startsAt.UnixMilli(),
		"mode": mode, "state": "SCHEDULED", "epoch": epoch, "opens_at_ms": opens.UnixMilli(), "closes_at_ms": closes.UnixMilli(),
		"cutoff_at_ms": cutoff.UnixMilli(), "claim_sec": in.ClaimSec, "auto_draw": b2s(in.AutoDraw),
		"token_mode": a.cfg.BlindMode, "tiers_json": string(tj)}
	for k, v := range fields {
		f[k] = v
	}
	if ok, _ := a.rdb.Exists(ctx, "drop:"+id).Result(); ok > 0 {
		fail(w, 409, "drop_exists")
		return
	}
	if _, err = a.pg.Exec(ctx, `INSERT INTO drops(id,event_id,mode,state,epoch,opens_at,closes_at,cutoff_at,claim_sec,auto_draw,seed_hash,public_key)
		VALUES($1,$2,$3,'SCHEDULED',$11,$4,$5,$6,$7,$8,$9,$10)`, id, ev, mode, opens, closes, cutoff, in.ClaimSec, in.AutoDraw, fields["seed_hash"], fields["public_key"], epoch); err != nil {
		fail(w, 500, "db")
		return
	}
	a.pg.Exec(ctx, "INSERT INTO drop_secrets(drop_id,seed,key_blob) VALUES($1,$2,$3) ON CONFLICT (drop_id) DO UPDATE SET seed=EXCLUDED.seed,key_blob=EXCLUDED.key_blob", id, hex.EncodeToString(seed), blob)
	pipe := a.rdb.TxPipeline()
	pipe.HSet(ctx, "drop:"+id, f)
	pipe.HSet(ctx, dk(id, "secret"), map[string]any{"seed": hex.EncodeToString(seed), "key": blob})
	pipe.SAdd(ctx, "drops", id)
	if _, err = pipe.Exec(ctx); err != nil {
		fail(w, 500, "redis")
		return
	}
	a.emit(ctx, id, 0, "drop_created", map[string]any{"mode": mode, "seed_hash": fields["seed_hash"], "public_key": fields["public_key"],
		"opens_at_ms": opens.UnixMilli(), "closes_at_ms": closes.UnixMilli(), "cutoff_at_ms": cutoff.UnixMilli(), "tiers": tiers})
	d, _ := a.loadDrop(ctx, id)
	writeJSON(w, 201, d.view())
}

func b2s(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func (a *App) allDrops(ctx context.Context) []*Drop {
	ids, _ := a.rdb.SMembers(ctx, "drops").Result()
	out := []*Drop{}
	for _, id := range ids {
		if d, err := a.loadDrop(ctx, id); err == nil {
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].OpensMS > out[j].OpensMS })
	return out
}

func (a *App) hListDrops(w http.ResponseWriter, r *http.Request) {
	out := []map[string]any{}
	for _, d := range a.allDrops(r.Context()) {
		out = append(out, d.view())
	}
	writeJSON(w, 200, out)
}

func (a *App) hAdminListDrops(w http.ResponseWriter, r *http.Request) { a.hListDrops(w, r) }

func (a *App) hGetDrop(w http.ResponseWriter, r *http.Request) {
	d, err := a.loadDrop(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	writeJSON(w, 200, d.view())
}
