// =========================
// API Base URL
// =========================
const API_BASE = "http://127.0.0.1:5000/api";

// =========================
// LOCAL CACHE
// =========================
const CACHE_KEY = "notes_cache";
const CACHE_TIMESTAMP_KEY = "notes_cache_time";
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

function saveCache(data) {
    if (!data) return invalidateCache(); // 👈 clean invalidation
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now());
}

function getCache() {
    const raw = localStorage.getItem(CACHE_KEY);
    const time = localStorage.getItem(CACHE_TIMESTAMP_KEY);

    if (!raw || !time) return null;

    const isExpired = Date.now() - time > CACHE_TTL;
    if (isExpired) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function invalidateCache() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
}

// =========================
// Generic API Request Helper
// =========================
async function apiRequest(endpoint, method = "GET", body = null) {
    const token = localStorage.getItem("token");

    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const options = { method, headers };
    if ((method === "POST" || method === "PUT") && body) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, options);

    if (!res.ok) {
        const text = await res.text();

        if (res.status === 401 || res.status === 422) {
            localStorage.removeItem("token");
            window.location.href = "login.html";
        }

        throw new Error(text || `API error ${res.status}`);
    }

    return res.status !== 204 ? await res.json() : null;
}

// =========================
// Notes API
// =========================
export async function getNotes(search = "") {
    // ⚡ Use cache only for full list
    if (!search) {
        const cached = getCache();
        if (cached) return cached;
    }

    const data = await apiRequest(
        `/notes${search ? `?search=${search}` : ""}`
    );

    if (!search) {
        saveCache(data);
    }

    return data;
}

export async function createNote(title, content, tags = []) {
    if (!Array.isArray(tags)) tags = [];

    const res = await apiRequest("/notes", "POST", { title, content, tags });

    invalidateCache(); // 👈 AFTER request
    return res;
}

export async function updateNote(id, title, content, tags = []) {
    if (!Array.isArray(tags)) tags = [];

    const res = await apiRequest(`/notes/${id}`, "PUT", { title, content, tags });

    invalidateCache();
    return res;
}

export async function deleteNote(id) {
    const res = await apiRequest(`/notes/${id}`, "DELETE");

    invalidateCache();
    return res;
}

export async function togglePin(id) {
    const res = await apiRequest(`/notes/pin/${id}`, "PUT");

    invalidateCache();
    return res;
}

export async function toggleArchive(id) {
    const res = await apiRequest(`/notes/archive/${id}`, "PUT");

    invalidateCache();
    return res;
}

export async function reorderNotes(ordered_ids) {
    const res = await apiRequest("/notes/reorder", "PUT", { ordered_ids });

    invalidateCache();
    return res;
}

// =========================
// Note Color API
// =========================
export async function updateNoteColor(id, color) {
    const res = await apiRequest(`/notes/${id}`, "PUT", { color });

    invalidateCache();
    return res;
}

// =========================
// Trash & Restore
// =========================
export async function getTrashNotes() {
    return await apiRequest("/notes/trash", "GET"); // 🚫 no cache
}

export async function restoreNote(id) {
    const res = await apiRequest(`/notes/restore/${id}`, "PUT");

    invalidateCache();
    return res;
}

export async function deleteNotePermanently(id) {
    const res = await apiRequest(`/notes/permanent/${id}`, "DELETE");

    invalidateCache();
    return res;
}

// =========================
// Bulk Actions
// =========================
export async function bulkDelete(note_ids) {
    const res = await apiRequest("/notes/bulk-delete", "POST", { note_ids });

    invalidateCache();
    return res;
}

export async function bulkArchive(note_ids) {
    const res = await apiRequest("/notes/bulk-archive", "POST", { note_ids });

    invalidateCache();
    return res;
}

// =========================
// Auth Headers (legacy)
// =========================
function getAuthHeaders() {
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}
