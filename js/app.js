// js/app.js

// ----- CONFIG -----
const OWNER_EMAIL = "htellez032003@gmail.com";
const OWNER_PASSWORD = "Ltapparel040523";

const TIME_SLOTS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "05:00pm-07:00pm",
  "08:00pm-10:00pm",
  "10:00pm-12:00am",
];

const LOAD_TYPES = ["LTL", "Truckload", "Floorload"];

// ----- STATE -----
let orders = []; // all rows from CSV
let filteredOrders = [];
let dockBuckets = {
  available: [],
  staging: [],
  staged: [],
};
let truckloads = [];
let currentTL = {
  loadId: "",
  pickupDate: "",
  pickupWindow: "",
  routerComments: "",
  lines: [],
};
let capacities = {}; // time-slot -> {LTL: n, Truckload: n, Floorload: n}

// init capacities default
TIME_SLOTS.forEach((slot) => {
  capacities[slot] = { LTL: 2, Truckload: 2, Floorload: 2 };
});

// ----- DOM -----
const loginScreen = document.getElementById("loginScreen");
const loginBtn = document.getElementById("loginBtn");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const navTabs = document.getElementById("navTabs");
const views = document.querySelectorAll(".view");

const ordersCsvInput = document.getElementById("ordersCsvInput");
const ordersUploadStatus = document.getElementById("ordersUploadStatus");
const ordersTableBody = document.getElementById("ordersTableBody");
const ordersSearch = document.getElementById("ordersSearch");
const refreshSampleBtn = document.getElementById("refreshSampleBtn");

const dockAvailable = document.getElementById("dockAvailable");
const dockStaging = document.getElementById("dockStaging");
const dockStaged = document.getElementById("dockStaged");
const dockTotals = document.getElementById("dockTotals");

const tlLoadId = document.getElementById("tlLoadId");
const tlPickupDate = document.getElementById("tlPickupDate");
const tlPickupWindow = document.getElementById("tlPickupWindow");
const tlRouterComments = document.getElementById("tlRouterComments");
const tlAddBol = document.getElementById("tlAddBol");
const tlAddBtn = document.getElementById("tlAddBtn");
const tlCurrentList = document.getElementById("tlCurrentList");
const tlSaveBtn = document.getElementById("tlSaveBtn");
const tlBuildStatus = document.getElementById("tlBuildStatus");
const truckloadsTableBody = document.getElementById("truckloadsTableBody");
const tlFilterToday = document.getElementById("tlFilterToday");
const tlFilterTomorrow = document.getElementById("tlFilterTomorrow");
const tlFilterDate = document.getElementById("tlFilterDate");
const tlFilterClear = document.getElementById("tlFilterClear");

const mTotalOrders = document.getElementById("mTotalOrders");
const mReadyToStage = document.getElementById("mReadyToStage");
const mTodayLoads = document.getElementById("mTodayLoads");

const capacityForm = document.getElementById("capacityForm");
const saveCapacityBtn = document.getElementById("saveCapacityBtn");
const capacitySaveStatus = document.getElementById("capacitySaveStatus");
const usersList = document.getElementById("usersList");

// ----- LOGIN -----
loginBtn.addEventListener("click", () => {
  const email = loginEmail.value.trim();
  const pass = loginPassword.value.trim();
  if (email === OWNER_EMAIL && pass === OWNER_PASSWORD) {
    loginScreen.style.display = "none";
  } else {
    loginError.textContent = "Invalid email or password.";
  }
});

logoutBtn.addEventListener("click", () => {
  loginScreen.style.display = "flex";
});

// ----- NAVIGATION -----
navTabs.addEventListener("click", (e) => {
  if (e.target.classList.contains("nav-btn")) {
    const targetId = e.target.dataset.target;
    document
      .querySelectorAll(".nav-btn")
      .forEach((btn) => btn.classList.remove("active"));
    e.target.classList.add("active");

    views.forEach((v) => v.classList.remove("active"));
    document.getElementById(targetId).classList.add("active");
  }
});

