// NCDC Shipping Dashboard - Full JavaScript (Rebuilt for BlueCherry CSV + Author#)
// VERSION: 2.1

/* ========= CONSTANTS ========= */
const STORAGE_KEY = "ncdcShippingStateV10"; // keep same key so existing state still works
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

// Generate staging locations
const SL_LANES = [];
for (let i = 18; i <= 220; i++) SL_LANES.push(`SL${i}A`);
for (let i = 18; i <= 99; i++) SL_LANES.push(`SL${i}B`);
for (let i = 18; i <= 25; i++) SL_LANES.push(`SL${i}C`);

const DD_DOORS = [];
for (let i = 2; i <= 6; i++) DD_DOORS.push(`DD${i}`);
for (let i = 12; i <= 73; i++) DD_DOORS.push(`DD${i}`);

const USER_ROLES = {
  admin: { label: "Admin", permissions: ["all"] },
  router: {
    label: "Router",
    // give router access to discrepancies too (per your last answer)
    permissions: ["orders", "truckloads", "calendar", "metrics", "history", "discrepancies"]
  },
  dock: { label: "Dock Lead", permissions: ["dock", "todays", "truckloads", "history"] },
  supervisor: { label: "Supervisor", permissions: ["all"] }
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

/* ========= DOM / UTILITIES ========= */
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

const sumNumber = (rows, col) => {
  return rows.reduce(
    (s, x) => s + (parseFloat(String(x[col] || "").replace(/,/g, "")) || 0),
    0
  );
};

const earliestDate = (arr) => {
  const dates = arr.map(x => parseYMD(x)).filter(x => x && x > 0);
  if (!dates.length) return "";
  dates.sort((a, b) => a - b);
  return ymd(dates[0]);
};

const isSPSCarrier = (carrier) => {
  const c = (carrier || "").toUpperCase();
  return c.includes("UPS") || c.includes("FXG") || c.includes("FEDEX GROUND") || c.includes("SPS");
};

function chooseFirstNonEmpty(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

/* ========= BLUECHERRY CSV MAPPING ========= */
// Map one BlueCherry CSV row into the dashboard's expected columns
function mapBlueCherryRowToOrder(raw) {
  const o = {};

  // Core keys used by Orders grid
  o.PO = chooseFirstNonEmpty(raw["PO Num"], raw["PO"], raw["PO#"]);
  o.Customer = chooseFirstNonEmpty(raw["Customer"], raw["Cust Name"]);
  o.Carrier = chooseFirstNonEmpty(raw["Shipper"], raw["Carrier"]);

  // Units and cartons
  o.Units = chooseFirstNonEmpty(
    raw["TTL QTY"],
    raw["TTL Qty"],
    raw["TTL_QTY"],
    raw["TTLQTY"]
  );

  const packed = chooseFirstNonEmpty(
    raw["Packed Cartons"],
    raw["Packed Carton"]
  );
  const estCartons = chooseFirstNonEmpty(
    raw["Est. Cartons"],
    raw["Est. Carton"]
  );

  // Prefer packed cartons when > 0, otherwise use estimate
  o.Cartons = chooseFirstNonEmpty(
    packed && packed !== "0" ? packed : "",
    estCartons,
    packed
  );

  // BOLs
  o.BOL = chooseFirstNonEmpty(raw["BOL#"], raw["BOL"]);
  o["Master BOL"] = chooseFirstNonEmpty(raw["Master BOL#"], raw["Master BOL"]);

  // Dates (mirror CSV so grid matches exactly)
  o["Start Date"] = chooseFirstNonEmpty(raw["Start Date"], raw["Pick Proc Date"]);
  o["Cancel Date"] = raw["Cancel Date"] || "";
  o["Ready Date"] = raw["Ready Date"] || "";
  o["Ready Time"] = raw["Ready Time"] || "";

  // Weight for auto-router
  o.Weight = chooseFirstNonEmpty(raw["Total Weight"], raw["TotalWeight"]);

  // Load ID comes from Author# in your current export
  const author = chooseFirstNonEmpty(raw["Author#"], raw["Author"]);
  o["Load ID"] = author ? String(author).trim() : (raw["Load ID"] || "");

  // Keep a few raw refs if you ever want them later
  o.__rawDivision = raw["Division"] || "";
  o.__rawWave = raw["Wave#"] || "";
  o.__rawRouter = raw["Router"] || "";
  o.__rawRouteDate = raw["Route Date"] || "";
  o.__rawScheduledDate = raw["Scheduled Date"] || "";

  return o;
}

// Detect delimiter (tab vs comma) and parse BlueCherry file
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];

  // Detect delimiter: BC export is usually tab-delimited even if extension is .csv
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";

  const headers = headerLine
    .split(delimiter)
    .map(h => h.trim().replace(/^"|"$/g, ""));

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line
      .split(delimiter)
      .map(v => v.trim().replace(/^"|"$/g, ""));

    const raw = {};
    headers.forEach((h, idx) => {
      raw[h] = values[idx] ?? "";
    });

    // Normalize this BC row into the dashboard shape
    rows.push(mapBlueCherryRowToOrder(raw));
  }

  return rows;
}

/* ========= DERIVED FIELDS / MERGE ========= */
function computeOrderDerived(order) {
  const units = parseFloat(String(order.Units || 0).replace(/,/g, "")) || 0;
  const cartons = parseFloat(String(order.Cartons || 0).replace(/,/g, "")) || 0;

  order.__units = units;
  order.__cartons = cartons;

  const startDate = parseYMD(order["Start Date"]);
  const cancelDate = parseYMD(order["Cancel Date"]);

  let shipBy = startDate || cancelDate || new Date();
  order.__shipBy = ymd(shipBy);
  order.__recommendedShip =
    cancelDate && shipBy > cancelDate ? ymd(cancelDate) : order.__shipBy;

  const today = new Date(todayYMD());
  const sb = parseYMD(order.__shipBy);

  order.__priority =
    sb <= today ? "HIGH" :
    sb <= addDays(today, 1) ? "MEDIUM" :
    "LOW";

  order.__isSPS = isSPSCarrier(order.Carrier);

  return order;
}

