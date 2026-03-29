// ===== GLOBAL STATE =====
let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null;

// 🔍 Unified filter state
let currentSearch = "";
let currentTag = null;

// 🔥 Bulk selection state
let selectedNotes = new Set();
let selectMode = false; // toggles checkbox mode

// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    let notes;

    if (window.isTrashPage) {
        notes = await getTrashNotes();
    } else {
        notes = search
            ? await getNotes(search)
            : await getNotes();
    }

    const isArchivePage = window.isArchivePage;

    // Archive filtering (skip trash)
    if (!window.isTrashPage) {
        notes = notes.filter(n => isArchivePage ? n.archived : !n.archived);
    }

    // Keep pin sorting (skip trash)
    if (!window.isTrashPage) {
        notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    }

    allNotes = notes;

    applyFilters(); // Always go through filter system
}

// ===== DATE FORMATTING =====
function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    return date.toLocaleString(); // simple + clean
}

// ===== 🔥 IMPROVED APPLY FILTERS (SEARCH + TAG + RANKING) =====
function applyFilters() {
    const terms = currentSearch.split(/\s+/).filter(Boolean);

    let filtered = allNotes.filter(note => {
        const title = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tags = (note.tags || []).map(t => t.toLowerCase());

        const matchesSearch = terms.length === 0 || terms.every(term =>
            title.includes(term) ||
            content.includes(term) ||
            tags.some(tag => tag.includes(term))
        );

        const matchesTag = currentTag
            ? (note.tags || []).includes(currentTag)
            : true;

        return matchesSearch && matchesTag;
    });

    // 🔥 Relevance sorting
    if (terms.length > 0) {
        filtered.sort((a, b) => {
            const score = (note) => {
                let s = 0;
                const title = (note.title || "").toLowerCase();
                const content = (note.content || "").toLowerCase();
                const tags = (note.tags || []).join(" ").toLowerCase();

                terms.forEach(term => {
                    if (title.includes(term)) s += 3;
                    if (content.includes(term)) s += 2;
                    if (tags.includes(term)) s += 1;
                });

                return s;
            };

            return score(b) - score(a);
        });
    }

    renderNotes(filtered);
}

// ===== SEARCH (HYBRID: BACKEND + INSTANT UI) =====
document.getElementById("searchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    currentSearch = query;

    // ⚡ Instant UI update
    applyFilters();

    // ⏳ Backend refresh (debounced)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadNotes(query);
    }, 300);
});

// ===== RENDER NOTES =====
function renderNotes(notes) {
    const container = document.getElementById("notesContainer");
    container.innerHTML = "";

    const isArchivePage = window.isArchivePage;
    const isTrashPage = window.isTrashPage;

    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note";
        div.draggable = !isTrashPage;
        div.dataset.id = note._id;

        // ===== 🔥 BULK SELECTION CHECKBOX =====
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "note-checkbox";
        checkbox.checked = selectedNotes.has(note._id);
        checkbox.style.display = selectMode ? "inline-block" : "none";
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedNotes.add(note._id);
            else selectedNotes.delete(note._id);

            const allCheckboxes = document.querySelectorAll(".note-checkbox");
            document.getElementById("selectAllNotes").checked =
                Array.from(allCheckboxes).every(cb => cb.checked);
        });
        div.appendChild(checkbox);

        // ===== NOTE CONTENT =====
        const contentContainer = document.createElement("div");
        contentContainer.className = "note-inner";

        const titleEl = document.createElement("h3");
        titleEl.textContent = note.title || "Untitled";

        const contentEl = document.createElement("div");
        contentEl.className = "note-content";
        contentEl.innerHTML = note.content || "";

        const tagsEl = document.createElement("div");
        tagsEl.className = "tags";
        (note.tags || []).forEach(tag => {
            const span = document.createElement("span");
            span.textContent = tag;
            span.addEventListener("click", () => filterByTag(tag));
            tagsEl.appendChild(span);
        });

        const updatedEl = document.createElement("small");
        updatedEl.className = "note-updated";
        updatedEl.textContent = note.updated_at ? `Last edited: ${formatDate(note.updated_at)}` : "";

        const actionsEl = document.createElement("div");
        actionsEl.className = "note-actions";

        if (isTrashPage) {
            const restoreBtn = document.createElement("button");
            restoreBtn.textContent = "♻️ Restore";
            restoreBtn.onclick = () => restoreNoteAction(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "❌ Delete";
            deleteBtn.onclick = () => permanentDeleteNoteAction(note._id);

            actionsEl.appendChild(restoreBtn);
            actionsEl.appendChild(deleteBtn);
        } else {
            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.onclick = () => editNote(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => deleteNoteAction(note._id);

            const pinBtn = document.createElement("button");
            pinBtn.textContent = "📌";
            pinBtn.onclick = () => togglePinAction(note._id);

            const archiveBtn = document.createElement("button");
            archiveBtn.textContent = isArchivePage ? "↩️" : "📦";
            archiveBtn.onclick = () => toggleArchiveAction(note._id);

            actionsEl.append(editBtn, deleteBtn, pinBtn, archiveBtn);
        }

        contentContainer.append(titleEl, contentEl, tagsEl, updatedEl, actionsEl);
        div.appendChild(contentContainer);

        // ===== DRAG EVENTS =====
        if (!isTrashPage) {
            div.addEventListener("dragstart", () => {
                draggedNoteId = note._id;
                div.classList.add("dragging");
            });

            div.addEventListener("dragend", () => {
                draggedNoteId = null;
                div.classList.remove("dragging");
            });

            div.addEventListener("dragover", (e) => {
                e.preventDefault();
                div.classList.add("drag-over");
            });

            div.addEventListener("dragleave", () => {
                div.classList.remove("drag-over");
            });

            div.addEventListener("drop", async () => {
                div.classList.remove("drag-over");
                if (!draggedNoteId || draggedNoteId === note._id) return;
                await reorderNotesAction(draggedNoteId, note._id);
            });
        }

        if (note.pinned) div.classList.add("pinned");

        container.appendChild(div);
    });
}

