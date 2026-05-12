package handlers

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/patriciodanos/recipes-repo/backend/internal/middleware"
	"github.com/patriciodanos/recipes-repo/backend/internal/models"
)

// NotificationHandler holds dependencies for notification HTTP handlers.
type NotificationHandler struct {
	db *pgxpool.Pool
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(db *pgxpool.Pool) *NotificationHandler {
	return &NotificationHandler{db: db}
}

// List returns all notifications for the current user.
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	rows, err := h.db.Query(r.Context(), `
		SELECT id, type, title, message, "isRead", "createdAt", "userId", "senderUserId", "recipeId"
		FROM "Notification"
		WHERE "userId" = $1
		ORDER BY "createdAt" DESC
	`, userID)
	if err != nil {
		slog.Error("failed to list notifications", "error", err)
		jsonError(w, "Failed to list notifications", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	notifications := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(
			&n.ID, &n.Type, &n.Title, &n.Message, &n.IsRead, &n.CreatedAt,
			&n.UserID, &n.SenderUserID, &n.RecipeID,
		); err != nil {
			continue
		}
		notifications = append(notifications, n)
	}

	jsonOK(w, notifications)
}

// MarkRead marks a notification as read.
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	notifID := chi.URLParam(r, "id")

	result, err := h.db.Exec(r.Context(), `
		UPDATE "Notification" SET "isRead"=true WHERE id=$1 AND "userId"=$2
	`, notifID, userID)
	if err != nil || result.RowsAffected() == 0 {
		jsonError(w, "Notification not found", http.StatusNotFound)
		return
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}

// Delete deletes a notification.
func (h *NotificationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	notifID := chi.URLParam(r, "id")

	result, err := h.db.Exec(r.Context(), `
		DELETE FROM "Notification" WHERE id=$1 AND "userId"=$2
	`, notifID, userID)
	if err != nil || result.RowsAffected() == 0 {
		jsonError(w, "Notification not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
