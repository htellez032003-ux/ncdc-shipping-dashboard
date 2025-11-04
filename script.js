// NCDC Shipping Dashboard - Offline Phase 2
// All data is stored locally (IndexedDB + localStorage)
// Roles: owner, admin, router, dock

const SHIP_WINDOWS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "05:00pm-07:00pm",
  "08:00pm-10:00pm",
  "10:00pm-12:00am"
];

const DEFAULT_CAPACITIES = SHIP_WINDOWS.reduce((acc, win) => {
  acc[win] = { LTL: 3, Truckload: 2, Floorload: 1 };
  return acc;
}, {});

const DEFAULT_USERS = [
  { username: "owner", password: "owner123", role: "owner" },
  { username: "admin", password: "admin123", role: "admin" },
  { username: "router", password: "router123", role: "router" },
  { username: "dock", password: "dock123", role: "dock" },
];

const DB_NAME = "ncdc-dashboard";
const DB_VERSION = 1;

let dbRef = null;
let currentUser = null;
let currentCapacities = {};
let currentOrders = [];
let currentTruckloads = [];
let currentUsers = [];

window.addEventListener("DOMContentLoaded", async () => {
  await initDB();
  await loadAllData();
  setupLogin();
  setupTabs();
  setupUpload();
  setupSettings();
  setupRoutersView();
  setupDockView();
  setupDashboard();
  setupTruckloadsView();
});

// ---------- IndexedDB ----------
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("orders")) {
        db.createObjectStore("orders", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("users")) {
        db.createObjectStore("users", { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains("truckloads")) {
        db.createObjectStore("truckloads", { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      dbRef = e.target.result;
      resolve();
    };
    req.onerror = (e) => reject(e);
  });
}

async function loadAllData() {
  currentUsers = await dbGetAll("users");
  if (!currentUsers || currentUsers.length === 0) {
    // seed default users
    for (const u of DEFAULT_USERS) {
      await dbPut("users", u);
    }
    currentUsers = await dbGetAll("users");
  }
  const settings = await dbGet("settings", "ship-capacities");
  currentCapacities = settings ? settings.value : DEFAULT_CAPACITIES;

  currentOrders = await dbGetAll("orders");
  currentTruckloads = await dbGetAll("truckloads");
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = dbRef.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}
function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = dbRef.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}
function dbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = dbRef.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}
function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = dbRef.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ---------- LOGIN ----------
function setupLogin() {
  const loginBtn = document.getElementById("login-btn");
  const loginScreen = document.getElementById("login-screen");
  const appShell = document.getElementById("app-shell");
  const err = document.getElementById("login-error");

  // auto-check stored session
  const storedUser = localStorage.getItem("ncdc-user");
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    renderUserInfo();
    renderAllTabs();
  }

  loginBtn.addEventListener("click", async () => {
    const userField = document.getElementById("login-username").value.trim();
    const passField = document.getElementById("login-password").value.trim();
    const user = currentUsers.find(
      (u) => u.username === userField && u.password === passField
    );
    if (!user) {
      err.classList.remove("hidden");
      return;
    }
    err.classList.add("hidden");
    currentUser = user;
    localStorage.setItem("ncdc-user", JSON.stringify(user));
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    renderUserInfo();
    renderAllTabs();
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    currentUser = null;
    localStorage.removeItem("ncdc-user");
    appShell.classList.add("hidden");
    loginScreen.classList.remove("hidden");
  });
}

function renderUserInfo() {
  document.getElementById("current-user").textContent = currentUser.username;
  document.getElementById("current-role").textContent = currentUser.role;
}

// ---------- TABS ----------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "dashboard-tab") renderDashboard();
      if (btn.dataset.tab === "routers-tab") renderRoutersTable();
      if (btn.dataset.tab === "dock-tab") renderDockOrders();
      if (btn.dataset.tab === "truckloads-tab") renderTruckloads();
      if (btn.dataset.tab === "settings-tab") renderSettingsTables();
    });
  });
}

function renderAllTabs() {
  renderDashboard();
  renderRoutersTable();
  renderDockOrders();
  renderTruckloads();
  renderSettingsTables();
  populateShipWindowFilter();
}

