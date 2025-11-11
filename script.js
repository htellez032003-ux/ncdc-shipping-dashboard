document.addEventListener("DOMContentLoaded", () => {
  // Login functionality
  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      localStorage.setItem("loggedIn", "true");
      window.location.href = "dashboard.html";
    });
  }

  // Persist login
  if (localStorage.getItem("loggedIn") && window.location.pathname.includes("index.html")) {
    window.location.href = "dashboard.html";
  }

  // Navigation
  const tabs = document.querySelectorAll(".tab");
  const sidebarItems = document.querySelectorAll(".sidebar ul li");
  sidebarItems.forEach(item => {
    item.addEventListener("click", () => {
      tabs.forEach(tab => tab.classList.remove("active"));
      sidebarItems.forEach(li => li.classList.remove("active"));
      item.classList.add("active");
      document.getElementById(item.dataset.tab).classList.add("active");
    });
  });

  // Dark mode toggle
  const darkModeToggle = document.getElementById("darkModeToggle");
  if (darkModeToggle) {
    darkModeToggle.addEventListener("change", (e) => {
      document.body.classList.toggle("dark-mode", e.target.checked);
      document.body.classList.toggle("light-mode", !e.target.checked);
      localStorage.setItem("theme", e.target.checked ? "dark" : "light");
    });

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      darkModeToggle.checked = true;
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.add("light-mode");
    }
  }

  // Metrics chart
  const ctx = document.getElementById("metricsChart");
  if (ctx) {
    new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [{
          label: "Truckloads per Day",
          data: [10, 12, 9, 14, 15, 11, 13],
          borderColor: "#007bff",
          backgroundColor: "rgba(0, 123, 255, 0.1)",
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Export metrics CSV
  const exportBtn = document.getElementById("exportMetrics");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const metricsData = [
        ["Metric", "Value"],
        ["Total Trucks", document.getElementById("totalTrucks").innerText],
        ["Total Cartons", document.getElementById("totalCartons").innerText],
        ["Total Pallets", document.getElementById("totalPallets").innerText],
        ["Total $", document.getElementById("totalAmount").innerText]
      ];
      const csvContent = metricsData.map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "metrics_report.csv";
      link.click();
    });
  }
});
