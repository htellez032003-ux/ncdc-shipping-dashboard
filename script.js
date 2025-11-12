// script.js — NCDC Dashboard (persistent + smart router)

// ========= STORAGE / LIMITS =========
const STORAGE_KEY = "ncdcShippingStateV5";
const MAX_UNITS_PER_TRUCK = 30000;
const MAX_CARTS_PER_TRUCK = 2600;

// ========= STATE =========
const appState = {
  session: { authed: false, email: "" },
  orders: [],
  truckloads: [],
  history: [],
  team: [
    { id: crypto.randomUUID(), name: "Router 1", email: "router@example.com", role: "router", shift: "1st", active: true, theme: "light", lang: "en" },
    { id: crypto.randomUUID(), name: "Dock Lead", email: "dock@example.com", role: "dock", shift: "1st", active: true, theme: "light", lang: "en" }
  ],
  settings: {
    maxLTL: 4, maxTL: 3, maxFloor: 2,
    blocks: [
      { window: "08:00am-10:00am", max: { LTL: 4, Truckload: 2, Floorload: 1 } },
      { window: "10:00am-12:00pm", max: { LTL: 4, Truckload: 2, Floorload: 1 } },
      { window: "01:00pm-03:00pm", max: { LTL: 4, Truckload: 3, Floorload: 2 } },
      { window: "03:00pm-05:00pm", max: { LTL: 4, Truckload: 3, Floorload: 2 } }
    ],
    lastHistorySweepYMD: ""
  }
};

// ========= IndexedDB (mirror) =========
let _idb;
async function idbOpen(){
  return new Promise((res,rej)=>{
    const r = indexedDB.open("ncdcDB", 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore("state");
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error);
  });
}
async function idbGet(key){
  try{
    _idb = _idb || await idbOpen();
    return await new Promise((res,rej)=>{
      const tx=_idb.transaction("state","readonly").objectStore("state").get(key);
      tx.onsuccess=()=>res(tx.result); tx.onerror=()=>rej(tx.error);
    });
  }catch{ return null; }
}
async function idbSet(key,val){
  try{
    _idb = _idb || await idbOpen();
    return await new Promise((res,rej)=>{
      const tx=_idb.transaction("state","readwrite").objectStore("state").put(val,key);
      tx.onsuccess=()=>res(true); tx.onerror=()=>rej(tx.error);
    });
  }catch{ return false; }
}

// ========= UTILS =========
const $ = id => document.getElementById(id);
const todayYMD = () => new Date().toISOString().slice(0,10);
function loadStateSync(){ try{ Object.assign(appState, JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")); }catch{} }
async function loadStateAsync(){ const s = await idbGet(STORAGE_KEY); if(s){ Object.assign(appState, s); renderAll(); } }
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); idbSet(STORAGE_KEY, appState); }catch{} }
function mostCommon(a){const c={};let m="",n=0;for(const v of a){const k=v||"";c[k]=(c[k]||0)+1;if(c[k]>n){n=c[k];m=k}}return m;}
function sumNumber(rows, col){return rows.reduce((s,x)=>s+(+((x[col]||"").replace(/,/g,""))||0),0);}
function earliestDate(a){const d=a.map(x=>x&&new Date(x)).filter(x=>x&&x>0);if(!d.length)return"";d.sort((a,b)=>a-b);return d[0].toISOString().slice(0,10);}
function sameDate(a,b){const x=new Date(a),y=new Date(b);x.setHours(0,0,0,0);y.setHours(0,0,0,0);return x.getTime()===y.getTime();}
function ymd(d){return new Date(d).toISOString().slice(0,10);}
function parseYMD(str){ if(!str) return null; const d=new Date(str); return isNaN(d)?null:d; }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function clampDateToCancel(reco, cancel){ if(!cancel) return reco; const rc=new Date(reco), cc=new Date(cancel); return rc>cc?cc:rc; }

// ========= LOGIN / NAV =========
if ($("login-btn")) $("login-btn").onclick = () => {
  const email = $("login-email").value.trim();
  const pass = $("login-password").value.trim();
  const ok = email==="htellez032003@gmail.com" && pass==="Ltapaprel040523";
  if (ok){
    appState.session = { authed:true, email };
    $("login-error").classList.add("hidden");
    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    saveState();
  } else {
    $("login-error").classList.remove("hidden");
  }
};
if ($("logout-btn")) $("logout-btn").onclick = () => {
  appState.session = { authed:false, email:"" };
  saveState();
  $("app-shell").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
};

document.querySelectorAll(".nav-link").forEach(b => b.onclick = () => {
  document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  const tab = b.dataset.tab;
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-"+tab));
  if (tab==="calendar") renderCalendar();
});

// Auto-login if session persisted
(function bootAuth(){
  if(appState.session?.authed){
    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
  }
})();

// ========= SUGGESTION MODAL =========
(function ensureSuggestionModal(){
  if (document.getElementById("suggest-overlay")) return;
  const wrap = document.createElement("div");
  wrap.id = "suggest-overlay";
  wrap.className = "modal-overlay hidden";
  wrap.innerHTML = `
    <div class="modal">
      <h3>Routing Suggestions</h3>
      <div id="suggest-message" class="muted" style="margin-bottom:8px;"></div>
      <div id="suggest-existing"></div>
      <hr/>
      <h4>Available Time Slots</h4>
      <div id="suggest-slots" class="slots-grid"></div>
      <div class="modal-actions">
        <button id="suggest-apply" class="btn primary tiny">Apply Recommendation</button>
        <button id="suggest-close" class="btn secondary tiny">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  $("suggest-close").onclick = ()=> $("suggest-overlay").classList.add("hidden");
})();

// ========= AUTO-ROUTER MODAL =========
(function ensureAutoRouterModal(){
  if (document.getElementById("auto-overlay")) return;
  const wrap = document.createElement("div");
  wrap.id = "auto-overlay";
  wrap.className = "modal-overlay hidden";
  wrap.innerHTML = `
    <div class="modal">
      <h3>Auto-Route Proposal</h3>
      <div id="auto-summary" class="muted" style="margin-bottom:8px;"></div>
      <table class="data-table" id="auto-table">
        <thead>
          <tr><th></th><th>Proposed Load</th><th>Date</th><th>Window</th><th>Carrier</th><th>POs</th><th>Units</th><th>Cartons</th><th>Fill %</th><th>Notes</th></tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="modal-actions">
        <button id="auto-confirm-all" class="btn primary tiny">Confirm All</button>
        <button id="auto-confirm-selected" class="btn tiny">Confirm Selected</button>
        <button id="auto-cancel" class="btn secondary tiny">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  $("auto-cancel").onclick = ()=> $("auto-overlay").classList.add("hidden");
})();

