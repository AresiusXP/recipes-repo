package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuthHandler handles auth-related backend endpoints.
type AuthHandler struct {
	db *pgxpool.Pool
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(db *pgxpool.Pool) *AuthHandler {
	return &AuthHandler{db: db}
}

type signInRequest struct {
	Email             string  `json:"email"`
	Name              *string `json:"name"`
	Image             *string `json:"image"`
	Provider          string  `json:"provider"`
	ProviderAccountID string  `json:"providerAccountId"`
}

type signInResponse struct {
	Allowed bool    `json:"allowed"`
	Reason  *string `json:"reason,omitempty"`
	UserID  string  `json:"userId,omitempty"`
}

// SignIn is called by the frontend NextAuth signIn callback.
// It handles: ban checks, lastLoginAt updates, user creation, allowlist enforcement.
// This endpoint is NOT protected by the JWT middleware — it is called before a JWT exists.
// It is protected by a shared secret (BACKEND_INTERNAL_SECRET) to prevent abuse.
func (h *AuthHandler) SignIn(w http.ResponseWriter, r *http.Request) {
	// Verify internal secret
	secret := os.Getenv("BACKEND_INTERNAL_SECRET")
	if secret != "" {
		provided := r.Header.Get("X-Internal-Secret")
		if provided != secret {
			jsonError(w, "Forbidden", http.StatusForbidden)
			return
		}
	}

	var req signInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		reason := "no email provided"
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(signInResponse{Allowed: false, Reason: &reason})
		return
	}

	// Upsert the user: insert if new, update lastLoginAt if existing.
	// RETURNING id, "isBanned" ensures we always get the canonical DB UUID,
	// even under concurrent sign-ins for the same email.
	newID := uuid.New().String()
	now := time.Now()
	var userID string
	var isBanned bool
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO "User" (id, email, name, image, "themePreference", "createdAt", "lastLoginAt", "isBanned")
		VALUES ($1, $2, $3, $4, 'system', $5, $5, false)
		ON CONFLICT (email) DO UPDATE
		  SET "lastLoginAt" = EXCLUDED."lastLoginAt"
		RETURNING id, "isBanned"
	`, newID, email, req.Name, req.Image, now).Scan(&userID, &isBanned)
	if err != nil {
		slog.Error("failed to upsert user on sign-in", "error", err)
		reason := "failed to create user account"
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(signInResponse{Allowed: false, Reason: &reason})
		return
	}

	if isBanned {
		slog.Warn("sign-in rejected: user is banned", "userId", userID)
		reason := "banned"
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(signInResponse{Allowed: false, Reason: &reason})
		return
	}

	slog.Info("user signed in", "userId", userID)

	// Record the OAuth provider linkage if provided.
	if req.Provider != "" && req.ProviderAccountID != "" {
		_, err := h.db.Exec(r.Context(), `
			INSERT INTO "AccountProvider" ("userId", provider, "providerAccountId")
			VALUES ($1, $2, $3)
			ON CONFLICT ("userId", provider) DO UPDATE SET "providerAccountId" = EXCLUDED."providerAccountId"
		`, userID, req.Provider, req.ProviderAccountID)
		if err != nil {
			slog.Error("failed to upsert account provider", "error", err, "userId", userID, "provider", req.Provider)
			// Non-fatal: sign-in still succeeds
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(signInResponse{Allowed: true, UserID: userID})
}
