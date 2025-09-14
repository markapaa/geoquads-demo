// ========= GeoQuads — RECOVERY build (stable, with Sound/Stats/Share wired) =========

// -- Dates / archive helpers --
const FIRST_DAILY = new Date(2025, 8, 10); // 2025-09-10 (0-based month)
const $ = (id) => document.getElementById(id);

function ymd(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
function todayStr(){return ymd(new Date());}
function yesterdayStr(){const d=new Date();d.setDate(d.getDate()-1);return ymd(d);}
function strToDate(s){const [Y,M,D]=s.split("-").map(Number);return new Date(Y,M-1,D);}
function clampArchiveBounds(dateStr){const d=strToDate(dateStr),first=FIRST_DAILY,last=strToDate(yesterdayStr());return {hasPrev:d>first,hasNext:d<last};}

// -- State --
let tiles=[]; let selected=new Set(); let solvedGroups=new Set();
let mistakes=0; let MAX_MISTAKES=4; let SHOW_ONE_AWAY=true; let cfg=null;

// -- Sound state (on/off persisted) --
let SOUND_ON = (() => {
  try { return JSON.parse(localStorage.getItem("gq-sound") ?? "true"); }
  catch { return true; }
})();
function setSoundOn(on) {
  SOUND_ON = !!on;
  localStorage.setItem("gq-sound", JSON.stringify(SOUND_ON));
  const b = document.getElementById("soundToggle");
  if (b) {
    b.setAttribute("aria-pressed", String(SOUND_ON));
    b.textContent = SOUND_ON ? "🔊 Sound" : "🔈 Sound";
  }
}
// Tiny WebAudio beeps (no files)
let _audioCtx;
function _ensureCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function beep({freq=440, dur=0.12, type="sine", gain=0.06}={}) {
  if (!SOUND_ON) return;
  const ctx = _ensureCtx();
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0);
  g.gain.setValueAtTime(gain, t0 + Math.max(0, dur - 0.04));
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  osc.stop(t0 + dur + 0.02);
}
// semantic sfx
const sfx = {
  select: () => beep({freq: 520, dur: 0.06, type: "square", gain: 0.03}),
  deselect: () => beep({freq: 360, dur: 0.05, type: "square", gain: 0.03}),
  shuffle: () => { beep({freq: 400, dur: 0.05}); setTimeout(()=>beep({freq:520,dur:0.05}),60); },
  correct: () => { beep({freq: 660, dur: 0.10, type: "triangle"}); setTimeout(()=>beep({freq:880,dur:0.10,type:"triangle"}),90); },
  wrong: () => { beep({freq: 220, dur: 0.12, type: "sawtooth"}); },
  win: () => { [880,1046,1318].forEach((f,i)=>setTimeout(()=>beep({freq:f,dur:0.1,type:"triangle"}), i*120)); }
};

// -- Built-in demo (safe fallback) --
const BUILTIN_DEMO={
  id:"builtin-demo",
  title:"GeoQuads — Demo",
  spoiler:"Think capitals vs islands vs geography lines.",
  help:"Pick 4 items per category. You have 4 mistakes.",
  lives:4, showOneAway:true,
  groups:[
    {name:"Landlocked countries",items:["Nepal","Bolivia","Switzerland","Ethiopia"]},
    {name:"Capitals starting with B",items:["Brussels","Brasilia","Bangkok","Budapest"]},
    {name:"Largest islands (by area)",items:["Greenland","New Guinea","Borneo","Madagascar"]},
    {name:"Countries crossed by the Equator",items:["Ecuador","Colombia","Kenya","Indonesia"]}
  ],
  ui:{accent:"#156064",locale:"en-US"}
};

// -- Misc helpers --
function shuffleArray(arr){const a=arr.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;}
function setMessage(text,ok=false){const el=$("message"); if(!el) return; el.textContent=text||""; el.className="msg"+(ok?" ok":"");}
function isGameOver(){return mistakes>=MAX_MISTAKES || solvedGroups.size===4;}

// -- Validation --
function normalizeLabel(s){return String(s).trim();}
function validateConfig(config){
  if(!config?.groups || config.groups.length!==4) throw new Error("Invalid quiz: must have exactly 4 groups.");
  const all=[]; for(const g of config.groups){
    if(!g.items || g.items.length!==4) throw new Error(`Invalid group "${g.name||"(no name)"}": must have exactly 4 items.`);
    g.items=g.items.map(normalizeLabel); all.push(...g.items);
  }
  const seen=new Set(); for(const label of all){ if(seen.has(label)) throw new Error(`Invalid quiz: duplicate item "${label}" across categories.`); seen.add(label); }
  return true;
}

