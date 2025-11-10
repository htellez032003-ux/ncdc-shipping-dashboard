// NCDC Shipping Dashboard v8 (offline, single-user, GitHub Pages friendly)

// ====== CONFIG ======
const OWNER_EMAIL = "htellez032003@gmail.com";
const OWNER_PASSWORD = "Ltapparel040523."; // you can change in code later

// LTL-only carriers you gave — we’ll detect from CSV and tag them
const LTL_CARRIER_CODES = new Set([
  "AAC","ABC","ABF","ABM","ABN","AF1","AVE","AVT","CEN","CIS","CNW",
  "FFA","FFE","FXX","HCL","HER","ODF","OLD","RLC","SAI","SMF","TFO","UPA",
  "UPF","XL1","XLC","XPO"
]);

// Pickup windows
const PICKUP_WINDOWS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "05:00pm-07:00pm",
  "08:00pm-10:00pm",
  "10:00pm-12:00am"
];

// default capacities per window per type
let globalCapacities = {
  "08:00am-10:00am": { LTL: 4, Truckload: 2, Floorload: 1 },
  "10:00am-12:00pm": { LTL: 4, Truckload: 2, Floorload: 1 },
  "01:00pm-03:00pm": { LTL: 4, Truckload: 2, Floorload: 1 },
  "05:00pm-07:00pm": { LTL: 4, Truckload: 2, Floorload: 1 },
  "08:00pm-10:00pm": { LTL: 4, Truckload: 2, Floorload: 1 },
  "10:00pm-12:00am": { LTL: 4, Truckload: 2, Floorload: 1 },
};

// ====== STATE ======
let currentUser = null; // {email, role}
let allOrders = [];     // raw parsed CSV rows
let filteredOrders = []; // orders after filters
let truckloads = [];    // built in UI
let historyLoads = [];  // departed loads
let dockAssignments = {}; // truckloadId -> {pallets, location, assignedTo, startedAt}
let todayCalendarMonth = new Date(); // for calendar
let userPrefs = {
  theme: "light",
  lang: "en"
};

// ====== HELPERS ======
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function saveState() {
  localStorage.setItem("ncdc_orders", JSON.stringify(allOrders));
  localStorage.setItem("ncdc_truckloads", JSON.stringify(truckloads));
  localStorage.setItem("ncdc_history", JSON.stringify(historyLoads));
  localStorage.setItem("ncdc_dock_assign", JSON.stringify(dockAssignments));
  localStorage.setItem("ncdc_capacities", JSON.stringify(globalCapacities));
}

function loadState() {
  const o = localStorage.getItem("ncdc_orders");
  if (o) allOrders = JSON.parse(o);
  const t = localStorage.getItem("ncdc_truckloads");
  if (t) truckloads = JSON.parse(t);
  const h = localStorage.getItem("ncdc_history");
  if (h) historyLoads = JSON.parse(h);
  const d = localStorage.getItem("ncdc_dock_assign");
  if (d) dockAssignments = JSON.parse(d);
  const c = localStorage.getItem("ncdc_capacities");
  if (c) globalCapacities = JSON.parse(c);
}

function savePrefs() {
  localStorage.setItem("ncdc_user_prefs", JSON.stringify(userPrefs));
}
function loadPrefs() {
  const p = localStorage.getItem("ncdc_user_prefs");
  if (p) userPrefs = JSON.parse(p);
  // apply
  document.documentElement.setAttribute("data-theme", userPrefs.theme || "light");
  if ($("#lang-toggle")) $("#lang-toggle").value = userPrefs.lang || "en";
  if ($("#settings-theme")) $("#settings-theme").value = userPrefs.theme || "light";
  if ($("#settings-lang")) $("#settings-lang").value = userPrefs.lang || "en";
}

// parse date as string, keep original if weird
function normalizeDate(str) {
  if (!str) return "";
  // if it's like 45123 (Excel date), just return as-is for now
  if (/^\d+(\.\d+)?$/.test(str)) return str;
  // try Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return str;
}

// detect pickup date from order row
function getPickupDateFromOrder(row) {
  return (
    normalizeDate(row["Scheduled Date"]) ||
    normalizeDate(row["Ready Date"]) ||
    normalizeDate(row["Start Date"]) ||
    ""
  );
}

