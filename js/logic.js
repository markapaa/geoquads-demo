// Pure game logic: no DOM, no localStorage, no fetch.
// Keeping it separate makes it easy to unit test.

export const pad2 = (n) => String(n).padStart(2, "0");

// -- Dates ------------------------------------------------------------------

export function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(now = new Date()) {
  return ymd(now);
}

export function strToDate(s) {
  const [Y, M, D] = s.split("-").map(Number);
  return new Date(Y, M - 1, D);
}

export function isDateId(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function msUntilMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

// -- Quiz data ----------------------------------------------------------------

export function shuffleArray(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Checks a quiz object and returns a cleaned copy (trimmed labels). Throws on invalid data. */
export function validateConfig(config) {
  if (!config || !Array.isArray(config.groups) || config.groups.length !== 4) {
    throw new Error("Invalid quiz: must have exactly 4 groups.");
  }
  const seen = new Set();
  const groups = config.groups.map((g, gi) => {
    const name = String(g?.name ?? `Group ${gi + 1}`).trim();
    if (!Array.isArray(g?.items) || g.items.length !== 4) {
      throw new Error(`Invalid group "${name}": must have exactly 4 items.`);
    }
    const items = g.items.map((s) => String(s).trim());
    for (const item of items) {
      if (!item) throw new Error(`Invalid group "${name}": empty item.`);
      const key = item.toLowerCase();
      if (seen.has(key)) throw new Error(`Invalid quiz: duplicate item "${item}" across categories.`);
      seen.add(key);
    }
    return { ...g, name, items };
  });
  return { ...config, groups };
}

/** Builds the 16 shuffled tiles. Each tile remembers which group it belongs to. */
export function buildTiles(cfg, rng = Math.random) {
  const base = [];
  cfg.groups.forEach((g, groupIndex) => {
    g.items.forEach((label, i) => base.push({ id: `${groupIndex}-${i}`, label, groupIndex }));
  });
  return shuffleArray(base, rng);
}

// -- Guessing -----------------------------------------------------------------

/** chosen = 4 tiles. Returns whether they form a group, which one, and if the guess was "one away". */
export function evaluateGuess(chosen) {
  const counts = new Map();
  for (const t of chosen) counts.set(t.groupIndex, (counts.get(t.groupIndex) || 0) + 1);
  const [groupIndex, top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    correct: top === 4,
    groupIndex: top === 4 ? groupIndex : null,
    oneAway: top === 3,
  };
}

// -- Stats --------------------------------------------------------------------

/**
 * Updates the stats after a finished quiz.
 * The streak counts DAYS IN A ROW: only winning today's daily moves it.
 * Archive quizzes count as "played" but never change the streak.
 */
export function nextStats(stats, won, { isTodaysDaily = false, today = todayStr() } = {}) {
  const s = { ...stats };
  s.played = (s.played || 0) + 1;
  if (won) s.wins = (s.wins || 0) + 1;
  if (!isTodaysDaily) return s;

  if (won) {
    if (s.lastWinDay !== today) {
      s.streak = s.lastWinDay === yesterdayOf(today) ? (s.streak || 0) + 1 : 1;
      s.lastWinDay = today;
    }
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak || 0);
  } else if (s.lastWinDay !== today) {
    s.streak = 0;
  }
  return s;
}

function yesterdayOf(day) {
  const d = strToDate(day);
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

/** The streak to show: it is broken if you did not win yesterday's or today's daily. */
export function currentStreak(stats, today = todayStr()) {
  const last = stats.lastWinDay;
  if (!last || (last !== today && last !== yesterdayOf(today))) return 0;
  return stats.streak || 0;
}

// -- Sharing ------------------------------------------------------------------

const SQUARES = ["🟨", "🟦", "🟪", "🟥"];

export function shareText({ label, won, mistakes, history, url }) {
  const rows = history.map((row) => row.map((gi) => SQUARES[gi] ?? "⬜").join("")).join("\n");
  const head = won
    ? `GeoQuads ${label} — solved with ${mistakes} mistake${mistakes === 1 ? "" : "s"}`
    : `GeoQuads ${label} — not this time`;
  return `${head}\n${rows}\n${url}`;
}
