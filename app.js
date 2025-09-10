// ========= GeoQuads — Diagnostic Loader (root JSON paths, with fallback demo) =========

// -- State --
let tiles = [];
let selected = new Set();
let solvedGroups = new Set();
let mistakes = 0;
let MAX_MISTAKES = 4;
let SHOW_ONE_AWAY = true;
let cfg = null;

// -- Built-in demo (only for diagnostics fallback) --
const BUILTIN_DEMO = {
  id: "builtin-demo",
  title: "GeoQuads — Demo",
  spoiler: "Think capitals vs islands vs geography lines.",
  help: "Pick 4 items per category. You have 4 mistakes.",
  lives: 4,
  showOneAway: true,
  groups: [
    { name: "Landlocked countries", items: ["Nepal", "Bolivia", "Switzerland", "Ethiopia"] },
    { name: "Capitals starting with B", items: ["Brussels", "Brasilia", "Bangkok", "Budapest"] },
    { name: "Largest islands (by area)", items: ["Greenland", "New Guinea", "Borneo", "Madagascar"] },
    { name: "Countries crossed by the Equator", items: ["Ecuador", "Colombia", "Kenya", "Indonesia"] }
  ],
  ui: { accent: "#4F46E5", locale: "en-US" }
};

// -- Helpers --
const $ = (id) => document.getElementById(id);
console.log("GeoQuads app.js loaded");

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function setMessage(text, ok = false) {
  const el = $("message");
  el.textContent = text || "";
  el.className = "msg" + (ok ? " ok" : "");
}
function isGameOver() {
  return mistakes >= MAX_MISTAKES || solvedGroups.size === 4;
}

// -- Validation --
function normalizeLabel(s) { return String(s).trim(); }
function validateConfig(config) {
  if (!config?.groups || config.groups.length !== 4) {
    throw new Error("Invalid quiz: must have exactly 4 groups.");
  }
  const all = [];
  for (const g of config.groups) {
    if (!g.items || g.items.length !== 4) {
      throw new Error(`Invalid group "${g.name || "(no name)"}": must have exactly 4 items.`);
    }
    g.items = g.items.map(normalizeLabel);
    all.push(...g.items);
  }
  const seen = new Set();
  for (const label of all) {
    if (seen.has(label)) {
      throw new Error(`Invalid quiz: duplicate item "${label}" across categories.`);
    }
    seen.add(label);
  }
  return true;
}

// -- Fetch helpers (root paths) --
async function tryFetchJSON(url) {
  const res = await fetch(url);
  console.log("fetch", url, res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`JSON parse error for ${url}: ${e.message}`);
  }
}

async function loadQuizConfig() {
  // 1) ?id=foo  -> foo.json
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) {
    try { return await tryFetchJSON(`${id}.json`); }
    catch (e) { console.warn(e.message); }
  }
  // 2) daily -> YYYY-MM-DD.json
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  try { return await tryFetchJSON(`${yyyy}-${mm}-${dd}.json`); }
  catch (e) { console.warn(e.message); }
  // 3) fallback -> practice-easy.json (will throw if fails)
  return await tryFetchJSON("practice-easy.json");
}

// -- Apply UI from cfg --
function applyConfigToUI() {
  document.title = cfg.title || "GeoQuads";
  const locale = cfg.ui?.locale || "en-US";
  const todayStr = new Date().toLocaleDateString(locale);
  $("today").textContent = `Today: ${todayStr}`;

  $("help").onclick = () =>
    alert(
      cfg.help ||
      "Rules:\n• 16 items → 4 categories × 4 items.\n• Select 4 and press Submit.\n• You have 4 mistakes.\n• 'One away' means 3/4 are correct."
    );

  const spoilerEl = $("spoiler");
  if (spoilerEl) {
    spoilerEl.textContent = cfg.spoiler || "Spoiler available";
    spoilerEl.onclick = () => {
      spoilerEl.classList.toggle("revealed");
      spoilerEl.classList.toggle("spoiler");
    };
  }

  MAX_MISTAKES = Number.isInteger(cfg.lives) ? cfg.lives : 4;
  SHOW_ONE_AWAY = cfg.showOneAway !== false;

  if (cfg.ui?.accent) {
    document.documentElement.style.setProperty("--accent", cfg.ui.accent);
    document.documentElement.style.setProperty("--accent-weak", "#e0e7ff");
  }
}