// -- Fetch (no-store to avoid stale) --
async function tryFetchJSON(url){
  const res=await fetch(url,{cache:"no-store"}); console.log("fetch",url,res.status);
  if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try{ return await res.json(); }catch(e){ throw new Error(`JSON parse error for ${url}: ${e.message}`); }
}
async function tryFetchFirst(urls){
  for(const u of urls){ try{ return await tryFetchJSON(u); } catch(e){ console.warn("miss:",u,e.message); } }
  throw new Error("No candidate URL succeeded: "+urls.join(", "));
}

// -- Practice / Daily / Archive basic helpers --
function isPracticeActive(){ const id=new URLSearchParams(location.search).get("id"); return !!(id && id.startsWith("practice-")); }
function activeArchiveDate(){ const d=new URLSearchParams(location.search).get("date"); return d||null; }
function isArchiveActive(){ return !!activeArchiveDate(); }
function updateDailyLinkVisibility(){ const el=$("daily"); if(!el) return; el.style.display=(isPracticeActive()||isArchiveActive())?"inline":"none"; }

// Day nav
function ensureDayNav(){
  let nav = $("dayNav");
  if (nav) return nav;
  const header = document.querySelector("header");

  nav = document.createElement("div");
  nav.id = "dayNav";
  nav.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <div id="prevDay" class="linkish" style="cursor:pointer;">◀ Previous</div>
      <div id="dayLabel" class="sub"></div>
      <div id="nextDay" class="linkish" style="cursor:pointer;">Next ▶</div>
    </div>
  `;
  nav.style.margin = "6px 0 10px";
  nav.style.display = "flex";
  nav.style.justifyContent = "center";
  nav.style.alignItems = "center";

  header.parentNode.insertBefore(nav, header.nextSibling);

  $("prevDay").onclick = () => {
    const cur = activeArchiveDate(); if (!cur) return;
    const d = strToDate(cur); d.setDate(d.getDate() - 1);
    goToArchiveDate(ymd(d));
  };
  $("nextDay").onclick = () => {
    const cur = activeArchiveDate(); if (!cur) return;
    const d = strToDate(cur); d.setDate(d.getDate() + 1);
    goToArchiveDate(ymd(d));
  };
  return nav;
}

function updateDayNav(dateStr){
  const nav=ensureDayNav(), prevBtn=$("prevDay"), nextBtn=$("nextDay"), label=$("dayLabel");
  if(!dateStr){ nav.style.display="none"; return; }
  nav.style.display="flex"; // keep FLEX (not grid)
  const {hasPrev,hasNext}=clampArchiveBounds(dateStr);
  prevBtn.style.visibility=hasPrev?"visible":"hidden";
  nextBtn.style.visibility=hasNext?"visible":"hidden";
  label.textContent=`Daily: ${dateStr}`;
}

// -- Switchers (practice / daily / archive) --
async function goToArchiveDate(dateStr){
  const first=ymd(FIRST_DAILY), last=yesterdayStr();
  if(dateStr<first) dateStr=first;
  if(dateStr>last) dateStr=last;
  try{
    const newCfg=await tryFetchFirst([`${dateStr}.json`, `quizzes/${dateStr}.json`]);
    validateConfig(newCfg); cfg=newCfg;
    applyConfigToUI(dateStr); init();
    history.replaceState(null,"",`?date=${encodeURIComponent(dateStr)}`);
    setMessage(`Loaded archive daily: ${dateStr}`,true);
  }catch(e){ console.error(e); setMessage(`Couldn't load daily ${dateStr}: ${e.message}`); }
  updateDailyLinkVisibility(); updateDayNav(dateStr);
}
async function switchToQuiz(id){
  const pm=document.getElementById("practiceMenu"); if(pm){ pm.classList.remove("open"); pm.hidden=true; }
  try{
    const newCfg=await tryFetchFirst([`${id}.json`, `quizzes/${id}.json`]);
    validateConfig(newCfg); cfg=newCfg;
    applyConfigToUI(null); init();
    history.replaceState(null,"",`?id=${encodeURIComponent(id)}`);
    setMessage(`Loaded: ${cfg.title || id}`,true);
  }catch(e){ console.error(e); setMessage(`Couldn't load "${id}": ${e.message}`); }
  updateDailyLinkVisibility(); updateDayNav(null);
}
async function switchToDaily(){
  const t = todayStr();
  const y = yesterdayStr();
  try {
    const todayCfg = await tryFetchFirst([`${t}.json`, `quizzes/${t}.json`]);
    validateConfig(todayCfg); 
    cfg = todayCfg;
    applyConfigToUI(null);
    init();
    history.replaceState(null, "", location.pathname);
    setMessage(`Back to daily: ${cfg.title || t}`, true);
  } catch (eToday) {
    console.warn(`Daily not found (${t}), using yesterday (${y})`, eToday.message);
    try {
      const yCfg = await tryFetchFirst([`${y}.json`, `quizzes/${y}.json`]);
      validateConfig(yCfg);
      cfg = yCfg;
      applyConfigToUI(null);
      init();
      history.replaceState(null, "", location.pathname);
      setMessage(`Showing latest available daily (yesterday)`, true);
    } catch (eY) {
      console.warn(`Yesterday also missing; falling back to practice-easy.`, eY.message);
      await switchToQuiz("practice-easy");
      return;
    }
  }
  updateDayNav(null); // always hide in daily
  updateDailyLinkVisibility();
}