// Add Auto-Route button in Orders toolbar
(function injectAutoButton(){
  const bar = document.querySelector(".orders-toolbar .selected-box");
  if(!bar || document.getElementById("auto-route-btn")) return;
  const btn = document.createElement("button");
  btn.id = "auto-route-btn";
  btn.className = "btn tiny";
  btn.textContent = "Auto-Route Orders";
  btn.onclick = onAutoRouteClicked;
  bar.appendChild(btn);
})();

// ========= CSV UPLOAD (robust parser + MERGE) =========
if ($("orders-csv")) $("orders-csv").addEventListener("change", e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const text = ev.target.result;
    const incoming = parseCSVRobust(text).map(o => computeOrderDerived(o));
    mergeOrders(incoming); // merge, do not wipe
    buildTruckloadsFromOrders();
    hydrateFilterColumnDropdown();
    $("csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
    renderAll(); saveState();
  };
  r.readAsText(f);
});

// RFC4180-ish CSV
function parseCSVRobust(text){
  const rows=[]; let row=[], val="", q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='\"'){ if(q && text[i+1]==='\"'){ val+='\"'; i++; } else { q=!q; } }
    else if(ch===',' && !q){ row.push(val); val=""; }
    else if((ch==='\n'||ch==='\r') && !q){
      if(val.length||row.length){ row.push(val); rows.push(row); row=[]; val=""; }
      if(ch==='\r' && text[i+1]==='\n') i++;
    } else val+=ch;
  }
  if(val.length||row.length){ row.push(val); rows.push(row); }
  const header = rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.some(c=>String(c).trim()!=="")).map(r=>{
    const o={}; header.forEach((h,i)=>o[h]= (r[i]??"").trim()); return o;
  });
}

// ========= PERSISTENT ORDERS MERGE =========
function mergeOrders(newRows){
  const keyFor = o => (o["PO Num"]||"").trim() ||
                      ((o["BOL#"]||"").trim()+"|"+(o["Cust Name"]||"").trim()+"|"+(o["TTL QTY"]||"").trim());
  const map = new Map(appState.orders.map(o=>[keyFor(o), o]));
  for(const nr of newRows){
    const k = keyFor(nr);
    if(map.has(k)){
      const cur = map.get(k);
      const kept = { Router: cur.Router, "Scheduled Date": cur["Scheduled Date"], "Author#": cur["Author#"], "PT STATUS": cur["PT STATUS"] };
      const merged = { ...cur, ...nr, ...kept };
      map.set(k, computeOrderDerived(merged));
    } else {
      map.set(k, computeOrderDerived(nr));
    }
  }
  appState.orders = [...map.values()];
}

// ========= DERIVED ORDER LOGIC =========
function computeOrderDerived(o){
  const nUnits = +String(o["TTL QTY"]||0).toString().replace(/,/g,"") || 0;
  const nCarts = +String(o["Est. Cartons"]||0).toString().replace(/,/g,"") || 0;
  o.__units = nUnits;
  o.__cartons = nCarts;

  const pickProc = parseYMD(o["Pick Proc Date"]);
  const startD   = parseYMD(o["Start Date"]);
  const cancelD  = parseYMD(o["Cancel Date"]);

  let shipBy;
  if (pickProc && startD && pickProc > startD) shipBy = addDays(pickProc, 3);
  else if (startD && cancelD) shipBy = startD < cancelD ? startD : cancelD;
  else shipBy = startD || cancelD || pickProc || new Date();

  o.__shipBy = ymd(shipBy);
  o.__recommendedShip = cancelD ? ymd(clampDateToCancel(shipBy, cancelD)) : o.__shipBy;

  const t = new Date(todayYMD());
  const sb = parseYMD(o.__shipBy);
  o.__priority = (sb <= t) ? "HIGH" : (sb <= addDays(t,1)) ? "MEDIUM" : "LOW";

  return o;
}

// ========= BUILD LOADS FROM ORDERS (baseline) =========
function buildTruckloadsFromOrders(){
  const manual = appState.truckloads.filter(t=>!t.autoGenerated);
  const auto = [];

  const withAuth = appState.orders.filter(o => (o["Author#"]||"").trim());
  const byAuth = new Map();
  withAuth.forEach(o => {
    const k = o["Author#"].trim();
    if(!byAuth.has(k)) byAuth.set(k, []);
    byAuth.get(k).push(o);
  });
  for(const [loadId, rows] of byAuth){
    auto.push(buildLoadFromRows({ loadId, rows, loadTypeHint: "Truckload" }));
  }

  const noAuth = appState.orders.filter(o => !(o["Author#"]||"").trim());
  const byLTL = new Map();
  noAuth.forEach(o=>{
    const k = (o["Shipper"]||"").trim()+"||"+(o["Ready Date"]||"").trim();
    if(!byLTL.has(k)) byLTL.set(k,[]);
    byLTL.get(k).push(o);
  });
  for(const [k, rows] of byLTL){
    auto.push(buildLoadFromRows({ loadId: "LTL-"+k, rows, loadTypeHint: "LTL" }));
  }

  appState.truckloads = [...manual, ...auto];
}

function buildLoadFromRows({loadId, rows, loadTypeHint}){
  const customer = mostCommon(rows.map(r=>r["Cust Name"]||""));
  const carrier = mostCommon(rows.map(r=>r["Shipper"]||""));
  const pickupDate = earliestDate(rows.map(r=>r["Ready Date"]||""));
  const bolCommon = mostCommon(rows.map(r=>r["BOL#"]||""));
  const cartons = sumNumber(rows, "Est. Cartons");
  const pallets = sumNumber(rows, "Est. Pallet");
  const weight = sumNumber(rows, "Total Weight");
  const cube = sumNumber(rows, "Total Cubic");
  const masterGroups = buildMasterGroups(rows);

  return {
    loadId, autoGenerated: true,
    loadType: loadTypeHint || "Truckload",
    customer, carrier,
    pickupDate, pickupWindow: "",
    bol: bolCommon, cartons, pallets, weight, cube,
    stagedLocation: "", assignedTo: [], actualPallets: 0, loadedBy: [],
    status: "Unstaged", departed: false, masterGroups
  };
}