function mergeOrders(newOrders) {
  const keyFor = (o) => (o.PO || "").trim() || `${o.BOL}|${o.Customer}|${o.Units}`;
  const map = new Map(appState.orders.map(o => [keyFor(o), o]));

  newOrders.forEach(nr => {
    const k = keyFor(nr);
    if (map.has(k)) {
      const cur = map.get(k);
      const merged = {
        ...cur,
        ...nr,
        "Ready Date": cur["Ready Date"] || nr["Ready Date"],
        "Ready Time": cur["Ready Time"] || nr["Ready Time"],
        "Load ID": cur["Load ID"] || nr["Load ID"]
      };
      map.set(k, computeOrderDerived(merged));
    } else {
      map.set(k, computeOrderDerived(nr));
    }
  });

  appState.orders = [...map.values()];
  saveState();
}

// Build / refresh truckloads based on orders' Load ID (from Author#)
function rebuildTruckloadsFromOrders() {
  const groups = new Map();

  // Group orders by each Load ID (can be comma-separated list)
  appState.orders.forEach(o => {
    const loadIdField = (o["Load ID"] || "").trim();
    if (!loadIdField) return;

    loadIdField
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(id => {
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(o);
      });
  });

  groups.forEach((orders, loadId) => {
    let truck = appState.truckloads.find(t => t.loadId === loadId);

    const units = sumNumber(orders, "Units");
    const cartons = sumNumber(orders, "Cartons");
    const weight = sumNumber(orders, "Weight");
    const customer = mostCommon(orders.map(o => o.Customer));
    const carrier = mostCommon(orders.map(o => o.Carrier));
    const bol = mostCommon(orders.map(o => o.BOL));
    const masterBol = mostCommon(orders.map(o => o["Master BOL"]));
    const pickupDate = earliestDate(
      orders.map(o => o["Ready Date"] || o["Start Date"] || o["Cancel Date"])
    );

    if (!truck) {
      // New truck coming from CSV
      truck = {
        loadId,
        loadType: "Truckload", // default; you can manually change per load later
        customer,
        carrier,
        pickupDate,
        pickupWindow: TIME_BLOCKS[0].window,
        bol,
        masterBol,
        cartons,
        units,
        weight,
        stagedLocationSL: "",
        stagedLocationDD: "",
        assignedTo: [],
        loadedBy: [],
        status: "Not Started",
        departed: false,
        orders: orders.map(o => o.PO),
        stagingLog: [
          {
            ts: new Date().toISOString(),
            action: "Created from CSV (Author#)",
            user: appState.session.email || "System",
            note: `${orders.length} orders`
          }
        ],
        createdAt: new Date().toISOString()
      };
      appState.truckloads.push(truck);
    } else {
      // Existing truck – refresh core aggregates but keep status/history
      truck.customer = customer || truck.customer;
      truck.carrier = carrier || truck.carrier;
      truck.bol = bol || truck.bol;
      truck.masterBol = masterBol || truck.masterBol;
      truck.units = units;
      truck.cartons = cartons;
      truck.weight = weight;
      truck.pickupDate = pickupDate || truck.pickupDate;

      const existing = new Set(truck.orders || []);
      orders.forEach(o => existing.add(o.PO));
      truck.orders = [...existing];
    }
  });

  saveState();
}

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

  // Overdue orders (high priority, no load)
  appState.orders.forEach(o => {
    if (o.__priority === "HIGH" && !o["Load ID"]) {
      alerts.push({
        id: `overdue-${o.PO}`,
        type: "error",
        message: `Order ${o.PO} is overdue and not assigned`
      });
    }
  });

  // Time blocks near capacity – ONLY Truckload & Floorload (your answer #5)
  TIME_BLOCKS.forEach(block => {
    const used = appState.truckloads.filter(t =>
      t.pickupDate === today &&
      t.pickupWindow === block.window &&
      (t.loadType === "Truckload" || t.loadType === "Floorload")
    ).length;

    if (used >= 3) {
      alerts.push({
        id: `capacity-${block.window}`,
        type: "warning",
        message: `${block.label} is near capacity (${used}/4)`
      });
    }
  });

  // Trucks without staging for today
  appState.truckloads.forEach(t => {
    if (
      sameDate(t.pickupDate, today) &&
      !t.stagedLocationSL &&
      !t.stagedLocationDD &&
      t.status !== "Departed"
    ) {
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

  if (appState.alerts.length > 0) {
    badge.classList.remove("hidden");
    const errors = appState.alerts.filter(a => a.type === "error").length;
    const warnings = appState.alerts.filter(a => a.type === "warning").length;
    countEl.innerHTML = `${errors > 0 ? `🔴 ${errors}` : ""} ${warnings > 0 ? `⚠️ ${warnings}` : ""}`;
  } else {
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
    checkAlerts();
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
  $("current-user-display").textContent = appState.session.email;
  $("current-role-badge").textContent =
    USER_ROLES[appState.session.role]?.label || "User";
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
    };
  });
}

/* ========= CSV UPLOAD HANDLER ========= */
function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;

    const parsed = parseCSV(text);                     // BlueCherry-aware + Author#
    const processed = parsed.map(o => computeOrderDerived(o));
    mergeOrders(processed);                            // merge into appState.orders
    rebuildTruckloadsFromOrders();                     // rebuild trucks from Load ID/Author#

    $("csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
    logChange("CSV Uploaded", { count: processed.length });
    renderAll();
    checkAlerts();
  };
  reader.readAsText(file);
}
/* ========= ORDERS RENDERING ========= */

