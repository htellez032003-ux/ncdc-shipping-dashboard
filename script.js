// ===== BASIC APP STATE =====
const APP = {
  currentUser: null,
  users: [
    { email: "htellez032003@gmail.com", password: "Ltapparel040523", name: "Owner", role: "owner" },
    { email: "router@ncdc.com", password: "router", name: "Router", role: "router" },
    { email: "dock@ncdc.com", password: "dock", name: "Dock", role: "dock" },
  ],
  orders: [],
  truckloads: [],
  history: [],
  settings: {
    theme: "light",
    language: "en",
    maxLoadsPerBlock: 4,
  },
  selectedPOs: [],
};

// ====== UTILITIES ======
function $(sel) {
  return document.querySelector(sel);
}
function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}
function saveState() {
  localStorage.setItem("ncdc-app", JSON.stringify({
    orders: APP.orders,
    truckloads: APP.truckloads,
    history: APP.history,
    settings: APP.settings,
    users: APP.users,
  }));
}
function loadState() {
  const raw = localStorage.getItem("ncdc-app");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    APP.orders = data.orders || [];
    APP.truckloads = data.truckloads || [];
    APP.history = data.history || [];
    APP.settings = { ...APP.settings, ...(data.settings || {}) };
    APP.users = data.users || APP.users;
  } catch (e) {
    console.warn("state load failed", e);
  }
}

// ===== CSV PARSER (simple) =====
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const parts = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (parts[i] || "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

// ===== ORDERS RENDER =====
function renderOrdersTable() {
  const headRow = $("#orders-head-row");
  const tbody = $("#orders-tbody");
  headRow.innerHTML = "";
  tbody.innerHTML = "";

  if (!APP.orders.length) return;

  // always show checkbox first
  const headers = Object.keys(APP.orders[0]);
  // ensure a few extra headers are present
  const ensure = [
    "Division","BOL#","Master BOL#","PO Num","Cust Name","Shipper","Author#","TTL QTY","TTL Amt",
    "Total Weight","Total Cubic","Est. Cartons","Est. Pallet","Pick Proc Date","Start Date","Cancel Date","Route Date","Scheduled Date","Ready Date","Router","PT STATUS","Load ID"
  ];
  ensure.forEach(h => {
    if (!headers.includes(h)) headers.push(h);
  });

  // header row
  const th1 = document.createElement("th");
  th1.innerHTML = `<input type="checkbox" id="orders-select-all">`;
  headRow.appendChild(th1);

  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });

  // rows
  const filterText = ($("#filter-text")?.value || "").toLowerCase();
  const dateCol = $("#date-column-select")?.value || "";
  const df = $("#date-from")?.value;
  const dt = $("#date-to")?.value;

  APP.orders.forEach((row, idx) => {
    // text filter
    const str = Object.values(row).join(" ").toLowerCase();
    if (filterText && !str.includes(filterText)) return;

    // date filter
    if (dateCol) {
      const val = row[dateCol] || "";
      if (df && val && val < df) return;
      if (dt && val && val > dt) return;
    }

    const tr = document.createElement("tr");
    const selected = APP.selectedPOs.includes(row["PO Num"]);
    tr.innerHTML = `<td><input type="checkbox" class="order-select" data-index="${idx}" ${selected ? "checked" : ""}></td>` +
      headers.map(h => {
        let v = row[h] || "";
        if (h === "Author#") {
          // force text
          v = String(v);
        }
        return `<td>${v}</td>`;
      }).join("");
    tbody.appendChild(tr);
  });

  updateSelectedCount();

  // select all handler
  const master = $("#orders-select-all");
  if (master) {
    master.addEventListener("change", e => {
      const checks = $all(".order-select");
      checks.forEach(ch => {
        ch.checked = e.target.checked;
        const idx = Number(ch.dataset.index);
        const po = APP.orders[idx]["PO Num"];
        if (e.target.checked) {
          if (!APP.selectedPOs.includes(po)) APP.selectedPOs.push(po);
        } else {
          APP.selectedPOs = [];
        }
      });
      updateSelectedCount();
    });
  }

  // individual selects
  $all(".order-select").forEach(ch => {
    ch.addEventListener("change", e => {
      const idx = Number(e.target.dataset.index);
      const po = APP.orders[idx]["PO Num"];
      if (e.target.checked) {
        if (!APP.selectedPOs.includes(po)) APP.selectedPOs.push(po);
      } else {
        APP.selectedPOs = APP.selectedPOs.filter(p => p !== po);
      }
      updateSelectedCount();
    });
  });
}

