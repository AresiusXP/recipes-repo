package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
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

// versionOrUnknown returns the value of the named environment variable, or
// "unknown" when it is unset or empty (e.g. in local development where the
// Helm-injected APP_VERSION_* vars are absent).
func versionOrUnknown(envKey string) string {
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		return v
	}
	return "unknown"
}

// GetInfo returns deployment metadata such as the running service versions
// (admin only). Versions are injected as env vars by the Helm chart at deploy
// time; see helm/recipes/templates/backend-deployment.yaml.
func (h *AdminHandler) GetInfo(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, models.AdminInfo{
		Versions: models.ServiceVersions{
			Backend:  versionOrUnknown("APP_VERSION_BACKEND"),
			Frontend: versionOrUnknown("APP_VERSION_FRONTEND"),
			Scraper:  versionOrUnknown("APP_VERSION_SCRAPER"),
		},
	})
}

// ListUsers returns all users (admin only).
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT u.id, u.name, u.email, u.image, u."isBanned", u."bannedAt",
		       u."createdAt", u."lastLoginAt",
		       COUNT(r.id) AS recipe_count
		FROM "User" u
		LEFT JOIN "Recipe" r ON r."userId" = u.id
		GROUP BY u.id
		ORDER BY u."createdAt" DESC
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
		rows.Scan(&u.ID, &u.Name, &u.Email, &u.Image, &u.IsBanned, &u.BannedAt, &u.CreatedAt, &u.LastLoginAt, &u.RecipeCount)
		u.AccountProviders = []string{}
		users = append(users, u)
	}

	jsonOK(w, users)
}

// BanUser bans a user (admin only).
func (h *AdminHandler) BanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	// An admin must not lock themselves out, and one admin must not be able to
	// ban another admin. The UI hides the self-ban button, but the endpoint has
	// to enforce both rules itself.
	if userID == middleware.GetUserID(r) {
		jsonError(w, "You cannot ban your own account", http.StatusBadRequest)
		return
	}

	var email string
	if err := h.db.QueryRow(r.Context(), `SELECT email FROM "User" WHERE id=$1`, userID).Scan(&email); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "User not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to load user for ban", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if isAdminEmail(email) {
		jsonError(w, "You cannot ban an admin account", http.StatusForbidden)
		return
	}

	result, err := h.db.Exec(r.Context(), `
		UPDATE "User" SET "isBanned"=true, "bannedAt"=$1 WHERE id=$2
	`, time.Now(), userID)
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

// DeleteUser permanently deletes a user and all their data (admin only).
//
// The database schema cascades deletes from "User" to the user's recipes,
// notifications, account providers, and import jobs (ON DELETE CASCADE), so a
// single DELETE removes all owned rows. Recipes shared to *other* users survive
// because those references use ON DELETE SET NULL.
//
// The user lookup, recipe-image collection and delete run in one transaction
// with the target "User" row locked FOR UPDATE. A concurrent recipe insert for
// this user takes a FOR KEY SHARE lock on that row (Postgres FK enforcement),
// which conflicts with our lock and therefore blocks until we commit — so no
// recipe image can slip in between collection and delete and be orphaned.
//
// The cascade does not touch media files on disk, so image paths are collected
// before the delete and cleaned up after the commit: recipe images via
// safeDeleteMediaFile (which skips files still referenced by a surviving recipe)
// and the user's avatar via deleteMediaFile (avatars are never shared).
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	// An admin deleting their own account mid-session would be surprising and
	// would orphan their session; the UI already hides the button for self.
	if userID == middleware.GetUserID(r) {
		jsonError(w, "You cannot delete your own account", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		slog.Error("failed to begin delete-user transaction", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	// Safe no-op if the tx was already committed; guarantees rollback otherwise.
	defer tx.Rollback(ctx)

	// Lock the user row so concurrent recipe inserts for this user block until
	// we commit. Collect the email (for the admin guard) and avatar path while
	// we are here, distinguishing a missing user from a query failure.
	var email string
	var avatarPath *string
	if err := tx.QueryRow(ctx, `SELECT email, image FROM "User" WHERE id=$1 FOR UPDATE`, userID).Scan(&email, &avatarPath); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "User not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to load user for deletion", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Admins are defined by the ADMIN_EMAILS allowlist, so one admin must not be
	// able to delete another admin (or, combined with the self guard above,
	// themselves) and wipe their data.
	if isAdminEmail(email) {
		jsonError(w, "You cannot delete an admin account", http.StatusForbidden)
		return
	}

	imagePaths := []string{}
	rows, err := tx.Query(ctx, `SELECT "imagePath" FROM "Recipe" WHERE "userId"=$1 AND "imagePath" IS NOT NULL`, userID)
	if err != nil {
		slog.Error("failed to list user recipe images", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			slog.Error("failed to scan user recipe image", "error", err, "userId", userID)
			jsonError(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		imagePaths = append(imagePaths, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		slog.Error("failed to read user recipe images", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	result, err := tx.Exec(ctx, `DELETE FROM "User" WHERE id=$1`, userID)
	if err != nil {
		slog.Error("failed to delete user", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		// The row existed under our lock, so this should not happen; treat a
		// vanished row as not-found rather than reporting success.
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("failed to commit user deletion", "error", err, "userId", userID)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Clean up media files now that the owning rows are gone (post-commit, so
	// safeDeleteMediaFile's reference check sees the cascade-deleted rows). An
	// image copied onto a surviving recipe is preserved.
	for _, p := range imagePaths {
		if isLocalMediaPath(p) {
			safeDeleteMediaFile(ctx, h.db, p)
		}
	}
	if avatarPath != nil && isLocalMediaPath(*avatarPath) {
		deleteMediaFile(*avatarPath)
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}
