package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/patriciodanos/recipes-repo/backend/internal/middleware"
	"github.com/patriciodanos/recipes-repo/backend/internal/models"
)

// UserHandler holds dependencies for user HTTP handlers.
type UserHandler struct {
	db *pgxpool.Pool
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(db *pgxpool.Pool) *UserHandler {
	return &UserHandler{db: db}
}

// GetSettings returns the current user's settings.
func (h *UserHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var settings models.UserSettings
	err := h.db.QueryRow(r.Context(), `
		SELECT name, email, image, "autoTranslateLanguage", "themePreference" FROM "User" WHERE id=$1
	`, userID).Scan(&settings.Name, &settings.Email, &settings.Image, &settings.AutoTranslateLanguage, &settings.ThemePreference)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "User not found", http.StatusNotFound)
		} else {
			slog.Error("failed to get user settings", "error", err)
			jsonError(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	jsonOK(w, settings)
}

// UpdateSettings updates the current user's settings.
func (h *UserHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.UserSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	_, err := h.db.Exec(r.Context(), `
		UPDATE "User" SET "autoTranslateLanguage"=$1, "themePreference"=$2 WHERE id=$3
	`, req.AutoTranslateLanguage, req.ThemePreference, userID)
	if err != nil {
		slog.Error("failed to update user settings", "error", err)
		jsonError(w, "Failed to update settings", http.StatusInternalServerError)
		return
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}

// UploadAvatar handles profile image upload.
func (h *UserHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		jsonError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		jsonError(w, "No image provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate MIME type
	ct := header.Header.Get("Content-Type")
	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(ct, ";")[0]))
	allowed := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
		"image/gif":  ".gif",
	}
	ext, ok := allowed[mimeType]
	if !ok {
		jsonError(w, "Unsupported image type", http.StatusBadRequest)
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, 10*1024*1024))
	if err != nil || len(data) == 0 {
		jsonError(w, "Failed to read image", http.StatusBadRequest)
		return
	}

	filename := uuid.New().String() + ext
	dir := mediaDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		jsonError(w, "Failed to create media directory", http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		jsonError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	var publicPath string
	if strings.HasPrefix(dir, "public/") {
		publicPath = "/" + strings.TrimPrefix(dir, "public/") + "/" + filename
	} else {
		publicPath = "/media/" + filename
	}

	// Delete old avatar if local
	var oldImage *string
	h.db.QueryRow(r.Context(), `SELECT image FROM "User" WHERE id=$1`, userID).Scan(&oldImage)
	if oldImage != nil && isLocalMediaPath(*oldImage) {
		deleteMediaFile(*oldImage)
	}

	if _, err := h.db.Exec(r.Context(), `UPDATE "User" SET image=$1 WHERE id=$2`, publicPath, userID); err != nil {
		slog.Error("failed to update user avatar in DB", "error", err)
		// Clean up the written file to avoid orphaned media
		os.Remove(filepath.Join(dir, filename))
		jsonError(w, "Failed to update avatar", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"imagePath": publicPath})
}

// writeFile is a helper used by other handlers.
func writeFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0644)
}
