package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// geminiHTTPClient is a dedicated HTTP client with a timeout for Gemini API calls.
// Using http.DefaultClient would allow goroutines to hang indefinitely.
var geminiHTTPClient = &http.Client{
	Timeout: 90 * time.Second,
}

// TargetLanguage represents a supported translation target.
type TargetLanguage string

const (
	LangEnglish TargetLanguage = "en"
	LangDutch   TargetLanguage = "nl"
	LangSpanish TargetLanguage = "es"
)

var languageNames = map[TargetLanguage]string{
	LangEnglish: "English",
	LangDutch:   "Dutch",
	LangSpanish: "Spanish",
}

// RecipeResult holds the structured recipe data returned by Gemini.
type RecipeResult struct {
	Title            string   `json:"title"`
	Description      string   `json:"description"`
	Ingredients      []string `json:"ingredients"`
	Steps            []string `json:"steps"`
	Tags             []string `json:"tags"`
	DetectedLanguage string   `json:"detectedLanguage"`
}

type geminiRequest struct {
	Contents         []geminiContent        `json:"contents"`
	GenerationConfig map[string]interface{} `json:"generationConfig"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

// geminiMultimodalPart can carry either plain text or a file reference (video URL).
// Exactly one of Text or FileData should be set.
type geminiMultimodalPart struct {
	Text     string            `json:"text,omitempty"`
	FileData *geminiFileData   `json:"fileData,omitempty"`
}

type geminiFileData struct {
	MimeType string `json:"mimeType"`
	FileURI  string `json:"fileUri"`
}

type geminiMultimodalRequest struct {
	Contents         []geminiMultimodalContent `json:"contents"`
	GenerationConfig map[string]interface{}    `json:"generationConfig"`
}

type geminiMultimodalContent struct {
	Parts []geminiMultimodalPart `json:"parts"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func apiKey() string {
	return os.Getenv("GEMINI_API_KEY")
}

func modelName() string {
	m := os.Getenv("GEMINI_MODEL")
	if m == "" {
		return "gemini-2.0-flash"
	}
	return m
}

func callGemini(ctx context.Context, prompt string) (string, error) {
	key := apiKey()
	if key == "" {
		return "", fmt.Errorf("GEMINI_API_KEY is not set")
	}

	model := modelName()
	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		model, key,
	)

	reqBody := geminiRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
		GenerationConfig: map[string]interface{}{
			"responseMimeType": "application/json",
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := geminiHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("gemini API returned %d: %s", resp.StatusCode, string(b))
	}

	var gemResp geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&gemResp); err != nil {
		return "", fmt.Errorf("failed to decode gemini response: %w", err)
	}

	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini returned empty response")
	}

	text := gemResp.Candidates[0].Content.Parts[0].Text
	// Strip markdown code fences if present
	text = strings.TrimPrefix(text, "```json\n")
	text = strings.TrimPrefix(text, "```\n")
	text = strings.TrimSuffix(text, "\n```")
	text = strings.TrimSpace(text)

	return text, nil
}

