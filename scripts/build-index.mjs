#!/usr/bin/env node
// Builds quizzes/index.json: the list of available quizzes used by the Archive and Practice menus.
// Run it every time you add or remove a quiz file:  npm run build:index

import fs from "node:fs";
import path from "node:path";
import { listQuizFiles } from "./quiz-files.mjs";

const quizzesDir = path.resolve(process.argv[2] || "quizzes");

// Looks inside every sub-folder too (quizzes/2026/october/...).
const ids = listQuizFiles(quizzesDir).map((f) => f.id);

const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) {
  console.error(`The same quiz exists in two places: ${[...new Set(duplicates)].join(", ")}. Delete the old copy.`);
  process.exit(1);
}

const daily = ids
  .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id))
  .sort();

const practice = ids
  .filter((id) => id.startsWith("practice-"))
  .sort((a, b) => {
    const order = ["easy", "medium", "hard"];
    const rank = (id) => {
      const i = order.indexOf(id.replace("practice-", ""));
      return i === -1 ? order.length : i;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });

fs.writeFileSync(path.join(quizzesDir, "index.json"), JSON.stringify({ daily, practice }, null, 2) + "\n");
console.log(`quizzes/index.json updated: ${daily.length} daily, ${practice.length} practice.`);
