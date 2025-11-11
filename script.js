// script.js

// --- STATE ----------------------------------------------------
let orders = [];           // all parsed orders from CSV
let filteredOrders = [];   // after search/date filter
let selectedPOs = new Set();
let truckloads = [];       // created truckloads
let historyLoads = [];     // departed
let team = [
  { name: "Router 1", role: "router", shift: "1st", active: true },
  { name: "Dock Lead", role: "dock", shift: "1st", active: true }
];

// --- LOGIN ----------------------------------------------------
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");

loginBtn.addEventListener("click", () => {
  const ok =
    loginEmail.value.trim() === "htellez032003@gmail.com" &&
    loginPassword.value.trim() === "Ltapaprel040523";

  if (ok) {
    loginError.classList.add("hidden");
    loginScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
  } else {
    loginError.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

// --- TABS -----------------------------------------------------
const navLinks = document.querySelectorAll(".nav-link");
const tabPanels = document.querySelectorAll(".tab-panel");

navLinks.forEach(btn => {
  btn.addEventListener("click", () => {
    navLinks.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    tabPanels.forEach(p => {
      if (p.id === "tab-" + tab) p.classList.remove("hidden");
      else p.classList.add("hidden");
    });
  });
});

// --- CSV UPLOAD -----------------------------------------------
const csvInput = document.getElementById("orders-csv");
csvInput.addEventListener("change", handleCSVUpload);

function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const text = evt.target.result;
    parseCSV(text);
    document.getElementById("csv-updated").textContent =
      "CSV updated: " + new Date().toLocaleString();
  };
  reader.readAsText(file);
}

// parse CSV into array of objects
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  const header = lines[0].split(",").map(h => h.trim());
  orders = lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = cols[i] ? cols[i].trim() : "";
    });
    return obj;
  });

  // default: no filter
  filteredOrders = orders.slice();
  renderOrders();
}

// simple CSV splitter (no quotes nested for now)
function splitCSVLine(line) {
  // very basic – user said leave advanced for later
  return line.split(",");
}

// --- RENDER ORDERS --------------------------------------------
const ordersBody = document.getElementById("orders-body");
const selectedCountEl = document.getElementById("selected-count");

function renderOrders() {
  ordersBody.innerHTML = "";
  filteredOrders.forEach((ord, idx) => {
    const tr = document.createElement("tr");

    // key columns (must match your new headers if present)
    const division = ord["Division"] || "";
    const bol = ord["BOL#"] || "";
    const mbol = ord["Master BOL#"] || "";
    const po = ord["PO Num"] || "";
    const customer = ord["Customer"] || "";
    const custName = ord["Cust Name"] || "";
    const shipper = ord["Shipper"] || "";
    const ttlQty = ord["TTL QTY"] || "";
    const ttlAmt = ord["TTL Amt"] || "";
    const totalWeight = ord["Total Weight"] || "";
    const totalCubic = ord["Total Cubic"] || "";
    const estCartons = ord["Est. Cartons"] || "";
    const estPallet = ord["Est. Pallet"] || "";
    const pickProc = ord["Pick Proc Date"] || "";
    const startDate = ord["Start Date"] || "";
    const cancelDate = ord["Cancel Date"] || "";
    const router = ord["Router"] || "";
    const routeDate = ord["Route Date"] || "";
    const schedDate = ord["Scheduled Date"] || "";
    const readyDate = ord["Ready Date"] || "";
    const author = ord["Author#"] || "";
    const ptStatus = ord["PT STATUS"] || "";

    const isSelected = selectedPOs.has(po);

    tr.innerHTML = `
      <td><input type="checkbox" class="po-check" data-po="${po}" ${isSelected ? "checked" : ""}></td>
      <td>${division}</td>
      <td>${bol}</td>
      <td>${mbol}</td>
      <td>${po}</td>
      <td>${customer}</td>
      <td>${custName}</td>
      <td>${shipper}</td>
      <td>${ttlQty}</td>
      <td>${ttlAmt}</td>
      <td>${totalWeight}</td>
      <td>${totalCubic}</td>
      <td>${estCartons}</td>
      <td>${estPallet}</td>
      <td>${pickProc}</td>
      <td>${startDate}</td>
      <td>${cancelDate}</td>
      <td>${router}</td>
      <td>${routeDate}</td>
      <td>${schedDate}</td>
      <td>${readyDate}</td>
      <td>${author}</td>
      <td>${ptStatus}</td>
      <td>${""}</td>
    `;
    ordersBody.appendChild(tr);
  });

  // attach checkbox handlers
  document.querySelectorAll(".po-check").forEach(chk => {
    chk.addEventListener("change", e => {
      const po = e.target.dataset.po;
      if (e.target.checked) selectedPOs.add(po);
      else selectedPOs.delete(po);
      selectedCountEl.textContent = selectedPOs.size;
    });
  });

  // update selected count
  selectedCountEl.textContent = selectedPOs.size;
}

