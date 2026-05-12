package scraper

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Client is a client for the scraper microservice.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new scraper service client.
// SCRAPER_URL env var should be set to the scraper service base URL (e.g. http://recipes-scraper:3001).
func NewClient() *Client {
	baseURL := os.Getenv("SCRAPER_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3001"
	}
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second, // short timeout for enqueue — the actual scrape is async
		},
	}
}

type enqueueRequest struct {
	JobID string `json:"jobId"`
	URL   string `json:"url"`
}

type enqueueResponse struct {
	JobID  string `json:"jobId"`
	Status string `json:"status"`
}

// JobResult holds the result of a completed scrape job.
type JobResult struct {
	Title              string  `json:"title"`
	Content            string  `json:"content"`
	ImageURL           *string `json:"imageUrl"`
	UsedBrowserFallback bool   `json:"usedBrowserFallback"`
}

// JobStatus holds the current state of a scrape job.
type JobStatus struct {
	JobID     string     `json:"jobId"`
	Status    string     `json:"status"` // "queued" | "running" | "done" | "failed"
	Result    *JobResult `json:"result"`
	Error     *string    `json:"error"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// Enqueue submits a new scrape job to the scraper service.
// Returns immediately with the job ID.
func (c *Client) Enqueue(ctx context.Context, jobID, url string) error {
	body, err := json.Marshal(enqueueRequest{JobID: jobID, URL: url})
	if err != nil {
		return fmt.Errorf("failed to marshal enqueue request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/jobs", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create enqueue request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("scraper service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("scraper service returned %d: %s", resp.StatusCode, string(b))
	}

	return nil
}

// GetStatus polls the status of a scrape job.
func (c *Client) GetStatus(ctx context.Context, jobID string) (*JobStatus, error) {
	pollClient := &http.Client{Timeout: 5 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/jobs/"+jobID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create status request: %w", err)
	}

	resp, err := pollClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("scraper service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("job not found: %s", jobID)
	}

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("scraper service returned %d: %s", resp.StatusCode, string(b))
	}

	var status JobStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("failed to decode status response: %w", err)
	}

	return &status, nil
}
