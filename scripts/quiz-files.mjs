// Shared helper for the scripts: finds every quiz file under quizzes/, in any sub-folder.
// Daily quizzes live in quizzes/<year>/<month>/ (see quizPath in js/logic.js), practice quizzes in quizzes/.

import fs from "node:fs";
import path from "node:path";
import { quizPath } from "../js/logic.js";

/** Returns [{ id, full, rel, expectedRel }] sorted by id. `rel` is the path inside the quizzes folder. */
export function listQuizFiles(quizzesDir) {
  const found = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const isIndex = dir === quizzesDir && entry.name === "index.json";
      if (!entry.name.endsWith(".json") || isIndex) continue;

      const id = entry.name.replace(/\.json$/, "");
      found.push({
        id,
        full,
        rel: path.relative(quizzesDir, full).split(path.sep).join("/"),
        expectedRel: quizPath(id).replace(/^quizzes\//, ""),
      });
    }
  };

  walk(quizzesDir);
  return found.sort((a, b) => a.id.localeCompare(b.id));
}
