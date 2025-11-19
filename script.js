// NCDC Shipping Dashboard - Complete JavaScript
// Version 2.0 with all 15 enhancements
// This is the COMPLETE file - replace your entire script.js with this

/* ========= CONSTANTS ========= */
const STORAGE_KEY = "ncdcShippingStateV10";
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
  router: { label: "Router", permissions: ["orders", "truckloads", "calendar", "metrics", "history"] },
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

/* ========= UTILITIES ========= */
const $ = (id) => document.getElementById(id);
const todayYMD = () => new Date().toISOString().slice(0, 10);

const parseYMD = (str) => {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
};

const ymd = (date) => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const sameDate = (date1, date2) => {
  if (!date1 || !date2) return false;
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;
  return d1.toDateString() === d2.toDateString();
};

const sumNumber = (arr, field) => arr.reduce((sum, item) => sum + (parseFloat(item[field]) || 0), 0);

const mostCommon = (arr) => {
  if (!arr || arr.length === 0) return "";
  const counts = {};
  arr.forEach(v => counts[v] = (counts[v] || 0) + 1);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

const earliestDate = (dates) => {
  const valid = dates.filter(d => d).map(d => new Date(d));
  if (valid.length === 0) return todayYMD();
  return ymd(new Date(Math.min(...valid)));
};

const isSPSCarrier = (carrier) => {
  const spsCarriers = ["FXB", "WEB", "UPS", "EST", "OPR"];
  return spsCarriers.includes(carrier);
};

/* ========= LOGIN & AUTH ========= */
function handleLogin() {
  const email = $("login-email").value;
  const password = $("login-password").value;
  const role = $("login-role").value;
  
  if (!email || !password) {
    $("login-error").classList.remove("hidden");
    return;
  }
  
  appState.session = { authed: true, email, role };
  $("login-screen").classList.add("hidden");
  $("app-shell").classList.remove("hidden");
  
  updateUserDisplay();
  applyRolePermissions();
  saveState();
  renderAll();
  checkAlerts();
}

function handleLogout() {
  appState.session = { authed: false, email: "", role: "" };
  saveState();
  $("login-screen").classList.remove("hidden");
  $("app-shell").classList.add("hidden");
}

function updateUserDisplay() {
  $("current-user-display").textContent = appState.session.email;
  $("current-role-badge").textContent = USER_ROLES[appState.session.role]?.label || "";
}

function applyRolePermissions() {
  const perms = USER_ROLES[appState.session.role]?.permissions || [];
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
    const parsed = parseCSV(text);
    const processed = parsed.map(o => computeOrderDerived(o));
    mergeOrders(processed);
    $("csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
    logChange("CSV Uploaded", { count: processed.length });
    renderAll();
    checkAlerts();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
    });
    rows.push(obj);
  }
  
  return rows;
}

function computeOrderDerived(order) {
  const units = parseFloat(String(order.Units || order["TTL QTY"] || 0).replace(/,/g, "")) || 0;
  const cartons = parseFloat(String(order.Cartons || order["Packed Cartons"] || 0).replace(/,/g, "")) || 0;
  
  order.__units = units;
  order.__cartons = cartons;
  
  const startDate = parseYMD(order["Start Date"]);
  const cancelDate = parseYMD(order["Cancel Date"]);
  
  let shipBy = startDate || cancelDate || new Date();
  order.__shipBy = ymd(shipBy);
  order.__recommendedShip = cancelDate && shipBy > cancelDate ? ymd(cancelDate) : order.__shipBy;
  
  const today = new Date(todayYMD());
  const sb = parseYMD(order.__shipBy);
  order.__priority = sb <= today ? "HIGH" : sb <= addDays(today, 1) ? "MEDIUM" : "LOW";
  order.__isSPS = isSPSCarrier(order.Carrier || order.Shipper);
  
  return order;
}