function renderOrders() {
  const tb = $("orders-body");
  if (!tb) return;

  const q = ($("orders-search")?.value || "").toLowerCase();

  filteredOrders = appState.orders.filter(o => {
    // text match
    const quick = Object.values(o).some(v =>
      String(v || "").toLowerCase().includes(q)
    );
    if (!quick) return false;

    // match column filters
    for (const f of dynamicFilters) {
      if (String(o[f.col] || "") !== f.value) return false;
    }
    return true;
  });

  tb.innerHTML = "";

  filteredOrders.forEach(o => {
    const po = o.PO || "";
    const priorityBadge = `<span class="priority-badge priority-${o.__priority.toLowerCase()}">${o.__priority}</span>`;
    const spsBadge = o.__isSPS ? '<span class="sps-badge">SPS</span>' : '';

    const tr = document.createElement("tr");
    tr.className =
      o.__priority === "HIGH" ? "row-danger" :
      o.__priority === "MEDIUM" ? "row-warn" : "";

    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${po}" ${selectedPOs.has(po) ? "checked" : ""}></td>
      <td>${po}</td>
      <td>${o.Customer || ""}</td>
      <td>${o.Carrier || ""}${spsBadge}</td>
      <td>${o.Units || ""}</td>
      <td>${o.Cartons || ""}</td>
      <td>${o.BOL || ""}</td>
      <td>${o["Master BOL"] || ""}</td>
      <td>${o["Start Date"] || ""}</td>
      <td>${o["Cancel Date"] || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o["Load ID"] || "-"}</td>
    `;

    tb.appendChild(tr);
  });

  // checkbox handlers
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
  if (!sel) return;

  sel.innerHTML =
    `<option value="">Assign to existing...</option>` +
    appState.truckloads.map(t =>
      `<option value="${t.loadId}">${t.loadId} — ${t.customer || ""}</option>`
    ).join("");
}

/* ========= QUICK FILTERS ========= */
function applyQuickFilter(type) {
  dynamicFilters.length = 0;
  $("orders-search").value = "";

  if (type === "high") {
    dynamicFilters.push({ col: "__priority", value: "HIGH" });
  } else if (type === "unassigned") {
    dynamicFilters.push({ col: "Load ID", value: "" });
  } else if (type === "today") {
    dynamicFilters.push({ col: "__shipBy", value: todayYMD() });
  }

  renderOrders();
}

/* ========= CREATE TRUCKLOAD ========= */

function showCreateTruckModal() {
  if (selectedPOs.size === 0) {
    alert("Select at least one PO.");
    return;
  }

  const rows = appState.orders.filter(o => selectedPOs.has(o.PO));

  $("modal-selected-pos").textContent =
    `POs: ${[...selectedPOs].slice(0, 5).join(", ")}${selectedPOs.size > 5 ? "..." : ""}`;

  // Generate a new load ID in your confirmed format: TL-YYYYMMDD-###
  const dateStr = todayYMD().replace(/-/g, "");
  const seq = (appState.truckloads.length + 1).toString().padStart(3, "0");
  $("tl-load-id").value = `TL-${dateStr}-${seq}`;

  $("tl-load-type").value = "Truckload";
  $("tl-pickup-date").value = earliestDate(rows.map(r => r.__recommendedShip));
  $("tl-pickup-window").value = TIME_BLOCKS[0].window;
  $("tl-carrier").value = mostCommon(rows.map(r => r.Carrier));
  $("tl-customer").value = mostCommon(rows.map(r => r.Customer));
  $("tl-bol").value = mostCommon(rows.map(r => r.BOL));

  $("modal-overlay").classList.remove("hidden");
}

function saveTruckload() {
  const rows = appState.orders.filter(o => selectedPOs.has(o.PO));

  const newTruck = {
    loadId: $("tl-load-id").value.trim(),
    loadType: $("tl-load-type").value,
    customer: $("tl-customer").value.trim() || mostCommon(rows.map(r => r.Customer)),
    carrier: $("tl-carrier").value.trim() || mostCommon(rows.map(r => r.Carrier)),
    pickupDate: $("tl-pickup-date").value,
    pickupWindow: $("tl-pickup-window").value,
    bol: $("tl-bol").value.trim() || mostCommon(rows.map(r => r.BOL)),
    masterBol: mostCommon(rows.map(r => r["Master BOL"])),

    cartons: sumNumber(rows, "Cartons"),
    units: sumNumber(rows, "Units"),
    weight: sumNumber(rows, "Weight"),

    stagedLocationSL: "",
    stagedLocationDD: "",
    assignedTo: [],
    loadedBy: [],
    status: "Not Started",
    departed: false,
    orders: rows.map(o => o.PO),

    stagingLog: [{
      ts: new Date().toISOString(),
      action: "Truckload created",
      user: appState.session.email,
      note: `Created with ${rows.length} orders`
    }],

    createdAt: new Date().toISOString()
  };

  appState.truckloads.push(newTruck);

  // Update orders with Load ID
  appState.orders = appState.orders.map(o => {
    if (selectedPOs.has(o.PO)) {
      const list = new Set((o["Load ID"] || "").split(",").map(x => x.trim()).filter(Boolean));
      list.add(newTruck.loadId);
      return { ...o, "Load ID": [...list].join(", ") };
    }
    return o;
  });

  selectedPOs.clear();
  $("modal-overlay").classList.add("hidden");

  logChange("Truckload Created", { loadId: newTruck.loadId });
  renderAll();
  checkAlerts();
}

/* ========= AUTO-ROUTER ========= */

function runAutoRouter() {
  const ordersToRoute = selectedPOs.size > 0
    ? appState.orders.filter(o => selectedPOs.has(o.PO))
    : appState.orders.filter(o => !o["Load ID"]);

  if (ordersToRoute.length === 0) {
    alert("No eligible orders to auto-route.");
    return;
  }

  autoProposals = buildAutoProposals(ordersToRoute);
  renderAutoRouteModal();
}

function buildAutoProposals(ordersToRoute) {
  const proposals = [];
  const today = new Date(todayYMD());
  const plus2 = addDays(today, 2);

  // Separate SPS
  const spsOrders = ordersToRoute.filter(
    o => o.__isSPS && parseYMD(o["Start Date"]) <= plus2
  );
  const regular = ordersToRoute.filter(
    o => !o.__isSPS || parseYMD(o["Start Date"]) > plus2
  );

  // Group SPS by Carrier + Date
  const spsByCarrier = new Map();
  spsOrders.forEach(o => {
    const key = `${o.Carrier}|${o.__recommendedShip}`;
    if (!spsByCarrier.has(key)) spsByCarrier.set(key, []);
    spsByCarrier.get(key).push(o);
  });

  for (const [key, orders] of spsByCarrier) {
    const [carrier, date] = key.split("|");

    proposals.push({
      id: `SP-${Date.now()}-${proposals.length}`,
      type: "SPS",
      loadType: "Small Parcel",
      carrier,
      customer: "Multiple",
      date,
      window: TIME_BLOCKS[0].window,
      orders,
      units: sumNumber(orders, "Units"),
      cartons: sumNumber(orders, "Cartons"),
      fill: 0
    });
  }

  // Regular trucks grouped by Customer + Carrier
  const group = new Map();
  regular.forEach(o => {
    const key = `${o.Customer}|${o.Carrier}`;
    if (!group.has(key)) group.set(key, []);
    group.get(key).push(o);
  });

  for (const [key, rows] of group) {
    const [customer, carrier] = key.split("|");

    let remaining = [...rows];
    while (remaining.length > 0) {
      const chunk = [];
      let units = 0;
      let cartons = 0;

      for (const o of remaining) {
        if (units + o.__units <= MAX_UNITS_PER_TRUCK &&
            cartons + o.__cartons <= MAX_CARTS_PER_TRUCK) {
          chunk.push(o);
          units += o.__units;
          cartons += o.__cartons;
        }
      }

      if (chunk.length === 0) chunk.push(remaining[0]);
      remaining = remaining.filter(o => !chunk.includes(o));

      const date = earliestDate(chunk.map(o => o.__recommendedShip));
      const fill = Math.round(
        Math.min(units / MAX_UNITS_PER_TRUCK, cartons / MAX_CARTS_PER_TRUCK) * 100
      );

      proposals.push({
        id: `TL-${todayYMD().replace(/-/g, "")}-${String(proposals.length+1).padStart(3,"0")}`,
        type: "Truckload",
        loadType: fill > 70 ? "Truckload" : "LTL",
        carrier,
        customer,
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
  const tb = $("auto-body");
  tb.innerHTML = "";

  autoProposals.forEach(p => {
    const fillClass =
      p.fill >= 80 ? "fill-high" :
      p.fill >= 50 ? "fill-medium" :
      "fill-low";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="auto-check" data-id="${p.id}" checked></td>
      <td>${p.id}</td>
      <td>${p.loadType}</td>
      <td>${p.customer}</td>
      <td>${p.carrier}</td>
      <td><input type="date" class="auto-date input-slim" data-id="${p.id}" value="${p.date}"></td>
      <td>
        <select class="auto-window input-slim" data-id="${p.id}">
          ${TIME_BLOCKS.map(b =>
            `<option value="${b.window}" ${b.window === p.window ? "selected" : ""}>${b.label}</option>`
          ).join("")}
        </select>
      </td>
      <td>${p.orders.length}</td>
      <td>${p.units.toLocaleString()}</td>
      <td>${p.cartons.toLocaleString()}</td>
      <td>
        <div class="fill-bar">
          <div class="fill-track">
            <div class="fill-value ${fillClass}" style="width:${p.fill}%"></div>
          </div>
          <span>${p.fill}%</span>
        </div>
      </td>
    `;
    tb.appendChild(tr);
  });

  $("auto-summary").textContent =
    `${autoProposals.length} proposed loads • ` +
    `${autoProposals.reduce((s, p) => s + p.units, 0).toLocaleString()} units • ` +
    `${autoProposals.reduce((s, p) => s + p.cartons, 0).toLocaleString()} cartons`;

  $("auto-overlay").classList.remove("hidden");
}

