package handlers

import (
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// MediaHandler serves and accepts media files.
type MediaHandler struct{}

// NewMediaHandler creates a new MediaHandler.
func NewMediaHandler() *MediaHandler {
	return &MediaHandler{}
}

// ServeFile serves a media file by filename.
func (h *MediaHandler) ServeFile(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")

	// Security: reject path traversal
	if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}

	dir := mediaDir()
	fullPath := filepath.Join(dir, filename)

	// Ensure path is inside media dir
	absDir, _ := filepath.Abs(dir)
	absPath, _ := filepath.Abs(fullPath)
	if !strings.HasPrefix(absPath, absDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	http.ServeFile(w, r, fullPath)
}

// Upload accepts a multipart image upload and saves it to the media directory.
func (h *MediaHandler) Upload(w http.ResponseWriter, r *http.Request) {
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

	ct := header.Header.Get("Content-Type")
	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(ct, ";")[0]))

	extMap := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
		"image/gif":  ".gif",
	}
	ext, ok := extMap[mimeType]
	if !ok {
		// Try to detect from filename
		ext = strings.ToLower(filepath.Ext(header.Filename))
		if _, err := mime.ExtensionsByType(mimeType); err != nil || ext == "" {
			jsonError(w, "Unsupported image type", http.StatusBadRequest)
			return
		}
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

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"path": publicPath})
}
