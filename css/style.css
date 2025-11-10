// js/app.js

// hardcoded login
const VALID_EMAIL = "htellez032003@gmail.com";
const VALID_PASS = "Ltapparel040523";

const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginBtn = document.getElementById("login-btn");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");

const viewTitle = document.getElementById("view-title");
const csvUpdated = document.getElementById("csv-updated");

const ordersFile = document.getElementById("orders-file");
const ordersFileName = document.getElementById("orders-file-name");
const ordersTbody = document.getElementById("orders-tbody");
const ordersSelectAll = document.getElementById("orders-select-all");

const filterCustomer = document.getElementById("filter-customer");
const filterCustName = document.getElementById("filter-custname");
const filterShipper = document.getElementById("filter-shipper");
const filterFrom = document.getElementById("filter-from");
const filterTo = document.getElementById("filter-to");
const filterApply = document.getElementById("filter-apply");
const filterClear = document.getElementById("filter-clear");
const selectedCount = document.getElementById("selected-count");
const buildTruckloadBtn = document.getElementById("build-truckload");

// modal
const modalOverlay = document.getElementById("modal-overlay");
const modalPoCount = document.getElementById("modal-po-count");
const modalLoadId = document.getElementById("modal-load-id");
const modalShipper = document.getElementById("modal-shipper");
const modalLoadType = document.getElementById("modal-load-type");
const modalPickupDate = document.getElementById("modal-pickup-date");
const modalPickupWindow = document.getElementById("modal-pickup-window");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");

// settings
const themeToggle = document.getElementById("theme-toggle");
const langSelect = document.getElementById("lang-select");

// global data
let ORDERS = []; // normalized orders
let FILTERED_ORDERS = [];
let TRUCKLOADS = [];
let HISTORY = [];

// ------- LOGIN / PERSISTENCE -------

function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function doLogin() {
  const email = loginEmail.value.trim();
  const pass = loginPassword.value.trim();
  if (email === VALID_EMAIL && pass === VALID_PASS) {
    localStorage.setItem("ncdcLoggedIn", "1");
    showApp();
  } else {
    loginError.classList.remove("hidden");
  }
}

loginBtn?.addEventListener("click", doLogin);
loginPassword?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") doLogin();
});

// check persisted login
if (localStorage.getItem("ncdcLoggedIn") === "1") {
  showApp();
}

// ------- TABS -------
document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-link")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.getAttribute("data-tab");
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(`view-${tab}`).classList.remove("hidden");
    viewTitle.textContent = btn.textContent;
  });
});

document.getElementById("logout-btn")?.addEventListener("click", () => {
  localStorage.removeItem("ncdcLoggedIn");
  loginScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
});

// ------- CSV PARSING -------

// very simple CSV parser for your 40-column sheet
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (parts[idx] || "").trim();
    });
    return obj;
  });
}

function normalizeOrder(row, idx) {
  // use exactly the headers you gave me
  return {
    id: idx,
    division: row["Division"] || "",
    bol: row["BOL#"] || "",
    masterBol: row["Master BOL#"] || "",
    po: row["PO Num"] || "",
    customer: row["Customer"] || "",
    customerName: row["Cust Name"] || "",
    shipper: row["Shipper"] || "",
    ttlQty: row["TTL QTY"] || "",
    ttlAmt: row["TTL Amt"] || "",
    startDate: row["Start Date"] || "",
    cancelDate: row["Cancel Date"] || "",
    author: row["Author#"] || "",
    status: "Unassigned",
    loadId: ""
  };
}

ordersFile?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  ordersFileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const txt = evt.target.result;
    const rows = parseCSV(txt);
    ORDERS = rows.map((r, i) => normalizeOrder(r, i));
    FILTERED_ORDERS = [...ORDERS];
    renderOrders();
    csvUpdated.textContent =
      "CSV updated: " + new Date().toLocaleString();
  };
  reader.readAsText(file);
});

// ------- RENDER ORDERS -------