// get truckload id from order — we use Author# + Shipper as natural key
function deriveTruckloadId(row) {
  const author = (row["Author#"] || "").toString().trim();
  const shipper = (row["Shipper"] || "").toString().trim();
  if (!author && !shipper) return "";
  return `${author || "NOAUTH"}-${shipper || "NOSHIP"}`;
}

// ====== LOGIN ======
function initLogin() {
  const savedUser = localStorage.getItem("ncdc_loggedin_user");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showAppShell();
    return;
  }

  $("#login-button").addEventListener("click", () => {
    const em = $("#login-email").value.trim();
    const pw = $("#login-password").value;
    if (em === OWNER_EMAIL && pw === OWNER_PASSWORD) {
      currentUser = { email: em, role: "owner" };
      localStorage.setItem("ncdc_loggedin_user", JSON.stringify(currentUser));
      showAppShell();
    } else {
      $("#login-error").classList.remove("hidden");
    }
  });
  $("#logout-button").addEventListener("click", () => {
    localStorage.removeItem("ncdc_loggedin_user");
    location.reload();
  });
}

function showAppShell() {
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  $("#current-user-label").textContent = currentUser.email + " (" + currentUser.role + ")";
  buildSidebar();
  renderAll();
}

// ====== SIDEBAR ======
const TABS = [
  { id: "orders", label: "Orders" },
  { id: "dock", label: "Dock" },
  { id: "today", label: "Today's Pickups" },
  { id: "truckloads", label: "Truckloads" },
  { id: "metrics", label: "Metrics" },
  { id: "history", label: "History" },
  { id: "team", label: "Team" },
  { id: "settings", label: "Settings" }
];

function buildSidebar() {
  const nav = $("#sidebar-nav");
  nav.innerHTML = "";
  TABS.forEach((t, idx) => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.className = "w-full text-left px-4 py-2 text-sm hover:bg-slate-100";
    if (idx === 0) btn.classList.add("bg-slate-100","font-semibold");
    btn.dataset.tab = t.id;
    btn.addEventListener("click", () => switchTab(t.id));
    nav.appendChild(btn);
  });
}

function switchTab(tabId) {
  $all(".tab-panel").forEach(p => p.classList.add("hidden"));
  $all("#sidebar-nav button").forEach(b => b.classList.remove("bg-slate-100","font-semibold"));
  $("#tab-" + tabId).classList.remove("hidden");
  const btn = $(`#sidebar-nav button[data-tab="${tabId}"]`);
  if (btn) btn.classList.add("bg-slate-100","font-semibold");
  $("#topbar-title").textContent = TABS.find(t => t.id === tabId)?.label || "";
}

// ====== CSV UPLOAD ======
function initCsvUpload() {
  const inp = $("#orders-file-input");
  if (!inp) return;
  inp.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      dynamicTyping: false, // keep as string to avoid decimals
      skipEmptyLines: true,
      complete: (res) => {
        allOrders = res.data.map(r => {
          // normalize date columns
          r["Start Date"] = normalizeDate(r["Start Date"]);
          r["Scheduled Date"] = normalizeDate(r["Scheduled Date"]);
          r["Pick Proc Date"] = normalizeDate(r["Pick Proc Date"]);
          r["Cancel Date"] = normalizeDate(r["Cancel Date"]);
          // detect load type from shipper
          const shipperCode = (r["Shipper"] || "").toString().trim();
          if (shipperCode && LTL_CARRIER_CODES.has(shipperCode)) {
            r.__loadType = "LTL";
          }
          r.__pickupDate = getPickupDateFromOrder(r);
          r.__truckloadId = deriveTruckloadId(r);
          return r;
        });
        localStorage.setItem("ncdc_last_csv_time", new Date().toISOString());
        saveState();
        populateShipperDatalistFromOrders();
        renderAll();
      }
    });
  });
}

function populateShipperDatalistFromOrders() {
  const list = $("#shipper-list");
  if (!list) return;
  const unique = new Set();
  allOrders.forEach(o => {
    const s = (o["Shipper"] || "").toString().trim();
    const n = (o["Name"] || o["Carrier Name"] || "").toString().trim();
    if (s) unique.add(s);
    if (n) unique.add(n);
  });
  list.innerHTML = "";
  unique.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    list.appendChild(opt);
  });
}

