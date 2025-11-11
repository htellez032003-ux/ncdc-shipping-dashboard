// app.js

// ======= CONFIG =======
const OWNER_EMAIL = "htellez032003@gmail.com";
const OWNER_PASSWORD = "Ltapparel040523";

const TIME_SLOTS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "05:00pm-07:00pm",
  "08:00pm-10:00pm",
  "10:00pm-12:00am"
];

// default slot capacities (can be edited in settings)
let slotCapacities = TIME_SLOTS.reduce((acc, s) => {
  acc[s] = { LTL: 2, Truckload: 2, Floorload: 2 };
  return acc;
}, {});

// ======= STATE =======
const state = {
  user: null,
  orders: [],        // raw orders from CSV
  filteredOrders: [],
  truckloads: [],
  dock: [],
  today: [],
  history: [],
  team: [],
  settings: {
    theme: "light",
    language: "en",
    slotCapacities: slotCapacities,
  }
};

// ======= DOM =======
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginBtn = document.getElementById("login-button");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const navItems = document.querySelectorAll(".nav-item");
const tabPanels = document.querySelectorAll(".tab-panel");
const currentTabTitle = document.getElementById("current-tab-title");
const loggedUserLabel = document.getElementById("logged-user-label");

const uploadCsvBtn = document.getElementById("upload-csv-btn");
const ordersCsvInput = document.getElementById("orders-csv-input");
const ordersTbody = document.getElementById("orders-tbody");
const ordersSelectAll = document.getElementById("orders-select-all");
const orderSearch = document.getElementById("order-search");
const orderDateColumn = document.getElementById("order-date-column");
const orderDateFrom = document.getElementById("order-date-from");
const orderDateTo = document.getElementById("order-date-to");
const orderDateApply = document.getElementById("order-date-apply");
const clearFiltersBtn = document.getElementById("clear-filters");
const buildTruckloadBtn = document.getElementById("build-truckload-btn");
const metricTotalOrders = document.getElementById("metric-total-orders");
const metricReadyOrders = document.getElementById("metric-ready-orders");
const metricTotalTruckloads = document.getElementById("metric-total-truckloads");

// calendar
const ordersCalendar = document.getElementById("orders-calendar");
const calendarSelectedDate = document.getElementById("calendar-selected-date");
const calendarSlotsList = document.getElementById("calendar-slots-list");

// dock
const dockTbody = document.getElementById("dock-tbody");

// today's pickups
const todayTbody = document.getElementById("today-tbody");
const todayTotalTrucks = document.getElementById("today-total-trucks");
const todayAtDoor = document.getElementById("today-at-door");
const todayDeparted = document.getElementById("today-departed");

// truckloads
const truckloadsTbody = document.getElementById("truckloads-tbody");
const tlSearch = document.getElementById("tl-search");
const tlDateFrom = document.getElementById("tl-date-from");
const tlDateTo = document.getElementById("tl-date-to");
const tlFilterBtn = document.getElementById("tl-filter-btn");
const tlClearBtn = document.getElementById("tl-clear-btn");
const tlExportCsv = document.getElementById("tl-export-csv");

// metrics
const metricsExport = document.getElementById("metrics-export");

// history
const historyTbody = document.getElementById("history-tbody");
const histSearch = document.getElementById("hist-search");
const histDateFrom = document.getElementById("hist-date-from");
const histDateTo = document.getElementById("hist-date-to");
const histFilterBtn = document.getElementById("hist-filter-btn");
const histClearBtn = document.getElementById("hist-clear-btn");

// team
const teamTbody = document.getElementById("team-tbody");
const teamName = document.getElementById("team-name");
const teamRole = document.getElementById("team-role");
const teamShift = document.getElementById("team-shift");
const teamAddBtn = document.getElementById("team-add-btn");

// settings
const darkModeToggle = document.getElementById("dark-mode-toggle");
const languageSelect = document.getElementById("language-select");
const slotCapacityContainer = document.getElementById("slot-capacity-container");
const clearLocalDataBtn = document.getElementById("clear-local-data");