// ----- CSV HANDLING -----
ordersCsvInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const parsed = parseCSV(text);
    orders = parsed;
    filteredOrders = orders.slice();
    ordersUploadStatus.textContent = `Loaded ${orders.length} rows from CSV.`;
    renderOrdersTable(filteredOrders);
    rebuildDockBuckets();
    updateMetrics();
  };
  reader.readAsText(file);
});

refreshSampleBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("data/sample-orders.csv");
    const text = await res.text();
    const parsed = parseCSV(text);
    orders = parsed;
    filteredOrders = orders.slice();
    ordersUploadStatus.textContent = `Loaded ${orders.length} sample rows.`;
    renderOrdersTable(filteredOrders);
    rebuildDockBuckets();
    updateMetrics();
  } catch (err) {
    ordersUploadStatus.textContent = "Could not load sample-orders.csv";
  }
});

ordersSearch.addEventListener("input", () => {
  const q = ordersSearch.value.toLowerCase();
  filteredOrders = orders.filter((row) => {
    const bol = (row["BOL#"] || "").toLowerCase();
    const po = (row["PO Num"] || "").toLowerCase();
    const cust = (row["Cust Name"] || row["Customer"] || "").toLowerCase();
    return bol.includes(q) || po.includes(q) || cust.includes(q);
  });
  renderOrdersTable(filteredOrders);
});

// simple CSV parser for our structure
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (cols[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

// basic CSV line splitter handling quoted commas
function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ----- RENDER ORDERS TABLE -----
function renderOrdersTable(list) {
  ordersTableBody.innerHTML = "";
  if (!list || list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.textContent = "No orders loaded.";
    tr.appendChild(td);
    ordersTableBody.appendChild(tr);
    return;
  }

  list.forEach((row, idx) => {
    const tr = document.createElement("tr");
    const bol = row["BOL#"] || "";
    const po = row["PO Num"] || "";
    const cust = row["Cust Name"] || row["Customer"] || "";
    const shipper = row["Shipper"] || "";
    const start = row["Start Date"] || "";
    const cancel = row["Cancel Date"] || "";
    const qty = row["TTL QTY"] || "";
    const amt = row["TTL Amt"] || "";
    const routerComment = row["Router Comment"] || "";

    tr.innerHTML = `
      <td>${bol}</td>
      <td>${po}</td>
      <td>${cust}</td>
      <td>${shipper}</td>
      <td>${start}</td>
      <td>${cancel}</td>
      <td>${qty}</td>
      <td>${amt}</td>
      <td><input data-idx="${idx}" class="router-comment-input" value="${routerComment}"></td>
      <td><button class="primary-btn small assign-btn" data-bol="${bol}">To Dock</button></td>
    `;
    ordersTableBody.appendChild(tr);
  });

  // router comment updates
  document.querySelectorAll(".router-comment-input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const rowIndex = parseInt(e.target.dataset.idx, 10);
      if (!isNaN(rowIndex) && orders[rowIndex]) {
        orders[rowIndex]["Router Comment"] = e.target.value;
      }
    });
  });

  // assign to dock
  document.querySelectorAll(".assign-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bol = btn.dataset.bol;
      const order = orders.find((o) => o["BOL#"] === bol);
      if (order) {
        order.__dockStatus = "available";
        rebuildDockBuckets();
      }
    });
  });
}

// ----- DOCK BUCKETS -----
function rebuildDockBuckets() {
  dockBuckets = {
    available: [],
    staging: [],
    staged: [],
  };
  orders.forEach((row) => {
    const status = row.__dockStatus || "available";
    if (status === "available") dockBuckets.available.push(row);
    if (status === "staging") dockBuckets.staging.push(row);
    if (status === "staged") dockBuckets.staged.push(row);
  });
  renderDockLists();
  renderDockTotals();
}

function renderDockLists() {
  dockAvailable.innerHTML = "";
  dockStaging.innerHTML = "";
  dockStaged.innerHTML = "";

  dockBuckets.available.forEach((row) => {
    dockAvailable.appendChild(makeDockCard(row));
  });
  dockBuckets.staging.forEach((row) => {
    dockStaging.appendChild(makeDockCard(row));
  });
  dockBuckets.staged.forEach((row) => {
    dockStaged.appendChild(makeDockCard(row));
  });
}

