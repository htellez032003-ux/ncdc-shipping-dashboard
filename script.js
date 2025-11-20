// NCDC Shipping Dashboard - script.js
// Version: Final Fix - Includes 'Cust Name' and 'Author#' mapping

/* ========= CONSTANTS ========= */
const STORAGE_KEY = "ncdcShippingState_VLT10";
const MAX_UNITS_PER_TRUCK = 30000;
const MAX_CARTS_PER_TRUCK = 2600;

const TIME_BLOCKS = [
  { window: "08:00-10:00", label: "8am-10am" },
  { window: "10:00-12:00", label: "10am-12pm" },
  { window: "12:00-14:00", label: "12pm-2pm" },
  { window: "14:00-16:00", label: "2pm-4pm" },
  { window: "16:00-18:00", label: "4pm-6pm" }
];

const USER_ROLES = {
  admin:      { label: "Admin",      permissions: ["all"] },
  router:     { label: "Router",     permissions: ["orders", "truckloads", "calendar", "metrics", "history"] },
  dock:       { label: "Dock Lead",  permissions: ["dock", "todays", "truckloads", "history"] },
  supervisor: { label: "Supervisor", permissions: ["all"] }
};

// Generate staging locations
const SL_LANES = [];
for (let i = 18; i <= 220; i++) SL_LANES.push(`SL${i}A`);
for (let i = 18; i <= 99; i++) SL_LANES.push(`SL${i}B`);
for (let i = 18; i <= 25; i++) SL_LANES.push(`SL${i}C`);

const DD_DOORS = [];
for (let i = 2; i <= 6; i++) DD_DOORS.push(`DD${i}`);
for (let i = 12; i <= 73; i++) DD_DOORS.push(`DD${i}`);

/* ========= STATE ========= */
const appState = {
  session: { authed: false, email: "", role: "admin" },
  orders: [],
  truckloads: [],
  history: [],
  changeLog: [],
  alerts: [],
  savedFilters: [],
  settings: {
    customerRules: [],
    centerPatterns: [],
    maxLTLPerDay: 999,
    maxTLPerDay: 999,
    maxFloorPerDay: 999
  }
};

// UI state
const selectedPOs = new Set();
const selectedTrucks = new Set();
const dynamicFilters = [];
let filteredOrders = [];
let autoProposals = [];
let calAnchor = new Date();

/* ========= UTILITIES ========= */
const $ = (id) => document.getElementById(id);
const todayYMD = () => new Date().toISOString().slice(0, 10);

function parseYMD(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function ymd(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDate(a, b) {
  if (!a || !b) return false;
  const d1 = typeof a === "string" ? new Date(a) : a;
  const d2 = typeof b === "string" ? new Date(b) : b;
  return d1.toDateString() === d2.toDateString();
}

function sumNumber(arr, field) {
  return arr.reduce((s, item) => s + (parseFloat(item[field]) || 0), 0);
}

function mostCommon(arr) {
  if (!arr || arr.length === 0) return "";
  const counts = {};
  for (const v of arr) {
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return "";
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function earliestDate(dates) {
  const list = dates
    .map(d => (d ? new Date(d) : null))
    .filter(d => d && !isNaN(d));
  if (list.length === 0) return todayYMD();
  return ymd(new Date(Math.min(...list.map(d => d.getTime()))));
}

function isSPSCarrier(carrier) {
  if (!carrier) return false;
  const c = carrier.toUpperCase();
  return ["FXB", "WEB", "UPS", "EST", "OPR"].includes(c);
}

function timeOverlaps(time1, time2) {
  if (!time1 || !time2) return false;
  // Expect "HH:MM-HH:MM"
  const [s1, e1] = time1.split("-").map(t => parseInt(t.replace(":", ""), 10));
  const [s2, e2] = time2.split("-").map(t => parseInt(t.replace(":", ""), 10));
  return !(e1 <= s2 || e2 <= s1);
}

/* ========= STATE MANAGEMENT ========= */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // shallow merge; keep structure
    appState.session = saved.session || appState.session;
    appState.orders = saved.orders || [];
    appState.truckloads = saved.truckloads || [];
    appState.history = saved.history || [];
    appState.changeLog = saved.changeLog || [];
    appState.alerts = saved.alerts || [];
    appState.savedFilters = saved.savedFilters || [];
    appState.settings = { ...appState.settings, ...(saved.settings || {}) };
    
    // Ensure arrays exist on trucks
    appState.truckloads.forEach(t => {
      if (!Array.isArray(t.orders)) t.orders = t.orders ? [...t.orders] : [];
      if (!Array.isArray(t.stagingLog)) t.stagingLog = [];
    });
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

function logChange(action, details = {}) {
  appState.changeLog.unshift({
    id: `log-${Date.now()}`,
    action,
    details,
    timestamp: new Date().toISOString(),
    user: appState.session.email || "unknown"
  });
  if (appState.changeLog.length > 1000) {
    appState.changeLog = appState.changeLog.slice(0, 1000);
  }
}

function checkAlerts() {
  const alerts = [];
  const today = new Date(todayYMD());

  // High-priority unassigned
  const highUnassigned = appState.orders.filter(
    o => o.__priority === "HIGH" && !o["Load ID"]
  );
  if (highUnassigned.length > 0) {
    alerts.push({
      id: `alert-high-${Date.now()}`,
      type: "error",
      message: `${highUnassigned.length} HIGH priority orders are not assigned to a load.`,
      timestamp: new Date().toISOString()
    });
  }

  // Today’s trucks not staged
  const todaysUnstaged = appState.truckloads.filter(
    t => sameDate(t.pickupDate, today) && t.status !== "Departed" && t.status !== "Fully Staged"
  );
  if (todaysUnstaged.length > 0) {
    alerts.push({
      id: `alert-unstaged-${Date.now()}`,
      type: "warning",
      message: `${todaysUnstaged.length} trucks for today are not fully staged.`,
      timestamp: new Date().toISOString()
    });
  }

  // Over capacity
  const overCap = appState.truckloads.filter(t => (t.cartons || 0) > MAX_CARTS_PER_TRUCK);
  if (overCap.length > 0) {
    alerts.push({
      id: `alert-overcap-${Date.now()}`,
      type: "warning",
      message: `${overCap.length} trucks are over carton capacity (${MAX_CARTS_PER_TRUCK}).`,
      timestamp: new Date().toISOString()
    });
  }

  appState.alerts = alerts;
  updateAlertsBadge();
}

function updateAlertsBadge() {
  const badge = $("alerts-badge");
  const count = $("alerts-count");
  if (!badge || !count) return;
  if (appState.alerts.length === 0) {
    badge.classList.add("hidden");
  } else {
    badge.classList.remove("hidden");
    count.textContent = appState.alerts.length;
  }
}

/* ========= AUTH ========= */
function handleLogin() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value.trim();
  const role = $("login-role").value;

  if (!email || !password) {
    $("login-error").classList.remove("hidden");
    return;
  }

  appState.session = { authed: true, email, role };
  saveState();

  $("login-screen").classList.add("hidden");
  $("app-shell").classList.remove("hidden");
  updateUserDisplay();
  applyRolePermissions();
  renderAll();
  checkAlerts();
}

function handleLogout() {
  appState.session = { authed: false, email: "", role: "admin" };
  saveState();
  $("app-shell").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
}

function updateUserDisplay() {
  if ($("current-user-display")) $("current-user-display").textContent = appState.session.email || "";
  if ($("current-role-badge")) {
    $("current-role-badge").textContent =
      USER_ROLES[appState.session.role]?.label || "";
  }
}

function applyRolePermissions() {
  const perms = USER_ROLES[appState.session.role]?.permissions || [];
  const hasAll = perms.includes("all");

  document.querySelectorAll(".nav-link").forEach(btn => {
    const tab = btn.dataset.tab;
    const allowed =
      hasAll ||
      perms.includes(tab) ||
      tab === "team" ||
      tab === "settings" ||
      tab === "appointments"; 

    btn.style.display = allowed ? "block" : "none";
  });
}

function setupNavigation() {
  const firstVisible = [];
  document.querySelectorAll(".nav-link").forEach(btn => {
    if (btn.style.display !== "none") firstVisible.push(btn);
    btn.onclick = () => {
      document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => {
        p.classList.toggle("hidden", p.id !== "tab-" + tab);
      });

      if (tab === "calendar") renderCalendar();
      if (tab === "metrics") renderMetrics();
      if (tab === "discrepancies") renderDiscrepancies();
    };
  });
  // default to first visible tab
  if (firstVisible[0]) firstVisible[0].click();
}

/* ========= CSV UPLOAD / PARSE ========= */

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h =>
    h.trim().replace(/^"|"$/g, "")
  );

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cells = raw.split(","); 
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] || "").trim().replace(/^"|"$/g, "");
    });
    rows.push(obj);
  }
  return rows;
}

