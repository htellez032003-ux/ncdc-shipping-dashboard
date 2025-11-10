// =============== GLOBAL STATE ===============
const OWNER_EMAIL = "htellez032003@gmail.com";
const OWNER_PASS = "Ltapparel040523";

let currentUser = null;             // {email, role}
let ordersData = [];                // raw orders from CSV
let filteredOrders = [];            // filtered for Orders tab
let truckloads = [];                // built truckloads
let departedLoads = [];             // history
let dockAssignments = [];           // for dock tab
let slotCapacities = {};            // editable in settings
let languagePref = "en";
let darkModePref = false;

// your 6 fixed pickup windows
const PICKUP_WINDOWS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "05:00pm-07:00pm",
  "08:00pm-10:00pm",
  "10:00pm-12:00am",
];

// LTL-only carriers list
const LTL_ALWAYS = [
  "AAC","ABC","ABF","ABM","ABN","AF1","AVE","AVT","CEN","CIS","CNW","FFA",
  "FFE","FXX","HCL","HER","ODF","OLD","RLC","SAI","SMF","TFO","UPA","UPF","XL1","XLC","XPO"
];

// long shipper list: user gave huge list; here we store minimally as strings (code + name)
// for brevity we can store it later — but user said "use entire shipper list"; placeholder:
const SHIPPER_LIST = []; // we leave blank; user will upload / extend later

// =============== INIT BRANCHING ===============
document.addEventListener("DOMContentLoaded", () => {
  const isLoginPage = !!document.getElementById("loginForm");
  if (isLoginPage) {
    initLoginPage();
  } else {
    initDashboardPage();
  }
});

// =============== LOGIN PAGE ===============
function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  // if already logged in
  const saved = localStorage.getItem("ncdc_user");
  if (saved) {
    window.location.href = "dashboard.html";
    return;
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPassword").value.trim();
    if (email === OWNER_EMAIL && pass === OWNER_PASS) {
      const userObj = { email, role: "owner" };
      localStorage.setItem("ncdc_user", JSON.stringify(userObj));
      window.location.href = "dashboard.html";
    } else {
      loginError.classList.remove("hidden");
    }
  });
}

// =============== DASHBOARD PAGE ===============
function initDashboardPage() {
  // guard
  const saved = localStorage.getItem("ncdc_user");
  if (!saved) {
    window.location.href = "index.html";
    return;
  }
  currentUser = JSON.parse(saved);

  // init prefs
  const savedPrefs = JSON.parse(localStorage.getItem("ncdc_prefs") || "{}");
  languagePref = savedPrefs.language || "en";
  darkModePref = !!savedPrefs.darkMode;

  applyTheme(darkModePref);
  updateTopbarPrefs();

  // elements
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("ncdc_user");
    window.location.href = "index.html";
  });

  // nav tabs
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      showTab(tabId);
    });
  });

  // file upload
  const csvUpload = document.getElementById("csvUpload");
  if (csvUpload) {
    csvUpload.addEventListener("change", handleCsvUpload);
  }

  // filters
  setupOrderFilters();

  // create truckload
  const createBtn = document.getElementById("createTruckloadBtn");
  if (createBtn) createBtn.addEventListener("click", openTruckloadModalFromSelected);

  // modal buttons
  const closeTl = document.getElementById("closeTruckloadModal");
  const saveTl = document.getElementById("saveTruckloadBtn");
  if (closeTl) closeTl.addEventListener("click", () => toggleTruckloadModal(false));
  if (saveTl) saveTl.addEventListener("click", saveTruckloadFromModal);

  // settings
  const darkToggle = document.getElementById("darkModeToggle");
  const langSelect = document.getElementById("languageSelect");
  if (darkToggle) {
    darkToggle.checked = darkModePref;
    darkToggle.addEventListener("change", () => {
      darkModePref = darkToggle.checked;
      savePrefs();
      applyTheme(darkModePref);
      updateTopbarPrefs();
    });
  }
  if (langSelect) {
    langSelect.value = languagePref;
    langSelect.addEventListener("change", () => {
      languagePref = langSelect.value;
      savePrefs();
      updateTopbarPrefs();
    });
  }

  // capacities
  buildSlotCapacityInputs();

  // export metrics
  const exportBtn = document.getElementById("exportMetricsBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportMetricsCsv);
  }

  // initial render
  document.getElementById("currentUserRole").textContent = currentUser.role === "owner" ? "Owner" : currentUser.role;
  showTab("ordersTab");
  renderOrdersTable();
  renderCalendar();
  renderDockTab();
  renderTodayTab();
  renderTruckloadsTab();
  renderMetricsTab();
  renderHistoryTab();
  renderTeamTab();
}