// modal
const tlModal = document.getElementById("tl-modal");
const tlModalClose = document.getElementById("tl-modal-close");
const tlModalSave = document.getElementById("tl-modal-save");
const tlLoadId = document.getElementById("tl-load-id");
const tlPickupDate = document.getElementById("tl-pickup-date");
const tlTimeSlot = document.getElementById("tl-time-slot");
const tlLoadType = document.getElementById("tl-load-type");
const tlCarrier = document.getElementById("tl-carrier");
const tlRouterComments = document.getElementById("tl-router-comments");

// ======= INIT =======
init();

function init() {
  // load from localStorage
  const saved = localStorage.getItem("ncdc-dashboard");
  if (saved) {
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed);
    // re-merge slot capacities so we don't lose new time slots
    state.settings.slotCapacities = {
      ...slotCapacities,
      ...(state.settings.slotCapacities || {})
    };
  }
  // if user exists, show app
  if (state.user) {
    showApp();
  }

  // populate time slot select in modal
  TIME_SLOTS.forEach(slot => {
    const opt = document.createElement("option");
    opt.value = slot;
    opt.textContent = slot;
    tlTimeSlot.appendChild(opt);
  });

  // settings slot capacity UI
  renderSlotCapacitySettings();

  attachEvents();
  applyTheme(state.settings.theme || "light");
}

// ======= EVENTS =======
function attachEvents() {
  loginBtn.addEventListener("click", handleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  uploadCsvBtn.addEventListener("click", () => ordersCsvInput.click());
  ordersCsvInput.addEventListener("change", handleCsvUpload);
  orderSearch.addEventListener("input", applyOrderFilters);
  orderDateApply.addEventListener("click", applyOrderFilters);
  clearFiltersBtn.addEventListener("click", clearOrderFilters);
  ordersSelectAll.addEventListener("change", handleOrdersSelectAll);
  buildTruckloadBtn.addEventListener("click", openTruckloadModalFromSelected);

  navItems.forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tab);
    });
  });

  // modal
  tlModalClose.addEventListener("click", () => tlModal.classList.add("hidden"));
  tlModalSave.addEventListener("click", saveTruckloadFromModal);

  // theme
  darkModeToggle.addEventListener("change", (e) => {
    const mode = e.target.checked ? "dark" : "light";
    state.settings.theme = mode;
    applyTheme(mode);
    persist();
  });

  languageSelect.addEventListener("change", e => {
    state.settings.language = e.target.value;
    persist();
  });

  clearLocalDataBtn.addEventListener("click", () => {
    localStorage.removeItem("ncdc-dashboard");
    location.reload();
  });

  // exports
  tlExportCsv.addEventListener("click", () => exportCsv("truckloads"));
  metricsExport.addEventListener("click", () => exportCsv("metrics"));
  histFilterBtn.addEventListener("click", renderHistoryTable);
  histClearBtn.addEventListener("click", () => {
    histSearch.value = "";
    histDateFrom.value = "";
    histDateTo.value = "";
    renderHistoryTable();
  });

  teamAddBtn.addEventListener("click", addTeamMember);
}

// ======= AUTH =======
function handleLogin() {
  const email = loginEmail.value.trim();
  const pass = loginPassword.value.trim();
  if (email === OWNER_EMAIL && pass === OWNER_PASSWORD) {
    state.user = {
      email,
      role: "owner",
      name: "Owner"
    };
    persist();
    showApp();
  } else {
    loginError.classList.remove("hidden");
  }
}
function handleLogout() {
  state.user = null;
  persist();
  loginScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
}
function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  loggedUserLabel.textContent = state.user.email;
  // check dark mode
  darkModeToggle.checked = state.settings.theme === "dark";
  renderAll();
}

// ======= PERSIST =======
function persist() {
  localStorage.setItem("ncdc-dashboard", JSON.stringify(state));
}