function renderOrders() {
  ordersTbody.innerHTML = "";
  FILTERED_ORDERS.forEach((ord) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="order-check" data-id="${ord.id}" /></td>
      <td>${ord.po}</td>
      <td>${ord.customer}</td>
      <td>${ord.customerName}</td>
      <td>${ord.shipper}</td>
      <td>${ord.author}</td>
      <td>${ord.ttlQty}</td>
      <td>${ord.ttlAmt}</td>
      <td>${ord.startDate}</td>
      <td>${ord.cancelDate}</td>
      <td><span class="status-pill ${ord.status === "Staging" ? "staging" : ""}">${ord.status}</span></td>
      <td>${ord.loadId || ""}</td>
    `;
    ordersTbody.appendChild(tr);
  });

  attachOrderCheckboxEvents();
}

function attachOrderCheckboxEvents() {
  document.querySelectorAll(".order-check").forEach((chk) => {
    chk.addEventListener("change", updateSelectedCount);
  });
}

function updateSelectedCount() {
  const ids = getSelectedOrderIds();
  selectedCount.textContent = ids.length;
}

function getSelectedOrderIds() {
  const ids = [];
  document.querySelectorAll(".order-check:checked").forEach((chk) => {
    ids.push(Number(chk.getAttribute("data-id")));
  });
  return ids;
}

// select all should respect filters
ordersSelectAll?.addEventListener("change", (e) => {
  const checked = e.target.checked;
  document.querySelectorAll(".order-check").forEach((chk) => {
    chk.checked = checked;
  });
  updateSelectedCount();
});

// filtering
function applyFilters() {
  const cust = filterCustomer.value.trim().toLowerCase();
  const custName = filterCustName.value.trim().toLowerCase();
  const ship = filterShipper.value.trim().toLowerCase();
  const from = filterFrom.value;
  const to = filterTo.value;

  FILTERED_ORDERS = ORDERS.filter((o) => {
    let ok = true;
    if (cust && !o.customer.toLowerCase().includes(cust)) ok = false;
    if (custName && !o.customerName.toLowerCase().includes(custName)) ok = false;
    if (ship && !o.shipper.toLowerCase().includes(ship)) ok = false;

    if (from) {
      // compare as yyyy-mm-dd strings if order has startDate (already string)
      // user said some dates were weird in old csv; here we just string compare
      if (!o.startDate || o.startDate < from) ok = false;
    }
    if (to) {
      if (!o.startDate || o.startDate > to) ok = false;
    }

    return ok;
  });

  renderOrders();
}

filterApply?.addEventListener("click", applyFilters);
filterClear?.addEventListener("click", () => {
  filterCustomer.value = "";
  filterCustName.value = "";
  filterShipper.value = "";
  filterFrom.value = "";
  filterTo.value = "";
  FILTERED_ORDERS = [...ORDERS];
  renderOrders();
});

// ------- BUILD TRUCKLOAD MODAL -------

buildTruckloadBtn?.addEventListener("click", () => {
  const ids = getSelectedOrderIds();
  if (!ids.length) return;
  modalPoCount.textContent = ids.length;
  modalLoadId.value = "";
  modalShipper.value = "";
  modalPickupDate.value = "";
  modalOverlay.classList.remove("hidden");
});

modalCancel?.addEventListener("click", () => {
  modalOverlay.classList.add("hidden");
});

modalSave?.addEventListener("click", () => {
  const ids = getSelectedOrderIds();
  if (!ids.length) return;

  const loadId =
    modalLoadId.value.trim() ||
    "LD-" + Math.random().toString(36).substring(2, 7).toUpperCase();
  const shipper = modalShipper.value.trim();
  const loadType = modalLoadType.value;
  const pickupDate = modalPickupDate.value;
  const pickupWindow = modalPickupWindow.value;

  // update orders
  ids.forEach((id) => {
    const idx = ORDERS.findIndex((o) => o.id === id);
    if (idx > -1) {
      ORDERS[idx].status = "Staging";
      ORDERS[idx].loadId = loadId;
      ORDERS[idx].pickupDate = pickupDate;
      ORDERS[idx].pickupWindow = pickupWindow;
      if (shipper) ORDERS[idx].shipper = shipper;
    }
  });

  // create truckload entry
  TRUCKLOADS.push({
    id: loadId,
    shipper: shipper || guessCommonShipper(ids),
    loadType,
    pickupDate,
    pickupWindow,
    pos: ids.map((id) => ORDERS.find((o) => o.id === id)),
  });

  modalOverlay.classList.add("hidden");
  applyFilters(); // re-render
  renderTruckloads();
});

function guessCommonShipper(ids) {
  if (!ids.length) return "";
  const ships = ids.map((id) => {
    const o = ORDERS.find((r) => r.id === id);
    return o ? o.shipper : "";
  });
  return ships[0] || "";
}

// ------- RENDER TRUCKLOADS (simple) -------

function renderTruckloads() {
  const container = document.getElementById("truckloads-table");
  if (!container) return;

  if (!TRUCKLOADS.length) {
    container.innerHTML = "<p class='muted tiny'>No truckloads yet.</p>";
    return;
  }

  let html = `<table class="orders-table"><thead><tr>
    <th>Load ID</th><th>Shipper</th><th>Type</th><th>Pickup Date</th><th>Window</th><th>PO Count</th>
  </tr></thead><tbody>`;
  TRUCKLOADS.forEach((tl) => {
    html += `<tr>
      <td>${tl.id}</td>
      <td>${tl.shipper || ""}</td>
      <td>${tl.loadType}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.pickupWindow || ""}</td>
      <td>${tl.pos.length}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ------- SETTINGS (dark mode + language) -------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.setAttribute("data-theme", theme);
}

const savedTheme = localStorage.getItem("ncdcTheme");
if (savedTheme) {
  applyTheme(savedTheme);
  if (savedTheme === "dark" && themeToggle) themeToggle.checked = true;
}

const savedLang = localStorage.getItem("ncdcLang");
if (savedLang && langSelect) {
  langSelect.value = savedLang;
}

themeToggle?.addEventListener("change", (e) => {
  const useDark = e.target.checked;
  applyTheme(useDark ? "dark" : "light");
  localStorage.setItem("ncdcTheme", useDark ? "dark" : "light");
});

langSelect?.addEventListener("change", (e) => {
  localStorage.setItem("ncdcLang", e.target.value);
});

// initial render (empty)
renderOrders();
renderTruckloads();
