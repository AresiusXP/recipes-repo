package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/patriciodanos/recipes-repo/backend/internal/db"
	"github.com/patriciodanos/recipes-repo/backend/internal/handlers"
	"github.com/patriciodanos/recipes-repo/backend/internal/middleware"
	"github.com/patriciodanos/recipes-repo/backend/internal/scraper"
)

func main() {
	// ── Logger ────────────────────────────────────────────────────────────────
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))

	// ── Database ──────────────────────────────────────────────────────────────
	ctx := context.Background()
	pool, err := db.Connect(ctx)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	slog.Info("connected to PostgreSQL")

	// ── Scraper client ────────────────────────────────────────────────────────
	scraperClient := scraper.NewClient()

	// ── Handlers ──────────────────────────────────────────────────────────────
	recipeHandler := handlers.NewRecipeHandler(pool, scraperClient)
	userHandler := handlers.NewUserHandler(pool)
	notifHandler := handlers.NewNotificationHandler(pool)
	adminHandler := handlers.NewAdminHandler(pool)
	mediaHandler := handlers.NewMediaHandler()
	authHandler := handlers.NewAuthHandler(pool)

	// ── Reconcile pending import jobs from before restart ─────────────────────
	go recipeHandler.ReconcilePendingJobs(ctx)

	// ── Router ────────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))

	// Health check (no auth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Internal auth endpoint (called by frontend NextAuth, protected by BACKEND_INTERNAL_SECRET)
	r.Post("/api/auth/signin", authHandler.SignIn)

	// Media serving (no auth — public files)
	r.Get("/api/media/{filename}", mediaHandler.ServeFile)

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)

		// Media upload
		r.Post("/api/media", mediaHandler.Upload)

		// Recipes
		r.Get("/api/recipes", recipeHandler.List)
		r.Post("/api/recipes", recipeHandler.Create)
		r.Get("/api/recipes/{id}", recipeHandler.Get)
		r.Put("/api/recipes/{id}", recipeHandler.Update)
		r.Delete("/api/recipes/{id}", recipeHandler.Delete)

		// Async import
		r.Post("/api/recipes/import", recipeHandler.ImportFromURL)
		r.Post("/api/recipes/import/text", recipeHandler.ImportFromText)
		r.Get("/api/recipes/import/{jobId}", recipeHandler.GetImportJobStatus)

		// Recipe actions
		r.Post("/api/recipes/{id}/translate", recipeHandler.Translate)
		r.Post("/api/recipes/{id}/share", recipeHandler.Share)
		r.Post("/api/recipes/{id}/favorite", recipeHandler.ToggleFavorite)
		r.Post("/api/recipes/{id}/cook-this-week", recipeHandler.SetCookThisWeek)
		r.Delete("/api/recipes/{id}/cook-this-week", recipeHandler.RemoveCookThisWeek)

		// Users
		r.Get("/api/users/me/settings", userHandler.GetSettings)
		r.Put("/api/users/me/settings", userHandler.UpdateSettings)
		r.Post("/api/users/me/avatar", userHandler.UploadAvatar)
		r.Get("/api/users/others", recipeHandler.GetOtherUsers)

		// Notifications
		r.Get("/api/notifications", notifHandler.List)
		r.Post("/api/notifications/{id}/read", notifHandler.MarkRead)
		r.Delete("/api/notifications/{id}", notifHandler.Delete)

		// Admin
		r.Group(func(r chi.Router) {
			r.Use(handlers.RequireAdmin)
			r.Get("/api/admin/users", adminHandler.ListUsers)
			r.Post("/api/admin/users/{id}/ban", adminHandler.BanUser)
			r.Post("/api/admin/users/{id}/unban", adminHandler.UnbanUser)
		})
	})

	// ── Start server ──────────────────────────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	slog.Info("starting backend server", "port", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