// ======= CSV PARSE =======
function handleCsvUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    const parsed = parseCsv(text);
    // parsed is array of objects
    state.orders = parsed.map((row, idx) => normalizeOrderRow(row, idx));
    state.filteredOrders = [...state.orders];
    persist();
    renderOrdersTable();
    renderOrdersMetrics();
    renderCalendar();
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  // simple CSV parser (no quoted commas support for now)
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function normalizeOrderRow(row, idx) {
  // keep everything as string except known numeric columns
  const num = (v) => v && !isNaN(v) ? Number(v) : 0;
  return {
    id: row["PO Num"] || ("po-" + idx),
    Division: row["Division"] || "",
    "BOL#": row["BOL#"] || "",
    "Master BOL#": row["Master BOL#"] || "",
    "PO Num": row["PO Num"] || "",
    "Wave#": row["Wave#"] || "",
    "Wave Creation Date": row["Wave Creation Date"] || "",
    "Wave Type": row["Wave Type"] || "",
    "# of Pk Tks": row["# of Pk Tks"] || "",
    "Remaining Pk Tks": row["Remaining Pk Tks"] || "",
    "Pick#": row["Pick#"] || "",
    "Latest Tote Time": row["Latest Tote Time"] || "",
    "Order Type": row["Order Type"] || "",
    "Customer": row["Customer"] || "",
    "Cust Name": row["Cust Name"] || "",
    "Shipper": row["Shipper"] || "",
    "Store": row["Store"] || "",
    "Center": row["Center"] || "",
    "TTL QTY": num(row["TTL QTY"]),
    "TTL Amt": num(row["TTL Amt"]),
    "Packed %": row["Packed %"] || "",
    "Palletized %": row["Palletized %"] || "",
    "Label Printed %": row["Label Printed %"] || "",
    "Carton Confirmed": row["Carton Confirmed"] || "",
    "Accusort": row["Accusort"] || "",
    "SortDirector": row["SortDirector"] || "",
    "Pallet Location": row["Pallet Location"] || "",
    "Total Weight": num(row["Total Weight"]),
    "Total Cubic": num(row["Total Cubic"]),
    "Est. Cartons": num(row["Est. Cartons"]),
    "Est. Pallet": num(row["Est. Pallet"]),
    "Pick Proc Date": row["Pick Proc Date"] || "",
    "Start Date": row["Start Date"] || "",
    "Cancel Date": row["Cancel Date"] || "",
    "Router": row["Router"] || "",
    "Route Date": row["Route Date"] || "",
    "Scheduled Date": row["Scheduled Date"] || "",
    "Ready Date": row["Ready Date"] || "",
    "Ready Time": row["Ready Time"] || "",
    "Author#": row["Author#"] || "", // IMPORTANT: keep as string
    "PT STATUS": row["PT STATUS"] || "",
    // runtime fields
    _selected: false
  };
}

// ======= RENDER ORDERS =======
function renderAll() {
  renderOrdersTable();
  renderOrdersMetrics();
  renderCalendar();
  renderDockTable();
  renderTodayTable();
  renderTruckloadsTable();
  renderHistoryTable();
  renderTeamTable();
}

function renderOrdersTable() {
  const rows = state.filteredOrders || [];
  ordersTbody.innerHTML = "";
  rows.forEach(order => {
    const tr = document.createElement("tr");
    const isSelected = order._selected ? "checked" : "";
    tr.innerHTML = `
      <td><input type="checkbox" data-po="${order.id}" ${isSelected}></td>
      <td>${order["Division"]}</td>
      <td>${order["BOL#"]}</td>
      <td>${order["Master BOL#"]}</td>
      <td>${order["PO Num"]}</td>
      <td>${order["Customer"]}</td>
      <td>${order["Cust Name"]}</td>
      <td>${order["Shipper"]}</td>
      <td>${order["TTL QTY"]}</td>
      <td>${order["TTL Amt"]}</td>
      <td>${order["Start Date"]}</td>
      <td>${order["Cancel Date"]}</td>
      <td>${order["Author#"]}</td>
      <td>${order["PT STATUS"]}</td>
    `;
    const cb = tr.querySelector("input[type='checkbox']");
    cb.addEventListener("change", (e) => {
      order._selected = e.target.checked;
    });
    ordersTbody.appendChild(tr);
  });
}

function renderOrdersMetrics() {
  metricTotalOrders.textContent = state.orders.length;
  metricTotalTruckloads.textContent = state.truckloads.length;
  // ready/routed = those with Scheduled Date or Ready Date
  const readyCount = state.orders.filter(o => o["Scheduled Date"] || o["Ready Date"]).length;
  metricReadyOrders.textContent = readyCount;
}