// select-all should only select visible rows
document.getElementById("select-all-orders").addEventListener("change", e => {
  const checked = e.target.checked;
  document.querySelectorAll("#orders-body .po-check").forEach(chk => {
    chk.checked = checked;
    const po = chk.dataset.po;
    if (checked) selectedPOs.add(po);
    else selectedPOs.delete(po);
  });
  selectedCountEl.textContent = selectedPOs.size;
});

// --- SEARCH / FILTERS -----------------------------------------
document.getElementById("orders-search").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  filteredOrders = orders.filter(o => {
    return (
      (o["PO Num"] || "").toLowerCase().includes(q) ||
      (o["Customer"] || "").toLowerCase().includes(q) ||
      (o["Cust Name"] || "").toLowerCase().includes(q) ||
      (o["Shipper"] || "").toLowerCase().includes(q) ||
      (o["BOL#"] || "").toLowerCase().includes(q)
    );
  });
  renderOrders();
});

document.getElementById("apply-date-filter").addEventListener("click", () => {
  const col = document.getElementById("date-column-select").value;
  const from = document.getElementById("date-from").value;
  const to = document.getElementById("date-to").value;
  filteredOrders = orders.filter(o => {
    const val = (o[col] || "").split(" ")[0]; // in case time added later
    if (!val) return false;
    if (from && val < from) return false;
    if (to && val > to) return false;
    return true;
  });
  renderOrders();
});

document.getElementById("clear-filters").addEventListener("click", () => {
  filteredOrders = orders.slice();
  document.getElementById("orders-search").value = "";
  document.getElementById("date-from").value = "";
  document.getElementById("date-to").value = "";
  renderOrders();
});

// --- CALENDAR (orders) ----------------------------------------
const calendarEl = document.getElementById("orders-calendar");
const calendarDetail = document.getElementById("calendar-detail");
renderCalendar();

function renderCalendar() {
  calendarEl.innerHTML = "";
  // just render 30 days
  for (let d = 1; d <= 30; d++) {
    const btn = document.createElement("button");
    btn.textContent = d;
    btn.addEventListener("click", () => {
      calendarDetail.textContent = "Availability for day " + d + " – will show LTL / TL / Floorload slots.";
    });
    calendarEl.appendChild(btn);
  }
}

