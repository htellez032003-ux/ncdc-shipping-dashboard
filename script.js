// NCDC Shipping Dashboard - Full JavaScript
// Version 3.0 with Phase 1 Features

/* ========= CONSTANTS ========= */
const STORAGE_KEY = "ncdcShippingStateV11";
const MAX_UNITS_PER_TRUCK = 30000;
const MAX_CARTS_PER_TRUCK = 2600;

const TIME_BLOCKS = [
  { window: "08:00-10:00", label: "8am-10am" },
  { window: "10:00-12:00", label: "10am-12pm" },
  { window: "12:00-14:00", label: "12pm-2pm" },
  { window: "14:00-16:00", label: "2pm-4pm" },
  { window: "16:00-18:00", label: "4pm-6pm" }
];

const LOAD_TYPES = ["LTL", "Truckload", "Floorload", "Small Parcel"];

// Staging locations
const SL_LANES = [];
for (let i = 18; i <= 220; i++) SL_LANES.push(`SL${i}A`);
for (let i = 18; i <= 99; i++) SL_LANES.push(`SL${i}B`);
for (let i = 18; i <= 25; i++) SL_LANES.push(`SL${i}C`);

const DD_DOORS = [];
for (let i = 2; i <= 6; i++) DD_DOORS.push(`DD${i}`);
for (let i = 12; i <= 73; i++) DD_DOORS.push(`DD${i}`);

const USER_ROLES = {
  admin: { label: "Admin", permissions: ["all"] },
  router: { label: "Router", permissions: ["orders", "truckloads", "calendar", "metrics", "history", "settings"] },
  dock: { label: "Dock Lead", permissions: ["dock", "todays", "truckloads", "history"] },
  supervisor: { label: "Supervisor", permissions: ["all"] }
};

// WMS Integration Hook (ready for BlueCherry)
const WMS_CONFIG = {
  enabled: false,
  provider: 'bluecherry',
  apiEndpoint: '',
  apiKey: '',
  syncInterval: 15 * 60 * 1000
};

/* ========= STATE ========= */
const appState = {
  session: { authed: false, email: "", role: "admin" },
  orders: [],
  truckloads: [],
  history: [],
  changeLog: [],
  alerts: [],
  savedFilters: [],
  appointments: [],
  overflowCallouts: [],
  customerRules: [],
  centerPatterns: [], // Store → Center mappings
  settings: {
    maxLTL: 4,
    maxTL: 3,
    maxFloor: 2
  }
};

// UI State
const selectedPOs = new Set();
const selectedTrucks = new Set();
const dynamicFilters = [];
let filteredOrders = [];
let autoProposals = [];
let calAnchor = new Date();

/* ========= UTILITIES ========= */
const $ = (id) => document.getElementById(id);
const todayYMD = () => new Date().toISOString().slice(0, 10);

const parseYMD = (str) => {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
};

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const sameDate = (a, b) => {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return x.getTime() === y.getTime();
};

const mostCommon = (arr) => {
  const counts = {};
  let max = 0;
  let result = "";
  arr.forEach(v => {
    const k = v || "";
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] > max) {
      max = counts[k];
      result = k;
    }
  });
  return result;
};

const earliestDate = (arr) => {
  const dates = arr.map(x => parseYMD(x)).filter(x => x && x > 0);
  if (!dates.length) return "";
  dates.sort((a, b) => a - b);
  return ymd(dates[0]);
};

const isSPSCarrier = (carrier) => {
  const c = (carrier || "").toUpperCase();
  return c.includes("UPS") || c.includes("FXG") || c.includes("FEDEX");
};

/* ========= STORAGE ========= */
function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      Object.assign(appState, data);
    }
  } catch (e) {
    console.error("Load error:", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error("Save error:", e);
  }
}

function logChange(action, details = {}) {
  appState.changeLog.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    user: appState.session.email || "System",
    action,
    details
  });
  if (appState.changeLog.length > 100) {
    appState.changeLog = appState.changeLog.slice(0, 100);
  }
  saveState();
}