function applyOrderFilters() {
  const text = orderSearch.value.trim().toLowerCase();
  const col = orderDateColumn.value;
  const from = orderDateFrom.value;
  const to = orderDateTo.value;
  state.filteredOrders = state.orders.filter(o => {
    let matchText = true;
    if (text) {
      const hay = [
        o["PO Num"],
        o["BOL#"],
        o["Master BOL#"],
        o["Customer"],
        o["Cust Name"],
        o["Shipper"]
      ].join(" ").toLowerCase();
      matchText = hay.includes(text);
    }
    let matchDate = true;
    if (col && (from || to)) {
      const val = o[col] || "";
      // assume YYYY-MM-DD or MM/DD
      const dval = val.slice(0,10);
      if (from && dval < from) matchDate = false;
      if (to && dval > to) matchDate = false;
    }
    return matchText && matchDate;
  });
  renderOrdersTable();
}

function clearOrderFilters() {
  orderSearch.value = "";
  orderDateColumn.value = "";
  orderDateFrom.value = "";
  orderDateTo.value = "";
  state.filteredOrders = [...state.orders];
  renderOrdersTable();
}

function handleOrdersSelectAll(e) {
  const checked = e.target.checked;
  // only select filtered rows
  state.filteredOrders.forEach(o => o._selected = checked);
  renderOrdersTable();
}

// ======= CALENDAR (always shows all scheduled pickups) =======
function renderCalendar() {
  ordersCalendar.innerHTML = "";
  // build for current month
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // map date -> truckloads/orders
  const scheduledMap = {};
  state.truckloads.forEach(tl => {
    if (!tl.pickupDate) return;
    if (!scheduledMap[tl.pickupDate]) scheduledMap[tl.pickupDate] = [];
    scheduledMap[tl.pickupDate].push(tl);
  });

  // fill blanks
  for (let i = 0; i < firstDay; i++) {
    const div = document.createElement("div");
    ordersCalendar.appendChild(div);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const slot = document.createElement("div");
    slot.className = "calendar-day";
    const booked = scheduledMap[dateStr] || [];
    slot.innerHTML = `
      <span class="date">${d}</span>
      <span class="count">${booked.length} truck(s)</span>
    `;
    slot.addEventListener("click", () => {
      showCalendarDayDetails(dateStr, booked);
    });
    ordersCalendar.appendChild(slot);
  }
}

function showCalendarDayDetails(dateStr, loads) {
  calendarSelectedDate.textContent = `Pickups for ${dateStr}`;
  calendarSlotsList.innerHTML = "";
  // summarize by time slot
  const slotCount = {};
  loads.forEach(l => {
    const slot = l.timeSlot || "Unslotted";
    if (!slotCount[slot]) slotCount[slot] = [];
    slotCount[slot].push(l);
  });
  TIME_SLOTS.forEach(slot => {
    const arr = slotCount[slot] || [];
    const cap = state.settings.slotCapacities?.[slot] || slotCapacities[slot];
    const div = document.createElement("div");
    div.innerHTML = `<strong>${slot}</strong>: ${arr.length} scheduled (Cap TL:${cap.Truckload}, LTL:${cap.LTL}, FL:${cap.Floorload})`;
    calendarSlotsList.appendChild(div);
  });
}

// ======= TRUCKLOAD MODAL =======
function openTruckloadModalFromSelected() {
  const selected = state.orders.filter(o => o._selected);
  if (selected.length === 0) {
    alert("Select at least one PO to build a truckload.");
    return;
  }
  // prefill
  tlLoadId.value = generateLoadId();
  tlPickupDate.value = "";
  tlCarrier.value = selected[0]["Shipper"] || "";
  tlRouterComments.value = "";
  tlModal.classList.remove("hidden");
}

function generateLoadId() {
  const n = state.truckloads.length + 1;
  return `TL-${String(n).padStart(3, "0")}`;
}