function buildMasterGroups(rows){
  const byM = new Map();
  rows.forEach(r=>{
    const m = (r["Master BOL#"]||"").trim();
    if(!byM.has(m)) byM.set(m,[]);
    byM.get(m).push(r);
  });
  const groups=[];
  for(const [m, rs] of byM){
    const byB = new Map();
    rs.forEach(r=>{
      const b = (r["BOL#"]||"").trim();
      if(!byB.has(b)) byB.set(b,[]);
      byB.get(b).push(r);
    });
    const bols=[];
    for(const [b, bs] of byB){
      bols.push({
        bol: b,
        pos: bs.map(x=>({ po: x["PO Num"], customer: x["Cust Name"], cartons: +(x["Est. Cartons"]||0), pallets: +(x["Est. Pallet"]||0) }))
      });
    }
    groups.push({ masterBol: m, bols });
  }
  return groups;
}

// ========= FILTER UI (Orders) =========
const dynamicFilters = [];
function hydrateFilterColumnDropdown(){
  const sel = $("orders-col-filter");
  if(!sel) return;
  const headers = Array.from(document.querySelectorAll("#orders-head th")).map(th=>th.textContent.trim()).slice(1);
  sel.innerHTML = headers.map(h=>`<option value="${h}">${h}</option>`).join("");
}
if ($("add-col-filter")) $("add-col-filter").onclick = () => {
  const col = $("orders-col-filter").value;
  const val = $("orders-col-value").value.trim();
  if(!col || !val) return;
  dynamicFilters.push({col, value: val});
  $("orders-col-value").value="";
  renderActiveFilters(); renderOrders();
};
if ($("clear-filters")) $("clear-filters").onclick = () => { dynamicFilters.length=0; $("orders-search").value=""; renderActiveFilters(); renderOrders(true); };
function renderActiveFilters(){
  const box = $("active-filters"); if(!box) return;
  box.innerHTML = dynamicFilters.map((f,i)=>`<span class="chip">${f.col} = "${f.value}" <button data-del="${i}" class="chip-x">×</button></span>`).join("");
  box.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{ dynamicFilters.splice(+b.dataset.del,1); renderActiveFilters(); renderOrders(); });
}

// ========= ORDERS RENDER =========
let filteredOrders = [];
const selectedPOs = new Set();

