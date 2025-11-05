// simple i18n strings
const I18N = {
  en: {
    "orders.title": "Orders",
    "orders.subtitle": "Upload CSV and manage orders.",
    "orders.uploadLabel": "Upload Orders CSV",
    "orders.csvUpdated": "CSV updated:"
  },
  es: {
    "orders.title": "Órdenes",
    "orders.subtitle": "Carga el CSV y gestiona las órdenes.",
    "orders.uploadLabel": "Cargar CSV de órdenes",
    "orders.csvUpdated": "CSV actualizado:"
  }
};

const AUTH_EMAIL = "htellez032003@gmail.com";
const AUTH_PASS = "Ltapparel040523";

let ordersData = []; // raw rows
let filteredData = [];
let currentLanguage = localStorage.getItem("ncdc_lang") || "en";

document.addEventListener("DOMContentLoaded", () => {
  // restore theme
  const savedTheme = localStorage.getItem("ncdc_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) themeToggle.checked = savedTheme === "dark";

  // restore lang
  applyLanguage(currentLanguage);
  const languageSelect = document.getElementById("language-select");
  if (languageSelect) languageSelect.value = currentLanguage;

  // login persistence
  const isAuthed = localStorage.getItem("ncdc_authed") === "true";
  if (isAuthed) {
    document.getElementById("login-overlay").classList.add("hidden");
  }

  // login
  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // sidebar nav
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`tab-${tab}`).classList.add("active");
    });
  });

  // CSV upload
  document.getElementById("orders-csv").addEventListener("change", handleCSVUpload);

  // filters
  document.getElementById("filter-apply").addEventListener("click", applyFilters);
  document.getElementById("filter-clear").addEventListener("click", clearFilters);

  // select-all with filter awareness
  document.getElementById("select-all-rows").addEventListener("change", handleSelectAll);

  // build truckload
  document.getElementById("build-truckload-btn").addEventListener("click", () => {
    const selected = getSelectedPOs();
    alert(`(placeholder) Build truckload with ${selected.length} POs`);
  });

  // settings
  if (themeToggle) {
    themeToggle.addEventListener("change", (e) => {
      const val = e.target.checked ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", val);
      localStorage.setItem("ncdc_theme", val);
    });
  }
  if (languageSelect) {
    languageSelect.addEventListener("change", (e) => {
      currentLanguage = e.target.value;
      localStorage.setItem("ncdc_lang", currentLanguage);
      applyLanguage(currentLanguage);
    });
  }

  // draw empty calendar
  renderCalendar([]);
});

// login handlers
function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-password").value.trim();
  if (email === AUTH_EMAIL && pass === AUTH_PASS) {
    localStorage.setItem("ncdc_authed", "true");
    document.getElementById("login-overlay").classList.add("hidden");
  } else {
    document.getElementById("login-error").classList.remove("hidden");
  }
}

function handleLogout() {
  localStorage.removeItem("ncdc_authed");
  document.getElementById("login-overlay").classList.remove("hidden");
}

// CSV
function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    ordersData = parseCSV(text);
    filteredData = [...ordersData];
    renderOrdersTable(filteredData);
    // update stamp
    const now = new Date().toLocaleString();
    document.getElementById("csv-updated").textContent = now;
    // update calendar from orders
    renderCalendar(ordersData);
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const rows = text.split(/\r?\n/).filter(r => r.trim().length > 0);
  const headers = rows[0].split(",").map(h => h.trim());
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = splitCSVRow(rows[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] !== undefined ? cols[idx].trim() : "";
    });
    // normalize likely column names
    const po = row["PO Num"] || row["PO"] || row["PO_NUM"] || "";
    const customer = row["Customer"] || row["Cust Name"] || "";
    const shipper = row["Shipper"] || row["Carrier"] || "";
    const author = row["Author#"] || row["Author"] || "";
    const ttlQty = row["TTL QTY"] || row["Total Units"] || row["TTL_QTY"] || "0";
    const ttlAmt = row["TTL Amt"] || row["TTL $"] || row["TTL_AMT"] || "0";
    const startDate = normalizeDate(row["Start Date"] || row["Ship Date"] || "");
    const cancelDate = normalizeDate(row["Cancel Date"] || "");
    data.push({
      raw: row,
      poNum: po,
      customer,
      shipper,
      author,
      ttlQty: Number(ttlQty) || 0,
      ttlAmt: Number(ttlAmt) || 0,
      startDate,
      cancelDate,
      status: "Unassigned"
    });
  }
  return data;
}

