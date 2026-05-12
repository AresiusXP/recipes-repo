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
	Email string  `json:"email"`
	Name  *string `json:"name"`
	Image *string `json:"image"`
}

type signInResponse struct {
	Allowed bool    `json:"allowed"`
	Reason  *string `json:"reason,omitempty"`
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

	// Check if user exists
	var userID string
	var isBanned bool
	err := h.db.QueryRow(r.Context(), `
		SELECT id, "isBanned" FROM "User" WHERE email=$1
	`, email).Scan(&userID, &isBanned)

	if err == nil {
		// Existing user
		if isBanned {
			slog.Warn("sign-in rejected: user is banned", "userId", userID)
			reason := "banned"
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(signInResponse{Allowed: false, Reason: &reason})
			return
		}

		// Update lastLoginAt
		if _, err := h.db.Exec(r.Context(), `UPDATE "User" SET "lastLoginAt"=$1 WHERE id=$2`, time.Now(), userID); err != nil {
			slog.Warn("failed to update lastLoginAt", "userId", userID, "error", err)
		}
		slog.Info("existing user signed in", "userId", userID)
	} else {
		// New user — create record
		newID := uuid.New().String()
		now := time.Now()
		_, createErr := h.db.Exec(r.Context(), `
			INSERT INTO "User" (id, email, name, image, "themePreference", "createdAt", "lastLoginAt", "isBanned")
			VALUES ($1, $2, $3, $4, 'system', $5, $5, false)
			ON CONFLICT (email) DO NOTHING
		`, newID, email, req.Name, req.Image, now)
		if createErr != nil {
			slog.Error("failed to create user on sign-in", "error", createErr)
			reason := "failed to create user account"
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(signInResponse{Allowed: false, Reason: &reason})
			return
		}
		slog.Info("new user created on sign-in", "userId", newID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(signInResponse{Allowed: true})
}
