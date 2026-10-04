package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fairdrop/internal/app"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	cfg := app.LoadConfig()
	if !cfg.TestMode && (cfg.AdminPass == "admin-demo-pass" || cfg.JWTSecret == "dev-only-change-me-jwt-secret" || cfg.TestKey == "test-key-demo") {
		log.Fatal("refusing to start outside TEST_MODE with the demo admin password / JWT secret / test key: set ADMIN_PASSWORD, JWT_SECRET and TEST_KEY")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	a, err := app.New(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer a.Close()
	go a.Heartbeat(ctx)
	if cfg.Mode == "worker" {
		go a.RunLedger(ctx)
		go func() {
			mux := http.NewServeMux()
			mux.Handle("/metrics", promhttp.HandlerFor(a.Registry(), promhttp.HandlerOpts{}))
			mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
			log.Fatal(http.ListenAndServe(":9100", mux))
		}()
		log.Printf("worker %s started (timers + ledger)", cfg.ReplicaID)
		t := time.NewTicker(250 * time.Millisecond)
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				a.Tick(ctx)
			}
		}
	}
	srv := &http.Server{Addr: cfg.Addr, Handler: a.Router(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(c)
	}()
	log.Printf("api %s listening on %s test_mode=%v token_mode=%s", cfg.ReplicaID, cfg.Addr, cfg.TestMode, cfg.BlindMode)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
		os.Exit(1)
	}
}
