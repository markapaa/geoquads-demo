// GeoQuads: UI and game flow. Pure rules live in logic.js, browser storage in storage.js, sounds in sound.js.
import { reportResult, isConfigured, isEnabled, setEnabled } from "./telemetry.js";
import {
  todayStr, strToDate, isDateId, buildTiles, validateConfig, evaluateGuess,
  nextStats, currentStreak, mistakeDistribution, msUntilMidnight, formatCountdown, shareText, shuffleArray,
} from "./logic.js";
import * as store from "./storage.js";
import { sfx, setSoundEnabled, isSoundEnabled } from "./sound.js";
import { launchConfetti } from "./confetti.js";
import { loadMapData, createWorldMap } from "./map.js";

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_MANIFEST = { daily: [], practice: ["practice-easy", "practice-hard"] };

let manifest = DEFAULT_MANIFEST;
let worldMap = null;

const state = {
  cfg: null,
  quizId: null,
  mode: "daily", // "daily" | "practice" | "archive"
  tiles: [],
  selected: new Set(),
  solved: [], // group indexes, in the order they were solved
  mistakes: 0,
  maxMistakes: 4,
  showOneAway: true,
  history: [], // every guess, as an array of group indexes
  over: false,
  won: false,
  busy: false, // true while an animation is playing
};

// ---------------------------------------------------------------- loading ---

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const fetchQuiz = async (id) => validateConfig(await fetchJSON(`quizzes/${id}.json`));

async function loadManifest() {
  try {
    const m = await fetchJSON("quizzes/index.json");
    manifest = {
      daily: Array.isArray(m.daily) ? m.daily : [],
      practice: Array.isArray(m.practice) && m.practice.length ? m.practice : DEFAULT_MANIFEST.practice,
    };
  } catch {
    manifest = DEFAULT_MANIFEST;
  }
}

async function loadDaily() {
  const today = todayStr();
  try {
    startQuiz(await fetchQuiz(today), { id: today, mode: "daily" });
  } catch (e) {
    console.warn(`No daily quiz for ${today}:`, e.message);
    startQuiz(await fetchQuiz("practice-easy"), {
      id: "practice-easy",
      mode: "practice",
      notice: "There's no daily puzzle for today yet, so here's a practice round instead.",
    });
  }
}

async function loadPractice(id) {
  try {
    startQuiz(await fetchQuiz(id), { id, mode: "practice" });
  } catch (e) {
    console.warn(e.message);
    await loadDaily();
  }
}

async function loadArchive(date) {
  try {
    startQuiz(await fetchQuiz(date), { id: date, mode: "archive" });
  } catch (e) {
    console.warn(e.message);
    await loadDaily();
  }
}

// ------------------------------------------------------------ start / reset ---

function startQuiz(cfg, { id, mode, notice = "" }) {
  Object.assign(state, {
    cfg,
    quizId: id,
    mode,
    tiles: buildTiles(cfg),
    selected: new Set(),
    solved: [],
    mistakes: 0,
    history: [],
    over: false,
    won: false,
    busy: false,
    maxMistakes: Number.isInteger(cfg.lives) && cfg.lives > 0 ? cfg.lives : 4,
    showOneAway: cfg.showOneAway !== false,
  });

  renderHeader(notice);
  const spoiler = $("spoiler");
  spoiler.classList.remove("revealed");
  spoiler.setAttribute("aria-expanded", "false");
  $("spoilerText").textContent = cfg.spoiler || "No hint for this one.";

  setMessage("");
  $("endcard").hidden = true;
  $("controls").hidden = false;
  renderSolved();
  renderGrid(true);
  renderHearts();
  updateStreak();

  // Dailies can only be played once: if there's a saved result, show the finished board.
  const saved = mode === "practice" ? null : store.getResults()[id];
  if (saved) restoreFinished(saved);

  updateNav();
  updateURL();
  syncMap(false);
}