// =============== TABS ===============
function showTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  const topbarTitle = document.getElementById("topbarTitle");
  if (topbarTitle) {
    topbarTitle.textContent = tabIdName(tabId);
  }
}

function tabIdName(id) {
  switch (id) {
    case "ordersTab": return "Orders";
    case "dockTab": return "Dock";
    case "todayTab": return "Today's Pick Ups";
    case "truckloadsTab": return "Truckloads";
    case "metricsTab": return "Metrics";
    case "historyTab": return "History";
    case "teamTab": return "Team";
    case "settingsTab": return "Settings";
    default: return "NCDC Dashboard";
  }
}

// =============== CSV UPLOAD & PARSE ===============
// new header set you provided
const EXPECTED_HEADERS = [
  "Division","BOL#","Master BOL#","PO Num","Wave#","Wave Creation Date","Wave Type",
  "# of Pk Tks","Remaining Pk Tks","Pick#","Latest Tote Time","Order Type","Customer","Cust Name",
  "Shipper","Store","Center","TTL QTY","TTL Amt","Packed %","Palletized %","Label Printed %",
  "Carton Confirmed","Accusort","SortDirector","Pallet Location","Total Weight","Total Cubic",
  "Est. Cartons","Est. Pallet","Pick Proc Date","Start Date","Cancel Date","Router",
  "Route Date","Scheduled Date","Ready Date","Ready Time","Author#","PT STATUS"
];

function handleCsvUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    const parsed = parseCsv(text);
    ordersData = normalizeOrders(parsed);
    filteredOrders = [...ordersData];
    renderOrdersTable();
    renderCalendar();
    updateLastCsvStamp();
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  const headerLine = lines[0];
  const headers = headerLine.split(",").map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); // simple split; your sheet already worked earlier
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

// convert into consistent fields
function normalizeOrders(rows) {
  return rows.map(r => {
    // fix numbers to actual numbers, but keep strings if missing
    const ttlQty = toNumberSafe(r["TTL QTY"]);
    const ttlAmt = toNumberSafe(r["TTL Amt"]);
    // scheduled date should be plain string
    const schedDate = r["Scheduled Date"] || r["Ready Date"] || "";
    return {
      ...r,
      __po: r["PO Num"] || "",
      __customer: r["Customer"] || "",
      __custName: r["Cust Name"] || "",
      __shipper: r["Shipper"] || "",
      __sched: schedDate,
      __qty: ttlQty,
      __amt: ttlAmt,
      __author: r["Author#"] || "",
      __window: "", // will be filled when assigned
      __status: "Pending", // default
      __stagedLocation: "",
      __palletCount: "",
      __routerNotes: ""
    };
  });
}

function toNumberSafe(v) {
  if (!v) return 0;
  // sometimes excel dates become decimals - we treat non-numeric as 0
  const num = Number(v);
  if (Number.isNaN(num)) return 0;
  return num;
}

function updateLastCsvStamp() {
  const el = document.getElementById("lastCsvStamp");
  if (el) {
    el.textContent = "CSV: " + new Date().toLocaleString();
  }
}

