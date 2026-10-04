package app

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"fairdrop/internal/fdcrypto"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type App struct {
	cfg      Config
	rdb      *redis.Client
	pg       *pgxpool.Pool
	jwtKey   []byte
	rts      sync.Map // "dropID:epoch" -> *dropRT
	trees    sync.Map // "dropID:root" -> *fdcrypto.Tree
	m        *metrics
	lat      *latTracker
	guard    atomic.Pointer[guardCfg]
	guardAt  atomic.Int64
	started  time.Time
	reqTotal atomic.Int64
	inflight atomic.Int64
	err5xx   atomic.Int64
	feedCh   chan feedRec
	traceCh  chan traceRec
	traceOn  atomic.Bool
	adm      *adminLayer
}

func New(ctx context.Context, cfg Config) (*App, error) {
	a := &App{cfg: cfg, jwtKey: []byte(cfg.JWTSecret), started: time.Now(), lat: newLat(), adm: newAdminLayer()}
	defer a.startFeed(context.Background())
	defer a.startTrace(context.Background())
	a.rdb = redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, DB: cfg.RedisDB, PoolSize: 200, MinIdleConns: 20})
	var err error
	for i := 0; i < 60; i++ {
		if err = a.rdb.Ping(ctx).Err(); err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}
	pc, err := pgxpool.ParseConfig(cfg.PGDSN)
	if err != nil {
		return nil, err
	}
	pc.MaxConns = 20
	for i := 0; i < 60; i++ {
		a.pg, err = pgxpool.NewWithConfig(ctx, pc)
		if err == nil {
			if err = a.pg.Ping(ctx); err == nil {
				break
			}
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}
	// ponytail: idempotent CREATE IF NOT EXISTS migrations; concurrent replicas serialise on an advisory lock.
	conn, err := a.pg.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(424242)"); err != nil {
		return nil, err
	}
	_, err = conn.Exec(ctx, schemaSQL)
	conn.Exec(ctx, "SELECT pg_advisory_unlock(424242)")
	if err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	a.m = newMetrics()
	return a, nil
}

func (a *App) Close() { a.rdb.Close(); a.pg.Close() }

// ---- key helpers ----
func dk(d, s string) string { return "drop:" + d + ":" + s }

const eventsStream = "events"

// ---- misc helpers ----
func nowMS() int64 { return time.Now().UnixMilli() }

func randHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func atoi(s string) int       { n, _ := strconv.Atoi(s); return n }
func atoi64(s string) int64   { n, _ := strconv.ParseInt(s, 10, 64); return n }
func itoa(n int64) string     { return strconv.FormatInt(n, 10) }
func b64(b []byte) string     { return base64.StdEncoding.EncodeToString(b) }
func unb64(s string) ([]byte, error) {
	if b, err := base64.StdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.RawStdEncoding.DecodeString(s)
}

// ---- drop model ----

type Tier struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PriceCents int    `json:"price_cents"`
	Seats      int    `json:"seats"`
}

type Drop struct {
	ID, EventID, EventName, Venue string
	StartsAtMS                    int64
	Mode, State                   string
	Epoch                         int
	OpensMS, ClosesMS, CutoffMS   int64
	ClaimSec                      int
	AutoDraw                      bool
	SeedHash, PublicKey           string
	PublicKeyJWK                  json.RawMessage
	ReceiptKey, TokenMode         string
	Tiers                         []Tier
	MerkleRoot, Seed              string
	EntryCount                    int
	BeaconRound                   uint64
	Beacon, BeaconSig, Final      string
	raw                           map[string]string
}

var ErrNoDrop = errors.New("drop not found")

func parseDrop(m map[string]string) *Drop {
	d := &Drop{raw: m, ID: m["id"], EventID: m["event_id"], EventName: m["event_name"], Venue: m["venue"],
		StartsAtMS: atoi64(m["starts_at_ms"]), Mode: m["mode"], State: m["state"], Epoch: atoi(m["epoch"]),
		OpensMS: atoi64(m["opens_at_ms"]), ClosesMS: atoi64(m["closes_at_ms"]), CutoffMS: atoi64(m["cutoff_at_ms"]),
		ClaimSec: atoi(m["claim_sec"]), AutoDraw: m["auto_draw"] == "1", SeedHash: m["seed_hash"], PublicKey: m["public_key"],
		PublicKeyJWK: json.RawMessage(m["public_key_jwk"]), ReceiptKey: m["receipt_key"], TokenMode: m["token_mode"],
		MerkleRoot: m["merkle_root"], Seed: m["seed"], EntryCount: atoi(m["entry_count"]),
		BeaconRound: uint64(atoi64(m["beacon_round"])), Beacon: m["beacon"], BeaconSig: m["beacon_sig"], Final: m["final"]}
	json.Unmarshal([]byte(m["tiers_json"]), &d.Tiers)
	return d
}

