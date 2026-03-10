// Generic API request helper
async function apiRequest(url, method, body = null) {
  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null
    });

    return await res.json();
  } catch (err) {
    console.error(err);
    return { message: "Server error" };
  }
}

// REGISTER
async function register() {
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !email || !password) {
    alert("Please fill in all fields.");
    return;
  }

  try {
    const data = await apiRequest("/auth/register", "POST", { username, email, password });
    alert(data.message || "Registration failed");

    if (data.message === "User registered successfully") {
      window.location.href = "login.html";
    }
  } catch (err) {
    alert("Server error during registration");
  }
}

// LOGIN
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    alert("Please fill in all fields.");
    return;
  }

  try {
    const data = await apiRequest("/auth/login", "POST", { email, password });

    if (data.token) {
      localStorage.setItem("token", data.token);
      alert("Login successful!");
      window.location.href = "index.html";
    } else {
      alert(data.message || "Login failed");
    }
  } catch (err) {
    alert("Server error during login");
  }
}

// Optional: Auth UI toggle on main page
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
