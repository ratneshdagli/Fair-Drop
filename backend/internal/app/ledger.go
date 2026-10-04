package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"fairdrop/internal/fdcrypto"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
)

// Ledger: Redis Stream -> Postgres. One consumer group, at-least-once delivery, idempotent by stream id.
// The audit log is hash-chained: hash = SHA256(prev | seq | drop | epoch | type | payload).

func chainHash(prev string, seq int64, drop string, epoch int, typ, payload string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s|%d|%s|%d|%s|%s", prev, seq, drop, epoch, typ, payload)))
	return hex.EncodeToString(h[:])
}

func (a *App) RunLedger(ctx context.Context) {
	a.rdb.XGroupCreateMkStream(ctx, eventsStream, "ledger", "0")
	consumer := "ledger-1"
	pending := true // first drain anything delivered-but-unacked from a previous crash
	go func() {
		for ctx.Err() == nil {
			if gs, err := a.rdb.XInfoGroups(ctx, eventsStream).Result(); err == nil {
				for _, g := range gs {
					if g.Name == "ledger" {
						a.m.QueueSize.Set(float64(g.Lag + g.Pending))
						a.rdb.Set(ctx, "ledger:lag", g.Lag+g.Pending, 10*time.Second)
					}
				}
			}
			time.Sleep(time.Second)
		}
	}()
	for ctx.Err() == nil {
		id := ">"
		if pending {
			id = "0"
		}
		res, err := a.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{Group: "ledger", Consumer: consumer, Streams: []string{eventsStream, id}, Count: 500, Block: 500 * time.Millisecond}).Result()
		if err != nil && err != redis.Nil {
			if ctx.Err() == nil {
				log.Printf("ledger read: %v", err)
				time.Sleep(time.Second)
			}
			continue
		}
		var msgs []redis.XMessage
		for _, s := range res {
			msgs = append(msgs, s.Messages...)
		}
		if len(msgs) == 0 {
			pending = false
			continue
		}
		if err := a.writeBatch(ctx, msgs); err != nil {
			log.Printf("ledger write: %v", err)
			time.Sleep(time.Second)
			continue
		}
		ids := make([]string, len(msgs))
		for i, m := range msgs {
			ids[i] = m.ID
		}
		a.rdb.XAck(ctx, eventsStream, "ledger", ids...)
	}
}

func str(v any) string { s, _ := v.(string); return s }

func (a *App) writeBatch(ctx context.Context, msgs []redis.XMessage) error {
	tx, err := a.pg.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var seq int64
	var prev string
	if err := tx.QueryRow(ctx, "SELECT seq,hash FROM audit_head WHERE id=1 FOR UPDATE").Scan(&seq, &prev); err != nil {
		return err
	}
	ids := make([]string, len(msgs))
	for i, m := range msgs {
		ids[i] = m.ID
	}
	have := map[string]bool{}
	rows, err := tx.Query(ctx, "SELECT stream_id FROM audit_log WHERE stream_id = ANY($1)", ids)
	if err != nil {
		return err
	}
	for rows.Next() {
		var s string
		rows.Scan(&s)
		have[s] = true
	}
	rows.Close()
	batch := &pgx.Batch{}
	n := 0
	for _, m := range msgs {
		if have[m.ID] {
			continue
		}
		typ, drop, payload := str(m.Values["type"]), str(m.Values["drop"]), str(m.Values["payload"])
		epoch, _ := strconv.Atoi(str(m.Values["epoch"]))
		seq++
		h := chainHash(prev, seq, drop, epoch, typ, payload)
		batch.Queue("INSERT INTO audit_log(seq,stream_id,drop_id,epoch,event_type,payload,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
			seq, m.ID, drop, epoch, typ, payload, prev, h)
		prev = h
		n++
		var p map[string]any
		json.Unmarshal([]byte(payload), &p)
		switch typ {
		case "entry_registered":
			batch.Queue(`INSERT INTO entries(drop_id,receipt_id,tier_id,arrival_ms,replica)
				SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM drops WHERE id=$1 AND epoch=$6) ON CONFLICT DO NOTHING`,
				drop, str(p["receipt_id"]), str(p["tier"]), int64(p["arrival_ms"].(float64)), str(p["replica"]), epoch)
		case "tarpit_hit":
			batch.Queue(`INSERT INTO entries(drop_id,receipt_id,tier_id,arrival_ms,in_tarpit)
				SELECT $1,$2,'',$3,true WHERE EXISTS (SELECT 1 FROM drops WHERE id=$1 AND epoch=$4) ON CONFLICT DO NOTHING`,
				drop, str(p["receipt_id"]), int64(p["arrival_ms"].(float64)), epoch)
		case "seat_claimed":
			batch.Queue(`INSERT INTO allocations(drop_id,seat_no,tier_id,receipt_id,user_id)
				SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM drops WHERE id=$1 AND epoch=$6) ON CONFLICT DO NOTHING`,
				drop, int(p["seat_no"].(float64)), str(p["tier"]), str(p["receipt_id"]), str(p["user_id"]), epoch)
		}
	}
	if batch.Len() > 0 {
		br := tx.SendBatch(ctx, batch)
		for i := 0; i < batch.Len(); i++ {
			if _, err := br.Exec(); err != nil {
				br.Close()
				return err
			}
		}
		if err := br.Close(); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, "UPDATE audit_head SET seq=$1, hash=$2 WHERE id=1", seq, prev); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	a.m.LedgerWritten.Add(float64(n))
	return nil
}

