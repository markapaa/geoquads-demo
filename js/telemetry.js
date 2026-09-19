// Sends ONE anonymous record when a daily/archive quiz is finished.
// No account, no name, no e-mail: just a random id made in the browser, the quiz, and the result.
// Players can switch it off in the Stats window. Failures are silently ignored.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const ID_KEY = "gq-player-id";
const OFF_KEY = "gq-share-off";

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isEnabled = () => isConfigured() && safeGet(OFF_KEY) !== "1";
export function setEnabled(on) { safeSet(OFF_KEY, on ? "0" : "1"); }

function playerId() {
  let id = safeGet(ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
    safeSet(ID_KEY, id);
  }
  return id;
}

/** Order in which the groups were found, e.g. "0,1,3,2" (built from the guess history). */
export function foundOrder(history) {
  const order = [];
  for (const row of history || []) {
    if (row.length === 4 && row.every((g) => g === row[0]) && !order.includes(row[0])) order.push(row[0]);
  }
  return order.join(",");
}

function headers() {
  const h = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
  // Old-style anon keys are JWTs and go in Authorization too; new "sb_publishable_" keys only use apikey.
  if (!SUPABASE_ANON_KEY.startsWith("sb_")) h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  return h;
}

export function reportResult({ quizId, mode, won, mistakes, history }) {
  if (!isEnabled()) return;
  const row = {
    player_id: playerId(),
    quiz_id: quizId,
    mode,
    won: !!won,
    mistakes: Number(mistakes) || 0,
    found_order: foundOrder(history),
  };
  try {
    fetch(`${SUPABASE_URL}/rest/v1/plays`, {
      method: "POST",
      keepalive: true,
      headers: headers(),
      body: JSON.stringify(row),
    }).catch(() => {});
  } catch { /* ignore */ }
}