// ---------- UPLOAD ----------
function setupUpload() {
  const uploadBtn = document.getElementById("csv-upload-btn");
  uploadBtn.addEventListener("click", handleCSVUpload);
}

function handleCSVUpload() {
  const fileInput = document.getElementById("csv-file");
  const statusEl = document.getElementById("csv-status");
  const file = fileInput.files[0];
  if (!file) {
    statusEl.textContent = "No file selected.";
    return;
  }
  statusEl.textContent = "Parsing CSV...";
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      // map CSV rows to order objects
      const parsed = results.data;
      const mapped = parsed.map((row, idx) => {
        return {
          id: row.id || row.BOL || `csv-${Date.now()}-${idx}`,
          customer: row.Customer || row["Customer Name"] || row.customer || "",
          carrier: row.Carrier || row["Carrier Name"] || "",
          bol: row.BOL || row["BOL (Bill of Lading)"] || "",
          loadId: row["Load ID"] || row["Pick Up/Load ID"] || "",
          totalCartons: Number(row["Total Cartons"] || row.Cartons || 0),
          totalPallets: Number(row["Total Pallets"] || row.Pallets || 0),
          pickupDate: row["Pickup Date"] || row.pickupDay || "",
          pickupWindow: row["Pickup Window"] || row.pickupTimeSlot || "",
          pickupType: row["Pickup Type"] || "Truckload",
          stagedLocation: row["Staged Location"] || "",
          status: "pending",
          createdAt: new Date().toISOString(),
          truckArrivedAt: null,
          truckDepartedAt: null,
          stagedAt: null,
          loadedAt: null,
          palletsBuilt: 0,
          value: Number(row["Value"] || 0)
        };
      });
      // save in DB
      // for simplicity we replace all existing orders
      for (const o of currentOrders) {
        await dbDelete("orders", o.id);
      }
      currentOrders = mapped;
      for (const o of currentOrders) {
        await dbPut("orders", o);
      }
      statusEl.textContent = `Uploaded ${currentOrders.length} orders.`;
      renderRoutersTable();
      renderDashboard();
    },
  });
}

// ---------- SETTINGS ----------
function setupSettings() {
  document.getElementById("add-user-btn").addEventListener("click", async () => {
    if (!isOwnerOrAdmin()) return;
    const name = document.getElementById("new-user-name").value.trim();
    const pass = document.getElementById("new-user-pass").value.trim();
    const role = document.getElementById("new-user-role").value;
    if (!name || !pass) return;
    const newUser = { username: name, password: pass, role };
    await dbPut("users", newUser);
    currentUsers = await dbGetAll("users");
    renderSettingsTables();
  });

  document.getElementById("save-capacities-btn").addEventListener("click", async () => {
    const rows = document.querySelectorAll(".capacity-row");
    const newCap = {};
    rows.forEach((row) => {
      const win = row.dataset.window;
      newCap[win] = {
        LTL: Number(row.querySelector(".cap-ltl").value) || 0,
        Truckload: Number(row.querySelector(".cap-truck").value) || 0,
        Floorload: Number(row.querySelector(".cap-floor").value) || 0,
      };
    });
    currentCapacities = newCap;
    await dbPut("settings", { id: "ship-capacities", value: currentCapacities });
    document.getElementById("settings-msg").textContent = "Saved.";
    renderDashboard();
  });
}