function normalizeOrder(o) {
  const po = o.PO || o["PO Num"] || "";
  const customer = o.Customer || o["Cust Name"] || "";
  const customerName = o["Cust Name"] || ""; // Capture the full name
  const carrier = o.Carrier || o.Shipper || "";
  const bol = o.BOL || o["BOL#"] || "";
  const masterBol = o["Master BOL"] || o["Master BOL#"] || "";
  const unitsRaw = o.Units || o["TTL QTY"] || "";
  const cartonsRaw = o.Cartons || o["Packed Cartons"] || o["Est. Cartons"] || "";
  const weightRaw = o.Weight || o["Total Weight"] || "";

  const cleanNumber = (val) =>
    parseFloat(String(val || "").replace(/,/g, "")) || 0;

  const units = cleanNumber(unitsRaw);
  const cartons = cleanNumber(cartonsRaw);
  const weight = cleanNumber(weightRaw);

  const startDate = o["Start Date"] || "";
  const cancelDate = o["Cancel Date"] || "";
  const readyDate = o["Ready Date"] || "";
  const readyTime = o["Ready Time"] || "";
  const authorLoadId = o["Author#"] || "";

  const order = {
    ...o,
    PO: po,
    Customer: customer,
    "Cust Name": customerName, // Add key for full name
    Carrier: carrier,
    BOL: bol,
    "Master BOL": masterBol,
    Units: units,
    Cartons: cartons,
    Weight: weight,
    "Start Date": startDate,
    "Cancel Date": cancelDate,
    "Ready Date": readyDate,
    "Ready Time": readyTime
  };

  // Map Author# to Load ID if missing
  if (!order["Load ID"] && authorLoadId) {
    order["Load ID"] = authorLoadId;
  }

  order.__units = units;
  order.__cartons = cartons;

  // Date Parsing helper (handles 11/7/2025 style)
  const parseUSDate = (str) => {
    if(!str) return null;
    const parts = str.split("/");
    if(parts.length === 3) return new Date(parts[2], parts[0]-1, parts[1]);
    return new Date(str);
  };

  const start = parseUSDate(startDate);
  const cancel = parseUSDate(cancelDate);
  const ready = parseUSDate(readyDate);

  let shipBy = ready || start || cancel || new Date(todayYMD());
  order.__shipBy = ymd(shipBy);

  if (cancel && shipBy > cancel) {
    order.__recommendedShip = ymd(cancel);
  } else {
    order.__recommendedShip = order.__shipBy;
  }

  const today = new Date(todayYMD());
  const sb = parseYMD(order.__shipBy);
  if (sb <= today) order.__priority = "HIGH";
  else if (sb <= addDays(today, 1)) order.__priority = "MEDIUM";
  else order.__priority = "LOW";

  order.__isSPS = isSPSCarrier(carrier || o.Shipper);

  return order;
}

function mergeOrdersFromCSV(newRows) {
  if (!newRows || newRows.length === 0) return;
  const keyFor = (o) =>
    (o.PO || o["PO Num"] || "").trim() ||
    `${o.BOL || o["BOL#"] || ""}|${o.Customer || o["Cust Name"] || ""}|${o.Units || o["TTL QTY"] || ""}`;

  const map = new Map();
  appState.orders.forEach(o => {
    map.set(keyFor(o), o);
  });

  newRows.forEach(raw => {
    const normalized = normalizeOrder(raw);
    const key = keyFor(normalized);
    if (map.has(key)) {
      const existing = map.get(key);
      const merged = {
        ...existing,
        ...normalized,
        "Ready Date": existing["Ready Date"] || normalized["Ready Date"],
        "Load ID": existing["Load ID"] || normalized["Load ID"]
      };
      map.set(key, normalizeOrder(merged)); 
    } else {
      map.set(key, normalized);
    }
  });

  appState.orders = [...map.values()];
}

function rebuildTruckloadsFromOrders() {
  const byLoad = new Map();

  appState.orders.forEach(o => {
    const loadId = (o["Load ID"] || "").trim();
    if (!loadId) return;
    if (!byLoad.has(loadId)) byLoad.set(loadId, []);
    byLoad.get(loadId).push(o);
  });

  const preserved = appState.truckloads.filter(
    t => !byLoad.has(t.loadId)
  );
  const rebuilt = [];

  for (const [loadId, orders] of byLoad.entries()) {
    const customer = mostCommon(orders.map(o => o.Customer));
    const carrier = mostCommon(orders.map(o => o.Carrier || o.Shipper));
    const pickupDate = earliestDate(orders.map(o => o["Ready Date"] || o["Start Date"] || o["Cancel Date"]));
    const loadType = "Truckload";

    const cartons = sumNumber(orders, "__cartons");
    const units = sumNumber(orders, "__units");
    const weight = sumNumber(orders, "Weight");

    rebuilt.push({
      loadId,
      loadType,
      customer,
      carrier,
      pickupDate,
      pickupWindow: TIME_BLOCKS[0].window,
      bol: mostCommon(orders.map(o => o.BOL)),
      masterBol: mostCommon(orders.map(o => o["Master BOL"])),
      cartons,
      units,
      weight,
      stagedLocationSL: "",
      stagedLocationDD: "",
      status: "Not Started",
      departed: false,
      orders: orders.map(o => o.PO),
      stagingLog: [{
        ts: new Date().toISOString(),
        action: "Rebuilt from CSV",
        user: "system",
        note: `${orders.length} orders`
      }],
      createdAt: new Date().toISOString()
    });
  }

  appState.truckloads = [...preserved, ...rebuilt];
}

function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const rows = parseCSV(text);
    mergeOrdersFromCSV(rows);
    rebuildTruckloadsFromOrders();
    
    $("csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
    logChange("CSV Uploaded", { rows: rows.length });
    
    saveState();
    
    // Force update of filters now that data exists
    initOrdersFilters();
    
    renderAll();
    checkAlerts();
  };
  reader.readAsText(file);
}

/* ========= ORDERS RENDERING & FILTERS ========= */

function initOrdersFilters() {
  const colSel = $("orders-col-filter");
  if (!colSel) return;
  
  colSel.innerHTML = "";
  const cols = new Set();

  // Use first order to find keys if available
  if (appState.orders.length > 0) {
    Object.keys(appState.orders[0]).forEach(k => {
      if (!k.startsWith("__")) {
        cols.add(k);
      }
    });
  } else {
    ["PO", "Customer", "Cust Name", "Carrier", "BOL", "Master BOL", "Start Date", "Cancel Date", "Load ID"].forEach(c => cols.add(c));
  }

  const sortedCols = Array.from(cols).sort();

  sortedCols.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    colSel.appendChild(opt);
  });

  renderActiveFilters();
  populateSavedFiltersDropdown();
}