// --- CREATE TRUCKLOAD MODAL -----------------------------------
const createTLBtn = document.getElementById("create-truckload-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalSelectedPOs = document.getElementById("modal-selected-pos");
const tlSave = document.getElementById("tl-save");
const tlCancel = document.getElementById("tl-cancel");

createTLBtn.addEventListener("click", () => {
  if (selectedPOs.size === 0) {
    alert("Select at least one PO line first.");
    return;
  }
  modalSelectedPOs.textContent = "POs: " + Array.from(selectedPOs).join(", ");
  modalOverlay.classList.remove("hidden");
});

tlCancel.addEventListener("click", () => {
  modalOverlay.classList.add("hidden");
});

tlSave.addEventListener("click", () => {
  const loadId = document.getElementById("tl-load-id").value.trim() || "LOAD-" + (truckloads.length + 1);
  const loadType = document.getElementById("tl-load-type").value;
  const pickupDate = document.getElementById("tl-pickup-date").value;
  const carrier = document.getElementById("tl-carrier").value;
  const customer = document.getElementById("tl-customer").value;
  const bol = document.getElementById("tl-bol").value;
  const cartons = Number(document.getElementById("tl-cartons").value) || 0;
  const pallets = Number(document.getElementById("tl-pallets").value) || 0;

  const tl = {
    loadId,
    loadType,
    pickupDate,
    carrier,
    customer,
    bol,
    cartons,
    pallets,
    status: "Unstaged",
    stagedLocation: "",
    assignedTo: "",
    departed: false
  };

  truckloads.push(tl);

  // also push to history later when departed
  renderTruckloads();
  renderDock();
  renderTodays();
  renderTodaysFull();
  modalOverlay.classList.add("hidden");
  // clear selection?
  // selectedPOs.clear();
  selectedCountEl.textContent = selectedPOs.size;
});

// --- RENDER DOCK ----------------------------------------------
function renderDock() {
  const dockBody = document.getElementById("dock-body");
  const dockPreviewBody = document.getElementById("dock-preview-body");
  dockBody.innerHTML = "";
  dockPreviewBody.innerHTML = "";

  truckloads.forEach(tl => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tl.loadId}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.cartons}</td>
      <td>${tl.pallets}</td>
      <td>${tl.stagedLocation || ""}</td>
      <td>${tl.assignedTo || ""}</td>
      <td>${tl.status}</td>
      <td>
        <button class="btn tiny" data-assign="${tl.loadId}">Assign</button>
        <button class="btn tiny secondary" data-stage="${tl.loadId}">Fully Staged</button>
      </td>
    `;
    dockBody.appendChild(tr);

    const tr2 = document.createElement("tr");
    tr2.innerHTML = `
      <td>${tl.loadId}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.cartons}</td>
      <td>${tl.pallets}</td>
      <td>${tl.stagedLocation || ""}</td>
      <td>${tl.assignedTo || ""}</td>
      <td>${tl.status}</td>
    `;
    dockPreviewBody.appendChild(tr2);
  });

  // attach actions
  document.querySelectorAll("[data-assign]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.assign;
      const name = prompt("Assign to who?");
      const found = truckloads.find(t => t.loadId === id);
      if (found) {
        found.assignedTo = name || "";
        found.status = "Being staged";
        renderDock();
        renderTodays();
        renderTodaysFull();
      }
    });
  });
  document.querySelectorAll("[data-stage]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.stage;
      const found = truckloads.find(t => t.loadId === id);
      if (found) {
        found.status = "Fully staged";
        renderDock();
        renderTodays();
        renderTodaysFull();
      }
    });
  });
}

// --- RENDER TODAY'S PICKUPS (preview + full) ------------------
function renderTodays() {
  const todayBody = document.getElementById("today-body");
  todayBody.innerHTML = "";

  let totalTrucks = 0;
  let atDoor = 0;
  let departed = 0;
  let totalCartons = 0;
  let totalDollars = 0;

  truckloads.forEach(tl => {
    totalTrucks++;
    totalCartons += tl.cartons;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tl.loadId}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.cartons}</td>
      <td>${tl.status}</td>
      <td><button class="btn tiny" data-arrived="${tl.loadId}">Arrived</button></td>
      <td><button class="btn tiny secondary" data-departed="${tl.loadId}">Departed</button></td>
    `;
    todayBody.appendChild(tr);
  });

  document.getElementById("tp-total-trucks").textContent = totalTrucks;
  document.getElementById("tp-at-door").textContent = atDoor;
  document.getElementById("tp-departed").textContent = departed;
  document.getElementById("tp-cartons").textContent = totalCartons;
  document.getElementById("tp-dollars").textContent = "$" + totalDollars;

  attachArrivedDeparted();
}

