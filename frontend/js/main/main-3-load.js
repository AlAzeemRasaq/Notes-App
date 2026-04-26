console.log("showLoading:", typeof showLoading);

// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    const requestId = ++currentRequestId;

    currentPage = 1;
    hasMore = true;

    currentSearch = search || "";
    currentTag = null;
    selectedNotes.clear();
    selectMode = false;

    if (!search && !isTrashPage() && !isArchivePage()) {
        showLoading();
    }

    try {
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

        const response = await getNotes(search || "");

        // normalize early (avoid later checks)
        if (Array.isArray(response)) {
            allNotes = response;
        } else {
            allNotes = response?.notes || [];
        }

    } catch (err) {
        console.error("Failed to load notes:", err);
        showToast(err.message, "error");
        showEmpty("Failed to load notes ❌");
        return;
    }

    // IGNORE OLD REQUESTS
    if (requestId !== currentRequestId) return;

    if (!Array.isArray(allNotes)) allNotes = [];

    // ===== SORT PINS FIRST =====
    allNotes.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        if (a.pinned && b.pinned) return (b.pin_order || 0) - (a.pin_order || 0);
        return 0;
    });

    // ===== CACHE ONLY MAIN PAGE =====
    if (!search && !isTrashPage() && !isArchivePage()) {
        try {
            localStorage.setItem("notes_cache", JSON.stringify(allNotes));
        } catch (err) {
            console.warn("Cache write failed:", err);
        }
    }

    if (allNotes.length === 0) {
        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes found ✍️");
    }

    applyFilters();
}


// ===== SEARCH INPUT (OPTIMIZED) =====
const searchInput = document.getElementById("searchInput");

searchInput?.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();

    currentSearch = query;

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        loadNotes(query);
    }, 300);
});


// ===== SEARCH PARSER (OPTIMIZED LOOP) =====
function parseSearch(query) {
    const filters = {
        text: [],
        tag: null,
        pinned: null,
        archived: null
    };

    const parts = query.split(/\s+/);

    for (let i = 0; i < parts.length; i++) {
        const term = parts[i];
        if (!term) continue;

        if (term.startsWith("tag:")) {
            filters.tag = term.slice(4).toLowerCase();
        }
        else if (term === "pinned:true") {
            filters.pinned = true;
        }
        else if (term === "pinned:false") {
            filters.pinned = false;
        }
        else if (term === "archived:true") {
            filters.archived = true;
        }
        else if (term === "archived:false") {
            filters.archived = false;
        }
        else {
            filters.text.push(term.toLowerCase());
        }
    }

    return filters;
}


// ===== TAG SYSTEM =====
const tagInput = document.getElementById("tagInput");
const tagSuggestions = document.getElementById("tagSuggestions");

let allTags = [];

async function loadTags() {
    try {
        const data = await getTags();
        allTags = Array.isArray(data) ? data : [];
    } catch {
        allTags = [];
    }
}

tagInput?.addEventListener("input", () => {
    const value = tagInput.value.toLowerCase();

    if (!value) {
        tagSuggestions.style.display = "none";
        return;
    }

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

document.addEventListener("DOMContentLoaded", loadTags);


// ===== INFINITE SCROLL (SAFE GUARD + LESS WORK) =====
async function loadMoreNotes() {
    if (isArchivePage() || isTrashPage()) return;
    if (isLoadingMore || !hasMore) return;

    isLoadingMore = true;

    try {
        const newNotes = await getNotesPaginated(currentPage + 1);

        if (!Array.isArray(newNotes) || newNotes.length === 0) {
            hasMore = false;
            return;
        }

        currentPage++;

        allNotes = allNotes.concat(newNotes);

        applyFilters();

    } catch (err) {
        console.error("Pagination failed:", err);
    } finally {
        isLoadingMore = false;
    }
}


// ===== DEBOUNCED VERSION =====
const debouncedLoadNotes = debounce(loadNotes, 300);


// ===== AUTO SYNC (OPTIMIZED) =====
let syncBlocked = false;

setInterval(() => {
    if (syncBlocked) return;
    if (document.querySelector(".note.editing")) return;

    syncBlocked = true;

    loadNotes(currentSearch).finally(() => {
        setTimeout(() => {
            syncBlocked = false;
        }, 2000);
    });
}, 15000);


// ===== VISIBILITY + FOCUS SYNC (DEDUPED) =====
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