function confirmAutoRoute() {
  const selectedIds = new Set(
    [...document.querySelectorAll(".auto-check:checked")].map(c => c.dataset.id)
  );

  const toCreate = autoProposals.filter(p => selectedIds.has(p.id));

  toCreate.forEach(p => {
    // pull user edits
    const dateEl = document.querySelector(`.auto-date[data-id="${p.id}"]`);
    const windowEl = document.querySelector(`.auto-window[data-id="${p.id}"]`);

    const newTruck = {
      loadId: p.id,
      loadType: p.loadType,
      customer: p.customer,
      carrier: p.carrier,
      pickupDate: dateEl?.value || p.date,
      pickupWindow: windowEl?.value || p.window,
      bol: mostCommon(p.orders.map(o => o.BOL)),
      masterBol: mostCommon(p.orders.map(o => o["Master BOL"])),
      cartons: p.cartons,
      units: p.units,
      weight: sumNumber(p.orders, "Weight"),

      stagedLocationSL: "",
      stagedLocationDD: "",
      assignedTo: [],
      loadedBy: [],
      status: "Not Started",
      departed: false,
      orders: p.orders.map(o => o.PO),

      stagingLog: [{
        ts: new Date().toISOString(),
        action: "Created by Auto-Router",
        user: appState.session.email,
        note: `${p.orders.length} orders, ${p.fill}% fill`
      }],

      createdAt: new Date().toISOString()
    };

    appState.truckloads.push(newTruck);

    // update orders
    appState.orders = appState.orders.map(o => {
      if (p.orders.find(x => x.PO === o.PO)) {
        const list = new Set((o["Load ID"] || "").split(",").map(x => x.trim()).filter(Boolean));
        list.add(newTruck.loadId);
        return { ...o, "Load ID": [...list].join(", ") };
      }
      return o;
    });
  });

  $("auto-overlay").classList.add("hidden");
  selectedPOs.clear();
  logChange("Auto-Route Completed", { count: toCreate.length });
  renderAll();
  checkAlerts();
}

/* ========= DISCREPANCIES TAB ========= */

function detectDiscrepancies() {
  const list = [];

  // Duplicate PO Numbers
  const seen = new Map();
  appState.orders.forEach(o => {
    if (!o.PO) return;
    if (seen.has(o.PO)) {
      list.push({
        type: "Duplicate",
        po: o.PO,
        field: "PO",
        csvValue: o.PO,
        dashValue: "Multiple",
        loadIds: o["Load ID"] || ""
      });
    }
    seen.set(o.PO, true);
  });

  // Orders linked to truckloads that do not exist in Orders tab
  appState.truckloads.forEach(t => {
    (t.orders || []).forEach(po => {
      if (!appState.orders.find(o => o.PO === po)) {
        list.push({
          type: "Missing",
          po,
          field: "PO",
          csvValue: "Not in CSV",
          dashValue: "In Truckload",
          loadIds: t.loadId
        });
      }
    });
  });

  return list;
}

