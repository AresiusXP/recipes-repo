package models

import "time"

// ─── User ─────────────────────────────────────────────────────────────────────

type User struct {
	ID                   string     `json:"id"`
	Name                 *string    `json:"name"`
	Email                *string    `json:"email"`
	Image                *string    `json:"image"`
	AutoTranslateLanguage *string   `json:"autoTranslateLanguage"`
	ThemePreference      string     `json:"themePreference"`
	CreatedAt            time.Time  `json:"createdAt"`
	LastLoginAt          *time.Time `json:"lastLoginAt"`
	IsBanned             bool       `json:"isBanned"`
	BannedAt             *time.Time `json:"bannedAt"`
}

type UserSettings struct {
	AutoTranslateLanguage *string `json:"autoTranslateLanguage"`
	ThemePreference       string  `json:"themePreference"`
}

// ─── Recipe ───────────────────────────────────────────────────────────────────

type Recipe struct {
	ID                   string     `json:"id"`
	Title                string     `json:"title"`
	Description          *string    `json:"description"`
	SourceURL            *string    `json:"sourceUrl"`
	ImagePath            *string    `json:"imagePath"`
	Ingredients          []string   `json:"ingredients"`
	Steps                []string   `json:"steps"`
	RawContent           *string    `json:"rawContent,omitempty"`
	IsFavorite           bool       `json:"isFavorite"`
	CookThisWeekUntil    *time.Time `json:"cookThisWeekUntil"`
	CreatedAt            time.Time  `json:"createdAt"`
	UpdatedAt            time.Time  `json:"updatedAt"`
	SourceLanguage       *string    `json:"sourceLanguage"`
	IsTranslatedToEnglish bool      `json:"isTranslatedToEnglish"`
	TranslatedLanguage   *string    `json:"translatedLanguage"`
	HasBeenTranslated    bool       `json:"hasBeenTranslated"`
	SharedByUserID       *string    `json:"sharedByUserId"`
	SharedFromRecipeID   *string    `json:"sharedFromRecipeId"`
	UserID               string     `json:"userId"`
	Tags                 []string   `json:"tags"`
}

type RecipeListItem struct {
	ID                string     `json:"id"`
	Title             string     `json:"title"`
	Description       *string    `json:"description"`
	ImagePath         *string    `json:"imagePath"`
	SourceURL         *string    `json:"sourceUrl"`
	IsFavorite        bool       `json:"isFavorite"`
	CookThisWeekUntil *time.Time `json:"cookThisWeekUntil"`
	CreatedAt         time.Time  `json:"createdAt"`
	Tags              []string   `json:"tags"`
}

type CreateRecipeRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Ingredients []string `json:"ingredients"`
	Steps       []string `json:"steps"`
	Tags        []string `json:"tags"`
	SourceURL   *string  `json:"sourceUrl"`
	ImagePath   *string  `json:"imagePath"`
}

type UpdateRecipeRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Ingredients []string `json:"ingredients"`
	Steps       []string `json:"steps"`
	Tags        []string `json:"tags"`
}

type ImportRecipeRequest struct {
	URL string `json:"url"`
}

type ImportJobResponse struct {
	JobID  string `json:"jobId"`
	Status string `json:"status"`
}

type TranslateRecipeRequest struct {
	TargetLanguage *string `json:"targetLanguage"` // "en" | "nl" | "es" | null
}

type ShareRecipeRequest struct {
	RecipientUserID string `json:"recipientUserId"`
}

// ─── RecipeImportJob ──────────────────────────────────────────────────────────

type RecipeImportJob struct {
	ID        string     `json:"id"`
	UserID    string     `json:"userId"`
	URL       string     `json:"url"`
	Status    string     `json:"status"`
	RecipeID  *string    `json:"recipeId"`
	Error     *string    `json:"error"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// ─── Notification ─────────────────────────────────────────────────────────────

type Notification struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Title       string    `json:"title"`
	Message     string    `json:"message"`
	IsRead      bool      `json:"isRead"`
	CreatedAt   time.Time `json:"createdAt"`
	UserID      string    `json:"userId"`
	SenderUserID *string  `json:"senderUserId"`
	RecipeID    *string   `json:"recipeId"`
}

// ─── Admin ────────────────────────────────────────────────────────────────────

type AdminUser struct {
	ID               string     `json:"id"`
	Name             *string    `json:"name"`
	Email            *string    `json:"email"`
	Image            *string    `json:"image"`
	IsBanned         bool       `json:"isBanned"`
	BannedAt         *time.Time `json:"bannedAt"`
	CreatedAt        time.Time  `json:"createdAt"`
	LastLoginAt      *time.Time `json:"lastLoginAt"`
	RecipeCount      int        `json:"recipeCount"`
	AccountProviders []string   `json:"accountProviders"`
}

// ─── Shareable user (for share picker) ───────────────────────────────────────

type ShareableUser struct {
	ID    string  `json:"id"`
	Name  *string `json:"name"`
	Email *string `json:"email"`
	Image *string `json:"image"`
}

// ─── API response helpers ─────────────────────────────────────────────────────

type ErrorResponse struct {
	Error string `json:"error"`
}

type SuccessResponse struct {
	Success bool    `json:"success"`
	Error   *string `json:"error,omitempty"`
}
