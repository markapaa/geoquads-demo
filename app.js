// ========= GeoQuads — Loader with Archive Navigation (ROOT JSON only) =========

// -- Constants for Archive --
const FIRST_DAILY = new Date(2025, 8, 10); // 2025-09-10 (0-based month)
function ymd(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
function todayStr(){return ymd(new Date());}
function yesterdayStr(){const d=new Date();d.setDate(d.getDate()-1);return ymd(d);}
function strToDate(s){const [Y,M,D]=s.split("-").map(Number);return new Date(Y,M-1,D);}
function clampArchiveBounds(dateStr){const d=strToDate(dateStr),first=FIRST_DAILY,last=strToDate(yesterdayStr());return{hasPrev:d>first,hasNext:d<last};}

// -- State --
let tiles=[]; let selected=new Set(); let solvedGroups=new Set();
let mistakes=0; let MAX_MISTAKES=4; let SHOW_ONE_AWAY=true; let cfg=null;

// -- Built-in demo (fallback) --
const BUILTIN_DEMO={
  id:"builtin-demo", title:"GeoQuads — Demo",
  spoiler:"Think capitals vs islands vs geography lines.",
  help:"Pick 4 items per category. You have 4 mistakes.",
  lives:4, showOneAway:true,
  groups:[
    {name:"Landlocked countries",items:["Nepal","Bolivia","Switzerland","Ethiopia"]},
    {name:"Capitals starting with B",items:["Brussels","Brasilia","Bangkok","Budapest"]},
    {name:"Largest islands (by area)",items:["Greenland","New Guinea","Borneo","Madagascar"]},
    {name:"Countries crossed by the Equator",items:["Ecuador","Colombia","Kenya","Indonesia"]}
  ],
  ui:{accent:"#4F46E5",locale:"en-US"}
};

// -- Helpers --
const $=(id)=>document.getElementById(id);
console.log("GeoQuads app.js (root-only) loaded");

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

// -- Fetch helper (ROOT only, cache-busting) --
async function tryFetchJSON(url){
  const bust=(url.includes("?")?"&":"?")+"t="+Date.now();
  const res=await fetch(url+bust,{cache:"no-store"});
  console.log("fetch",url,res.status);
  if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try { return await res.json(); }
  catch(e){ throw new Error(`JSON parse error for ${url}: ${e.message}`); }
}

// ---- Practice / Daily / Archive helpers ----
function isPracticeActive(){ const id=new URLSearchParams(location.search).get("id"); return !!(id && id.startsWith("practice-")); }
function activeArchiveDate(){ const d=new URLSearchParams(location.search).get("date"); return d||null; }
function isArchiveActive(){ return !!activeArchiveDate(); }
function updateDailyLinkVisibility(){ const el=$("daily"); if(!el) return; el.style.display=(isPracticeActive()||isArchiveActive())?"inline":"none"; }

// Create nav bar for archive (Prev | DateLabel | Next)
function ensureDayNav(){
  let nav=$("dayNav"); if(nav) return nav;
  const header=document.querySelector("header");
  nav=document.createElement("div"); nav.id="dayNav";
  nav.innerHTML=`
    <div id="prevDay" class="linkish" style="visibility:hidden;cursor:pointer;">◀ Previous</div>
    <div id="dayLabel" class="sub"></div>
    <div id="nextDay" class="linkish" style="visibility:hidden;cursor:pointer;">Next ▶</div>
  `;
  nav.style.margin="6px 0 10px"; nav.style.display="grid";
  nav.style.gridTemplateColumns="1fr auto 1fr"; nav.style.alignItems="center"; nav.style.gap="8px";
  header.parentNode.insertBefore(nav, header.nextSibling);

  $("prevDay").onclick=()=>{ const cur=activeArchiveDate(); if(!cur) return; const d=strToDate(cur); d.setDate(d.getDate()-1); goToArchiveDate(ymd(d)); };
  $("nextDay").onclick=()=>{ const cur=activeArchiveDate(); if(!cur) return; const d=strToDate(cur); d.setDate(d.getDate()+1); goToArchiveDate(ymd(d)); };
  return nav;
}
function updateDayNav(dateStr){
  const nav=ensureDayNav(), prevBtn=$("prevDay"), nextBtn=$("nextDay"), label=$("dayLabel");
  if(!dateStr){ nav.style.display="none"; return; }
  nav.style.display="grid";
  const {hasPrev,hasNext}=clampArchiveBounds(dateStr);
  prevBtn.style.visibility=hasPrev?"visible":"hidden";
  nextBtn.style.visibility=hasNext?"visible":"hidden";
  label.textContent=`Daily: ${dateStr}`;
}
async function goToArchiveDate(dateStr){
  const first=ymd(FIRST_DAILY), last=yesterdayStr();
  if(dateStr<first) dateStr=first;
  if(dateStr>last) dateStr=last;

  document.body.classList.add("loading");
  try{
    const newCfg=await tryFetchJSON(`${dateStr}.json`);
    validateConfig(newCfg); cfg=newCfg;
    applyConfigToUI(dateStr); init();
    history.replaceState(null,"",`?date=${encodeURIComponent(dateStr)}`);
    setMessage(`Loaded archive daily: ${dateStr}`,true);
  }catch(e){ console.error(e); setMessage(`Couldn't load daily ${dateStr}: ${e.message}`); }
  finally{ document.body.classList.remove("loading"); }
  updateDailyLinkVisibility(); updateDayNav(dateStr);
}

async function switchToQuiz(id){
  document.body.classList.add("loading");
  try{
    const newCfg=await tryFetchJSON(`${id}.json`);
    validateConfig(newCfg); cfg=newCfg;
    applyConfigToUI(null); init();
    history.replaceState(null,"",`?id=${encodeURIComponent(id)}`);
    setMessage(`Loaded: ${cfg.title || id}`,true);
  }catch(e){ console.error(e); setMessage(`Couldn't load "${id}": ${e.message}`); }
  finally{ document.body.classList.remove("loading"); }
  updateDailyLinkVisibility(); updateDayNav(null);
}
async function switchToDaily(){
  document.body.classList.add("loading");
  const t=todayStr(), y=yesterdayStr();
  try{
    try{
      const newCfg=await tryFetchJSON(`${t}.json`);
      validateConfig(newCfg); cfg=newCfg;
      applyConfigToUI(null); init();
      history.replaceState(null,"",location.pathname);
      setMessage(`Back to daily: ${cfg.title || t}`,true);
      updateDayNav(null);
    }catch(eToday){
      console.warn(`Daily not found (${t}), trying yesterday (${y})`);
      const newCfg=await tryFetchJSON(`${y}.json`);
      validateConfig(newCfg); cfg=newCfg;
      applyConfigToUI(y); init();
      history.replaceState(null,"",`?date=${encodeURIComponent(y)}`);
      setMessage(`Showing latest available daily: ${y}`,true);
      updateDayNav(y);
    }
  }catch(e){ console.warn(`No daily/yesterday found. Falling back to practice-easy.`, e.message); await switchToQuiz("practice-easy"); }
  finally{ document.body.classList.remove("loading"); }
  updateDailyLinkVisibility();
}

// -- Loader (id/date/auto) --
async function loadQuizConfig(){
  const params=new URLSearchParams(location.search);
  const id=params.get("id");
  const dateParam=params.get("date");

  if(id){ return await tryFetchJSON(`${id}.json`); }
  if(dateParam){ return await tryFetchJSON(`${dateParam}.json`); }

  try{ return await tryFetchJSON(`${todayStr()}.json`); }
  catch(eToday){
    console.warn(eToday.message);
    try{ return await tryFetchJSON(`${yesterdayStr()}.json`); }
    catch(eY){ console.warn(eY.message); }
  }

  return await tryFetchJSON("practice-easy.json");
}

// -- Practice Menu --
function ensurePracticeMenu(){
  let menu = document.getElementById("practiceMenu");

  // helper για show/hide
  const show = () => { if (menu) menu.style.display = "flex"; };
  const hide = () => { if (menu) menu.style.display = "none"; };

  if (menu) {
    // toggle ορατότητας
    menu.style.display = (menu.style.display === "none" || menu.style.display === "") ? "flex" : "none";
    return;
  }

  // Δημιουργία overlay
  menu = document.createElement("div");
  menu.id = "practiceMenu";
  menu.style.position = "fixed";
  menu.style.inset = "0";
  menu.style.display = "none";           // <-- αρχικά κρυφό
  menu.style.alignItems = "center";
  menu.style.justifyContent = "center";
  menu.style.background = "rgba(0,0,0,0.15)";
  menu.style.zIndex = "50";

  menu.innerHTML = `
    <div class="pmenu">
      <div style="font-weight:600;margin-bottom:6px;">Choose a practice</div>
      <button data-id="practice-easy">Practice — Easy</button>
      <button data-id="practice-hard">Practice — Hard</button>
      <button class="ghost" data-id="__close">Close</button>
    </div>
  `;
  document.body.appendChild(menu);

  // Στυλ κουτιού
  const box = menu.querySelector(".pmenu");
  box.style.background = "#fff";
  box.style.border = "1px solid #e5e7eb";
  box.style.borderRadius = "12px";
  box.style.padding = "16px";
  box.style.display = "flex";
  box.style.gap = "8px";
  box.style.flexDirection = "column";
  box.style.minWidth = "260px";
  box.style.boxShadow = "0 10px 24px rgba(0,0,0,0.08)";

  const btns = box.querySelectorAll("button");
  btns.forEach(b => {
    b.style.padding = "10px 14px";
    b.style.borderRadius = "10px";
    b.style.border = "1px solid #e5e7eb";
    b.style.background = "#fff";
    b.style.cursor = "pointer";
    b.onmouseover = () => b.style.background = "#e0e7ff";
    b.onmouseout  = () => b.style.background = "#fff";
  });

  // Κλείσιμο με click εκτός pmenu
  menu.addEventListener("click", (e) => {
    if (e.target === menu) hide();
  });

  // Clicks στα κουμπιά
  menu.addEventListener("click", (e) => {
    const id = e.target?.dataset?.id;
    if (!id) return;
    if (id === "__close") { hide(); return; }
    // Επιλογή practice -> φόρτωσε και κλείσε
    switchToQuiz(id);
    hide();
  });

  // άνοιξε τώρα
  show();
}


// -- Apply UI from cfg --
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

  MAX_MISTAKES = Number.isInteger(cfg.lives) ? cfg.lives : 4;
  SHOW_ONE_AWAY = cfg.showOneAway !== false;

  const maxLivesEl=$("maxLives");
  if(maxLivesEl) maxLivesEl.textContent=MAX_MISTAKES;

  if(cfg.ui?.accent){
    document.documentElement.style.setProperty("--accent", cfg.ui.accent);
    document.documentElement.style.setProperty("--accent-weak", "#e0e7ff");
  }

  updateDailyLinkVisibility();
  updateDayNav(archiveDateStr);
}

