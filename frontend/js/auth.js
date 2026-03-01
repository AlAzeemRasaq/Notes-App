// REGISTER
async function register() {
  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const data = await apiRequest("/auth/register", "POST", {
    username,
    email,
    password
  });

  alert(data.message);

  if (data.message === "User registered successfully") {
    window.location.href = "login.html";
  }
}

// LOGIN
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const data = await apiRequest("/auth/login", "POST", {
    email,
    password
  });

  if (data.token) {
    localStorage.setItem("token", data.token);
    window.location.href = "index.html";
  } else {
    alert(data.message);
  }
}

// Auth UI toggle (only runs on index page)
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

if (loginBtn && registerBtn && logoutBtn) {
  function updateAuthUI() {
    const token = localStorage.getItem("token");

    loginBtn.classList.toggle("hidden", !!token);
    registerBtn.classList.toggle("hidden", !!token);
    logoutBtn.classList.toggle("hidden", !token);
  }

  loginBtn.onclick = () => window.location.href = "login.html";
  registerBtn.onclick = () => window.location.href = "register.html";
  logoutBtn.onclick = () => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
  };

  updateAuthUI();
}