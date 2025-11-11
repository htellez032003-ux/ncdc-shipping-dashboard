// js/app.js

// ---------- GLOBAL STATE ----------
let ORDERS = [];            // all rows from latest CSV
let FILTERED = [];          // filtered view
let TRUCKLOADS = [];        // built truckloads (local only)
let HISTORY = [];           // departed loads
let STAGING = [];           // dock view
let METRICS = [];           // accumulated metrics rows

const LOGIN_EMAIL = "htellez032003@gmail.com";
const LOGIN_PASS = "Ltapparel040523";

// ---------- HELPERS ----------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function toDate(val) {
  if (!val) return "";
  // if it looks like an excel serial
  if (!isNaN(val) && Number(val) > 30000) {
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + Number(val));
    return d.toISOString().slice(0,10);
  }
  // try normal date
  const d = new Date(val);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return val;
}

function formatMoney(v) {
  if (v === "" || v == null) return "$0";
  const num = Number(String(v).replace(/[^0-9.-]/g,""));
  if (isNaN(num)) return "$0";
  return "$" + num.toLocaleString();
}

// ---------- LOGIN ----------
function initLogin() {
  const cached = localStorage.getItem("ncdc-auth");
  if (cached === "true") {
    $("#login-screen").classList.add("hidden");
    $("#app-shell").classList.remove("hidden");
    applyTheme(localStorage.getItem("ncdc-theme") || "light");
    renderAll();
  }

  $("#login-btn").addEventListener("click", () => {
    const email = $("#login-email").value.trim();
    const pass = $("#login-password").value.trim();
    if (email === LOGIN_EMAIL && pass === LOGIN_PASS) {
      localStorage.setItem("ncdc-auth", "true");
      $("#login-screen").classList.add("hidden");
      $("#app-shell").classList.remove("hidden");
      renderAll();
    } else {
      $("#login-error").classList.remove("hidden");
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    localStorage.removeItem("ncdc-auth");
    location.reload();
  });
}

// ---------- THEME & SETTINGS ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("ncdc-theme", theme);
  $("#setting-theme").value = theme;
}

function initSettings() {
  // theme
  const storedTheme = localStorage.getItem("ncdc-theme") || "light";
  applyTheme(storedTheme);

  $("#setting-theme").addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });

  // language, just store
  $("#setting-lang").addEventListener("change", (e) => {
    localStorage.setItem("ncdc-lang", e.target.value);
  });

  $("#clear-local").addEventListener("click", () => {
    localStorage.removeItem("ncdc-orders");
    localStorage.removeItem("ncdc-metrics");
    alert("Local data cleared. Upload a CSV again.");
  });
}

// ---------- TABS ----------
function initTabs() {
  $all(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $all(".nav-link").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      $all(".tab").forEach(t => t.classList.remove("active"));
      $("#tab-" + tab).classList.add("active");
      if (tab === "metrics") drawMetricsChart("month");
    });
  });

  // default metrics range
  $all(".metric-range").forEach(btn => {
    btn.addEventListener("click", () => {
      $all(".metric-range").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      drawMetricsChart(btn.dataset.range);
    });
  });
}

// ---------- CSV UPLOAD ----------
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];
  for (let i=1; i<lines.length; i++) {
    const cols = lines[i].split(","); // simple for now
    const row = {};
    headers.forEach((h,idx) => {
      row[h] = cols[idx] ? cols[idx].trim() : "";
    });
    rows.push(row);
  }
  return rows;
}

function normalizeOrders(rows) {
  // your new headers:
  // Division, BOL#, Master BOL#, PO Num, ... , TTL QTY, TTL Amt, ... , Start Date, Cancel Date, Author#
  return rows.map(r => {
    const start = toDate(r["Start Date"]);
    const cancel = toDate(r["Cancel Date"]);
    return {
      division: r["Division"] || "",
      bol: r["BOL#"] || "",
      mbol: r["Master BOL#"] || "",
      po: r["PO Num"] || "",
      customer: r["Customer"] || "",
      custname: r["Cust Name"] || "",
      shipper: r["Shipper"] || "",
      ttlqty: Number(r["TTL QTY"] || 0),
      ttlamt: formatMoney(r["TTL Amt"] || 0),
      startDate: start,
      cancelDate: cancel,
      author: r["Author#"] || "",
      status: "Unassigned",
      loadId: ""
    };
  });
}

