package gemini

import (
	"fmt"
	"strings"
	"testing"
)

func TestModelName(t *testing.T) {
	t.Run("returns default when unset", func(t *testing.T) {
		t.Setenv("GEMINI_MODEL", "")
		if got := modelName(); got != "gemini-2.0-flash" {
			t.Errorf("modelName() = %q, want %q", got, "gemini-2.0-flash")
		}
	})

	t.Run("returns override when set", func(t *testing.T) {
		t.Setenv("GEMINI_MODEL", "gemini-custom")
		if got := modelName(); got != "gemini-custom" {
			t.Errorf("modelName() = %q, want %q", got, "gemini-custom")
		}
	})
}

func TestChatModelName(t *testing.T) {
	t.Run("returns default when unset", func(t *testing.T) {
		t.Setenv("GEMINI_CHAT_MODEL", "")
		if got := chatModelName(); got != "gemini-flash-lite-latest" {
			t.Errorf("chatModelName() = %q, want %q", got, "gemini-flash-lite-latest")
		}
	})

	t.Run("returns override when set", func(t *testing.T) {
		t.Setenv("GEMINI_CHAT_MODEL", "gemini-custom-lite")
		if got := chatModelName(); got != "gemini-custom-lite" {
			t.Errorf("chatModelName() = %q, want %q", got, "gemini-custom-lite")
		}
	})
}

func makeTurns(n int) []ChatTurn {
	out := make([]ChatTurn, n)
	for i := range out {
		out[i] = ChatTurn{Role: "user", Content: fmt.Sprintf("msg-%d", i)}
	}
	return out
}

func TestClampChatHistory(t *testing.T) {
	tests := []struct {
		name     string
		history  []ChatTurn
		maxTurns int
		wantLen  int
		wantLast string // content of the last kept turn — confirms we keep the MOST RECENT ones
	}{
		{"fewer than max: kept as-is", makeTurns(3), 12, 3, "msg-2"},
		{"exactly at max: kept as-is", makeTurns(12), 12, 12, "msg-11"},
		{"more than max: keeps most recent N", makeTurns(20), 12, 12, "msg-19"},
		{"empty history", makeTurns(0), 12, 0, ""},
		{"maxTurns <= 0 treated as unlimited (no accidental wipe)", makeTurns(5), 0, 5, "msg-4"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clampChatHistory(tt.history, tt.maxTurns)
			if len(got) != tt.wantLen {
				t.Fatalf("len(got) = %d, want %d", len(got), tt.wantLen)
			}
			if tt.wantLen > 0 && got[len(got)-1].Content != tt.wantLast {
				t.Errorf("last kept turn = %q, want %q (history must keep the tail, not the head)", got[len(got)-1].Content, tt.wantLast)
			}
		})
	}
}

func TestBuildChatSystemInstruction(t *testing.T) {
	recipe := RecipeChatContext{
		Title:       "Spaghetti Carbonara",
		Description: "A creamy Roman pasta dish",
		Ingredients: []string{"200g spaghetti", "2 eggs", "100g pancetta"},
		Steps:       []string{"Boil the pasta", "Fry the pancetta", "Combine with the egg mixture"},
	}

	got := buildChatSystemInstruction(recipe)

	for _, want := range []string{
		"Spaghetti Carbonara",
		"A creamy Roman pasta dish",
		"200g spaghetti",
		"Boil the pasta",
		"ONLY questions about the specific recipe",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("system instruction missing %q\ngot:\n%s", want, got)
		}
	}
}

func TestBuildChatSystemInstruction_OmitsEmptyDescription(t *testing.T) {
	recipe := RecipeChatContext{
		Title:       "Toast",
		Description: "",
		Ingredients: []string{"Bread"},
		Steps:       []string{"Toast it"},
	}

	got := buildChatSystemInstruction(recipe)

	if strings.Contains(got, "Description:") {
		t.Errorf("expected no Description line when Description is empty, got:\n%s", got)
	}
}

