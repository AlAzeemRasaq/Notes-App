// =========================
// API Base URL
// =========================
const API_BASE = "http://127.0.0.1:5000/api";

// =========================
// Generic API Request Helper
// =========================
async function apiRequest(endpoint, method = "GET", body = null) {
    const token = localStorage.getItem("token");

    console.log(`[API REQUEST] ${method} ${endpoint}`);
    if (body) console.log("Request Body:", body);
    if (token) console.log("JWT Token:", token);

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

            if (res.status === 401 || res.status === 422) {
                localStorage.removeItem("token");
                window.location.href = "login.html";
            }

            throw new Error(`API request failed with status ${res.status}`);
        }

        return res.status !== 204 ? await res.json() : null;
    } catch (err) {
        console.error("[API EXCEPTION]", err);
        throw err;
    }
}

// =========================
// Notes API
// =========================
async function getNotes(search = "") {
    const endpoint = search ? `/notes?search=${encodeURIComponent(search)}` : "/notes";
    return await apiRequest(endpoint);
}

async function createNote(title, content, tags = []) {
    if (!Array.isArray(tags)) tags = [];
    return await apiRequest("/notes", "POST", { title, content, tags });
}

async function updateNote(id, title, content, tags = []) {
    if (!Array.isArray(tags)) tags = [];
    return await apiRequest(`/notes/${id}`, "PUT", { title, content, tags });
}

async function deleteNote(id) {
    return await apiRequest(`/notes/${id}`, "DELETE");
}

async function togglePin(id) {
    return await apiRequest(`/notes/pin/${id}`, "PUT");
}

async function toggleArchive(id) {
    return await apiRequest(`/notes/archive/${id}`, "PUT");
}

async function reorderNotes(ordered_ids) {
    return await apiRequest("/notes/reorder", "PUT", { ordered_ids });
}

// =========================
// Trash & Restore
// =========================
async function getTrashNotes() {
    return await apiRequest("/notes/trash", "GET");
}

async function restoreNote(id) {
    const res = await fetch(`/notes/${id}/restore`, {
        method: "PUT",
        headers: getAuthHeaders()
    });
    return res.json();
}

async function deleteNotePermanently(id) {
    return await apiRequest(`/notes/permanent/${id}`, "DELETE");
}

// =========================
// Bulk Actions
// =========================
async function bulkDelete(note_ids) {
    return await apiRequest("/notes/bulk-delete", "POST", { note_ids });
}

async function bulkArchive(note_ids) {
    return await apiRequest("/notes/bulk-archive", "POST", { note_ids });
}