function updateSelectedCount() {
  const el = $("#selected-count");
  if (el) el.textContent = `Selected POs: ${APP.selectedPOs.length}`;
}

// ===== CALENDAR =====
function renderCalendar() {
  const cal = $("#pickup-calendar");
  if (!cal) return;
  cal.innerHTML = "";

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-index
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startDay; i++) {
    const div = document.createElement("div");
    cal.appendChild(div);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = d;
    div.addEventListener("click", () => showCalendarDay(year, month, d));
    cal.appendChild(div);
  }
}

function showCalendarDay(y, m, d) {
  const title = $("#calendar-day-title");
  const list = $("#calendar-day-list");
  const mm = (m + 1).toString().padStart(2, "0");
  const dd = d.toString().padStart(2, "0");
  const iso = `${y}-${mm}-${dd}`;
  title.textContent = `Pickups for ${iso}`;
  list.innerHTML = "";

  // show truckloads with that pickup date
  const loads = APP.truckloads.filter(tl => (tl.pickupDate || "") === iso);
  if (!loads.length) {
    const li = document.createElement("li");
    li.textContent = "No truckloads scheduled.";
    list.appendChild(li);
    return;
  }

  loads.forEach(ld => {
    const li = document.createElement("li");
    li.textContent = `${ld.loadId} – ${ld.carrier || "Carrier"} – ${ld.loadType || ""}`;
    list.appendChild(li);
  });
}

