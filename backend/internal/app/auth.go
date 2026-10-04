package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// OTP is SIMULATED: no SMS provider exists. The "SMS" is returned in the HTTP response so the
// demo is self-contained. The UI labels it clearly.

func userIDForPhone(phone string) string {
	h := sha256.Sum256([]byte("fairdrop/user/" + phone))
	return "u_" + hex.EncodeToString(h[:6])
}

// normPhone makes one SIM one identity: "+1 555-123-4567", "(1) 555 123 4567" and "15551234567" are the same number.
// Without this a single phone could mint unlimited "verified identities" just by changing the punctuation.
// Limit: national vs international form ("5551234567" vs "15551234567") needs a phone library plus a default country.
func normPhone(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return strings.TrimPrefix(b.String(), "00") // "00" = international prefix = "+"
}

const (
	otpMaxSends  = 3 // codes per phone per 10 min (each one is a paid SMS in production)
	otpMaxWrong  = 5 // wrong guesses before the code is destroyed (6 digits = 1,000,000 possibilities)
	adminMaxFail = 5 // wrong admin passwords per address per 5 min
)

// hit counts an event under key for ttl and returns how many there have been (fails open: a Redis error never locks anyone out).
func (a *App) hit(ctx context.Context, key string, ttl time.Duration) int {
	n, err := a.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0
	}
	if n == 1 {
		a.rdb.Expire(ctx, key, ttl)
	}
	return int(n)
}

func (a *App) hOTP(w http.ResponseWriter, r *http.Request) {
	var in struct{ Phone string `json:"phone"` }
	if decode(r, &in) != nil || len(in.Phone) > 32 {
		fail(w, 400, "bad_phone")
		return
	}
	phone := normPhone(in.Phone)
	if len(phone) < 7 || len(phone) > 15 {
		fail(w, 400, "bad_phone")
		return
	}
	if a.hit(r.Context(), "otpsent:"+phone, 10*time.Minute) > otpMaxSends {
		a.m.Rejected.WithLabelValues("otp_rate_limited").Inc()
		fail(w, 429, "otp_rate_limited")
		return
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	code := fmt.Sprintf("%06d", n.Int64())
	a.rdb.Set(r.Context(), "otp:"+phone, code, 5*time.Minute)
	a.rdb.Del(r.Context(), "otpwrong:"+phone)
	writeJSON(w, 200, map[string]any{"otp_sent": true, "simulated": true, "otp": code,
		"note": "SIMULATED OTP - no SMS is sent; the code is returned here for the demo"})
}

func (a *App) hVerify(w http.ResponseWriter, r *http.Request) {
	var in struct{ Phone, OTP string }
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	ctx := r.Context()
	phone := normPhone(in.Phone)
	want, err := a.rdb.Get(ctx, "otp:"+phone).Result()
	if err != nil || subtle.ConstantTimeCompare([]byte(want), []byte(in.OTP)) != 1 {
		if err == nil && a.hit(ctx, "otpwrong:"+phone, 5*time.Minute) >= otpMaxWrong {
			a.rdb.Del(ctx, "otp:"+phone) // guessing is over: this code is dead, ask for a new one
			a.m.Rejected.WithLabelValues("otp_locked").Inc()
			fail(w, 429, "too_many_attempts")
			return
		}
		fail(w, 401, "bad_otp")
		return
	}
	a.rdb.Del(ctx, "otp:"+phone, "otpwrong:"+phone)
	in.Phone = phone
	uid := userIDForPhone(phone)
	var vat time.Time
	// first verification time wins; re-verifying later never moves a user before the cutoff
	err = a.pg.QueryRow(ctx, `INSERT INTO users(id,phone,verified_at) VALUES($1,$2,now())
		ON CONFLICT (id) DO UPDATE SET phone=EXCLUDED.phone RETURNING verified_at`, uid, in.Phone).Scan(&vat)
	if err != nil {
		fail(w, 500, "db")
		return
	}
	a.rdb.HSet(ctx, "users:verified", uid, vat.UnixMilli())
	tok, _ := a.sign(uid, "user", vat.UnixMilli(), false, 24*time.Hour)
	writeJSON(w, 200, map[string]any{"token": tok, "user_id": uid, "verified_at": vat.UTC().Format(time.RFC3339Nano), "verified_at_ms": vat.UnixMilli()})
}

func (a *App) hAdminLogin(w http.ResponseWriter, r *http.Request) {
	var in struct{ Username, Password string }
	if decode(r, &in) != nil {
		fail(w, 400, "bad_request")
		return
	}
	ctx := r.Context()
	lockKey := "adminfail:" + clientIP(a, r)
	if n, _ := a.rdb.Get(ctx, lockKey).Int(); n >= adminMaxFail {
		a.m.Rejected.WithLabelValues("admin_locked").Inc()
		fail(w, 429, "locked", "detail", "too many wrong passwords from this address; try again in 5 minutes")
		return
	}
	ok := subtle.ConstantTimeCompare([]byte(in.Username), []byte(a.cfg.AdminUser)) == 1 &&
		subtle.ConstantTimeCompare([]byte(in.Password), []byte(a.cfg.AdminPass)) == 1
	if !ok {
		a.hit(ctx, lockKey, 5*time.Minute)
		fail(w, 401, "bad_credentials")
		return
	}
	a.rdb.Del(ctx, lockKey)
	tok, _ := a.sign("admin:"+in.Username, "admin", 0, false, 12*time.Hour)
	writeJSON(w, 200, map[string]any{"token": tok, "role": "admin"})
}

// userVerifiedAt reads the hot cache, falling back to Postgres.
func (a *App) userVerifiedAt(r *http.Request, uid string) (int64, bool) {
	ctx := r.Context()
	if s, err := a.rdb.HGet(ctx, "users:verified", uid).Result(); err == nil {
		return atoi64(s), true
	}
	var t time.Time
	if err := a.pg.QueryRow(ctx, "SELECT verified_at FROM users WHERE id=$1", uid).Scan(&t); err != nil {
		if err != pgx.ErrNoRows {
			return 0, false
		}
		return 0, false
	}
	a.rdb.HSet(ctx, "users:verified", uid, t.UnixMilli())
	return t.UnixMilli(), true
}