function saveTruckloadFromModal() {
  const selectedOrders = state.orders.filter(o => o._selected);
  if (selectedOrders.length === 0) {
    alert("No orders selected.");
    return;
  }
  const load = {
    id: tlLoadId.value || generateLoadId(),
    pickupDate: tlPickupDate.value || "",
    timeSlot: tlTimeSlot.value || "",
    loadType: tlLoadType.value,
    carrier: tlCarrier.value,
    routerComments: tlRouterComments.value,
    status: "Scheduled",
    // compute totals
    totalCartons: selectedOrders.reduce((sum, o) => sum + (o["TTL QTY"] || 0), 0),
    totalPallets: 0,
    stagedLocation: "",
    totalWeight: selectedOrders.reduce((sum, o) => sum + (o["Total Weight"] || 0), 0),
    totalCubic: selectedOrders.reduce((sum, o) => sum + (o["Total Cubic"] || 0), 0),
    customer: selectedOrders[0]["Cust Name"] || selectedOrders[0]["Customer"] || "",
    orders: selectedOrders.map(o => o.id),
    createdAt: new Date().toISOString()
  };
  state.truckloads.push(load);

  // push to dock list as one line
  state.dock.push({
    loadId: load.id,
    pickupDate: load.pickupDate,
    loadType: load.loadType,
    customer: load.customer,
    carrier: load.carrier,
    totalCartons: load.totalCartons,
    routedPalletCount: 0,
    stagedLocation: "",
    assignedTo: "",
    status: "Unassigned"
  });

  // if pickup date is today, push to today's tab
  const todayStr = new Date().toISOString().slice(0,10);
  if (load.pickupDate === todayStr) {
    state.today.push({
      loadId: load.id,
      customer: load.customer,
      carrier: load.carrier,
      loadType: load.loadType,
      pickupWindow: load.timeSlot,
      totalCartons: load.totalCartons,
      stagedLocation: "",
      arrivedAt: null,
      departedAt: null,
      status: "Scheduled"
    });
  }

  // unselect orders
  state.orders.forEach(o => o._selected = false);

  persist();
  tlModal.classList.add("hidden");
  renderOrdersTable();
  renderTruckloadsTable();
  renderDockTable();
  renderTodayTable();
  renderCalendar();
}