// -- Loader (id/date/auto) --
async function loadQuizConfig(){
  const params=new URLSearchParams(location.search);
  const id=params.get("id");
  const dateParam=params.get("date");

  if(id){ return await tryFetchFirst([`${id}.json`, `quizzes/${id}.json`]); }
  if(dateParam){ return await tryFetchFirst([`${dateParam}.json`, `quizzes/${dateParam}.json`]); }

  try{ return await tryFetchFirst([`${todayStr()}.json`, `quizzes/${todayStr()}.json`]); }
  catch(eToday){
    console.warn(eToday.message);
    try{ return await tryFetchFirst([`${yesterdayStr()}.json`, `quizzes/${yesterdayStr()}.json`]); }
    catch(eY){ console.warn(eY.message); }
  }
  return await tryFetchFirst(["practice-easy.json","quizzes/practice-easy.json"]);
}

// -- UI apply --
function applyConfigToUI(archiveDateStr=null){
  document.title = cfg.title || "GeoQuads";
  const locale=cfg.ui?.locale || "en-US";

  const todayEl=$("today");
  if(todayEl){
    todayEl.textContent = archiveDateStr
      ? `Daily: ${archiveDateStr}`
      : `Today: ${new Date().toLocaleDateString(locale)}`;
  }

  const helpEl=$("help");
  if(helpEl){
    helpEl.onclick=()=>alert(
      cfg.help || "Rules:\n• 16 items → 4 categories × 4 items.\n• Select 4 and press Submit.\n• You have 4 mistakes.\n• 'One away' means 3/4 are correct."
    );
  }
  const spoilerEl=$("spoiler");
  if(spoilerEl){
    spoilerEl.textContent=cfg.spoiler || "Spoiler available";
    spoilerEl.onclick=()=>{ spoilerEl.classList.toggle("revealed"); spoilerEl.classList.toggle("spoiler"); };
  }

  MAX_MISTAKES = Number.isInteger(cfg.lives) ? cfg.lives : 5;
  SHOW_ONE_AWAY = cfg.showOneAway !== false;

  const maxLivesEl=$("maxLives"); if(maxLivesEl) maxLivesEl.textContent=MAX_MISTAKES;

  // (Single calls; no duplicates, no mini-cal)
  updateDailyLinkVisibility();
  updateDayNav(archiveDateStr);
  renderHearts();
}