function initCSVUpload() {
  const input = $("#orders-file");
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csvText = ev.target.result;
      const raw = parseCSV(csvText);
      ORDERS = normalizeOrders(raw);
      FILTERED = [...ORDERS];
      localStorage.setItem("ncdc-orders", JSON.stringify(ORDERS));
      $("#csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
      renderOrders();
      seedMetricsFromOrders();
    };
    reader.readAsText(file);
  });

  // reload from local
  const cached = localStorage.getItem("ncdc-orders");
  if (cached) {
    ORDERS = JSON.parse(cached);
    FILTERED = [...ORDERS];
    renderOrders();
  }
}

// ---------- ORDERS RENDER ----------
function renderOrders() {
  const body = $("#orders-body");
  body.innerHTML = "";
  FILTERED.forEach((o,idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-idx="${idx}"></td>
      <td>${o.po}</td>
      <td>${o.customer}</td>
      <td>${o.custname}</td>
      <td>${o.shipper}</td>
      <td>${o.author}</td>
      <td>${o.ttlqty}</td>
      <td>${o.ttlamt}</td>
      <td>${o.startDate}</td>
      <td>${o.cancelDate}</td>
      <td><span class="status-pill status-${o.status.toLowerCase()}">${o.status}</span></td>
      <td>${o.loadId || ""}</td>
    `;
    body.appendChild(tr);
  });

  // select-all respects filters
  $("#select-all").checked = false;
  updateSelectedCount();
  $all(".row-check").forEach(cb => cb.addEventListener("change", updateSelectedCount));

  renderCalendar();
}

function updateSelectedCount() {
  const count = $all(".row-check:checked").length;
  $("#selected-count").textContent = "Selected POs: " + count;
}

// ---------- FILTERS ----------
function initFilters() {
  $("#filter-apply").addEventListener("click", () => {
    const cust = $("#filter-customer").value.trim().toLowerCase();
    const cname = $("#filter-custname").value.trim().toLowerCase();
    const ship = $("#filter-shipper").value.trim().toLowerCase();
    const from = $("#filter-from").value;
    const to = $("#filter-to").value;

    FILTERED = ORDERS.filter(o => {
      let ok = true;
      if (cust && !o.customer.toLowerCase().includes(cust)) ok = false;
      if (cname && !o.custname.toLowerCase().includes(cname)) ok = false;
      if (ship && !o.shipper.toLowerCase().includes(ship)) ok = false;
      if (from && o.startDate && o.startDate < from) ok = false;
      if (to && o.startDate && o.startDate > to) ok = false;
      return ok;
    });
    renderOrders();
  });

  $("#filter-clear").addEventListener("click", () => {
    $("#filter-customer").value = "";
    $("#filter-custname").value = "";
    $("#filter-shipper").value = "";
    $("#filter-from").value = "";
    $("#filter-to").value = "";
    FILTERED = [...ORDERS];
    renderOrders();
  });

  // select-all limited to filtered
  $("#select-all").addEventListener("change", (e) => {
    const checked = e.target.checked;
    $all(".row-check").forEach(cb => cb.checked = checked);
    updateSelectedCount();
  });
}

// ---------- CALENDAR ----------
const FIXED_TIME_SLOTS = [
  "08:00am-10:00am",
  "10:00am-12:00pm",
  "01:00pm-03:00pm",
  "5:00pm-7:00pm",
  "8:00pm-10:00pm",
  "10:00pm-12:00am"
];

function renderCalendar() {
  const cal = $("#orders-calendar");
  cal.innerHTML = "";
  // show 14-day window
  const today = new Date();
  for (let i=0; i<14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const label = d.toISOString().slice(0,10);
    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = label;
    div.dataset.date = label;
    div.addEventListener("click", () => showCalendarSlots(label));
    cal.appendChild(div);
  }
}

function showCalendarSlots(dateStr) {
  // count orders on that date
  const onDay = ORDERS.filter(o => o.startDate === dateStr);
  // basic capacity demo: just show how many loads per slot
  const summary = FIXED_TIME_SLOTS.map(slot => {
    // for now, show "available"
    return `${slot}: available`;
  }).join(" • ");
  $("#calendar-slot-summary").textContent = `Pickups on ${dateStr}: ${onDay.length} • ${summary}`;
}

// ---------- BUILD TRUCKLOAD ----------
function initBuildTruckload() {
  $("#build-truckload").addEventListener("click", () => {
    const selected = [];
    $all(".row-check:checked").forEach(cb => {
      const idx = Number(cb.dataset.idx);
      selected.push(FILTERED[idx]);
    });
    if (!selected.length) {
      alert("Select at least one PO.");
      return;
    }
    // create TL object
    const loadId = "TL-" + (TRUCKLOADS.length + 1).toString().padStart(3,"0");
    const shipper = selected[0].shipper || "TBD";
    const date = selected[0].startDate || new Date().toISOString().slice(0,10);
    const tl = {
      id: loadId,
      shipper,
      date,
      status: "Scheduled",
      orders: selected.map(o => o.po),
      ttlQty: selected.reduce((a,b) => a + Number(b.ttlqty || 0), 0),
      ttlAmt: "$" + selected.reduce((a,b) => a + Number(String(b.ttlamt).replace(/[^0-9.-]/g,"")) ,0),
    };
    TRUCKLOADS.push(tl);
    // update orders to show load
    selected.forEach(o => {
      const idx = ORDERS.findIndex(or => or.po === o.po);
      if (idx >= 0) {
        ORDERS[idx].status = "Staging";
        ORDERS[idx].loadId = loadId;
      }
    });
    localStorage.setItem("ncdc-orders", JSON.stringify(ORDERS));
    renderOrders();
    renderTruckloads();
    renderDock();
  });
}

// ---------- DOCK ----------
function renderDock() {
  const dock = $("#dock-list");
  const staging = ORDERS.filter(o => o.status.toLowerCase() === "staging");
  if (!staging.length) {
    dock.textContent = "No orders being staged.";
    return;
  }
  dock.innerHTML = "";
  staging.forEach(o => {
    const div = document.createElement("div");
    div.className = "dock-item";
    div.innerHTML = `
      <strong>${o.loadId || o.po}</strong> – ${o.custname || o.customer} – ${o.ttlqty} units
    `;
    dock.appendChild(div);
  });

  // summary
  $("#dock-summary").innerHTML = `
    <span class="chip">Available to stage: ${staging.length}</span>
  `;
}

// ---------- TRUCKLOADS ----------
function renderTruckloads() {
  const box = $("#truckloads-list");
  if (!TRUCKLOADS.length) {
    box.textContent = "No truckloads yet.";
    return;
  }
  box.innerHTML = "";
  TRUCKLOADS.forEach(tl => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <strong>${tl.id}</strong> – ${tl.shipper} – ${tl.date} – Orders: ${tl.orders.length}
      <div class="muted tiny">Qty: ${tl.ttlQty} • Amount: ${tl.ttlAmt}</div>
    `;
    box.appendChild(div);
  });
}