function makeDockCard(row) {
  const card = document.createElement("div");
  card.className = "dock-card";
  const bol = row["BOL#"] || "";
  const cust = row["Cust Name"] || row["Customer"] || "";
  const shipper = row["Shipper"] || "";
  const pickup = row["Start Date"] || "";
  const cartons = row["TTL QTY"] || "";
  const comments = row["Router Comment"] || "";
  card.innerHTML = `
    <div class="dock-card__title">${bol} — ${cust}</div>
    <div class="dock-card__meta">Carrier: ${shipper || "N/A"}</div>
    <div class="dock-card__meta">Ship/Pick: ${pickup || "n/a"}</div>
    <div class="dock-card__meta">Qty: ${cartons || "0"}</div>
    <div class="dock-card__meta">Note: ${comments}</div>
    <div class="dock-card__actions">
      <button class="dock-btn" data-action="staging" data-bol="${bol}">Stage</button>
      <button class="dock-btn" data-action="staged" data-bol="${bol}">Done</button>
    </div>
  `;
  card.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const targetBol = btn.dataset.bol;
      const order = orders.find((o) => o["BOL#"] === targetBol);
      if (order) {
        order.__dockStatus = action;
        rebuildDockBuckets();
      }
    });
  });
  return card;
}

function renderDockTotals() {
  const totalAvail = dockBuckets.available.length;
  const totalStaging = dockBuckets.staging.length;
  const totalStaged = dockBuckets.staged.length;
  // total cartons
  const cAvail = dockBuckets.available.reduce((sum, r) => sum + (parseInt(r["TTL QTY"] || 0, 10) || 0), 0);
  const cStaging = dockBuckets.staging.reduce((sum, r) => sum + (parseInt(r["TTL QTY"] || 0, 10) || 0), 0);
  const cStaged = dockBuckets.staged.reduce((sum, r) => sum + (parseInt(r["TTL QTY"] || 0, 10) || 0), 0);
  dockTotals.innerHTML = `
    <span class="pill">Available: ${totalAvail} orders / ${cAvail} units</span>
    <span class="pill">Staging: ${totalStaging} orders / ${cStaging} units</span>
    <span class="pill">Staged: ${totalStaged} orders / ${cStaged} units</span>
  `;
}

// ----- TRUCKLOAD BUILDER -----
tlAddBtn.addEventListener("click", () => {
  const bol = tlAddBol.value.trim();
  if (!bol) return;
  // avoid double-booking inside same TL
  const already = currentTL.lines.find((l) => l["BOL#"] === bol);
  if (already) {
    tlBuildStatus.textContent = "That BOL is already on this truckload.";
    return;
  }
  const order = orders.find((o) => o["BOL#"] === bol);
  if (!order) {
    tlBuildStatus.textContent = "BOL not found in current order book.";
    return;
  }
  currentTL.lines.push(order);
  renderCurrentTL();
  tlBuildStatus.textContent = "";
  tlAddBol.value = "";
});

tlSaveBtn.addEventListener("click", () => {
  if (currentTL.lines.length === 0) {
    tlBuildStatus.textContent = "Add at least 1 order.";
    return;
  }
  // capacity check would go here using capacities and currentTL.pickupDate + pickupWindow
  const loadId = tlLoadId.value.trim() || `NCDC-TL-${truckloads.length + 1}`;
  const tl = {
    id: loadId,
    pickupDate: tlPickupDate.value || "",
    pickupWindow: tlPickupWindow.value || "",
    routerComments: tlRouterComments.value || "",
    lines: currentTL.lines.map((r) => r["BOL#"]),
    totalQty: currentTL.lines.reduce((sum, r) => sum + (parseInt(r["TTL QTY"] || 0, 10) || 0), 0),
    totalAmt: currentTL.lines.reduce((sum, r) => sum + (parseInt(r["TTL Amt"] || 0, 10) || 0), 0),
  };
  truckloads.push(tl);
  renderTruckloadsTable(truckloads);
  // reset current
  currentTL = { loadId: "", pickupDate: "", pickupWindow: "", routerComments: "", lines: [] };
  renderCurrentTL();
  tlLoadId.value = "";
  tlPickupDate.value = "";
  tlPickupWindow.value = "";
  tlRouterComments.value = "";
  tlBuildStatus.textContent = "Truckload saved.";
});