function restoreFinished(saved) {
  state.history = saved.history || [];
  state.mistakes = saved.mistakes ?? 0;
  state.won = !!saved.won;
  state.solved = [0, 1, 2, 3];
  state.tiles = [];
  state.selected.clear();
  state.over = true;
  renderSolved();
  renderGrid();
  renderHearts();
  showEnd();
}

function updateURL() {
  let url = location.pathname;
  if (state.mode === "practice") url += `?id=${encodeURIComponent(state.quizId)}`;
  if (state.mode === "archive") url += `?date=${encodeURIComponent(state.quizId)}`;
  history.replaceState(null, "", url);
}

function updateNav() {
  $("dailyBtn").hidden = state.mode === "daily";
}

// --------------------------------------------------------------- rendering ---

function longDate(dateStr) {
  const d = dateStr ? strToDate(dateStr) : new Date();
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function renderHeader(notice) {
  const label =
    state.mode === "daily" ? `Today: ${longDate()}`
    : state.mode === "archive" ? `Archive: ${longDate(state.quizId)}`
    : state.cfg.title?.replace(/^GeoQuads\s*[—-]\s*/i, "") || "Practice";
  $("today").textContent = label;
  const box = $("notice");
  box.textContent = notice;
  box.hidden = !notice;
}

function setMessage(text, kind = "") {
  const el = $("message");
  el.textContent = text || "";
  el.className = "msg" + (kind ? ` ${kind}` : "");
}

function createBar(gi, missed = false) {
  const g = state.cfg.groups[gi];
  const bar = document.createElement("div");
  bar.className = `bar group-${gi}` + (missed ? " missed" : "");
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = g.name;
  const items = document.createElement("div");
  items.className = "items";
  items.textContent = g.items.join(" · ");
  bar.append(name, items);
  if (g.fact) {
    const fact = document.createElement("div");
    fact.className = "fact";
    fact.textContent = `💡 ${g.fact}`;
    bar.append(fact);
  }
  return bar;
}

function renderSolved() {
  const box = $("solved");
  box.innerHTML = "";
  state.solved.forEach((gi) => box.appendChild(createBar(gi)));
}

function renderGrid(animate = false) {
  const grid = $("grid");
  grid.innerHTML = "";
  grid.classList.toggle("reshuffle", animate);
  state.tiles.forEach((t, idx) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.textContent = t.label;
    cell.dataset.idx = idx;
    cell.style.setProperty("--i", idx);
    cell.addEventListener("click", (e) => {
      toggleSelect(idx);
      if (e.detail > 0) cell.blur(); // mouse click: let Enter submit instead of re-toggling this tile
    });
    grid.appendChild(cell);
  });
  syncSelection();
}

/** Updates selected styling and the buttons without rebuilding the grid. */
function syncSelection() {
  document.querySelectorAll("#grid .cell").forEach((cell) => {
    const on = state.selected.has(Number(cell.dataset.idx));
    cell.classList.toggle("selected", on);
    cell.setAttribute("aria-pressed", String(on));
  });
  $("submitBtn").disabled = state.selected.size !== 4 || state.over || state.busy;
  $("submitBtn").classList.toggle("ready", state.selected.size === 4 && !state.over && !state.busy);
  $("clearBtn").disabled = state.over || state.selected.size === 0;
  $("shuffleBtn").disabled = state.over || state.tiles.length === 0;
}

const HEART_FULL = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C6.1 15.36 3 12.54 3 9.28 3 7.01 4.86 5 7.24 5c1.41 0 2.75.66 3.6 1.72.85-1.06 2.19-1.72 3.6-1.72C17.14 5 19 7.01 19 9.28c0 3.26-3.1 6.08-7.55 10.75L12 21.35z"/></svg>`;
const HEART_EMPTY = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 21.35l-1.45-1.32C6.1 15.36 3 12.54 3 9.28 3 7.01 4.86 5 7.24 5c1.41 0 2.75.66 3.6 1.72.85-1.06 2.19-1.72 3.6-1.72C17.14 5 19 7.01 19 9.28c0 3.26-3.1 6.08-7.55 10.75L12 21.35z"/></svg>`;

