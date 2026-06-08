package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	neturl "net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/patriciodanos/recipes-repo/backend/internal/gemini"
	"github.com/patriciodanos/recipes-repo/backend/internal/middleware"
	"github.com/patriciodanos/recipes-repo/backend/internal/models"
	"github.com/patriciodanos/recipes-repo/backend/internal/scraper"
)

// RecipeHandler holds dependencies for recipe HTTP handlers.
type RecipeHandler struct {
	db            *pgxpool.Pool
	scraperClient *scraper.Client
}

// NewRecipeHandler creates a new RecipeHandler.
func NewRecipeHandler(db *pgxpool.Pool, scraperClient *scraper.Client) *RecipeHandler {
	return &RecipeHandler{db: db, scraperClient: scraperClient}
}

// ─── List recipes ─────────────────────────────────────────────────────────────

func (h *RecipeHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	q := r.URL.Query()
	search := q.Get("q")
	favoritesOnly := q.Get("favorites") == "true"
	cookThisWeekOnly := q.Get("cookThisWeek") == "true"
	tagFilter := q["tags"]

	rows, err := h.db.Query(r.Context(), `
		SELECT r.id, r.title, r.description, r."imagePath", r."sourceUrl",
		       r."isFavorite", r."cookThisWeekUntil", r."createdAt",
		       COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
		FROM "Recipe" r
		LEFT JOIN "RecipeTag" rt ON rt."recipeId" = r.id
		LEFT JOIN "Tag" t ON t.id = rt."tagId"
		WHERE r."userId" = $1
		  AND ($2 = '' OR r.title ILIKE '%' || $2 || '%' OR r.ingredients ILIKE '%' || $2 || '%' OR r.description ILIKE '%' || $2 || '%')
		  AND ($3 = false OR r."isFavorite" = true)
		  AND ($4 = false OR r."cookThisWeekUntil" >= NOW())
		GROUP BY r.id
		ORDER BY r."createdAt" DESC
	`, userID, search, favoritesOnly, cookThisWeekOnly)
	if err != nil {
		slog.Error("failed to list recipes", "error", err)
		jsonError(w, "Failed to list recipes", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	recipes := []models.RecipeListItem{}
	for rows.Next() {
		var item models.RecipeListItem
		var tags []string
		if err := rows.Scan(
			&item.ID, &item.Title, &item.Description, &item.ImagePath, &item.SourceURL,
			&item.IsFavorite, &item.CookThisWeekUntil, &item.CreatedAt, &tags,
		); err != nil {
			slog.Error("failed to scan recipe row", "error", err)
			continue
		}
		item.Tags = tags
		if item.Tags == nil {
			item.Tags = []string{}
		}

		// Apply tag filter in Go (simpler than complex SQL)
		if len(tagFilter) > 0 && !hasAnyTag(item.Tags, tagFilter) {
			continue
		}

		recipes = append(recipes, item)
	}

	jsonOK(w, recipes)
}

// ─── Get single recipe ────────────────────────────────────────────────────────

func (h *RecipeHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	recipe, err := h.getRecipeByID(r.Context(), recipeID, userID)
	if err != nil {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	jsonOK(w, recipe)
}

// ─── Create recipe ────────────────────────────────────────────────────────────

func (h *RecipeHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.CreateRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		jsonError(w, "Title is required", http.StatusBadRequest)
		return
	}

	// Validate SourceURL if provided to prevent SSRF via the Translate handler
	if req.SourceURL != nil && *req.SourceURL != "" {
		if _, err := neturl.ParseRequestURI(*req.SourceURL); err != nil ||
			(!strings.HasPrefix(*req.SourceURL, "http://") && !strings.HasPrefix(*req.SourceURL, "https://")) {
			jsonError(w, "Invalid source URL", http.StatusBadRequest)
			return
		}
		if isPrivateOrLocalURL(*req.SourceURL) {
			jsonError(w, "URL points to a private or internal network", http.StatusBadRequest)
			return
		}
	}

	ingredientsJSON, _ := json.Marshal(req.Ingredients)
	stepsJSON, _ := json.Marshal(req.Steps)

	id := uuid.New().String()
	_, err := h.db.Exec(r.Context(), `
		INSERT INTO "Recipe" (id, title, description, "sourceUrl", "imagePath", ingredients, steps, "userId", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
	`, id, req.Title, req.Description, req.SourceURL, req.ImagePath,
		string(ingredientsJSON), string(stepsJSON), userID)
	if err != nil {
		slog.Error("failed to create recipe", "error", err)
		jsonError(w, "Failed to create recipe", http.StatusInternalServerError)
		return
	}

	if err := h.upsertTags(r.Context(), id, req.Tags); err != nil {
		slog.Error("failed to upsert tags", "error", err)
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"id": id})
}

// ─── Update recipe ────────────────────────────────────────────────────────────

func (h *RecipeHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	// Verify ownership
	var ownerID string
	err := h.db.QueryRow(r.Context(), `SELECT "userId" FROM "Recipe" WHERE id = $1`, recipeID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	var req models.UpdateRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ingredientsJSON, _ := json.Marshal(req.Ingredients)
	stepsJSON, _ := json.Marshal(req.Steps)

	var updateErr error
	var oldImagePath *string
	var newImagePath *string

	if req.ImagePath != nil {
		// Caller explicitly set imagePath (new upload, or removal — empty string means null).
		if *req.ImagePath != "" {
			newImagePath = req.ImagePath
		}
		// Fetch old path before updating so we can clean up the file after success.
		_ = h.db.QueryRow(r.Context(), `SELECT "imagePath" FROM "Recipe" WHERE id=$1`, recipeID).Scan(&oldImagePath)

		_, updateErr = h.db.Exec(r.Context(), `
			UPDATE "Recipe"
			SET title=$1, description=$2, ingredients=$3, steps=$4, "imagePath"=$5, "updatedAt"=NOW()
			WHERE id=$6 AND "userId"=$7
		`, req.Title, req.Description, string(ingredientsJSON), string(stepsJSON), newImagePath, recipeID, userID)
	} else {
		_, updateErr = h.db.Exec(r.Context(), `
			UPDATE "Recipe"
			SET title=$1, description=$2, ingredients=$3, steps=$4, "updatedAt"=NOW()
			WHERE id=$5 AND "userId"=$6
		`, req.Title, req.Description, string(ingredientsJSON), string(stepsJSON), recipeID, userID)
	}
	if updateErr != nil {
		slog.Error("failed to update recipe", "error", updateErr)
		jsonError(w, "Failed to update recipe", http.StatusInternalServerError)
		return
	}

	// Delete the old local image file only after the DB update succeeded,
	// and only if no other recipe still references it.
	if oldImagePath != nil && isLocalMediaPath(*oldImagePath) && (newImagePath == nil || *newImagePath != *oldImagePath) {
		safeDeleteMediaFile(r.Context(), h.db, *oldImagePath)
	}

	if err := h.upsertTags(r.Context(), recipeID, req.Tags); err != nil {
		slog.Error("failed to upsert tags", "error", err)
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}

// ─── Delete recipe ────────────────────────────────────────────────────────────

func (h *RecipeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	var imagePath *string
	err := h.db.QueryRow(r.Context(), `SELECT "imagePath" FROM "Recipe" WHERE id=$1 AND "userId"=$2`, recipeID, userID).Scan(&imagePath)
	if err != nil {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	_, err = h.db.Exec(r.Context(), `DELETE FROM "Recipe" WHERE id=$1 AND "userId"=$2`, recipeID, userID)
	if err != nil {
		slog.Error("failed to delete recipe", "error", err)
		jsonError(w, "Failed to delete recipe", http.StatusInternalServerError)
		return
	}

	// Delete image file if local and not referenced by any other recipe
	if imagePath != nil && isLocalMediaPath(*imagePath) {
		safeDeleteMediaFile(r.Context(), h.db, *imagePath)
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Import from URL (async) ──────────────────────────────────────────────────

func (h *RecipeHandler) ImportFromURL(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.ImportRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if _, err := neturl.ParseRequestURI(req.URL); err != nil || (!strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://")) {
		jsonError(w, "Invalid URL", http.StatusBadRequest)
		return
	}

	if isPrivateOrLocalURL(req.URL) {
		jsonError(w, "URL points to a private or internal network", http.StatusBadRequest)
		return
	}

	jobID := uuid.New().String()

	// Create job record in DB
	_, err := h.db.Exec(r.Context(), `
		INSERT INTO "RecipeImportJob" (id, "userId", url, status, "createdAt", "updatedAt")
		VALUES ($1, $2, $3, 'pending', NOW(), NOW())
	`, jobID, userID, req.URL)
	if err != nil {
		slog.Error("failed to create import job", "error", err)
		jsonError(w, "Failed to create import job", http.StatusInternalServerError)
		return
	}

	// Enqueue with scraper service
	if err := h.scraperClient.Enqueue(r.Context(), jobID, req.URL); err != nil {
		slog.Error("failed to enqueue scrape job", "error", err, "jobId", jobID)
		// Update job status to failed
		h.db.Exec(context.Background(), `
			UPDATE "RecipeImportJob" SET status='failed', error=$1, "updatedAt"=NOW() WHERE id=$2
		`, fmt.Sprintf("Failed to reach scraper service: %s", err.Error()), jobID)
		jsonError(w, "Scraper service unavailable", http.StatusServiceUnavailable)
		return
	}

	// Update job status to scraping
	h.db.Exec(context.Background(), `
		UPDATE "RecipeImportJob" SET status='scraping', "updatedAt"=NOW() WHERE id=$1
	`, jobID)

	// Start background goroutine to poll scraper and process result
	go h.processImportJob(jobID, userID, req.URL)

	w.WriteHeader(http.StatusAccepted)
	jsonOK(w, models.ImportJobResponse{JobID: jobID, Status: "pending"})
}

// ImportFromText handles async recipe import from raw text (manual import).
// The text is sent directly to Gemini for extraction — no scraping needed.
func (h *RecipeHandler) ImportFromText(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req struct {
		Text      string  `json:"text"`
		ImagePath *string `json:"imagePath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		jsonError(w, "Invalid request body: text is required", http.StatusBadRequest)
		return
	}

	jobID := uuid.New().String()

	// Create job record in DB (no URL for text imports)
	_, err := h.db.Exec(r.Context(), `
		INSERT INTO "RecipeImportJob" (id, "userId", url, status, "createdAt", "updatedAt")
		VALUES ($1, $2, '', 'extracting', NOW(), NOW())
	`, jobID, userID)
	if err != nil {
		slog.Error("failed to create text import job", "error", err)
		jsonError(w, "Failed to create import job", http.StatusInternalServerError)
		return
	}

	// Start background goroutine to extract recipe with Gemini
	go h.processTextImportJob(jobID, userID, req.Text, req.ImagePath)

	w.WriteHeader(http.StatusAccepted)
	jsonOK(w, models.ImportJobResponse{JobID: jobID, Status: "extracting"})
}

// GetImportJobStatus returns the current status of an import job.
func (h *RecipeHandler) GetImportJobStatus(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	jobID := chi.URLParam(r, "jobId")

	var job models.RecipeImportJob
	err := h.db.QueryRow(r.Context(), `
		SELECT id, "userId", url, status, "recipeId", error, "createdAt", "updatedAt"
		FROM "RecipeImportJob"
		WHERE id=$1 AND "userId"=$2
	`, jobID, userID).Scan(
		&job.ID, &job.UserID, &job.URL, &job.Status,
		&job.RecipeID, &job.Error, &job.CreatedAt, &job.UpdatedAt,
	)
	if err != nil {
		jsonError(w, "Job not found", http.StatusNotFound)
		return
	}

	jsonOK(w, job)
}

// processImportJob polls the scraper service and processes the result.
// Runs in a background goroutine.
func (h *RecipeHandler) processImportJob(jobID, userID, recipeURL string) {
	ctx := context.Background()
	log := slog.With("jobId", jobID, "url", recipeURL)

	const maxAttempts = 60 // 60 * 3s = 3 minutes max
	const pollInterval = 3 * time.Second

	var scraperResult *scraper.JobResult

	for attempt := 0; attempt < maxAttempts; attempt++ {
		time.Sleep(pollInterval)

		status, err := h.scraperClient.GetStatus(ctx, jobID)
		if err != nil {
			log.Error("failed to poll scraper status", "error", err)
			continue
		}

		switch status.Status {
		case "done":
			scraperResult = status.Result
		case "failed":
			errMsg := "Scraper failed"
			if status.Error != nil {
				errMsg = *status.Error
			}
			h.failJob(ctx, jobID, errMsg)
			return
		default:
			// still running/queued — keep polling
			continue
		}

		if scraperResult != nil {
			break
		}
	}

	if scraperResult == nil {
		h.failJob(ctx, jobID, "Scrape timed out")
		return
	}

	// Update status to extracting
	h.db.Exec(ctx, `UPDATE "RecipeImportJob" SET status='extracting', "updatedAt"=NOW() WHERE id=$1`, jobID)

	// Get user's auto-translate preference
	var autoTranslate *string
	h.db.QueryRow(ctx, `SELECT "autoTranslateLanguage" FROM "User" WHERE id=$1`, userID).Scan(&autoTranslate)

	var targetLang gemini.TargetLanguage
	if autoTranslate != nil {
		targetLang = gemini.TargetLanguage(*autoTranslate)
	}

	// Extract recipe with Gemini — use multimodal video extraction for Instagram reels
	var recipe *gemini.RecipeResult
	var err error
	if scraperResult.VideoURL != nil && *scraperResult.VideoURL != "" {
		recipe, err = gemini.ExtractRecipeFromVideo(ctx, *scraperResult.VideoURL, scraperResult.Content, recipeURL, targetLang)
	} else {
		recipe, err = gemini.ExtractRecipe(ctx, scraperResult.Content, recipeURL, targetLang)
	}
	if err != nil {
		log.Error("gemini extraction failed", "error", err)
		h.failJob(ctx, jobID, fmt.Sprintf("Could not extract recipe: %s", err.Error()))
		return
	}

	// Download image
	var imagePath *string
	if scraperResult.ImageURL != nil && *scraperResult.ImageURL != "" {
		absURL := *scraperResult.ImageURL
		if !strings.HasPrefix(absURL, "http") {
			if base, err := neturl.Parse(recipeURL); err == nil {
				if ref, err := neturl.Parse(absURL); err == nil {
					absURL = base.ResolveReference(ref).String()
				}
			}
		}
		if p := downloadImage(absURL); p != "" {
			imagePath = &p
		}
	}

	// Upsert tags
	ingredientsJSON, _ := json.Marshal(recipe.Ingredients)
	stepsJSON, _ := json.Marshal(recipe.Steps)

	isEnglish := recipe.DetectedLanguage == "en"
	isTranslatedToEnglish := targetLang == gemini.LangEnglish && !isEnglish
	var translatedLanguage *string
	if targetLang != "" && string(targetLang) != recipe.DetectedLanguage {
		tl := string(targetLang)
		translatedLanguage = &tl
	}
	hasBeenTranslated := translatedLanguage != nil

	recipeID := uuid.New().String()

	tx, err := h.db.Begin(ctx)
	if err != nil {
		h.failJob(ctx, jobID, "Database error")
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO "Recipe" (id, title, description, "sourceUrl", "imagePath", ingredients, steps,
		  "rawContent", "sourceLanguage", "isTranslatedToEnglish", "translatedLanguage",
		  "hasBeenTranslated", "userId", "createdAt", "updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
	`, recipeID, recipe.Title, recipe.Description, recipeURL, imagePath,
		string(ingredientsJSON), string(stepsJSON),
		scraperResult.Content[:min(len(scraperResult.Content), 50000)],
		recipe.DetectedLanguage, isEnglish || isTranslatedToEnglish,
		translatedLanguage, hasBeenTranslated, userID)
	if err != nil {
		log.Error("failed to insert recipe", "error", err)
		h.failJob(ctx, jobID, "Failed to save recipe")
		return
	}

	// Upsert tags in transaction
	for _, tagName := range recipe.Tags {
		tagName = strings.ToLower(strings.TrimSpace(tagName))
		if tagName == "" {
			continue
		}
		tagID := uuid.New().String()
		var existingTagID string
		err := tx.QueryRow(ctx, `SELECT id FROM "Tag" WHERE name=$1`, tagName).Scan(&existingTagID)
		if err != nil {
			// Tag doesn't exist, create it
			tx.Exec(ctx, `INSERT INTO "Tag" (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, tagID, tagName)
			tx.QueryRow(ctx, `SELECT id FROM "Tag" WHERE name=$1`, tagName).Scan(&existingTagID)
		}
		if existingTagID != "" {
			tx.Exec(ctx, `INSERT INTO "RecipeTag" ("recipeId", "tagId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, recipeID, existingTagID)
		}
	}

	// Update job to done
	tx.Exec(ctx, `UPDATE "RecipeImportJob" SET status='done', "recipeId"=$1, "updatedAt"=NOW() WHERE id=$2`, recipeID, jobID)

	if err := tx.Commit(ctx); err != nil {
		log.Error("failed to commit import transaction", "error", err)
		h.failJob(ctx, jobID, "Failed to save recipe")
		return
	}

	log.Info("import job completed", "recipeId", recipeID)
}

func (h *RecipeHandler) failJob(ctx context.Context, jobID, errMsg string) {
	h.db.Exec(ctx, `UPDATE "RecipeImportJob" SET status='failed', error=$1, "updatedAt"=NOW() WHERE id=$2`, errMsg, jobID)
}

// processTextImportJob extracts a recipe from raw text using Gemini (no scraping).
func (h *RecipeHandler) processTextImportJob(jobID, userID, text string, imagePath *string) {
	ctx := context.Background()

	// Get user's auto-translate preference
	var autoTranslate *string
	h.db.QueryRow(ctx, `SELECT "autoTranslateLanguage" FROM "User" WHERE id=$1`, userID).Scan(&autoTranslate)

	var targetLang gemini.TargetLanguage
	if autoTranslate != nil {
		targetLang = gemini.TargetLanguage(*autoTranslate)
	}

	// Extract recipe with Gemini
	recipe, err := gemini.ExtractRecipe(ctx, text, "", targetLang)
	if err != nil {
		slog.Error("gemini extraction failed for text import", "error", err, "jobId", jobID)
		h.failJob(ctx, jobID, fmt.Sprintf("Failed to extract recipe: %s", err.Error()))
		// Clean up the pre-uploaded image since the recipe won't be created.
		if imagePath != nil && isLocalMediaPath(*imagePath) {
			deleteMediaFile(*imagePath)
		}
		return
	}

	ingredientsJSON, _ := json.Marshal(recipe.Ingredients)
	stepsJSON, _ := json.Marshal(recipe.Steps)

	isEnglish := recipe.DetectedLanguage == "en"
	isTranslatedToEnglish := targetLang == gemini.LangEnglish && !isEnglish
	var translatedLanguage *string
	if targetLang != "" && string(targetLang) != recipe.DetectedLanguage {
		tl := string(targetLang)
		translatedLanguage = &tl
	}
	hasBeenTranslated := translatedLanguage != nil

	recipeID := uuid.New().String()

	tx, err := h.db.Begin(ctx)
	if err != nil {
		h.failJob(ctx, jobID, "Database error")
		if imagePath != nil && isLocalMediaPath(*imagePath) {
			deleteMediaFile(*imagePath)
		}
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO "Recipe" (id, title, description, "sourceUrl", "imagePath", ingredients, steps,
		  "rawContent", "sourceLanguage", "isTranslatedToEnglish", "translatedLanguage",
		  "hasBeenTranslated", "userId", "createdAt", "updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
	`, recipeID, recipe.Title, recipe.Description, nil, imagePath,
		string(ingredientsJSON), string(stepsJSON),
		text[:min(len(text), 50000)],
		recipe.DetectedLanguage, isEnglish || isTranslatedToEnglish,
		translatedLanguage, hasBeenTranslated, userID)
	if err != nil {
		slog.Error("failed to save text-imported recipe", "error", err, "jobId", jobID)
		h.failJob(ctx, jobID, "Failed to save recipe")
		if imagePath != nil && isLocalMediaPath(*imagePath) {
			deleteMediaFile(*imagePath)
		}
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("failed to commit text import transaction", "error", err, "jobId", jobID)
		h.failJob(ctx, jobID, "Failed to save recipe")
		if imagePath != nil && isLocalMediaPath(*imagePath) {
			deleteMediaFile(*imagePath)
		}
		return
	}

	if len(recipe.Tags) > 0 {
		if err := h.upsertTags(ctx, recipeID, recipe.Tags); err != nil {
			slog.Warn("failed to upsert tags for text import", "error", err, "recipeId", recipeID)
		}
	}

	// Mark job done
	h.db.Exec(ctx, `
		UPDATE "RecipeImportJob" SET status='done', "recipeId"=$1, "updatedAt"=NOW() WHERE id=$2
	`, recipeID, jobID)
}

// ─── Translate recipe ─────────────────────────────────────────────────────────

func (h *RecipeHandler) Translate(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	var req models.TranslateRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var sourceURL, rawContent, sourceLanguage *string
	var hasBeenTranslated bool
	err := h.db.QueryRow(r.Context(), `
		SELECT "sourceUrl", "rawContent", "sourceLanguage", "hasBeenTranslated"
		FROM "Recipe" WHERE id=$1 AND "userId"=$2
	`, recipeID, userID).Scan(&sourceURL, &rawContent, &sourceLanguage, &hasBeenTranslated)
	if err != nil {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	isManualImport := sourceURL == nil
	if isManualImport && req.TargetLanguage != nil && hasBeenTranslated {
		jsonError(w, "This recipe was entered manually and has already been translated.", http.StatusBadRequest)
		return
	}

	var targetLang gemini.TargetLanguage
	if req.TargetLanguage != nil {
		targetLang = gemini.TargetLanguage(*req.TargetLanguage)
	}

	var content, srcURL string
	if !isManualImport {
		// Re-scrape the source URL
		scraped, err := h.rescrapeURL(r.Context(), *sourceURL)
		if err != nil {
			jsonError(w, fmt.Sprintf("Could not reach the original recipe page: %s", err.Error()), http.StatusBadGateway)
			return
		}
		content = scraped
		srcURL = *sourceURL
	} else {
		if rawContent == nil || *rawContent == "" {
			jsonError(w, "No source content available for translation.", http.StatusBadRequest)
			return
		}
		content = *rawContent
		srcURL = "manual entry"
	}

	recipe, err := gemini.ExtractRecipe(r.Context(), content, srcURL, targetLang)
	if err != nil {
		jsonError(w, fmt.Sprintf("Could not extract recipe: %s", err.Error()), http.StatusInternalServerError)
		return
	}

	ingredientsJSON, _ := json.Marshal(recipe.Ingredients)
	stepsJSON, _ := json.Marshal(recipe.Steps)

	srcLang := ""
	if sourceLanguage != nil {
		srcLang = *sourceLanguage
	}
	isEnglish := srcLang == "en"
	isTranslatedToEnglish := targetLang == gemini.LangEnglish && !isEnglish
	var translatedLanguage *string
	if targetLang != "" && string(targetLang) != srcLang {
		tl := string(targetLang)
		translatedLanguage = &tl
	}

	_, err = h.db.Exec(r.Context(), `
		UPDATE "Recipe"
		SET title=$1, description=$2, ingredients=$3, steps=$4,
		    "isTranslatedToEnglish"=$5, "translatedLanguage"=$6,
		    "hasBeenTranslated"=CASE WHEN $7 THEN true ELSE "hasBeenTranslated" END,
		    "updatedAt"=NOW()
		WHERE id=$8 AND "userId"=$9
	`, recipe.Title, recipe.Description, string(ingredientsJSON), string(stepsJSON),
		isEnglish || isTranslatedToEnglish, translatedLanguage,
		req.TargetLanguage != nil, recipeID, userID)
	if err != nil {
		slog.Error("failed to update translated recipe", "error", err)
		jsonError(w, "Failed to save translation", http.StatusInternalServerError)
		return
	}

	// Refresh tags for URL recipes
	if !isManualImport && len(recipe.Tags) > 0 {
		h.upsertTags(r.Context(), recipeID, recipe.Tags)
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}

// ─── Toggle favorite ──────────────────────────────────────────────────────────

func (h *RecipeHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	var isFavorite bool
	err := h.db.QueryRow(r.Context(), `SELECT "isFavorite" FROM "Recipe" WHERE id=$1 AND "userId"=$2`, recipeID, userID).Scan(&isFavorite)
	if err != nil {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	newVal := !isFavorite
	h.db.Exec(r.Context(), `UPDATE "Recipe" SET "isFavorite"=$1, "updatedAt"=NOW() WHERE id=$2`, newVal, recipeID)

	jsonOK(w, map[string]interface{}{"success": true, "isFavorite": newVal})
}

// ─── Cook This Week ───────────────────────────────────────────────────────────

func (h *RecipeHandler) SetCookThisWeek(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	var body struct {
		ExpiryDate string `json:"expiryDate"` // "DD/MM/YYYY"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	expiry, err := parseDayMonthYear(body.ExpiryDate)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var ownerID string
	if err := h.db.QueryRow(r.Context(), `SELECT "userId" FROM "Recipe" WHERE id=$1`, recipeID).Scan(&ownerID); err != nil || ownerID != userID {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	h.db.Exec(r.Context(), `UPDATE "Recipe" SET "cookThisWeekUntil"=$1, "updatedAt"=NOW() WHERE id=$2`, expiry, recipeID)
	jsonOK(w, map[string]interface{}{"success": true, "cookThisWeekUntil": expiry.Format(time.RFC3339)})
}

func (h *RecipeHandler) RemoveCookThisWeek(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	var ownerID string
	if err := h.db.QueryRow(r.Context(), `SELECT "userId" FROM "Recipe" WHERE id=$1`, recipeID).Scan(&ownerID); err != nil || ownerID != userID {
		jsonError(w, "Recipe not found", http.StatusNotFound)
		return
	}

	h.db.Exec(r.Context(), `UPDATE "Recipe" SET "cookThisWeekUntil"=NULL, "updatedAt"=NOW() WHERE id=$1`, recipeID)
	jsonOK(w, models.SuccessResponse{Success: true})
}

// ─── Share recipe ─────────────────────────────────────────────────────────────

func (h *RecipeHandler) Share(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	recipeID := chi.URLParam(r, "id")

	var req models.ShareRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RecipientUserID == userID {
		jsonError(w, "You cannot share a recipe with yourself.", http.StatusBadRequest)
		return
	}

	// Load source recipe
	var source struct {
		Title                string
		Description          *string
		SourceURL            *string
		ImagePath            *string
		Ingredients          string
		Steps                string
		RawContent           *string
		SourceLanguage       *string
		IsTranslatedToEnglish bool
		TranslatedLanguage   *string
		HasBeenTranslated    bool
	}
	err := h.db.QueryRow(r.Context(), `
		SELECT title, description, "sourceUrl", "imagePath", ingredients, steps,
		       "rawContent", "sourceLanguage", "isTranslatedToEnglish",
		       "translatedLanguage", "hasBeenTranslated"
		FROM "Recipe" WHERE id=$1 AND "userId"=$2
	`, recipeID, userID).Scan(
		&source.Title, &source.Description, &source.SourceURL, &source.ImagePath,
		&source.Ingredients, &source.Steps, &source.RawContent, &source.SourceLanguage,
		&source.IsTranslatedToEnglish, &source.TranslatedLanguage, &source.HasBeenTranslated,
	)
	if err != nil {
		jsonError(w, "Recipe not found.", http.StatusNotFound)
		return
	}

	// Verify recipient
	var recipientName *string
	if err := h.db.QueryRow(r.Context(), `SELECT name FROM "User" WHERE id=$1`, req.RecipientUserID).Scan(&recipientName); err != nil {
		jsonError(w, "Recipient user not found.", http.StatusNotFound)
		return
	}

	// Check for duplicate share
	var existingID string
	h.db.QueryRow(r.Context(), `SELECT id FROM "Recipe" WHERE "userId"=$1 AND "sharedFromRecipeId"=$2`, req.RecipientUserID, recipeID).Scan(&existingID)
	if existingID != "" {
		jsonError(w, "You have already shared this recipe with that user.", http.StatusConflict)
		return
	}

	// Duplicate image
	var copiedImagePath *string
	if source.ImagePath != nil && isLocalMediaPath(*source.ImagePath) {
		if p := duplicateMediaFile(*source.ImagePath); p != "" {
			copiedImagePath = &p
		}
	} else {
		copiedImagePath = source.ImagePath
	}

	// Get sender name
	var senderName string
	h.db.QueryRow(r.Context(), `SELECT COALESCE(name, email, 'Someone') FROM "User" WHERE id=$1`, userID).Scan(&senderName)

	// Transaction: create recipe copy + notification
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		jsonError(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	newRecipeID := uuid.New().String()
	_, err = tx.Exec(r.Context(), `
		INSERT INTO "Recipe" (id, title, description, "sourceUrl", "imagePath", ingredients, steps,
		  "rawContent", "sourceLanguage", "isTranslatedToEnglish", "translatedLanguage",
		  "hasBeenTranslated", "isFavorite", "sharedByUserId", "sharedFromRecipeId", "userId",
		  "createdAt", "updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15,NOW(),NOW())
	`, newRecipeID, source.Title, source.Description, source.SourceURL, copiedImagePath,
		source.Ingredients, source.Steps, source.RawContent, source.SourceLanguage,
		source.IsTranslatedToEnglish, source.TranslatedLanguage, source.HasBeenTranslated,
		userID, recipeID, req.RecipientUserID)
	if err != nil {
		slog.Error("failed to create shared recipe", "error", err)
		jsonError(w, "Failed to share recipe", http.StatusInternalServerError)
		return
	}

	notifID := uuid.New().String()
	_, err = tx.Exec(r.Context(), `
		INSERT INTO "Notification" (id, type, title, message, "isRead", "userId", "senderUserId", "recipeId", "createdAt")
		VALUES ($1,'recipe_shared','Recipe shared with you',$2,false,$3,$4,$5,NOW())
	`, notifID, fmt.Sprintf(`%s shared "%s" with you.`, senderName, source.Title),
		req.RecipientUserID, userID, newRecipeID)
	if err != nil {
		slog.Error("failed to create share notification", "error", err)
	}

	if err := tx.Commit(r.Context()); err != nil {
		jsonError(w, "Failed to share recipe", http.StatusInternalServerError)
		return
	}

	jsonOK(w, models.SuccessResponse{Success: true})
}

// ─── Get other users (for share picker) ──────────────────────────────────────

func (h *RecipeHandler) GetOtherUsers(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	rows, err := h.db.Query(r.Context(), `
		SELECT id, name, email, image FROM "User" WHERE id != $1 ORDER BY name ASC
	`, userID)
	if err != nil {
		jsonError(w, "Failed to list users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := []models.ShareableUser{}
	for rows.Next() {
		var u models.ShareableUser
		rows.Scan(&u.ID, &u.Name, &u.Email, &u.Image)
		users = append(users, u)
	}

	jsonOK(w, users)
}

// ─── Reconcile pending jobs on startup ───────────────────────────────────────

// ReconcilePendingJobs re-enqueues any import jobs that were left in
// "pending", "scraping", or "extracting" state (e.g. from a pod restart).
// A semaphore limits concurrent goroutines to avoid resource exhaustion.
func (h *RecipeHandler) ReconcilePendingJobs(ctx context.Context) {
	rows, err := h.db.Query(ctx, `
		SELECT id, "userId", url FROM "RecipeImportJob"
		WHERE status IN ('pending', 'scraping', 'extracting')
		ORDER BY "createdAt" ASC
	`)
	if err != nil {
		slog.Error("failed to query pending import jobs", "error", err)
		return
	}
	defer rows.Close()

	const maxConcurrent = 10
	sem := make(chan struct{}, maxConcurrent)

	count := 0
	for rows.Next() {
		var jobID, userID, url string
		if err := rows.Scan(&jobID, &userID, &url); err != nil {
			continue
		}

		// Text-import jobs (url == "") don't need scraper re-enqueue
		if url != "" {
			if err := h.scraperClient.Enqueue(ctx, jobID, url); err != nil {
				slog.Error("failed to re-enqueue job", "jobId", jobID, "error", err)
				h.failJob(ctx, jobID, "Failed to re-enqueue after restart")
				continue
			}
			h.db.Exec(ctx, `UPDATE "RecipeImportJob" SET status='scraping', "updatedAt"=NOW() WHERE id=$1`, jobID)
		}

		sem <- struct{}{} // acquire slot
		go func(jobID, userID, url string) {
			defer func() { <-sem }() // release slot
			if url != "" {
				h.processImportJob(jobID, userID, url)
			}
			// Text-import jobs with url=="" cannot be re-processed without the original text;
			// mark them as failed so the user can retry.
			h.failJob(ctx, jobID, "Import interrupted by server restart; please retry")
		}(jobID, userID, url)
		count++
	}

	if count > 0 {
		slog.Info("reconciled pending import jobs", "count", count)
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (h *RecipeHandler) getRecipeByID(ctx context.Context, recipeID, userID string) (*models.Recipe, error) {
	var r models.Recipe
	// Initialize slices so they marshal as [] not null when empty.
	r.Tags = []string{}
	r.Ingredients = []string{}
	r.Steps = []string{}
	var ingredientsJSON, stepsJSON string

	err := h.db.QueryRow(ctx, `
		SELECT id, title, description, "sourceUrl", "imagePath", ingredients, steps,
		       "isFavorite", "cookThisWeekUntil", "createdAt", "updatedAt",
		       "sourceLanguage", "isTranslatedToEnglish", "translatedLanguage",
		       "hasBeenTranslated", "sharedByUserId", "sharedFromRecipeId", "userId"
		FROM "Recipe" WHERE id=$1 AND "userId"=$2
	`, recipeID, userID).Scan(
		&r.ID, &r.Title, &r.Description, &r.SourceURL, &r.ImagePath,
		&ingredientsJSON, &stepsJSON,
		&r.IsFavorite, &r.CookThisWeekUntil, &r.CreatedAt, &r.UpdatedAt,
		&r.SourceLanguage, &r.IsTranslatedToEnglish, &r.TranslatedLanguage,
		&r.HasBeenTranslated, &r.SharedByUserID, &r.SharedFromRecipeID, &r.UserID,
	)
	if err != nil {
		return nil, err
	}

	json.Unmarshal([]byte(ingredientsJSON), &r.Ingredients)
	json.Unmarshal([]byte(stepsJSON), &r.Steps)

	// Load tags
	tagRows, _ := h.db.Query(ctx, `
		SELECT t.name FROM "Tag" t
		JOIN "RecipeTag" rt ON rt."tagId" = t.id
		WHERE rt."recipeId" = $1
		ORDER BY t.name
	`, recipeID)
	if tagRows != nil {
		defer tagRows.Close()
		for tagRows.Next() {
			var name string
			tagRows.Scan(&name)
			r.Tags = append(r.Tags, name)
		}
	}

	return &r, nil
}

func (h *RecipeHandler) upsertTags(ctx context.Context, recipeID string, tags []string) error {
	// Delete existing tag associations
	h.db.Exec(ctx, `DELETE FROM "RecipeTag" WHERE "recipeId"=$1`, recipeID)

	for _, tagName := range tags {
		tagName = strings.ToLower(strings.TrimSpace(tagName))
		if tagName == "" {
			continue
		}
		tagID := uuid.New().String()
		h.db.Exec(ctx, `INSERT INTO "Tag" (id, name) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`, tagID, tagName)
		var existingTagID string
		h.db.QueryRow(ctx, `SELECT id FROM "Tag" WHERE name=$1`, tagName).Scan(&existingTagID)
		if existingTagID != "" {
			h.db.Exec(ctx, `INSERT INTO "RecipeTag" ("recipeId","tagId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, recipeID, existingTagID)
		}
	}
	return nil
}

func (h *RecipeHandler) rescrapeURL(ctx context.Context, url string) (string, error) {
	jobID := uuid.New().String()
	if err := h.scraperClient.Enqueue(ctx, jobID, url); err != nil {
		return "", err
	}

	pollCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	for {
		select {
		case <-pollCtx.Done():
			return "", fmt.Errorf("scrape timed out")
		case <-time.After(3 * time.Second):
		}

		status, err := h.scraperClient.GetStatus(ctx, jobID)
		if err != nil {
			continue
		}
		switch status.Status {
		case "done":
			if status.Result != nil {
				return status.Result.Content, nil
			}
			return "", fmt.Errorf("scrape returned empty result")
		case "failed":
			if status.Error != nil {
				return "", fmt.Errorf("scrape failed: %s", *status.Error)
			}
			return "", fmt.Errorf("scrape failed")
		}
	}
}

func hasAnyTag(recipeTags, filterTags []string) bool {
	set := make(map[string]struct{}, len(recipeTags))
	for _, t := range recipeTags {
		set[t] = struct{}{}
	}
	for _, t := range filterTags {
		if _, ok := set[t]; ok {
			return true
		}
	}
	return false
}

func parseDayMonthYear(s string) (time.Time, error) {
	parts := strings.Split(s, "/")
	if len(parts) != 3 {
		return time.Time{}, fmt.Errorf("invalid date format, expected DD/MM/YYYY")
	}
	return time.Parse("02/01/2006", s)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─── Media helpers ────────────────────────────────────────────────────────────

func mediaDir() string {
	d := os.Getenv("MEDIA_DIR")
	if d == "" {
		return "public/media"
	}
	return d
}

func isLocalMediaPath(p string) bool {
	prefix := "/media/"
	if strings.HasPrefix(mediaDir(), "public/") {
		prefix = "/" + strings.TrimPrefix(mediaDir(), "public/") + "/"
	}
	return strings.HasPrefix(p, prefix)
}

// isPrivateOrLocalURL returns true if the URL resolves to a private, loopback,
// or link-local address. It is used to prevent SSRF attacks.
func isPrivateOrLocalURL(urlStr string) bool {
	u, err := neturl.Parse(urlStr)
	if err != nil {
		return true // reject invalid URLs
	}

	hostname := u.Hostname()
	if hostname == "" {
		return true
	}

	// Block localhost by name
	if strings.EqualFold(hostname, "localhost") {
		return true
	}

	// If the hostname is already an IP literal, check it directly
	if ip := net.ParseIP(hostname); ip != nil {
		return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()
	}

	// Resolve hostname with a short timeout to prevent DNS-based DoS
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resolver := &net.Resolver{}
	ips, err := resolver.LookupIP(ctx, "ip", hostname)
	if err != nil {
		return true // fail-closed: block if DNS resolution fails
	}

	// Block if ANY resolved IP is private/internal (prevents DNS rebinding)
	for _, ip := range ips {
		if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return true
		}
	}

	return false
}

func downloadImage(imageURL string) string {
	if isPrivateOrLocalURL(imageURL) {
		return ""
	}

	// safeDialer validates the resolved IP at connection time, defeating DNS rebinding.
	// It resolves the hostname itself, validates all IPs, then dials the first safe IP directly.
	safeDialer := &net.Dialer{Timeout: 10 * time.Second}
	safeDialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("invalid address: %w", err)
		}

		// If addr is already an IP literal (common when called from Transport after DNS),
		// validate it directly.
		if ip := net.ParseIP(host); ip != nil {
			if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
				return nil, fmt.Errorf("connection to private/local IP blocked: %s", ip)
			}
			return safeDialer.DialContext(ctx, network, net.JoinHostPort(host, port))
		}

		// Resolve the hostname ourselves so we can validate and then dial a specific IP,
		// preventing a second DNS lookup (and thus DNS rebinding) by the dialer.
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, fmt.Errorf("DNS resolution failed: %w", err)
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("no IPs resolved for host: %s", host)
		}
		for _, ip := range ips {
			if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
				return nil, fmt.Errorf("connection to private/local IP blocked: %s", ip)
			}
		}
		// Dial the first validated IP directly to prevent a second DNS lookup.
		return safeDialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
		// Block redirects to private/local URLs
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if isPrivateOrLocalURL(req.URL.String()) {
				return fmt.Errorf("redirect to private/local URL blocked")
			}
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
		// Validate the IP at dial time to defeat DNS rebinding
		Transport: &http.Transport{
			DialContext: safeDialContext,
		},
	}
	req, err := http.NewRequest(http.MethodGet, imageURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RecipesRepo/1.0)")

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()

	ct := resp.Header.Get("Content-Type")
	mimeType := strings.Split(ct, ";")[0]
	mimeType = strings.TrimSpace(strings.ToLower(mimeType))

	extMap := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
		"image/gif":  ".gif",
	}
	ext, ok := extMap[mimeType]
	if !ok {
		return ""
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil || len(data) == 0 {
		return ""
	}

	filename := uuid.New().String() + ext
	dir := mediaDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return ""
	}
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		return ""
	}

	if strings.HasPrefix(dir, "public/") {
		return "/" + strings.TrimPrefix(dir, "public/") + "/" + filename
	}
	return "/media/" + filename
}

func deleteMediaFile(publicPath string) {
	filename := filepath.Base(publicPath)
	// Safety: never delete the directory itself or special names
	if filename == "." || filename == ".." || filename == "/" || filename == "" {
		return
	}
	dir := mediaDir()
	fullPath := filepath.Join(dir, filename)
	// Security: ensure path is inside media dir
	absDir, _ := filepath.Abs(dir)
	absPath, _ := filepath.Abs(fullPath)
	if !strings.HasPrefix(absPath, absDir+string(filepath.Separator)) {
		return
	}
	os.Remove(fullPath)
}

// safeDeleteMediaFile deletes a local media file only if no other Recipe row
// still references it, preventing accidental deletion of shared images.
func safeDeleteMediaFile(ctx context.Context, db *pgxpool.Pool, publicPath string) {
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM "Recipe" WHERE "imagePath"=$1`, publicPath).Scan(&count); err != nil || count > 0 {
		return
	}
	deleteMediaFile(publicPath)
}

func duplicateMediaFile(publicPath string) string {
	if !isLocalMediaPath(publicPath) {
		return publicPath
	}
	filename := filepath.Base(publicPath)
	ext := filepath.Ext(filename)
	newFilename := uuid.New().String() + ext

	dir := mediaDir()
	src := filepath.Join(dir, filename)
	dst := filepath.Join(dir, newFilename)

	// Security: ensure source path is inside media dir
	absDir, _ := filepath.Abs(dir)
	absSrc, _ := filepath.Abs(src)
	if !strings.HasPrefix(absSrc, absDir+string(filepath.Separator)) {
		return ""
	}

	data, err := os.ReadFile(src)
	if err != nil {
		return ""
	}
	if err := os.WriteFile(dst, data, 0644); err != nil {
		return ""
	}

	if strings.HasPrefix(dir, "public/") {
		return "/" + strings.TrimPrefix(dir, "public/") + "/" + newFilename
	}
	return "/media/" + newFilename
}
