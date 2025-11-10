// simple in-memory data
let orders = [];
let truckloads = [];
let todaysPickups = [];

const VALID_EMAIL = "htellez032003@gmail.com";
const VALID_PASS = "Ltapparel040523";

// DOM refs
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const emailInput = document.getElementById("login-email");
const passInput = document.getElementById("login-password");
const logoutBtn = document.getElementById("logout-btn");

const tabButtons = document.querySelectorAll(".nav-link");
const tabPanels = document.querySelectorAll(".tab-panel");

const csvInput = document.getElementById("orders-csv");
const ordersTbody = document.getElementById("orders-tbody");
const csvUpdated = document.getElementById("csv-updated");

const selectAll = document.getElementById("select-all-rows");
const selectedCount = document.getElementById("selected-count");

// settings
const themeToggle = document.getElementById("theme-toggle");
const langSelect = document.getElementById("lang-select");

// ---------- LOGIN / PERSIST ----------
function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function showLogin() {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function handleLogin() {
  const email = emailInput.value.trim();
  const pass = passInput.value.trim();
  if (email === VALID_EMAIL && pass === VALID_PASS) {
    loginError.classList.add("hidden");
    // save login
    localStorage.setItem("ncdc_logged_in", "1");
    showApp();
  } else {
    loginError.classList.remove("hidden");
  }
}

loginBtn.addEventListener("click", handleLogin);
passInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("ncdc_logged_in");
  showLogin();
});

// check on load
if (localStorage.getItem("ncdc_logged_in") === "1") {
  showApp();
} else {
  showLogin();
}

// ---------- TAB SWITCH ----------
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tabPanels.forEach((p) => p.classList.remove("active"));
    const activePanel = document.getElementById(`tab-${tab}`);
    if (activePanel) activePanel.classList.add("active");
  });
});

// ---------- CSV UPLOAD ----------
csvInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    parseCSV(text);
    csvUpdated.textContent = "CSV updated: " + new Date().toLocaleString();
  };
  reader.readAsText(file);
});

function parseCSV(text) {
  // super simple csv parser
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map(h => h.trim());
  orders = lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] || "";
    });
    return normalizeOrder(row);
  });
  renderOrders();
}

function normalizeOrder(row) {
  // map basics
  return {
    po: row["PO Num"] || row["PO"] || "",
    customer: row["Customer"] || "",
    shipper: row["Shipper"] || "",
    author: row["Author#"] || row["Author"] || "",
    ttlQty: row["TTL QTY"] || row["TTL Qty"] || row["TTL_QTY"] || "",
    ttlAmt: row["TTL Amt"] || row["TTL $"] || "",
    startDate: row["Start Date"] || "",
    cancelDate: row["Cancel Date"] || "",
    status: "Unassigned",
    loadId: ""
  };
}

function renderOrders() {
  ordersTbody.innerHTML = "";
  orders.forEach((o, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-row="${idx}" class="row-check" /></td>
      <td>${o.po}</td>
      <td>${o.customer}</td>
      <td>${o.shipper}</td>
      <td>${o.author}</td>
      <td>${o.ttlQty}</td>
      <td>${o.ttlAmt ? "$" + o.ttlAmt : "$0"}</td>
      <td>${o.startDate}</td>
      <td>${o.cancelDate}</td>
      <td><span class="status-pill status-${o.status.toLowerCase()}">${o.status}</span></td>
      <td>${o.loadId || ""}</td>
    `;
    ordersTbody.appendChild(tr);
  });
  hookRowChecks();
}

function hookRowChecks() {
  const checkboxes = document.querySelectorAll(".row-check");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", updateSelectedCount);
  });
  selectAll.checked = false;
  updateSelectedCount();
}

function updateSelectedCount() {
  const checkboxes = document.querySelectorAll(".row-check");
  let count = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) count++;
  });
  selectedCount.textContent = "Selected POs: " + count;
}

selectAll.addEventListener("change", () => {
  const checkboxes = document.querySelectorAll(".row-check");
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateSelectedCount();
});

// ---------- CALENDAR ----------
const calendarGrid = document.getElementById("calendar-grid");
const calendarDetail = document.getElementById("timeslot-list");

function buildCalendar() {
  calendarGrid.innerHTML = "";
  for (let d = 1; d <= 31; d++) {
    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = d;
    div.addEventListener("click", () => showDaySlots(d, div));
    calendarGrid.appendChild(div);
  }
}

const SHIP_WINDOWS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "5:00pm-7:00pm",
  "8:00pm-10:00pm",
  "10:00pm-12:00am"
];

function showDaySlots(day, el) {
  document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("active"));
  el.classList.add("active");
  calendarDetail.innerHTML = "";
  SHIP_WINDOWS.forEach(w => {
    const li = document.createElement("li");
    li.textContent = w + " (capacity view placeholder)";
    calendarDetail.appendChild(li);
  });
}

buildCalendar();

// ---------- SETTINGS: THEME & LANGUAGE ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("ncdc_theme", theme);
}

const savedTheme = localStorage.getItem("ncdc_theme") || "light";
applyTheme(savedTheme);
if (themeToggle) themeToggle.value = savedTheme;

themeToggle?.addEventListener("change", (e) => {
  applyTheme(e.target.value);
});

const savedLang = localStorage.getItem("ncdc_lang") || "en";
if (langSelect) langSelect.value = savedLang;
langSelect?.addEventListener("change", (e) => {
  localStorage.setItem("ncdc_lang", e.target.value);
});
