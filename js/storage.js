// Small wrapper around localStorage. Every call is safe even if storage is blocked
// (private mode, cleared site data, etc.).

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const getSound = () => read("gq-sound", false);
export const setSound = (on) => write("gq-sound", !!on);

export const getStats = () => read("gq-stats", {});
export const setStats = (stats) => write("gq-stats", stats);

/** Results per quiz id: { "2026-09-10": { won: true, mistakes: 1, history: [[0,0,1,2], ...] } } */
export const getResults = () => read("gq-results", {});
export function saveResult(id, result) {
  const all = getResults();
  all[id] = result;
  write("gq-results", all);
}

export const hasSeenHelp = () => read("gq-seen-help", false);
export const markHelpSeen = () => write("gq-seen-help", true);