// split CSV row with commas
function splitCSVRow(row) {
  const result = [];
  let current = "";
  let inside = false;
  for (let ch of row) {
    if (ch === '"' ) {
      inside = !inside;
      continue;
    }
    if (ch === "," && !inside) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function normalizeDate(val) {
  if (!val) return "";
  // if it's a number like 0.47355 -> that's likely Excel serial, we can just show raw
  if (/^\d+(\.\d+)?$/.test(val)) {
    return val; // keep as-is so you can see mismatch
  }
  // already date-like
  return val;
}

function renderOrdersTable(rows) {
  const tbody = document.getElementById("orders-tbody");
  tbody.innerHTML = "";
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-index="${idx}" /></td>
      <td>${r.poNum}</td>
      <td>${r.customer}</td>
      <td>${r.shipper}</td>
      <td>${r.author}</td>
      <td>${r.ttlQty}</td>
      <td>$${r.ttlAmt}</td>
      <td>${r.startDate}</td>
      <td>${r.cancelDate}</td>
      <td><span class="status-pill ${r.status === "Staging" ? "staging" : r.status === "Loading" ? "loading" : ""}">${r.status}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // row selection update
  tbody.querySelectorAll(".row-check").forEach(chk => {
    chk.addEventListener("change", updateSelectedCount);
  });

  updateSelectedCount();
}

function applyFilters() {
  const cust = document.getElementById("filter-customer").value.trim().toLowerCase();
  const ship = document.getElementById("filter-shipper").value.trim().toLowerCase();
  const from = document.getElementById("filter-from").value;
  const to = document.getElementById("filter-to").value;

  filteredData = ordersData.filter(r => {
    let ok = true;
    if (cust && !r.customer.toLowerCase().includes(cust)) ok = false;
    if (ship && !r.shipper.toLowerCase().includes(ship)) ok = false;
    if (from) {
      // naive compare
      ok = ok && r.startDate >= from;
    }
    if (to) {
      ok = ok && r.startDate <= to;
    }
    return ok;
  });

  renderOrdersTable(filteredData);
}

function clearFilters() {
  document.getElementById("filter-customer").value = "";
  document.getElementById("filter-shipper").value = "";
  document.getElementById("filter-from").value = "";
  document.getElementById("filter-to").value = "";
  filteredData = [...ordersData];
  renderOrdersTable(filteredData);
  document.getElementById("select-all-rows").checked = false;
}

function updateSelectedCount() {
  const checked = document.querySelectorAll("#orders-tbody .row-check:checked").length;
  document.getElementById("selected-count").textContent = `Selected POs: ${checked}`;
}

function handleSelectAll(e) {
  const checked = e.target.checked;
  // only select rows currently rendered (i.e. filteredData)
  document.querySelectorAll("#orders-tbody .row-check").forEach(chk => {
    chk.checked = checked;
  });
  updateSelectedCount();
}

function getSelectedPOs() {
  const selected = [];
  document.querySelectorAll("#orders-tbody .row-check:checked").forEach(chk => {
    const idx = Number(chk.dataset.index);
    const row = filteredData[idx];
    if (row) selected.push(row);
  });
  return selected;
}

// calendar: not affected by filters
function renderCalendar(allOrders) {
  const cal = document.getElementById("orders-calendar");
  cal.innerHTML = "";

  // simple current month view
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // map date -> count
  const dateMap = {};
  allOrders.forEach(o => {
    if (!o.startDate) return;
    dateMap[o.startDate] = (dateMap[o.startDate] || 0) + 1;
  });

  // filler for first week
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement("div");
    cal.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${month + 1}/${d}/${year}`;
    const div = document.createElement("div");
    const has = dateMap[dayStr];
    div.className = "calendar-day" + (has ? " has-pickups" : "");
    div.innerHTML = `
      <div class="calendar-day-title">${d}</div>
      ${has ? `<div class="calendar-day-count">${has} pickups</div>` : ""}
    `;
    div.addEventListener("click", () => showCalendarDayDetail(dayStr, allOrders));
    cal.appendChild(div);
  }
}

function showCalendarDayDetail(dayStr, allOrders) {
  const detail = document.getElementById("calendar-day-detail");
  const items = allOrders.filter(o => o.startDate === dayStr);
  if (!items.length) {
    detail.classList.remove("hidden");
    detail.textContent = `No scheduled pickups for ${dayStr}.`;
    return;
  }
  detail.classList.remove("hidden");
  detail.innerHTML = `<strong>${dayStr}</strong><br/>`;
  items.forEach(it => {
    detail.innerHTML += `${it.poNum} — ${it.customer} — ${it.shipper}<br/>`;
  });
}

// i18n
function applyLanguage(lang) {
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
}
