// API Base URL
const API_BASE = "http://127.0.0.1:5000/api";

// LOCAL CACHE (localStorage only)
const CACHE_KEY = "notes_cache";
const CACHE_TIMESTAMP_KEY = "notes_cache_time";
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes


// ===== LOCAL CACHE LAYER =====
// Stores API responses in localStorage with timestamp-based expiration

function saveCache(data) {
    if (!data) return invalidateCache();

    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
}


// Retrieve cached data if still valid (TTL-based cache)
function getCache() {
    const raw = localStorage.getItem(CACHE_KEY);
    const time = localStorage.getItem(CACHE_TIMESTAMP_KEY);

    if (!raw || !time) return null;

    // check if cache has expired
    const isExpired = Date.now() - Number(time) > CACHE_TTL;
    if (isExpired) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null; // corrupted cache safety fallback
    }
}


// Clear all cached data (used on logout or invalid state)
function invalidateCache() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);

    // also clear related feature caches
    localStorage.removeItem("archive_cache");
    localStorage.removeItem("trash_cache");
}


// ===== AUTH HEADER BUILDER =====
// Attaches JWT token to every request if available

function getAuthHeaders() {
    const token = localStorage.getItem("token");

    const headers = {
        "Content-Type": "application/json"
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
}


// ===== GENERIC API CLIENT (CORE LAYER) =====
// Centralized fetch wrapper for ALL backend requests

async function apiRequest(endpoint, method = "GET", body = null) {

    const url = `${API_BASE}${endpoint}`;

    console.log("API REQUEST:", method, url);

    const options = {
        method,
        headers: getAuthHeaders()
    };

    // attach JSON body if needed
    if (body && method !== "GET") {
        options.body = JSON.stringify(body);
    }

    let res;

    // ===== NETWORK FAILURE HANDLING =====
    try {
        res = await fetch(url, options);
    } catch (err) {
        console.error("❌ Network error:", err);
        throw new Error("Network error — is the server running?");
    }

    console.log("STATUS:", res.status);

    let data = null;

    // ===== RESPONSE PARSING (ROBUST) =====
    try {
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            data = await res.json();
        } else {
            const text = await res.text();
            data = text ? { message: text } : null;
        }

    } catch (err) {
        console.warn("⚠️ Response parse failed");
    }


    // ===== AUTH FAILURE HANDLING =====
    if (res.status === 401) {
        console.warn("⚠️ Unauthorized - redirecting to login");

        // clear invalid session
        localStorage.removeItem("token");

        // redirect user if not already on login page
        if (!window.location.pathname.includes("login")) {
            window.location.href = "login.html";
        }

        throw new Error("Session expired. Please log in again.");
    }


    // ===== GENERIC ERROR HANDLING =====
    if (!res.ok) {
        const message =
            data?.error ||
            data?.message ||
            `Request failed (${res.status})`;

        console.error("❌ API error:", message);

        throw new Error(message);
    }


    // ===== SUCCESS RESPONSE =====
    return data;
}

// ===== NOTES API =====

// Fetch notes with optional search query
// Uses cache for default (non-search) loads to reduce API calls
async function getNotes(search = "") {
    const cacheKey = search ? `notes_${search}` : "notes_all";

    if (!search) {
        const cached = getCache();
        if (cached) return cached; // return cached main feed if valid
    }

    const data = await apiRequest(
        search ? `/notes?search=${encodeURIComponent(search)}` : "/notes"
    );

    if (!search) saveCache(data); // only cache main feed, not search results

    return data;
}

// Create a new note and invalidate cache so UI refresh is consistent
async function createNote(title, content, tags = []) {
    const res = await apiRequest("/notes", "POST", { title, content, tags });
    invalidateCache(); // ensures next fetch reflects new backend state
    return res;
}

// Update full note object (PUT semantics: full replacement expected)
async function updateNote(id, title, content, tags = []) {
    const res = await apiRequest(`/notes/${id}`, "PUT", {
        title,
        content,
        tags
    });

    invalidateCache(); // avoid stale cached version after edit
    return res;
}

// Soft delete (move to trash)
async function deleteNote(id) {
    const res = await apiRequest(`/notes/${id}`, "DELETE");
    invalidateCache();
    return res;
}
// Toggle pin status
async function togglePin(id) {
    const res = await apiRequest(`/notes/pin/${id}`, "PUT");
    invalidateCache();
    return res;
}
// Toggle archive status
async function toggleArchive(id) {
    const res = await apiRequest(`/notes/archive/${id}`, "PUT");
    invalidateCache();
    return res;
}
// Reorder notes based on new order of IDs
async function reorderNotes(ordered_ids) {
    const res = await apiRequest("/notes/reorder", "PUT", { ordered_ids });
    invalidateCache();
    return res;
}