// -- Build / render --
function buildTiles(){ const base=[]; cfg.groups.forEach((g,gi)=>g.items.forEach((label,idx)=>base.push({label,groupIndex:gi,id:`${gi}-${idx}`}))); return shuffleArray(base); }
function renderSolvedBars(){
  const container=$("solved"); if(!container) return;
  container.innerHTML="";
  for(let gi=0; gi<cfg.groups.length; gi++){
    if(!solvedGroups.has(gi)) continue;
    const g=cfg.groups[gi];
    const bar=document.createElement("div");
    bar.className="bar group-"+gi;
    bar.innerHTML=`<div class="name">${g.name}</div><div class="items">${g.items.join(" · ")}</div>`;
    container.appendChild(bar);
  }
}
function renderGrid(){
  const grid=$("grid"); if(!grid) return;
  grid.innerHTML="";
  tiles.forEach((t,idx)=>{
    const cell=document.createElement("div");
    cell.className="cell"+(selected.has(idx)?" selected":"");
    cell.textContent=t.label; cell.tabIndex=0;
    cell.setAttribute("role","button");
    cell.setAttribute("aria-pressed", selected.has(idx)?"true":"false");
    cell.onclick=()=>toggleSelect(idx);
    cell.onkeydown=(e)=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); toggleSelect(idx); } };
    grid.appendChild(cell);
  });
  updateSubmitState();
}
function updateSubmitState(){
  const isOver=isGameOver();
  const btn=$("submitBtn"); if(btn) btn.disabled = selected.size!==4 || isOver;
  const clearBtn=$("clearBtn"); if(clearBtn) clearBtn.disabled=isOver;
  const shuffleBtn=$("shuffleBtn"); if(shuffleBtn) shuffleBtn.disabled=isOver;
  renderHearts();
}

// -- Hearts (SVG) --
function renderHearts(){
  const cont=$("hearts"); if(!cont) return;
  const total=MAX_MISTAKES, remaining=Math.max(0,total-mistakes);
  cont.innerHTML="";
  const full=`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C6.1 15.36 3 12.54 3 9.28 3 7.01 4.86 5 7.24 5c1.41 0 2.75.66 3.6 1.72.85-1.06 2.19-1.72 3.6-1.72C17.14 5 19 7.01 19 9.28c0 3.26-3.1 6.08-7.55 10.75L12 21.35z"/></svg>`;
  const empty=`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 21.35l-1.45-1.32C6.1 15.36 3 12.54 3 9.28 3 7.01 4.86 5 7.24 5c1.41 0 2.75.66 3.6 1.72.85-1.06 2.19-1.72 3.6-1.72C17.14 5 19 7.01 19 9.28c0 3.26-3.1 6.08-7.55 10.75L12 21.35z"/></svg>`;
  for(let i=0;i<total;i++){
    const span=document.createElement("span");
    span.className="heart"+(i<remaining?"":" empty");
    span.innerHTML = (i<remaining)? full : empty;
    cont.appendChild(span);
  }
}

// -- Game logic --
function toggleSelect(idx){
  if(isGameOver()) return;
  if(selected.has(idx)) { selected.delete(idx); sfx.deselect(); }
  else if(selected.size<4) { selected.add(idx); sfx.select(); }
  setMessage(""); renderGrid();
}
function clearSelection(){ selected.clear(); setMessage(""); renderGrid(); }
function shuffleTiles(){ if(isGameOver()) return; tiles=shuffleArray(tiles); selected.clear(); setMessage(""); sfx.shuffle(); renderGrid(); }
function checkSelection(){
  if(selected.size!==4 || isGameOver()) return;
  const chosen=[...selected].map(i=>tiles[i]); const g0=chosen[0].groupIndex;
  const allSame=chosen.every(c=>c.groupIndex===g0);
  if(allSame){
    sfx.correct();
    solvedGroups.add(g0); setMessage("Correct! You found a category.",true);
    const toRemove=new Set(cfg.groups[g0].items);
    tiles=tiles.filter(t=>!toRemove.has(t.label)); selected.clear();
    renderSolvedBars(); renderGrid();
    if(solvedGroups.size===4) endGame(true);
  }else{
    sfx.wrong();
    if(SHOW_ONE_AWAY && isOneAway(chosen)) setMessage("One away! You're one word off.");
    else setMessage("Not quite — try again.");
    mistakes++; selected.clear(); renderGrid();
    if(mistakes>=MAX_MISTAKES) endGame(false);
  }
}
function isOneAway(chosen){ const counts={}; chosen.forEach(c=>counts[c.groupIndex]=(counts[c.groupIndex]||0)+1); return Math.max(...Object.values(counts))===3; }
function endGame(won){
  cfg.groups.forEach((_,gi)=>{ if(!solvedGroups.has(gi)) solvedGroups.add(gi); });
  renderSolvedBars(); setMessage(won?"Great job! All categories solved.":"Game over. See the categories above."); updateSubmitState();
  updateStats(won);
  if (won) sfx.win();
}

