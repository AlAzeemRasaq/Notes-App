console.log("showLoading:", typeof showLoading);

// ===== LOAD NOTES =====
// Main data-fetching function for notes with support for:
// - search
// - pagination reset
// - request cancellation (stale request protection)
// - special pages (trash/archive)
// - caching
async function loadNotes(search = "") {

    // ===== REQUEST ID SYSTEM =====
    // Used to prevent race conditions when multiple requests are triggered quickly
    const requestId = ++currentRequestId;

    // ===== RESET STATE =====
    // Reset pagination and UI state whenever new load starts
    currentPage = 1;
    hasMore = true;

    currentSearch = search || "";
    currentTag = null;
    selectedNotes.clear();
    selectMode = false;

    // ===== LOADING STATE =====
    window.isLoadingNotes = true;

    // Show skeleton UI only on main feed (not search/trash/archive)
    if (!search && !isTrashPage() && !isArchivePage()) {
        showLoading();
    }

    try {
        let data;

        // =====================================================
        // ===== SPECIAL ROUTES (TRASH / ARCHIVE FIRST) =====
        // These bypass normal API flow for performance clarity
        // =====================================================

        if (isTrashPage()) {
            const data = await getTrashNotes();
            allNotes = Array.isArray(data) ? data : (data?.notes || []);
            applyFilters();
            return;
        }

        if (isArchivePage()) {
            const data = await getArchivedNotes();
            allNotes = Array.isArray(data) ? data : (data?.notes || []);
            applyFilters();
            return;
        }

        // ===================== NORMAL LOAD =====================
        const response = await getNotes(search || "");

        // ===== STALE RESPONSE GUARD =====
        // If a newer request was triggered, ignore this result
        if (requestId !== currentRequestId) return;

        allNotes = Array.isArray(response)
            ? response
            : (response?.notes || []);

    } catch (err) {

        // ===================== ERROR STATE =====================
        console.error("Failed to load notes:", err);

        showToast(err.message || "Failed to load notes", "error");
        showEmpty("Failed to load notes ❌");

        window.isLoadingNotes = false;
        return;
    }

    // ===== STALE REQUEST CHECK (AGAIN) =====
    if (requestId !== currentRequestId) return;

    if (!Array.isArray(allNotes)) allNotes = [];

    // ===================== PIN SORTING =====================
    // Pinned notes always appear first, then sorted by pin order
    allNotes.sort((a, b) => {

        // pinned first
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;

        // stable ordering among pinned notes
        if (a.pinned && b.pinned) {
            return (b.pin_order || 0) - (a.pin_order || 0);
        }

        return 0;
    });

    // ===================== CLIENT-SIDE CACHE =====================
    // Cache only main feed (not search/trash/archive)
    if (!search && !isTrashPage() && !isArchivePage()) {
        try {
            localStorage.setItem(
                "notes_cache",
                JSON.stringify(allNotes)
            );
        } catch (err) {
            console.warn("Cache write failed:", err);
        }
    }

    // ===================== EMPTY STATE =====================
    if (allNotes.length === 0) {
        window.isLoadingNotes = false;

        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes found ✍️");
    }

    // ===== FINAL STEP =====
    // Apply filters + search logic + render pipeline
    applyFilters();
}

// ===== SEARCH INPUT (DEBOUNCED) =====
// Handles live search with debounce to avoid excessive API calls
const searchInput = document.getElementById("searchInput");

searchInput?.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();

    currentSearch = query;

    // Clear previous debounce timer
    clearTimeout(searchTimeout);

    // Delay API call to reduce load while typing
    searchTimeout = setTimeout(() => {
        loadNotes(query);
    }, 300);
});