function mergeOrders(newOrders) {
  const keyFor = (o) => (o.PO || o["PO Num"] || "").trim() || `${o.BOL || o["BOL#"]}|${o.Customer || o["Cust Name"]}|${o.Units || o["TTL QTY"]}`;
  const map = new Map(appState.orders.map(o => [keyFor(o), o]));
  
  newOrders.forEach(nr => {
    const k = keyFor(nr);
    if (map.has(k)) {
      const cur = map.get(k);
      const merged = { ...cur, ...nr,
        "Ready Date": cur["Ready Date"] || nr["Ready Date"],
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
    const po = o.PO || o["PO Num"] || "";
    const tr = document.createElement("tr");
    
    const rowClass = o.__priority === "HIGH" ? "row-danger" : 
                     o.__priority === "MEDIUM" ? "row-warn" : "";
    tr.className = rowClass;
    
    const priorityBadge = `<span class="priority-badge priority-${o.__priority.toLowerCase()}">${o.__priority}</span>`;
    const spsBadge = o.__isSPS ? '<span class="sps-badge">SPS</span>' : '';
    
    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${po}" ${selectedPOs.has(po) ? "checked" : ""}></td>
      <td>${po}</td>
      <td>${o.Customer || o["Cust Name"] || ""}</td>
      <td>${o.Carrier || o.Shipper || ""}${spsBadge}</td>
      <td>${o.Units || o["TTL QTY"] || ""}</td>
      <td>${o.Cartons || o["Packed Cartons"] || ""}</td>
      <td>${o.BOL || o["BOL#"] || ""}</td>
      <td>${o["Master BOL"] || o["Master BOL#"] || ""}</td>
      <td>${o["Start Date"] || ""}</td>
      <td>${o["Cancel Date"] || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o["Load ID"] || "-"}</td>
    `;
    tb.appendChild(tr);
  });
  
  // Attach checkbox handlers
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

/* ========= QUICK FILTERS ========= */
function applyQuickFilter(type) {
  dynamicFilters.length = 0;
  $("orders-search").value = "";
  
  if (type === "high") {
    dynamicFilters.push({ col: "__priority", value: "HIGH" });
  } else if (type === "unassigned") {
    filteredOrders = appState.orders.filter(o => !o["Load ID"]);
    renderOrdersFiltered(filteredOrders);
    return;
  } else if (type === "today") {
    dynamicFilters.push({ col: "__shipBy", value: todayYMD() });
  }
  
  renderOrders();
}

function renderOrdersFiltered(orders) {
  const tb = $("orders-body");
  tb.innerHTML = "";
  
  orders.forEach(o => {
    const po = o.PO || o["PO Num"] || "";
    const tr = document.createElement("tr");
    const rowClass = o.__priority === "HIGH" ? "row-danger" : 
                     o.__priority === "MEDIUM" ? "row-warn" : "";
    tr.className = rowClass;
    
    const priorityBadge = `<span class="priority-badge priority-${o.__priority.toLowerCase()}">${o.__priority}</span>`;
    const spsBadge = o.__isSPS ? '<span class="sps-badge">SPS</span>' : '';
    
    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${po}" ${selectedPOs.has(po) ? "checked" : ""}></td>
      <td>${po}</td>
      <td>${o.Customer || o["Cust Name"] || ""}</td>
      <td>${o.Carrier || o.Shipper || ""}${spsBadge}</td>
      <td>${o.Units || o["TTL QTY"] || ""}</td>
      <td>${o.Cartons || o["Packed Cartons"] || ""}</td>
      <td>${o.BOL || o["BOL#"] || ""}</td>
      <td>${o["Master BOL"] || o["Master BOL#"] || ""}</td>
      <td>${o["Start Date"] || ""}</td>
      <td>${o["Cancel Date"] || ""}</td>
      <td>${priorityBadge}</td>
      <td>${o["Load ID"] || "-"}</td>
    `;
    tb.appendChild(tr);
  });
}

/* ========= TRUCKLOAD MANAGEMENT ========= */
function showCreateTruckModal() {
  // Clear form
  ["tl-load-id", "tl-customer", "tl-carrier", "tl-bol", "tl-master", "tl-cartons", "tl-units", "tl-weight"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  
  $("tl-date").value = todayYMD();
  $("tl-window").value = TIME_BLOCKS[0].window;
  $("tl-type").value = "LTL";
  $("modal-title").textContent = "Create New Truckload";
  $("modal-overlay").classList.remove("hidden");
}

function saveTruckload() {
  const loadId = $("tl-load-id").value || `LOAD-${Date.now()}`;
  
  const truck = appState.truckloads.find(t => t.loadId === loadId) || {
    loadId,
    createdAt: new Date().toISOString(),
    createdBy: appState.session.email,
    orders: []
  };
  
  truck.customer = $("tl-customer").value;
  truck.carrier = $("tl-carrier").value;
  truck.loadType = $("tl-type").value;
  truck.pickupDate = $("tl-date").value;
  truck.pickupWindow = $("tl-window").value;
  truck.bol = $("tl-bol").value;
  truck.masterBol = $("tl-master").value;
  truck.cartons = parseInt($("tl-cartons").value) || 0;
  truck.units = parseInt($("tl-units").value) || 0;
  truck.weight = parseFloat($("tl-weight").value) || 0;
  truck.status = truck.status || "Pending";
  truck.stagedLocation = $("tl-staging").value;
  
  if (!appState.truckloads.find(t => t.loadId === loadId)) {
    appState.truckloads.push(truck);
  }
  
  logChange("Truckload saved", { loadId });
  saveState();
  renderAll();
  $("modal-overlay").classList.add("hidden");
}

function renderTruckloads() {
  const tb = $("truckloads-body");
  if (!tb) return;
  
  const q = ($("truckloads-search")?.value || "").toLowerCase();
  
  const filtered = appState.truckloads.filter(t => {
    if (!q) return true;
    return Object.values(t).some(v => 
      String(v || "").toLowerCase().includes(q)
    );
  });
  
  tb.innerHTML = "";
  
  filtered.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="truck-check" data-id="${t.loadId}"></td>
      <td>${t.loadId}</td>
      <td>${t.customer}</td>
      <td>${t.carrier}</td>
      <td>${t.loadType}</td>
      <td>${t.pickupDate}</td>
      <td>${t.pickupWindow}</td>
      <td>${t.cartons}</td>
      <td><span class="status-badge status-${t.status.toLowerCase().replace(/\s/g, '-')}">${t.status}</span></td>
    `;
    
    tr.onclick = (e) => {
      if (!e.target.matches('input')) showTruckDetails(t.loadId);
    };
    
    tb.appendChild(tr);
  });
  
  // Update summary
  $("trucks-summary").textContent = `${filtered.length} loads • ${sumNumber(filtered, "cartons").toLocaleString()} cartons`;
}

function showTruckDetails(loadId) {
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck) return;
  
  const content = $("tl-detail-content");
  content.innerHTML = `
    <h3>${truck.loadId}</h3>
    <div class="detail-grid">
      <div><strong>Customer:</strong> ${truck.customer}</div>
      <div><strong>Carrier:</strong> ${truck.carrier}</div>
      <div><strong>Type:</strong> ${truck.loadType}</div>
      <div><strong>Status:</strong> ${truck.status}</div>
      <div><strong>Date:</strong> ${truck.pickupDate}</div>
      <div><strong>Window:</strong> ${truck.pickupWindow}</div>
      <div><strong>Cartons:</strong> ${truck.cartons}</div>
      <div><strong>Units:</strong> ${truck.units}</div>
      <div><strong>Staging:</strong> ${truck.stagedLocation || "Not assigned"}</div>
      <div><strong>Created:</strong> ${new Date(truck.createdAt).toLocaleString()}</div>
    </div>
    
    <h4>Orders (${truck.orders?.length || 0})</h4>
    <div class="orders-in-truck">
      ${(truck.orders || []).map(po => `<span class="po-chip">${po}</span>`).join("")}
    </div>
    
    <div class="detail-actions">
      <button onclick="editTruck('${loadId}')" class="btn primary">Edit</button>
      <button onclick="printManifest('${loadId}')" class="btn secondary">Print Manifest</button>
      <button onclick="showAppointmentModal('${loadId}')" class="btn secondary">Schedule</button>
      ${truck.cartons > MAX_CARTS_PER_TRUCK ? 
        `<button onclick="showOverflowModal('${loadId}')" class="btn danger">Report Overflow</button>` : ""}
    </div>
  `;
  
  $("tl-detail-overlay").classList.remove("hidden");
}

function editTruck(loadId) {
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck) return;
  
  $("tl-detail-overlay").classList.add("hidden");
  
  // Populate form
  $("tl-load-id").value = truck.loadId;
  $("tl-customer").value = truck.customer;
  $("tl-carrier").value = truck.carrier;
  $("tl-type").value = truck.loadType;
  $("tl-date").value = truck.pickupDate;
  $("tl-window").value = truck.pickupWindow;
  $("tl-bol").value = truck.bol || "";
  $("tl-master").value = truck.masterBol || "";
  $("tl-cartons").value = truck.cartons;
  $("tl-units").value = truck.units;
  $("tl-weight").value = truck.weight || "";
  $("tl-staging").value = truck.stagedLocation || "";
  
  $("modal-title").textContent = "Edit Truckload";
  $("modal-overlay").classList.remove("hidden");
}

/* ========= BULK OPERATIONS ========= */
function showBulkEditModal() {
  const selected = [...selectedPOs];
  if (selected.length === 0) {
    alert("No orders selected");
    return;
  }
  
  $("bulk-count").textContent = selected.length;
  $("bulk-edit-overlay").classList.remove("hidden");
}

function applyBulkEdit() {
  const action = $("bulk-action").value;
  const value = $("bulk-value").value;
  const selected = [...selectedPOs];
  
  if (action === "assign-load") {
    if (!value) {
      alert("Please select a load");
      return;
    }
    
    const truck = appState.truckloads.find(t => t.loadId === value);
    if (!truck) return;
    
    selected.forEach(po => {
      const order = appState.orders.find(o => (o.PO || o["PO Num"]) === po);
      if (order) {
        order["Load ID"] = value;
        if (!truck.orders) truck.orders = [];
        if (!truck.orders.includes(po)) truck.orders.push(po);
      }
    });
    
    // Update truck totals
    truck.cartons = sumNumber(
      appState.orders.filter(o => truck.orders.includes(o.PO || o["PO Num"])),
      "__cartons"
    );
    truck.units = sumNumber(
      appState.orders.filter(o => truck.orders.includes(o.PO || o["PO Num"])),
      "__units"
    );
    
  } else if (action === "change-priority") {
    selected.forEach(po => {
      const order = appState.orders.find(o => (o.PO || o["PO Num"]) === po);
      if (order) order.__priority = value;
    });
  } else if (action === "remove-load") {
    selected.forEach(po => {
      const order = appState.orders.find(o => (o.PO || o["PO Num"]) === po);
      if (order) {
        const oldLoad = order["Load ID"];
        delete order["Load ID"];
        
        // Remove from truck
        const truck = appState.truckloads.find(t => t.loadId === oldLoad);
        if (truck && truck.orders) {
          truck.orders = truck.orders.filter(p => p !== po);
        }
      }
    });
  }
  
  logChange("Bulk edit applied", { action, count: selected.length });
  selectedPOs.clear();
  saveState();
  renderAll();
  $("bulk-edit-overlay").classList.add("hidden");
}

/* ========= AUTO ROUTER ========= */
function runAutoRouter() {
  const ordersToRoute = selectedPOs.size > 0 ?
    appState.orders.filter(o => selectedPOs.has(o.PO || o["PO Num"]))
    : appState.orders.filter(o => !o["Load ID"]);
  
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
  
  // Separate SPS
  const spsOrders = ordersToRoute.filter(o => o.__isSPS && parseYMD(o["Start Date"]) <= plus2);
  const regularOrders = ordersToRoute.filter(o => !o.__isSPS || parseYMD(o["Start Date"]) > plus2);
  
  // Build SPS trucks
  const spsByCarrier = new Map();
  spsOrders.forEach(o => {
    const key = `${o.Carrier || o.Shipper}|${o.__recommendedShip}`;
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
      units: sumNumber(orders, "__units"),
      cartons: sumNumber(orders, "__cartons"),
      fill: 0
    });
  }
  
  // Build regular trucks by customer/carrier
  const byCenter = new Map();
  regularOrders.forEach(o => {
    const center = o.Center || "";
    if (!byCenter.has(center)) byCenter.set(center, []);
    byCenter.get(center).push(o);
  });
  
  // Build center trucks
  for (const [center, orders] of byCenter) {
    let remaining = [...orders];
    
    while (remaining.length > 0) {
      const chunk = [];
      let units = 0;
      let cartons = 0;
      
      for (const o of remaining) {
        if (units + o.__units <= MAX_UNITS_PER_TRUCK && cartons + o.__cartons <= MAX_CARTS_PER_TRUCK) {
          chunk.push(o);
          units += o.__units;
          cartons += o.__cartons;
        }
      }
      
      if (chunk.length === 0) chunk.push(remaining[0]);
      remaining = remaining.filter(o => !chunk.includes(o));
      
      const date = earliestDate(chunk.map(o => o.__recommendedShip));
      const fill = Math.round(Math.min(units / MAX_UNITS_PER_TRUCK, cartons / MAX_CARTS_PER_TRUCK) * 100);
      
      const customer = mostCommon(chunk.map(o => o.Customer || o["Cust Name"]));
      const carrier = mostCommon(chunk.map(o => o.Carrier || o.Shipper));
      
      proposals.push({
        id: `LOAD-${Date.now()}-${proposals.length}`,
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

function confirmAutoRoute() {
  const selectedIds = new Set(
    [...document.querySelectorAll(".auto-check:checked")].map(c => c.dataset.id)
  );
  
  const toCreate = autoProposals.filter(p => selectedIds.has(p.id));
  
  toCreate.forEach(p => {
    // Get edited values
    const dateInput = document.querySelector(`.auto-date[data-id="${p.id}"]`);
    const windowInput = document.querySelector(`.auto-window[data-id="${p.id}"]`);
    
    const newTruck = {
      loadId: p.id,
      loadType: p.loadType,
      customer: p.customer,
      carrier: p.carrier,
      pickupDate: dateInput?.value || p.date,
      pickupWindow: windowInput?.value || p.window,
      bol: mostCommon(p.orders.map(o => o.BOL)),
      masterBol: mostCommon(p.orders.map(o => o["Master BOL"])),
      cartons: p.cartons,
      units: p.units,
      weight: sumNumber(p.orders, "Weight"),
      stagedLocation: "",
      status: "Pending",
      createdAt: new Date().toISOString(),
      createdBy: appState.session.email,
      orders: p.orders.map(o => o.PO)
    };
    
    appState.truckloads.push(newTruck);
    
    // Mark orders as assigned
    p.orders.forEach(o => {
      o["Load ID"] = newTruck.loadId;
    });
  });
  
  logChange("Auto-routed", { created: toCreate.length });
  saveState();
  renderAll();
  $("auto-overlay").classList.add("hidden");
  
  alert(`Created ${toCreate.length} truckloads successfully!`);
}

/* ========= APPOINTMENT SCHEDULING ========= */
function showAppointmentModal(truckId) {
  const truck = appState.truckloads.find(t => t.loadId === truckId);
  if (!truck) return;
  
  $("appt-load-id").textContent = truck.loadId;
  $("appt-customer").textContent = truck.customer;
  $("appt-carrier").textContent = truck.carrier;
  
  // Pre-fill with current date/time if exists
  $("appt-date").value = truck.appointmentDate || truck.pickupDate;
  $("appt-time").value = truck.appointmentTime || "";
  $("appt-dock").value = truck.assignedDock || "";
  
  // Show conflicts
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
    timeOverlaps(t.appointmentTime, time)
  );
  
  if (conflicts.length > 0) {
    $("appt-conflicts").innerHTML = `
      <div class="warning-box">
        ⚠️ Conflict detected: ${conflicts.map(c => c.loadId).join(", ")} 
        already scheduled at this dock/time
      </div>
    `;
  } else {
    $("appt-conflicts").innerHTML = `<div class="success-box">✅ No conflicts</div>`;
  }
}

function saveAppointment() {
  const loadId = $("appt-load-id").textContent;
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  
  if (!truck) return;
  
  truck.appointmentDate = $("appt-date").value;
  truck.appointmentTime = $("appt-time").value;
  truck.assignedDock = $("appt-dock").value;
  truck.appointmentNotes = $("appt-notes").value;
  truck.appointmentBy = appState.session.email;
  truck.appointmentAt = new Date().toISOString();
  
  logChange("Appointment scheduled", { 
    loadId, 
    dock: truck.assignedDock,
    datetime: `${truck.appointmentDate} ${truck.appointmentTime}`
  });
  
  saveState();
  renderAll();
  $("appt-overlay").classList.add("hidden");
  
  // Send notification
  sendAppointmentNotification(truck);
}

function sendAppointmentNotification(truck) {
  // Placeholder for email/SMS notification
  console.log("Appointment notification would be sent for:", truck.loadId);
  
  // Add to alerts
  appState.alerts.push({
    id: `alert-${Date.now()}`,
    type: "info",
    message: `Appointment scheduled: ${truck.loadId} at ${truck.assignedDock} on ${truck.appointmentDate} ${truck.appointmentTime}`,
    timestamp: new Date().toISOString()
  });
  
  updateAlertsBadge();
}

/* ========= OVERFLOW CALLOUT WITH PHOTO ========= */
function showOverflowModal(truckId) {
  const truck = appState.truckloads.find(t => t.loadId === truckId);
  if (!truck) return;
  
  $("overflow-load-id").textContent = truck.loadId;
  $("overflow-customer").textContent = truck.customer;
  
  // Calculate overflow
  const overflow = Math.max(0, truck.cartons - MAX_CARTS_PER_TRUCK);
  $("overflow-amount").textContent = `${overflow.toLocaleString()} cartons over capacity`;
  
  // Reset form
  $("overflow-reason").value = "";
  $("overflow-action").value = "split";
  $("overflow-notes").value = "";
  $("overflow-photo-preview").innerHTML = "";
  
  $("overflow-overlay").classList.remove("hidden");
}

function captureOverflowPhoto() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment"; // Use rear camera on mobile
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement("img");
      img.src = ev.target.result;
      img.style.maxWidth = "300px";
      img.style.marginTop = "10px";
      
      $("overflow-photo-preview").innerHTML = "";
      $("overflow-photo-preview").appendChild(img);
      
      // Store base64 image
      $("overflow-photo-preview").dataset.photo = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  
  input.click();
}

function submitOverflowReport() {
  const loadId = $("overflow-load-id").textContent;
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  
  if (!truck) return;
  
  const report = {
    loadId,
    reason: $("overflow-reason").value,
    action: $("overflow-action").value,
    notes: $("overflow-notes").value,
    photo: $("overflow-photo-preview").dataset.photo || null,
    reportedBy: appState.session.email,
    reportedAt: new Date().toISOString()
  };
  
  // Store overflow report
  if (!truck.overflowReports) truck.overflowReports = [];
  truck.overflowReports.push(report);
  
  // Handle action
  if (report.action === "split") {
    createOverflowTruck(truck);
  } else if (report.action === "reject") {
    truck.status = "Rejected - Overflow";
  }
  
  logChange("Overflow reported", { loadId, action: report.action });
  
  // Alert management
  appState.alerts.push({
    id: `alert-${Date.now()}`,
    type: "warning",
    message: `Overflow reported for ${loadId}: ${report.action} action taken`,
    timestamp: new Date().toISOString()
  });
  
  saveState();
  renderAll();
  updateAlertsBadge();
  $("overflow-overlay").classList.add("hidden");
}

function createOverflowTruck(originalTruck) {
  const overflow = Math.max(0, originalTruck.cartons - MAX_CARTS_PER_TRUCK);
  
  const overflowTruck = {
    ...originalTruck,
    loadId: `${originalTruck.loadId}-OVFL`,
    cartons: overflow,
    units: Math.round(originalTruck.units * (overflow / originalTruck.cartons)),
    status: "Overflow Split",
    createdAt: new Date().toISOString(),
    parentLoad: originalTruck.loadId
  };
  
  // Reduce original truck
  originalTruck.cartons = MAX_CARTS_PER_TRUCK;
  originalTruck.units = originalTruck.units - overflowTruck.units;
  
  appState.truckloads.push(overflowTruck);
}

/* ========= PRINT TEMPLATES ========= */
function printManifest(truckId) {
  const truck = appState.truckloads.find(t => t.loadId === truckId);
  if (!truck) return;
  
  const orders = appState.orders.filter(o => truck.orders?.includes(o.PO));
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Manifest - ${truck.loadId}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; }
        .info-box { padding: 10px; border: 1px solid #ccc; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f0f0f0; }
        .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; }
        .signature { margin-top: 40px; }
        .sig-line { border-bottom: 1px solid #000; width: 300px; margin-top: 40px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">NCDC SHIPPING MANIFEST</div>
        <div>Date: ${new Date().toLocaleDateString()}</div>
      </div>
      
      <div class="info-grid">
        <div class="info-box">
          <strong>Load ID:</strong> ${truck.loadId}<br>
          <strong>Customer:</strong> ${truck.customer}<br>
          <strong>Carrier:</strong> ${truck.carrier}
        </div>
        <div class="info-box">
          <strong>Pickup Date:</strong> ${truck.pickupDate}<br>
          <strong>Pickup Window:</strong> ${truck.pickupWindow}<br>
          <strong>Dock:</strong> ${truck.assignedDock || "TBD"}
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>PO#</th>
            <th>BOL</th>
            <th>Store</th>
            <th>Units</th>
            <th>Cartons</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td>${o.PO}</td>
              <td>${o.BOL || ""}</td>
              <td>${o.Store || ""}</td>
              <td>${o.Units || ""}</td>
              <td>${o.Cartons || ""}</td>
              <td>${o.Weight || ""}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="3">TOTALS</th>
            <th>${truck.units}</th>
            <th>${truck.cartons}</th>
            <th>${truck.weight || ""}</th>
          </tr>
        </tfoot>
      </table>
      
      <div class="signature">
        <p><strong>Driver Signature:</strong></p>
        <div class="sig-line"></div>
        <p><strong>Dock Lead Signature:</strong></p>
        <div class="sig-line"></div>
      </div>
      
      <div class="footer">
        <small>Generated: ${new Date().toLocaleString()} by ${appState.session.email}</small>
      </div>
    </body>
    </html>
  `);
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

function printSchedule() {
  const today = todayYMD();
  const todaysTrucks = appState.truckloads.filter(t => 
    sameDate(t.pickupDate, today)
  ).sort((a, b) => (a.pickupWindow || "").localeCompare(b.pickupWindow || ""));
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Schedule - ${today}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; }
        .schedule-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
        th { background: #007baf; color: white; }
        .time-block { background: #f0f0f0; font-weight: bold; }
        .status-pending { color: orange; }
        .status-staged { color: green; }
        .status-departed { color: gray; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">NCDC DAILY PICKUP SCHEDULE</div>
        <div>Date: ${new Date(today).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</div>
      </div>
      
      <table class="schedule-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Load ID</th>
            <th>Customer</th>
            <th>Carrier</th>
            <th>Dock</th>
            <th>Cartons</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${TIME_BLOCKS.map(block => {
            const trucksInBlock = todaysTrucks.filter(t => 
              t.pickupWindow === block.window
            );
            
            if (trucksInBlock.length === 0) return "";
            
            return `
              <tr class="time-block">
                <td colspan="7">${block.label}</td>
              </tr>
              ${trucksInBlock.map(t => `
                <tr>
                  <td></td>
                  <td>${t.loadId}</td>
                  <td>${t.customer}</td>
                  <td>${t.carrier}</td>
                  <td>${t.assignedDock || t.stagedLocation || "TBD"}</td>
                  <td>${t.cartons}</td>
                  <td class="status-${t.status.toLowerCase().replace(/\s/g, '-')}">${t.status}</td>
                </tr>
              `).join("")}
            `;
          }).join("")}
        </tbody>
      </table>
      
      <div style="margin-top: 40px;">
        <p><strong>Summary:</strong></p>
        <ul>
          <li>Total Pickups: ${todaysTrucks.length}</li>
          <li>Total Cartons: ${todaysTrucks.reduce((s, t) => s + t.cartons, 0).toLocaleString()}</li>
          <li>Pending: ${todaysTrucks.filter(t => t.status === "Pending").length}</li>
          <li>Staged: ${todaysTrucks.filter(t => t.status.includes("Staged")).length}</li>
          <li>Departed: ${todaysTrucks.filter(t => t.status === "Departed").length}</li>
        </ul>
      </div>
      
      <div style="margin-top: 40px; font-size: 12px;">
        <small>Generated: ${new Date().toLocaleString()} by ${appState.session.email}</small>
      </div>
    </body>
    </html>
  `);
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

function printLabels(truckId) {
  const truck = appState.truckloads.find(t => t.loadId === truckId);
  if (!truck) return;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Labels - ${truck.loadId}</title>
      <style>
        body { margin: 0; padding: 0; }
        .label {
          width: 4in;
          height: 6in;
          border: 2px solid #000;
          padding: 20px;
          page-break-after: always;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-family: Arial, sans-serif;
        }
        .label:last-child { page-break-after: auto; }
        .barcode {
          font-family: 'Libre Barcode 128', monospace;
          font-size: 48px;
          text-align: center;
          margin: 20px 0;
        }
        .big-text { font-size: 36px; font-weight: bold; text-align: center; }
        .info-row { margin: 10px 0; font-size: 18px; }
        .footer { text-align: center; font-size: 14px; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet">
    </head>
    <body>
      <div class="label">
        <div>
          <div class="big-text">${truck.loadId}</div>
          <div class="barcode">${truck.loadId}</div>
        </div>
        
        <div>
          <div class="info-row"><strong>Customer:</strong> ${truck.customer}</div>
          <div class="info-row"><strong>Carrier:</strong> ${truck.carrier}</div>
          <div class="info-row"><strong>Date:</strong> ${truck.pickupDate}</div>
          <div class="info-row"><strong>Time:</strong> ${truck.pickupWindow}</div>
          <div class="info-row"><strong>Location:</strong> ${truck.stagedLocation || "TBD"}</div>
        </div>
        
        <div>
          <div class="big-text">${truck.cartons} CARTONS</div>
        </div>
        
        <div class="footer">
          NCDC Shipping • ${new Date().toLocaleDateString()}
        </div>
      </div>
    </body>
    </html>
  `);
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

/* ========= SETTINGS PAGE ========= */
function renderSettings() {
  const container = $("tab-settings");
  if (!container) return;
  
  container.innerHTML = `
    <header class="pane-header">
      <h2>Settings</h2>
      <p>Configure system parameters and business rules.</p>
    </header>
    
    <div class="settings-grid">
      <!-- Customer Rules -->
      <div class="setting-block">
        <h3>Customer Rules</h3>
        <div id="customer-rules-list"></div>
        <button onclick="addCustomerRule()" class="btn tiny primary">+ Add Rule</button>
      </div>
      
      <!-- Store-Center Patterns -->
      <div class="setting-block">
        <h3>Store → Center Patterns</h3>
        <div id="center-patterns-list"></div>
        <button onclick="addCenterPattern()" class="btn tiny primary">+ Add Pattern</button>
      </div>
      
      <!-- Capacity Settings -->
      <div class="setting-block">
        <h3>Capacity Limits</h3>
        <div class="capacity-info">
          <p><strong>Max Units per Truck:</strong> ${MAX_UNITS_PER_TRUCK.toLocaleString()}</p>
          <p><strong>Max Cartons per Truck:</strong> ${MAX_CARTS_PER_TRUCK.toLocaleString()}</p>
          <p><strong>Max LTL per Day:</strong> ${appState.settings.maxLTL}</p>
          <p><strong>Max Truckload per Day:</strong> ${appState.settings.maxTL}</p>
          <p><strong>Max Floorload per Day:</strong> ${appState.settings.maxFloor}</p>
        </div>
      </div>
      
      <!-- Time Windows -->
      <div class="setting-block">
        <h3>Pickup Time Windows</h3>
        <div class="time-blocks-list">
          ${TIME_BLOCKS.map(b => `
            <div class="time-block-item">${b.label} (${b.window})</div>
          `).join("")}
        </div>
      </div>
      
      <!-- Carrier SPS List -->
      <div class="setting-block">
        <h3>SPS Carriers</h3>
        <div id="sps-carriers-list"></div>
        <button onclick="manageSPSCarriers()" class="btn tiny primary">Manage</button>
      </div>
      
      <!-- Danger Zone -->
      <div class="setting-block danger-zone">
        <h3>⚠️ Danger Zone</h3>
        <button id="clear-all-data" class="btn danger">Clear All Data</button>
      </div>
    </div>
  `;
  
  renderCustomerRules();
  renderCenterPatterns();
  renderSPSCarriers();
}

function renderCustomerRules() {
  const list = $("customer-rules-list");
  if (!list) return;
  
  const rules = appState.settings.customerRules || [];
  
  if (rules.length === 0) {
    list.innerHTML = `<p class="muted">No custom rules defined</p>`;
    return;
  }
  
  list.innerHTML = rules.map((rule, idx) => `
    <div class="rule-item">
      <strong>${rule.customer}</strong>
      <div>Default Carrier: ${rule.defaultCarrier || "Any"}</div>
      <div>Load Type: ${rule.preferredLoadType || "Auto"}</div>
      <div>Max Days Hold: ${rule.maxDaysHold || "N/A"}</div>
      <button onclick="deleteCustomerRule(${idx})" class="btn tiny danger">Delete</button>
    </div>
  `).join("");
}

function addCustomerRule() {
  const customer = prompt("Customer name:");
  if (!customer) return;
  
  const defaultCarrier = prompt("Default carrier (leave empty for any):");
  const preferredLoadType = prompt("Preferred load type (LTL/Truckload/Floorload):");
  const maxDaysHold = prompt("Max days to hold orders:");
  
  if (!appState.settings.customerRules) {
    appState.settings.customerRules = [];
  }
  
  appState.settings.customerRules.push({
    customer,
    defaultCarrier: defaultCarrier || null,
    preferredLoadType: preferredLoadType || "Auto",
    maxDaysHold: parseInt(maxDaysHold) || null
  });
  
  saveState();
  renderCustomerRules();
}

function deleteCustomerRule(idx) {
  if (!confirm("Delete this rule?")) return;
  appState.settings.customerRules.splice(idx, 1);
  saveState();
  renderCustomerRules();
}

function renderCenterPatterns() {
  const list = $("center-patterns-list");
  if (!list) return;
  
  const patterns = appState.settings.centerPatterns || [];
  
  if (patterns.length === 0) {
    list.innerHTML = `<p class="muted">No patterns defined</p>`;
    return;
  }
  
  list.innerHTML = patterns.map((pattern, idx) => `
    <div class="pattern-item">
      <strong>Store ${pattern.storePattern} → ${pattern.center}</strong>
      <button onclick="deleteCenterPattern(${idx})" class="btn tiny danger">Delete</button>
    </div>
  `).join("");
}

function addCenterPattern() {
  const storePattern = prompt("Store pattern (e.g., '6*' for all starting with 6):");
  if (!storePattern) return;
  
  const center = prompt("Assign to center:");
  if (!center) return;
  
  if (!appState.settings.centerPatterns) {
    appState.settings.centerPatterns = [];
  }
  
  appState.settings.centerPatterns.push({ storePattern, center });
  saveState();
  renderCenterPatterns();
}

function deleteCenterPattern(idx) {
  if (!confirm("Delete this pattern?")) return;
  appState.settings.centerPatterns.splice(idx, 1);
  saveState();
  renderCenterPatterns();
}

function renderSPSCarriers() {
  const list = $("sps-carriers-list");
  if (!list) return;
  
  const carriers = ["FXB", "WEB", "UPS", "EST", "OPR"];
  list.innerHTML = carriers.map(c => `
    <span class="sps-badge">${c}</span>
  `).join(" ");
}

function manageSPSCarriers() {
  alert("SPS Carrier management coming soon!");
}

/* ========= DOCK MANAGEMENT FUNCTIONS ========= */
function renderDock() {
  const tb = $("dock-body");
  if (!tb) return;
  
  const q = ($("dock-search")?.value || "").toLowerCase();
  
  const filtered = appState.truckloads.filter(t => {
    if (!q) return true;
    return Object.values(t).some(v => 
      String(v || "").toLowerCase().includes(q)
    );
  });
  
  tb.innerHTML = "";
  
  filtered.forEach(t => {
    const tr = document.createElement("tr");
    const statusClass = t.status === "Fully Staged" ? "status-staged" :
                       t.status === "Partially Staged" ? "status-partial" :
                       t.status === "Departed" ? "status-departed" : "";
    
    tr.innerHTML = `
      <td>${t.loadId}</td>
      <td>${t.customer}</td>
      <td>
        <select class="input-slim staging-select" data-id="${t.loadId}">
          <option value="">Assign Location...</option>
          ${[...SL_LANES, ...DD_DOORS].map(loc => `
            <option value="${loc}" ${t.stagedLocation === loc ? "selected" : ""}>${loc}</option>
          `).join("")}
        </select>
      </td>
      <td>
        <select class="input-slim status-select" data-id="${t.loadId}">
          <option value="Pending" ${t.status === "Pending" ? "selected" : ""}>Pending</option>
          <option value="Partially Staged" ${t.status === "Partially Staged" ? "selected" : ""}>Partially Staged</option>
          <option value="Fully Staged" ${t.status === "Fully Staged" ? "selected" : ""}>Fully Staged</option>
          <option value="Loading" ${t.status === "Loading" ? "selected" : ""}>Loading</option>
          <option value="Departed" ${t.status === "Departed" ? "selected" : ""}>Departed</option>
        </select>
      </td>
      <td>${t.pickupDate}</td>
      <td>${t.cartons}</td>
      <td class="${statusClass}">${getProgressBar(t.status)}</td>
      <td>
        <button onclick="showDockHistory('${t.loadId}')" class="btn tiny secondary">History</button>
        <button onclick="showDockMap('${t.loadId}')" class="btn tiny primary">Map</button>
      </td>
    `;
    tb.appendChild(tr);
  });
  
  // Attach change handlers
  document.querySelectorAll(".staging-select").forEach(sel => {
    sel.onchange = (e) => updateStaging(e.target.dataset.id, e.target.value);
  });
  
  document.querySelectorAll(".status-select").forEach(sel => {
    sel.onchange = (e) => updateDockStatus(e.target.dataset.id, e.target.value);
  });
}

function updateStaging(loadId, location) {
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck) return;
  
  const oldLocation = truck.stagedLocation;
  truck.stagedLocation = location;
  
  logChange("Staging updated", { loadId, from: oldLocation, to: location });
  saveState();
  renderDock();
  
  // Check if location is a dock door and auto-update status
  if (location.startsWith("DD") && truck.status === "Pending") {
    truck.status = "Partially Staged";
    renderDock();
  }
}

function updateDockStatus(loadId, status) {
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck) return;
  
  const oldStatus = truck.status;
  truck.status = status;
  
  if (status === "Departed") {
    truck.departedAt = new Date().toISOString();
    truck.departedBy = appState.session.email;
    
    // Move to history
    moveToHistory(truck);
  }
  
  logChange("Status updated", { loadId, from: oldStatus, to: status });
  saveState();
  renderAll();
}

function moveToHistory(truck) {
  const historyEntry = {
    ...truck,
    completedAt: new Date().toISOString(),
    completedBy: appState.session.email
  };
  
  appState.history.push(historyEntry);
  
  // Remove from active truckloads
  const idx = appState.truckloads.findIndex(t => t.loadId === truck.loadId);
  if (idx >= 0) {
    appState.truckloads.splice(idx, 1);
  }
}

function getProgressBar(status) {
  const pct = status === "Pending" ? 0 :
              status === "Partially Staged" ? 33 :
              status === "Fully Staged" ? 66 :
              status === "Loading" ? 90 :
              status === "Departed" ? 100 : 0;
  
  return `
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${pct}%"></div>
    </div>
  `;
}

function showDockHistory(loadId) {
  const logs = appState.changeLog.filter(log => 
    log.details?.loadId === loadId
  );
  
  const content = $("dock-history-content");
  content.innerHTML = logs.length === 0 ? 
    `<p class="muted">No history for this load</p>` :
    logs.map(log => `
      <div class="history-item">
        <strong>${log.action}</strong>
        <div>${new Date(log.timestamp).toLocaleString()}</div>
        <div class="muted">${log.user}</div>
      </div>
    `).join("");
  
  $("dock-history-overlay").classList.remove("hidden");
}

function showDockMap(loadId) {
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck || !truck.stagedLocation) {
    alert("No staging location assigned");
    return;
  }
  
  // Generate simple ASCII map
  const mapContent = $("dock-map-content");
  mapContent.innerHTML = `
    <h3>Location: ${truck.stagedLocation}</h3>
    <div class="ascii-map">
      <pre>
      NCDC DOCK MAP
      =============
      
      ${truck.stagedLocation.startsWith("DD") ? "DOCK DOORS:" : "STAGING LANES:"}
      
      ${generateASCIIMap(truck.stagedLocation)}
      
      Load: ${truck.loadId}
      Customer: ${truck.customer}
      Cartons: ${truck.cartons}
      </pre>
    </div>
  `;
  
  $("dock-map-overlay").classList.remove("hidden");
}

function generateASCIIMap(location) {
  if (location.startsWith("DD")) {
    const doorNum = parseInt(location.substring(2));
    let map = "";
    for (let i = 2; i <= 73; i++) {
      if (i === doorNum) {
        map += "[X]";
      } else {
        map += "[ ]";
      }
      if (i % 10 === 0) map += "\n";
    }
    return map;
  } else {
    // Staging lane map
    return `
    SL18A ---- SL19A ---- SL20A
      |         |         |
    ${location === "SL18A" ? "[X]" : "[ ]"}      ${location === "SL19A" ? "[X]" : "[ ]"}      ${location === "SL20A" ? "[X]" : "[ ]"}
    `;
  }
}

/* ========= TODAY'S PICKUPS ========= */
function renderTodays() {
  const tb = $("todays-body");
  if (!tb) return;
  
  const today = todayYMD();
  const todaysTrucks = appState.truckloads.filter(t => 
    sameDate(t.pickupDate, today)
  ).sort((a, b) => (a.pickupWindow || "").localeCompare(b.pickupWindow || ""));
  
  tb.innerHTML = "";
  
  todaysTrucks.forEach(t => {
    const tr = document.createElement("tr");
    const statusClass = t.status === "Departed" ? "status-departed" :
                       t.status.includes("Staged") ? "status-staged" : "";
    
    tr.innerHTML = `
      <td>${t.pickupWindow || "TBD"}</td>
      <td>${t.loadId}</td>
      <td>${t.customer}</td>
      <td>${t.carrier}</td>
      <td>${t.loadType}</td>
      <td>${t.assignedDock || t.stagedLocation || "TBD"}</td>
      <td>${t.cartons}</td>
      <td class="${statusClass}">${t.status}</td>
      <td>
        ${t.status !== "Departed" ? `
          <button onclick="markDeparted('${t.loadId}')" class="btn tiny success">Departed</button>
        ` : `
          <span class="muted">✓ ${new Date(t.departedAt).toLocaleTimeString()}</span>
        `}
      </td>
    `;
    tb.appendChild(tr);
  });
  
  // Update summary
  const summary = $("todays-summary");
  if (summary) {
    const departed = todaysTrucks.filter(t => t.status === "Departed").length;
    const pending = todaysTrucks.filter(t => t.status === "Pending").length;
    
    summary.textContent = `${todaysTrucks.length} pickups today • ${departed} departed • ${pending} pending`;
  }
}

function markDeparted(loadId) {
  const truck = appState.truckloads.find(t => t.loadId === loadId);
  if (!truck) return;
  
  const departTime = prompt("Departure time (HH:MM):", new Date().toTimeString().slice(0, 5));
  if (!departTime) return;
  
  truck.status = "Departed";
  truck.departedAt = new Date().toISOString();
  truck.departedBy = appState.session.email;
  truck.actualDepartTime = departTime;
  
  logChange("Marked departed", { loadId, time: departTime });
  
  // Move to history
  moveToHistory(truck);
  
  saveState();
  renderAll();
}

/* ========= METRICS ========= */
function renderMetrics() {
  const today = new Date(todayYMD());
  const weekStart = addDays(today, -((today.getDay() + 6) % 7));
  const weekEnd = addDays(weekStart, 6);
  
  // Calculate metrics
  const todaysOrders = appState.orders.filter(o => 
    sameDate(parseYMD(o.__shipBy), today)
  );
  
  const weekOrders = appState.orders.filter(o => {
    const d = parseYMD(o.__shipBy);
    return d >= weekStart && d <= weekEnd;
  });
  
  const todaysTrucks = appState.truckloads.filter(t => 
    sameDate(t.pickupDate, today)
  );
  
  // Update metric cards
  $("m-units-today").textContent = sumNumber(todaysOrders, "__units").toLocaleString();
  $("m-units-week").textContent = sumNumber(weekOrders, "__units").toLocaleString();
  $("m-total-cartons").textContent = sumNumber(appState.orders, "__cartons").toLocaleString();
  $("m-active-loads").textContent = appState.truckloads.length;
  
  // Render detailed metrics
  const metricsContainer = $("tab-metrics");
  const existingCards = metricsContainer.querySelector(".metrics-row");
  
  // Add detailed sections after cards
  let detailsSection = metricsContainer.querySelector(".metric-section");
  if (!detailsSection) {
    detailsSection = document.createElement("div");
    detailsSection.className = "metric-section";
    metricsContainer.appendChild(detailsSection);
  }
  
  detailsSection.innerHTML = `
    <h3>Performance Breakdown</h3>
    
    <div class="metrics-grid">
      <div>
        <h4>By Priority</h4>
        <div class="metric-row">
          <span>High Priority</span>
          <span>${appState.orders.filter(o => o.__priority === "HIGH").length}</span>
        </div>
        <div class="metric-row">
          <span>Medium Priority</span>
          <span>${appState.orders.filter(o => o.__priority === "MEDIUM").length}</span>
        </div>
        <div class="metric-row">
          <span>Low Priority</span>
          <span>${appState.orders.filter(o => o.__priority === "LOW").length}</span>
        </div>
      </div>
      
      <div>
        <h4>By Status</h4>
        <div class="metric-row">
          <span>Unassigned Orders</span>
          <span>${appState.orders.filter(o => !o["Load ID"]).length}</span>
        </div>
        <div class="metric-row">
          <span>Assigned Orders</span>
          <span>${appState.orders.filter(o => o["Load ID"]).length}</span>
        </div>
        <div class="metric-row">
          <span>SPS Orders</span>
          <span>${appState.orders.filter(o => o.__isSPS).length}</span>
        </div>
      </div>
    </div>
    
    <div class="metric-section">
      <h4>Today's Performance</h4>
      <div class="metric-row">
        <span>On-Time Departures</span>
        <span>${todaysTrucks.filter(t => t.status === "Departed").length} / ${todaysTrucks.length}</span>
      </div>
      <div class="metric-row">
        <span>Average Fill Rate</span>
        <span>${calculateAverageFill()}%</span>
      </div>
      <div class="metric-row">
        <span>Dock Utilization</span>
        <span>${calculateDockUtilization()}%</span>
      </div>
    </div>
  `;
}

function calculateAverageFill() {
  if (appState.truckloads.length === 0) return 0;
  
  const fills = appState.truckloads.map(t => {
    const unitFill = (t.units / MAX_UNITS_PER_TRUCK) * 100;
    const cartonFill = (t.cartons / MAX_CARTS_PER_TRUCK) * 100;
    return Math.min(unitFill, cartonFill);
  });
  
  return Math.round(fills.reduce((a, b) => a + b, 0) / fills.length);
}

function calculateDockUtilization() {
  const activeDocks = new Set(
    appState.truckloads
      .filter(t => t.stagedLocation && t.stagedLocation.startsWith("DD"))
      .map(t => t.stagedLocation)
  ).size;
  
  const totalDocks = DD_DOORS.length;
  return Math.round((activeDocks / totalDocks) * 100);
}

/* ========= DISCREPANCIES ========= */
function renderDiscrepancies() {
  const tb = $("disc-body");
  if (!tb) return;
  
  const discrepancies = findDiscrepancies();
  const q = ($("disc-search")?.value || "").toLowerCase();
  
  const filtered = discrepancies.filter(d => {
    if (!q) return true;
    return Object.values(d).some(v => 
      String(v || "").toLowerCase().includes(q)
    );
  });
  
  tb.innerHTML = "";
  
  filtered.forEach(d => {
    const tr = document.createElement("tr");
    tr.className = d.type === "MISSING" ? "row-danger" : "row-warn";
    
    tr.innerHTML = `
      <td><span class="disc-type disc-${d.type.toLowerCase()}">${d.type}</span></td>
      <td>${d.po}</td>
      <td>${d.field}</td>
      <td>${d.csvValue || "-"}</td>
      <td>${d.dashValue || "-"}</td>
      <td>${d.loadIds?.join(", ") || "-"}</td>
    `;
    tb.appendChild(tr);
  });
  
  // Update summary
  const summary = document.createElement("div");
  summary.className = "disc-summary";
  summary.innerHTML = `
    Found ${discrepancies.length} discrepancies • 
    ${discrepancies.filter(d => d.type === "MISSING").length} missing • 
    ${discrepancies.filter(d => d.type === "MISMATCH").length} mismatches
  `;
  
  const header = $("tab-discrepancies").querySelector(".pane-header");
  const existing = header.querySelector(".disc-summary");
  if (existing) existing.remove();
  header.appendChild(summary);
}

function findDiscrepancies() {
  const discs = [];
  
  // Check for missing orders
  appState.orders.forEach(order => {
    // Check if order is assigned but truck doesn't exist
    if (order["Load ID"]) {
      const truckExists = appState.truckloads.some(t => 
        t.loadId === order["Load ID"] || t.orders?.includes(order.PO)
      );
      
      if (!truckExists) {
        discs.push({
          type: "MISSING",
          po: order.PO,
          field: "Load Assignment",
          csvValue: order["Load ID"],
          dashValue: "Truck not found",
          loadIds: [order["Load ID"]]
        });
      }
    }
    
    // Check for data mismatches
    const truck = appState.truckloads.find(t => 
      t.orders?.includes(order.PO)
    );
    
    if (truck) {
      // Check carton count mismatch
      const truckCartons = truck.orders
        ?.map(po => appState.orders.find(o => o.PO === po))
        .filter(Boolean)
        .reduce((sum, o) => sum + (o.__cartons || 0), 0);
      
      if (truckCartons && Math.abs(truckCartons - truck.cartons) > 5) {
        discs.push({
          type: "MISMATCH",
          po: order.PO,
          field: "Carton Count",
          csvValue: truckCartons,
          dashValue: truck.cartons,
          loadIds: [truck.loadId]
        });
      }
    }
  });
  
  // Check for orphaned trucks
  appState.truckloads.forEach(truck => {
    if (!truck.orders || truck.orders.length === 0) {
      discs.push({
        type: "MISSING",
        po: "N/A",
        field: "Orders",
        csvValue: "No orders assigned",
        dashValue: truck.loadId,
        loadIds: [truck.loadId]
      });
    }
  });
  
  return discs;
}

/* ========= HISTORY ========= */
function renderHistory() {
  const tb = $("history-body");
  if (!tb) return;
  
  const q = ($("history-search")?.value || "").toLowerCase();
  
  const filtered = appState.history.filter(h => {
    if (!q) return true;
    return Object.values(h).some(v => 
      String(v || "").toLowerCase().includes(q)
    );
  });
  
  tb.innerHTML = "";
  
  filtered.slice(0, 100).forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.loadId}</td>
      <td>${h.customer}</td>
      <td>${h.carrier}</td>
      <td>${h.pickupDate}</td>
      <td>${h.cartons}</td>
      <td>${h.status}</td>
      <td>${new Date(h.completedAt).toLocaleDateString()}</td>
      <td>
        <button onclick="viewHistoryDetails('${h.loadId}')" class="btn tiny secondary">Details</button>
      </td>
    `;
    tb.appendChild(tr);
  });
}

function viewHistoryDetails(loadId) {
  const entry = appState.history.find(h => h.loadId === loadId);
  if (!entry) return;
  
  alert(`
    Load Details:
    ID: ${entry.loadId}
    Customer: ${entry.customer}
    Carrier: ${entry.carrier}
    Pickup Date: ${entry.pickupDate}
    Completed: ${new Date(entry.completedAt).toLocaleString()}
    By: ${entry.completedBy}
    Cartons: ${entry.cartons}
    Units: ${entry.units}
    Status: ${entry.status}
  `);
}

/* ========= HELPER FUNCTIONS ========= */
function timeOverlaps(time1, time2) {
  if (!time1 || !time2) return false;
  
  const [start1, end1] = time1.split("-").map(t => parseInt(t.replace(":", "")));
  const [start2, end2] = time2.split("-").map(t => parseInt(t.replace(":", "")));
  
  return !(end1 <= start2 || end2 <= start1);
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
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const loaded = JSON.parse(saved);
      Object.assign(appState, loaded);
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

function logChange(action, details) {
  appState.changeLog.unshift({
    id: `log-${Date.now()}`,
    action,
    details,
    timestamp: new Date().toISOString(),
    user: appState.session.email
  });
  
  // Keep only last 1000 entries
  if (appState.changeLog.length > 1000) {
    appState.changeLog = appState.changeLog.slice(0, 1000);
  }
}

function checkAlerts() {
  const alerts = [];
  const today = new Date(todayYMD());
  
  // Check for high priority unassigned
  const highUnassigned = appState.orders.filter(o => 
    o.__priority === "HIGH" && !o["Load ID"]
  );
  
  if (highUnassigned.length > 0) {
    alerts.push({
      id: `alert-high-${Date.now()}`,
      type: "error",
      message: `${highUnassigned.length} high priority orders unassigned`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Check for today's unprepared trucks
  const todaysUnstaged = appState.truckloads.filter(t => 
    sameDate(t.pickupDate, today) && t.status === "Pending"
  );
  
  if (todaysUnstaged.length > 0) {
    alerts.push({
      id: `alert-unstaged-${Date.now()}`,
      type: "warning",
      message: `${todaysUnstaged.length} trucks for today not staged`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Check for overflow
  const overflowTrucks = appState.truckloads.filter(t => 
    t.cartons > MAX_CARTS_PER_TRUCK
  );
  
  if (overflowTrucks.length > 0) {
    alerts.push({
      id: `alert-overflow-${Date.now()}`,
      type: "warning",
      message: `${overflowTrucks.length} trucks over capacity`,
      timestamp: new Date().toISOString()
    });
  }
  
  appState.alerts = alerts;
  updateAlertsBadge();
}

function updateAlertsBadge() {
  const badge = $("alerts-badge");
  const count = $("alerts-count");
  
  if (appState.alerts.length > 0) {
    badge?.classList.remove("hidden");
    if (count) count.textContent = appState.alerts.length;
  } else {
    badge?.classList.add("hidden");
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    appState,
    renderAll,
    handleCSVUpload,
    init
  };
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