function renderOrders(reset=false){
  if(reset) filteredOrders = appState.orders.slice();
  const tb = $("orders-body"); if(!tb) return;
  const q = ($("orders-search")?.value||"").toLowerCase();

  filteredOrders = appState.orders.filter(o=>{
    const quick = Object.values(o).some(v => String(v||"").toLowerCase().includes(q));
    if(!quick) return false;
    for(const f of dynamicFilters){ if(String(o[f.col]||"") !== f.value) return false; }
    return true;
  });

  tb.innerHTML="";
  filteredOrders.forEach(o=>{
    const po = o["PO Num"]||"";
    const tr = document.createElement("tr");
    const dueClass = o.__priority==="HIGH" ? "row-danger" : o.__priority==="MEDIUM" ? "row-warn" : "";
    tr.className = dueClass;
    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${po}" ${selectedPOs.has(po)?"checked":""}></td>
      <td>${o["Division"]||""}</td><td>${o["BOL#"]||""}</td><td>${o["Master BOL#"]||""}</td>
      <td>${po}</td><td>${o["Customer"]||""}</td><td>${o["Cust Name"]||""}</td><td>${o["Shipper"]||""}</td>
      <td>${o["TTL QTY"]||""}</td><td>${o["TTL Amt"]||""}</td>
      <td>${o["Total Weight"]||""}</td><td>${o["Total Cubic"]||""}</td>
      <td>${o["Est. Cartons"]||""}</td><td>${o["Est. Pallet"]||""}</td>
      <td>${o["Pick Proc Date"]||""}</td><td>${o["Start Date"]||""}</td><td>${o["Cancel Date"]||""}</td>
      <td>${o["Router"]||""}</td><td>${o["Route Date"]||""}</td><td>${o["Scheduled Date"]||""}</td>
      <td>${o["Ready Date"]||""}</td><td>${o["Author#"]||""}</td><td>${o["PT STATUS"]||""}</td><td></td>
    `;
    tr.title = `Ship By: ${o.__shipBy} • Recommended: ${o.__recommendedShip} • Priority: ${o.__priority}`;
    tb.appendChild(tr);
  });

  document.querySelectorAll(".po-check").forEach(chk=>{
    chk.onchange = e => {
      const po = e.target.dataset.po;
      if(e.target.checked) selectedPOs.add(po); else selectedPOs.delete(po);
      $("selected-count").textContent = selectedPOs.size;
      saveState();
    };
  });
  $("selected-count").textContent = selectedPOs.size;

  const sel = $("assign-existing-load");
  if (sel){
    sel.innerHTML = `<option value="">Assign to existing load...</option>` +
      appState.truckloads.map(t=>`<option value="${t.loadId}">${t.loadId} — ${t.customer||""}</option>`).join("");
  }
}
if ($("orders-search")) $("orders-search").oninput = () => renderOrders();

// select-all
if ($("select-all-orders")) $("select-all-orders").onchange = e => {
  const checked = e.target.checked;
  document.querySelectorAll("#orders-body .po-check").forEach(chk=>{
    chk.checked = checked;
    const po = chk.dataset.po;
    if (checked) selectedPOs.add(po); else selectedPOs.delete(po);
  });
  $("selected-count").textContent = selectedPOs.size;
  saveState();
};

// ========= CAPACITY + SLOTS HELPERS =========
function capacityCheck(load, rows){
  const unitsNow = rows.reduce((s,r)=> s + (r.__units||0), 0);
  const cartsNow = rows.reduce((s,r)=> s + (r.__cartons||0), 0);
  const loadUnits = 0; // unknown historic; enforce by cartons + per-truck units
  const loadCarts = +load.cartons || 0;
  const unitsOK = (loadUnits + unitsNow) <= MAX_UNITS_PER_TRUCK;
  const cartsOK = (loadCarts + cartsNow) <= MAX_CARTS_PER_TRUCK;
  return { unitsOK, cartsOK, unitsNow, cartsNow };
}
function getSlotLimit(window, loadType){
  const block = appState.settings.blocks.find(b=>b.window===window);
  if (block) return block.max[loadType] ?? (loadType==="LTL"?appState.settings.maxLTL:loadType==="Truckload"?appState.settings.maxTL:appState.settings.maxFloor);
  return loadType==="LTL"?appState.settings.maxLTL:loadType==="Truckload"?appState.settings.maxTL:appState.settings.maxFloor;
}
function getSlotUsage(dateYMD, window, loadType){
  return appState.truckloads.filter(l =>
    l.pickupDate === dateYMD &&
    l.loadType === loadType &&
    ((l.pickupWindow||"").trim() || "(unspecified)") === (window||"(unspecified)")
  ).length;
}
function buildMasterGroupsFromOrders(rows){ return buildMasterGroups(rows); }

// ========= MERGE INTO EXISTING LOAD =========
function mergeRowsIntoLoad(t, rows){
  const merged = buildMasterGroupsFromOrders(rows);
  merged.forEach(m=>{
    let mg = t.masterGroups.find(x=>x.masterBol===m.masterBol);
    if(!mg){ t.masterGroups.push(m); }
    else {
      m.bols.forEach(nb=>{
        let b = mg.bols.find(x=>x.bol===nb.bol);
        if(!b) mg.bols.push(nb);
        else b.pos = [...b.pos, ...nb.pos];
      });
    }
  });
  t.cartons += sumNumber(rows,"Est. Cartons");
  t.pallets += sumNumber(rows,"Est. Pallet");
  t.weight  += sumNumber(rows,"Total Weight");
  t.cube    += sumNumber(rows,"Total Cubic");
}

// ========= SUGGESTION MODAL FLOW =========
let _suggestContext = null;
function showSuggestionModal({reason, rows, targetLoad}){
  const overlay = $("suggest-overlay");
  const msg = $("suggest-message");
  const exDiv = $("suggest-existing");
  const slotDiv = $("suggest-slots");

  const commonCarrier = mostCommon(rows.map(r=>r["Shipper"]||""));
  const recoDate = earliestDate(rows.map(r=>r.__recommendedShip));
  const candidates = appState.truckloads.map(t=>{
    const cap = capacityCheck(t, rows);
    const score = (t.carrier===commonCarrier?1:0) + (t.pickupDate===recoDate?2:0) + ((cap.unitsOK&&cap.cartsOK)?2:-5);
    return { load:t, cap, score };
  }).sort((a,b)=>b.score-a.score).filter(c=>c.cap.unitsOK && c.cap.cartsOK).slice(0,3);

  const unitsSel = rows.reduce((s,r)=>s+(r.__units||0),0);
  const cartsSel = rows.reduce((s,r)=>s+(r.__cartons||0),0);
  msg.textContent = `${reason} • Selected: ${unitsSel.toLocaleString()} units, ${cartsSel.toLocaleString()} cartons • Target date ${recoDate||"-"}`;

  exDiv.innerHTML = candidates.length ? `
      <h4>Top existing trucks</h4>
      <table class="data-table"><thead><tr><th></th><th>Load ID</th><th>Date</th><th>Window</th><th>Carrier</th><th>Cartons Now</th></tr></thead>
      <tbody>${candidates.map((c,i)=>`
        <tr>
          <td><input type="radio" name="recoLoad" value="${c.load.loadId}" ${i===0?"checked":""}></td>
          <td>${c.load.loadId}</td><td>${c.load.pickupDate||""}</td><td>${c.load.pickupWindow||""}</td>
          <td>${c.load.carrier||""}</td><td>${(c.load.cartons||0).toLocaleString()}</td>
        </tr>`).join("")}</tbody></table>` : `<h4>No compatible existing trucks found.</h4>`;

  const loadType = "Truckload";
  const windows = appState.settings.blocks.length ? appState.settings.blocks.map(b=>b.window) : ["(unspecified)"];
  slotDiv.innerHTML = windows.map(w=>{
    const used = getSlotUsage(recoDate, w, loadType);
    const lim = getSlotLimit(w, loadType);
    const can = used < lim;
    return `<label class="slot-pill ${can?"":"slot-full"}">
      <input type="radio" name="slotPick" value="${w}" ${can && !candidates.length ? "checked":""} ${can?"":"disabled"}>
      <span>${w}</span><span class="muted"> ${used}/${lim}</span></label>`;
  }).join("");

  _suggestContext = { rows, recoDate, loadType, targetLoadId: targetLoad?.loadId || null };
  overlay.classList.remove("hidden");
}
if ($("suggest-apply")) $("suggest-apply").onclick = () => {
  if (!_suggestContext) { $("suggest-overlay").classList.add("hidden"); return; }
  const rows = _suggestContext.rows;
  const selectedExisting = document.querySelector("input[name='recoLoad']:checked");
  if (selectedExisting){
    const t = appState.truckloads.find(x=>x.loadId===selectedExisting.value);
    if (t){
      const cap = capacityCheck(t, rows);
      if (!(cap.unitsOK && cap.cartsOK)){ alert("Selected truck no longer fits."); }
      else { mergeRowsIntoLoad(t, rows); }
    }
    $("suggest-overlay").classList.add("hidden");
    renderAll(); saveState();
    return;
  }
  const slot = document.querySelector("input[name='slotPick']:checked");
  const pickWin = slot ? slot.value : "(unspecified)";
  const id = "LOAD-"+(appState.truckloads.length+1);
  const base = buildLoadFromRows({ loadId:id, rows, loadTypeHint:"Truckload" });
  base.autoGenerated = false;
  base.pickupDate = _suggestContext.recoDate || base.pickupDate;
  base.pickupWindow = pickWin;
  base.carrier = mostCommon(rows.map(r=>r["Shipper"]||"")) || base.carrier;
  appState.truckloads.push(base);
  $("suggest-overlay").classList.add("hidden");
  renderAll(); saveState();
};

// ========= ASSIGN POs TO EXISTING LOAD (with safety net) =========
if ($("assign-pos-to-load")) $("assign-pos-to-load").onclick = () => {
  const id = $("assign-existing-load").value; if(!id || selectedPOs.size===0) return;
  const t = appState.truckloads.find(x=>x.loadId===id); if(!t) return;
  const rows = appState.orders.filter(o => selectedPOs.has(o["PO Num"]||""));
  const cap = capacityCheck(t, rows);
  const schedMismatch = false;
  if (!cap.unitsOK || !cap.cartsOK || schedMismatch){
    showSuggestionModal({
      reason: !cap.cartsOK ? "Capacity exceeded for selected truck" : "Schedule conflict detected",
      rows, targetLoad: t
    });
    return;
  }
  mergeRowsIntoLoad(t, rows);
  renderAll(); saveState();
};

// ========= CREATE TRUCKLOAD (prefill + validation) =========
if ($("create-truckload-btn")) $("create-truckload-btn").onclick = () => {
  if (!selectedPOs.size){ alert("Select at least one PO."); return; }
  $("modal-selected-pos").textContent = "POs: " + [...selectedPOs].join(", ");
  const rows = appState.orders.filter(o => selectedPOs.has(o["PO Num"]||""));
  const recoDate = earliestDate(rows.map(r=>r.__recommendedShip));
  $("tl-load-id").value = "LOAD-"+(appState.truckloads.length+1);
  $("tl-load-type").value = "Truckload";
  $("tl-pickup-date").value = recoDate || "";
  $("tl-pickup-window").value = "";
  $("tl-carrier").value = mostCommon(rows.map(r=>r["Shipper"]||""));
  $("tl-customer").value = mostCommon(rows.map(r=>r["Cust Name"]||""));
  $("tl-bol").value = mostCommon(rows.map(r=>r["BOL#"]||""));
  $("tl-cartons").value = rows.reduce((s,r)=>s+(r.__cartons||0),0);
  $("tl-pallets").value = sumNumber(rows,"Est. Pallet");
  $("modal-overlay").classList.remove("hidden");
};
if ($("tl-cancel")) $("tl-cancel").onclick = () => $("modal-overlay").classList.add("hidden");
if ($("tl-save")) $("tl-save").onclick = () => {
  const id = $("tl-load-id").value.trim() || "LOAD-"+(appState.truckloads.length+1);
  const rows = appState.orders.filter(o => selectedPOs.has(o["PO Num"]||""));
  const base = buildLoadFromRows({ loadId: id, rows, loadTypeHint: $("tl-load-type").value });
  base.autoGenerated = false;
  base.pickupDate = $("tl-pickup-date").value || base.pickupDate;
  base.pickupWindow = $("tl-pickup-window").value.trim();
  base.carrier = $("tl-carrier").value.trim() || base.carrier;
  base.customer = $("tl-customer").value.trim() || base.customer;
  base.bol = $("tl-bol").value.trim() || base.bol;

  const used = getSlotUsage(base.pickupDate, base.pickupWindow, base.loadType);
  const lim = getSlotLimit(base.pickupWindow, base.loadType);
  const cartsSel = rows.reduce((s,r)=>s+(r.__cartons||0),0);
  const cartsOK = cartsSel <= MAX_CARTS_PER_TRUCK;
  const withinSlots = used < lim;
  if (!cartsOK || !withinSlots){
    showSuggestionModal({
      reason: !withinSlots ? `No slots left for ${base.loadType} at ${base.pickupWindow}` :
                             `Carton capacity would exceed ${MAX_CARTS_PER_TRUCK}`,
      rows
    });
    return;
  }
  appState.truckloads.push(base);
  $("modal-overlay").classList.add("hidden");
  renderAll(); saveState();
};

// ========= SMART AUTO-ROUTER ENGINE (center-aware) =========
function onAutoRouteClicked(){
  const useSelected = selectedPOs.size>0;
  const rows = useSelected
    ? appState.orders.filter(o => selectedPOs.has(o["PO Num"]||""))
    : filteredOrders.slice();

  if (!rows.length){ alert("No orders selected or visible."); return; }

  const proposals = buildAutoProposals(rows);
  renderAutoModal(proposals);
}

/* core grouping */
function buildAutoProposals(rows){
  const sorted = [...rows].sort((a,b)=>{
    const p = (a.__priority==="HIGH"?0:a.__priority==="MEDIUM"?1:2) -
              (b.__priority==="HIGH"?0:b.__priority==="MEDIUM"?1:2);
    if (p!==0) return p;
    return (a.__recommendedShip||"").localeCompare(b.__recommendedShip||"");
  });

  const blocks = appState.settings.blocks.length ? appState.settings.blocks.map(b=>b.window) : ["(unspecified)"];
  const proposals = [];
  let nextLoadNum = appState.truckloads.length + 1;

  // split by direct-store vs center
  const direct = sorted.filter(r => !(r["Center"]||"").trim());
  const centers = sorted.filter(r => (r["Center"]||"").trim());

  // center groups: Center + Customer + Carrier
  const byCenter = new Map();
  centers.forEach(r=>{
    const key = (r["Center"]||"").trim()+"|"+(r["Cust Name"]||"").trim()+"|"+(r["Shipper"]||"").trim();
    if(!byCenter.has(key)) byCenter.set(key,[]);
    byCenter.get(key).push(r);
  });

  for (const [key, list] of byCenter){
    const [center,cust,carrier] = key.split("|");
    let idx=0;
    while(idx<list.length){
      let date=list[idx].__recommendedShip;
      let windowPick=null;
      for(const w of blocks){
        if(getSlotUsage(date,w,"Truckload")<getSlotLimit(w,"Truckload")){windowPick=w;break;}
      }
      if(!windowPick){
        let d=new Date(date);let tries=0;
        while(!windowPick && tries<7){d.setDate(d.getDate()+1);date=ymd(d);
          for(const w of blocks){if(getSlotUsage(date,w,"Truckload")<getSlotLimit(w,"Truckload")){windowPick=w;break;}}
          tries++;
        }
        if(!windowPick) windowPick=blocks[0];
      }
      const pack=[];let u=0,c=0;
      while(idx<list.length){
        const r=list[idx];
        const fits=(u+(r.__units||0)<=MAX_UNITS_PER_TRUCK)&&(c+(r.__cartons||0)<=MAX_CARTS_PER_TRUCK);
        if(!fits && pack.length>0) break;
        pack.push(r);u+=r.__units||0;c+=r.__cartons||0;idx++;
        if(u>=MAX_UNITS_PER_TRUCK||c>=MAX_CARTS_PER_TRUCK)break;
      }
      const fill=Math.min((c/MAX_CARTS_PER_TRUCK)*100,(u/MAX_UNITS_PER_TRUCK)*100);
      proposals.push({
        id:`AUTO-${center}-${nextLoadNum++}`,
        type:"center",
        center,customer:cust,carrier,
        date,window:windowPick,
        rows:pack,units:u,cartons:c,fill:Math.round(fill)
      });
    }
  }

  // direct-store: solo; Amazon always solo
  direct.forEach(r=>{
    const isAmazon=String(r["Cust Name"]||"").toLowerCase().includes("amazon");
    const po=r["PO Num"]||crypto.randomUUID().slice(0,6);
    const id=`AUTO-STORE-${po}`;
    const date=r.__recommendedShip;
    let win=null;
    for(const w of blocks){if(getSlotUsage(date,w,"Truckload")<getSlotLimit(w,"Truckload")){win=w;break;}}
    if(!win)win=blocks[0];
    proposals.push({
      id,
      type:"store",
      store:r["Store"]||"",
      carrier:r["Shipper"]||"",
      customer:r["Cust Name"]||"",
      date,window:win,
      rows:[r],
      units:r.__units||0,cartons:r.__cartons||0,fill:Math.round(((r.__cartons||0)/MAX_CARTS_PER_TRUCK)*100),
      amazon:isAmazon
    });
  });

  return proposals;
}

/* modal render + confirm */
function renderAutoModal(proposals){
  const tb=document.querySelector("#auto-table tbody");
  tb.innerHTML=proposals.map(p=>{
    const warn=p.type==="center"?"⚠️ Master BOL Needed":p.amazon?"🟡 Amazon Solo":"";
    return `<tr class="${p.type==='center'?'row-warn':''}">
      <td><input type="checkbox" class="auto-pick" data-id="${p.id}" ${p.fill>=60?"checked":""}></td>
      <td>${p.id}</td>
      <td>${p.date}</td>
      <td>${p.window}</td>
      <td>${p.carrier||""}</td>
      <td>${p.rows.length}</td>
      <td>${p.units.toLocaleString()}</td>
      <td>${p.cartons.toLocaleString()}</td>
      <td>${p.fill}%</td>
      <td>${warn}</td>
    </tr>`;
  }).join("");

  const uTot=proposals.reduce((s,p)=>s+p.units,0);
  const cTot=proposals.reduce((s,p)=>s+p.cartons,0);
  $("auto-summary").textContent=`Proposed loads: ${proposals.length} • Total Units ${uTot.toLocaleString()} • Total Cartons ${cTot.toLocaleString()}`;

  $("auto-overlay").classList.remove("hidden");

  $("auto-confirm-all").onclick=()=>confirmAutoProposals(proposals);
  $("auto-confirm-selected").onclick=()=>{
    const ids=[...document.querySelectorAll(".auto-pick:checked")].map(x=>x.dataset.id);
    confirmAutoProposals(proposals.filter(p=>ids.includes(p.id)));
  };
}
function confirmAutoProposals(proposals){
  if(!proposals.length){$("auto-overlay").classList.add("hidden");return;}
  for(const p of proposals){
    const base=buildLoadFromRows({loadId:p.id,rows:p.rows,loadTypeHint:"Truckload"});
    base.autoGenerated=false;
    base.pickupDate=p.date;
    base.pickupWindow=p.window;
    base.carrier=p.carrier||base.carrier;
    base.customer=p.customer||base.customer;
    if(p.type==="center"){ base.status="⚠ Master BOL Required"; }
    appState.truckloads.push(base);
  }
  $("auto-overlay").classList.add("hidden");
  saveState(); renderAll();
}

// ========= DOCK RENDER / EDIT =========
function renderDock(){
  const tb = $("dock-body"); if(!tb) return;
  const q = ($("dock-search")?.value||"").toLowerCase();
  tb.innerHTML = "";

  const loads = [...appState.truckloads].sort((a,b)=> (a.pickupDate||"") < (b.pickupDate||"") ? -1 : 1);
  loads.filter(t=>{
    if(!q) return true;
    return [t.loadId,t.customer,t.carrier,t.loadType,t.pickupDate,t.pickupWindow,t.stagedLocation,(t.assignedTo||[]).join(", "),t.status]
      .some(v=>String(v||"").toLowerCase().includes(q));
  }).forEach(t=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.customer||""}</td>
      <td>${t.carrier||""}</td>
      <td>${t.loadType||""}</td>
      <td>${t.pickupDate||""}</td>
      <td>${t.pickupWindow||""}</td>
      <td>${t.cartons||0}</td>
      <td>${t.pallets||0}</td>
      <td><input class="cell-input" data-bind="actualPallets" data-id="${t.loadId}" type="number" min="0" value="${t.actualPallets||0}"></td>
      <td><input class="cell-input" data-bind="stagedLocation" data-id="${t.loadId}" value="${t.stagedLocation||""}"></td>
      <td>
        <input class="cell-input" data-bind="assignedTo" data-id="${t.loadId}" placeholder="Type names... (comma separated)" value="${(t.assignedTo||[]).join(", ")}">
      </td>
      <td>${t.status||""}</td>
      <td>
        <button class="btn tiny" data-assign="${t.loadId}">Start</button>
        <button class="btn tiny secondary" data-stage="${t.loadId}">Fully Staged</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll(".cell-input").forEach(inp=>{
    inp.onchange = () => {
      const t = appState.truckloads.find(x=>x.loadId===inp.dataset.id); if(!t) return;
      const key = inp.dataset.bind;
      if (key==="assignedTo") t[key] = inp.value.split(",").map(s=>s.trim()).filter(Boolean);
      else if (key==="actualPallets") t[key] = +inp.value||0;
      else t[key] = inp.value;
      saveState();
    };
  });

  tb.querySelectorAll("[data-assign]").forEach(b=>b.onclick=()=>{
    const t=appState.truckloads.find(x=>x.loadId===b.dataset.assign); if(!t) return;
    t.status="Being staged"; saveState(); renderAll();
  });
  tb.querySelectorAll("[data-stage]").forEach(b=>b.onclick=()=>{
    const t=appState.truckloads.find(x=>x.loadId===b.dataset.stage); if(!t) return;
    t.status="Fully staged"; saveState(); renderAll();
  });
}
if ($("dock-search")) $("dock-search").oninput = ()=>renderDock();
if ($("dock-clear")) $("dock-clear").onclick = ()=>{ $("dock-search").value=""; renderDock(); };

// ========= TODAY'S PICKUPS =========
function renderTodays(){
  const tb = $("today-body"); if(!tb) return;
  tb.innerHTML = "";
  const today = todayYMD();
  const loads = appState.truckloads.filter(t=>t.pickupDate && sameDate(t.pickupDate, today));

  loads.sort((a,b)=>{
    const p = a.status==="At door" ? -1 : a.status==="Departed" ? 1 : 0;
    const q = b.status==="At door" ? -1 : b.status==="Departed" ? 1 : 0;
    return p-q;
  }).forEach(t=>{
    const tr=document.createElement("tr");
    tr.className = t.status==="At door" ? "row-arrived" : t.status==="Departed" ? "row-departed" : "";
    tr.innerHTML = `
      <td>${t.loadId}</td><td>${t.customer||""}</td><td>${t.carrier||""}</td><td>${t.loadType||""}</td>
      <td>${t.pickupWindow||""}</td><td>${t.cartons||0}</td>
      <td><input class="cell-input" data-bind="loadedBy" data-id="${t.loadId}" placeholder="Comma separated" value="${(t.loadedBy||[]).join(", ")}"></td>
      <td>${t.status||""}</td>
      <td><button class="btn tiny" data-arrived="${t.loadId}">Arrived</button></td>
      <td><button class="btn tiny secondary" data-departed="${t.loadId}">Departed</button></td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("[data-arrived]").forEach(b=>b.onclick=()=>{
    const t=appState.truckloads.find(x=>x.loadId===b.dataset.arrived); if(!t)return;
    t.status="At door"; saveState(); renderTodays(); renderTruckloads();
  });
  tb.querySelectorAll("[data-departed]").forEach(b=>b.onclick=()=>{
    const t=appState.truckloads.find(x=>x.loadId===b.dataset.departed); if(!t)return;
    t.status="Departed"; t.departed=true;
    appState.history.push({ loadId:t.loadId, customer:t.customer, carrier:t.carrier, pickupDate:t.pickupDate, pickupWindow:t.pickupWindow, status:"Departed" });
    saveState(); renderTodays(); renderHistory(); renderTruckloads();
  });

  tb.querySelectorAll(".cell-input[data-bind='loadedBy']").forEach(inp=>{
    inp.onchange=()=>{ const t=appState.truckloads.find(x=>x.loadId===inp.dataset.id); if(!t)return; t.loadedBy=inp.value.split(",").map(s=>s.trim()).filter(Boolean); saveState(); };
  });
}

// ========= TRUCKLOADS + DRILL-DOWN =========
function renderTruckloads(){
  const tb = $("truckloads-body"); if(!tb) return;
  tb.innerHTML = "";
  appState.truckloads.forEach(t => {
    const tr = document.createElement("tr");
    tr.className = "tl-row";
    tr.dataset.id = t.loadId;

    const needsMaster = String(t.status || "").includes("Master BOL");
    const badge = needsMaster ? `<span class="badge badge-warn" title="Master BOL Required">⚠</span>` : "";

    tr.innerHTML = `
      <td>${t.loadId} ${badge}</td>
      <td>${t.customer || ""}</td>
      <td>${t.carrier || ""}</td>
      <td>${t.loadType || ""}</td>
      <td>${t.pickupDate || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons || 0}</td>
      <td>${t.status || ""}</td>
    `;
    tb.appendChild(tr);
  });

  document.querySelectorAll(".tl-row").forEach(row => row.onclick = () => {
    const id = row.dataset.id;
    const load = appState.truckloads.find(t => t.loadId === id);
    if (!load) return;

    const body = $("tl-detail-body");
    body.innerHTML = load.masterGroups.map(m =>
      `<div class="mb"><strong>Master BOL:</strong> ${m.masterBol || "(none)"}<ul class="ul-compact">` +
      m.bols.map(bl => `<li><strong>${bl.bol || "(no BOL)"}:</strong> ${bl.pos.map(p => p.po).join(", ")}</li>`).join("") +
      `</ul></div>`
    ).join("");

    $("tl-detail-title").textContent = `${load.loadId} — ${load.customer||""}`;

    $("ed-load-id").value = load.loadId||"";
    $("ed-pickup-date").value = load.pickupDate||"";
    $("ed-pickup-window").value = load.pickupWindow||"";
    $("ed-carrier").value = load.carrier||"";
    $("ed-customer").value = load.customer||"";

    $("tl-detail-overlay").classList.remove("hidden");

    $("tl-detail-close").onclick = () => $("tl-detail-overlay").classList.add("hidden");
    $("tl-detail-save").onclick = () => {
      load.loadId = $("ed-load-id").value.trim() || load.loadId;
      load.pickupDate = $("ed-pickup-date").value;
      load.pickupWindow = $("ed-pickup-window").value.trim();
      load.carrier = $("ed-carrier").value.trim();
      load.customer = $("ed-customer").value.trim();
      saveState(); renderAll();
      $("tl-detail-overlay").classList.add("hidden");
    };
  });
}

// ========= HISTORY =========
function renderHistory(){
  const tb=$("history-body"); if(!tb) return; tb.innerHTML="";
  const q = ($("history-search")?.value||"").toLowerCase();
  appState.history.filter(h=>{
    if(!q) return true;
    return [h.loadId,h.customer,h.carrier,h.pickupDate,h.pickupWindow,h.status].some(v=>String(v||"").toLowerCase().includes(q));
  }).forEach(h=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${h.loadId}</td><td>${h.customer||""}</td><td>${h.carrier||""}</td><td>${h.pickupDate||""}</td><td>${h.pickupWindow||""}</td><td>${h.status}</td>`;
    tr.onclick = () => {
      const fakeRow = document.querySelector(`.tl-row[data-id="${h.loadId}"]`);
      if(fakeRow) fakeRow.click();
    };
    tb.appendChild(tr);
  });
}
if ($("history-search")) $("history-search").oninput=()=>renderHistory();
if ($("history-clear")) $("history-clear").onclick=()=>{ $("history-search").value=""; renderHistory(); };

// ========= METRICS =========
function renderMetrics(){
  const month = new Date().toISOString().slice(0,7);
  const mLoads = appState.truckloads.filter(t=> (t.pickupDate||"").startsWith(month)).length;
  const totalCartons = appState.truckloads.reduce((s,t)=>s+(t.cartons||0),0);
  const staged = appState.truckloads.filter(t=>t.status==="Fully staged").length;
  if ($("m-total-loads")) $("m-total-loads").textContent=mLoads;
  if ($("m-cartons")) $("m-cartons").textContent=totalCartons;
  if ($("m-staged")) $("m-staged").textContent=staged;
}

// ========= CALENDAR =========
let calAnchor = new Date();
function dateAdd(d,days){const x=new Date(d);x.setDate(x.getDate()+days);return x;}
function fmtTitle(d){return d.toLocaleString(undefined,{month:"long",year:"numeric"});}

function renderCalendar(){
  const grid = $("calendar-grid"); if(!grid) return;
  const view = $("cal-view")?.value || "month";
  const filter = ($("cal-filter")?.value||"").toLowerCase();

  let start, days;
  const dow = (calAnchor.getDay()+6)%7;
  if(view==="wk"){ start = dateAdd(calAnchor, -dow); days = 7; }
  else if(view==="2w"){ start = dateAdd(calAnchor, -dow); days = 14; }
  else { const mStart = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1); const lead=(mStart.getDay()+6)%7; start=dateAdd(mStart,-lead); days=42; }

  $("cal-title").textContent = fmtTitle(calAnchor);
  grid.innerHTML="";

  for(let i=0;i<days;i++){
    const day = dateAdd(start, i);
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.dataset.date = ymd(day);
    cell.innerHTML = `<div class="cal-cell-head">${day.getDate()}</div><div class="cal-cell-body"></div>`;
    cell.ondragover = ev => ev.preventDefault();
    cell.ondrop = ev => {
      ev.preventDefault();
      const loadId = ev.dataTransfer.getData("text/plain");
      const t = appState.truckloads.find(x=>x.loadId===loadId);
      if(!t) return;
      const targetDate = cell.dataset.date;
      const win = (t.pickupWindow||"").trim() || "(unspecified)";
      const limit = getSlotLimit(win, t.loadType);
      const same = appState.truckloads.filter(l => l.pickupDate === targetDate && l.loadType === t.loadType && ((l.pickupWindow||"").trim() || "(unspecified)") === win);
      if (same.length >= limit){
        showSuggestionModal({ reason:`Move blocked. Time block "${win}" on ${targetDate} is full`, rows: [] });
        return;
      }
      t.pickupDate = targetDate;
      saveState(); renderAll();
    };

    const items = appState.truckloads.filter(t=>t.pickupDate && sameDate(t.pickupDate, day))
      .filter(t=> !filter || (t.customer||"").toLowerCase().includes(filter) || (t.carrier||"").toLowerCase().includes(filter));

    const body = cell.querySelector(".cal-cell-body");
    items.forEach(t=>{
      const chip=document.createElement("div");
      chip.className="cal-chip";
      chip.draggable=true;
      chip.ondragstart=(ev)=>ev.dataTransfer.setData("text/plain", t.loadId);
      const time = t.pickupWindow ? `${t.pickupWindow} | ` : "";
      chip.textContent = `${time}${t.customer||""} | ${t.carrier||""}`;
      chip.title = `${t.loadId}\n${t.pickupDate} ${t.pickupWindow||""}\n${t.customer||""} | ${t.carrier||""}`;
      chip.onclick = ()=>{
        const row = document.querySelector(`.tl-row[data-id="${t.loadId}"]`);
        if(row) row.click();
      };
      body.appendChild(chip);
    });

    grid.appendChild(cell);
  }
}
if ($("cal-prev")) $("cal-prev").onclick=()=>{ const v=$("cal-view").value; calAnchor = v==="wk"?dateAdd(calAnchor,-7):v==="2w"?dateAdd(calAnchor,-14):new Date(calAnchor.getFullYear(), calAnchor.getMonth()-1, 1); renderCalendar(); };
if ($("cal-next")) $("cal-next").onclick=()=>{ const v=$("cal-view").value; calAnchor = v==="wk"?dateAdd(calAnchor,7):v==="2w"?dateAdd(calAnchor,14):new Date(calAnchor.getFullYear(), calAnchor.getMonth()+1, 1); renderCalendar(); };
if ($("cal-view")) $("cal-view").onchange=renderCalendar;
if ($("cal-filter")) $("cal-filter").oninput=renderCalendar;

// ========= SETTINGS: Clear Saved Data =========
(function injectClearButton(){
  const settings = document.querySelector("#tab-settings .pane-header");
  if(!settings || document.getElementById("clear-saved-btn")) return;
  const b = document.createElement("button");
  b.id="clear-saved-btn"; b.className="btn small danger"; b.textContent="Clear Saved Data";
  b.onclick = ()=>{
    if(confirm("This will remove all saved state on this browser.")){
      localStorage.removeItem(STORAGE_KEY);
      indexedDB.deleteDatabase("ncdcDB");
      location.reload();
    }
  };
  settings.appendChild(b);
})();

// ========= NIGHTLY HISTORY ARCHIVAL =========
function sweepHistoryIfMidnight(){
  const localYmd = todayYMD();
  if (appState.settings.lastHistorySweepYMD === localYmd) return;
  appState.truckloads.filter(t=>t.status==="Departed" && t.pickupDate && t.pickupDate < localYmd).forEach(t=>{
    if(!appState.history.find(h=>h.loadId===t.loadId)) appState.history.push({ loadId:t.loadId, customer:t.customer, carrier:t.carrier, pickupDate:t.pickupDate, pickupWindow:t.pickupWindow, status:"Departed" });
  });
  appState.settings.lastHistorySweepYMD = localYmd; saveState(); renderHistory();
}
setInterval(sweepHistoryIfMidnight, 60*1000);

// ========= RENDER ALL =========
function renderAll(){ renderOrders(true); renderTruckloads(); renderDock(); renderTodays(); renderHistory(); renderMetrics(); }
loadStateSync();
appState.orders = (appState.orders||[]).map(o => o.__shipBy ? o : computeOrderDerived(o));
renderAll();
loadStateAsync();
sweepHistoryIfMidnight();
