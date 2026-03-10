const API_BASE = "http://127.0.0.1:5000/api";

async function apiRequest(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("API ERROR:", text);
      throw new Error("API request failed");
    }

    // Return JSON safely
    return res.json();
  } catch (err) {
    console.error("API request error:", err);
    return { message: "Server error" };
  }
}