function renderDiscrepancies() {
  const tb = $("disc-body");
  if (!tb) return;

  const items = detectDiscrepancies();
  tb.innerHTML = "";

  if (items.length === 0) {
    tb.innerHTML =
      `<tr><td colspan="6" style="text-align:center;padding:40px;color:#059669;">✓ No discrepancies detected</td></tr>`;
    return;
  }

  items.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="priority-badge priority-high">${d.type}</span></td>
      <td>${d.po}</td>
      <td>${d.field}</td>
      <td>${d.csvValue}</td>
      <td>${d.dashValue}</td>
      <td>${d.loadIds}</td>
    `;
    tb.appendChild(tr);
  });
}

/* ========= DOCK TAB ========= */

function renderDock() {
  const tb = $("dock-body");
  if (!tb) return;

  const q = ($("dock-search")?.value || "").toLowerCase();
  tb.innerHTML = "";

  const loads = appState.truckloads
    .filter(t => !t.departed)
    .filter(t => {
      if (!q) return true;
      return [t.loadId, t.customer, t.carrier, t.status]
        .some(v => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => (a.pickupDate || "").localeCompare(b.pickupDate || ""));

  loads.forEach(t => {
    const statusClass =
      t.status === "Fully Staged" ? "status-staged" :
      t.status === "In Progress" ? "status-progress" :
      "";

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.customer || ""}</td>
      <td>${t.carrier || ""}</td>
      <td>${t.loadType || ""}</td>
      <td>${t.pickupDate || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons || 0}</td>

      <td>
        <select class="input-slim dock-sl" data-id="${t.loadId}">
          <option value="">-</option>
          ${SL_LANES.slice(0, 50).map(l =>
            `<option value="${l}" ${t.stagedLocationSL === l ? "selected" : ""}>${l}</option>`
          ).join("")}
        </select>
      </td>

      <td>
        <select class="input-slim dock-dd" data-id="${t.loadId}">
          <option value="">-</option>
          ${DD_DOORS.map(d =>
            `<option value="${d}" ${t.stagedLocationDD === d ? "selected" : ""}>${d}</option>`
          ).join("")}
        </select>
      </td>

      <td><span class="status-badge ${statusClass}">${t.status}</span></td>

      <td>
        <button class="btn tiny" onclick="setDockStatus('${t.loadId}', 'In Progress')">Start</button>
        <button class="btn tiny" onclick="setDockStatus('${t.loadId}', 'Fully Staged')">Staged</button>
        <button class="btn tiny secondary" onclick="showDockHistory('${t.loadId}')">🕐</button>
      </td>
    `;

    tb.appendChild(tr);
  });

  // conflict prevention (Truckload & Floorload only)
  document.querySelectorAll(".dock-sl").forEach(sel => {
    sel.onchange = () => updateDockLocation(sel.dataset.id, "stagedLocationSL", sel.value);
  });
  document.querySelectorAll(".dock-dd").forEach(sel => {
    sel.onchange = () => updateDockLocation(sel.dataset.id, "stagedLocationDD", sel.value);
  });
}

function updateDockLocation(loadId, field, value) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  // Only block TL and Floorload
  if (t.loadType === "Truckload" || t.loadType === "Floorload") {
    if (field === "stagedLocationDD" && value) {
      const conflict = appState.truckloads.find(x =>
        x.loadId !== t.loadId &&
        x.stagedLocationDD === value &&
        !x.departed
      );
      if (conflict) {
        alert(`Door ${value} already assigned to ${conflict.loadId}`);
        renderDock();
        return;
      }
    }
  }

  t[field] = value;
  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: `${field} updated`,
    user: appState.session.email,
    note: value
  });

  saveState();
  checkAlerts();
}

function setDockStatus(loadId, status) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  t.status = status;
  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: `Status: ${status}`,
    user: appState.session.email,
    note: ""
  });

  saveState();
  renderDock();
  logChange("Dock Status Updated", { loadId, status });
}

function showDockHistory(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  $("dock-history-title").textContent = `History: ${loadId}`;
  $("dock-history-info").innerHTML = `
    <div><strong>Customer:</strong> ${t.customer}</div>
    <div><strong>Carrier:</strong> ${t.carrier}</div>
    <div><strong>Pickup:</strong> ${t.pickupDate}</div>
    <div><strong>Status:</strong> ${t.status}</div>
  `;

  const tb = $("dock-history-body");
  tb.innerHTML = "";

  (t.stagingLog || []).forEach(log => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(log.ts).toLocaleString()}</td>
      <td>${log.action}</td>
      <td>${log.user}</td>
      <td>${log.note}</td>
    `;
    tb.appendChild(tr);
  });

  $("dock-history-overlay").classList.remove("hidden");
}

/* ========= TODAY’S PICKUPS ========= */

function renderTodays() {
  const tb = $("today-body");
  if (!tb) return;

  const today = todayYMD();
  const loads = appState.truckloads
    .filter(t => sameDate(t.pickupDate, today))
    .sort((a, b) => {
      const order = {
        "At Door": 1,
        "Fully Staged": 2,
        "In Progress": 3,
        "Not Started": 4,
        "Departed": 99
      };
      return (order[a.status] || 99) - (order[b.status] || 99);
    });

  tb.innerHTML = "";

  if (loads.length === 0) {
    tb.innerHTML =
      `<tr><td colspan="10" style="text-align:center;padding:40px;">No pickups scheduled for today</td></tr>`;
    return;
  }

  loads.forEach(t => {
    const statusClass =
      t.status === "Departed" ? "status-departed" :
      t.status === "At Door" ? "status-door" :
      t.status === "Fully Staged" ? "status-staged" :
      "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.customer || ""}</td>
      <td>${t.carrier || ""}</td>
      <td>${t.loadType || ""}</td>
      <td>${t.bol || ""}</td>
      <td>${t.masterBol || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons || 0}</td>
      <td><span class="status-badge ${statusClass}">${t.status}</span></td>

      <td>
        <button class="btn tiny" onclick="markArrived('${t.loadId}')" ${t.status === "Departed" ? "disabled" : ""}>Arrived</button>
        <button class="btn tiny" onclick="markDeparted('${t.loadId}')" ${t.status === "Departed" ? "disabled" : ""}>Departed</button>
      </td>
    `;

    tb.appendChild(tr);
  });
}

function markArrived(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  t.status = "At Door";
  t.arrivedAt = new Date().toISOString();

  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: "Arrived at door",
    user: appState.session.email,
    note: ""
  });

  saveState();
  renderTodays();
  logChange("Truck Arrived", { loadId });
}

