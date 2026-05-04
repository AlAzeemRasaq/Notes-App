// ===== CACHED DOM ELEMENTS =====
const selectAllNotesEl = document.getElementById("selectAllNotes");
const bulkOptionsEl = document.getElementById("bulkOptions");
const shortcutsListEl = document.getElementById("shortcutsList");
const toggleShortcutsBtn = document.getElementById("toggleShortcuts");
const sidebarEl = document.querySelector(".sidebar");
const menuBtnEl = document.getElementById("mobileMenuBtn");

// ===== BULK ACTIONS =====

// Toggle "select all" checkbox behavior
selectAllNotesEl?.addEventListener("change", (e) => {
    const checkboxes = checkboxCache;

    // reset selection state
    selectedNotes.clear();

    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;

        // resolve note id from checkbox or parent note element
        const id = cb.dataset.id || cb.closest(".note")?.dataset.id;

        // if selecting all, add to selected set
        if (e.target.checked && id) {
            selectedNotes.add(id);
        }
    });
});


// ===== BULK DELETE =====
document.getElementById("bulkDelete")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);

    try {
        // backend bulk delete request
        await bulkDelete(ids);
        showToast("Notes deleted", "success");
    } catch (err) {
        showToast(err.message, "error");
    }

    // optimistic UI update (remove locally without reload)
    allNotes = allNotes.filter(n => !selectedNotes.has(n._id));

    // reset selection state
    selectedNotes.clear();
    if (selectAllNotesEl) selectAllNotesEl.checked = false;

    applyFilters();
});


// ===== BULK ARCHIVE =====
document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);
    if (!ids.length) return;

    // send bulk archive request to backend
    await bulkArchive(ids);

    // optimistic update: mark locally as archived
    allNotes.forEach(n => {
        if (selectedNotes.has(n._id)) {
            n.archived = true;
        }
    });

    // reset UI state
    selectedNotes.clear();
    if (selectAllNotesEl) selectAllNotesEl.checked = false;

    applyFilters();
});


// ===== SELECT MODE TOGGLE =====
// enables/disables checkbox selection UI
document.getElementById("selectModeBtn")?.addEventListener("click", () => {
    selectMode = !selectMode;

    // show/hide bulk action panel
    if (bulkOptionsEl) {
        bulkOptionsEl.style.display = selectMode ? "block" : "none";
    }

    // reset selection when turning off select mode
    if (!selectMode) {
        selectedNotes.clear();
        if (selectAllNotesEl) selectAllNotesEl.checked = false;
    }

    // show/hide individual checkboxes
    document.querySelectorAll(".note-checkbox").forEach(cb => {
        cb.style.display = selectMode ? "inline-block" : "none";
        if (!selectMode) cb.checked = false;
    });
});


// ===== CANCEL SELECT MODE =====
document.getElementById("cancelSelectBtn")?.addEventListener("click", () => {
    selectMode = false;

    if (bulkOptionsEl) bulkOptionsEl.style.display = "none";

    selectedNotes.clear();
    if (selectAllNotesEl) selectAllNotesEl.checked = false;

    document.querySelectorAll(".note-checkbox").forEach(cb => {
        cb.checked = false;
        cb.style.display = "none";
    });
});

// ===== QUICK NOTE INPUT =====
const quickNoteInput = document.getElementById("quickNoteInput");

// Create a new note when user presses Enter in the quick note input
quickNoteInput?.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const value = quickNoteInput.value.trim();
        if (!value) return;

        await createQuickNote(value);
        quickNoteInput.value = "";
    }
});

// ===== ARCHIVE DROP ZONE =====
// This creates a "drag into archive" UX (like Gmail-style archiving)

const archiveZone = document.getElementById("archiveDropZone");