// -- Stats (localStorage) --
const STATS_KEY = "gq-stats";
function readStats(){ try { return JSON.parse(localStorage.getItem(STATS_KEY) || "{}"); } catch { return {}; } }
function writeStats(s){ localStorage.setItem(STATS_KEY, JSON.stringify(s)); }
function updateStats(won){
  const s = readStats();
  s.played = (s.played || 0) + 1;
  if (won) {
    s.wins = (s.wins || 0) + 1;
    s.streak = (s.streak || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
  } else {
    s.streak = 0;
  }
  writeStats(s);
}
function showStats(){
  const s = readStats();
  const played = s.played || 0, wins = s.wins || 0, streak = s.streak || 0, best = s.bestStreak || 0;
  const winrate = played ? Math.round((wins/played)*100) : 0;
  alert(`Stats\n— Played: ${played}\n— Wins: ${wins} (${winrate}%)\n— Streak: ${streak}\n— Best streak: ${best}`);
}

// -- Share (Web Share API with clipboard fallback) --
async function shareResult(){
  const solved = solvedGroups.size;
  const text = `I played GeoQuads! ${solved}/4 groups, mistakes: ${mistakes}. Try today’s: ${location.origin}${location.pathname}`;
  try {
    if (navigator.share) await navigator.share({ title:"GeoQuads", text, url: location.href });
    else { await navigator.clipboard.writeText(text); setMessage("Copied result to clipboard ✅", true); }
  } catch {}
}

// -- Countdown --
function updateCountdown(){
  const el=$("countdown"); if(!el) return;
  const now=new Date(); const nextMidnight=new Date(now); nextMidnight.setHours(24,0,0,0);
  const diff=nextMidnight-now;
  const h=String(Math.floor(diff/3600000)).padStart(2,"0");
  const m=String(Math.floor((diff%3600000)/60000)).padStart(2,"0");
  const s=String(Math.floor((diff%60000)/1000)).padStart(2,"0");
  el.textContent=`${h}:${m}:${s}`;
}
setInterval(updateCountdown,1000); updateCountdown();

// -- Init --
function init(){
  tiles=buildTiles(); selected.clear(); solvedGroups.clear(); mistakes=0;
  renderSolvedBars(); renderGrid(); setMessage("");
}

// -- Bindings (mounted after DOM ready) --
function bindUI(){
  $("practice")?.addEventListener("click", ()=>{
    const m=$("practiceMenu"); if(!m) return;
    m.hidden=false; m.classList.add("open");
  });
  const pm = $("practiceMenu");
  if (pm){
    pm.addEventListener("click",(e)=>{
      const id=e.target?.dataset?.id; if(!id) return;
      if(id==="__close"){ pm.classList.remove("open"); pm.hidden=true; return; }
      switchToQuiz(id);
    });
  }

  $("daily")?.addEventListener("click", switchToDaily);
  $("archive")?.addEventListener("click", ()=>{ goToArchiveDate(yesterdayStr()); });

  $("clearBtn")?.addEventListener("click", clearSelection);
  $("shuffleBtn")?.addEventListener("click", shuffleTiles);
  $("submitBtn")?.addEventListener("click", checkSelection);

  $("stats")?.addEventListener("click", showStats);
  $("share")?.addEventListener("click", shareResult);
  const soundBtn = $("soundToggle");
  if (soundBtn){
    setSoundOn(SOUND_ON); // set initial label/state
    soundBtn.addEventListener("click", ()=> setSoundOn(!SOUND_ON));
  }

  document.addEventListener("keydown",(e)=>{
    if(e.repeat) return;
    if(e.key==="Enter") $("submitBtn")?.click();
    if(e.key==="Escape") $("clearBtn")?.click();
    if(e.key.toLowerCase()==="r") $("shuffleBtn")?.click();
  });
}

// -- Bootstrap --
(async function bootstrap(){
  try{
    bindUI();
    const params=new URLSearchParams(location.search);
    const dateParam=params.get("date");

    const loaded=await loadQuizConfig();
    validateConfig(loaded); cfg=loaded;

    applyConfigToUI(dateParam||null); init();
    updateDayNav(dateParam||null); updateDailyLinkVisibility();

    console.log("Loaded quiz config:", cfg.id || "(no id)");
  }catch(e){
    console.error(e); setMessage(String(e.message));
    console.warn("Falling back to BUILTIN_DEMO"); cfg=BUILTIN_DEMO;
    try{ validateConfig(cfg); applyConfigToUI(null); init(); updateDayNav(null); }
    catch(ee){ console.error("BUILTIN_DEMO failed:", ee); alert("Fatal error: demo config invalid."); }
  }
})();