function renderCurrentTL() {
  tlCurrentList.innerHTML = "";
  currentTL.lines.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = `${r["BOL#"]} — ${r["Cust Name"] || r["Customer"] || ""} (${r["TTL QTY"] || 0} qty)`;
    tlCurrentList.appendChild(li);
  });
}

function renderTruckloadsTable(list) {
  truckloadsTableBody.innerHTML = "";
  list.forEach((tl) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button class="ghost-btn small view-tl" data-id="${tl.id}">${tl.id}</button></td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.pickupWindow || ""}</td>
      <td>${tl.lines.length}</td>
      <td>${tl.totalQty}</td>
      <td>${tl.totalAmt}</td>
      <td>${tl.routerComments || ""}</td>
    `;
    truckloadsTableBody.appendChild(tr);
  });

  // click to view TL orders
  document.querySelectorAll(".view-tl").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const tl = truckloads.find((t) => t.id === id);
      if (!tl) return;
      alert(`Truckload ${id}\nOrders:\n${tl.lines.join(", ")}`);
    });
  });
}

// filters
tlFilterToday.addEventListener("click", () => {
  const today = new Date().toISOString().split("T")[0];
  const filtered = truckloads.filter((t) => t.pickupDate === today);
  renderTruckloadsTable(filtered);
});
tlFilterTomorrow.addEventListener("click", () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().split("T")[0];
  const filtered = truckloads.filter((t) => t.pickupDate === tomorrow);
  renderTruckloadsTable(filtered);
});
tlFilterDate.addEventListener("change", () => {
  const val = tlFilterDate.value;
  if (!val) return;
  const filtered = truckloads.filter((t) => t.pickupDate === val);
  renderTruckloadsTable(filtered);
});
tlFilterClear.addEventListener("click", () => {
  renderTruckloadsTable(truckloads);
  tlFilterDate.value = "";
});

// ----- METRICS -----
function updateMetrics() {
  mTotalOrders.textContent = orders.length;
  const ready = orders.filter((o) => o.__dockStatus === "available").length;
  mReadyToStage.textContent = ready;
  const today = new Date().toISOString().split("T")[0];
  const todaysLoads = truckloads.filter((t) => t.pickupDate === today).length;
  mTodayLoads.textContent = todaysLoads;
}

// ----- SETTINGS / CAPACITIES -----
function renderCapacityForm() {
  capacityForm.innerHTML = "";
  TIME_SLOTS.forEach((slot) => {
    const block = document.createElement("div");
    block.className = "capacity-block";
    block.innerHTML = `<h4>${slot}</h4>`;
    LOAD_TYPES.forEach((lt) => {
      const id = `cap-${slot.replace(/[^a-z0-9]/gi, "")}-${lt}`;
      block.innerHTML += `
        <label>${lt}
          <input data-slot="${slot}" data-type="${lt}" id="${id}" type="number" min="0" value="${capacities[slot][lt]}" />
        </label>
      `;
    });
    capacityForm.appendChild(block);
  });
}

saveCapacityBtn.addEventListener("click", () => {
  const inputs = capacityForm.querySelectorAll("input[data-slot]");
  inputs.forEach((inp) => {
    const slot = inp.dataset.slot;
    const type = inp.dataset.type;
    const val = parseInt(inp.value, 10) || 0;
    capacities[slot][type] = val;
  });
  capacitySaveStatus.textContent = "Capacities saved (local only).";
  setTimeout(() => (capacitySaveStatus.textContent = ""), 3000);
});

function renderUsersList() {
  usersList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = `${OWNER_EMAIL} — owner`;
  usersList.appendChild(li);
}

// ----- INIT -----
(async function init() {
  // preload sample on first load
  try {
    const res = await fetch("data/sample-orders.csv");
    const text = await res.text();
    orders = parseCSV(text);
    filteredOrders = orders.slice();
    renderOrdersTable(filteredOrders);
    rebuildDockBuckets();
    updateMetrics();
  } catch (err) {
    // ignore
  }
  renderCapacityForm();
  renderUsersList();
})();