if (archiveZone) {

    // ===== DRAG OVER =====
    // Enables dropping by preventing default browser behavior
    archiveZone.addEventListener("dragover", (e) => {
        e.preventDefault();

        // visual feedback for user
        archiveZone.classList.add("active");
    });

    // ===== DRAG LEAVE =====
    // Remove highlight when dragged item leaves zone
    archiveZone.addEventListener("dragleave", () => {
        archiveZone.classList.remove("active");
    });

    // ===== DROP ACTION =====
    archiveZone.addEventListener("drop", async (e) => {
        e.preventDefault();

        archiveZone.classList.remove("active");

        // guard: ensure something is actually being dragged
        if (!draggedNoteId) return;

        // archive the dragged note via API
        await archiveNote(draggedNoteId);

        // reset drag state
        draggedNoteId = null;

        // safely refresh UI after backend update
        safeLoadNotes();
    });
}


// ===== LOAD GUARD (performance + race-condition protection) =====
// Prevents multiple overlapping reloads of notes (important during drag/drop,
// autosync, search, and visibility change events)

let isRefreshing = false;

async function safeLoadNotes(search = currentSearch) {

    // if a refresh is already in progress, ignore new request
    if (isRefreshing) return;
    isRefreshing = true;

    try {
        // defensive check: ensure global loader exists
        if (typeof window.loadNotes === "function") {
            await window.loadNotes(search);
        }

    } finally {
        // always reset flag even if request fails
        isRefreshing = false;
    }
}

// expose globally (important for cross-file calls)
window.safeLoadNotes = safeLoadNotes;

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
    const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);

    if (isTyping && e.key !== "Escape") return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === "Enter") { // pressing Ctrl+Enter creates a new note
        e.preventDefault();
        createNoteAction();
    }

    if (ctrl && e.key.toLowerCase() === "k") { // pressing Ctrl+K focuses the search bar
        e.preventDefault();
        document.getElementById("searchInput")?.focus();
    }

    if (ctrl && e.key.toLowerCase() === "m") { // pressing Ctrl+M toggles select mode
        e.preventDefault();
        document.getElementById("selectModeBtn")?.click();
    }

    if (e.key === "Delete" && selectedNotes.size > 0) { // pressing Delete key triggers bulk delete if notes are selected
        e.preventDefault();
        document.getElementById("bulkDelete")?.click();
    }

    if (ctrl && e.key.toLowerCase() === "d") { // pressing Ctrl+D duplicates the selected note (only if exactly one note is selected)
        if (selectedNotes.size === 1) {
            e.preventDefault();
            const id = Array.from(selectedNotes)[0];
            duplicateNote(id);
        }
    }

    if (e.key === "Escape") { // pressing Escape key cancels edit mode or exits select mode
        if (selectMode) {
            document.getElementById("cancelSelectBtn")?.click();
        }

        const activeNote = document.querySelector(".note.editing");
        if (activeNote) closeEditMode(activeNote);
    }
});

// ===== NOTE HISTORY =====
// Opens version history modal for a specific note
async function openHistory(noteId) {

    // fetch version history from backend
    const history = await getNoteHistory(noteId);

    const list = document.getElementById("historyList");
    if (!list) return;

    // clear previous history entries
    list.innerHTML = "";

    // show newest versions first (reverse chronological)
    history.reverse().forEach(version => {
        const div = document.createElement("div");
        div.className = "history-item";

        div.innerHTML = `
            <strong>${version.title}</strong>
            <p>${version.content}</p>
            <small>${new Date(version.updated_at).toLocaleString()}</small>
        `;

        list.appendChild(div);
    });

    // open modal UI
    document.getElementById("historyModal")?.classList.remove("hidden");
}


// ===== CLOSE HISTORY MODAL =====
function closeHistory() {
    document.getElementById("historyModal").classList.add("hidden");
}


// ===== SORT TOGGLE =====
// toggles between default and "recent-first" sorting
document.getElementById("sortRecentBtn")?.addEventListener("click", () => {

    // toggle sorting mode state
    sortMode = sortMode === "recent" ? "default" : "recent";

    // UI feedback (active button state)
    document.getElementById("sortRecentBtn")?.classList.toggle("active");

    // reload notes safely (prevents race conditions)
    safeLoadNotes(currentSearch);
});


