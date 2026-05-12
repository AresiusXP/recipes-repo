package handlers

import (
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/patriciodanos/recipes-repo/backend/internal/middleware"
	"github.com/patriciodanos/recipes-repo/backend/internal/models"
)

// AdminHandler holds dependencies for admin HTTP handlers.
type AdminHandler struct {
	db *pgxpool.Pool
}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler(db *pgxpool.Pool) *AdminHandler {
	return &AdminHandler{db: db}
}

// RequireAdmin is middleware that checks whether the authenticated user is an admin.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := middleware.GetUserEmail(r)
		if !isAdminEmail(email) {
			jsonError(w, "Forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isAdminEmail(email string) bool {
	raw := os.Getenv("ADMIN_EMAILS")
	if raw == "" {
		raw = "aresiusxp@gmail.com"
	}
	for _, e := range strings.Split(raw, ",") {
		if strings.EqualFold(strings.TrimSpace(e), email) {
			return true
		}
	}
	return false
}

// ListUsers returns all users (admin only).
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, name, email, image, "isBanned", "bannedAt", "createdAt", "lastLoginAt"
		FROM "User"
		ORDER BY "createdAt" DESC
	`)
	if err != nil {
		slog.Error("failed to list users", "error", err)
		jsonError(w, "Failed to list users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := []models.AdminUser{}
	for rows.Next() {
		var u models.AdminUser
		rows.Scan(&u.ID, &u.Name, &u.Email, &u.Image, &u.IsBanned, &u.BannedAt, &u.CreatedAt, &u.LastLoginAt)
		users = append(users, u)
	}

	jsonOK(w, users)
}

// BanUser bans a user (admin only).
func (h *AdminHandler) BanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	now := time.Now()

	result, err := h.db.Exec(r.Context(), `
		UPDATE "User" SET "isBanned"=true, "bannedAt"=$1 WHERE id=$2
	`, now, userID)
	if err != nil {
		slog.Error("failed to ban user", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}

// UnbanUser unbans a user (admin only).
func (h *AdminHandler) UnbanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	result, err := h.db.Exec(r.Context(), `
		UPDATE "User" SET "isBanned"=false, "bannedAt"=NULL WHERE id=$1
	`, userID)
	if err != nil {
		slog.Error("failed to unban user", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}