type chainResult struct {
	OK       bool   `json:"ok"`
	Length   int64  `json:"length"`
	Head     string `json:"head_hash"`
	BrokenAt int64  `json:"broken_at,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

func (a *App) verifyChain(ctx context.Context) chainResult {
	rows, err := a.pg.Query(ctx, "SELECT seq,drop_id,epoch,event_type,payload,prev_hash,hash FROM audit_log ORDER BY seq")
	if err != nil {
		return chainResult{Reason: err.Error()}
	}
	defer rows.Close()
	prev := "0000000000000000000000000000000000000000000000000000000000000000"
	var n int64
	for rows.Next() {
		var seq int64
		var epoch int
		var drop, typ, payload, ph, h string
		rows.Scan(&seq, &drop, &epoch, &typ, &payload, &ph, &h)
		n++
		if seq != n {
			return chainResult{Length: n, BrokenAt: seq, Reason: "sequence gap"}
		}
		if ph != prev || chainHash(prev, seq, drop, epoch, typ, payload) != h {
			return chainResult{Length: n, BrokenAt: seq, Reason: "hash mismatch"}
		}
		prev = h
	}
	return chainResult{OK: true, Length: n, Head: prev}
}

func (a *App) hAudit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	lim, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if lim <= 0 || lim > 500 {
		lim = 50
	}
	rows, err := a.pg.Query(ctx, "SELECT seq,epoch,event_type,payload,prev_hash,hash,created_at FROM audit_log WHERE drop_id=$1 ORDER BY seq DESC LIMIT $2", id, lim)
	if err != nil {
		fail(w, 500, "db")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var seq int64
		var epoch int
		var typ, payload, ph, h string
		var ts time.Time
		rows.Scan(&seq, &epoch, &typ, &payload, &ph, &h, &ts)
		var raw json.RawMessage = json.RawMessage(payload)
		if !json.Valid(raw) {
			raw = json.RawMessage(`null`)
		}
		out = append(out, map[string]any{"seq": seq, "epoch": epoch, "type": typ, "payload": raw, "prev_hash": ph, "hash": h, "at": ts})
	}
	var cnt int64
	a.pg.QueryRow(ctx, "SELECT count(*) FROM audit_log WHERE drop_id=$1", id).Scan(&cnt)
	res := map[string]any{"events": out, "total": cnt}
	if r.URL.Query().Get("verify") == "1" {
		res["chain"] = a.verifyChain(ctx)
	}
	lag, _ := a.rdb.Get(ctx, "ledger:lag").Int64()
	res["ledger_lag"] = lag
	writeJSON(w, 200, res)
}

// Integrity: every number here must be 0 under correct operation. They are computed from independent sources
// (Redis hot state, the locked list, the Postgres audit log and unique-constrained tables).
func (a *App) integrity(ctx context.Context, id string) (map[string]any, error) {
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		return nil, err
	}
	viol := map[string]any{}
	info := map[string]any{}
	issued, _ := a.rdb.HLen(ctx, dk(id, "issued")).Result()
	entries, _ := a.rdb.HLen(ctx, dk(id, "entries")).Result()
	liveEntries, _ := a.rdb.HGet(ctx, "live:"+id, "entries").Int64()
	info["tokens_issued"], info["entries_registered"] = issued, entries
	// duplicate entries: more entries than tokens, or entry-creating attempts != stored entries
	dupe := int64(0)
	if entries > issued && d.Mode == "fairdrop" {
		dupe = entries - issued
	}
	if liveEntries > entries {
		dupe += liveEntries - entries
	}
	viol["duplicate_entries"] = dupe
	// oversold / duplicate seat
	owned, _ := a.rdb.HLen(ctx, dk(id, "seatown")).Result()
	over := int64(0)
	if owned > int64(d.totalSeats()) {
		over = owned - int64(d.totalSeats())
	}
	if d.Mode == "fcfs" {
		sold, _ := a.rdb.HGetAll(ctx, "base:"+id+":sold").Result()
		seats, _ := a.rdb.HLen(ctx, "base:"+id+":seats").Result()
		total := int64(0)
		for _, v := range sold {
			total += int64(atoi(v))
		}
		if total > int64(d.totalSeats()) || seats != total {
			over = max(total-int64(d.totalSeats()), 1)
		}
	}
	viol["oversold"] = over
	var pgAlloc, pgDistinctSeat, pgDistinctReceipt int64
	a.pg.QueryRow(ctx, "SELECT count(*),count(DISTINCT seat_no),count(DISTINCT receipt_id) FROM allocations WHERE drop_id=$1", id).Scan(&pgAlloc, &pgDistinctSeat, &pgDistinctReceipt)
	viol["duplicate_seats"] = (pgAlloc - pgDistinctSeat) + (pgAlloc - pgDistinctReceipt)
	if d.Mode == "fairdrop" && stateOrder[d.State] >= stateOrder["CLAIM"] {
		if pgAlloc > owned {
			viol["duplicate_seats"] = viol["duplicate_seats"].(int64) + (pgAlloc - owned)
		}
	}
	info["allocations_pg"], info["seats_owned_redis"] = pgAlloc, owned
	integ, _ := a.rdb.HGetAll(ctx, "integ:"+id).Result()
	info["blocked_duplicate_seat_attempts"] = atoi(integ["duplicate_seat_blocked"])
	info["illegal_transitions_rejected"] = atoi(integ["illegal_transition_rejected"])
	viol["invalid_transitions"] = atoi(integ["illegal_transition_applied"])
	llive, _ := a.rdb.HGetAll(ctx, "live:"+id).Result()
	info["rejected_reused_tokens"] = atoi(llive["rejected_reused"])
	// merkle + missing receipts (needs a locked list and a drained ledger)
	viol["broken_merkle"], viol["missing_receipts"] = int64(0), any(nil)
	lag, _ := a.rdb.Get(ctx, "ledger:lag").Int64()
	info["ledger_lag"] = lag
	if stateOrder[d.State] >= stateOrder["LOCKED"] && d.MerkleRoot != "" {
		t, err := a.tree(ctx, d)
		if err != nil {
			viol["broken_merkle"] = int64(1)
		} else {
			root := t.Root()
			if hex.EncodeToString(root[:]) != d.MerkleRoot {
				viol["broken_merkle"] = int64(1)
			}
			if lag == 0 {
				rows, err := a.pg.Query(ctx, "SELECT payload::json->>'receipt_id' FROM audit_log WHERE drop_id=$1 AND epoch=$2 AND event_type='entry_registered'", id, d.Epoch)
				if err == nil {
					missing := int64(0)
					var missingIDs []string
					for rows.Next() {
						var rid string
						rows.Scan(&rid)
						if t.Index(rid) < 0 {
							missing++
							if len(missingIDs) < 5 {
								missingIDs = append(missingIDs, rid)
							}
						}
					}
					rows.Close()
					viol["missing_receipts"] = missing
					info["missing_receipt_examples"] = missingIDs
				}
			}
		}
	}
	total := int64(0)
	for _, v := range viol {
		if n, ok := v.(int64); ok {
			total += n
		}
	}
	chain := a.verifyChain(ctx)
	if !chain.OK {
		total++
	}
	return map[string]any{"drop_id": id, "violations": viol, "info": info, "audit_chain": chain, "total_violations": total, "ok": total == 0}, nil
}

func (a *App) hIntegrity(w http.ResponseWriter, r *http.Request) {
	res, err := a.integrity(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, 404, "drop_not_found")
		return
	}
	writeJSON(w, 200, res)
}

var _ = fdcrypto.EmptyRoot
var _ = strings.Join
