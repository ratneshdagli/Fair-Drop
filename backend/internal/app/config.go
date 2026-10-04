package app

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Mode         string // api | worker
	Addr         string
	RedisAddr    string
	RedisDB      int
	PGDSN        string
	JWTSecret    string
	AdminUser    string
	AdminPass    string
	TestMode     bool
	TestKey      string
	ReplicaID    string
	BlindMode    string // blind (RFC 9474) | plain (PRD fallback)
	DrandEnabled bool
	DrandURL     string
	PromURL      string
	MaxPerAcct   int // FCFS / naive counterfactual purchase cap per account
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func LoadConfig() Config {
	host, _ := os.Hostname()
	mp, _ := strconv.Atoi(env("MAX_PER_ACCOUNT", "4"))
	return Config{
		Mode:         env("MODE", "api"),
		Addr:         env("ADDR", ":8080"),
		RedisAddr:    env("REDIS_ADDR", "localhost:6379"),
		RedisDB:      atoiEnv("REDIS_DB"),
		PGDSN:        env("PG_DSN", "postgres://fairdrop:fairdrop@localhost:5432/fairdrop?sslmode=disable"),
		JWTSecret:    env("JWT_SECRET", "dev-only-change-me-jwt-secret"),
		AdminUser:    env("ADMIN_USER", "admin"),
		AdminPass:    env("ADMIN_PASSWORD", "admin-demo-pass"),
		TestMode:     strings.EqualFold(env("TEST_MODE", "false"), "true"),
		TestKey:      env("TEST_KEY", "test-key-demo"),
		ReplicaID:    env("REPLICA_ID", host),
		BlindMode:    env("BLIND_MODE", "blind"),
		DrandEnabled: strings.EqualFold(env("DRAND_ENABLED", "true"), "true"),
		DrandURL:     env("DRAND_URL", "https://api.drand.sh"),
		PromURL:      env("PROM_URL", ""),
		MaxPerAcct:   mp,
	}
}

func atoiEnv(k string) int { n, _ := strconv.Atoi(os.Getenv(k)); return n }