// =============== ORDERS TABLE RENDER ===============
function renderOrdersTable() {
  const tbody = document.getElementById("ordersTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  filteredOrders.forEach((o, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="order-select" data-po="${o.__po}" /></td>
      <td>${o.__po}</td>
      <td>${o.__customer}</td>
      <td>${o.__custName}</td>
      <td>${o.__shipper}</td>
      <td>${o.__qty}</td>
      <td>${o.__amt}</td>
      <td>${o.__sched}</td>
      <td>${o.__window || ""}</td>
      <td>${o.__author}</td>
      <td>${o.__status}</td>
    `;
    tbody.appendChild(tr);
  });

  // select all should select only filtered
  const selectAll = document.getElementById("selectAllOrders");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.onclick = () => {
      const checks = tbody.querySelectorAll(".order-select");
      checks.forEach(c => c.checked = selectAll.checked);
    };
  }
}

// =============== ORDER FILTERS ===============
function setupOrderFilters() {
  const po = document.getElementById("filterPO");
  const customer = document.getElementById("filterCustomer");
  const custName = document.getElementById("filterCustName");
  const shipper = document.getElementById("filterShipper");
  const date = document.getElementById("filterDate");
  const clear = document.getElementById("clearFiltersBtn");

  const handler = () => {
    filteredOrders = ordersData.filter(o => {
      if (po.value && !o.__po.toLowerCase().includes(po.value.toLowerCase())) return false;
      if (customer.value && !o.__customer.toLowerCase().includes(customer.value.toLowerCase())) return false;
      if (custName.value && !o.__custName.toLowerCase().includes(custName.value.toLowerCase())) return false;
      if (shipper.value && !o.__shipper.toLowerCase().includes(shipper.value.toLowerCase())) return false;
      if (date.value && (o.__sched || "").slice(0,10) !== date.value) return false;
      return true;
    });
    renderOrdersTable();
  };

  [po, customer, custName, shipper, date].forEach(input => {
    if (input) input.addEventListener("input", handler);
  });
  if (clear) {
    clear.addEventListener("click", () => {
      [po, customer, custName, shipper, date].forEach(i => i.value = "");
      filteredOrders = [...ordersData];
      renderOrdersTable();
    });
  }
}

// =============== CALENDAR (NOT AFFECTED BY FILTERS) ===============
function renderCalendar() {
  const cal = document.getElementById("calendarContainer");
  if (!cal) return;
  cal.innerHTML = "";

  // simple current month calendar
  const base = new Date();
  const year = base.getFullYear();
  const month = base.getMonth();

  // build days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();

  // fill blanks
  for (let i = 0; i < startWeekday; i++) {
    const div = document.createElement("div");
    cal.appendChild(div);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayOrders = ordersData.filter(o => (o.__sched || "").startsWith(dateStr));
    const div = document.createElement("div");
    div.className = "calendar-day";
    div.innerHTML = `
      <div class="calendar-day-header">${d}</div>
      <div class="muted-text">${dayOrders.length} pickups</div>
    `;
    div.addEventListener("click", () => showSlotSummaryForDate(dateStr));
    cal.appendChild(div);
  }
}

function showSlotSummaryForDate(dateStr) {
  const el = document.getElementById("calendarSlotSummary");
  if (!el) return;
  // group by window + load type rules (LTL carriers rolled into 1 truck)
  const dayOrders = ordersData.filter(o => (o.__sched || "").startsWith(dateStr));
  // build slots
  const bySlot = {};
  PICKUP_WINDOWS.forEach(w => {
    bySlot[w] = {
      LTL: 0,
      "Truck Load": 0,
      "Floor Load": 0
    };
  });
  dayOrders.forEach(o => {
    // window is currently not from CSV, but from truck creation, so might be blank
    const win = o.__window || "08:00am-10:00am";
    if (!bySlot[win]) {
      bySlot[win] = { LTL:0, "Truck Load":0, "Floor Load":0 };
    }
    // decide load type by shipper
    const loadType = LTL_ALWAYS.includes(o.__shipper) ? "LTL" : "Truck Load";
    bySlot[win][loadType] += 1;
  });

  let html = `<strong>${dateStr}</strong> – Slot usage<br/>`;
  Object.entries(bySlot).forEach(([slot, vals]) => {
    html += `${slot}: LTL ${vals.LTL} | TL ${vals["Truck Load"]} | Floor ${vals["Floor Load"]}<br/>`;
  });
  el.innerHTML = html;
}

// =============== TRUCKLOAD MODAL ===============
function openTruckloadModalFromSelected() {
  const selectedPOs = getSelectedPOs();
  if (selectedPOs.length === 0) {
    alert("Select at least one PO to build a truckload.");
    return;
  }
  // store in window temp
  window.__selectedPOs = selectedPOs;
  toggleTruckloadModal(true);
}

function toggleTruckloadModal(show) {
  const modal = document.getElementById("truckloadModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !show);
}

function getSelectedPOs() {
  const checks = document.querySelectorAll("#ordersTbody .order-select:checked");
  const arr = [];
  checks.forEach(c => {
    const po = c.getAttribute("data-po");
    const order = ordersData.find(o => o.__po === po);
    if (order) arr.push(order);
  });
  return arr;
}

function saveTruckloadFromModal() {
  const pickupDate = document.getElementById("tlPickupDate").value;
  const pickupWindow = document.getElementById("tlPickupWindow").value;
  const shipper = document.getElementById("tlShipper").value;
  const comments = document.getElementById("tlComments").value;
  const warnEl = document.getElementById("tlCapacityWarning");

  const selected = window.__selectedPOs || [];
  if (!pickupDate || !pickupWindow || selected.length === 0) {
    warnEl.textContent = "Date, window, and orders are required.";
    warnEl.classList.remove("hidden");
    return;
  }

  // capacity check simple
  const cap = slotCapacities[pickupWindow] || { LTL: 4, "Truck Load": 4, "Floor Load": 4 };
  const loadType = (shipper && LTL_ALWAYS.includes(shipper)) ? "LTL" : "Truck Load";
  // count existing truckloads in same slot
  const existingCount = truckloads.filter(t => t.pickupDate === pickupDate && t.pickupWindow === pickupWindow && t.loadType === loadType).length;
  if (existingCount >= (cap[loadType] || 0)) {
    warnEl.textContent = "Slot is full. Saving will exceed capacity.";
    warnEl.classList.remove("hidden");
  } else {
    warnEl.classList.add("hidden");
  }

  const loadId = "TL-" + Date.now();
  const totalQty = selected.reduce((sum, o) => sum + (o.__qty || 0), 0);
  const totalAmt = selected.reduce((sum, o) => sum + (o.__amt || 0), 0);

  // update orders with window and load id
  selected.forEach(o => {
    o.__window = pickupWindow;
    o.__sched = pickupDate;
    o.__status = "Assigned";
    o.__routerNotes = comments;
    o.__loadId = loadId;
  });

  truckloads.push({
    loadId,
    pickupDate,
    pickupWindow,
    shipper,
    loadType,
    comments,
    orders: selected.map(o => o.__po),
    totalQty,
    totalAmt,
    status: "Scheduled"
  });

  renderOrdersTable();
  renderTruckloadsTab();
  renderDockTab();
  renderTodayTab();
  toggleTruckloadModal(false);
}

// =============== DOCK TAB RENDER ===============
function renderDockTab() {
  const tbody = document.getElementById("dockTbody");
  const summaryRow = document.getElementById("dockSummaryRow");
  if (!tbody || !summaryRow) return;
  tbody.innerHTML = "";
  summaryRow.innerHTML = "";

  // show all truckloads that are scheduled today or assigned
  const rows = truckloads.map(tl => {
    return {
      loadId: tl.loadId,
      pickupWindow: tl.pickupWindow,
      pickupDate: tl.pickupDate,
      shipper: tl.shipper,
      totalCartons: tl.totalQty,
      stagedLocation: "",
      assignedTo: "",
      arrival: "",
      departure: ""
    };
  });

  let totalTrucks = rows.length;
  let totalCartons = rows.reduce((s, r) => s + (r.totalCartons || 0), 0);

  summaryRow.innerHTML = `
    <div class="summary-pill">Trucks: ${totalTrucks}</div>
    <div class="summary-pill">Cartons: ${totalCartons}</div>
  `;

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.loadId}</td>
      <td><!-- BOL placeholder --></td>
      <td><!-- Customer --></td>
      <td>${r.pickupWindow}</td>
      <td>${r.shipper}</td>
      <td><input data-load="${r.loadId}" class="dock-input" placeholder="#" /></td>
      <td>${r.totalCartons}</td>
      <td><input data-load="${r.loadId}" class="dock-input" placeholder="Location" /></td>
      <td><input data-load="${r.loadId}" class="dock-input" placeholder="Assign name" /></td>
      <td><button class="btn-secondary small" onclick="markArrival('${r.loadId}')">Arrived</button></td>
      <td><button class="btn-secondary small" onclick="markDeparture('${r.loadId}')">Departed</button></td>
      <td><button class="btn-secondary small">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.markArrival = function(loadId) {
  // store arrival on truckload
  const tl = truckloads.find(t => t.loadId === loadId);
  if (tl) {
    tl.arrivedAt = new Date().toISOString();
  }
  renderTodayTab();
};
window.markDeparture = function(loadId) {
  const tlIndex = truckloads.findIndex(t => t.loadId === loadId);
  if (tlIndex !== -1) {
    const tl = truckloads[tlIndex];
    tl.departedAt = new Date().toISOString();
    // move to history
    departedLoads.push(tl);
    truckloads.splice(tlIndex, 1);
    renderTruckloadsTab();
    renderHistoryTab();
    renderDockTab();
    renderTodayTab();
  }
};

// =============== TODAY TAB RENDER ===============
function renderTodayTab() {
  const tbody = document.getElementById("todayTbody");
  const summaryRow = document.getElementById("todaySummaryRow");
  if (!tbody || !summaryRow) return;
  tbody.innerHTML = "";
  summaryRow.innerHTML = "";

  const todayStr = new Date().toISOString().slice(0,10);
  const todays = truckloads.filter(t => t.pickupDate === todayStr);

  const totalTrucks = todays.length;
  const atDoor = todays.filter(t => t.arrivedAt && !t.departedAt).length;
  const departed = todays.filter(t => t.departedAt).length;
  const remaining = totalTrucks - departed;
  const totalCartons = todays.reduce((s, t) => s + (t.totalQty || 0), 0);
  const totalAmt = todays.reduce((s, t) => s + (t.totalAmt || 0), 0);

  summaryRow.innerHTML = `
    <div class="summary-pill">Today trucks: ${totalTrucks}</div>
    <div class="summary-pill">At door: ${atDoor}</div>
    <div class="summary-pill">Departed: ${departed}</div>
    <div class="summary-pill">Remaining: ${remaining}</div>
    <div class="summary-pill">Cartons: ${totalCartons}</div>
    <div class="summary-pill">TTL $: ${totalAmt}</div>
  `;

  todays.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td></td>
      <td></td>
      <td>${t.pickupWindow}</td>
      <td>${t.shipper}</td>
      <td>${t.totalQty}</td>
      <td><!-- pallets --></td>
      <td><!-- staged --> </td>
      <td>${t.comments || ""}</td>
      <td>${t.arrivedAt ? new Date(t.arrivedAt).toLocaleTimeString() : '<button class="btn-secondary small" onclick="markArrival(\''+t.loadId+'\')">Arrive</button>'}</td>
      <td>${t.departedAt ? new Date(t.departedAt).toLocaleTimeString() : '<button class="btn-secondary small" onclick="markDeparture(\''+t.loadId+'\')">Depart</button>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =============== TRUCKLOADS TAB RENDER ===============
function renderTruckloadsTab() {
  const tbody = document.getElementById("truckloadsTbody");
  const summary = document.getElementById("truckloadsSummaryRow");
  if (!tbody || !summary) return;
  tbody.innerHTML = "";
  summary.innerHTML = "";

  const total = truckloads.length;
  const today = new Date().toISOString().slice(0,10);
  const todayCount = truckloads.filter(t => t.pickupDate === today).length;
  const weekCount = truckloads.length; // simple for now
  summary.innerHTML = `
    <div class="summary-pill">Total trucks: ${total}</div>
    <div class="summary-pill">Today: ${todayCount}</div>
    <div class="summary-pill">This week: ${weekCount}</div>
  `;
  truckloads.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.pickupDate}</td>
      <td>${t.pickupWindow}</td>
      <td>${t.shipper}</td>
      <td>${t.orders.length}</td>
      <td>${t.totalQty}</td>
      <td>${t.totalAmt}</td>
      <td>${t.status}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =============== METRICS RENDER ===============
function renderMetricsTab() {
  const sr = document.getElementById("metricsSummaryRow");
  if (!sr) return;
  const trucks = truckloads.length;
  const orders = ordersData.length;
  sr.innerHTML = `
    <div class="summary-pill">Active trucks: ${trucks}</div>
    <div class="summary-pill">Orders loaded: ${orders}</div>
  `;

  drawSimpleChart("chartDailyOrders", [5,8,6,9,4,3,7], "Daily Orders");
  drawSimpleChart("chartDockPerformance", [80,76,90,88,85,70,95], "Dock Performance");
}

function drawSimpleChart(canvasId, data, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  // very simple bar chart
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width = 260;
  const h = canvas.height = 120;
  const max = Math.max(...data, 1);
  const barW = w / data.length - 10;
  data.forEach((val, idx) => {
    const barH = (val / max) * (h - 20);
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(10 + idx*(barW+10), h - barH - 10, barW, barH);
  });
  ctx.fillStyle = "#6b7280";
  ctx.font = "10px sans-serif";
  ctx.fillText(label, 10, 10);
}

// =============== EXPORT METRICS ===============
function exportMetricsCsv() {
  // build CSV text from current truckloads + counts
  let csv = "Section,Metric,Value\n";
  csv += "Summary,Active trucks," + truckloads.length + "\n";
  csv += "Summary,Orders loaded," + ordersData.length + "\n";
  csv += "\nTruckloads Detail\n";
  csv += "Load ID,Pickup Date,Pickup Window,Carrier,Orders,TTL QTY,TTL $\n";
  truckloads.forEach(t => {
    csv += `${t.loadId},${t.pickupDate},${t.pickupWindow},${t.shipper},${t.orders.length},${t.totalQty},${t.totalAmt}\n`;
  });

  const blob = new Blob([csv], {type: "text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ncdc-metrics.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// =============== HISTORY RENDER ===============
function renderHistoryTab() {
  const tbody = document.getElementById("historyTbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  departedLoads.forEach(dl => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dl.loadId}</td>
      <td>${dl.pickupDate}</td>
      <td>${dl.shipper}</td>
      <td>${dl.totalQty}</td>
      <td>${dl.totalAmt}</td>
      <td><button class="btn-secondary small" onclick="alert('POs: ${dl.orders.join(", ")}')">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// =============== TEAM RENDER ===============
function renderTeamTab() {
  const tbody = document.getElementById("teamTbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  // simple placeholder
  const team = [
    { name: "Owner (You)", role: "owner", shift: "1st" },
    { name: "Router A", role: "router", shift: "1st" },
    { name: "Dock A", role: "dock", shift: "2nd" },
  ];
  team.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>${m.role}</td>
      <td>${m.shift}</td>
      <td><button class="btn-secondary small">Edit</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// =============== SETTINGS: CAPACITIES ===============
function buildSlotCapacityInputs() {
  const wrap = document.getElementById("slotCapacityList");
  if (!wrap) return;
  if (Object.keys(slotCapacities).length === 0) {
    PICKUP_WINDOWS.forEach(w => {
      slotCapacities[w] = { LTL: 4, "Truck Load": 4, "Floor Load": 4 };
    });
  }
  wrap.innerHTML = "";
  Object.entries(slotCapacities).forEach(([win, caps]) => {
    const div = document.createElement("div");
    div.style.marginBottom = "0.4rem";
    div.innerHTML = `
      <strong>${win}</strong><br/>
      LTL <input data-win="${win}" data-type="LTL" value="${caps.LTL}" style="width:3rem" />
      TL <input data-win="${win}" data-type="Truck Load" value="${caps["Truck Load"]}" style="width:3rem" />
      Floor <input data-win="${win}" data-type="Floor Load" value="${caps["Floor Load"]}" style="width:3rem" />
    `;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("change", () => {
      const win = inp.getAttribute("data-win");
      const type = inp.getAttribute("data-type");
      slotCapacities[win][type] = Number(inp.value) || 0;
    });
  });
}

// =============== THEME & PREFS ===============
function applyTheme(dark) {
  const html = document.documentElement;
  html.setAttribute("data-theme", dark ? "dark" : "light");
}
function savePrefs() {
  localStorage.setItem("ncdc_prefs", JSON.stringify({
    language: languagePref,
    darkMode: darkModePref
  }));
}
function updateTopbarPrefs() {
  const t = document.getElementById("themeIndicator");
  const l = document.getElementById("langIndicator");
  if (t) t.textContent = darkModePref ? "Dark" : "Light";
  if (l) l.textContent = languagePref === "en" ? "EN" : "ES-LA";
}
