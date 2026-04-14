// API Base URL
const API_BASE = "http://127.0.0.1:5000/api";

// LOCAL CACHE (localStorage only)
const CACHE_KEY = "notes_cache";
const CACHE_TIMESTAMP_KEY = "notes_cache_time";
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

function saveCache(data) {
    if (!data) return invalidateCache();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
}

function getCache() {
    const raw = localStorage.getItem(CACHE_KEY);
    const time = localStorage.getItem(CACHE_TIMESTAMP_KEY);

    if (!raw || !time) return null;

    const isExpired = Date.now() - Number(time) > CACHE_TTL;
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

    localStorage.removeItem("archive_cache");
    localStorage.removeItem("trash_cache");
}

// AUTH HEADERS
function getAuthHeaders() {
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}

// ===== GENERIC API REQUEST (IMPROVED) =====
async function apiRequest(endpoint, method = "GET", body = null) {
    const url = `${API_BASE}${endpoint}`;

    console.log("API REQUEST:", method, url);

    const options = {
        method,
        headers: getAuthHeaders()
    };

    if (body && method !== "GET") {
        options.body = JSON.stringify(body);
    }

    let res;

    try {
        res = await fetch(url, options);
    } catch (err) {
        console.error("❌ Network error:", err);
        throw new Error("Network error - check backend/server");
    }

    console.log("STATUS:", res.status);

    // ===== HANDLE AUTH =====
    if (res.status === 401) {
        console.warn("⚠️ Unauthorized - redirecting to login");

        localStorage.removeItem("token");

        if (!window.location.pathname.includes("login")) {
            window.location.href = "login.html";
        }

        throw new Error("Unauthorized");
    }

    // ===== HANDLE OTHER ERRORS =====
    if (!res.ok) {
        const text = await res.text();
        console.error("❌ API error:", text);
        throw new Error(text || `API error ${res.status}`);
    }

    // ===== SAFE JSON PARSE =====
    try {
        return res.status !== 204 ? await res.json() : null;
    } catch (err) {
        console.error("❌ JSON parse error:", err);
        throw new Error("Invalid JSON response");
    }
}

// NOTES API
async function getNotes(search = "") {
    const cacheKey = search ? `notes_${search}` : "notes_all";

    if (!search) {
        const cached = getCache();
        if (cached) return cached;
    }

    const data = await apiRequest(
        search ? `/notes?search=${encodeURIComponent(search)}` : "/notes"
    );

    if (!search) saveCache(data);

    return data;
}

async function createNote(title, content, tags = []) {
    const res = await apiRequest("/notes", "POST", { title, content, tags });
    invalidateCache();
    return res;
}

async function updateNote(id, title, content, tags = []) {
    const res = await apiRequest(`/notes/${id}`, "PUT", {
        title,
        content,
        tags
    });

    invalidateCache();
    return res;
}

async function deleteNote(id) {
    const res = await apiRequest(`/notes/${id}`, "DELETE");
    invalidateCache();
    return res;
}

async function togglePin(id) {
    const res = await apiRequest(`/notes/pin/${id}`, "PUT");
    invalidateCache();
    return res;
}

async function toggleArchive(id) {
    const res = await apiRequest(`/notes/archive/${id}`, "PUT");
    invalidateCache();
    return res;
}

async function reorderNotes(ordered_ids) {
    const res = await apiRequest("/notes/reorder", "PUT", { ordered_ids });
    invalidateCache();
    return res;
}

// COLOR UPDATE (SAFE VERSION)
async function updateNoteColor(id, color) {
    // backend expects full update payload
    const res = await apiRequest(`/notes/${id}`, "PUT", {
        color
    });

    invalidateCache();
    return res;
}

// ARCHIVED NOTES
async function getArchivedNotes() {
    const cached = localStorage.getItem("archive_cache");
    if (cached) return JSON.parse(cached);

    const data = await apiRequest("/notes/archived");
    localStorage.setItem("archive_cache", JSON.stringify(data));
    return data;
}

// TRASH + RESTORE
async function getTrashNotes() {
    const cached = localStorage.getItem("trash_cache");
    if (cached) return JSON.parse(cached);

    const data = await apiRequest("/notes/trash");
    localStorage.setItem("trash_cache", JSON.stringify(data));
    return data;
}

async function restoreNote(id) {
    const res = await apiRequest(`/notes/restore/${id}`, "PUT");
    invalidateCache();
    return res;
}

async function deleteNotePermanently(id) {
    const res = await apiRequest(`/notes/permanent/${id}`, "DELETE");
    invalidateCache();
    return res;
}

// BULK ACTIONS
async function bulkDelete(note_ids) {
    const res = await apiRequest("/notes/bulk-delete", "POST", { note_ids });
    invalidateCache();
    return res;
}

async function bulkArchive(note_ids) {
    const res = await apiRequest("/notes/bulk-archive", "POST", { note_ids });
    invalidateCache();
    return res;
}

// NOTE HISTORY
async function getNoteHistory(id) {
    return await apiRequest(`/notes/history/${id}`);
}

// OPTIONAL SEARCH WRAPPER
async function searchNotes(query) {
    return getNotes(query);
}

// TAGS API
async function getTags() {
    return await apiRequest("/notes/tags");
}

// BULK UPDATE TAGS
async function bulkUpdateTags(note_ids, tags) {
    const res = await apiRequest("/notes/bulk-tags", "POST", {
        note_ids,
        tags
    });

    invalidateCache();
    return res;
}

// NOTE PAGINATION
async function getNotesPaginated(page = 1, limit = 20) {
    return await apiRequest(`/notes?page=${page}&limit=${limit}`);
}

// EMPTY TRASH
async function emptyTrash() {
    console.log("EMPTY TRASH CLICKED");

    const res = await apiRequest("/notes/trash/empty", "DELETE");
    console.log("RESULT:", res);

    await loadNotes();
}