function renderHearts(justLost = false) {
  const remaining = Math.max(0, state.maxMistakes - state.mistakes);
  const box = $("hearts");
  box.innerHTML = "";
  box.setAttribute("aria-label", `${remaining} of ${state.maxMistakes} lives left`);
  for (let i = 0; i < state.maxMistakes; i++) {
    const alive = i < remaining;
    const span = document.createElement("span");
    span.className = "heart" + (alive ? "" : " empty") + (justLost && i === remaining ? " lost" : "");
    span.innerHTML = alive ? HEART_FULL : HEART_EMPTY;
    box.appendChild(span);
  }
}

// --------------------------------------------------------------------- map ---

/** Lights up every solved group on the world map. */
function syncMap(animate = false) {
  if (!worldMap || !state.cfg) return;
  const groups = state.solved.map((gi) => ({ gi, name: state.cfg.groups[gi].name, items: state.cfg.groups[gi].items }));
  worldMap.update(groups, { animate });
  $("map").classList.toggle("has-lit", groups.length > 0);
}

async function initMap() {
  const data = await loadMapData();
  if (!data) {
    $("mapCard").hidden = true; // no map data: the game works fine without it
    return;
  }
  worldMap = createWorldMap($("mapCanvas"), data);
  syncMap(false);
}

// ---------------------------------------------------------------- gameplay ---

function toggleSelect(idx) {
  if (state.over || state.busy) return;
  if (state.selected.has(idx)) {
    state.selected.delete(idx);
    sfx.deselect();
  } else if (state.selected.size < 4) {
    state.selected.add(idx);
    sfx.select();
  }
  setMessage("");
  syncSelection();
}

function clearSelection() {
  if (state.busy) return;
  state.selected.clear();
  setMessage("");
  syncSelection();
}

function shuffleTiles() {
  if (state.over || state.busy || !state.tiles.length) return;
  state.tiles = shuffleArray(state.tiles);
  state.selected.clear();
  setMessage("");
  sfx.shuffle();
  renderGrid(true);
}

function solveGroup(gi, { missed = false } = {}) {
  state.solved.push(gi);
  state.tiles = state.tiles.filter((t) => t.groupIndex !== gi);
  state.selected.clear();
  $("solved").appendChild(createBar(gi, missed));
  renderGrid();
  syncMap(true);
}

async function submitGuess() {
  if (state.busy || state.over || state.selected.size !== 4) return;
  const chosen = [...state.selected].map((i) => state.tiles[i]);
  state.history.push(chosen.map((t) => t.groupIndex));
  const result = evaluateGuess(chosen);
  state.busy = true;

  if (result.correct) {
    sfx.correct();
    solveGroup(result.groupIndex);
    setMessage("Correct! You found a category.", "ok");
    if (state.solved.length === 4) finishGame(true);
  } else {
    sfx.wrong();
    state.mistakes++;
    document.querySelectorAll("#grid .cell.selected").forEach((c) => c.classList.add("shake"));
    renderHearts(true);
    if (state.showOneAway && result.oneAway) setMessage("One away! You're one word off.", "warn");
    else setMessage("Not quite, try again.", "error");
    await wait(450);
    document.querySelectorAll("#grid .cell.shake").forEach((c) => c.classList.remove("shake"));
    state.selected.clear();
    syncSelection();
    if (state.mistakes >= state.maxMistakes) await revealRemaining();
  }

  state.busy = false;
  syncSelection();
}

/** Out of lives: reveal the missing categories one by one. */
async function revealRemaining() {
  setMessage("Out of lives. Here are the answers:", "error");
  for (let gi = 0; gi < state.cfg.groups.length; gi++) {
    if (state.solved.includes(gi)) continue;
    await wait(700);
    solveGroup(gi, { missed: true });
  }
  finishGame(false);
}