/* ========= ALERTS ========= */
function checkAlerts() {
  const alerts = [];
  const today = todayYMD();
  
  appState.orders.forEach(o => {
    if (o.priority === "HIGH" && !o.assignedTruckId) {
      alerts.push({
        id: `overdue-${o.po}`,
        type: "error",
        message: `Order ${o.po} is overdue and not assigned`
      });
    }
  });
  
  TIME_BLOCKS.forEach(block => {
    const used = appState.truckloads.filter(t => 
      t.pickupDate === today && t.pickupWindow === block.window
    ).length;
    if (used >= 3) {
      alerts.push({
        id: `capacity-${block.window}`,
        type: "warning",
        message: `${block.label} is near capacity (${used}/4)`
      });
    }
  });
  
  appState.truckloads.forEach(t => {
    if (sameDate(t.pickupDate, today) && !t.stagedLocationSL && !t.stagedLocationDD && t.status !== "Departed") {
      alerts.push({
        id: `no-loc-${t.loadId}`,
        type: "warning",
        message: `${t.loadId} has no staging location`
      });
    }
  });
  
  appState.alerts = alerts;
  updateAlertsBadge();
}

function updateAlertsBadge() {
  const badge = $("alerts-badge");
  const countEl = $("alerts-count");
  
  if (badge && appState.alerts.length > 0) {
    badge.classList.remove("hidden");
    const errors = appState.alerts.filter(a => a.type === "error").length;
    const warnings = appState.alerts.filter(a => a.type === "warning").length;
    if (countEl) countEl.innerHTML = `${errors > 0 ? `🔴 ${errors}` : ""} ${warnings > 0 ? `⚠️ ${warnings}` : ""}`;
  } else if (badge) {
    badge.classList.add("hidden");
  }
}

/* ========= LOGIN / NAV ========= */
function handleLogin() {
  const email = $("login-email").value.trim();
  const pass = $("login-password").value.trim();
  const role = $("login-role").value;
  
  if (email === "htellez032003@gmail.com" && pass === "Ltapaprel040523") {
    appState.session = { authed: true, email, role };
    $("login-error").classList.add("hidden");
    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    updateUserDisplay();
    applyRolePermissions();
    saveState();
    renderAll();
  } else {
    $("login-error").classList.remove("hidden");
  }
}

function handleLogout() {
  appState.session = { authed: false, email: "", role: "admin" };
  saveState();
  $("app-shell").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
}

function updateUserDisplay() {
  const userDisplay = $("current-user-display");
  const roleBadge = $("current-role-badge");
  if (userDisplay) userDisplay.textContent = appState.session.email;
  if (roleBadge) roleBadge.textContent = USER_ROLES[appState.session.role]?.label || "User";
}

function applyRolePermissions() {
  const role = appState.session.role;
  const perms = USER_ROLES[role]?.permissions || [];
  const hasAll = perms.includes("all");
  
  document.querySelectorAll(".nav-link").forEach(btn => {
    const tab = btn.dataset.tab;
    if (hasAll || perms.includes(tab) || tab === "team" || tab === "settings") {
      btn.style.display = "block";
    } else {
      btn.style.display = "none";
    }
  });
}

function setupNavigation() {
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => 
        p.classList.toggle("hidden", p.id !== "tab-" + tab)
      );
      if (tab === "calendar") renderCalendar();
      if (tab === "metrics") renderMetrics();
      if (tab === "discrepancies") renderDiscrepancies();
      if (tab === "settings") renderSettings();
    };
  });
}

/* ========= CSV UPLOAD ========= */
function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const parsed = parseCSVRobust(text);
    processOrdersFromCSV(parsed);
    $("csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
    logChange("CSV Uploaded", { count: parsed.length });
    renderAll();
    checkAlerts();
  };
  reader.readAsText(file);
}