func TestBuildChatContents(t *testing.T) {
	history := []ChatTurn{
		{Role: "user", Content: "Can I use butter instead?"},
		{Role: "model", Content: "Yes, that works well."},
	}

	contents := buildChatContents(history, "How long should I bake it?")

	if len(contents) != 3 {
		t.Fatalf("len(contents) = %d, want 3 (2 history turns + 1 new question)", len(contents))
	}

	wantRoles := []string{"user", "model", "user"}
	for i, want := range wantRoles {
		if contents[i].Role != want {
			t.Errorf("contents[%d].Role = %q, want %q", i, contents[i].Role, want)
		}
	}

	last := contents[len(contents)-1]
	if len(last.Parts) != 1 || last.Parts[0].Text != "How long should I bake it?" {
		t.Errorf("final content should be the new question as a user turn, got %+v", last)
	}
}

func TestBuildChatContents_InvalidRoleNormalizedToUser(t *testing.T) {
	// The Gemini API only accepts "user"/"model" — anything else (e.g. a
	// stray "assistant" value) must be treated as "user", never passed through.
	history := []ChatTurn{{Role: "assistant", Content: "hi"}}
	contents := buildChatContents(history, "next question")
	if contents[0].Role != "user" {
		t.Errorf("contents[0].Role = %q, want %q for an invalid input role", contents[0].Role, "user")
	}
}

// The Gemini API rejects requests whose contents don't start with "user" and
// strictly alternate roles thereafter. buildChatContents must never produce
// such a sequence, regardless of what history it's given.

func TestBuildChatContents_MergesConsecutiveSameRoleTurns(t *testing.T) {
	// Simulates a client resending an unanswered question (e.g. left over
	// from a previously failed request) immediately followed by a new one —
	// two consecutive "user" turns, which Gemini would otherwise reject.
	history := []ChatTurn{
		{Role: "user", Content: "Can I use butter instead?"}, // never got a model reply
	}

	contents := buildChatContents(history, "How long should I bake it?")

	if len(contents) != 1 {
		t.Fatalf("len(contents) = %d, want 1 (the two user turns must be merged into one)", len(contents))
	}
	if contents[0].Role != "user" {
		t.Fatalf("contents[0].Role = %q, want %q", contents[0].Role, "user")
	}
	if len(contents[0].Parts) != 2 {
		t.Fatalf("expected both turns merged as 2 parts on a single user turn, got %d part(s)", len(contents[0].Parts))
	}
	if contents[0].Parts[0].Text != "Can I use butter instead?" || contents[0].Parts[1].Text != "How long should I bake it?" {
		t.Errorf("merged parts in wrong order/content: %+v", contents[0].Parts)
	}
}

func TestBuildChatContents_DropsLeadingNonUserTurn(t *testing.T) {
	// Simulates clampChatHistory slicing mid-conversation and landing on a
	// "model" turn first — Gemini requires the first turn to be "user".
	history := []ChatTurn{
		{Role: "model", Content: "leftover reply from a turn that got clamped off"},
		{Role: "user", Content: "Can I use butter instead?"},
		{Role: "model", Content: "Yes, that works well."},
	}

	contents := buildChatContents(history, "How long should I bake it?")

	if contents[0].Role != "user" {
		t.Fatalf("contents[0].Role = %q, want %q (leading non-user turn must be dropped)", contents[0].Role, "user")
	}
	if len(contents) != 3 {
		t.Fatalf("len(contents) = %d, want 3 (leading model turn dropped, then user/model/user)", len(contents))
	}
}

func TestBuildChatContents_EmptyHistory(t *testing.T) {
	contents := buildChatContents(nil, "What temperature?")
	if len(contents) != 1 {
		t.Fatalf("len(contents) = %d, want 1", len(contents))
	}
	if contents[0].Role != "user" {
		t.Errorf("contents[0].Role = %q, want %q", contents[0].Role, "user")
	}
}