function markDeparted(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  t.status = "Departed";
  t.departed = true;
  t.departedAt = new Date().toISOString();

  t.stagingLog.push({
    ts: new Date().toISOString(),
    action: "Departed",
    user: appState.session.email,
    note: ""
  });

  // Push to history
  if (!appState.history.find(h => h.loadId === loadId)) {
    appState.history.push({
      loadId: t.loadId,
      customer: t.customer,
      carrier: t.carrier,
      bol: t.bol,
      masterBol: t.masterBol,
      pickupDate: t.pickupDate,
      pickupWindow: t.pickupWindow,
      departedAt: t.departedAt
    });
  }

  saveState();
  renderTodays();
  renderHistory();
  logChange("Truck Departed", { loadId });
}

/* ========= TRUCKLOADS TAB ========= */

function renderTruckloads() {
  const tb = $("truckloads-body");
  if (!tb) return;

  const q = ($("truckloads-search")?.value || "").toLowerCase();

  const loads = appState.truckloads.filter(t => {
    if (!q) return true;
    return [t.loadId, t.customer, t.carrier, t.status]
      .some(v => String(v || "").toLowerCase().includes(q));
  });

  tb.innerHTML = "";

  loads.forEach(t => {
    const statusClass =
      t.status === "Departed" ? "status-departed" :
      t.status === "Fully Staged" ? "status-staged" :
      "";

    const tr = document.createElement("tr");
    tr.onclick = () => showTruckDetail(t.loadId);

    tr.innerHTML = `
      <td onclick="event.stopPropagation()">
        <input type="checkbox" class="truck-check" data-id="${t.loadId}" ${selectedTrucks.has(t.loadId) ? "checked" : ""}>
      </td>
      <td style="color:#2563eb;font-weight:500;">${t.loadId}</td>
      <td>${t.customer || ""}</td>
      <td>${t.carrier || ""}</td>
      <td>${t.loadType || ""}</td>
      <td>${t.pickupDate || ""}</td>
      <td>${t.pickupWindow || ""}</td>
      <td>${t.cartons || 0}</td>
      <td><span class="status-badge ${statusClass}">${t.status}</span></td>
    `;

    tb.appendChild(tr);
  });

  document.querySelectorAll(".truck-check").forEach(chk => {
    chk.onchange = (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedTrucks.add(id);
      else selectedTrucks.delete(id);
    };
  });
}

function showTruckDetail(loadId) {
  const t = appState.truckloads.find(x => x.loadId === loadId);
  if (!t) return;

  $("tl-detail-title").textContent = `${t.loadId} — ${t.customer || ""}`;

  const rows = appState.orders.filter(o => (t.orders || []).includes(o.PO));

  $("tl-detail-body").innerHTML = `
    <strong>Orders (${rows.length}):</strong>
    <table style="width:100%;font-size:12px;margin-top:8px;">
      <tr><th>PO</th><th>Customer</th><th>Units</th><th>Cartons</th><th>BOL</th></tr>
      ${rows.map(o => `
        <tr>
          <td>${o.PO}</td>
          <td>${o.Customer}</td>
          <td>${o.Units}</td>
          <td>${o.Cartons}</td>
          <td>${o.BOL}</td>
        </tr>
      `).join("")}
    </table>
  `;

  $("ed-load-id").value = t.loadId;
  $("ed-pickup-date").value = t.pickupDate || "";
  $("ed-pickup-window").value = t.pickupWindow || "";
  $("ed-carrier").value = t.carrier || "";
  $("ed-customer").value = t.customer || "";

  $("tl-detail-overlay").classList.remove("hidden");

  $("tl-detail-save").onclick = () => {
    const newID = $("ed-load-id").value.trim();
    const oldID = t.loadId;

    t.loadId = newID;
    t.pickupDate = $("ed-pickup-date").value;
    t.pickupWindow = $("ed-pickup-window").value;
    t.carrier = $("ed-carrier").value.trim();
    t.customer = $("ed-customer").value.trim();

    // sync orders if Load ID changed
    if (newID !== oldID) {
      appState.orders = appState.orders.map(o => {
        if (!o["Load ID"]) return o;
        let list = o["Load ID"].split(",").map(x => x.trim()).filter(Boolean);
        if (list.includes(oldID)) {
          list = list.filter(x => x !== oldID);
          list.push(newID);
        }
        return { ...o, "Load ID": [...new Set(list)].join(", ") };
      });
    }

    t.stagingLog.push({
      ts: new Date().toISOString(),
      action: "Edited",
      user: appState.session.email,
      note: "Manual edit"
    });

    saveState();
    renderAll();
    $("tl-detail-overlay").classList.add("hidden");
    logChange("Truckload Edited", { from: oldID, to: newID });
  };
}
/* ========= CALENDAR ========= */

function renderCalendar() {
  const grid = $("calendar-grid");
  if (!grid) return;

  const view = $("cal-view")?.value || "month";
  const filter = ($("cal-filter")?.value || "").toLowerCase();

  let start;
  let days;

  const dow = (calAnchor.getDay() + 6) % 7;

  if (view === "wk") {
    start = addDays(calAnchor, -dow);
    days = 7;
  } else if (view === "2w") {
    start = addDays(calAnchor, -dow);
    days = 14;
  } else {
    const mStart = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1);
    const lead = (mStart.getDay() + 6) % 7;
    start = addDays(mStart, -lead);
    days = 42;
  }

  $("cal-title").textContent =
    calAnchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  grid.innerHTML = "";

  // headers
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => {
    const h = document.createElement("div");
    h.className = "cal-header";
    h.textContent = d;
    grid.appendChild(h);
  });

  const todayStr = todayYMD();

  // days
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dateStr = ymd(date);
    const isToday = sameDate(date, todayStr);

    const cell = document.createElement("div");
    cell.className = `cal-cell ${isToday ? "today" : ""}`;
    cell.dataset.date = dateStr;

    const loads = appState.truckloads.filter(t =>
      sameDate(t.pickupDate, date) &&
      (!filter ||
        (t.customer || "").toLowerCase().includes(filter) ||
        (t.carrier || "").toLowerCase().includes(filter))
    );

    cell.innerHTML = `
      <div class="cal-cell-head">
        ${date.getDate()}
        ${loads.length > 0 ? `<span class="cal-count">${loads.length}</span>` : ""}
      </div>

      <div class="cal-cell-body">
        ${loads.slice(0, 4).map(t => `
          <div
            class="cal-chip ${t.status === "Departed" ? "departed" :
                             t.status === "Fully Staged" ? "staged" : ""}"
            draggable="true"
            data-id="${t.loadId}"
            title="${t.loadId}\n${t.customer}\n${t.carrier}"
          >
            ${t.loadId}
          </div>
        `).join("")}

        ${loads.length > 4
          ? `<div style="font-size:10px;color:#6b7280;">+${loads.length - 4} more</div>`
          : ""}
      </div>
    `;

    // enable drop
    cell.ondragover = e => e.preventDefault();

    cell.ondrop = e => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const truck = appState.truckloads.find(t => t.loadId === id);
      if (!truck) return;

      truck.pickupDate = dateStr;

      truck.stagingLog.push({
        ts: new Date().toISOString(),
        action: "Date moved via calendar",
        user: appState.session.email,
        note: `Moved to ${dateStr}`
      });

      saveState();
      renderCalendar();
      logChange("Calendar Date Move", { loadId: id, newDate: dateStr });
    };

    grid.appendChild(cell);
  }

  // drag start
  document.querySelectorAll(".cal-chip[draggable]").forEach(chip => {
    chip.ondragstart = e => {
      e.dataTransfer.setData("text/plain", chip.dataset.id);
    };
  });
}

