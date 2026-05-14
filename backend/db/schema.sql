-- ─── Database schema for Recipes app ─────────────────────────────────────────
-- This file is used to initialise the database in Docker Compose / E2E and
-- in production (Kubernetes) via a psql initContainer in the backend Deployment.
-- All statements are idempotent (IF NOT EXISTS) and safe to re-run on upgrade.
--
-- IMPORTANT: If you change this file, also update the copy in:
--   helm/recipes/templates/backend-schema-configmap.yaml

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── User ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "User" (
  id                    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email                 TEXT        NOT NULL UNIQUE,
  name                  TEXT,
  image                 TEXT,
  "themePreference"     TEXT        NOT NULL DEFAULT 'system',
  "autoTranslateLanguage" TEXT,
  "isBanned"            BOOLEAN     NOT NULL DEFAULT false,
  "bannedAt"            TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastLoginAt"         TIMESTAMPTZ
);

-- ── Recipe ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Recipe" (
  id                    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"              TEXT        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  ingredients           TEXT        NOT NULL DEFAULT '[]',
  steps                 TEXT        NOT NULL DEFAULT '[]',
  "sourceUrl"           TEXT,
  "imagePath"           TEXT,
  "isFavorite"          BOOLEAN     NOT NULL DEFAULT false,
  "cookThisWeekUntil"   TIMESTAMPTZ,
  "shareToken"          TEXT        UNIQUE,
  "rawContent"          TEXT,
  "sourceLanguage"      TEXT,
  "translatedLanguage"  TEXT,
  "hasBeenTranslated"   BOOLEAN     NOT NULL DEFAULT false,
  "isTranslatedToEnglish" BOOLEAN   NOT NULL DEFAULT false,
  "prepTime"            TEXT,
  "cookTime"            TEXT,
  servings              TEXT,
  "sharedByUserId"      TEXT        REFERENCES "User"(id) ON DELETE SET NULL,
  "sharedFromRecipeId"  TEXT        REFERENCES "Recipe"(id) ON DELETE SET NULL,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tag ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Tag" (
  id     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name   TEXT NOT NULL UNIQUE
);

-- ── RecipeTag ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecipeTag" (
  "recipeId" TEXT NOT NULL REFERENCES "Recipe"(id) ON DELETE CASCADE,
  "tagId"    TEXT NOT NULL REFERENCES "Tag"(id)    ON DELETE CASCADE,
  PRIMARY KEY ("recipeId", "tagId")
);

-- ── Notification ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Notification" (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  "recipeId"  TEXT        REFERENCES "Recipe"(id) ON DELETE SET NULL,
  "isRead"    BOOLEAN     NOT NULL DEFAULT false,
  title       TEXT,
  "senderUserId" TEXT     REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AccountProvider ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AccountProvider" (
  "userId"            TEXT        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  provider            TEXT        NOT NULL,
  "providerAccountId" TEXT        NOT NULL,
  "linkedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", provider)
);

CREATE INDEX IF NOT EXISTS idx_accountprovider_userid ON "AccountProvider"("userId");

-- ── RecipeImportJob ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecipeImportJob" (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'pending',
  "recipeId"  TEXT        REFERENCES "Recipe"(id) ON DELETE SET NULL,
  error       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recipe_userid    ON "Recipe"("userId");
CREATE INDEX IF NOT EXISTS idx_notification_userid ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS idx_importjob_userid ON "RecipeImportJob"("userId");
CREATE INDEX IF NOT EXISTS idx_importjob_status ON "RecipeImportJob"(status);
