#!/usr/bin/env node
/**
 * SQLite → PostgreSQL one-time data migration script.
 *
 * Usage:
 *   node migrate-sqlite-to-postgres.mjs \
 *     --sqlite /path/to/recipes.db \
 *     --postgres postgresql://user:pass@host:5432/recipes
 *
 * Safety guarantees:
 *   - All inserts run inside a single PostgreSQL transaction.
 *   - Row counts are verified before committing.
 *   - Idempotent: uses INSERT ... ON CONFLICT DO NOTHING so it is safe to re-run.
 *   - The SQLite file is never modified.
 *
 * Prerequisites:
 *   npm install better-sqlite3 pg
 */

import Database from "better-sqlite3";
import pg from "pg";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    sqlite: { type: "string" },
    postgres: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!args.sqlite || !args.postgres) {
  console.error("Usage: node migrate-sqlite-to-postgres.mjs --sqlite <path> --postgres <url>");
  process.exit(1);
}

const DRY_RUN = args["dry-run"];

// ─── Open SQLite ───────────────────────────────────────────────────────────────

console.log(`\n📂 Opening SQLite database: ${args.sqlite}`);
const sqlite = new Database(args.sqlite, { readonly: true });

// ─── Open PostgreSQL ───────────────────────────────────────────────────────────

console.log(`🐘 Connecting to PostgreSQL: ${args.postgres.replace(/:([^:@]+)@/, ":***@")}`);
const pool = new pg.Pool({ connectionString: args.postgres });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sqliteRows(table) {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all();
}

function count(rows) {
  return rows.length;
}

async function pgCount(client, table) {
  const res = await client.query(`SELECT COUNT(*) FROM "${table}"`);
  return parseInt(res.rows[0].count, 10);
}

function nullify(val) {
  return val === undefined ? null : val;
}

// ─── Migration ────────────────────────────────────────────────────────────────