// ExtractRecipe sends page content to Gemini and returns structured recipe data.
// When targetLanguage is non-empty, the output is translated into that language.
func ExtractRecipe(ctx context.Context, pageContent, sourceURL string, targetLanguage TargetLanguage) (*RecipeResult, error) {
	translationRule := "2. Keep the title, description, ingredient names, and step descriptions in their ORIGINAL language. Do NOT translate them. However, tags MUST always be in English regardless of the original language."
	if targetLanguage != "" {
		langName := languageNames[targetLanguage]
		translationRule = fmt.Sprintf(
			"2. ALL output (title, description, ingredient names, step descriptions) MUST be in %s. Translate everything from the original language into %s. Tags MUST always be in English regardless of the target language.",
			langName, langName,
		)
	}

	// Truncate content to 30000 chars (same as TS implementation)
	content := pageContent
	if len(content) > 30000 {
		content = content[:30000]
	}

	prompt := fmt.Sprintf(`You are a recipe extraction assistant. Extract the recipe from the following web page content and return a JSON object with this exact structure:

{
  "title": "Recipe title",
  "description": "A brief 1-2 sentence description of the dish",
  "ingredients": ["ingredient 1 with quantity in metric units", "ingredient 2", ...],
  "steps": ["Step 1 description", "Step 2 description", ...],
  "tags": ["tag1", "tag2", ...],
  "detectedLanguage": "ISO 639-1 language code of the original recipe content (e.g. en, es, fr, de, it, ja, zh, ko, pt, etc.)"
}

IMPORTANT RULES:
1. Convert ALL imperial measurements to metric (cups to ml, oz to g, lbs to kg, °F to °C, inches to cm, etc.)
%s
3. Tags should be lowercase, relevant food categories (e.g., "vegetarian", "dessert", "italian", "quick", "gluten-free")
4. Return ONLY valid JSON, no markdown code blocks, no explanation
5. If you cannot extract a recipe, return: {"error": "Could not extract recipe from this content"}
6. The "detectedLanguage" field must reflect the language of the ORIGINAL content before any translation, using an ISO 639-1 two-letter code

Source URL: %s

Page content:
%s`, translationRule, sourceURL, content)

	text, err := callGemini(ctx, prompt)
	if err != nil {
		return nil, err
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse gemini JSON response: %w", err)
	}

	if errMsg, ok := parsed["error"].(string); ok {
		return nil, fmt.Errorf("%s", errMsg)
	}

	result := &RecipeResult{
		Title:            stringOrDefault(parsed["title"], "Untitled Recipe"),
		Description:      stringOrDefault(parsed["description"], ""),
		DetectedLanguage: strings.ToLower(strings.TrimSpace(stringOrDefault(parsed["detectedLanguage"], "en"))),
	}
	if len(result.DetectedLanguage) > 2 {
		result.DetectedLanguage = result.DetectedLanguage[:2]
	}

	result.Ingredients = stringSlice(parsed["ingredients"])
	result.Steps = stringSlice(parsed["steps"])
	result.Tags = lowercaseSlice(stringSlice(parsed["tags"]))

	return result, nil
}

