// ===== CACHED DOM ELEMENTS =====
const selectAllNotesEl = document.getElementById("selectAllNotes");
const bulkOptionsEl = document.getElementById("bulkOptions");
const shortcutsListEl = document.getElementById("shortcutsList");
const toggleShortcutsBtn = document.getElementById("toggleShortcuts");
const sidebarEl = document.querySelector(".sidebar");
const menuBtnEl = document.getElementById("mobileMenuBtn");

// ===== BULK ACTIONS =====
selectAllNotesEl?.addEventListener("change", (e) => {
    const checkboxes = checkboxCache;

    selectedNotes.clear();

    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;

        const id = cb.dataset.id || cb.closest(".note")?.dataset.id;

        if (e.target.checked && id) {
            selectedNotes.add(id);
        }
    });
});

document.getElementById("bulkDelete")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);

    try {
        await bulkDelete(ids);
        showToast("Notes deleted", "success");
    } catch (err) {
        showToast(err.message, "error");
    }

    allNotes = allNotes.filter(n => !selectedNotes.has(n._id));

    selectedNotes.clear();
    if (selectAllNotesEl) selectAllNotesEl.checked = false;

    applyFilters();
});

document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);
    if (!ids.length) return;

    await bulkArchive(ids);

    allNotes.forEach(n => {
        if (selectedNotes.has(n._id)) {
            n.archived = true; // FIX: no toggle
        }
    });

    selectedNotes.clear();
    if (selectAllNotesEl) selectAllNotesEl.checked = false;

    applyFilters();
});

// ===== SELECT MODE =====
document.getElementById("selectModeBtn")?.addEventListener("click", () => {
    selectMode = !selectMode;

    if (bulkOptionsEl) {
        bulkOptionsEl.style.display = selectMode ? "block" : "none";
    }

    if (!selectMode) {
        selectedNotes.clear();
        if (selectAllNotesEl) selectAllNotesEl.checked = false;
    }

    document.querySelectorAll(".note-checkbox").forEach(cb => {
        cb.style.display = selectMode ? "inline-block" : "none";
        if (!selectMode) cb.checked = false;
    });
});

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

quickNoteInput?.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const value = quickNoteInput.value.trim();
        if (!value) return;

        await createQuickNote(value);
        quickNoteInput.value = "";
    }
});

// ===== ARCHIVE DROP ZONE =====
const archiveZone = document.getElementById("archiveDropZone");

if (archiveZone) {
    archiveZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        archiveZone.classList.add("active");
    });

    archiveZone.addEventListener("dragleave", () => {
        archiveZone.classList.remove("active");
    });

    archiveZone.addEventListener("drop", async (e) => {
        e.preventDefault();

        archiveZone.classList.remove("active");

        if (!draggedNoteId) return;

        await archiveNote(draggedNoteId);
        draggedNoteId = null;

        safeLoadNotes(); // FIX: prevent spam reloads
    });
}

// ===== LOAD GUARD (performance fix) =====
let isRefreshing = false;

async function safeLoadNotes(search = currentSearch) {
    if (isRefreshing) return;
    isRefreshing = true;

    try {
        await loadNotes(search);
    } finally {
        isRefreshing = false;
    }
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
    const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);

    if (isTyping && e.key !== "Escape") return;

    const ctrl = e.ctrlKey || e.metaKey;

    // CREATE NOTE
    if (ctrl && e.key === "Enter") {
        e.preventDefault();
        createNoteAction();
    }

    // SEARCH
    if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("searchInput")?.focus();
    }

    // SELECT MODE (FIX: was CTRL+A conflict)
    if (ctrl && e.key.toLowerCase() === "m") {
        e.preventDefault();
        document.getElementById("selectModeBtn")?.click();
    }

    // DELETE
    if (e.key === "Delete" && selectedNotes.size > 0) {
        e.preventDefault();
        document.getElementById("bulkDelete")?.click();
    }

    // DUPLICATE
    if (ctrl && e.key.toLowerCase() === "d") {
        if (selectedNotes.size === 1) {
            e.preventDefault();
            const id = Array.from(selectedNotes)[0];
            duplicateNote(id);
        }
    }

    // ESCAPE
    if (e.key === "Escape") {
        if (selectMode) {
            document.getElementById("cancelSelectBtn")?.click();
        }

        const activeNote = document.querySelector(".note.editing");
        if (activeNote) closeEditMode(activeNote);
    }
});

// ===== NOTE HISTORY =====
async function openHistory(noteId) {
    const history = await getNoteHistory(noteId);

    const list = document.getElementById("historyList");
    if (!list) return;

    list.innerHTML = "";

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

    document.getElementById("historyModal")?.classList.remove("hidden");
}

// ===== SORT =====
document.getElementById("sortRecentBtn")?.addEventListener("click", () => {
    sortMode = sortMode === "recent" ? "default" : "recent";

    document.getElementById("sortRecentBtn")?.classList.toggle("active");

    safeLoadNotes(currentSearch);
});

// ===== SHORTCUTS PANEL =====
toggleShortcutsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    shortcutsListEl?.classList.toggle("hidden");
});

// ===== MOBILE SIDEBAR =====
menuBtnEl?.addEventListener("click", () => {
    sidebarEl?.classList.toggle("active");
});

// ===== GLOBAL CLICK HANDLER (FIXED MERGED VERSION) =====
document.addEventListener("click", (e) => {
    // SIDEBAR CLOSE
    if (sidebarEl?.classList.contains("active")) {
        const inside = sidebarEl.contains(e.target);
        const btn = menuBtnEl?.contains(e.target);

        if (!inside && !btn) {
            sidebarEl.classList.remove("active");
        }
    }

    // SHORTCUTS CLOSE
    if (shortcutsListEl && !shortcutsListEl.classList.contains("hidden")) {
        const inside = shortcutsListEl.contains(e.target);
        const toggle = e.target === toggleShortcutsBtn;

        if (!inside && !toggle) {
            shortcutsListEl.classList.add("hidden");
        }
    }
});

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNoteAction);
loadNotes();

// ===== SAFETY NET =====
window.addEventListener("load", () => {
    setTimeout(() => {
        if (!Array.isArray(allNotes)) {
            console.warn("Recovery: forcing reload");
            safeLoadNotes();
        }
    }, 500);
});

// ===== EXPORT =====
document.getElementById("exportBtn")?.addEventListener("click", async () => {
    try {
        const data = await exportNotes();

        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json"
        });

        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "notes-export.json";
        a.click();

        URL.revokeObjectURL(url);

        showToast("Notes exported 📤");
    } catch (err) {
        console.error(err);
        alert("Export failed");
    }
});

// ===== IMPORT =====
document.getElementById("importInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        await importNotes(data);

        showToast("Notes imported 📥");
        safeLoadNotes();
    } catch (err) {
        console.error(err);
        alert("Invalid file format");
    }

    e.target.value = "";
});
