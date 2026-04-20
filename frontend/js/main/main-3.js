// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    console.log("LOAD NOTES:", window.location.href);

    const requestId = ++currentRequestId;

    currentPage = 1;
    hasMore = true;

    let notes = [];

    // 🧹 RESET UI STATE WHEN SWITCHING PAGES
    currentSearch = search || "";
    currentTag = null;
    selectedNotes.clear();
    selectMode = false;

    // ===== SHOW LOADING ONLY WHEN NEEDED =====
    if (!search && !isTrashPage() && !isArchivePage()) {
        showLoading();
    }

    try {
        // ===== FETCH DATA BY PAGE TYPE =====
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

        else {
            notes = await getNotes(search || "");
        }
    } catch (err) {
        console.error("Failed to load notes:", err);
        showEmpty("Failed to load notes ❌");
        return;
    }

    // ===== IGNORE OLD REQUESTS =====
    if (requestId !== currentRequestId) return;

    // ===== SAFETY CHECK =====
    if (!Array.isArray(notes)) {
        console.warn("Invalid notes response:", notes);
        notes = [];
    }

    // ===== SORT PINS FIRST =====
    notes.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        if (a.pinned && b.pinned) return (b.pin_order || 0) - (a.pin_order || 0);
        return 0;
    });

    allNotes = notes;

    // IMPORTANT: prevent overwrite bugs on special pages
    if (isTrashPage() || isArchivePage()) {
        applyFilters();
        return;
    }

    // ===== CACHE ONLY FOR MAIN INDEX =====
    if (!search && !isTrashPage() && !isArchivePage()) {
        try {
            localStorage.setItem("notes_cache", JSON.stringify(notes));
        } catch (err) {
            console.warn("Cache write failed:", err);
        }
    }

    // ===== EMPTY STATE SAFETY =====
    if (notes.length === 0) {
        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes found ✍️");
    }


    console.log("PAGE CHECK:", {
        archive: isArchivePage(),
        trash: isTrashPage(),
        notes,
        type: typeof notes,
        isArray: Array.isArray(notes)
    });
    applyFilters();
}

// ===== SEARCH (HYBRID: BACKEND + INSTANT UI) =====
document.getElementById("searchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    currentSearch = query;

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        loadNotes(query);
    }, 300);
});

// ===== ADVANCED SEARCH PARSER =====
function parseSearch(query) {
    const filters = {
        text: [],
        tag: null,
        pinned: null,
        archived: null
    };

    query.split(/\s+/).forEach(term => {
        if (!term) return;

        if (term.startsWith("tag:")) {
            filters.tag = term.replace("tag:", "").toLowerCase();
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
    });

    return filters;
}

// ===== TAG SUGGESTIONS =====
const tagInput = document.getElementById("tagInput");
const tagSuggestions = document.getElementById("tagSuggestions");

let allTags = [];

async function loadTags() {
    allTags = await getTags();
    if (!Array.isArray(allTags)) allTags = [];
}

tagInput?.addEventListener("input", () => {
    const value = tagInput.value.toLowerCase();

    if (!value) {
        tagSuggestions.style.display = "none";
        return;
    }

    const matches = allTags.filter(tag => tag.includes(value));

    tagSuggestions.innerHTML = "";

    matches.forEach(tag => {
        const div = document.createElement("div");
        div.textContent = tag;

        div.onclick = () => {
            tagInput.value = tag;
            tagSuggestions.style.display = "none";
        };

        tagSuggestions.appendChild(div);
    });

    tagSuggestions.style.display = matches.length ? "block" : "none";
});

// call once on load
document.addEventListener("DOMContentLoaded", () => {
    loadTags();
});

// ===== INFINITE SCROLL =====
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

        allNotes = [...allNotes, ...newNotes];
        applyFilters();

    } catch (err) {
        console.error("Pagination failed:", err);
    } finally {
        isLoadingMore = false;
    }
}

const debouncedLoadNotes = debounce((value) => {
    loadNotes(value);
}, 300);

// ===== COLLABORATION SYNC =====

// Track last sync time (basic version)
let lastSyncTime = Date.now();

// 🔁 Auto-refresh every 15s (lightweight sync)
setInterval(() => {
    // Don't spam while typing/editing
    if (document.querySelector(".note.editing")) return;

    console.log("Auto-sync: refreshing notes...");
    loadNotes(currentSearch);
}, 15000);


// 👁️ Refresh when user returns to tab (BEST UX)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("Tab active → syncing notes");
        loadNotes(currentSearch);
    }
});


// 🖱️ Optional: sync when window regains focus (extra safety)
window.addEventListener("focus", () => {
    console.log("Window focused → syncing notes");
    loadNotes(currentSearch);
});
