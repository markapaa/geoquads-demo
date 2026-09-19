import test from "node:test";
import assert from "node:assert/strict";
import { mistakeDistribution, nextStats, currentStreak } from "../js/logic.js";

test("mistakeDistribution counts wins by mistakes and losses", () => {
  const { rows, total } = mistakeDistribution({
    a: { won: true, mistakes: 0 },
    b: { won: true, mistakes: 2 },
    c: { won: true, mistakes: 2 },
    d: { won: false, mistakes: 5 },
  });
  assert.equal(total, 4);
  assert.deepEqual(rows.map((r) => r.count), [1, 0, 2, 0, 1]);
  assert.equal(rows.at(-1).lost, true);
});

test("mistakeDistribution handles empty input", () => {
  const { rows, total } = mistakeDistribution({});
  assert.equal(total, 0);
  assert.equal(rows.length, 5);
});

test("streak only grows from today's daily quiz", () => {
  const s1 = nextStats({}, true, { isTodaysDaily: true, today: "2026-09-19" });
  assert.equal(currentStreak(s1, "2026-09-19"), 1);
  const s2 = nextStats(s1, true, { isTodaysDaily: false, today: "2026-09-19" });
  assert.equal(currentStreak(s2, "2026-09-19"), 1);
  const s3 = nextStats(s2, true, { isTodaysDaily: true, today: "2026-09-20" });
  assert.equal(currentStreak(s3, "2026-09-20"), 2);
  assert.equal(currentStreak(s3, "2026-09-25"), 0);
});