function parseCSVRobust(text) {
  const rows = [];
  let row = [], val = "", q = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (q && text[i + 1] === '"') {
        val += '"';
        i++;
      } else {
        q = !q;
      }
    } else if (ch === "," && !q) {
      row.push(val.trim());
      val = "";
    } else if ((ch === "\n" || ch === "\r") && !q) {
      if (val.length || row.length) {
        row.push(val.trim());
        rows.push(row);
        row = [];
        val = "";
      }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      val += ch;
    }
  }
  if (val.length || row.length) {
    row.push(val.trim());
    rows.push(row);
  }

  const header = rows.shift().map(h => h.trim().toUpperCase());
  return rows
    .filter(r => r.some(c => String(c).trim() !== ""))
    .map(r => {
      const o = {};
      header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

function normalizeOrderRow(row) {
  const startDate = row["START DATE"] || "";
  const cancelDate = row["CANCEL DATE"] || "";
  
  let readyDate = startDate;
  if (cancelDate && startDate) {
    const sd = parseYMD(startDate);
    const cd = parseYMD(cancelDate);
    if (sd && cd && sd > cd) {
      readyDate = cancelDate;
    }
  }
  
  const today = new Date(todayYMD());
  const shipBy = parseYMD(readyDate || startDate || cancelDate);
  let priority = "LOW";
  if (shipBy) {
    if (shipBy <= today) priority = "HIGH";
    else if (shipBy <= addDays(today, 1)) priority = "MEDIUM";
  }
  
  const carrier = (row["CARRIER"] || "").toUpperCase();
  let loadType = row["LOAD TYPE"] || "LTL";
  if (carrier.includes("UPS") || carrier.includes("FXG") || carrier.includes("FEDEX")) {
    loadType = "Small Parcel";
  }
  
  // Check center patterns
  const store = row["STORE"]?.trim() || "";
  const center = row["CENTER"]?.trim() || "";
  let predictedCenter = center;
  if (store && !center) {
    const pattern = appState.centerPatterns.find(p => p.store === store);
    if (pattern) predictedCenter = pattern.center;
  }
  
  return {
    id: crypto.randomUUID(),
    po: row["PO"]?.trim() || "",
    bol: row["BOL"]?.trim() || "",
    masterBol: row["MASTER BOL"]?.trim() || "",
    customer: row["CUSTOMER"]?.trim() || "",
    customerCode: row["CUSTOMER CODE"]?.trim() || "",
    carrier: row["CARRIER"]?.trim() || "",
    store: store,
    center: center,
    predictedCenter: predictedCenter,
    startDate: startDate,
    cancelDate: cancelDate,
    readyDate: readyDate,
    requestedShipDate: row["REQUESTED SHIP DATE"] || "",
    units: Number(String(row["UNITS"] || 0).replace(/,/g, "")) || 0,
    cartons: Number(String(row["CARTONS"] || 0).replace(/,/g, "")) || 0,
    weight: Number(String(row["WEIGHT"] || 0).replace(/,/g, "")) || 0,
    totalCubic: Number(String(row["TOTAL CUBIC"] || 0).replace(/,/g, "")) || 0,
    ttlAmt: Number(String(row["TTL AMT"] || 0).replace(/,/g, "")) || 0,
    style: row["STYLE"] || "",
    color: row["COLOR"] || "",
    size: row["SIZE"] || "",
    department: row["DEPARTMENT"] || "",
    brand: row["BRAND"] || "",
    season: row["SEASON"] || "",
    shipToName: row["SHIP TO NAME"] || "",
    shipToCity: row["SHIP TO CITY"] || "",
    shipToState: row["SHIP TO STATE"] || "",
    shipToZip: row["SHIP TO ZIP"] || "",
    waveNumber: row["WAVE NUMBER"] || "",
    orderType: row["ORDER TYPE"] || "",
    orderStatus: row["ORDER STATUS"] || "",
    waveStatus: row["WAVE STATUS"] || "",
    warehouseLocation: row["WAREHOUSE LOCATION"] || "",
    notes: row["NOTES"] || "",
    loadType: loadType,
    priority: priority,
    isSPS: isSPSCarrier(row["CARRIER"]),
    timeBlock: "",
    assignedTruckId: null
  };
}

function processOrdersFromCSV(parsedRows) {
  const existing = new Map(appState.orders.map(o => [o.po + o.bol, o]));
  
  parsedRows.forEach(row => {
    const normalized = normalizeOrderRow(row);
    const key = normalized.po + normalized.bol;
    
    if (existing.has(key)) {
      const current = existing.get(key);
      const preserved = {
        timeBlock: current.timeBlock,
        assignedTruckId: current.assignedTruckId,
        id: current.id
      };
      Object.assign(current, normalized, preserved);
    } else {
      appState.orders.push(normalized);
      existing.set(key, normalized);
    }
  });
  
  saveState();
}

/* ========= ORDERS RENDERING ========= */
function renderOrders() {
  const tb = $("orders-body");
  if (!tb) return;
  
  const q = ($("orders-search")?.value || "").toLowerCase();
  
  filteredOrders = appState.orders.filter(o => {
    const quick = Object.values(o).some(v => 
      String(v || "").toLowerCase().includes(q)
    );
    if (!quick) return false;
    
    for (const f of dynamicFilters) {
      if (String(o[f.col] || "") !== f.value) return false;
    }
    return true;
  });
  
  tb.innerHTML = "";
  
  filteredOrders.forEach(o => {
    const tr = document.createElement("tr");
    
    const rowClass = o.priority === "HIGH" ? "row-danger" : 
                     o.priority === "MEDIUM" ? "row-warn" : "";
    tr.className = rowClass;
    
    const priorityBadge = `<span class="priority-badge priority-${o.priority.toLowerCase()}">${o.priority}</span>`;
    const spsBadge = o.isSPS ? '<span class="sps-badge">SPS</span>' : '';
    const centerBadge = o.center ? `<span class="center-badge">${o.center}</span>` : 
                        o.predictedCenter ? `<span class="center-badge predicted">${o.predictedCenter}</span>` : '';
    
    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${o.po}" ${selectedPOs.has(o.po) ? "checked" : ""}></td>
      <td>${o.po}</td>
      <td>${o.customer || ""}${centerBadge}</td>
      <td>${o.carrier || ""}${spsBadge}</td>
      <td>${o.units || ""}</td>
      <td>${o.cartons || ""}</td>
      <td>${o.bol || ""}</td>
      <td>${o.masterBol || ""}</td>
      <td>${o.startDate || ""}</td>
      <td>${o.cancelDate || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o.assignedTruckId || "-"}</td>
    `;
    tb.appendChild(tr);
  });
  
  document.querySelectorAll(".po-check").forEach(chk => {
    chk.onchange = (e) => {
      const po = e.target.dataset.po;
      if (e.target.checked) selectedPOs.add(po);
      else selectedPOs.delete(po);
      $("selected-count").textContent = selectedPOs.size;
    };
  });
  
  $("selected-count").textContent = selectedPOs.size;
  updateAssignDropdown();
}

function updateAssignDropdown() {
  const sel = $("assign-existing-load");
  if (sel) {
    sel.innerHTML = `<option value="">Assign to existing...</option>` +
      appState.truckloads.map(t => 
        `<option value="${t.loadId}">${t.loadId} — ${t.customer || ""}</option>`
      ).join("");
  }
}

function applyQuickFilter(type) {
  dynamicFilters.length = 0;
  if ($("orders-search")) $("orders-search").value = "";
  
  if (type === "high") {
    dynamicFilters.push({ col: "priority", value: "HIGH" });
  } else if (type === "unassigned") {
    filteredOrders = appState.orders.filter(o => !o.assignedTruckId);
    renderOrdersFiltered(filteredOrders);
    return;
  } else if (type === "today") {
    dynamicFilters.push({ col: "readyDate", value: todayYMD() });
  }
  
  renderOrders();
}

function renderOrdersFiltered(orders) {
  const tb = $("orders-body");
  if (!tb) return;
  tb.innerHTML = "";
  
  orders.forEach(o => {
    const tr = document.createElement("tr");
    const rowClass = o.priority === "HIGH" ? "row-danger" : 
                     o.priority === "MEDIUM" ? "row-warn" : "";
    tr.className = rowClass;
    
    const priorityBadge = `<span class="priority-badge priority-${o.priority.toLowerCase()}">${o.priority}</span>`;
    const spsBadge = o.isSPS ? '<span class="sps-badge">SPS</span>' : '';
    
    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${o.po}" ${selectedPOs.has(o.po) ? "checked" : ""}></td>
      <td>${o.po}</td>
      <td>${o.customer || ""}</td>
      <td>${o.carrier || ""}${spsBadge}</td>
      <td>${o.units || ""}</td>
      <td>${o.cartons || ""}</td>
      <td>${o.bol || ""}</td>
      <td>${o.masterBol || ""}</td>
      <td>${o.startDate || ""}</td>
      <td>${o.cancelDate || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o.assignedTruckId || "-"}</td>
    `;
    tb.appendChild(tr);
  });
  
  document.querySelectorAll(".po-check").forEach(chk => {
    chk.onchange = (e) => {
      const po = e.target.dataset.po;
      if (e.target.checked) selectedPOs.add(po);
      else selectedPOs.delete(po);
      $("selected-count").textContent = selectedPOs.size;
    };
  });
}

/* ========= TRUCKLOAD CREATION ========= */
function showCreateTruckModal() {
  if (selectedPOs.size === 0) {
    alert("Select at least one PO.");
    return;
  }
  
  const rows = appState.orders.filter(o => selectedPOs.has(o.po));
  
  $("modal-selected-pos").textContent = `POs: ${[...selectedPOs].slice(0, 5).join(", ")}${selectedPOs.size > 5 ? "..." : ""}`;
  $("tl-load-id").value = `LOAD-${Date.now()}`;
  $("tl-load-type").value = "Truckload";
  $("tl-pickup-date").value = earliestDate(rows.map(r => r.readyDate || r.startDate));
  $("tl-pickup-window").value = TIME_BLOCKS[0].window;
  $("tl-carrier").value = mostCommon(rows.map(r => r.carrier));
  $("tl-customer").value = mostCommon(rows.map(r => r.customer));
  $("tl-bol").value = mostCommon(rows.map(r => r.bol));
  
  $("modal-overlay").classList.remove("hidden");
}

function saveTruckload() {
  const rows = appState.orders.filter(o => selectedPOs.has(o.po));
  
  const newTruck = {
    loadId: $("tl-load-id").value.trim() || `LOAD-${Date.now()}`,
    loadType: $("tl-load-type").value,
    customer: $("tl-customer").value.trim() || mostCommon(rows.map(r => r.customer)),
    carrier: $("tl-carrier").value.trim() || mostCommon(rows.map(r => r.carrier)),
    pickupDate: $("tl-pickup-date").value,
    pickupWindow: $("tl-pickup-window").value,
    bol: $("tl-bol").value.trim() || mostCommon(rows.map(r => r.bol)),
    masterBol: mostCommon(rows.map(r => r.masterBol)),
    cartons: rows.reduce((s, r) => s + (r.cartons || 0), 0),
    units: rows.reduce((s, r) => s + (r.units || 0), 0),
    weight: rows.reduce((s, r) => s + (r.weight || 0), 0),
    totalCubic: rows.reduce((s, r) => s + (r.totalCubic || 0), 0),
    ttlAmt: rows.reduce((s, r) => s + (r.ttlAmt || 0), 0),
    stagedLocationSL: "",
    stagedLocationDD: "",
    assignedTo: [],
    loadedBy: [],
    status: "Not Started",
    departed: false,
    orders: rows.map(o => o.po),
    stagingLog: [{
      ts: new Date().toISOString(),
      action: "Truckload created",
      user: appState.session.email,
      note: `Created with ${rows.length} orders`
    }],
    createdAt: new Date().toISOString()
  };
  
  appState.truckloads.push(newTruck);
  
  appState.orders = appState.orders.map(o => {
    if (selectedPOs.has(o.po)) {
      return { ...o, assignedTruckId: newTruck.loadId };
    }
    return o;
  });
  
  selectedPOs.clear();
  $("modal-overlay").classList.add("hidden");
  logChange("Truckload Created", { loadId: newTruck.loadId });
  saveState();
  renderAll();
  checkAlerts();
}

/* ========= AUTO-ROUTER ========= */
function runAutoRouter() {
  const ordersToRoute = selectedPOs.size > 0
    ? appState.orders.filter(o => selectedPOs.has(o.po))
    : appState.orders.filter(o => !o.assignedTruckId);
  
  if (ordersToRoute.length === 0) {
    alert("No orders to route");
    return;
  }
  
  autoProposals = buildAutoProposals(ordersToRoute);
  renderAutoRouteModal();
}

function buildAutoProposals(ordersToRoute) {
  const proposals = [];
  const today = new Date(todayYMD());
  const plus2 = addDays(today, 2);
  
  // Apply customer rules
  ordersToRoute.forEach(o => {
    const rule = appState.customerRules.find(r => r.customer === o.customer);
    if (rule) {
      if (rule.defaultCarrier && !o.carrier) o.carrier = rule.defaultCarrier;
      if (rule.defaultTimeBlock && !o.timeBlock) o.timeBlock = rule.defaultTimeBlock;
    }
  });
  
  // Separate SPS
  const spsOrders = ordersToRoute.filter(o => o.isSPS && parseYMD(o.startDate) <= plus2);
  const regularOrders = ordersToRoute.filter(o => !o.isSPS || parseYMD(o.startDate) > plus2);
  
  // Build SPS trucks
  const spsByCarrier = new Map();
  spsOrders.forEach(o => {
    const key = `${o.carrier}|${o.readyDate || o.startDate}`;
    if (!spsByCarrier.has(key)) spsByCarrier.set(key, []);
    spsByCarrier.get(key).push(o);
  });
  
  for (const [key, orders] of spsByCarrier) {
    const [carrier, date] = key.split('|');
    proposals.push({
      id: `SPS-${Date.now()}-${proposals.length}`,
      type: "SPS",
      loadType: "Small Parcel",
      carrier,
      customer: "Multiple",
      date,
      window: TIME_BLOCKS[0].window,
      orders,
      units: orders.reduce((s, o) => s + (o.units || 0), 0),
      cartons: orders.reduce((s, o) => s + (o.cartons || 0), 0),
      ttlAmt: orders.reduce((s, o) => s + (o.ttlAmt || 0), 0),
      fill: 0
    });
  }
  
  // Group by center first, then by customer/carrier
  const byCenter = new Map();
  const noCenter = [];
  
  regularOrders.forEach(o => {
    const center = o.center || o.predictedCenter;
    if (center) {
      if (!byCenter.has(center)) byCenter.set(center, []);
      byCenter.get(center).push(o);
    } else {
      noCenter.push(o);
    }
  });
  
  // Build center trucks
  for (const [center, orders] of byCenter) {
    let remaining = [...orders];
    
    while (remaining.length > 0) {
      const chunk = [];
      let units = 0;
      let cartons = 0;
      
      for (const o of remaining) {
        if (units + o.units <= MAX_UNITS_PER_TRUCK && cartons + o.cartons <= MAX_CARTS_PER_TRUCK) {
          chunk.push(o);
          units += o.units;
          cartons += o.cartons;
        }