// ======= DOCK TAB =======
function renderDockTable() {
  dockTbody.innerHTML = "";
  state.dock.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.loadId}</td>
      <td>${item.customer}</td>
      <td>${item.carrier}</td>
      <td>${item.loadType}</td>
      <td>${item.pickupDate || ""}</td>
      <td>${item.totalCartons || 0}</td>
      <td><input data-load="${item.loadId}" data-field="routedPalletCount" class="dock-input" value="${item.routedPalletCount || 0}" style="width:55px" /></td>
      <td><input data-load="${item.loadId}" data-field="stagedLocation" class="dock-input" value="${item.stagedLocation || ""}" style="width:85px" /></td>
      <td>
        <select data-load="${item.loadId}" data-field="assignedTo" class="dock-input">
          <option value="">Unassigned</option>
          ${state.team.map(t => `<option value="${t.name}" ${t.name===item.assignedTo?"selected":""}>${t.name}</option>`).join("")}
        </select>
      </td>
      <td>${item.status}</td>
      <td>
        <button class="secondary-btn" data-action="mark-staged" data-load="${item.loadId}">Mark Fully Staged</button>
      </td>
    `;
    dockTbody.appendChild(tr);
  });

  // attach listeners
  dockTbody.querySelectorAll(".dock-input").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const loadId = e.target.dataset.load;
      const field = e.target.dataset.field;
      const item = state.dock.find(d => d.loadId === loadId);
      if (!item) return;
      item[field] = e.target.value;
      if (field === "assignedTo" && item.status === "Unassigned") {
        item.status = "Staging";
      }
      persist();
      renderDockTable();
    });
  });
  dockTbody.querySelectorAll("[data-action='mark-staged']").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const loadId = e.target.dataset.load;
      const item = state.dock.find(d => d.loadId === loadId);
      if (!item) return;
      item.status = "Fully Staged";
      persist();
      renderDockTable();
    });
  });
}

// ======= TODAY'S PICKUPS =======
function renderTodayTable() {
  // we will sort: arrived at top, departed at bottom, else by carrier
  const arr = [...state.today];
  arr.sort((a,b) => {
    if (a.departedAt && !b.departedAt) return 1;
    if (!a.departedAt && b.departedAt) return -1;
    if (a.arrivedAt && !b.arrivedAt) return -1;
    if (!a.arrivedAt && b.arrivedAt) return 1;
    return (a.carrier || "").localeCompare(b.carrier || "");
  });

  todayTbody.innerHTML = "";
  arr.forEach(item => {
    const tr = document.createElement("tr");
    if (item.arrivedAt && !item.departedAt) {
      tr.style.background = "rgba(249,115,22,.1)"; // orange-ish
    }
    if (item.departedAt) {
      tr.style.background = "rgba(34,197,94,.1)";
    }
    tr.innerHTML = `
      <td>${item.loadId}</td>
      <td>${item.customer}</td>
      <td>${item.carrier}</td>
      <td>${item.loadType}</td>
      <td>${item.pickupWindow || ""}</td>
      <td>${item.totalCartons || 0}</td>
      <td><input data-load="${item.loadId}" data-field="stagedLocation" class="dock-input" value="${item.stagedLocation || ""}" style="width:85px" /></td>
      <td><button class="secondary-btn" data-action="arrived" data-load="${item.loadId}">${item.arrivedAt? "Arrived ✓" : "Arrived"}</button></td>
      <td><button class="secondary-btn" data-action="departed" data-load="${item.loadId}">${item.departedAt? "Departed ✓" : "Departed"}</button></td>
    `;
    todayTbody.appendChild(tr);
  });

  // metrics
  todayTotalTrucks.textContent = arr.length;
  todayAtDoor.textContent = arr.filter(i => i.arrivedAt && !i.departedAt).length;
  todayDeparted.textContent = arr.filter(i => i.departedAt).length;

  // listeners
  todayTbody.querySelectorAll("button[data-action='arrived']").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const loadId = e.target.dataset.load;
      const item = state.today.find(t => t.loadId === loadId);
      if (!item) return;
      item.arrivedAt = new Date().toISOString();
      persist();
      renderTodayTable();
    });
  });
  todayTbody.querySelectorAll("button[data-action='departed']").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const loadId = e.target.dataset.load;
      const item = state.today.find(t => t.loadId === loadId);
      if (!item) return;
      item.departedAt = new Date().toISOString();
      // also push to history
      state.history.push({
        loadId: item.loadId,
        customer: item.customer,
        carrier: item.carrier,
        pickupDate: new Date().toISOString().slice(0,10),
        status: "Departed",
        departedAt: item.departedAt
      });
      // also update truckload status
      const tl = state.truckloads.find(t => t.id === loadId);
      if (tl) tl.status = "Departed";
      persist();
      renderTodayTable();
      renderHistoryTable();
      renderTruckloadsTable();
    });
  });

  todayTbody.querySelectorAll(".dock-input").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const loadId = e.target.dataset.load;
      const item = state.today.find(t => t.loadId === loadId);
      if (!item) return;
      item.stagedLocation = e.target.value;
      persist();
      renderTodayTable();
    });
  });
}

// ======= TRUCKLOADS TAB =======
function renderTruckloadsTable() {
  const search = (tlSearch.value || "").toLowerCase();
  const from = tlDateFrom.value;
  const to = tlDateTo.value;

  const rows = state.truckloads.filter(tl => {
    let ok = true;
    if (search) {
      const hay = [
        tl.id,
        tl.customer,
        tl.carrier
      ].join(" ").toLowerCase();
      ok = hay.includes(search);
    }
    if (ok && (from || to)) {
      const d = tl.pickupDate || "";
      if (from && d < from) ok = false;
      if (to && d > to) ok = false;
    }
    return ok;
  });

  truckloadsTbody.innerHTML = "";
  rows.forEach(tl => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tl.id}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType || ""}</td>
      <td>${tl.totalCartons || 0}</td>
      <td>${tl.totalPallets || 0}</td>
      <td>${tl.stagedLocation || ""}</td>
      <td>${tl.totalWeight || 0}</td>
      <td>${tl.totalCubic || 0}</td>
      <td>${tl.status || ""}</td>
    `;
    truckloadsTbody.appendChild(tr);
  });

  tlFilterBtn.onclick = renderTruckloadsTable;
  tlClearBtn.onclick = () => {
    tlSearch.value = "";
    tlDateFrom.value = "";
    tlDateTo.value = "";
    renderTruckloadsTable();
  };
}

