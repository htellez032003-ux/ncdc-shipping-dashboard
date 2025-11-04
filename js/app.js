const ownerEmail = "htellez032003@gmail.com";
const ownerPassword = "Ltapparel040523";

function login() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  if (email === ownerEmail && password === ownerPassword) {
    alert("Login successful! Dashboard loading...");
  } else {
    document.getElementById("errorMsg").classList.remove("hidden");
  }
}