// -- Build / render --
function buildTiles() {
  const base = [];
  cfg.groups.forEach((g, gi) => g.items.forEach((label, idx) => base.push({ label, groupIndex: gi, id: `${gi}-${idx}` })));
  return shuffleArray(base);
}

function renderSolvedBars() {
  const container = $("solved");
  container.innerHTML = "";
  [...solvedGroups].forEach((gi) => {
    const g = cfg.groups[gi];
    const bar = document.createElement("div");
    bar.className = "bar";
    if (g.color) bar.style.background = g.color;
    bar.innerHTML = `<div class="name">${g.name}</div><div class="items">${g.items.join(" · ")}</div>`;
    container.appendChild(bar);
  });
}

function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  tiles.forEach((t, idx) => {
    const cell = document.createElement("div");
    cell.className = "cell" + (selected.has(idx) ? " selected" : "");
    cell.textContent = t.label;
    cell.tabIndex = 0;
    cell.onclick = () => toggleSelect(idx);
    cell.onkeydown = (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleSelect(idx);
      }
    };
    grid.appendChild(cell);
  });
  updateSubmitState();
}

function updateSubmitState() {
  $("submitBtn").disabled = selected.size !== 4 || isGameOver();
  $("mistakes").textContent = mistakes;
}

// -- Game logic --
function toggleSelect(idx) {
  if (isGameOver()) return;
  if (selected.has(idx)) selected.delete(idx);
  else if (selected.size < 4) selected.add(idx);
  setMessage("");
  renderGrid();
}
function clearSelection() { selected.clear(); setMessage(""); renderGrid(); }
function shuffleTiles() {
  if (isGameOver()) return;
  tiles = shuffleArray(tiles); selected.clear(); setMessage(""); renderGrid();
}
function checkSelection() {
  if (selected.size !== 4 || isGameOver()) return;
  const chosen = [...selected].map((i) => tiles[i]);
  const g0 = chosen[0].groupIndex;
  const allSame = chosen.every((c) => c.groupIndex === g0);

  if (allSame) {
    solvedGroups.add(g0);
    setMessage("Correct! You found a category.", true);
    const labelsToRemove = new Set(cfg.groups[g0].items);
    tiles = tiles.filter((t) => !labelsToRemove.has(t.label));
    selected.clear();
    renderSolvedBars();
    renderGrid();
    if (solvedGroups.size === 4) endGame(true);
  } else {
    if (SHOW_ONE_AWAY && isOneAway(chosen)) setMessage("One away! You're one word off.");
    else setMessage("Not quite — try again.");
    mistakes++; selected.clear(); renderGrid();
    if (mistakes >= MAX_MISTAKES) endGame(false);
  }
}
function isOneAway(chosen) {
  const counts = {};
  chosen.forEach((c) => (counts[c.groupIndex] = (counts[c.groupIndex] || 0) + 1));
  return Math.max(...Object.values(counts)) === 3;
}
function endGame(won) {
  cfg.groups.forEach((_, gi) => { if (!solvedGroups.has(gi)) solvedGroups.add(gi); });
  renderSolvedBars();
  setMessage(won ? "Great job! All categories solved." : "Game over. See the categories above.");
  updateSubmitState();
}

// -- Countdown --
function updateCountdown() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const diff = nextMidnight - now;
  const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
  $("countdown").textContent = `${h}:${m}:${s}`;
}
setInterval(updateCountdown, 1000);
updateCountdown();

// -- Init --
function init() {
  tiles = buildTiles();
  selected.clear();
  solvedGroups.clear();
  mistakes = 0;
  renderSolvedBars();
  renderGrid();
  setMessage("");
}
$("clearBtn").onclick = clearSelection;
$("shuffleBtn").onclick = shuffleTiles;
$("submitBtn").onclick = checkSelection;

// -- Bootstrap --
(async function bootstrap() {
  try {
    const loaded = await loadQuizConfig();
    validateConfig(loaded);
    cfg = loaded;
    console.log("Loaded quiz config:", cfg.id || "(no id)");
    applyConfigToUI();
    init();
  } catch (e) {
    console.error(e);
    // Show the exact error on screen + load demo so the UI works
    setMessage(String(e.message));
    console.warn("Falling back to BUILTIN_DEMO");
    cfg = BUILTIN_DEMO;
    try {
      validateConfig(cfg);
      applyConfigToUI();
      init();
    } catch (ee) {
      console.error("BUILTIN_DEMO failed:", ee);
      alert("Fatal error: demo config invalid.");
    }
  }
})();