// ======= HISTORY TAB =======
function renderHistoryTable() {
  const search = (histSearch.value || "").toLowerCase();
  const from = histDateFrom.value;
  const to = histDateTo.value;

  const rows = state.history.filter(h => {
    let ok = true;
    if (search) {
      const hay = [
        h.loadId,
        h.customer,
        h.carrier
      ].join(" ").toLowerCase();
      ok = hay.includes(search);
    }
    if (ok && (from || to)) {
      const d = h.pickupDate || "";
      if (from && d < from) ok = false;
      if (to && d > to) ok = false;
    }
    return ok;
  });

  historyTbody.innerHTML = "";
  rows.forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.loadId}</td>
      <td>${h.pickupDate || ""}</td>
      <td>${h.customer || ""}</td>
      <td>${h.carrier || ""}</td>
      <td>${h.status || ""}</td>
      <td>${h.departedAt || ""}</td>
    `;
    historyTbody.appendChild(tr);
  });
}

// ======= TEAM TAB =======
function renderTeamTable() {
  teamTbody.innerHTML = "";
  state.team.forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>${m.role}</td>
      <td>${m.shift}</td>
      <td><button class="ghost-btn" data-remove="${idx}">Remove</button></td>
    `;
    teamTbody.appendChild(tr);
  });
  teamTbody.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.remove);
      state.team.splice(idx,1);
      persist();
      renderTeamTable();
    });
  });
}

function addTeamMember() {
  const name = teamName.value.trim();
  const role = teamRole.value;
  const shift = teamShift.value;
  if (!name) return;
  state.team.push({ name, role, shift });
  teamName.value = "";
  persist();
  renderTeamTable();
  renderDockTable(); // so assign dropdown is updated
}

// ======= SETTINGS =======
function renderSlotCapacitySettings() {
  slotCapacityContainer.innerHTML = "";
  TIME_SLOTS.forEach(slot => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = ".25rem";
    row.style.alignItems = "center";
    const label = document.createElement("span");
    label.textContent = slot;
    label.style.width = "115px";
    const inputTL = document.createElement("input");
    inputTL.type = "number";
    inputTL.value = state.settings.slotCapacities[slot].Truckload;
    inputTL.style.width = "55px";
    const inputLTL = document.createElement("input");
    inputLTL.type = "number";
    inputLTL.value = state.settings.slotCapacities[slot].LTL;
    inputLTL.style.width = "55px";
    const inputFL = document.createElement("input");
    inputFL.type = "number";
    inputFL.value = state.settings.slotCapacities[slot].Floorload;
    inputFL.style.width = "55px";

    inputTL.addEventListener("change", () => {
      state.settings.slotCapacities[slot].Truckload = Number(inputTL.value);
      persist();
    });
    inputLTL.addEventListener("change", () => {
      state.settings.slotCapacities[slot].LTL = Number(inputLTL.value);
      persist();
    });
    inputFL.addEventListener("change", () => {
      state.settings.slotCapacities[slot].Floorload = Number(inputFL.value);
      persist();
    });

    row.appendChild(label);
    row.appendChild(inputTL);
    row.appendChild(inputLTL);
    row.appendChild(inputFL);
    slotCapacityContainer.appendChild(row);
  });
}

// ======= THEME =======
function applyTheme(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
  } else {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
  }
}

// ======= TABS =======
function setActiveTab(tabName) {
  navItems.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  tabPanels.forEach(panel => {
    panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
  });
  currentTabTitle.textContent = tabName === "today" ? "Today's Pickups" : tabName.charAt(0).toUpperCase() + tabName.slice(1);
}

// ======= EXPORT =======
function exportCsv(which) {
  let rows = [];
  if (which === "truckloads") {
    rows = state.truckloads;
  } else if (which === "metrics") {
    // for now create a fake metrics export
    rows = [
      { metric: "avgStageTime", value: 0 },
      { metric: "avgLoadTime", value: 0 }
    ];
  }
  if (rows.length === 0) {
    alert("No data to export.");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = which + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}