function finishGame(won) {
  state.over = true;
  state.won = won;
  if (state.mode !== "practice") {
    store.saveResult(state.quizId, { won, mistakes: state.mistakes, history: state.history });
    store.setStats(nextStats(store.getStats(), won, { isTodaysDaily: state.mode === "daily" && state.quizId === todayStr() }));
    reportResult({ quizId: state.quizId, mode: state.mode, won, mistakes: state.mistakes, history: state.history });
  }
  if (won) {
    sfx.win();
    launchConfetti();
  }
  setMessage("");
  updateStreak();
  showEnd();
  syncSelection();
}

function showEnd() {
  $("controls").hidden = true;
  $("endcard").hidden = false;
  const m = state.mistakes;
  $("endTitle").textContent = state.won ? (m === 0 ? "Perfect! 🎉" : "You solved it! 🎉") : "Not this time";
  renderRecap();
  $("endSub").textContent = state.won
    ? `${m} mistake${m === 1 ? "" : "s"}.`
    : "Come back tomorrow for a fresh puzzle.";
}

/** Shows every guess as a row of colored squares (like the emoji grid you can share). */
function renderRecap() {
  const box = $("recap");
  box.innerHTML = "";
  state.history.forEach((row) => {
    const r = document.createElement("div");
    r.className = "recap-row";
    row.forEach((gi) => {
      const sq = document.createElement("span");
      sq.className = `sq g${gi}`;
      r.appendChild(sq);
    });
    box.appendChild(r);
  });
}

function updateStreak() {
  const streak = currentStreak(store.getStats());
  $("streakChip").hidden = streak < 1;
  $("streakNum").textContent = streak;
  $("streakChip").title = `${streak} in a row`;
}

// ---------------------------------------------------------- stats / sharing ---

function openStats() {
  const s = store.getStats();
  const played = s.played || 0;
  const wins = s.wins || 0;
  const rate = played ? Math.round((wins / played) * 100) : 0;
  const cells = [
    [played, "Played"],
    [`${rate}%`, "Win rate"],
    [currentStreak(s), "Streak"],
    [s.bestStreak || 0, "Best streak"],
  ];
  $("statsBody").innerHTML = cells.map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join("");
  renderStatsChart();
  $("privacy").hidden = !isConfigured();
  $("shareToggle").checked = isEnabled();
  $("statsDialog").showModal();
}

function renderStatsChart() {
  const { rows, total } = mistakeDistribution(store.getResults());
  const box = $("statsChart");
  if (!total) {
    box.innerHTML = '<p class="chart-empty">Finish a daily or an archive quiz to see your chart.</p>';
    return;
  }
  const top = Math.max(1, ...rows.map((r) => r.count));
  box.innerHTML = rows
    .map((r) => `<div class="chart-row${r.lost ? " lost" : ""}"><span class="lbl">${r.label}</span><span class="track"><span class="fill" style="width:${Math.round((r.count / top) * 100)}%"></span></span><span class="num">${r.count}</span></div>`)
    .join("");
}

async function shareResult() {
  const label = state.mode === "practice" ? `practice` : state.quizId;
  const url = `${location.origin}${location.pathname}`;
  const text = state.over
    ? shareText({ label, won: state.won, mistakes: state.mistakes, history: state.history, url })
    : `I'm playing GeoQuads! Try today's puzzle: ${url}`;
  try {
    if (navigator.share) await navigator.share({ title: "GeoQuads", text });
    else {
      await navigator.clipboard.writeText(text);
      setMessage("Result copied to clipboard ✅", "ok");
    }
  } catch {
    /* user cancelled sharing */
  }
}

// -------------------------------------------------- practice / archive lists ---

