package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserIDKey contextKey = "userId"
const UserEmailKey contextKey = "userEmail"

// AuthClaims represents the claims in a NextAuth v5 session JWT.
// NextAuth v5 uses JWE (encrypted JWTs) by default. If the token is a plain
// JWS (signed JWT), we validate it with AUTH_SECRET using HS256.
// If your deployment uses JWE, the frontend must derive a plain JWT to forward.
type AuthClaims struct {
	Sub   string `json:"sub"`   // user ID
	Email string `json:"email"` // user email
	jwt.RegisteredClaims
}

// RequireAuth is an HTTP middleware that validates the NextAuth session JWT.
// It expects an "Authorization: Bearer <token>" header.
// On success, it injects userId and userEmail into the request context.
// On failure, it returns 401.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		tokenStr := parts[1]
		secret := os.Getenv("AUTH_SECRET")
		// AUTH_SECRET is validated at startup (main.go); this is a safety fallback.
		if secret == "" {
			http.Error(w, `{"error":"server misconfiguration"}`, http.StatusInternalServerError)
			return
		}

		claims := &AuthClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		if claims.Sub == "" {
			http.Error(w, `{"error":"token missing user id"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, claims.Sub)
		ctx = context.WithValue(ctx, UserEmailKey, claims.Email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserID extracts the authenticated user ID from the request context.
func GetUserID(r *http.Request) string {
	v, _ := r.Context().Value(UserIDKey).(string)
	return v
}

// GetUserEmail extracts the authenticated user email from the request context.
func GetUserEmail(r *http.Request) string {
	v, _ := r.Context().Value(UserEmailKey).(string)
	return v
}