// ===== DOCK RENDER =====
function renderDock() {
  const tbody = $("#dock-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  APP.truckloads.forEach(tl => {
    const tr = document.createElement("tr");
    tr.dataset.id = tl.loadId;
    tr.innerHTML = `
      <td>${tl.loadId || ""}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType || ""}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.totalCartons || ""}</td>
      <td>${tl.routedPalletCount || ""}</td>
      <td>${tl.stagedLocation || ""}</td>
      <td>${tl.assignedTo || ""}</td>
      <td>${tl.status || "Unassigned"}</td>
      <td>
        <button class="btn small assign-btn">Assign</button>
        <button class="btn small secondary staged-btn">Fully staged</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $all("#dock-tbody .assign-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const tr = e.target.closest("tr");
      const id = tr.dataset.id;
      const name = prompt("Assign to (dock associate):");
      if (!name) return;
      const tl = APP.truckloads.find(t => t.loadId === id);
      if (tl) {
        tl.assignedTo = name;
        tl.status = "Being staged";
      }
      saveState();
      renderDock();
      renderToday();
    });
  });

  $all("#dock-tbody .staged-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const tr = e.target.closest("tr");
      const id = tr.dataset.id;
      const tl = APP.truckloads.find(t => t.loadId === id);
      if (tl) {
        tl.status = "Fully staged";
      }
      saveState();
      renderDock();
      renderMetrics();
      renderToday();
    });
  });
}

// ===== TODAY RENDER =====
function todayISO() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  return iso;
}
function renderToday() {
  const tbody = $("#today-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const today = todayISO();
  let total = 0, atDoor = 0, departed = 0, cartons = 0;

  const todayLoads = APP.truckloads.filter(t => t.pickupDate === today);
  // sort by carrier
  todayLoads.sort((a, b) => (a.carrier || "").localeCompare(b.carrier || ""));
  todayLoads.forEach(tl => {
    total++;
    cartons += Number(tl.totalCartons || 0);
    const tr = document.createElement("tr");
    tr.dataset.id = tl.loadId;
    let status = tl.todayStatus || "Scheduled";
    if (status === "At door") atDoor++;
    if (status === "Departed") departed++;

    tr.className = status === "At door" ? "row-arrived" : status === "Departed" ? "row-departed" : "";

    tr.innerHTML = `
      <td>${tl.loadId}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.loadType || ""}</td>
      <td>${tl.pickupWindow || ""}</td>
      <td>${tl.totalCartons || ""}</td>
      <td>${status}</td>
      <td><button class="btn small arrive-btn">Arrived</button></td>
      <td><button class="btn small secondary depart-btn">Departed</button></td>
    `;
    tbody.appendChild(tr);
  });

  $("#today-total-trucks").textContent = total;
  $("#today-at-door").textContent = atDoor;
  $("#today-departed").textContent = departed;
  $("#today-cartons").textContent = cartons;

  $all(".arrive-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const tr = e.target.closest("tr");
      const id = tr.dataset.id;
      const tl = APP.truckloads.find(t => t.loadId === id);
      if (tl) {
        tl.todayStatus = "At door";
      }
      saveState();
      renderToday();
    });
  });

  $all(".depart-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const tr = e.target.closest("tr");
      const id = tr.dataset.id;
      const tl = APP.truckloads.find(t => t.loadId === id);
      if (tl) {
        tl.todayStatus = "Departed";
        // move to history
        APP.history.push({ ...tl, status: "Departed" });
      }
      saveState();
      renderToday();
      renderHistory();
    });
  });
}

// ===== TRUCKLOADS / HISTORY RENDER =====
function renderTruckloads() {
  const tbody = $("#truckloads-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const term = ($("#truckloads-search")?.value || "").toLowerCase();
  APP.truckloads.forEach(tl => {
    const joined = Object.values(tl).join(" ").toLowerCase();
    if (term && !joined.includes(term)) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tl.loadId}</td>
      <td>${tl.customer || ""}</td>
      <td>${tl.carrier || ""}</td>
      <td>${tl.pickupDate || ""}</td>
      <td>${tl.loadType || ""}</td>
      <td>${tl.totalCartons || ""}</td>
      <td>${tl.totalWeight || ""}</td>
      <td>${tl.totalCubic || ""}</td>
      <td>${tl.routedPalletCount || ""}</td>
      <td>${tl.stagedLocation || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderHistory() {
  const tbody = $("#history-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const term = ($("#history-search")?.value || "").toLowerCase();
  APP.history.forEach(h => {
    const joined = Object.values(h).join(" ").toLowerCase();
    if (term && !joined.includes(term)) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.loadId}</td>
      <td>${h.customer || ""}</td>
      <td>${h.carrier || ""}</td>
      <td>${h.pickupDate || ""}</td>
      <td>${h.status || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== METRICS =====
function renderMetrics() {
  const monthLoads = APP.truckloads.length;
  const cartons = APP.truckloads.reduce((sum, tl) => sum + Number(tl.totalCartons || 0), 0);
  const staged = APP.truckloads.filter(tl => tl.status === "Fully staged").length;
  $("#m-total-loads").textContent = monthLoads;
  $("#m-total-cartons").textContent = cartons;
  $("#m-fully-staged").textContent = staged;
  const eff = monthLoads ? Math.round((staged / monthLoads) * 100) : 0;
  $("#m-dock-eff").textContent = eff + "%";

  const chart = $("#metrics-chart");
  chart.innerHTML = "";
  // simple bar view
  const bars = [
    { label: "Loads", value: monthLoads },
    { label: "Staged", value: staged },
    { label: "Cartons", value: cartons }
  ];
  const max = Math.max(1, ...bars.map(b => b.value));
  bars.forEach(b => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    const label = document.createElement("div");
    label.style.width = "70px";
    label.textContent = b.label;
    const bar = document.createElement("div");
    bar.style.height = "10px";
    bar.style.background = "rgba(43,108,232,.2)";
    bar.style.width = (b.value / max) * 180 + "px";
    const val = document.createElement("div");
    val.textContent = b.value;
    row.append(label, bar, val);
    chart.appendChild(row);
  });
}

// ===== TEAM =====
function renderTeam() {
  const list = $("#team-list");
  if (!list) return;
  list.innerHTML = "";
  APP.users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = `${u.name || u.email} – ${u.role}`;
    list.appendChild(li);
  });
}

// ===== EXPORTS =====
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== INITIAL BINDINGS =====
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  const bodyId = document.body.id;

  if (bodyId === "login-page") {
    // login
    const form = $("#login-form");
    form.addEventListener("submit", e => {
      e.preventDefault();
      const em = $("#login-email").value.trim();
      const pw = $("#login-password").value.trim();
      const user = APP.users.find(u => u.email === em && u.password === pw);
      if (!user) {
        $("#login-error").classList.remove("hidden");
        return;
      }
      localStorage.setItem("ncdc-current-user", JSON.stringify(user));
      window.location.href = "./dashboard.html";
    });
    return;
  }

  if (bodyId === "dashboard-page") {
    // restore current user
    const cu = localStorage.getItem("ncdc-current-user");
    if (cu) APP.currentUser = JSON.parse(cu);

    // theme
    if (APP.settings.theme === "dark") {
      document.body.classList.add("dark");
    }

    // tab nav
    $all("#nav-tabs .nav-link").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        $all("#nav-tabs .nav-link").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        $all(".tab-panel").forEach(p => p.classList.remove("active"));
        $(`#tab-${tab}`).classList.add("active");
      });
    });

    // logout
    $("#logout-btn").addEventListener("click", () => {
      localStorage.removeItem("ncdc-current-user");
      window.location.href = "./index.html";
    });

    // csv upload
    $("#orders-csv").addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const { headers, rows } = parseCSV(evt.target.result);
        // normalize to the new header list
        APP.orders = rows;
        $("#csv-updated").textContent = "CSV updated: " + new Date().toLocaleString();
        saveState();
        renderOrdersTable();
      };
      reader.readAsText(file);
    });

    // filters
    $("#apply-filters").addEventListener("click", renderOrdersTable);
    $("#clear-filters").addEventListener("click", () => {
      $("#filter-text").value = "";
      $("#date-from").value = "";
      $("#date-to").value = "";
      renderOrdersTable();
    });

    // open modal
    $("#open-truck-modal").addEventListener("click", () => {
      if (!APP.selectedPOs.length) {
        alert("Select at least one PO to build a truckload.");
        return;
      }
      $("#modal-overlay").classList.remove("hidden");
    });
    $("#modal-close").addEventListener("click", () => $("#modal-overlay").classList.add("hidden"));
    $("#modal-cancel").addEventListener("click", () => $("#modal-overlay").classList.add("hidden"));

    // save truckload
    $("#modal-save").addEventListener("click", () => {
      const tl = {
        loadId: $("#ml-load-id").value.trim() || "TL-" + Date.now(),
        loadType: $("#ml-load-type").value,
        pickupDate: $("#ml-pickup-date").value,
        pickupWindow: $("#ml-pickup-window").value,
        carrier: $("#ml-carrier").value,
        customer: $("#ml-customer").value,
        bol: $("#ml-bol").value,
        routedPalletCount: $("#ml-pallets").value,
        totalCartons: $("#ml-cartons").value,
        stagedLocation: "",
        status: "Unassigned",
        fromPOs: [...APP.selectedPOs],
      };
      APP.truckloads.push(tl);
      // clear selections
      APP.selectedPOs = [];
      $("#modal-overlay").classList.add("hidden");
      saveState();
      renderOrdersTable();
      renderTruckloads();
      renderDock();
      renderToday();
      renderCalendar();
    });

    // truckload export
    $("#truckloads-export").addEventListener("click", () => {
      if (!APP.truckloads.length) {
        alert("No truckloads to export.");
        return;
      }
      const headers = ["Load ID","Customer","Carrier","Pick Up Date","Load Type","Total Cartons","Total Weight","Total Cubic","Pallets","Staged Location"];
      const rows = [headers];
      APP.truckloads.forEach(tl => {
        rows.push([
          tl.loadId || "",
          tl.customer || "",
          tl.carrier || "",
          tl.pickupDate || "",
          tl.loadType || "",
          tl.totalCartons || "",
          tl.totalWeight || "",
          tl.totalCubic || "",
          tl.routedPalletCount || "",
          tl.stagedLocation || "",
        ]);
      });
      downloadCSV("truckloads.csv", rows);
    });

    // metrics export
    $("#metrics-export").addEventListener("click", () => {
      const rows = [
        ["Metric","Value"],
        ["Total Loads (month)", APP.truckloads.length],
        ["Total Cartons", APP.truckloads.reduce((s, t) => s + Number(t.totalCartons || 0), 0)],
        ["Fully Staged", APP.truckloads.filter(t => t.status === "Fully staged").length]
      ];
      downloadCSV("metrics.csv", rows);
    });

    // search on truckloads
    $("#truckloads-search").addEventListener("input", renderTruckloads);
    $("#history-search").addEventListener("input", renderHistory);

    // settings
    $("#toggle-theme").addEventListener("click", () => {
      document.body.classList.toggle("dark");
      APP.settings.theme = document.body.classList.contains("dark") ? "dark" : "light";
      saveState();
    });
    $("#lang-select").addEventListener("change", e => {
      APP.settings.language = e.target.value;
      saveState();
    });
    $("#max-loads").addEventListener("change", e => {
      APP.settings.maxLoadsPerBlock = Number(e.target.value) || 4;
      saveState();
    });

    // team add
    $("#team-add-form").addEventListener("submit", e => {
      e.preventDefault();
      const name = $("#team-name").value.trim();
      const email = $("#team-email").value.trim();
      const role = $("#team-role").value;
      if (!name || !email) return;
      APP.users.push({ name, email, password: "changeme", role });
      saveState();
      renderTeam();
      e.target.reset();
    });

    // initial renders
    renderOrdersTable();
    renderCalendar();
    renderTruckloads();
    renderDock();
    renderToday();
    renderMetrics();
    renderHistory();
    renderTeam();

    // set settings UI
    $("#lang-select").value = APP.settings.language;
    $("#max-loads").value = APP.settings.maxLoadsPerBlock;
  }
});
