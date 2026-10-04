package app

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestAdminLayerCoalescesAndLimits(t *testing.T) {
	a := &App{adm: newAdminLayer()}
	var n atomic.Int32
	h := a.adminLayer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		time.Sleep(50 * time.Millisecond)
		writeJSON(w, 200, map[string]int{"x": 1})
	}))
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, httptest.NewRequest("GET", "/admin/drops?a=1", nil))
			if rr.Code != 200 || rr.Body.Len() == 0 {
				t.Error("bad response", rr.Code)
			}
		}()
	}
	wg.Wait()
	if n.Load() != 1 {
		t.Fatalf("expected 1 computation, got %d", n.Load())
	}
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/admin/x", nil)) // write wipes cache
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/admin/drops?a=1", nil))
	if n.Load() != 3 {
		t.Fatalf("write should invalidate, got %d", n.Load())
	}
	now := time.Now()
	ok := 0
	for i := 0; i < 100; i++ {
		if a.adm.allow("1.2.3.4", now) {
			ok++
		}
	}
	if ok != 40 {
		t.Fatalf("burst should be 40, got %d", ok)
	}
}