// ===== SHORTCUTS PANEL =====
// toggles visibility of keyboard shortcuts/help panel
toggleShortcutsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    shortcutsListEl?.classList.toggle("hidden");
});


// ===== MOBILE SIDEBAR =====
// mobile hamburger menu toggle (responsive UI)
menuBtnEl?.addEventListener("click", () => {
    sidebarEl?.classList.toggle("active");
});

// ===== GLOBAL CLICK HANDLER =====
// Handles closing of UI overlays when clicking outside them
// (used for sidebar + shortcuts panel)

document.addEventListener("click", (e) => {

    // ===== MOBILE SIDEBAR AUTO-CLOSE =====
    // If sidebar is open, close it when clicking outside
    if (sidebarEl?.classList.contains("active")) {

        const insideSidebar = sidebarEl.contains(e.target);
        const clickedMenuBtn = menuBtnEl?.contains(e.target);

        // close only if click is outside both sidebar and menu button
        if (!insideSidebar && !clickedMenuBtn) {
            sidebarEl.classList.remove("active");
        }
    }


    // ===== SHORTCUTS PANEL AUTO-CLOSE =====
    // If shortcuts panel is visible, close when clicking outside
    if (shortcutsListEl && !shortcutsListEl.classList.contains("hidden")) {

        const insidePanel = shortcutsListEl.contains(e.target);
        const clickedToggle = e.target === toggleShortcutsBtn;

        // close only if click is outside panel and toggle button
        if (!insidePanel && !clickedToggle) {
            shortcutsListEl.classList.add("hidden");
        }
    }
});

// ===== INIT (FIXED BOOTSTRAP) =====
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("addNoteBtn")
        ?.addEventListener("click", createNoteAction);

    // SAFE STARTUP (fixes your crash)
    if (typeof window.loadNotes === "function") {
        window.loadNotes();
    } else {
        console.warn("loadNotes not ready yet — retrying...");
        setTimeout(() => window.safeLoadNotes?.(), 200);
    }
});

// ===== SAFETY NET =====
window.addEventListener("load", () => {
    setTimeout(() => {
        if (!Array.isArray(allNotes)) {
            console.warn("Recovery: forcing reload");
            safeLoadNotes();
        }
    }, 500);
});

// ===== EXPORT NOTES =====
// Downloads all notes as a JSON backup file (client-side export)

document.getElementById("exportBtn")?.addEventListener("click", async () => {
    try {

        // fetch full export payload from backend
        const data = await exportNotes();

        // convert JS object into downloadable JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json"
        });

        // create temporary download URL
        const url = URL.createObjectURL(blob);

        // trigger browser download
        const a = document.createElement("a");
        a.href = url;
        a.download = "notes-export.json";
        a.click();

        // cleanup memory
        URL.revokeObjectURL(url);

        showToast("Notes exported 📤");

    } catch (err) {
        console.error(err);
        alert("Export failed");
    }
});


// ===== IMPORT NOTES =====
// Allows user to restore notes from a JSON backup file

document.getElementById("importInput")?.addEventListener("change", async (e) => {

    const file = e.target.files[0];
    if (!file) return;

    try {
        // read file content
        const text = await file.text();

        // parse JSON safely
        const data = JSON.parse(text);

        // send to backend for import processing
        await importNotes(data);

        showToast("Notes imported 📥");

        // refresh UI after import
        safeLoadNotes();

    } catch (err) {
        console.error(err);
        alert("Invalid file format");
    }

    // reset file input so same file can be re-uploaded if needed
    e.target.value = "";
});


// ===== SAFE ACTION WRAPPER =====
// Generic helper to wrap async actions with error handling
// prevents repeating try/catch everywhere in UI logic

async function safeAction(fn) {
    try {
        return await fn();
    } catch (err) {
        showToast(err.message || "Action failed", "error");
    }
}
