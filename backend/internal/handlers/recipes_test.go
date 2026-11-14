package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/patriciodanos/recipes-repo/backend/internal/middleware"
)

// ─── Rate limiter ──────────────────────────────────────────────────────────────

func TestAllowChatMessage(t *testing.T) {
	h := NewRecipeHandler(nil, nil)
	const user = "user-1"

	for i := 0; i < chatRateLimit; i++ {
		if !h.allowChatMessage(user) {
			t.Fatalf("message %d: expected allowed, got rate-limited", i+1)
		}
	}

	if h.allowChatMessage(user) {
		t.Fatalf("expected message %d to be rate-limited", chatRateLimit+1)
	}

	// A different user has their own independent budget.
	if !h.allowChatMessage("user-2") {
		t.Fatalf("expected a different user to have an independent rate limit budget")
	}
}

func TestAllowChatMessage_WindowExpiry(t *testing.T) {
	h := NewRecipeHandler(nil, nil)
	const user = "user-1"

	// Seed chatLog with chatRateLimit timestamps that are already outside the
	// window, simulating "the window has elapsed" without actually sleeping.
	old := time.Now().Add(-chatRateWindow - time.Minute)
	seeded := make([]time.Time, chatRateLimit)
	for i := range seeded {
		seeded[i] = old
	}
	h.chatLog[user] = seeded

	if !h.allowChatMessage(user) {
		t.Fatalf("expected message to be allowed once old timestamps have fallen out of the window")
	}
	if len(h.chatLog[user]) != 1 {
		t.Fatalf("expected stale timestamps to be pruned, got %d entries", len(h.chatLog[user]))
	}
}

func TestAllowChatMessage_ConcurrentSafe(t *testing.T) {
	h := NewRecipeHandler(nil, nil)
	const user = "concurrent-user"

	done := make(chan struct{})
	for i := 0; i < 50; i++ {
		go func() {
			h.allowChatMessage(user)
			done <- struct{}{}
		}()
	}
	for i := 0; i < 50; i++ {
		<-done
	}
	// No assertion beyond "the race detector / mutex didn't blow up" — this
	// test exists to be run with `go test -race`.
}

// ─── Chat handler validation ───────────────────────────────────────────────────

// newChatTestRequest builds a POST request to the Chat handler with a chi
// route context populated, mirroring what the real chi router sets up.
func newChatTestRequest(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/recipes/recipe-1/chat", strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "recipe-1")
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestChat_ValidationErrors(t *testing.T) {
	// db is intentionally nil: every case below must return before any DB
	// access is attempted (validation happens first in the handler).
	h := NewRecipeHandler(nil, nil)

	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{"invalid JSON body", `{"message":`, http.StatusBadRequest},
		{"empty message", `{"message":"   ","history":[]}`, http.StatusBadRequest},
		{
			"message too long",
			fmt.Sprintf(`{"message":%q,"history":[]}`, strings.Repeat("a", chatMaxMessageLen+1)),
			http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.Chat(w, newChatTestRequest(tt.body))
			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.wantStatus, w.Body.String())
			}
		})
	}
}

func TestChat_RateLimitedBeforeDBAccess(t *testing.T) {
	// db is intentionally nil: if rate-limiting is bypassed, this test would
	// panic on a nil pointer DB access instead of returning 429, so a panic
	// here is itself a meaningful failure signal.
	h := NewRecipeHandler(nil, nil)

	// Exhaust the budget for this user via the middleware context.
	userID := "rate-limited-user"
	for i := 0; i < chatRateLimit; i++ {
		if !h.allowChatMessage(userID) {
			t.Fatalf("setup: message %d unexpectedly rate-limited", i+1)
		}
	}

	req := newChatTestRequest(`{"message":"Can I use butter instead?","history":[]}`)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))

	w := httptest.NewRecorder()
	h.Chat(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusTooManyRequests, w.Body.String())
	}
}