// ====== RENDERERS ======
function renderAll() {
  renderOrdersTable();
  renderOrdersTodayTable();
  renderOrdersCards();
  renderCalendar();
  renderDockTable();
  renderTodayTab();
  renderTruckloadsTable();
  renderHistoryTable();
  renderTeam();
  renderSettings();
  updateTopbarCsvTime();
  renderMetrics();
}

function updateTopbarCsvTime() {
  const t = localStorage.getItem("ncdc_last_csv_time");
  if (t) {
    $("#last-csv-label").textContent = "Last CSV upload: " + new Date(t).toLocaleString();
  } else {
    $("#last-csv-label").textContent = "No CSV uploaded yet";
  }
}

// FILTERS
function getOrdersFilters() {
  return {
    search: $("#orders-search").value.trim().toLowerCase(),
    start: $("#orders-date-start").value,
    end: $("#orders-date-end").value,
    loadtype: $("#orders-loadtype").value,
    carrier: $("#orders-carrier-filter").value.trim().toLowerCase()
  };
}

function applyOrderFilters() {
  const f = getOrdersFilters();
  filteredOrders = allOrders.filter(o => {
    // search
    if (f.search) {
      const hay = [
        o["PO Num"],
        o["BOL#"],
        o["Customer"],
        o["Cust Name"],
        o["Author#"]
      ].map(x => (x || "").toString().toLowerCase()).join(" ");
      if (!hay.includes(f.search)) return false;
    }
    // date
    if (f.start) {
      const d = o.__pickupDate || "";
      if (!d || d < f.start) return false;
    }
    if (f.end) {
      const d = o.__pickupDate || "";
      if (!d || d > f.end) return false;
    }
    // loadtype
    if (f.loadtype) {
      const lt = o.__loadType || "";
      if (lt.toLowerCase() !== f.loadtype.toLowerCase()) return false;
    }
    // carrier
    if (f.carrier) {
      const c = (o["Shipper"] || "").toString().toLowerCase();
      const n = (o["Name"] || o["Carrier Name"] || "").toString().toLowerCase();
      if (!c.includes(f.carrier) && !n.includes(f.carrier)) return false;
    }
    return true;
  });
}

