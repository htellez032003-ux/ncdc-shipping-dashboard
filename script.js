document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      localStorage.setItem("loggedIn", "true");
      window.location.href = "dashboard.html";
    });
  }
  if (localStorage.getItem("loggedIn") && window.location.pathname.includes("index.html")) {
    window.location.href = "dashboard.html";
  }
  const tabs = document.querySelectorAll(".tab");
  const navItems = document.querySelectorAll(".sidebar ul li");
  navItems.forEach(i => i.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    navItems.forEach(n => n.classList.remove("active"));
    i.classList.add("active");
    document.getElementById(i.dataset.tab).classList.add("active");
  }));
  const darkToggle = document.getElementById("darkModeToggle");
  if (darkToggle) {
    const theme = localStorage.getItem("theme");
    if (theme === "dark") { darkToggle.checked = true; document.body.classList.add("dark-mode"); }
    darkToggle.addEventListener("change", e => {
      document.body.classList.toggle("dark-mode", e.target.checked);
      document.body.classList.toggle("light-mode", !e.target.checked);
      localStorage.setItem("theme", e.target.checked ? "dark" : "light");
    });
  }
  const ctx = document.getElementById("metricsChart");
  if (ctx) {
    new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [{ label: "Truckloads per Day", data: [10,12,9,14,15,11,13],
          borderColor: "#007bff", backgroundColor: "rgba(0,123,255,0.1)", fill: true, tension: 0.4 }]
      },
      options: { responsive: true, plugins: { legend: { display: true }}, scales: { y: { beginAtZero: true } } }
    });
  }
  const exportBtn = document.getElementById("exportMetrics");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const data = [
        ["Metric", "Value"],
        ["Total Trucks", document.getElementById("totalTrucks").innerText],
        ["Total Cartons", document.getElementById("totalCartons").innerText],
        ["Total Pallets", document.getElementById("totalPallets").innerText],
        ["Total $", document.getElementById("totalAmount").innerText]
      ];
      const csv = data.map(e => e.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "metrics_report.csv";
      link.click();
    });
  }
});