// ---------- METRICS ----------
function seedMetricsFromOrders() {
  // basic seeding, in real we would compute durations
  METRICS = ORDERS.map(o => ({
    date: o.startDate || new Date().toISOString().slice(0,10),
    customer: o.custname || o.customer,
    pallets: Math.ceil((o.ttlqty || 0) / 50),
    worker: "Unassigned",
  }));
  localStorage.setItem("ncdc-metrics", JSON.stringify(METRICS));
  drawMetricsChart("month");
}

function drawMetricsChart(range) {
  const canvas = $("#metrics-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // simple bar rendering
  const labels = ["Wk1","Wk2","Wk3","Wk4"];
  if (range === "month") {
    // 4 bars
  } else if (range === "week") {
    labels.splice(0, labels.length, "Mon","Tue","Wed","Thu","Fri","Sat","Sun");
  } else {
    labels.splice(0, labels.length, "Today");
  }

  const barW = 40;
  const gap = 20;
  const baseY = 130;
  labels.forEach((l,idx) => {
    const h = 20 + (idx * 10);
    ctx.fillStyle = "#2b6cb0";
    ctx.fillRect(20 + idx*(barW+gap), baseY - h, barW, h);
    ctx.fillStyle = "#4a5568";
    ctx.fillText(l, 25 + idx*(barW+gap), baseY + 12);
  });
}

// ---------- EXPORT ----------
function initExport() {
  $("#export-metrics").addEventListener("click", () => {
    // one CSV, multiple sections
    let csv = "NCDC Metrics Export\n";
    csv += "Section,Value\n";
    csv += "Total Orders," + ORDERS.length + "\n";
    csv += "\n--Monthly--\n";
    csv += "Date,Customer,Pallets\n";
    METRICS.forEach(m => {
      csv += `${m.date},${m.customer},${m.pallets}\n`;
    });

    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ncdc-metrics.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ---------- INIT ----------
function renderAll() {
  renderOrders();
  renderDock();
  renderTruckloads();
  drawMetricsChart("month"); // your requested default
}

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initTabs();
  initSettings();
  initCSVUpload();
  initFilters();
  initBuildTruckload();
  initExport();
});