function renderActiveFilters() {
  const container = $("active-filters");
  if (!container) return;
  container.innerHTML = "";
  dynamicFilters.forEach((f, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${f.col} = "${f.value}"</span>
      <button type="button" data-idx="${idx}" class="chip-remove">×</button>
    `;
    container.appendChild(chip);
  });

  container.querySelectorAll(".chip-remove").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx, 10);
      dynamicFilters.splice(idx, 1);
      renderOrders();
      renderActiveFilters();
    };
  });
}

function populateSavedFiltersDropdown() {
  const sel = $("saved-filters");
  if (!sel) return;
  sel.innerHTML = `<option value="">Load saved filter...</option>`;
  appState.savedFilters.forEach((f, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = f.name || `Filter ${idx + 1}`;
    sel.appendChild(opt);
  });
}

function saveCurrentFilter() {
  if (dynamicFilters.length === 0) {
    alert("No active column filters to save.");
    return;
  }
  const name = prompt("Name this filter:");
  if (!name) return;
  appState.savedFilters.push({
    name,
    rules: JSON.parse(JSON.stringify(dynamicFilters))
  });
  saveState();
  populateSavedFiltersDropdown();
}

function loadSavedFilter() {
  const sel = $("saved-filters");
  if (!sel) return;
  const idx = parseInt(sel.value, 10);
  if (isNaN(idx)) return;
  const preset = appState.savedFilters[idx];
  if (!preset) return;
  dynamicFilters.length = 0;
  preset.rules.forEach(r => dynamicFilters.push({ ...r }));
  renderActiveFilters();
  renderOrders();
}

function addColumnFilter() {
  const col = $("orders-col-filter").value;
  const val = $("orders-col-value").value.trim();
  if (!col || !val) return;
  dynamicFilters.push({ col, value: val });
  $("orders-col-value").value = "";
  renderActiveFilters();
  renderOrders();
}

function clearAllFilters() {
  dynamicFilters.length = 0;
  if ($("orders-search")) $("orders-search").value = "";
  renderActiveFilters();
  renderOrders();
}

function applyQuickFilter(type) {
  dynamicFilters.length = 0;
  if ($("orders-search")) $("orders-search").value = "";

  if (type === "high") {
    dynamicFilters.push({ col: "__priority", value: "HIGH" });
    renderActiveFilters();
    renderOrders();
    return;
  }

  if (type === "unassigned") {
    const unassigned = appState.orders.filter(o => !o["Load ID"]);
    renderOrdersFiltered(unassigned);
    return;
  }

  if (type === "today") {
    dynamicFilters.push({ col: "__shipBy", value: todayYMD() });
    renderActiveFilters();
    renderOrders();
    return;
  }
}

function renderOrders() {
  const tb = $("orders-body");
  if (!tb) return;

  const q = ($("orders-search")?.value || "").toLowerCase();

  filteredOrders = appState.orders.filter(o => {
    // quick search
    if (q) {
      const ok = Object.values(o).some(v =>
        String(v || "").toLowerCase().includes(q)
      );
      if (!ok) return false;
    }
    // dynamic filters - Trim strings for safety
    for (const f of dynamicFilters) {
      if (String(o[f.col] || "").trim() !== f.value) return false;
    }
    return true;
  });

  tb.innerHTML = "";

  filteredOrders.forEach(o => {
    const po = o.PO || o["PO Num"] || "";
    const row = document.createElement("tr");
    const rowClass =
      o.__priority === "HIGH" ? "row-danger" :
      o.__priority === "MEDIUM" ? "row-warn" : "";
    row.className = rowClass;

    const priorityBadge = `<span class="priority-badge priority-${(o.__priority || "low").toLowerCase()}">${o.__priority || "LOW"}</span>`;
    const spsBadge = o.__isSPS ? `<span class="sps-badge">SPS</span>` : "";

    row.innerHTML = `
      <td>
        <input type="checkbox" class="po-check" data-po="${po}" ${selectedPOs.has(po) ? "checked" : ""}>
      </td>
      <td>${po}</td>
      <td>${o.Customer || ""}</td>
      <td><strong>${o["Cust Name"] || ""}</strong></td>
      <td>${o.Carrier || ""}${spsBadge}</td>
      <td>${o.Units != null ? o.Units : ""}</td>
      <td>${o.Cartons != null ? o.Cartons : ""}</td>
      <td>${o.BOL || ""}</td>
      <td>${o["Master BOL"] || ""}</td>
      <td>${o["Start Date"] || ""}</td>
      <td>${o["Cancel Date"] || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o["Load ID"] || "-"}</td>
    `;
    tb.appendChild(row);
  });

  document.querySelectorAll(".po-check").forEach(chk => {
    chk.onchange = (e) => {
      const po = e.target.dataset.po;
      if (e.target.checked) selectedPOs.add(po);
      else selectedPOs.delete(po);
      if ($("selected-count")) $("selected-count").textContent = selectedPOs.size;
    };
  });

  if ($("selected-count")) $("selected-count").textContent = selectedPOs.size;
  updateAssignDropdown();
}

function renderOrdersFiltered(list) {
  const tb = $("orders-body");
  if (!tb) return;
  tb.innerHTML = "";
  list.forEach(o => {
    const po = o.PO || o["PO Num"] || "";
    const row = document.createElement("tr");
    const rowClass =
      o.__priority === "HIGH" ? "row-danger" :
      o.__priority === "MEDIUM" ? "row-warn" : "";
    row.className = rowClass;

    const priorityBadge = `<span class="priority-badge priority-${(o.__priority || "low").toLowerCase()}">${o.__priority || "LOW"}</span>`;
    const spsBadge = o.__isSPS ? `<span class="sps-badge">SPS</span>` : "";

    row.innerHTML = `
      <td>
        <input type="checkbox" class="po-check" data-po="${po}" ${selectedPOs.has(po) ? "checked" : ""}>
      </td>
      <td>${po}</td>
      <td>${o.Customer || ""}</td>
      <td><strong>${o["Cust Name"] || ""}</strong></td>
      <td>${o.Carrier || ""}${spsBadge}</td>
      <td>${o.Units != null ? o.Units : ""}</td>
      <td>${o.Cartons != null ? o.Cartons : ""}</td>
      <td>${o.BOL || ""}</td>
      <td>${o["Master BOL"] || ""}</td>
      <td>${o["Start Date"] || ""}</td>
      <td>${o["Cancel Date"] || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o["Load ID"] || "-"}</td>
    `;
    tb.appendChild(row);
  });

  document.querySelectorAll(".po-check").forEach(chk => {
    chk.onchange = (e) => {
      const po = e.target.dataset.po;
      if (e.target.checked) selectedPOs.add(po);
      else selectedPOs.delete(po);
      if ($("selected-count")) $("selected-count").textContent = selectedPOs.size;
    };
  });
}

/* Assign-to-existing dropdown */
function updateAssignDropdown() {
  const sel = $("assign-existing-load");
  if (!sel) return;
  sel.innerHTML = `<option value="">Assign to existing...</option>` +
    appState.truckloads
      .map(t => `<option value="${t.loadId}">${t.loadId} — ${t.customer || ""}</option>`)
      .join("");
}

function assignSelectedPOsToExistingLoad() {
  const sel = $("assign-existing-load");
  if (!sel) return;
  const loadId = sel.value;
  if (!loadId) {
    alert("Select a load to assign to.");
    return;
  }
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck) {
    alert("Load not found.");
    return;
  }

  const selected = [...selectedPOs];
  let added = 0;

  selected.forEach(po => {
    const order = appState.orders.find(o => o.PO === po || o["PO Num"] === po);
    if (!order) return;
    order["Load ID"] = loadId;
    if (!truck.orders) truck.orders = [];
    if (!truck.orders.includes(order.PO)) {
      truck.orders.push(order.PO);
      added++;
    }
  });

  // recompute totals
  const ords = appState.orders.filter(o => truck.orders.includes(o.PO));
  truck.cartons = sumNumber(ords, "__cartons");
  truck.units = sumNumber(ords, "__units");

  logChange("Assign POs to Load", { loadId, added });
  saveState();
  renderAll();
}

/* ========= TRUCKLOAD MANAGEMENT ========= */

function renderTruckloads() {
  const tb = $("truckloads-body");
  if (!tb) return;

  const q = ($("truckloads-search")?.value || "").toLowerCase();

  const filtered = appState.truckloads.filter(t => {
    if (!q) return true;
    return Object.values(t).some(v => String(v || "").toLowerCase().includes(q));
  });

  tb.innerHTML = "";

  filtered.forEach(t => {
    const tr = document.createElement("tr");
    const statusClass =
      t.status === "Fully Staged" ? "status-staged" :
      t.status === "Partially Staged" ? "status-partial" :
      t.status === "Departed" ? "status-departed" : "";

    tr.innerHTML = `
      <td><input type="checkbox" class="truck-check" data-id="${t.loadId}"></td>
      <td>${t.loadId}</td>
      <td>${t.customer || ""}</td>
      <td>${t.carrier || ""}</td>
      <td>${t.loadType || ""}</td>
      <td>${t.pickupDate || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons || 0}</td>
      <td class="${statusClass}">${t.status || "Not Started"}</td>
    `;

    tr.onclick = (e) => {
      if (!e.target.matches("input")) showTruckDetailModal(t.loadId);
    };

    tb.appendChild(tr);
  });

  // Checkbox handlers
  document.querySelectorAll(".truck-check").forEach(chk => {
    chk.onchange = e => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedTrucks.add(id);
      else selectedTrucks.delete(id);
    };
  });
}

/* ========= TRUCKLOAD DETAIL MODAL ========= */

function showTruckDetailModal(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  const body = $("tl-detail-body");
  $("tl-detail-title").textContent = loadId;

  body.innerHTML = `
    <div class="tl-detail-grid">
      <div><strong>Customer:</strong> ${t.customer || ""}</div>
      <div><strong>Carrier:</strong> ${t.carrier || ""}</div>
      <div><strong>Type:</strong> ${t.loadType || ""}</div>
      <div><strong>Status:</strong> ${t.status || ""}</div>
      <div><strong>Date:</strong> ${t.pickupDate || ""}</div>
      <div><strong>Window:</strong> ${t.pickupWindow || ""}</div>
      <div><strong>Cartons:</strong> ${t.cartons || 0}</div>
      <div><strong>Units:</strong> ${t.units || 0}</div>
      <div><strong>SL:</strong> ${t.stagedLocationSL || "-"}</div>
      <div><strong>DD:</strong> ${t.stagedLocationDD || "-"}</div>
    </div>

    <h4>Orders (${t.orders?.length || 0})</h4>
    <div class="orders-in-truck">
      ${(t.orders || []).map(po => `<span class="po-chip">${po}</span>`).join("")}
    </div>
  `;

  // Populate edit fields
  $("ed-load-id").value = t.loadId;
  $("ed-customer").value = t.customer || "";
  $("ed-carrier").value = t.carrier || "";
  $("ed-pickup-date").value = t.pickupDate || "";
  $("ed-pickup-window").value = t.pickupWindow || TIME_BLOCKS[0].window;

  $("tl-detail-overlay").classList.remove("hidden");
}

function saveTruckDetail() {
  const id = $("ed-load-id").value.trim();
  const t = appState.truckloads.find(tr => tr.loadId === id);
  if (!t) return;

  t.customer = $("ed-customer").value.trim();
  t.carrier = $("ed-carrier").value.trim();
  t.pickupDate = $("ed-pickup-date").value;
  t.pickupWindow = $("ed-pickup-window").value;

  logChange("Truckload edited", { loadId: id });
  saveState();
  renderAll();
  $("tl-detail-overlay").classList.add("hidden");
}

/* ========= CREATE TRUCKLOAD ========= */

function showCreateTruckModal() {
  const titleEl = $("modal-overlay")?.querySelector("h3");
  if (titleEl) titleEl.textContent = "Create Truckload";

  $("tl-load-id").value = "";
  $("tl-load-type").value = "LTL";
  $("tl-pickup-date").value = todayYMD();
  $("tl-pickup-window").value = TIME_BLOCKS[0].window;
  $("tl-carrier").value = "";
  $("tl-customer").value = "";
  $("tl-bol").value = "";

  $("modal-selected-pos").textContent = selectedPOs.size
    ? `Selected POs: ${[...selectedPOs].join(", ")}`
    : "No POs selected. You can still create an empty truck.";

  $("modal-overlay").classList.remove("hidden");
}

function saveTruckload() {
  let loadId = $("tl-load-id").value.trim();
  if (!loadId) loadId = `TL-${Date.now()}`;

  let t = appState.truckloads.find(x => x.loadId === loadId);
  const isNew = !t;

  if (!t) {
    t = {
      loadId,
      orders: [],
      stagingLog: [],
      createdAt: new Date().toISOString(),
      createdBy: appState.session.email,
      status: "Not Started",
      cartons: 0,
      units: 0
    };
    appState.truckloads.push(t);
  }

  t.loadId = loadId;
  t.loadType = $("tl-load-type").value;
  t.pickupDate = $("tl-pickup-date").value;
  t.pickupWindow = $("tl-pickup-window").value;
  t.carrier = $("tl-carrier").value.trim();
  t.customer = $("tl-customer").value.trim();
  t.bol = $("tl-bol").value.trim();
  // master BOL, units, cartons are derived from orders

  // Attach selected POs (if any)
  if (!Array.isArray(t.orders)) t.orders = [];
  const newlyAdded = [];

  [...selectedPOs].forEach(po => {
    const o = appState.orders.find(x => (x.PO || x["PO Num"]) === po);
    if (!o) return;
    o["Load ID"] = loadId;
    if (!t.orders.includes(po)) {
      t.orders.push(po);
      newlyAdded.push(po);
    }
  });

  t.units = sumNumber(
    appState.orders.filter(o => t.orders.includes(o.PO || o["PO Num"])),
    "__units"
  );
  t.cartons = sumNumber(
    appState.orders.filter(o => t.orders.includes(o.PO || o["PO Num"])),
    "__cartons"
  );

  if (!Array.isArray(t.stagingLog)) t.stagingLog = [];
  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: isNew ? "Created" : "Edited",
    user: appState.session.email,
    note: newlyAdded.length ? `Added POs: ${newlyAdded.join(", ")}` : ""
  });

  logChange(isNew ? "Truckload created" : "Truckload updated", {
    loadId,
    pos: t.orders.length
  });

  selectedPOs.clear();
  $("modal-overlay").classList.add("hidden");
  saveState();
  renderAll();
}

/* ========= BULK EDIT ========= */

function showBulkEditModal() {
  const selected = [...selectedPOs];
  if (selected.length === 0) {
    alert("No orders selected.");
    return;
  }
  $("bulk-pickup-date").value = "";
  $("bulk-pickup-window").value = "";
  $("bulk-carrier").value = "";
  $("bulk-edit-overlay").classList.remove("hidden");
}

function applyBulkEdit() {
  const newDate = $("bulk-pickup-date").value;
  const newWindow = $("bulk-pickup-window").value;
  const newCarrier = $("bulk-carrier").value.trim();

  const selected = [...selectedTrucks];
  if (selected.length === 0) {
    alert("No trucks selected.");
    return;
  }

  selected.forEach(id => {
    const t = appState.truckloads.find(x => x.loadId === id);
    if (!t) return;

    if (newDate) t.pickupDate = newDate;
    if (newWindow) t.pickupWindow = newWindow;
    if (newCarrier) t.carrier = newCarrier;
  });

  logChange("Bulk edit applied", { count: selected.length });
  saveState();
  renderAll();
  $("bulk-edit-overlay").classList.add("hidden");
}

/* ========= AUTO ROUTER ========= */

function runAutoRouter() {
  const targetOrders =
    selectedPOs.size > 0
      ? appState.orders.filter(o => selectedPOs.has(o.PO))
      : appState.orders.filter(o => !o["Load ID"]);

  if (targetOrders.length === 0) {
    alert("No orders to route.");
    return;
  }

  autoProposals = buildAutoProposals(targetOrders);
  renderAutoRouteModal();
}

function buildAutoProposals(list) {
  const proposals = [];

  // SPS separate flow
  const sps = list.filter(o => o.__isSPS);
  const regular = list.filter(o => !o.__isSPS);

  // SPS grouped by carrier + date
  const map = new Map();
  sps.forEach(o => {
    const key = (o.Carrier || "") + "|" + o.__recommendedShip;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(o);
  });

  for (const [key, items] of map.entries()) {
    const [carrier, date] = key.split("|");
    const units = sumNumber(items, "__units");
    const cartons = sumNumber(items, "__cartons");

    proposals.push({
      id: `SPS-${Date.now()}-${proposals.length}`,
      loadType: "Small Parcel",
      customer: "Multiple",
      carrier,
      date,
      window: TIME_BLOCKS[0].window,
      orders: items,
      units,
      cartons,
      fill: Math.round((cartons / MAX_CARTS_PER_TRUCK) * 100)
    });
  }

  // Regular grouped by Customer
  const byCust = new Map();
  regular.forEach(o => {
    if (!byCust.has(o.Customer)) byCust.set(o.Customer, []);
    byCust.get(o.Customer).push(o);
  });

  for (const [cust, items] of byCust.entries()) {
    let remaining = [...items];

    while (remaining.length > 0) {
      const chunk = [];
      let units = 0;
      let cartons = 0;

      for (const o of remaining) {
        if (
          units + o.__units <= MAX_UNITS_PER_TRUCK &&
          cartons + o.__cartons <= MAX_CARTS_PER_TRUCK
        ) {
          chunk.push(o);
          units += o.__units;
          cartons += o.__cartons;
        }
      }

      if (chunk.length === 0) chunk.push(remaining[0]);
      remaining = remaining.filter(o => !chunk.includes(o));

      const date = earliestDate(chunk.map(o => o.__recommendedShip));
      const carrier = mostCommon(chunk.map(o => o.Carrier || ""));
      const fill = Math.round((cartons / MAX_CARTS_PER_TRUCK) * 100);

      proposals.push({
        id: `LOAD-${Date.now()}-${proposals.length}`,
        loadType: fill >= 70 ? "Truckload" : "LTL",
        customer: cust,
        carrier,
        date,
        window: TIME_BLOCKS[1].window,
        orders: chunk,
        units,
        cartons,
        fill
      });
    }
  }

  return proposals;
}

function renderAutoRouteModal() {
  const body = $("auto-body");
  const summary = $("auto-summary");

  summary.textContent = `${autoProposals.length} proposed truckloads`;

  body.innerHTML = autoProposals
    .map(
      (p) => `
      <tr>
        <td><input type="checkbox" class="auto-check" data-id="${p.id}" checked></td>
        <td>${p.id}</td>
        <td>${p.loadType}</td>
        <td>${p.customer}</td>
        <td>${p.carrier}</td>
        <td><input class="auto-date" data-id="${p.id}" type="date" value="${p.date}"></td>
        <td>
          <select class="auto-window" data-id="${p.id}">
            ${TIME_BLOCKS.map(b => 
              `<option value="${b.window}" ${b.window === p.window ? "selected" : ""}>${b.label}</option>`
            ).join("")}
          </select>
        </td>
        <td>${p.orders.length}</td>
        <td>${p.units}</td>
        <td>${p.cartons}</td>
        <td>${p.fill}%</td>
      </tr>
    `
    )
    .join("");

  $("auto-overlay").classList.remove("hidden");
}

function confirmAutoRoute() {
  const selectedIds = new Set(
    [...document.querySelectorAll(".auto-check:checked")].map(
      (x) => x.dataset.id
    )
  );

  const creating = autoProposals.filter((p) => selectedIds.has(p.id));

  creating.forEach((p) => {
    const date = document.querySelector(`.auto-date[data-id="${p.id}"]`)?.value || p.date;
    const window = document.querySelector(`.auto-window[data-id="${p.id}"]`)?.value || p.window;

    const truck = {
      loadId: p.id,
      loadType: p.loadType,
      customer: p.customer,
      carrier: p.carrier,
      pickupDate: date,
      pickupWindow: window,
      bol: mostCommon(p.orders.map(o => o.BOL)),
      masterBol: mostCommon(p.orders.map(o => o["Master BOL"])),
      cartons: p.cartons,
      units: p.units,
      weight: sumNumber(p.orders, "Weight"),
      stagedLocationSL: "",
      stagedLocationDD: "",
      status: "Not Started",
      createdAt: new Date().toISOString(),
      createdBy: appState.session.email,
      orders: p.orders.map(o => o.PO),
      stagingLog: []
    };

    appState.truckloads.push(truck);

    // Assign orders
    p.orders.forEach(o => (o["Load ID"] = p.id));
  });

  logChange("Auto-route confirmed", { created: creating.length });
  saveState();
  renderAll();
  $("auto-overlay").classList.add("hidden");
}

/* ========= APPOINTMENT SCHEDULING ========= */

function showAppointmentModal(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  $("appt-load-id").textContent = t.loadId;
  $("appt-customer").textContent = t.customer || "";
  $("appt-carrier").textContent = t.carrier || "";

  $("appt-date").value = t.appointmentDate || t.pickupDate || todayYMD();
  $("appt-time").value = t.appointmentTime || "";
  $("appt-dock").value = t.assignedDock || "";
  $("appt-notes").value = t.appointmentNotes || "";

  checkAppointmentConflicts();
  $("appt-overlay").classList.remove("hidden");
}

function checkAppointmentConflicts() {
  const date = $("appt-date").value;
  const time = $("appt-time").value;
  const dock = $("appt-dock").value;

  if (!date || !time || !dock) {
    $("appt-conflicts").innerHTML = "";
    return;
  }

  const conflicts = appState.truckloads.filter(t =>
    t.appointmentDate === date &&
    t.assignedDock === dock &&
    t.appointmentTime &&
    timeOverlaps(t.appointmentTime, time)
  );

  if (conflicts.length > 0) {
    $("appt-conflicts").innerHTML = `
      <div class="warning-box">
        ⚠️ Conflict: ${conflicts.map(c => c.loadId).join(", ")} already scheduled
      </div>`;
  } else {
    $("appt-conflicts").innerHTML = `<div class="success-box">✓ No conflicts</div>`;
  }
}

function saveAppointment() {
  const id = $("appt-load-id").textContent;
  const t = appState.truckloads.find(x => x.loadId === id);
  if (!t) return;

  t.appointmentDate = $("appt-date").value;
  t.appointmentTime = $("appt-time").value;
  t.assignedDock = $("appt-dock").value;
  t.appointmentNotes = $("appt-notes").value;
  t.appointmentBy = appState.session.email;
  t.appointmentAt = new Date().toISOString();

  logChange("Appointment scheduled", {
    loadId: id,
    dock: t.assignedDock,
    datetime: `${t.appointmentDate} ${t.appointmentTime}`
  });

  // Alert system
  appState.alerts.push({
    id: `alert-${Date.now()}`,
    type: "info",
    message: `New appointment booked: ${t.loadId} at ${t.assignedDock}`,
    timestamp: new Date().toISOString()
  });

  saveState();
  updateAlertsBadge();
  renderAll();
  $("appt-overlay").classList.add("hidden");
}

/* ========= OVERFLOW REPORT ========= */

function showOverflowModal(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  $("overflow-load-id").textContent = t.loadId;
  $("overflow-customer").textContent = t.customer || "";

  const over = Math.max(0, t.cartons - MAX_CARTS_PER_TRUCK);
  $("overflow-amount").textContent = `${over} cartons over capacity`;

  $("overflow-reason").value = "";
  $("overflow-action").value = "split";
  $("overflow-notes").value = "";
  $("overflow-photo-preview").innerHTML = "";
  delete $("overflow-photo-preview").dataset.photo;

  $("overflow-overlay").classList.remove("hidden");
}

function captureOverflowPhoto() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.capture = "environment";

  inp.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      $("overflow-photo-preview").innerHTML = `
        <img src="${ev.target.result}" style="max-width:260px;margin-top:10px;">`;
      $("overflow-photo-preview").dataset.photo = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  inp.click();
}

function submitOverflowReport() {
  const loadId = $("overflow-load-id").textContent;
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  const report = {
    loadId,
    reason: $("overflow-reason").value,
    action: $("overflow-action").value,
    notes: $("overflow-notes").value,
    photo: $("overflow-photo-preview").dataset.photo || null,
    reportedBy: appState.session.email,
    reportedAt: new Date().toISOString()
  };

  if (!t.overflowReports) t.overflowReports = [];
  t.overflowReports.push(report);

  if (report.action === "split") createOverflowTruck(t);
  if (report.action === "reject") t.status = "Rejected - Overflow";

  appState.alerts.push({
    id: `alert-${Date.now()}`,
    type: "warning",
    message: `Overflow reported for ${loadId}`,
    timestamp: new Date().toISOString()
  });

  logChange("Overflow reported", { loadId, action: report.action });
  saveState();
  renderAll();
  updateAlertsBadge();
  $("overflow-overlay").classList.add("hidden");
}

function createOverflowTruck(original) {
  const extra = Math.max(0, original.cartons - MAX_CARTS_PER_TRUCK);
  const portionUnits = Math.round(original.units * (extra / original.cartons));

  const overflowTruck = {
    ...original,
    loadId: `${original.loadId}-OVFL`,
    cartons: extra,
    units: portionUnits,
    status: "Overflow Split",
    parentLoad: original.loadId,
    createdAt: new Date().toISOString()
  };

  original.cartons = MAX_CARTS_PER_TRUCK;
  original.units -= portionUnits;

  appState.truckloads.push(overflowTruck);
}

/* ========= DOCK TAB ========= */

function renderDock() {
  const tb = $("dock-body");
  if (!tb) return;

  const q = ($("dock-search")?.value || "").toLowerCase();
  const filtered = appState.truckloads.filter(t =>
    !q || Object.values(t).some(v => String(v || "").toLowerCase().includes(q))
  );

  tb.innerHTML = "";

  filtered.forEach(t => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.customer}</td>
      <td>${t.carrier}</td>
      <td>${t.loadType}</td>
      <td>${t.pickupDate || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons}</td>

      <td>
        <select class="input-slim" data-id="${t.loadId}" onchange="updateSL('${t.loadId}', this.value)">
          <option value="">Assign SL...</option>
          ${SL_LANES.map(l => `<option value="${l}" ${t.stagedLocationSL===l?"selected":""}>${l}</option>`).join("")}
        </select>
      </td>

      <td>
        <select class="input-slim" data-id="${t.loadId}" onchange="updateDD('${t.loadId}', this.value)">
          <option value="">Assign DD...</option>
          ${DD_DOORS.map(d => `<option value="${d}" ${t.stagedLocationDD===d?"selected":""}>${d}</option>`).join("")}
        </select>
      </td>

      <td>${statusBadge(t.status)}</td>
      <td>
        <button class="btn tiny secondary" onclick="showDockHistory('${t.loadId}')">History</button>
      </td>
    `;

    tb.appendChild(tr);
  });
}