async function migrate() {
  const client = await pool.connect();

  try {
    // ── Read all SQLite data ──────────────────────────────────────────────────
    console.log("\n📊 Reading SQLite data...");

    const tables = [
      "User",
      "Account",
      "Session",
      "VerificationToken",
      "Recipe",
      "Tag",
      "RecipeTag",
      "Notification",
    ];

    const data = {};
    for (const table of tables) {
      try {
        data[table] = sqliteRows(table);
        console.log(`  ${table}: ${count(data[table])} rows`);
      } catch (err) {
        console.warn(`  ⚠️  Table "${table}" not found in SQLite (skipping): ${err.message}`);
        data[table] = [];
      }
    }

    if (DRY_RUN) {
      console.log("\n🔍 Dry run — no changes will be made to PostgreSQL.");
      return;
    }

    // ── Begin PostgreSQL transaction ──────────────────────────────────────────
    console.log("\n🚀 Starting PostgreSQL transaction...");
    await client.query("BEGIN");

    // ── Insert in dependency order ────────────────────────────────────────────

    // 1. Users
    console.log(`\n  Inserting ${count(data["User"])} users...`);
    for (const u of data["User"]) {
      await client.query(
        `INSERT INTO "User" (
          id, name, email, "emailVerified", image,
          "autoTranslateLanguage", "themePreference",
          "createdAt", "lastLoginAt", "isBanned", "bannedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING`,
        [
          u.id, nullify(u.name), nullify(u.email),
          nullify(u.emailVerified), nullify(u.image),
          nullify(u.autoTranslateLanguage),
          u.themePreference ?? "system",
          u.createdAt, nullify(u.lastLoginAt),
          u.isBanned === 1 || u.isBanned === true,
          nullify(u.bannedAt),
        ]
      );
    }

    // 2. Accounts
    console.log(`  Inserting ${count(data["Account"])} accounts...`);
    for (const a of data["Account"]) {
      await client.query(
        `INSERT INTO "Account" (
          id, "userId", type, provider, "providerAccountId",
          refresh_token, access_token, expires_at,
          token_type, scope, id_token, session_state
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING`,
        [
          a.id, a.userId, a.type, a.provider, a.providerAccountId,
          nullify(a.refresh_token), nullify(a.access_token),
          nullify(a.expires_at), nullify(a.token_type),
          nullify(a.scope), nullify(a.id_token), nullify(a.session_state),
        ]
      );
    }

    // 3. Sessions
    console.log(`  Inserting ${count(data["Session"])} sessions...`);
    for (const s of data["Session"]) {
      await client.query(
        `INSERT INTO "Session" (id, "sessionToken", "userId", expires)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.sessionToken, s.userId, s.expires]
      );
    }

    // 4. VerificationTokens
    console.log(`  Inserting ${count(data["VerificationToken"])} verification tokens...`);
    for (const v of data["VerificationToken"]) {
      await client.query(
        `INSERT INTO "VerificationToken" (identifier, token, expires)
         VALUES ($1,$2,$3)
         ON CONFLICT (identifier, token) DO NOTHING`,
        [v.identifier, v.token, v.expires]
      );
    }

    // 5. Tags
    console.log(`  Inserting ${count(data["Tag"])} tags...`);
    for (const t of data["Tag"]) {
      await client.query(
        `INSERT INTO "Tag" (id, name) VALUES ($1,$2)
         ON CONFLICT (id) DO NOTHING`,
        [t.id, t.name]
      );
    }

    // 6. Recipes
    console.log(`  Inserting ${count(data["Recipe"])} recipes...`);
    for (const r of data["Recipe"]) {
      await client.query(
        `INSERT INTO "Recipe" (
          id, title, description, "sourceUrl", "imagePath",
          ingredients, steps, "rawContent",
          "isFavorite", "cookThisWeekUntil",
          "createdAt", "updatedAt",
          "sourceLanguage", "isTranslatedToEnglish",
          "translatedLanguage", "hasBeenTranslated",
          "sharedByUserId", "sharedFromRecipeId", "userId"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO NOTHING`,
        [
          r.id, r.title, nullify(r.description), nullify(r.sourceUrl),
          nullify(r.imagePath), r.ingredients, r.steps, nullify(r.rawContent),
          r.isFavorite === 1 || r.isFavorite === true,
          nullify(r.cookThisWeekUntil),
          r.createdAt, r.updatedAt,
          nullify(r.sourceLanguage),
          r.isTranslatedToEnglish === 1 || r.isTranslatedToEnglish === true,
          nullify(r.translatedLanguage),
          r.hasBeenTranslated === 1 || r.hasBeenTranslated === true,
          nullify(r.sharedByUserId), nullify(r.sharedFromRecipeId), r.userId,
        ]
      );
    }

    // 7. RecipeTags
    console.log(`  Inserting ${count(data["RecipeTag"])} recipe-tag associations...`);
    for (const rt of data["RecipeTag"]) {
      await client.query(
        `INSERT INTO "RecipeTag" ("recipeId", "tagId") VALUES ($1,$2)
         ON CONFLICT ("recipeId", "tagId") DO NOTHING`,
        [rt.recipeId, rt.tagId]
      );
    }

    // 8. Notifications
    console.log(`  Inserting ${count(data["Notification"])} notifications...`);
    for (const n of data["Notification"]) {
      await client.query(
        `INSERT INTO "Notification" (
          id, type, title, message, "isRead", "createdAt",
          "userId", "senderUserId", "recipeId"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING`,
        [
          n.id, n.type, n.title, n.message,
          n.isRead === 1 || n.isRead === true,
          n.createdAt, n.userId,
          nullify(n.senderUserId), nullify(n.recipeId),
        ]
      );
    }

    // ── Verify row counts ─────────────────────────────────────────────────────
    console.log("\n🔍 Verifying row counts...");
    let allOk = true;

    for (const table of tables) {
      const srcCount = count(data[table]);
      const dstCount = await pgCount(client, table);

      // dstCount may be >= srcCount if the table already had rows (idempotent run)
      const ok = dstCount >= srcCount;
      const icon = ok ? "✅" : "❌";
      console.log(`  ${icon} ${table}: SQLite=${srcCount}, PostgreSQL=${dstCount}`);
      if (!ok) allOk = false;
    }

    if (!allOk) {
      console.error("\n❌ Row count mismatch — rolling back transaction.");
      await client.query("ROLLBACK");
      process.exit(1);
    }

    // ── Commit ────────────────────────────────────────────────────────────────
    await client.query("COMMIT");
    console.log("\n✅ Migration committed successfully!");
    console.log("   You can now deploy the new backend and verify the application.");
    console.log("   Keep the SQLite backup until you are confident the migration is complete.");

  } catch (err) {
    console.error("\n❌ Error during migration — rolling back:", err.message);
    await client.query("ROLLBACK").catch(() => {});
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

migrate();
