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
 *   node scripts/update-changelog.mjs frontend-v1.2.3  # frontend service release
 *   node scripts/update-changelog.mjs backend-v1.2.3   # backend service release
 *   node scripts/update-changelog.mjs scraper-v1.2.3   # scraper service release
 *   node scripts/update-changelog.mjs helm-v1.2.4      # chart-only release
 *
 * The script:
 *   1. Detects the tag type (service release or chart-only).
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
    /chore(\(.*\))?:.*\[skip ci\]/i.test(subject) ||
    /\[skip ci\]/i.test(subject)
  );
}

// ── Argument parsing ──────────────────────────────────────────────────────────

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/update-changelog.mjs <tag>");
  process.exit(1);
}

const isAppRelease = /^v\d/.test(tag);
const isFrontendRelease = /^frontend-v\d/.test(tag);
const isBackendRelease = /^backend-v\d/.test(tag);
const isScraperRelease = /^scraper-v\d/.test(tag);
const isServiceRelease = isFrontendRelease || isBackendRelease || isScraperRelease;
const isChartRelease = /^helm-v\d/.test(tag);

if (!isAppRelease && !isServiceRelease && !isChartRelease) {
  console.error(`Unknown tag format: "${tag}". Expected frontend-v*, backend-v*, scraper-v*, helm-v*, or v*.`);
  process.exit(1);
}

// ── Version label ─────────────────────────────────────────────────────────────

let version;
let releaseType;
let tagPattern;

if (isAppRelease) {
  version = tag.slice(1);
  releaseType = "App";
  tagPattern = "v[0-9]*";
} else if (isFrontendRelease) {
  version = tag.replace(/^frontend-v/, "");
  releaseType = "Frontend";
  tagPattern = "frontend-v[0-9]*";
} else if (isBackendRelease) {
  version = tag.replace(/^backend-v/, "");
  releaseType = "Backend";
  tagPattern = "backend-v[0-9]*";
} else if (isScraperRelease) {
  version = tag.replace(/^scraper-v/, "");
  releaseType = "Scraper";
  tagPattern = "scraper-v[0-9]*";
} else {
  version = tag.replace(/^helm-v/, "");
  releaseType = "Helm chart";
  tagPattern = "helm-v[0-9]*";
}

// ── Date of the tag (or today if the tag doesn't exist yet) ──────────────────

let date;
try {
  date = git(`log -1 --format=%cs "${tag}"`);
} catch {
  date = new Date().toISOString().slice(0, 10);
}

// ── Previous tag of the same type ────────────────────────────────────────────

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

const serviceLabels = {
  Frontend: "Frontend",
  Backend: "Backend",
  Scraper: "Scraper",
  App: "App",
  "Helm chart": "Helm chart",
};

let header;
let typeLabel;
let changelogKey;

if (isChartRelease) {
  header = `## [Helm ${version}] — ${date}`;
  typeLabel = "_Chart-only release (appVersion unchanged)_";
  changelogKey = `Helm ${version}`;
} else if (isAppRelease) {
  header = `## [${version}] — ${date}`;
  typeLabel = "_App release_";
  changelogKey = version;
} else {
  header = `## [${serviceLabels[releaseType]} ${version}] — ${date}`;
  typeLabel = `_${releaseType} service release_`;
  changelogKey = `${serviceLabels[releaseType]} ${version}`;
}

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
if (existing.includes(`## [${changelogKey}]`)) {
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