function renderSettingsTables() {
  // users
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = "";
  currentUsers.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${u.role !== "owner" ? `<button data-user="${u.username}" class="btn tiny danger-btn">Delete</button>` : ""}</td>
    `;
    tbody.appendChild(tr);
  });
  // delete handlers
  tbody.querySelectorAll(".danger-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!isOwner()) return;
      const userToDelete = btn.dataset.user;
      await dbDelete("users", userToDelete);
      currentUsers = await dbGetAll("users");
      renderSettingsTables();
    });
  });

  // capacities
  const capDiv = document.getElementById("ship-window-capacities");
  capDiv.innerHTML = `
    <table class="table small">
      <thead>
        <tr>
          <th>Window</th>
          <th>LTL</th>
          <th>Truckload</th>
          <th>Floorload</th>
        </tr>
      </thead>
      <tbody>
        ${SHIP_WINDOWS.map((win) => {
          const cap = currentCapacities[win] || { LTL: 0, Truckload: 0, Floorload: 0 };
          return `
            <tr class="capacity-row" data-window="${win}">
              <td>${win}</td>
              <td><input class="input small cap-ltl" value="${cap.LTL}" /></td>
              <td><input class="input small cap-truck" value="${cap.Truckload}" /></td>
              <td><input class="input small cap-floor" value="${cap.Floorload}" /></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

// ---------- ROUTERS VIEW ----------
function setupRoutersView() {
  document.getElementById("router-build-tl").addEventListener("click", handleBuildTruckload);
  document.getElementById("router-search").addEventListener("input", renderRoutersTable);
  document.getElementById("router-filter-window").addEventListener("change", renderRoutersTable);
}

function populateShipWindowFilter() {
  const sel = document.getElementById("router-filter-window");
  SHIP_WINDOWS.forEach((win) => {
    const opt = document.createElement("option");
    opt.value = win;
    opt.textContent = win;
    sel.appendChild(opt);
  });
}

function renderRoutersTable() {
  const wrap = document.getElementById("router-orders-table");
  if (!wrap) return;
  const query = document.getElementById("router-search").value.toLowerCase();
  const filterWin = document.getElementById("router-filter-window").value;
  let orders = currentOrders.slice();
  if (query) {
    orders = orders.filter(o =>
      (o.bol || "").toLowerCase().includes(query) ||
      (o.customer || "").toLowerCase().includes(query) ||
      (o.carrier || "").toLowerCase().includes(query)
    );
  }
  if (filterWin) {
    orders = orders.filter(o => o.pickupWindow === filterWin);
  }
  wrap.innerHTML = `
    <table class="table small">
      <thead>
        <tr>
          <th><input type="checkbox" id="router-select-all"></th>
          <th>BOL</th>
          <th>Customer</th>
          <th>Carrier</th>
          <th>Pickup Date</th>
          <th>Window</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td><input type="checkbox" class="router-row-select" data-id="${o.id}"></td>
            <td>${o.bol || "-"}</td>
            <td>${o.customer || "-"}</td>
            <td>${o.carrier || "-"}</td>
            <td>${o.pickupDate || "-"}</td>
            <td>${o.pickupWindow || "-"}</td>
            <td><span class="status-pill status-${o.status || "pending"}">${o.status || "pending"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  const selectAll = wrap.querySelector("#router-select-all");
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      wrap.querySelectorAll(".router-row-select").forEach(cb => cb.checked = e.target.checked);
    });
  }
}

async function handleBuildTruckload() {
  if (!isRouterOrAbove()) return;
  const wrap = document.getElementById("router-orders-table");
  const selected = Array.from(wrap.querySelectorAll(".router-row-select"))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.id);
  if (selected.length === 0) return;

  // for now, prompt for type, window, load id
  const pickupType = prompt("Pickup type (LTL / Truckload / Floorload):", "Truckload") || "Truckload";
  const pickupWindow = prompt("Ship window:", SHIP_WINDOWS[0]) || SHIP_WINDOWS[0];
  const loadId = prompt("Load ID (leave to auto):", "") || `TL-${Date.now()}`;

  // capacity check
  const cap = currentCapacities[pickupWindow] || { LTL: 0, Truckload: 0, Floorload: 0 };
  const typeKey = pickupType === "LTL" ? "LTL" : (pickupType === "Floorload" ? "Floorload" : "Truckload");
  const currentInWindow = currentTruckloads.filter(tl => tl.pickupWindow === pickupWindow && tl.pickupType === pickupType).length;
  if (currentInWindow >= (cap[typeKey] || 0)) {
    alert(`WARNING: ${pickupWindow} for ${pickupType} is already at capacity (${currentInWindow}/${cap[typeKey]}).`);
  }

  const ordersForLoad = currentOrders.filter(o => selected.includes(o.id));
  const newTL = {
    id: loadId,
    pickupType,
    pickupWindow,
    orderIds: ordersForLoad.map(o => o.id),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  currentTruckloads.push(newTL);
  await dbPut("truckloads", newTL);

  // mark orders as ready_to_stage
  for (const ord of ordersForLoad) {
    ord.status = "ready_to_stage";
    await dbPut("orders", ord);
  }
  renderRoutersTable();
  renderTruckloads();
  renderDockOrders();
  renderDashboard();
}

// ---------- DOCK VIEW ----------
function setupDockView() {
  // nothing special yet
}

function renderDockOrders() {
  const wrap = document.getElementById("dock-orders");
  if (!wrap) return;
  const dockOrders = currentOrders.filter(o =>
    ["ready_to_stage", "staged", "to_load", "loaded", "arrived"].includes(o.status)
  );
  wrap.innerHTML = `
    <table class="table small">
      <thead>
        <tr>
          <th>BOL</th>
          <th>Customer</th>
          <th>Window</th>
          <th>Status</th>
          <th>Pallets</th>
          <th>Location</th>
          <th>Arrived</th>
          <th>Departed</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${dockOrders.map(o => `
          <tr data-id="${o.id}">
            <td>${o.bol || "-"}</td>
            <td>${o.customer || "-"}</td>
            <td>${o.pickupDate || "-"} ${o.pickupWindow || ""}</td>
            <td><span class="status-pill status-${o.status}">${o.status}</span></td>
            <td><input class="input small dock-pallets" value="${o.palletsBuilt || 0}" style="width:50px;"></td>
            <td><input class="input small dock-location" value="${o.stagedLocation || ""}" style="width:90px;"></td>
            <td>${o.truckArrivedAt ? new Date(o.truckArrivedAt).toLocaleTimeString() : ""}</td>
            <td>${o.truckDepartedAt ? new Date(o.truckDepartedAt).toLocaleTimeString() : ""}</td>
            <td>
              <button class="btn tiny dock-stage">Stage</button>
              <button class="btn tiny dock-arrived">Arrived</button>
              <button class="btn tiny dock-departed">Departed</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  // add handlers
  wrap.querySelectorAll("tr[data-id]").forEach(row => {
    const id = row.dataset.id;
    row.querySelector(".dock-pallets").addEventListener("change", (e) => dockUpdateOrder(id, { palletsBuilt: Number(e.target.value) || 0 }));
    row.querySelector(".dock-location").addEventListener("change", (e) => dockUpdateOrder(id, { stagedLocation: e.target.value }));
    row.querySelector(".dock-stage").addEventListener("click", () => dockUpdateOrder(id, { status: "staged", stagedAt: new Date().toISOString() }));
    row.querySelector(".dock-arrived").addEventListener("click", () => dockUpdateOrder(id, { status: "arrived", truckArrivedAt: new Date().toISOString() }));
    row.querySelector(".dock-departed").addEventListener("click", () => dockUpdateOrder(id, { status: "loaded", truckDepartedAt: new Date().toISOString(), loadedAt: new Date().toISOString() }));
  });
}

async function dockUpdateOrder(id, updates) {
  const ord = currentOrders.find(o => o.id === id);
  if (!ord) return;
  Object.assign(ord, updates);
  await dbPut("orders", ord);
  renderDockOrders();
  renderDashboard();
}

// ---------- TRUCKLOADS ----------
function setupTruckloadsView() {
  // just render
}

function renderTruckloads() {
  const wrap = document.getElementById("truckloads-list");
  wrap.innerHTML = `
    <table class="table small">
      <thead>
        <tr>
          <th>Load ID</th>
          <th>Type</th>
          <th>Window</th>
          <th>Orders</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${currentTruckloads.map(tl => `
          <tr>
            <td>${tl.id}</td>
            <td>${tl.pickupType}</td>
            <td>${tl.pickupWindow}</td>
            <td>${tl.orderIds.length}</td>
            <td>${tl.status}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ---------- DASHBOARD ----------
function setupDashboard() {
  // setup range buttons
  document.querySelectorAll("[data-dashboard-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      renderDashboard(btn.dataset.dashboardRange);
    });
  });
  renderDashboard("today");
}