// Update note color field
async function updateNoteColor(id, color) {
    // backend expects full update payload
    const res = await apiRequest(`/notes/${id}`, "PUT", {
        color
    });

    invalidateCache();
    return res;
}

// Get archived notes (with caching)
async function getArchivedNotes() {
    const cached = localStorage.getItem("archive_cache");
    if (cached) return JSON.parse(cached); // return cached archive if available

    const data = await apiRequest("/notes/archived");
    localStorage.setItem("archive_cache", JSON.stringify(data));
    return data;
}

// Get trashed notes (with caching)
async function getTrashNotes() {
    const cached = localStorage.getItem("trash_cache");
    if (cached) return JSON.parse(cached);

    const data = await apiRequest("/notes/trash");
    localStorage.setItem("trash_cache", JSON.stringify(data));
    return data;
}
// Restore note from trash back to main feed
async function restoreNote(id) {
    const res = await apiRequest(`/notes/restore/${id}`, "PUT");
    invalidateCache();
    return res;
}
// Permanently delete note from trash (irreversible)
async function deleteNotePermanently(id) {
    const res = await apiRequest(`/notes/permanent/${id}`, "DELETE");
    invalidateCache();
    return res;
}

// Bulk delete notes by IDs (moves to trash)
async function bulkDelete(note_ids) {
    const res = await apiRequest("/notes/bulk-delete", "POST", { note_ids });
    invalidateCache();
    return res;
}
// Bulk archive notes by IDs
async function bulkArchive(note_ids) {
    const res = await apiRequest("/notes/bulk-archive", "POST", { note_ids });
    invalidateCache();
    return res;
}

// Fetch edit history for a note (for undo/redo functionality)
async function getNoteHistory(id) {
    return await apiRequest(`/notes/history/${id}`);
}

// Wrapper around search endpoint for cleaner UI code
async function searchNotes(query) {
    return getNotes(query);
}

// Fetch all unique tags across notes for tag management UI
async function getTags() {
    return await apiRequest("/notes/tags");
}

// Bulk tag update for multiple notes (add/remove tags in one request)
async function bulkUpdateTags(note_ids, tags) {
    const res = await apiRequest("/notes/bulk-tags", "POST", {
        note_ids,
        tags
    });

    invalidateCache();
    return res;
}

// Paginated fetch for infinite scroll (returns { notes: [...], has_more: bool })
async function getNotesPaginated(page = 1, limit = 20) {
    return await apiRequest(`/notes?page=${page}&limit=${limit}`);
}

// Export notes data (returns file URL or data blob)
async function exportNotes() {
    return apiRequest("/notes/export", "GET");
}
// Import notes from file upload (expects FormData with file field)
async function importNotes(data) {
    return apiRequest("/notes/import", "POST", data);
}

// Share note with another user by email (collaborator management)
async function shareNote(noteId, collaboratorId) {
    const token = localStorage.getItem("token");

    const res = await fetch(`/api/notes/share/${noteId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            collaborator_id: collaboratorId
        })
    });

    return res.json();
}

// FETCH SINGLE NOTE (FOR EDITING)
// Used when entering edit mode to ensure we load the latest server version
async function fetchSingleNote(noteId) {
    const token = localStorage.getItem("token");

    const res = await fetch(`/api/notes/single/${noteId}`, {
        headers: {
            Authorization: `Bearer ${token}` // JWT auth for protected endpoint
        }
    });

    return res.json();
}

// MARK NOTE AS BEING EDITED
// Used for collaborative editing locking / presence indication
async function markEditing(noteId) {
    const token = localStorage.getItem("token");

    const res = await fetch(`/api/notes/editing/${noteId}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}` // identify current user
        }
    });

    return res.json();
}

// API FETCH WRAPPER (FOR FUTURE USE)
// Centralized fetch helper with JSON parsing + consistent error handling
// Intended to replace raw fetch calls gradually for consistency
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json", // default JSON contract
            ...options.headers
        },
        ...options
    });

    let data;

    // Safe parsing: avoids crash if backend returns empty/non-JSON response
    try {
        data = await res.json();
    } catch {
        data = {};
    }

    // Normalize error handling across all API calls
    if (!res.ok) {
        throw {
            status: res.status, // useful for UI-level branching (401, 500, etc.)
            message: data.message || data.error || "Request failed"
        };
    }

    return data;
}

// SHARE NOTE (BY EMAIL)
// Sends invite/request to backend to grant access to another user
async function shareNote(noteId, email) {
    const res = await fetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        headers: getAuthHeaders(), // includes JWT token + JSON headers
        body: JSON.stringify({ email }) // collaborator identifier
    });

    if (!res.ok) {
        throw new Error("Failed to share note"); // simple fallback error
    }

    return res.json();
}