/* ========= METRICS ========= */

function renderMetrics() {
  const today = todayYMD();
  const weekStart = ymd(addDays(new Date(today), -7));
  const monthStart = today.slice(0, 7) + "-01";

  const todayLoads = appState.truckloads.filter(t => sameDate(t.pickupDate, today));
  const weekLoads = appState.truckloads.filter(
    t => t.pickupDate >= weekStart && t.pickupDate <= today
  );
  const monthLoads = appState.truckloads.filter(t => t.pickupDate >= monthStart);

  // KPI cards
  $("m-units-today").textContent =
    todayLoads.reduce((s, t) => s + (t.units || 0), 0).toLocaleString();

  $("m-units-week").textContent =
    weekLoads.reduce((s, t) => s + (t.units || 0), 0).toLocaleString();

  $("m-cartons").textContent =
    appState.truckloads.reduce((s, t) => s + (t.cartons || 0), 0).toLocaleString();

  $("m-total-loads").textContent = monthLoads.length;

  // Status breakdown
  const staged = appState.truckloads.filter(t => t.status === "Fully Staged").length;
  const progress = appState.truckloads.filter(t => t.status === "In Progress").length;

  $("status-breakdown").innerHTML = `
    <div class="metric-row">
      <span>Fully Staged</span>
      <strong style="color:#059669;">${staged}</strong>
    </div>

    <div class="metric-row">
      <span>In Progress</span>
      <strong style="color:#2563eb;">${progress}</strong>
    </div>

    <div class="metric-row">
      <span>Departed</span>
      <strong>${appState.history.length}</strong>
    </div>
  `;

  // Carrier breakdown
  const carriers = {};
  appState.truckloads.forEach(t => {
    const c = t.carrier || "Unknown";
    carriers[c] = (carriers[c] || 0) + 1;
  });

  $("carrier-breakdown").innerHTML = Object.entries(carriers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c, n]) =>
      `<div class="metric-row"><span>${c}</span><strong>${n}</strong></div>`
    ).join("");

  // Data quality
  const disc = detectDiscrepancies();

  $("data-quality").innerHTML = `
    <div class="metric-row"><span>Total Orders</span><strong>${appState.orders.length}</strong></div>
    <div class="metric-row"><span>Total Truckloads</span><strong>${appState.truckloads.length}</strong></div>
    <div class="metric-row">
      <span>Discrepancies</span>
      <strong style="color:${disc.length ? "#dc2626" : "#059669"};">
        ${disc.length}
      </strong>
    </div>
  `;
}

/* ========= HISTORY ========= */