function renderDashboard(range = "today") {
  // summary cards
  const cardsWrap = document.getElementById("summary-cards");
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const ordersToday = currentOrders.filter(o => o.pickupDate === todayStr);
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const ordersTomorrow = currentOrders.filter(o => o.pickupDate === tomorrowStr);

  const weekEnd = new Date(); weekEnd.setDate(today.getDate() + 7);
  const thisWeekOrders = currentOrders.filter(o => {
    if (!o.pickupDate) return false;
    const d = new Date(o.pickupDate);
    return d >= today && d <= weekEnd;
  });

  cardsWrap.innerHTML = `
    <div class="card">
      <div class="card-title">Today's pickups</div>
      <div class="card-value">${ordersToday.length}</div>
    </div>
    <div class="card">
      <div class="card-title">Tomorrow</div>
      <div class="card-value">${ordersTomorrow.length}</div>
    </div>
    <div class="card">
      <div class="card-title">This week</div>
      <div class="card-value">${thisWeekOrders.length}</div>
    </div>
  `;

  // schedule list
  const sched = document.getElementById("dashboard-schedule");
  let list = [];
  if (range === "today") list = ordersToday;
  else if (range === "tomorrow") list = ordersTomorrow;
  else list = thisWeekOrders;

  sched.innerHTML = list.length === 0 ? `<p class="muted small">No pickups in this range.</p>` :
    list.map(o => `
      <div class="flex-row" style="justify-content: space-between; border-bottom:1px solid #eee; padding:.35rem 0;">
        <div>
          <strong>${o.bol || "-"}</strong> - ${o.customer || "-"}<br>
          <span class="muted small">${o.pickupDate || ""} ${o.pickupWindow || ""}</span>
        </div>
        <div>
          <span class="status-pill status-${o.status || "pending"}">${o.status || "pending"}</span>
        </div>
      </div>
    `).join("");

  // calendar
  renderCalendar();
  renderCapacityChart();
}

