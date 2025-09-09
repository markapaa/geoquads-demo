#!/usr/bin/env node
// GeoQuads — quizzes validator (Node 18+)
// Usage: node validate-quizzes.mjs [quizzesDir]
// Exits with non-zero code αν βρεθούν σφάλματα.

import fs from "node:fs";
import path from "node:path";

const quizzesDir = process.argv[2] || path.resolve("quizzes");

const err = (msg) => console.error("✗", msg);
const ok = (msg) => console.log("✓", msg);

function isHexColor(s) {
  return typeof s === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function trimStrings(arr) {
  return arr.map((s) => (typeof s === "string" ? s.trim() : s));
}

function validateQuiz(json, file) {
  const errors = [];

  // Basic shape
  if (!json || typeof json !== "object") {
    errors.push("Not an object JSON");
    return errors;
  }
  if (!Array.isArray(json.groups) || json.groups.length !== 4) {
    errors.push("Must have exactly 4 groups");
  }

  // Optional fields
  if (json.lives !== undefined && !(Number.isInteger(json.lives) && json.lives > 0)) {
    errors.push("`lives` must be a positive integer if present");
  }
  if (json.showOneAway !== undefined && typeof json.showOneAway !== "boolean") {
    errors.push("`showOneAway` must be boolean if present");
  }
  if (json.ui?.accent && !isHexColor(json.ui.accent)) {
    errors.push("`ui.accent` must be a hex color like #4F46E5");
  }

  // Groups & items
  const allItems = [];
  if (Array.isArray(json.groups)) {
    json.groups.forEach((g, gi) => {
      const gname = g?.name || `Group ${gi + 1}`;
      if (!gname || typeof gname !== "string") {
        errors.push(`Group ${gi + 1}: missing/invalid name`);
      }
      if (!Array.isArray(g.items) || g.items.length !== 4) {
        errors.push(`${gname}: must have exactly 4 items`);
        return;
      }
      // Trim + basic string check
      g.items = trimStrings(g.items);
      g.items.forEach((it, i) => {
        if (typeof it !== "string" || it.length === 0) {
          errors.push(`${gname}: item ${i + 1} must be non-empty string`);
        }
      });
      // Uniqueness inside group
      const u = unique(g.items);
      if (u.length !== g.items.length) {
        errors.push(`${gname}: duplicate items inside the group`);
      }
      allItems.push(...g.items);
    });
  }

  // Uniqueness across all 16 items
  const uAll = unique(allItems);
  if (uAll.length !== allItems.length) {
    // find duplicates
    const counts = {};
    allItems.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
    const dups = Object.keys(counts).filter((k) => counts[k] > 1);
    errors.push(`Duplicates across categories: ${dups.join(", ")}`);
  }

  return errors;
}

function main() {
  if (!fs.existsSync(quizzesDir) || !fs.lstatSync(quizzesDir).isDirectory()) {
    err(`Quizzes directory not found: ${quizzesDir}`);
    process.exit(2);
  }

  const files = fs
    .readdirSync(quizzesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    err("No .json files in quizzes/ directory");
    process.exit(2);
  }

  let totalErrors = 0;

  console.log(`Validating ${files.length} file(s) in: ${quizzesDir}\n`);

  for (const f of files) {
    const full = path.join(quizzesDir, f);
    let json;
    try {
      const raw = fs.readFileSync(full, "utf8");
      json = JSON.parse(raw);
    } catch (e) {
      err(`${f}: JSON parse error — ${e.message}`);
      totalErrors++;
      continue;
    }

    const errors = validateQuiz(json, f);
    if (errors.length) {
      err(`${f}:`);
      errors.forEach((e) => err(`  - ${e}`));
      totalErrors += errors.length;
    } else {
      ok(`${f}: OK`);
    }
  }

  console.log(
    `\nSummary: ${totalErrors === 0 ? "All good 🎉" : `${totalErrors} problem(s) found`}`
  );
  process.exit(totalErrors === 0 ? 0 : 1);
}

main();