function renderHistory() {
  const tb = $("history-body");
  if (!tb) return;

  const q = ($("history-search")?.value || "").toLowerCase();

  const list = appState.history.filter(h => {
    if (!q) return true;
    return [h.loadId, h.customer, h.carrier]
      .some(v => String(v || "").toLowerCase().includes(q));
  });

  tb.innerHTML = "";

  if (list.length === 0) {
    tb.innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:40px;">No departed loads yet</td></tr>`;
    return;
  }

  list.forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.loadId}</td>
      <td>${h.customer || ""}</td>
      <td>${h.carrier || ""}</td>
      <td>${h.bol || ""}</td>
      <td>${h.masterBol || ""}</td>
      <td>${h.pickupDate || ""}</td>
      <td>${h.pickupWindow || ""}</td>
      <td>${h.departedAt ? new Date(h.departedAt).toLocaleString() : "-"}</td>
    `;
    tb.appendChild(tr);
  });
}

/* ========= DOCK MAP MODAL ========= */

function showDockMapModal() {
  const today = todayYMD();
  const todayLoads = appState.truckloads.filter(t => sameDate(t.pickupDate, today));

  // Doors
  $("dock-doors-map").innerHTML = DD_DOORS.slice(0, 20).map(d => {
    const t = todayLoads.find(x => x.stagedLocationDD === d);
    return `
      <div class="location-cell ${t ? "assigned" : "available"}" title="${t ? t.loadId : "Available"}">
        <div>${d}</div>
        ${t ? `<div style="font-size:8px;margin-top:2px;">${t.loadId}</div>` : ""}
      </div>
    `;
  }).join("");

  // SL lanes
  $("staging-lanes-map").innerHTML = SL_LANES.slice(0, 20).map(l => {
    const t = todayLoads.find(x => x.stagedLocationSL === l);
    return `
      <div class="location-cell ${t ? "assigned" : "available"}" title="${t ? t.loadId : "Available"}">
        <div>${l}</div>
        ${t ? `<div style="font-size:8px;margin-top:2px;">${t.loadId}</div>` : ""}
      </div>
    `;
  }).join("");

  $("dock-map-overlay").classList.remove("hidden");
}

/* ========= BULK EDIT ========= */

function showBulkEditModal() {
  $("bulk-pickup-date").value = "";
  $("bulk-pickup-window").value = "";
  $("bulk-carrier").value = "";
  $("bulk-edit-overlay").classList.remove("hidden");
}

function applyBulkEdit() {
  const date = $("bulk-pickup-date").value;
  const window = $("bulk-pickup-window").value;
  const carrier = $("bulk-carrier").value.trim();

  let updated = 0;

  appState.truckloads.forEach(t => {
    if (selectedTrucks.has(t.loadId)) {
      if (date) t.pickupDate = date;
      if (window) t.pickupWindow = window;
      if (carrier) t.carrier = carrier;

      t.stagingLog.push({
        ts: new Date().toISOString(),
        action: "Bulk edit",
        user: appState.session.email,
        note: JSON.stringify({ date, window, carrier })
      });

      updated++;
    }
  });

  selectedTrucks.clear();
  $("bulk-edit-overlay").classList.add("hidden");

  saveState();
  renderAll();
  logChange("Bulk Edit", { count: updated });
}

/* ========= ALERTS ========= */

function showAlertsModal() {
  const list = $("alerts-list");
  list.innerHTML = "";

  if (appState.alerts.length === 0) {
    list.innerHTML =
      `<div style="text-align:center;padding:40px;color:#6b7280;">No alerts at this time</div>`;
  } else {
    appState.alerts.forEach(a => {
      const div = document.createElement("div");
      div.className = `alert-item ${a.type}`;
      div.innerHTML = `
        <div>
          <strong>${a.type === "error" ? "🔴 Error" : "⚠️ Warning"}</strong>
          <div style="font-size:13px;margin-top:4px;">${a.message}</div>
        </div>
        <button class="alert-dismiss" onclick="dismissAlert('${a.id}')">×</button>
      `;
      list.appendChild(div);
    });
  }

  $("alerts-overlay").classList.remove("hidden");
}

function dismissAlert(id) {
  appState.alerts = appState.alerts.filter(a => a.id !== id);
  updateAlertsBadge();
  showAlertsModal();
}

/* ========= CHANGELOG ========= */

function showChangelogModal() {
  const list = $("changelog-list");
  list.innerHTML = "";

  appState.changeLog.slice(0, 30).forEach(log => {
    const div = document.createElement("div");
    div.className = "changelog-item";
    div.innerHTML = `
      <div class="changelog-action">${log.action}</div>
      <div class="changelog-meta">${new Date(log.timestamp).toLocaleString()} • ${log.user}</div>
    `;
    list.appendChild(div);
  });

  $("changelog-overlay").classList.remove("hidden");
}

/* ========= EXPORT ========= */

function exportData() {
  const data = {
    timestamp: new Date().toISOString(),
    orders: appState.orders,
    truckloads: appState.truckloads,
    history: appState.history
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ncdc-backup-${todayYMD()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  logChange("Backup Exported", {});
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
}

/* ========= INITIALIZE APP ========= */

function init() {
  loadState();

  // Auto-login if session survived refresh
  if (appState.session?.authed) {
    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    updateUserDisplay();
    applyRolePermissions();
    renderAll();
    checkAlerts();
  }

  setupNavigation();

  /* EVENT LISTENERS */

  $("login-btn").onclick = handleLogin;
  $("logout-btn").onclick = handleLogout;

  $("orders-csv").onchange = handleCSVUpload;
  $("orders-search").oninput = renderOrders;

  $("dock-search").oninput = renderDock;
  $("truckloads-search").oninput = renderTruckloads;
  $("history-search").oninput = renderHistory;

  $("create-truckload-btn").onclick = showCreateTruckModal;
  $("tl-save").onclick = saveTruckload;
  $("tl-cancel").onclick = () => $("modal-overlay").classList.add("hidden");

  $("auto-route-btn").onclick = runAutoRouter;
  $("auto-confirm").onclick = confirmAutoRoute;
  $("auto-cancel").onclick = () => $("auto-overlay").classList.add("hidden");

  $("tl-detail-close").onclick = () => $("tl-detail-overlay").classList.add("hidden");

  $("dock-history-close").onclick = () => $("dock-history-overlay").classList.add("hidden");
  $("dock-map-close").onclick = () => $("dock-map-overlay").classList.add("hidden");
  $("dock-map-btn").onclick = showDockMapModal;

  $("bulk-edit-btn").onclick = showBulkEditModal;
  $("bulk-apply").onclick = applyBulkEdit;
  $("bulk-cancel").onclick = () => $("bulk-edit-overlay").classList.add("hidden");

  $("alerts-close").onclick = () => $("alerts-overlay").classList.add("hidden");
  $("changelog-close").onclick = () => $("changelog-overlay").classList.add("hidden");
  $("changelog-btn").onclick = showChangelogModal;

  $("export-btn").onclick = exportData;

  $("clear-all-data").onclick = () => {
    if (confirm("Delete ALL dashboard data?")) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  };

  // Calendar
  $("cal-prev").onclick = () => {
    const v = $("cal-view").value;
    calAnchor =
      v === "wk" ? addDays(calAnchor, -7) :
      v === "2w" ? addDays(calAnchor, -14) :
      new Date(calAnchor.getFullYear(), calAnchor.getMonth() - 1, 1);

    renderCalendar();
  };

  $("cal-next").onclick = () => {
    const v = $("cal-view").value;
    calAnchor =
      v === "wk" ? addDays(calAnchor, 7) :
      v === "2w" ? addDays(calAnchor, 14) :
      new Date(calAnchor.getFullYear(), calAnchor.getMonth() + 1, 1);

    renderCalendar();
  };

  $("cal-today").onclick = () => {
    calAnchor = new Date();
    renderCalendar();
  };

  $("cal-view").onchange = renderCalendar;
  $("cal-filter").oninput = renderCalendar;

  // select all orders
  $("select-all-orders").onchange = e => {
    document.querySelectorAll("#orders-body .po-check").forEach(chk => {
      chk.checked = e.target.checked;
      if (e.target.checked) selectedPOs.add(chk.dataset.po);
      else selectedPOs.delete(chk.dataset.po);
    });

    $("selected-count").textContent = selectedPOs.size;
  };

  // auto-save every 30s
  setInterval(() => {
    if (appState.session.authed) saveState();
  }, 30000);
}

/* ========= START APP ========= */
document.addEventListener("DOMContentLoaded", init);