func (a *App) loadDrop(ctx context.Context, id string) (*Drop, error) {
	m, err := a.rdb.HGetAll(ctx, "drop:"+id).Result()
	if err != nil {
		return nil, err
	}
	if len(m) == 0 {
		return nil, ErrNoDrop
	}
	return parseDrop(m), nil
}

func (d *Drop) tier(id string) *Tier {
	for i := range d.Tiers {
		if d.Tiers[i].ID == id {
			return &d.Tiers[i]
		}
	}
	return nil
}

func (d *Drop) tierOffset(id string) int {
	off := 0
	for _, t := range d.Tiers {
		if t.ID == id {
			return off
		}
		off += t.Seats
	}
	return off
}

func (d *Drop) totalSeats() int {
	n := 0
	for _, t := range d.Tiers {
		n += t.Seats
	}
	return n
}

// dropRT caches immutable per-epoch material (parsed keys). State is always read fresh.
type dropRT struct {
	*Drop
	key *fdcrypto.IssuerKey
	pub *rsa.PublicKey
}

func (a *App) rt(ctx context.Context, id string) (*dropRT, string, error) {
	vals, err := a.rdb.HMGet(ctx, "drop:"+id, "state", "epoch", "seed_hash").Result()
	if err != nil {
		return nil, "", err
	}
	if vals[0] == nil {
		return nil, "", ErrNoDrop
	}
	state, epoch := vals[0].(string), vals[1].(string)
	// the key fingerprint is part of the cache key: a drop deleted and re-created under the same id (epoch 0 again) must not reuse the old key on another replica
	sh, _ := vals[2].(string)
	ck := id + ":" + epoch + ":" + sh
	if v, ok := a.rts.Load(ck); ok {
		return v.(*dropRT), state, nil
	}
	d, err := a.loadDrop(ctx, id)
	if err != nil {
		return nil, "", err
	}
	blob, err := a.rdb.HGet(ctx, dk(id, "secret"), "key").Result()
	if err != nil {
		return nil, "", fmt.Errorf("drop key: %w", err)
	}
	k, err := fdcrypto.ParseIssuerKey(blob)
	if err != nil {
		return nil, "", err
	}
	r := &dropRT{Drop: d, key: k, pub: &k.RSA.PublicKey}
	a.rts.Store(ck, r)
	return r, state, nil
}

// view returns the public drop representation (GET /drops/{id}).
func (d *Drop) view() map[string]any {
	tiers := make([]map[string]any, len(d.Tiers))
	for i, t := range d.Tiers {
		tiers[i] = map[string]any{"id": t.ID, "name": t.Name, "price_cents": t.PriceCents, "seats": t.Seats, "seat_offset": d.tierOffset(t.ID)}
	}
	iso := func(ms int64) string { return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano) }
	v := map[string]any{
		"id": d.ID, "event_id": d.EventID, "event_name": d.EventName, "venue": d.Venue,
		"starts_at": iso(d.StartsAtMS), "mode": d.Mode, "state": d.State, "epoch": d.Epoch,
		"opens_at": iso(d.OpensMS), "closes_at": iso(d.ClosesMS), "cutoff_at": iso(d.CutoffMS),
		"opens_at_ms": d.OpensMS, "closes_at_ms": d.ClosesMS, "cutoff_at_ms": d.CutoffMS,
		"claim_sec": d.ClaimSec, "seed_hash": d.SeedHash, "public_key": d.PublicKey,
		"public_key_jwk": d.PublicKeyJWK, "receipt_public_key": d.ReceiptKey, "token_mode": d.TokenMode,
		"tiers": tiers, "total_seats": d.totalSeats(), "server_time_ms": nowMS(),
	}
	// when the sale really opened / closed, by the one clock all decisions use (Redis TIME): lets a test check the boundaries exactly
	if t := atoi64(d.raw["at_OPEN"]); t > 0 {
		v["opened_at_ms"] = t
	}
	if t := atoi64(d.raw["at_CLOSED"]); t > 0 {
		v["closed_at_ms"] = t
	}
	if d.MerkleRoot != "" {
		v["merkle_root"] = d.MerkleRoot
		v["entry_count"] = d.EntryCount
		v["beacon_round"] = d.BeaconRound
	}
	if d.Seed != "" {
		v["seed"] = d.Seed
		v["final_randomness"] = d.Final
		if d.Beacon != "" {
			v["beacon"] = d.Beacon
		}
	}
	return v
}

// ---- events / ledger input ----

func (a *App) emit(ctx context.Context, drop string, epoch int, typ string, payload any) {
	b, _ := json.Marshal(payload)
	if err := a.rdb.XAdd(ctx, &redis.XAddArgs{Stream: eventsStream, Values: map[string]any{
		"type": typ, "drop": drop, "epoch": epoch, "payload": string(b)}}).Err(); err != nil {
		log.Printf("emit %s: %v", typ, err)
	}
}

func (a *App) live(ctx context.Context, drop, field string, n int64) {
	if drop == "" {
		drop = "global"
	}
	a.rdb.HIncrBy(ctx, "live:"+drop, field, n)
}

func randRead(b []byte) (int, error) { return rand.Read(b) }