function updateSL(loadId, loc) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  const old = t.stagedLocationSL;
  t.stagedLocationSL = loc;

  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: "SL Assign",
    user: appState.session.email,
    note: `${old || "None"} → ${loc}`
  });

  logChange("SL updated", { loadId, from: old, to: loc });
  saveState();
  renderDock();
}

function updateDD(loadId, loc) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  const old = t.stagedLocationDD;
  t.stagedLocationDD = loc;

  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: "DD Assign",
    user: appState.session.email,
    note: `${old || "None"} → ${loc}`
  });

  logChange("DD updated", { loadId, from: old, to: loc });
  saveState();
  renderDock();
}

function statusBadge(status) {
  if (!status) return `<span class="status-badge">-</span>`;
  const cls = status.toLowerCase().replace(/\s+/g, "-");
  return `<span class="status-badge status-${cls}">${status}</span>`;
}

function showDockHistory(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  const list = $("dock-history-body");
  list.innerHTML = t.stagingLog.length
    ? t.stagingLog.map(log => `
      <tr>
        <td>${new Date(log.ts).toLocaleString()}</td>
        <td>${log.action}</td>
        <td>${log.user}</td>
        <td>${log.note}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="muted">No history</td></tr>`;

  $("dock-history-title").textContent = `Staging History — ${loadId}`;
  $("dock-history-overlay").classList.remove("hidden");
}

/* ========= TODAY'S PICKUPS ========= */

function renderTodays() {
  const tb = $("today-body");
  if (!tb) return;

  const today = todayYMD();
  const trucks = appState.truckloads.filter(t => sameDate(t.pickupDate, today));

  tb.innerHTML = "";

  trucks.forEach(t => {
    const departed = t.status === "Departed";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.customer}</td>
      <td>${t.carrier}</td>
      <td>${t.loadType}</td>
      <td>${t.bol || ""}</td>
      <td>${t.masterBol || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons}</td>
      <td class="${departed ? "status-departed" : ""}">
        ${t.status}
      </td>
      <td>
        ${departed
          ? `<span class="muted">${new Date(t.departedAt).toLocaleTimeString()}</span>`
          : `<button class="btn tiny success" onclick="markDeparted('${t.loadId}')">Depart</button>`}
      </td>
    `;

    tb.appendChild(tr);
  });
}

function markDeparted(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  t.status = "Departed";
  t.departedAt = new Date().toISOString();
  t.departedBy = appState.session.email;

  moveToHistory(loadId);

  logChange("Departed", { loadId });
  saveState();
  renderAll();
}

function moveToHistory(loadId) {
  const idx = appState.truckloads.findIndex(t => t.loadId === loadId);
  if (idx < 0) return;

  const entry = {
    ...appState.truckloads[idx],
    completedAt: new Date().toISOString(),
    completedBy: appState.session.email
  };

  appState.history.push(entry);
  appState.truckloads.splice(idx, 1);
}

/* ========= METRICS ========= */

function renderMetrics() {
  $("m-units-today").textContent = sumNumber(appState.orders, "__units").toLocaleString();
  $("m-units-week").textContent = sumNumber(appState.orders, "__units").toLocaleString();
  $("m-cartons").textContent = sumNumber(appState.truckloads, "cartons").toLocaleString();
  $("m-total-loads").textContent = appState.truckloads.length;

  const staged = appState.truckloads.filter(t => t.status === "Fully Staged").length;
  const progress = appState.truckloads.filter(t => t.status === "Partially Staged").length;

  $("status-breakdown").innerHTML = `
    <div class="metric-row"><span>Fully Staged</span><strong>${staged}</strong></div>
    <div class="metric-row"><span>In Progress</span><strong>${progress}</strong></div>
    <div class="metric-row"><span>Departed</span><strong>${appState.history.length}</strong></div>
  `;

  const carriers = {};
  appState.truckloads.forEach(t => {
    carriers[t.carrier || "Unknown"] = (carriers[t.carrier || "Unknown"] || 0) + 1;
  });

  $("carrier-breakdown").innerHTML = Object.entries(carriers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c, n]) => `<div class="metric-row"><span>${c}</span><strong>${n}</strong></div>`)
    .join("");

  const discrepancies = findDiscrepancies();
  $("data-quality").innerHTML = `
    <div class="metric-row"><span>Total Orders</span><strong>${appState.orders.length}</strong></div>
    <div class="metric-row"><span>Total Truckloads</span><strong>${appState.truckloads.length}</strong></div>
    <div class="metric-row"><span>Discrepancies</span>
      <strong style="color:${discrepancies.length ? "#dc2626" : "#059669"}">${discrepancies.length}</strong>
    </div>
  `;
}

/* ========= DISCREPANCIES ========= */

function renderDiscrepancies() {
  const tb = $("disc-body");
  if (!tb) return;

  const q = ($("disc-search")?.value || "").toLowerCase();
  const all = findDiscrepancies();

  const filtered = all.filter(d =>
    !q || Object.values(d).some(v => String(v || "").toLowerCase().includes(q))
  );

  tb.innerHTML = filtered.map(d => `
    <tr class="${d.type === "MISSING" ? "row-danger" : "row-warn"}">
      <td><span class="disc-type disc-${d.type.toLowerCase()}">${d.type}</span></td>
      <td>${d.po}</td>
      <td>${d.field}</td>
      <td>${d.csvValue || "-"}</td>
      <td>${d.dashValue || "-"}</td>
      <td>${d.loadIds?.join(", ") || "-"}</td>
    </tr>
  `).join("");

  const hdr = $("tab-discrepancies").querySelector(".pane-header");
  hdr.querySelector(".disc-summary")?.remove();

  const summ = document.createElement("div");
  summ.className = "disc-summary";
  summ.textContent = `${all.length} discrepancies • ${all.filter(d=>d.type==="MISSING").length} missing • ${all.filter(d=>d.type==="MISMATCH").length} mismatches`;
  hdr.appendChild(summ);
}

function findDiscrepancies() {
  const list = [];

  appState.orders.forEach(o => {
    const po = o.PO;
    const loadId = o["Load ID"];

    if (loadId) {
      const t = appState.truckloads.find(x => x.loadId === loadId);
      if (!t) {
        list.push({
          type: "MISSING",
          po,
          field: "Load Assignment",
          csvValue: loadId,
          dashValue: "Truck not found",
          loadIds: [loadId]
        });
      }
    }
  });

  return list;
}

/* ========= HISTORY ========= */

function renderHistory() {
  const tb = $("history-body");
  if (!tb) return;

  const q = ($("history-search")?.value || "").toLowerCase();

  const rows = appState.history.filter(h => {
    if (!q) return true;
    return [
      h.loadId,
      h.customer,
      h.carrier,
      h.bol,
      h.masterBol,
      h.pickupDate,
      h.pickupWindow
    ].some(v => String(v || "").toLowerCase().includes(q));
  });

  tb.innerHTML = "";

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;">No departed loads yet</td></tr>`;
    return;
  }

  rows.slice(0, 200).forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.loadId}</td>
      <td>${h.customer || ""}</td>
      <td>${h.carrier || ""}</td>
      <td>${h.bol || ""}</td>
      <td>${h.masterBol || ""}</td>
      <td>${h.pickupDate || ""}</td>
      <td>${h.pickupWindow || ""}</td>
      <td>${h.completedAt ? new Date(h.completedAt).toLocaleString() : "-"}</td>
    `;
    tb.appendChild(tr);
  });
}

/* ========= DOCK MAP (OVERVIEW MODAL) ========= */

function showDockMapModal() {
  const today = todayYMD();
  const todays = appState.truckloads.filter(t => sameDate(t.pickupDate, today));

  const doorsEl = $("dock-doors-map");
  const lanesEl = $("staging-lanes-map");
  if (!doorsEl || !lanesEl) return;

  doorsEl.innerHTML = DD_DOORS.slice(0, 72).map(door => {
    const assigned = todays.find(t => t.stagedLocationDD === door);
    return `
      <div class="location-cell ${assigned ? "assigned" : "available"}" title="${assigned ? assigned.loadId : "Available"}">
        <div>${door}</div>
        ${assigned ? `<div style="font-size:10px;margin-top:2px;">${assigned.loadId}</div>` : ""}
      </div>
    `;
  }).join("");

  lanesEl.innerHTML = SL_LANES.slice(0, 60).map(lane => {
    const assigned = todays.find(t => t.stagedLocationSL === lane);
    return `
      <div class="location-cell ${assigned ? "assigned" : "available"}" title="${assigned ? assigned.loadId : "Available"}">
        <div>${lane}</div>
        ${assigned ? `<div style="font-size:10px;margin-top:2px;">${assigned.loadId}</div>` : ""}
      </div>
    `;
  }).join("");

  $("dock-map-overlay").classList.remove("hidden");
}

/* ========= ALERTS / CHANGELOG / EXPORT ========= */

function showAlertsModal() {
  const list = $("alerts-list");
  if (!list) return;

  list.innerHTML = "";

  if (!appState.alerts.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:#6b7280;">No alerts at this time</div>`;
  } else {
    appState.alerts.forEach(a => {
      const div = document.createElement("div");
      div.className = `alert-item ${a.type}`;
      div.innerHTML = `
        <div>
          <strong>${a.type === "error" ? "🔴 Error" : a.type === "warning" ? "⚠️ Warning" : "ℹ️ Info"}</strong>
          <div style="font-size:13px;margin-top:4px;">${a.message}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            ${new Date(a.timestamp).toLocaleString()}
          </div>
        </div>
      `;
      list.appendChild(div);
    });
  }

  $("alerts-overlay").classList.remove("hidden");
}

