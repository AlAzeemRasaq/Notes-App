// ===== BULK ACTIONS =====
document.getElementById("selectAllNotes")?.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".note-checkbox");
    selectedNotes.clear();
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) selectedNotes.add(cb.closest(".note").dataset.id);
    });
});

document.getElementById("bulkDelete")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);

    await bulkDelete(ids);

    allNotes = allNotes.filter(n => !selectedNotes.has(n._id));

    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;

    applyFilters();
});

document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes || []);
    if (!ids.length) return;
    await bulkArchive(ids);

    allNotes.forEach(n => {
        if (selectedNotes.has(n._id)) n.archived = !n.archived;
    });

    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;

    applyFilters();
});

// ===== SELECT MODE TOGGLE =====
document.getElementById("selectModeBtn")?.addEventListener("click", () => {
    selectMode = !selectMode;
    document.getElementById("bulkOptions").style.display = selectMode ? "block" : "none";

    if (!selectMode) {
        selectedNotes.clear();
        document.getElementById("selectAllNotes").checked = false;
    }

    document.querySelectorAll(".note-checkbox").forEach(cb => {
        cb.style.display = selectMode ? "inline-block" : "none";
        if (!selectMode) cb.checked = false;
    });
});

document.getElementById("cancelSelectBtn")?.addEventListener("click", () => {
    selectMode = false;
    document.getElementById("bulkOptions").style.display = "none";
    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;
    document.querySelectorAll(".note-checkbox").forEach(cb => {
        cb.checked = false;
        cb.style.display = "none";
    });
});

// ===== QUICK NOTE INPUT HANDLER =====
const quickNoteInput = document.getElementById("quickNoteInput");

if (quickNoteInput) {
    quickNoteInput.addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
            const value = quickNoteInput.value.trim();

            if (!value) return;

            await createQuickNote(value);

            quickNoteInput.value = ""; // clear input
        }
    });
}

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

        loadNotes(); // ✅ single source of truth
    });
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
    // Prevent shortcuts while typing in inputs (except Escape)
    const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);

    // Allow Escape always
    if (isTyping && e.key !== "Escape") return;

    // CTRL / CMD detection
    const ctrl = e.ctrlKey || e.metaKey;

    // ===== CREATE NOTE =====
    if (ctrl && e.key === "Enter") {
        e.preventDefault();
        createNoteAction();
    }

    // ===== FOCUS SEARCH =====
    if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("searchInput")?.focus();
    }

    // ===== TOGGLE SELECT MODE =====
    if (ctrl && e.key.toLowerCase() === "a") {
        e.preventDefault();
        document.getElementById("selectModeBtn")?.click();
    }

    // ===== DELETE SELECTED =====
    if (e.key === "Delete") {
        if (selectedNotes.size > 0) {
            e.preventDefault();
            document.getElementById("bulkDelete")?.click();
        }
    }

    // ===== DUPLICATE (if one selected) =====
    if (ctrl && e.key.toLowerCase() === "d") {
        if (selectedNotes.size === 1) {
            e.preventDefault();
            const id = Array.from(selectedNotes)[0];
            duplicateNote(id);
        }
    }

    // ===== ESCAPE (exit modes) =====
    if (e.key === "Escape") {
        // Exit select mode
        if (selectMode) {
            document.getElementById("cancelSelectBtn")?.click();
        }

        // Exit editing
        const activeNote = document.querySelector(".note.editing");
        if (activeNote) {
            closeEditMode(activeNote);
        }
    }
});

// ===== NOTE HISTORY =====
async function openHistory(noteId) {
    const history = await getNoteHistory(noteId);

    const list = document.getElementById("historyList");
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

    document.getElementById("historyModal").classList.remove("hidden");
}

// ===== SORTING =====
document.getElementById("sortRecentBtn")?.addEventListener("click", () => {
    sortMode = sortMode === "recent" ? "default" : "recent";

    document.getElementById("sortRecentBtn").classList.toggle("active");

    loadNotes(currentSearch);
});

// ===== SHORTCUTS TOGGLE =====
const toggleShortcutsBtn = document.getElementById("toggleShortcuts");
const shortcutsList = document.getElementById("shortcutsList");

toggleShortcutsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    shortcutsList.classList.toggle("hidden");
});

// close when clicking outside
document.addEventListener("click", (e) => {
    if (!shortcutsList) return;

    if (!shortcutsList.contains(e.target) && e.target !== toggleShortcutsBtn) {
        shortcutsList.classList.add("hidden");
    }
});

// ===== MOBILE SIDEBAR TOGGLE =====
document.addEventListener("DOMContentLoaded", () => {
    const menuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.querySelector(".sidebar");

    if (!menuBtn || !sidebar) return;

    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("active");
    });
});
document.addEventListener("click", (e) => {
    const sidebar = document.querySelector(".sidebar");
    const menuBtn = document.getElementById("mobileMenuBtn");

    if (!sidebar.classList.contains("active")) return;

    const clickedInside = sidebar.contains(e.target);
    const clickedButton = menuBtn.contains(e.target);

    if (!clickedInside && !clickedButton) {
        sidebar.classList.remove("active");
    }
});

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNoteAction);
loadNotes();

// ===== SAFETY NET RECOVERY =====
window.addEventListener("load", () => {
    setTimeout(() => {
        if (!allNotes || !Array.isArray(allNotes)) {
            console.warn("Recovery: forcing reload");
            loadNotes();
        }
    }, 500);
});