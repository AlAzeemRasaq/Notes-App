// =========================
// API Base URL
// =========================
const API_BASE = "http://127.0.0.1:5000/api";

// =========================
// Generic API Request Helper
// Handles JWT, JSON, logs request & response
// =========================
async function apiRequest(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  console.log(`[API REQUEST] ${method} ${endpoint}`);
  console.log("JWT Token:", token);
  if (body) console.log("Request Body:", body);

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const options = { method, headers };

  if ((method === "POST" || method === "PUT") && body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    console.log(`[API RESPONSE] ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`[API ERROR] ${method} ${endpoint}:`, text);
      throw new Error(`API request failed with status ${res.status}`);
    }

    const data = res.status !== 204 ? await res.json() : null;
    console.log("Response Data:", data);
    return data;
  } catch (err) {
    console.error("[API EXCEPTION]", err);
    throw err;
  }
}