function showChangelogModal() {
  const list = $("changelog-list");
  if (!list) return;

  list.innerHTML = "";

  if (!appState.changeLog.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:#6b7280;">No changes logged yet</div>`;
  } else {
    appState.changeLog.slice(0, 50).forEach(log => {
      const div = document.createElement("div");
      div.className = "changelog-item";
      div.innerHTML = `
        <div class="changelog-action">${log.action}</div>
        <div class="changelog-meta">
          ${new Date(log.timestamp).toLocaleString()} • ${log.user || "unknown"}
        </div>
      `;
      list.appendChild(div);
    });
  }

  $("changelog-overlay").classList.remove("hidden");
}

function exportData() {
  const data = {
    orders: appState.orders,
    truckloads: appState.truckloads,
    history: appState.history,
    changeLog: appState.changeLog,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ncdc-backup-${todayYMD()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  logChange("Data exported", {});
}

/* ========= CALENDAR ========= */
function renderCalendar() {
  const grid = $("calendar-grid");
  if (!grid) return;
  grid.innerHTML = "";
  
  // Simple week view based on calAnchor (default today)
  const startOfWeek = new Date(calAnchor);
  const day = startOfWeek.getDay() || 7; // Get current day number, converting Sun (0) to 7
  if (day !== 1) startOfWeek.setHours(-24 * (day - 1)); // Go back to Monday

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  days.forEach((d, i) => {
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + i);
    const isToday = sameDate(date, new Date());
    
    const col = document.createElement("div");
    col.className = `cal-cell ${isToday ? "today" : ""}`;
    
    const dateStr = date.toISOString().slice(5, 10); // MM-DD
    col.innerHTML = `
      <div class="cal-cell-head">
        <span>${d}</span>
        <span style="font-weight:normal;color:#6b7280">${dateStr}</span>
      </div>
      <div class="cal-cell-body" id="cal-day-${i}"></div>
    `;
    grid.appendChild(col);
  });

  // Populate Trucks
  appState.truckloads.forEach(t => {
    if (!t.pickupDate) return;
    const tDate = new Date(t.pickupDate);
    
    const diffTime = tDate - startOfWeek;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    if (diffDays >= 0 && diffDays < 7) {
        const container = document.getElementById(`cal-day-${diffDays}`);
        if (container) {
            const chip = document.createElement("div");
            chip.className = `cal-chip ${t.status === 'Departed' ? 'departed' : ''}`;
            chip.innerHTML = `
                <strong>${t.loadId}</strong>
                <br>${(t.customer || "").substring(0,10)}
            `;
            chip.onclick = () => showTruckDetailModal(t.loadId);
            container.appendChild(chip);
        }
    }
  });
  
  const title = $("cal-title");
  if(title) title.textContent = `Week of ${startOfWeek.toLocaleDateString()}`;
}

/* ========= RENDER ALL ========= */

function renderAll() {
  renderOrders();
  renderTruckloads();
  renderDock();
  renderTodays();
  renderHistory();
  renderMetrics();
  renderDiscrepancies();
  renderCalendar();
  updateAssignDropdown();
  checkAlerts();
}

/* ========= INIT ========= */

function init() {
  loadState();

  // Add Mobile Menu Button dynamically if missing
  const topBarLeft = document.querySelector(".top-bar-left");
  if (topBarLeft && !document.querySelector(".mobile-menu-btn")) {
    const btn = document.createElement("button");
    btn.className = "mobile-menu-btn";
    btn.innerHTML = "☰";
    btn.onclick = () => {
      document.querySelector(".sidebar").classList.toggle("open");
      let overlay = document.querySelector(".sidebar-overlay");
      if(!overlay) {
        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        overlay.onclick = () => {
            document.querySelector(".sidebar").classList.remove("open");
            overlay.classList.remove("show");
        };
        document.body.appendChild(overlay);
      }
      overlay.classList.toggle("show");
    };
    topBarLeft.insertBefore(btn, topBarLeft.firstChild);
  }

  if (appState.session?.authed) {
    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    updateUserDisplay();
    applyRolePermissions();
    renderAll();
  }

  setupNavigation();

  // Auth
  $("login-btn").onclick = handleLogin;
  $("logout-btn").onclick = handleLogout;

  // Orders
  $("orders-csv").onchange = handleCSVUpload;
  let searchTimeout;
  $("orders-search").oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderOrders, 300);
  };
  $("select-all-orders").onchange = e => {
    const checked = e.target.checked;
    document.querySelectorAll("#orders-body .po-check").forEach(chk => {
      chk.checked = checked;
      const po = chk.dataset.po;
      if (checked) selectedPOs.add(po);
      else selectedPOs.delete(po);
    });
    $("selected-count").textContent = selectedPOs.size;
  };
  $("create-truckload-btn").onclick = showCreateTruckModal;
  $("auto-route-btn").onclick = runAutoRouter;
  $("assign-pos-to-load").onclick = assignSelectedPOsToExistingLoad;

  // Dock
  $("dock-search").oninput = renderDock;
  $("dock-clear").onclick = () => { $("dock-search").value = ""; renderDock(); };
  $("dock-history-close").onclick = () => $("dock-history-overlay").classList.add("hidden");
  $("dock-map-close").onclick = () => $("dock-map-overlay").classList.add("hidden");

  // Today
  $("todays-clear")?.addEventListener("click", () => {
    const inp = $("todays-search");
    if (inp) inp.value = "";
    renderTodays();
  });
  if ($("todays-search")) {
    $("todays-search").oninput = renderTodays;
  }

  // Truckloads
  $("truckloads-search").oninput = renderTruckloads;
  $("truckloads-clear").onclick = () => { $("truckloads-search").value = ""; renderTruckloads(); };
  $("select-all-trucks").onchange = e => {
    const checked = e.target.checked;
    document.querySelectorAll(".truck-check").forEach(chk => {
      chk.checked = checked;
      const id = chk.dataset.id;
      if (checked) selectedTrucks.add(id);
      else selectedTrucks.delete(id);
    });
  };
  $("bulk-edit-btn").onclick = showBulkEditModal;
  $("bulk-apply").onclick = applyBulkEdit;
  $("bulk-cancel").onclick = () => $("bulk-edit-overlay").classList.add("hidden");

  // History
  $("history-search").oninput = renderHistory;
  $("history-clear").onclick = () => { $("history-search").value = ""; renderHistory(); };

  // Discrepancies
  $("disc-search").oninput = renderDiscrepancies;
  $("disc-clear").onclick = () => { $("disc-search").value = ""; renderDiscrepancies(); };

  // Calendar
  $("cal-prev").onclick = () => { calAnchor.setDate(calAnchor.getDate() - 7); renderCalendar(); };
  $("cal-next").onclick = () => { calAnchor.setDate(calAnchor.getDate() + 7); renderCalendar(); };
  $("cal-today").onclick = () => { calAnchor = new Date(); renderCalendar(); };

  // Modals
  $("tl-save").onclick = saveTruckload;
  $("tl-cancel").onclick = () => $("modal-overlay").classList.add("hidden");

  $("tl-detail-save").onclick = saveTruckDetail;
  $("tl-detail-close").onclick = () => $("tl-detail-overlay").classList.add("hidden");

  $("auto-confirm").onclick = confirmAutoRoute;
  $("auto-cancel").onclick = () => $("auto-overlay").classList.add("hidden");
  $("auto-select-all").onchange = e => {
    const checked = e.target.checked;
    document.querySelectorAll(".auto-check").forEach(chk => { chk.checked = checked; });
  };

  $("alerts-close").onclick = () => $("alerts-overlay").classList.add("hidden");
  $("changelog-close").onclick = () => $("changelog-overlay").classList.add("hidden");

  $("undo-btn").onclick = () => alert("Undo feature coming soon");
  $("changelog-btn").onclick = showChangelogModal;
  $("export-btn").onclick = exportData;

  $("clear-all-data").onclick = () => {
    if (!confirm("Clear ALL data? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };

  // Initial renders if not already done
  if (appState.session?.authed) {
    renderAll();
  }

  // Periodic autosave
  setInterval(() => {
    if (appState.session?.authed) saveState();
  }, 30000);
}

// Node export guard (for tests, optional)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { appState, renderAll, handleCSVUpload, init };
}

// Start the app
document.addEventListener("DOMContentLoaded", () => {
  console.log("Script loaded successfully");
  init();
});