function practiceLabel(id) {
  const name = id.replace(/^practice-/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function openPractice() {
  const list = $("practiceList");
  list.innerHTML = "";
  manifest.practice.forEach((id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `Practice: ${practiceLabel(id)}`;
    b.addEventListener("click", async () => {
      $("practiceDialog").close();
      await loadPractice(id);
    });
    list.appendChild(b);
  });
  $("practiceDialog").showModal();
}

function openArchive() {
  const list = $("archiveList");
  list.innerHTML = "";
  const past = manifest.daily.filter((d) => isDateId(d) && d < todayStr()).sort().reverse();
  if (!past.length) {
    list.innerHTML = `<p class="empty-note">No past puzzles yet. Check back tomorrow!</p>`;
  }
  const results = store.getResults();
  past.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = strToDate(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    b.title = d;
    if (results[d]) {
      const dot = document.createElement("span");
      dot.className = "dot " + (results[d].won ? "win" : "fail");
      b.appendChild(dot);
    }
    b.addEventListener("click", async () => {
      $("archiveDialog").close();
      await loadArchive(d);
    });
    list.appendChild(b);
  });
  $("archiveDialog").showModal();
}

// ---------------------------------------------------------------- countdown ---

function tickCountdown() {
  const text = formatCountdown(msUntilMidnight());
  document.querySelectorAll("[data-countdown]").forEach((el) => (el.textContent = text));
}

// ------------------------------------------------------------------ wiring ---

function updateSoundButton() {
  const on = isSoundEnabled();
  $("soundBtn").setAttribute("aria-pressed", String(on));
  $("soundIcon").textContent = on ? "🔊" : "🔇";
}

// ------------------------------------------------------------------ theme ---

function isDark() {
  const set = document.documentElement.getAttribute("data-theme");
  if (set) return set === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function updateThemeButton() {
  $("themeIcon").textContent = isDark() ? "☀️" : "🌙";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark() ? "#171016" : "#fbf3e6");
}

function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  store.setTheme(next);
  updateThemeButton();
}

function wireUI() {
  $("clearBtn").addEventListener("click", clearSelection);
  $("shuffleBtn").addEventListener("click", shuffleTiles);
  $("submitBtn").addEventListener("click", submitGuess);

  $("statsBtn").addEventListener("click", openStats);
  $("shareBtn").addEventListener("click", shareResult);
  $("endShareBtn").addEventListener("click", shareResult);
  $("helpBtn").addEventListener("click", () => $("helpDialog").showModal());
  $("soundBtn").addEventListener("click", () => {
    setSoundEnabled(!isSoundEnabled());
    updateSoundButton();
  });
  updateSoundButton();

  $("themeBtn").addEventListener("click", toggleTheme);
  $("shareToggle").addEventListener("change", (e) => setEnabled(e.target.checked));
  updateThemeButton();

  $("spoiler").addEventListener("click", () => {
    const on = $("spoiler").classList.toggle("revealed");
    $("spoiler").setAttribute("aria-expanded", String(on));
  });

  $("dailyBtn").addEventListener("click", loadDaily);
  $("practiceBtn").addEventListener("click", openPractice);
  $("archiveBtn").addEventListener("click", openArchive);

  // Click on the dark backdrop closes a dialog
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); })
  );

  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) submitGuess();
    else if (e.key === "Escape") clearSelection();
    else if (e.key.toLowerCase() === "r" && !(e.target instanceof HTMLInputElement)) shuffleTiles();
  });

  setInterval(tickCountdown, 1000);
  tickCountdown();
}

// --------------------------------------------------------------- bootstrap ---

(async function bootstrap() {
  wireUI();
  // Lets the game be installed on a phone and keep working offline (see sw.js). Failing here is harmless.
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  await loadManifest();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const date = params.get("date");

  try {
    if (id && /^practice-[a-z0-9-]+$/i.test(id)) await loadPractice(id);
    else if (date && isDateId(date) && date < todayStr()) await loadArchive(date); // future dates stay locked
    else await loadDaily();
  } catch (e) {
    console.error(e);
    setMessage("Couldn't load the puzzle. If you opened index.html directly, run a local server instead (see README).", "error");
    return;
  }

  initMap();

  if (!store.hasSeenHelp()) {
    store.markHelpSeen();
    $("helpDialog").showModal();
  }
})();
