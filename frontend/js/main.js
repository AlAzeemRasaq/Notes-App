// ===== GLOBAL STATE =====
let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null;
let currentRequestId = 0; // 🆕 tracks latest request

// 🔍 Unified filter state
let currentSearch = "";
let currentTag = null;

// 🔥 Bulk selection state
let selectedNotes = new Set();
let selectMode = false; // toggles checkbox mode

// ===== UI STATES =====
function showLoading() {
    const container = document.getElementById("notesContainer");
    container.innerHTML = `<div class="state-message">Loading notes...</div>`;
}

function showEmpty(message = "No notes yet") {
    const container = document.getElementById("notesContainer");
    container.innerHTML = `<div class="state-message">${message}</div>`;
}

// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    const requestId = ++currentRequestId; // 🆕 capture this request's ID

    showLoading();

    let notes;

    if (window.isTrashPage) {
        notes = await getTrashNotes();
    } else {
        notes = search
            ? await getNotes(search)
            : await getNotes();
    }

    // 🛑 IGNORE outdated responses
    if (requestId !== currentRequestId) return;

    const isArchivePage = window.isArchivePage;

    // Archive filtering and keep pin sorting (skip trash)
    if (!window.isTrashPage) {
        notes = notes.filter(n => isArchivePage ? n.archived : !n.archived);
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

    // 🔥 EMPTY STATES
    if (allNotes.length === 0) {
        if (window.isTrashPage) {
            showEmpty("Trash is empty 🗑️");
        } else if (window.isArchivePage) {
            showEmpty("No archived notes 📦");
        } else {
            showEmpty("No notes yet. Create one above ✍️");
        }
        return;
    }

    if (filtered.length === 0) {
        showEmpty("No results found 🔍");
        return;
    }

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

    // ⚡ Instant UI update (local filtering)
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
        allNotes.unshift({              // New notes appear at the top instantly
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

    // 🧠 Remove locally
    allNotes = allNotes.filter(n => n._id !== id);

    applyFilters();
}

// ===== PIN NOTE =====
async function togglePinAction(id) {
    await togglePin(id);

    const note = allNotes.find(n => n._id === id);
    if (note) note.pinned = !note.pinned;

    applyFilters();
}

// ===== ARCHIVE NOTE =====
async function toggleArchiveAction(id) {
    await toggleArchive(id);

    const note = allNotes.find(n => n._id === id);
    if (note) note.archived = !note.archived;

    applyFilters();
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

    // remove from trash view
    allNotes = allNotes.filter(n => n._id !== id);

    applyFilters();
}

async function permanentDeleteNoteAction(id) {
    if (!confirm("Permanently delete this note?")) return;

    await deleteNotePermanently(id);

    allNotes = allNotes.filter(n => n._id !== id);

    applyFilters();
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

    await Promise.all(ids.map(id => deleteNote(id)));

    // 🧠 remove locally
    allNotes = allNotes.filter(n => !selectedNotes.has(n._id));

    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;

    applyFilters();
});

document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);

    await Promise.all(ids.map(id => toggleArchive(id)));

    // 🧠 update locally
    allNotes.forEach(n => {
        if (selectedNotes.has(n._id)) {
            n.archived = !n.archived;
        }
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

// ===== THEME TOGGLE =====
function toggleTheme() {
    document.body.classList.toggle("light");
}

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNoteAction);
loadNotes();
