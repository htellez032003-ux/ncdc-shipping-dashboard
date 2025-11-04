
// NCDC Shipping Dashboard - Full Offline Build v4
const loginForm = document.getElementById("login-form");
const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const logoutBtn = document.getElementById("logout-btn");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const pw = document.getElementById("login-password").value.trim();
  if (email === "htellez032003@gmail.com" && pw === "Ltapparel040523") {
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    loadTabs();
  } else {
    document.getElementById("login-error").textContent = "Invalid credentials.";
  }
});

logoutBtn.addEventListener("click", () => {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    tabPanels.forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

function loadTabs() {
  document.getElementById("tab-orders").innerHTML = `<div class='card'><h3>Orders</h3><p>Upload CSV and manage orders.</p></div>`;
  document.getElementById("tab-dock").innerHTML = `<div class='card'><h3>Dock</h3><p>Track staging, pallets, and comments.</p></div>`;
  document.getElementById("tab-truckloads").innerHTML = `<div class='card'><h3>Truckloads</h3><p>Build loads, assign pickup slots, and manage capacity.</p></div>`;
  document.getElementById("tab-metrics").innerHTML = `<div class='card'><h3>Metrics</h3><p>Performance and efficiency analytics (offline sample).</p></div>`;
  document.getElementById("tab-settings").innerHTML = `<div class='card'><h3>Settings</h3><p>Owner and admin controls for users and ship windows.</p></div>`;
}