// ===== SEARCH PARSER =====
// Converts raw search string into structured filters
// Supports: tag:, pinned:true/false, archived:true/false, plus text search
function parseSearch(query) {

    const filters = {
        text: [],
        tag: null,
        pinned: null,
        archived: null
    };

    const parts = query.split(/\s+/);

    // Loop-based parsing for performance and clarity
    for (let i = 0; i < parts.length; i++) {
        const term = parts[i];
        if (!term) continue;

        // Tag filter
        if (term.startsWith("tag:")) {
            filters.tag = term.slice(4).toLowerCase();
        }

        // Pinned filter
        else if (term === "pinned:true") {
            filters.pinned = true;
        }
        else if (term === "pinned:false") {
            filters.pinned = false;
        }

        // Archived filter
        else if (term === "archived:true") {
            filters.archived = true;
        }
        else if (term === "archived:false") {
            filters.archived = false;
        }

        // Default: treat as text search term
        else {
            filters.text.push(term.toLowerCase());
        }
    }

    return filters;
}


// ===== TAG SYSTEM (AUTOCOMPLETE) =====
const tagInput = document.getElementById("tagInput");
const tagSuggestions = document.getElementById("tagSuggestions");

let allTags = [];

// Load all unique tags from backend
async function loadTags() {
    try {
        const data = await getTags();
        allTags = Array.isArray(data) ? data : [];
    } catch {
        allTags = [];
    }
}

// Live tag suggestion filtering
tagInput?.addEventListener("input", () => {
    const value = tagInput.value.toLowerCase();

    if (!value) {
        tagSuggestions.style.display = "none";
        return;
    }

    // Filter tags in memory (fast, no API call)
    const matches = allTags.filter(tag => tag.includes(value));

    tagSuggestions.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < matches.length; i++) {
        const tag = matches[i];

        const div = document.createElement("div");
        div.textContent = tag;

        div.onclick = () => {
            tagInput.value = tag;
            tagSuggestions.style.display = "none";
        };

        fragment.appendChild(div);
    }

    tagSuggestions.appendChild(fragment);
    tagSuggestions.style.display = matches.length ? "block" : "none";
});

// Load tags once on page load
document.addEventListener("DOMContentLoaded", loadTags);


// ===== INFINITE SCROLL =====
// Loads next page of notes when user scrolls
async function loadMoreNotes() {

    // Disable on special pages
    if (isArchivePage() || isTrashPage()) return;

    // Prevent duplicate requests
    if (isLoadingMore || !hasMore) return;

    isLoadingMore = true;

    try {
        const newNotes = await getNotesPaginated(currentPage + 1);

        // Stop if no more data
        if (!Array.isArray(newNotes) || newNotes.length === 0) {
            hasMore = false;
            return;
        }

        currentPage++;

        // Append new results to existing state
        allNotes = allNotes.concat(newNotes);

        applyFilters();

    } catch (err) {
        console.error("Pagination failed:", err);
    } finally {
        isLoadingMore = false;
    }
}


// ===== DEBOUNCED VERSION =====
// Reusable debounced loader for performance
const debouncedLoadNotes = debounce(loadNotes, 300);


// ===== AUTO SYNC SYSTEM =====
// Periodically refresh notes (but avoids interfering with editing)
let syncBlocked = false;

setInterval(() => {

    if (syncBlocked) return;
    if (document.querySelector(".note.editing")) return;

    syncBlocked = true;

    loadNotes(currentSearch).finally(() => {
        setTimeout(() => {
            syncBlocked = false;
        }, 2000); // cooldown to prevent spam refresh
    });

}, 15000);


// ===== VISIBILITY + FOCUS SYNC =====
// Refresh data when user returns to tab or refocuses window
let focusLock = false;

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {

        if (focusLock) return;
        focusLock = true;

        loadNotes(currentSearch).finally(() => {
            setTimeout(() => focusLock = false, 2000);
        });
    }
});

window.addEventListener("focus", () => {

    if (focusLock) return;
    focusLock = true;

    loadNotes(currentSearch).finally(() => {
        setTimeout(() => focusLock = false, 2000);
    });
});