function renderTodaysFull() {
  const body = document.getElementById("today-full-body");
  if (!body) return;
  body.innerHTML = "";

  truckloads.forEach(tl => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tl.loadId}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.cartons}</td>
      <td>${tl.status}</td>
      <td><button class="btn tiny" data-arrived="${tl.loadId}">Arrived</button></td>
      <td><button class="btn tiny secondary" data-departed="${tl.loadId}">Departed</button></td>
    `;
    body.appendChild(tr);
  });

  attachArrivedDeparted();
}

function attachArrivedDeparted() {
  document.querySelectorAll("[data-arrived]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.arrived;
      const tl = truckloads.find(t => t.loadId === id);
      if (tl) {
        tl.status = "At door";
        renderTodays();
        renderTodaysFull();
      }
    });
  });
  document.querySelectorAll("[data-departed]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.departed;
      const tl = truckloads.find(t => t.loadId === id);
      if (tl) {
        tl.status = "Departed";
        tl.departed = true;
        historyLoads.push({
          loadId: tl.loadId,
          customer: tl.customer,
          carrier: tl.carrier,
          pickupDate: tl.pickupDate,
          bol: tl.bol,
          status: "Departed"
        });
        renderTodays();
        renderTodaysFull();
        renderHistory();
      }
    });
  });
}

// --- RENDER TRUCKLOADS ----------------------------------------
function renderTruckloads() {
  const body = document.getElementById("truckloads-body");
  const bodyFull = document.getElementById("truckloads-full-body");
  if (body) body.innerHTML = "";
  if (bodyFull) bodyFull.innerHTML = "";

  truckloads.forEach(tl => {
    if (body) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tl.loadId}</td>
        <td>${tl.customer || ""}</td>
        <td>${tl.carrier || ""}</td>
        <td>${tl.loadType}</td>
        <td>${tl.pickupDate || ""}</td>
        <td>${tl.cartons}</td>
        <td>${tl.status}</td>
      `;
      body.appendChild(tr);
    }

    if (bodyFull) {
      const tr2 = document.createElement("tr");
      tr2.innerHTML = `
        <td>${tl.loadId}</td>
        <td>${tl.customer || ""}</td>
        <td>${tl.carrier || ""}</td>
        <td>${tl.loadType}</td>
        <td>${tl.pickupDate || ""}</td>
        <td>${""}</td>
        <td>${""}</td>
        <td>${tl.cartons}</td>
        <td>${tl.pallets}</td>
        <td>${tl.stagedLocation || ""}</td>
        <td>${tl.status}</td>
      `;
      bodyFull.appendChild(tr2);
    }
  });
}

// --- HISTORY --------------------------------------------------
function renderHistory() {
  const body = document.getElementById("history-body");
  if (!body) return;
  body.innerHTML = "";
  historyLoads.forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.loadId}</td>
      <td>${h.customer || ""}</td>
      <td>${h.carrier || ""}</td>
      <td>${h.pickupDate || ""}</td>
      <td>${h.bol || ""}</td>
      <td>${h.status}</td>
    `;
    body.appendChild(tr);
  });
}

// --- TEAM -----------------------------------------------------
function renderTeam() {
  const body = document.getElementById("team-body");
  if (!body) return;
  body.innerHTML = "";
  team.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.role}</td>
      <td>${t.shift}</td>
      <td>${t.active ? "Yes" : "No"}</td>
    `;
    body.appendChild(tr);
  });
}

// --- METRICS EXPORT -------------------------------------------
document.getElementById("metrics-export").addEventListener("click", () => {
  const rows = [
    ["Metric", "Value"],
    ["Trucks Today", truckloads.length],
    ["Departed", historyLoads.length]
  ];
  downloadCSV("metrics.csv", rows);
});

// truckloads export
document.getElementById("export-csv").addEventListener("click", () => {
  exportTruckloads("truckloads-preview.csv");
});
document.getElementById("export-csv-full").addEventListener("click", () => {
  exportTruckloads("truckloads.csv");
});

function exportTruckloads(filename) {
  const rows = [
    ["Load ID","Customer","Carrier","Load Type","Pick Up Date","Total Cartons","Status"]
  ];
  truckloads.forEach(tl => {
    rows.push([
      tl.loadId,
      tl.customer || "",
      tl.carrier || "",
      tl.loadType,
      tl.pickupDate || "",
      tl.cartons,
      tl.status
    ]);
  });
  downloadCSV(filename, rows);
}

function downloadCSV(filename, rows) {
  const csvContent = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- INIT -----------------------------------------------------
renderTeam();
renderHistory();