function renderCalendar() {
  const cont = document.getElementById("calendar-container");
  if (!cont) return;
  cont.innerHTML = "";
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  // headers
  const headers = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  headers.forEach(h => {
    const d = document.createElement("div");
    d.className = "day-header";
    d.textContent = h;
    cont.appendChild(d);
  });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  for (let i=0;i<firstDay;i++) {
    const emp = document.createElement("div");
    emp.className = "calendar-day";
    cont.appendChild(emp);
  }
  for (let day=1; day<=daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day";
    dayEl.innerHTML = `<div class="date-label">${day}</div>`;
    const ordersForDay = currentOrders.filter(o => o.pickupDate === dateStr);
    ordersForDay.forEach(o => {
      const tag = document.createElement("div");
      tag.className = `tag ${statusToTag(o.status)}`;
      tag.textContent = o.bol || o.customer || "order";
      dayEl.appendChild(tag);
    });
    cont.appendChild(dayEl);
  }
}

function statusToTag(st) {
  if (st === "staged") return "staged";
  if (st === "loaded") return "loaded";
  if (st === "arrived") return "arrived";
  return "pending";
}

let capacityChart = null;
function renderCapacityChart() {
  const ctx = document.getElementById("capacityChart");
  if (!ctx) return;
  const labels = SHIP_WINDOWS;
  const data = labels.map(win => {
    const cap = currentCapacities[win] || { LTL: 0, Truckload: 0, Floorload: 0 };
    // we’ll chart total capacity (sum)
    return (cap.LTL || 0) + (cap.Truckload || 0) + (cap.Floorload || 0);
  });
  if (capacityChart) capacityChart.destroy();
  capacityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Capacity (all types)",
        data
      }]
    },
    options: {
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: false } }
    }
  });
}

// ---------- ROLE HELPERS ----------
function isOwner() {
  return currentUser && currentUser.role === "owner";
}
function isOwnerOrAdmin() {
  return currentUser && (currentUser.role === "owner" || currentUser.role === "admin");
}
function isRouterOrAbove() {
  return currentUser && ["owner","admin","router"].includes(currentUser.role);
}
