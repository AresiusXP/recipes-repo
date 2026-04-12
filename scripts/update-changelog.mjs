#!/usr/bin/env node
/**
 * update-changelog.mjs
 *
 * Prepends a new entry to CHANGELOG.md for the given tag.
 *
 * Usage:
 *   node scripts/update-changelog.mjs <tag>
 *
 * Examples:
 *   node scripts/update-changelog.mjs v1.2.3          # app release
 *   node scripts/update-changelog.mjs helm-v1.2.4     # chart-only release
 *
 * The script:
 *   1. Detects whether the tag is an app release (v*) or chart-only (helm-v*).
 *   2. Finds the previous tag of the same type to establish the commit range.
 *   3. Collects commit messages in that range, filtering out noisy chore bumps.
 *   4. Prepends a formatted section to CHANGELOG.md.
 *
 * Requires: git in PATH, Node.js >= 18.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CHANGELOG_PATH = resolve(REPO_ROOT, "CHANGELOG.md");

// ── Helpers ──────────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}

function gitLines(cmd) {
  const out = git(cmd);
  return out ? out.split("\n") : [];
}

/**
 * Returns true for commit subjects that are just housekeeping noise and should
 * not appear in the user-facing changelog.
 */
function isNoise(subject) {
  return (
    /^\s*chore:\s*bump chart to/i.test(subject) ||
    /^\[skip ci\]/i.test(subject)
  );
}

// ── Argument parsing ──────────────────────────────────────────────────────────

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/update-changelog.mjs <tag>");
  process.exit(1);
}

const isAppRelease = /^v\d/.test(tag);
const isChartRelease = /^helm-v\d/.test(tag);

if (!isAppRelease && !isChartRelease) {
  console.error(`Unknown tag format: "${tag}". Expected v* or helm-v*.`);
  process.exit(1);
}

// ── Version label ─────────────────────────────────────────────────────────────

const version = isAppRelease ? tag.slice(1) : tag.replace(/^helm-v/, "");
const releaseType = isAppRelease ? "App" : "Helm chart";

// ── Date of the tag (or today if the tag doesn't exist yet) ──────────────────

let date;
try {
  date = git(`log -1 --format=%cs "${tag}"`);
} catch {
  date = new Date().toISOString().slice(0, 10);
}

// ── Previous tag of the same type ────────────────────────────────────────────

const tagPattern = isAppRelease ? "v[0-9]*" : "helm-v[0-9]*";
// List all matching tags sorted by version (oldest first).
const allTags = gitLines(`tag --sort=version:refname --list "${tagPattern}"`);
const currentIdx = allTags.indexOf(tag);
const prevTag = currentIdx > 0 ? allTags[currentIdx - 1] : null;

// ── Commit range ──────────────────────────────────────────────────────────────

const range = prevTag ? `${prevTag}..${tag}` : tag;

// ── Collect commits ───────────────────────────────────────────────────────────

const rawCommits = gitLines(`log ${range} --pretty=format:"%s"`);
const commits = rawCommits.filter((s) => s && !isNoise(s));

// ── Build entry ───────────────────────────────────────────────────────────────

const header =
  isAppRelease
    ? `## [${version}] — ${date}`
    : `## [Helm ${version}] — ${date}`;

const typeLabel =
  isAppRelease
    ? "_App release_"
    : "_Chart-only release (appVersion unchanged)_";

const bulletLines =
  commits.length > 0
    ? commits.map((c) => `- ${c}`).join("\n")
    : "- No user-facing changes.";

// entry ends with a blank line so sections are separated in the final file
const entry = [header, "", typeLabel, "", bulletLines, "", ""].join("\n");

// ── Read existing changelog ───────────────────────────────────────────────────

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.
`;

let existing = existsSync(CHANGELOG_PATH)
  ? readFileSync(CHANGELOG_PATH, "utf-8")
  : CHANGELOG_HEADER + "\n";

// If the entry for this tag already exists, exit without writing.
if (existing.includes(`## [${isAppRelease ? version : `Helm ${version}`}]`)) {
  console.log(`Changelog entry for ${tag} already exists — skipping.`);
  process.exit(0);
}

// Strip the fixed header so we can prepend the new entry just below it.
const withoutHeader = existing.startsWith(CHANGELOG_HEADER)
  ? existing.slice(CHANGELOG_HEADER.length)
  : "\n" + existing;

const updated = CHANGELOG_HEADER + "\n" + entry + withoutHeader.trimStart();

// ── Write ─────────────────────────────────────────────────────────────────────

writeFileSync(CHANGELOG_PATH, updated, "utf-8");
console.log(`✓ CHANGELOG.md updated for ${releaseType} ${tag}`);
