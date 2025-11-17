// script.js — NCDC Dashboard (rebuilt core, V7)

// ========= STORAGE / CONSTANTS =========
const STORAGE_KEY = "ncdcShippingStateV7";
const BACKUP_KEY = "ncdcShippingStateV7_backup";
const MAX_UNITS_PER_TRUCK = 30000;
const MAX_CARTS_PER_TRUCK = 2600;

// ========= STATE =========
const appState = {
  version: 7,
  session: { authed: false, email: "" },
  orders: [],          // each: CSV row + derived + truckloadId
  truckloads: [],      // each: load object + orderIds[] + stagingHistory[]
  history: [],         // departed loads archive
  team: [
    {
      id: crypto.randomUUID(),
      name: "Router 1",
      email: "router@example.com",
      role: "router",
      shift: "1st",
      active: true,
      theme: "light",
      lang: "en"
    },
    {
      id: crypto.randomUUID(),
      name: "Dock Lead",
      email: "dock@example.com",
      role: "dock",
      shift: "1st",
      active: true,
      theme: "light",
      lang: "en"
    }
  ],
  settings: {
    maxLTL: 4,
    maxTL: 3,
    maxFloor: 2,
    blocks: [
      { window: "08:00am-10:00am", max: { LTL: 4, Truckload: 2, Floorload: 1 } },
      { window: "10:00am-12:00pm", max: { LTL: 4, Truckload: 2, Floorload: 1 } },
      { window: "01:00pm-03:00pm", max: { LTL: 4, Truckload: 3, Floorload: 2 } },
      { window: "03:00pm-05:00pm", max: { LTL: 4, Truckload: 3, Floorload: 2 } }
    ],
    lastHistorySweepYMD: ""
  },
  nextLoadSeq: 1
};

// ========= IndexedDB (fallback mirror, optional) =========
let _idb;

async function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("ncdcDB", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbGet(key) {
  try {
    _idb = _idb || (await idbOpen());
    return await new Promise((res, rej) => {
      const tx = _idb.transaction("state", "readonly").objectStore("state").get(key);
      tx.onsuccess = () => res(tx.result);
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key, val) {
  try {
    _idb = _idb || (await idbOpen());
    return await new Promise((res, rej) => {
      const tx = _idb.transaction("state", "readwrite").objectStore("state").put(val, key);
      tx.onsuccess = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    return false;
  }
}

// ========= UTILS =========
const $ = (id) => document.getElementById(id);
const todayYMD = () => new Date().toISOString().slice(0, 10);

function loadStateSync() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(BACKUP_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(appState, parsed);
  } catch {}
}

async function loadStateAsync() {
  const s = await idbGet(STORAGE_KEY);
  if (s) {
    Object.assign(appState, s);
    renderAll();
  }
}

function saveState() {
  try {
    const json = JSON.stringify(appState);
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(BACKUP_KEY, json);
    idbSet(STORAGE_KEY, appState);
  } catch {}
}

function mostCommon(a) {
  const c = {};
  let m = "";
  let n = 0;
  for (const v of a) {
    const k = v || "";
    c[k] = (c[k] || 0) + 1;
    if (c[k] > n) {
      n = c[k];
      m = k;
    }
  }
  return m;
}

function sumNumber(rows, col) {
  return rows.reduce(
    (s, x) => s + (+((x[col] || "").replace(/,/g, "")) || 0),
    0
  );
}

function earliestDate(a) {
  const d = a
    .map((x) => x && new Date(x))
    .filter((x) => x && x > 0);
  if (!d.length) return "";
  d.sort((a, b) => a - b);
  return d[0].toISOString().slice(0, 10);
}

function sameDate(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return x.getTime() === y.getTime();
}

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function parseYMD(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function clampDateToCancel(reco, cancel) {
  if (!cancel) return reco;
  const rc = new Date(reco);
  const cc = new Date(cancel);
  return rc > cc ? cc : rc;
}

// ========= LOGIN / NAV =========
if ($("login-btn"))
  $("login-btn").onclick = () => {
    const email = $("login-email").value.trim();
    const pass = $("login-password").value.trim();
    const ok =
      email === "htellez032003@gmail.com" &&
      pass === "Ltapaprel040523";

    if (ok) {
      appState.session = { authed: true, email };
      $("login-error").classList.add("hidden");
      $("login-screen").classList.add("hidden");
      $("app-shell").classList.remove("hidden");
      saveState();
    } else {
      $("login-error").classList.remove("hidden");
    }
  };

if ($("logout-btn"))
  $("logout-btn").onclick = () => {
    appState.session = { authed: false, email: "" };
    saveState();
    $("app-shell").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
  };

document.querySelectorAll(".nav-link").forEach((b) => {
  b.onclick = () => {
    document
      .querySelectorAll(".nav-link")
      .forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const tab = b.dataset.tab;
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) =>
        p.classList.toggle("hidden", p.id !== "tab-" + tab)
      );
    if (tab === "calendar") renderCalendar();
  };
});

// ========= SUGGESTION MODAL (kept, used for capacity / reroute hints) =========
(function ensureSuggestionModal() {
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
  $("suggest-close").onclick = () =>
    $("suggest-overlay").classList.add("hidden");
})();

// ========= SMART ROUTER MODAL =========
(function ensureAutoRouterModal() {
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
          <tr>
            <th></th><th>Proposed Load</th><th>Date</th><th>Window</th>
            <th>Carrier</th><th>POs</th><th>Units</th><th>Cartons</th><th>Fill %</th><th>Notes</th>
          </tr>
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
  $("auto-cancel").onclick = () =>
    $("auto-overlay").classList.add("hidden");
})();

// Add "Auto-Route Orders" button in Orders toolbar
(function injectAutoButton() {
  const bar = document.querySelector(".orders-toolbar .selected-box");
  if (!bar || document.getElementById("auto-route-btn")) return;
  const btn = document.createElement("button");
  btn.id = "auto-route-btn";
  btn.className = "btn tiny";
  btn.textContent = "Auto-Route Orders";
  btn.onclick = onAutoRouteClicked;
  bar.appendChild(btn);
})();

// ========= CSV UPLOAD (MERGE, not wipe) =========
if ($("orders-csv"))
  $("orders-csv").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const text = ev.target.result;
      const incoming = parseCSVRobust(text).map((o) =>
        computeOrderDerived(o)
      );
      mergeOrders(incoming