// ===== DRAG REORDER =====
async function reorderNotesAction(draggedId, targetId) {
    let notes = [...allNotes];

    const draggedIndex = notes.findIndex(n => n._id === draggedId);
    const targetIndex = notes.findIndex(n => n._id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [movedNote] = notes.splice(draggedIndex, 1);
    notes.splice(targetIndex, 0, movedNote);

    allNotes = notes;

    const orderedIds = notes.map(n => n._id);
    await reorderNotes(orderedIds);

    applyFilters();
}

// ===== CREATE NOTE =====
async function createNoteAction() {
    const titleEl = document.getElementById("noteTitle");
    const contentEl = document.getElementById("noteContent");

    const title = (titleEl.value || "").trim();
    const content = (contentEl.innerHTML || "").trim();

    if (!title && !content) {
        alert("Note cannot be empty!");
        return;
    }

    try {
        const newNote = await createNote(title, content, []);
        // Add new note locally to allNotes so UI updates instantly
        allNotes.push({
            _id: newNote._id,
            title: newNote.title,
            content: newNote.content,
            tags: newNote.tags,
            pinned: false,
            archived: false,
            trashed: false,
            position: allNotes.length,
            created_at: newNote.created_at,
            updated_at: newNote.updated_at
        });

        // Reset input fields
        titleEl.value = "";
        contentEl.innerHTML = "";

        // Refresh notes UI
        applyFilters();
    } catch (err) {
        console.error("Failed to create note:", err);
        alert("Failed to create note. See console for details.");
    }
}

// ===== DELETE NOTE =====
async function deleteNoteAction(id) {
    if (!confirm("Delete this note?")) return;
    await deleteNote(id);
    await loadNotes(currentSearch);
}

// ===== PIN NOTE =====
async function togglePinAction(id) {
    await togglePin(id);
    await loadNotes(currentSearch);
}

// ===== ARCHIVE NOTE =====
async function toggleArchiveAction(id) {
    await toggleArchive(id);
    await loadNotes(currentSearch);
}

// ===== EDIT NOTE =====
async function editNote(id) {
    const note = allNotes.find(n => n._id === id);
    if (!note) return;

    const titleEl = document.getElementById("noteTitle");
    const contentEl = document.getElementById("noteContent");

    titleEl.value = note.title || "";
    contentEl.innerHTML = note.content || "";

    document.getElementById("addNoteBtn").onclick = async () => {
        const updatedTitle = (titleEl.value || "").trim();
        const updatedContent = (contentEl.innerHTML || "").trim();

        if (!updatedTitle && !updatedContent) {
            alert("Note cannot be empty!");
            return;
        }

        try {
            const updatedNote = await updateNote(id, updatedTitle, updatedContent, note.tags || []);
            // Update local note
            Object.assign(note, {
                title: updatedTitle,
                content: updatedContent,
                updated_at: new Date().toISOString()
            });

            // Reset input fields
            titleEl.value = "";
            contentEl.innerHTML = "";

            // Restore button to create mode
            document.getElementById("addNoteBtn").onclick = createNoteAction;

            applyFilters();
        } catch (err) {
            console.error("Failed to update note:", err);
            alert("Failed to update note. See console for details.");
        }
    };
}

// ===== TRASH ACTIONS =====
async function restoreNoteAction(id) {
    await restoreNote(id);
    await loadNotes(currentSearch);
}

async function permanentDeleteNoteAction(id) {
    if (!confirm("Permanently delete this note?")) return;
    await deleteNotePermanently(id);
    await loadNotes(currentSearch);
}

// ===== TAG FILTER =====
function filterByTag(tag) {
    currentTag = currentTag === tag ? null : tag;
    applyFilters();
}

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
    await Promise.all(ids.map(id => deleteNoteAction(id)));
    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;
});

document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");
    const ids = Array.from(selectedNotes);
    await Promise.all(ids.map(id => toggleArchiveAction(id)));
    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;
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

// ===== THEME TOGGLE =====
function toggleTheme() {
    document.body.classList.toggle("light");
}

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNoteAction);
loadNotes();