// -- Build / render --
const CATEGORY_COLORS = ["#7BCDBA", "#00CEC8", "#00A5A0", "#156064"];

function buildTiles(){
  const base=[]; cfg.groups.forEach((g,gi)=>g.items.forEach((label,idx)=>base.push({label,groupIndex:gi,id:`${gi}-${idx}`})));
  return shuffleArray(base);
}
function renderSolvedBars() {
  const container = $("solved");
  if (!container) return;
  container.innerHTML = "";
  [...solvedGroups].forEach((gi) => {
    const g = cfg.groups[gi];
    const bar = document.createElement("div");
    bar.className = "bar";
    // Αν το JSON έχει δικό του color → το κρατάμε, αλλιώς παίρνει από την παλέτα
    bar.style.background = g.color || CATEGORY_COLORS[gi % CATEGORY_COLORS.length];
    bar.innerHTML = `<div class="name">${g.name}</div><div class="items">${g.items.join(" · ")}</div>`;
    container.appendChild(bar);
  });
}
function renderGrid(){
  const grid=$("grid"); if(!grid) return;
  grid.innerHTML=""; tiles.forEach((t,idx)=>{
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
  const livesEl=$("mistakes"); if(livesEl) livesEl.textContent=mistakes;
}

// -- Game logic --
function toggleSelect(idx){
  if(isGameOver()) return;
  if(selected.has(idx)) selected.delete(idx); else if(selected.size<4) selected.add(idx);
  setMessage(""); renderGrid();
}
function clearSelection(){ selected.clear(); setMessage(""); renderGrid(); }
function shuffleTiles(){ if(isGameOver()) return; tiles=shuffleArray(tiles); selected.clear(); setMessage(""); renderGrid(); }
function checkSelection(){
  if(selected.size!==4 || isGameOver()) return;
  const chosen=[...selected].map(i=>tiles[i]); const g0=chosen[0].groupIndex;
  const allSame=chosen.every(c=>c.groupIndex===g0);
  if(allSame){
    solvedGroups.add(g0); setMessage("Correct! You found a category.",true);
    const toRemove=new Set(cfg.groups[g0].items);
    tiles=tiles.filter(t=>!toRemove.has(t.label)); selected.clear();
    renderSolvedBars(); renderGrid();
    if(solvedGroups.size===4) endGame(true);
  }else{
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

// Bind controls & footer links
const practiceLink=$("practice"); if(practiceLink) practiceLink.onclick=ensurePracticeMenu;
const archiveLink=$("archive"); if(archiveLink) archiveLink.onclick=()=>{ goToArchiveDate(yesterdayStr()); };
const dailyLink=$("daily"); if(dailyLink) dailyLink.onclick=switchToDaily;

const clearBtn=$("clearBtn"); if(clearBtn) clearBtn.onclick=clearSelection;
const shuffleBtn=$("shuffleBtn"); if(shuffleBtn) shuffleBtn.onclick=shuffleTiles;
const submitBtn=$("submitBtn"); if(submitBtn) submitBtn.onclick=checkSelection;

// -- Bootstrap --
(async function bootstrap(){
  try{
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