// ExtractRecipeFromVideo sends a Gemini File API URI (uploaded by the scraper)
// and caption text to Gemini as a multimodal prompt and returns structured recipe data.
// The videoFileURI must be a valid Gemini files/ URI (e.g. from the File API upload).
// Falls back to caption-only extraction if the video call fails.
func ExtractRecipeFromVideo(ctx context.Context, videoFileURI, caption, sourceURL string, targetLanguage TargetLanguage) (*RecipeResult, error) {
	log := slog.With("sourceURL", sourceURL)

	// Truncate caption to avoid token waste (same limit as ExtractRecipe)
	if len(caption) > 30000 {
		caption = caption[:30000]
	}

	translationRule := "2. Keep the title, description, ingredient names, and step descriptions in their ORIGINAL language. Do NOT translate them. However, tags MUST always be in English regardless of the original language."
	if targetLanguage != "" {
		langName := languageNames[targetLanguage]
		translationRule = fmt.Sprintf(
			"2. ALL output (title, description, ingredient names, step descriptions) MUST be in %s. Translate everything from the original language into %s. Tags MUST always be in English regardless of the target language.",
			langName, langName,
		)
	}

	promptText := fmt.Sprintf(`You are a recipe extraction assistant. Extract the recipe from this Instagram reel video and its caption/description. Combine information from both the video content (spoken words, on-screen text, visual cues) and the caption text below.

Return a JSON object with this exact structure:
{
  "title": "Recipe title",
  "description": "A brief 1-2 sentence description of the dish",
  "ingredients": ["ingredient 1 with quantity in metric units", "ingredient 2", ...],
  "steps": ["Step 1 description", "Step 2 description", ...],
  "tags": ["tag1", "tag2", ...],
  "detectedLanguage": "ISO 639-1 language code of the original recipe content (e.g. en, es, fr, de, it, ja, zh, ko, pt, etc.)"
}

IMPORTANT RULES:
1. Convert ALL imperial measurements to metric (cups to ml, oz to g, lbs to kg, °F to °C, inches to cm, etc.)
%s
3. Tags should be lowercase, relevant food categories (e.g., "vegetarian", "dessert", "italian", "quick", "gluten-free")
4. Return ONLY valid JSON, no markdown code blocks, no explanation
5. If you cannot extract a recipe, return: {"error": "Could not extract recipe from this content"}
6. The "detectedLanguage" field must reflect the language of the ORIGINAL content before any translation, using an ISO 639-1 two-letter code

Source URL: %s

Caption/description:
%s`, translationRule, sourceURL, caption)

	key := apiKey()
	if key == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY is not set")
	}

	model := modelName()
	apiURL := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		model, key,
	)

	reqBody := geminiMultimodalRequest{
		Contents: []geminiMultimodalContent{
			{
				Parts: []geminiMultimodalPart{
					{
						FileData: &geminiFileData{
							MimeType: "video/mp4",
							FileURI:  videoFileURI,
						},
					},
					{Text: promptText},
				},
			},
		},
		GenerationConfig: map[string]interface{}{
			"responseMimeType": "application/json",
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal video request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create video request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := geminiHTTPClient.Do(req)
	if err != nil {
		log.Warn("gemini video generateContent failed, falling back to caption-only", "err", err)
		return ExtractRecipe(ctx, caption, sourceURL, targetLanguage)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.Warn("gemini video extraction failed, falling back to caption-only",
			"status", resp.StatusCode, "body", string(b))
		return ExtractRecipe(ctx, caption, sourceURL, targetLanguage)
	}

	var gemResp geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&gemResp); err != nil {
		log.Warn("failed to decode gemini video response, falling back to caption-only", "err", err)
		return ExtractRecipe(ctx, caption, sourceURL, targetLanguage)
	}

	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		log.Warn("gemini video extraction returned empty candidates, falling back to caption-only")
		return ExtractRecipe(ctx, caption, sourceURL, targetLanguage)
	}

	text := gemResp.Candidates[0].Content.Parts[0].Text
	text = strings.TrimPrefix(text, "```json\n")
	text = strings.TrimPrefix(text, "```\n")
	text = strings.TrimSuffix(text, "\n```")
	text = strings.TrimSpace(text)

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		log.Warn("gemini video extraction returned malformed JSON, falling back to caption-only", "err", err)
		return ExtractRecipe(ctx, caption, sourceURL, targetLanguage)
	}

	if errMsg, ok := parsed["error"].(string); ok {
		if caption != "" {
			log.Warn("gemini video extraction returned error, falling back to caption-only", "geminiError", errMsg)
			return ExtractRecipe(ctx, caption, sourceURL, targetLanguage)
		}
		return nil, fmt.Errorf("%s", errMsg)
	}

	result := &RecipeResult{
		Title:            stringOrDefault(parsed["title"], "Untitled Recipe"),
		Description:      stringOrDefault(parsed["description"], ""),
		DetectedLanguage: strings.ToLower(strings.TrimSpace(stringOrDefault(parsed["detectedLanguage"], "en"))),
	}
	if len(result.DetectedLanguage) > 2 {
		result.DetectedLanguage = result.DetectedLanguage[:2]
	}

	result.Ingredients = stringSlice(parsed["ingredients"])
	result.Steps = stringSlice(parsed["steps"])
	result.Tags = lowercaseSlice(stringSlice(parsed["tags"]))

	log.Info("gemini video extraction succeeded")
	return result, nil
}
// TranslateRecipe translates an existing recipe into the target language.
func TranslateRecipe(ctx context.Context, recipe RecipeResult, targetLanguage TargetLanguage) (*RecipeResult, error) {
	langName := languageNames[targetLanguage]

	input, _ := json.Marshal(map[string]interface{}{
		"title":       recipe.Title,
		"description": recipe.Description,
		"ingredients": recipe.Ingredients,
		"steps":       recipe.Steps,
	})

	prompt := fmt.Sprintf(`You are a recipe translation assistant. Translate the following recipe content into %s. Return a JSON object with this exact structure:

{
  "title": "Translated title",
  "description": "Translated description",
  "ingredients": ["translated ingredient 1", "translated ingredient 2", ...],
  "steps": ["Translated step 1", "Translated step 2", ...]
}

IMPORTANT RULES:
1. Translate ALL text into %s
2. Keep metric measurements as they are (do not convert back to imperial)
3. Preserve the same number of ingredients and steps
4. Return ONLY valid JSON, no markdown code blocks, no explanation

Recipe content to translate:
%s`, langName, langName, string(input))

	text, err := callGemini(ctx, prompt)
	if err != nil {
		return nil, err
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse translation response: %w", err)
	}

	return &RecipeResult{
		Title:            stringOrDefault(parsed["title"], recipe.Title),
		Description:      stringOrDefault(parsed["description"], recipe.Description),
		Ingredients:      stringSliceOrDefault(parsed["ingredients"], recipe.Ingredients),
		Steps:            stringSliceOrDefault(parsed["steps"], recipe.Steps),
		Tags:             recipe.Tags,
		DetectedLanguage: recipe.DetectedLanguage,
	}, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func stringOrDefault(v interface{}, def string) string {
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return def
}

func stringSlice(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func stringSliceOrDefault(v interface{}, def []string) []string {
	s := stringSlice(v)
	if len(s) == 0 {
		return def
	}
	return s
}

func lowercaseSlice(in []string) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = strings.ToLower(strings.TrimSpace(s))
	}
	return out
}