function renderOrdersTable() {
  applyOrderFilters();
  const tbody = $("#orders-tbody");
  tbody.innerHTML = "";
  filteredOrders.forEach((o, idx) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";
    const status = o.__truckloadId ? "Routed" : "Unassigned";
    const statusColor = status === "Routed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
    tr.innerHTML = `
      <td class="px-3 py-2"><input type="checkbox" class="order-row-check" data-index="${o.__rowId || idx}" data-po="${o["PO Num"] || ""}" /></td>
      <td class="px-3 py-2">${o["Division"] || ""}</td>
      <td class="px-3 py-2">${o["BOL#"] || ""}</td>
      <td class="px-3 py-2">${o["Master BOL#"] || ""}</td>
      <td class="px-3 py-2">${o["PO Num"] || ""}</td>
      <td class="px-3 py-2">${o["Customer"] || ""}</td>
      <td class="px-3 py-2">${o["Cust Name"] || ""}</td>
      <td class="px-3 py-2">${o["Shipper"] || ""}</td>
      <td class="px-3 py-2">${o["TTL QTY"] || ""}</td>
      <td class="px-3 py-2">${o["TTL Amt"] || ""}</td>
      <td class="px-3 py-2">${o["Start Date"] || ""}</td>
      <td class="px-3 py-2">${o["Scheduled Date"] || ""}</td>
      <td class="px-3 py-2">${o["Author#"] || ""}</td>
      <td class="px-3 py-2"><span class="px-2 py-1 rounded-full text-xs ${statusColor}">${status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderOrdersCards() {
  // grouped by truckload
  const map = new Map();
  allOrders.forEach(o => {
    const tl = o.__truckloadId;
    if (!tl) return;
    if (!map.has(tl)) map.set(tl, []);
    map.get(tl).push(o);
  });
  $("#card-total-truckloads").textContent = map.size;
  // today's pickups
  const today = new Date().toISOString().split("T")[0];
  let todayTL = new Set();
  allOrders.forEach(o => {
    if (o.__pickupDate === today) {
      const tl = o.__truckloadId;
      if (tl) todayTL.add(tl);
    }
  });
  $("#card-todays-pickups").textContent = todayTL.size;
  // capacity alerts: if truckload has more POs than window capacity (very simple)
  let capAlerts = 0;
  truckloads.forEach(tl => {
    const cap = globalCapacities[tl.window] || { LTL: 999, Truckload: 999, Floorload: 999 };
    const loadType = tl.loadType || "Truckload";
    const limit = cap[loadType] || 999;
    if (tl.pos.length > limit) capAlerts++;
  });
  $("#card-capacity-alerts").textContent = capAlerts;
}

function renderOrdersTodayTable() {
  const tbody = $("#orders-today-tbody");
  tbody.innerHTML = "";
  const today = new Date().toISOString().split("T")[0];
  // group by truckload
  const groups = new Map();
  allOrders.forEach(o => {
    if (o.__pickupDate === today) {
      const tl = o.__truckloadId || "UNASSIGNED-" + (o["PO Num"] || "");
      if (!groups.has(tl)) groups.set(tl, []);
      groups.get(tl).push(o);
    }
  });
  groups.forEach((rows, tlId) => {
    // totals
    const cartons = rows.reduce((sum, r) => sum + (parseInt(r["TTL QTY"]) || 0), 0);
    const pallets = rows.reduce((sum, r) => sum + (parseInt(r["Est. Pallet"]) || 0), 0);
    const carrier = rows[0]["Shipper"] || "";
    const customer = rows[0]["Cust Name"] || rows[0]["Customer"] || "";
    const bol = rows[0]["BOL#"] || "";
    const dockInfo = dockAssignments[tlId] || {};
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="px-3 py-2 text-xs font-medium">${tlId}</td>
      <td class="px-3 py-2 text-xs">${customer}</td>
      <td class="px-3 py-2 text-xs">${carrier}</td>
      <td class="px-3 py-2 text-xs">${rows[0]["Author#"] || ""}</td>
      <td class="px-3 py-2 text-xs">${bol}</td>
      <td class="px-3 py-2 text-xs">${cartons}</td>
      <td class="px-3 py-2 text-xs">
        <input data-tl="${tlId}" data-field="pallets" value="${dockInfo.pallets || pallets || ""}" class="w-16 border rounded px-1 py-0.5 text-xs" />
      </td>
      <td class="px-3 py-2 text-xs">
        <input data-tl="${tlId}" data-field="location" value="${dockInfo.location || ""}" class="w-20 border rounded px-1 py-0.5 text-xs" />
      </td>
      <td class="px-3 py-2 text-xs">
        <button data-tl="${tlId}" data-action="arrived" class="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Arrived</button>
      </td>
      <td class="px-3 py-2 text-xs">
        <button data-tl="${tlId}" data-action="departed" class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">Departed</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // listeners
  tbody.querySelectorAll("input[data-tl]").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const tl = e.target.dataset.tl;
      const field = e.target.dataset.field;
      dockAssignments[tl] = dockAssignments[tl] || {};
      dockAssignments[tl][field] = e.target.value;
      saveState();
    });
  });
  tbody.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tl = e.target.dataset.tl;
      const action = e.target.dataset.action;
      dockAssignments[tl] = dockAssignments[tl] || {};
      if (action === "arrived") {
        dockAssignments[tl].arrivedAt = new Date().toISOString();
      } else {
        dockAssignments[tl].departedAt = new Date().toISOString();
        // move to history at end of day – we keep it today
        const truck = truckloads.find(t => t.id === tl);
        if (truck) {
          truck.status = "Departed";
          historyLoads.push(truck);
        }
      }
      saveState();
      renderTodayTab();
      renderHistoryTable();
    });
  });
}

// ====== CALENDAR (under orders) ======
function renderCalendar() {
  const container = $("#orders-calendar");
  const label = $("#cal-label");
  container.innerHTML = "";
  const year = todayCalendarMonth.getFullYear();
  const month = todayCalendarMonth.getMonth();
  label.textContent = todayCalendarMonth.toLocaleString("default", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // compute pickups by day
  const pickupsByDay = {};
  allOrders.forEach(o => {
    const d = o.__pickupDate;
    if (!d) return;
    const dt = new Date(d);
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      const day = dt.getDate();
      pickupsByDay[day] = pickupsByDay[day] || [];
      pickupsByDay[day].push(o);
    }
  });

  // blank
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement("div");
    container.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement("div");
    cell.className = "p-2 border text-center";
    const found = pickupsByDay[d];
    cell.innerHTML = `<div class="text-xs font-semibold">${d}</div>`;
    if (found && found.length > 0) {
      cell.classList.add("day-has-pickups");
      cell.addEventListener("click", () => showDaySlots(year, month, d, found));
      const small = document.createElement("div");
      small.className = "text-[10px] text-emerald-700";
      small.textContent = found.length + " pickups";
      cell.appendChild(small);
    }
    container.appendChild(cell);
  }

  $("#cal-prev").onclick = () => {
    todayCalendarMonth.setMonth(todayCalendarMonth.getMonth() - 1);
    renderCalendar();
  };
  $("#cal-next").onclick = () => {
    todayCalendarMonth.setMonth(todayCalendarMonth.getMonth() + 1);
    renderCalendar();
  };
}

function showDaySlots(year, month, day, orders) {
  const slotDiv = $("#calendar-slot-summary");
  // count per window per load
  const summary = {};
  PICKUP_WINDOWS.forEach(w => {
    summary[w] = { LTL: 0, Truckload: 0, Floorload: 0 };
  });
  orders.forEach(o => {
    const w = o["Pickup window"] || o["Window"] || o.__window || "";
    const loadType = o.__loadType || "Truckload";
    if (w && summary[w]) {
      if (summary[w][loadType] !== undefined) {
        summary[w][loadType] += 1;
      }
    }
  });
  let html = `<p class="text-xs mb-1 font-medium">Pickup slots for ${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}:</p>`;
  PICKUP_WINDOWS.forEach(w => {
    const cap = globalCapacities[w];
    if (!cap) return;
    const line = summary[w] || { LTL: 0, Truckload: 0, Floorload: 0 };
    html += `<p class="text-xs">${w} — LTL: ${line.LTL}/${cap.LTL}, Truckload: ${line.Truckload}/${cap.Truckload}, Floorload: ${line.Floorload}/${cap.Floorload}</p>`;
  });
  slotDiv.innerHTML = html;
}

// ====== DOCK TAB ======
function renderDockTable() {
  const tbody = $("#dock-tbody");
  tbody.innerHTML = "";
  // show truckloads (not individual POs)
  truckloads.forEach(tl => {
    const dockInfo = dockAssignments[tl.id] || {};
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-xs">${tl.id}</td>
      <td class="px-3 py-2 text-xs">${tl.customer || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.date || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.window || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.routedPallets || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.shipper || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.ttlQty || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.routerNotes || ""}</td>
      <td class="px-3 py-2 text-xs">
        <input data-tl="${tl.id}" data-field="assignedTo" value="${dockInfo.assignedTo || ""}" class="w-28 border rounded px-1 py-0.5 text-xs" placeholder="Assign to..." />
      </td>
      <td class="px-3 py-2 text-xs">
        <select data-tl="${tl.id}" data-field="status" class="border rounded px-1 py-0.5 text-xs">
          <option value="available" ${dockInfo.status==="available"?"selected":""}>Available</option>
          <option value="staging" ${dockInfo.status==="staging"?"selected":""}>Staging</option>
          <option value="staged" ${dockInfo.status==="staged"?"selected":""}>Fully staged</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input[data-tl],select[data-tl]").forEach(el => {
    el.addEventListener("change", (e) => {
      const tl = e.target.dataset.tl;
      const field = e.target.dataset.field;
      dockAssignments[tl] = dockAssignments[tl] || {};
      dockAssignments[tl][field] = e.target.value;
      if (field === "status" && e.target.value === "staging" && !dockAssignments[tl].startedAt) {
        dockAssignments[tl].startedAt = new Date().toISOString();
      }
      saveState();
      renderDockCounters();
    });
  });

  renderDockCounters();
}

function renderDockCounters() {
  let available = 0, staging = 0, staged = 0;
  truckloads.forEach(tl => {
    const d = dockAssignments[tl.id] || {};
    if (d.status === "staging") staging++;
    else if (d.status === "staged") staged++;
    else available++;
  });
  $("#dock-available-count").textContent = available;
  $("#dock-staging-count").textContent = staging;
  $("#dock-staged-count").textContent = staged;
}

// ====== TODAY TAB ======
function renderTodayTab() {
  const today = new Date().toISOString().split("T")[0];
  const tbody = $("#today-pickups-tbody");
  tbody.innerHTML = "";
  let total = 0, atDoor = 0, departed = 0, cartons = 0;
  truckloads.forEach(tl => {
    if (tl.date === today) {
      total++;
      const dockInfo = dockAssignments[tl.id] || {};
      if (dockInfo.arrivedAt && !dockInfo.departedAt) atDoor++;
      if (dockInfo.departedAt) departed++;
      cartons += tl.ttlQty || 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="px-3 py-2 text-xs">${tl.id}</td>
        <td class="px-3 py-2 text-xs">${tl.customer || ""}</td>
        <td class="px-3 py-2 text-xs">${tl.shipper || ""}</td>
        <td class="px-3 py-2 text-xs">${tl.window || ""}</td>
        <td class="px-3 py-2 text-xs">${tl.ttlQty || ""}</td>
        <td class="px-3 py-2 text-xs">
          <input data-tl="${tl.id}" data-field="pallets" value="${(dockAssignments[tl.id]||{}).pallets || ""}" class="w-16 border rounded px-1 py-0.5 text-xs" />
        </td>
        <td class="px-3 py-2 text-xs">
          <button data-tl="${tl.id}" data-act="arrive" class="text-xs bg-emerald-100 text-emerald-700 rounded px-2 py-1">Arrive</button>
        </td>
        <td class="px-3 py-2 text-xs">
          <button data-tl="${tl.id}" data-act="depart" class="text-xs bg-slate-100 text-slate-700 rounded px-2 py-1">Depart</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  });
  $("#today-total-trucks").textContent = total;
  $("#today-at-door").textContent = atDoor;
  $("#today-departed").textContent = departed;
  $("#today-remaining").textContent = total - departed;

  tbody.querySelectorAll("input[data-tl]").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const tl = e.target.dataset.tl;
      dockAssignments[tl] = dockAssignments[tl] || {};
      dockAssignments[tl].pallets = e.target.value;
      saveState();
    });
  });
  tbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tl = e.target.dataset.tl;
      const act = e.target.dataset.act;
      dockAssignments[tl] = dockAssignments[tl] || {};
      if (act === "arrive") dockAssignments[tl].arrivedAt = new Date().toISOString();
      else dockAssignments[tl].departedAt = new Date().toISOString();
      saveState();
      renderTodayTab();
      renderHistoryTable();
    });
  });
}

// ====== TRUCKLOADS TAB ======
function renderTruckloadsTable() {
  const tbody = $("#truckloads-tbody");
  tbody.innerHTML = "";
  truckloads.forEach(tl => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-xs">${tl.id}</td>
      <td class="px-3 py-2 text-xs">${tl.date || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.window || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.shipper || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.pos.length}</td>
      <td class="px-3 py-2 text-xs">${tl.ttlQty || 0}</td>
      <td class="px-3 py-2 text-xs">${tl.ttlAmt || 0}</td>
      <td class="px-3 py-2 text-xs">${tl.status || "Open"}</td>
      <td class="px-3 py-2 text-xs">
        <button data-tl="${tl.id}" class="text-xs text-slate-700 underline">CSV</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ====== HISTORY TAB ======
function renderHistoryTable() {
  const tbody = $("#history-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  historyLoads.forEach(tl => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-xs">${tl.id}</td>
      <td class="px-3 py-2 text-xs">${tl.date || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.customer || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.shipper || ""}</td>
      <td class="px-3 py-2 text-xs">${tl.status || "Departed"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ====== TEAM TAB ======
function renderTeam() {
  const tbody = $("#team-tbody");
  if (!tbody) return;
  // simple local team for now
  let team = JSON.parse(localStorage.getItem("ncdc_team") || "[]");
  if (team.length === 0) {
    team = [
      { name: "Dock 1", role: "dock", shift: "1st", active: true },
      { name: "Dock 2", role: "dock", shift: "2nd", active: true },
      { name: "Router 1", role: "router", shift: "1st", active: true }
    ];
    localStorage.setItem("ncdc_team", JSON.stringify(team));
  }
  tbody.innerHTML = "";
  team.forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-sm">${m.name}</td>
      <td class="px-3 py-2 text-sm">
        <select data-idx="${idx}" data-field="role" class="border rounded px-2 py-1 text-xs">
          <option value="dock" ${m.role==="dock"?"selected":""}>Dock worker</option>
          <option value="router" ${m.role==="router"?"selected":""}>Router</option>
          <option value="admin" ${m.role==="admin"?"selected":""}>Admin</option>
        </select>
      </td>
      <td class="px-3 py-2 text-sm">
        <select data-idx="${idx}" data-field="shift" class="border rounded px-2 py-1 text-xs">
          <option value="1st" ${m.shift==="1st"?"selected":""}>1st</option>
          <option value="2nd" ${m.shift==="2nd"?"selected":""}>2nd</option>
        </select>
      </td>
      <td class="px-3 py-2 text-sm">
        <input data-idx="${idx}" data-field="active" type="checkbox" ${m.active?"checked":""} />
      </td>
      <td class="px-3 py-2 text-sm">
        <button data-idx="${idx}" data-action="remove" class="text-xs text-red-500">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("select[data-idx],input[data-idx],button[data-idx]").forEach(el => {
    el.addEventListener("change", teamChangeHandler);
    el.addEventListener("click", teamChangeHandler);
  });

  $("#team-add").onclick = () => {
    const team = JSON.parse(localStorage.getItem("ncdc_team") || "[]");
    team.push({ name: "New Associate", role: "dock", shift: "1st", active: true });
    localStorage.setItem("ncdc_team", JSON.stringify(team));
    renderTeam();
  };
}

function teamChangeHandler(e) {
  const idx = parseInt(e.target.dataset.idx);
  let team = JSON.parse(localStorage.getItem("ncdc_team") || "[]");
  if (e.target.dataset.action === "remove") {
    team.splice(idx, 1);
  } else {
    const field = e.target.dataset.field;
    if (field === "active") {
      team[idx][field] = e.target.checked;
    } else {
      team[idx][field] = e.target.value;
    }
  }
  localStorage.setItem("ncdc_team", JSON.stringify(team));
  renderTeam();
}

// ====== SETTINGS TAB ======
function renderSettings() {
  const grid = $("#capacity-grid");
  grid.innerHTML = "";
  PICKUP_WINDOWS.forEach(w => {
    const cap = globalCapacities[w];
    const div = document.createElement("div");
    div.className = "border rounded-lg p-3 space-y-2";
    div.innerHTML = `
      <p class="text-xs font-semibold">${w}</p>
      <label class="text-[10px] uppercase text-slate-400">LTL</label>
      <input data-window="${w}" data-type="LTL" value="${cap.LTL}" class="w-full border rounded px-2 py-1 text-xs" />
      <label class="text-[10px] uppercase text-slate-400">Truckload</label>
      <input data-window="${w}" data-type="Truckload" value="${cap.Truckload}" class="w-full border rounded px-2 py-1 text-xs" />
      <label class="text-[10px] uppercase text-slate-400">Floorload</label>
      <input data-window="${w}" data-type="Floorload" value="${cap.Floorload}" class="w-full border rounded px-2 py-1 text-xs" />
    `;
    grid.appendChild(div);
  });
}

// save capacities
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "capacity-save") {
    $all("#capacity-grid input[data-window]").forEach(inp => {
      const w = inp.dataset.window;
      const t = inp.dataset.type;
      globalCapacities[w][t] = parseInt(inp.value) || 0;
    });
    saveState();
    $("#capacity-message").textContent = "Capacities saved (local).";
    setTimeout(() => { $("#capacity-message").textContent = ""; }, 3000);
  }
});

// ====== METRICS ======
function renderMetrics() {
  // 7-day trucks = truckloads in next 7 days
  const now = new Date();
  const next7 = new Date();
  next7.setDate(now.getDate() + 7);
  let count7 = 0;
  truckloads.forEach(tl => {
    if (!tl.date) return;
    const d = new Date(tl.date);
    if (d >= now && d <= next7) count7++;
  });
  $("#m-7day-trucks").textContent = count7;
  // perfect days = days where no over-cap loads (very simple)
  // just placeholder
  $("#m-perfect-days").textContent = 3;
  // dock associates
  const team = JSON.parse(localStorage.getItem("ncdc_team") || "[]");
  $("#m-active-dock").textContent = team.filter(t => t.role === "dock" && t.active).length;
}

// ====== BUILD TRUCKLOAD FROM ORDERS TAB ======
function initBuildTruckload() {
  $("#build-commit").addEventListener("click", () => {
    // get selected orders
    const selectedPOs = Array.from(document.querySelectorAll(".order-row-check:checked")).map(ch => ch.dataset.po);
    if (selectedPOs.length === 0) {
      $("#build-message").textContent = "Select some POs first (filtered selection is supported).";
      return;
    }
    const shipper = $("#build-shipper").value.trim();
    const date = $("#build-date").value;
    const window = $("#build-window").value;
    let loadType = $("#build-loadtype").value;
    // derive truckload id: date + shipper
    const tlId = (date || "NO-DATE") + "-" + (shipper || "NOSHIP");
    // gather orders
    const rows = allOrders.filter(o => selectedPOs.includes(o["PO Num"]));
    // if no explicit load type, infer from carrier
    if (!loadType) {
      const some = rows[0];
      const code = (some && some["Shipper"]) ? some["Shipper"].toString().trim() : "";
      if (code && LTL_CARRIER_CODES.has(code)) loadType = "LTL";
      else loadType = "Truckload";
    }
    const ttlQty = rows.reduce((sum, r) => sum + (parseInt(r["TTL QTY"]) || 0), 0);
    const ttlAmt = rows.reduce((sum, r) => sum + (parseFloat(r["TTL Amt"]) || 0), 0);

    // create or update truckload
    let existing = truckloads.find(t => t.id === tlId);
    if (!existing) {
      existing = {
        id: tlId,
        date,
        window,
        shipper,
        loadType,
        pos: [],
        ttlQty: 0,
        ttlAmt: 0,
        status: "Open"
      };
      truckloads.push(existing);
    }
    // add POs (avoid duplicates)
    rows.forEach(r => {
      if (!existing.pos.includes(r["PO Num"])) {
        existing.pos.push(r["PO Num"]);
      }
      // mark order as routed
      r.__truckloadId = tlId;
    });
    // recalc totals
    existing.ttlQty = existing.pos
      .map(po => allOrders.find(o => o["PO Num"] === po))
      .filter(Boolean)
      .reduce((sum, r) => sum + (parseInt(r["TTL QTY"]) || 0), 0);
    existing.ttlAmt = existing.pos
      .map(po => allOrders.find(o => o["PO Num"] === po))
      .filter(Boolean)
      .reduce((sum, r) => sum + (parseFloat(r["TTL Amt"]) || 0), 0);

    saveState();
    renderAll();
    $("#build-message").textContent = "Truckload saved: " + tlId;
    setTimeout(() => { $("#build-message").textContent = ""; }, 3000);
  });
}

// ====== EVENTS ======
document.addEventListener("DOMContentLoaded", () => {
  loadPrefs();
  loadState();
  initLogin();
  initCsvUpload();
  initBuildTruckload();

  // orders filters
  $("#orders-apply-filters").addEventListener("click", renderAll);
  $("#orders-clear-filters").addEventListener("click", () => {
    $("#orders-search").value = "";
    $("#orders-date-start").value = "";
    $("#orders-date-end").value = "";
    $("#orders-loadtype").value = "";
    $("#orders-carrier-filter").value = "";
    renderAll();
  });

  // select visible
  $("#orders-select-visible").addEventListener("click", () => {
    document.querySelectorAll("#orders-tbody .order-row-check").forEach(ch => ch.checked = true);
  });
  $("#orders-header-checkbox").addEventListener("change", (e) => {
    const checked = e.target.checked;
    document.querySelectorAll("#orders-tbody .order-row-check").forEach(ch => ch.checked = checked);
  });

  // theme toggle top bar
  $("#theme-toggle").addEventListener("click", () => {
    userPrefs.theme = (userPrefs.theme === "light") ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", userPrefs.theme);
    $("#theme-toggle").textContent = userPrefs.theme === "light" ? "Light" : "Dark";
    savePrefs();
  });

  // language toggle
  $("#lang-toggle").addEventListener("change", (e) => {
    userPrefs.lang = e.target.value;
    savePrefs();
  });

  // settings theme/lang
  if ($("#settings-theme")) {
    $("#settings-theme").addEventListener("change", (e) => {
      userPrefs.theme = e.target.value;
      document.documentElement.setAttribute("data-theme", userPrefs.theme);
      savePrefs();
    });
  }
  if ($("#settings-lang")) {
    $("#settings-lang").addEventListener("change", (e) => {
      userPrefs.lang = e.target.value;
      savePrefs();
    });
  }
});
