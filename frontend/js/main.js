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
    let url;

    if (window.isTrashPage) {
        url = "/notes/trash";
    } else {
        url = search
            ? `/notes?search=${encodeURIComponent(search)}`
            : "/notes";
    }

    let notes = await apiRequest(url);

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

// ===== 🔥 IMPROVED APPLY FILTERS (SEARCH + TAG + RANKING) =====
function applyFilters() {
    const terms = currentSearch.split(/\s+/).filter(Boolean);

    let filtered = allNotes.filter(note => {
        const title = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tags = (note.tags || []).map(t => t.toLowerCase());

        // Every search term must match somewhere
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

        const actionsEl = document.createElement("div");
        actionsEl.className = "note-actions";

        if (isTrashPage) {
            const restoreBtn = document.createElement("button");
            restoreBtn.textContent = "♻️ Restore";
            restoreBtn.onclick = () => restoreNote(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "❌ Delete";
            deleteBtn.onclick = () => permanentDeleteNote(note._id);

            actionsEl.appendChild(restoreBtn);
            actionsEl.appendChild(deleteBtn);
        } else {
            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.onclick = () => editNote(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => deleteNote(note._id);

            const pinBtn = document.createElement("button");
            pinBtn.textContent = "📌";
            pinBtn.onclick = () => togglePin(note._id);

            const archiveBtn = document.createElement("button");
            archiveBtn.textContent = isArchivePage ? "↩️" : "📦";
            archiveBtn.onclick = () => toggleArchive(note._id);

            actionsEl.append(editBtn, deleteBtn, pinBtn, archiveBtn);
        }

        contentContainer.append(titleEl, contentEl, tagsEl, actionsEl);
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
                await reorderNotes(draggedNoteId, note._id);
            });
        }

        if (note.pinned) div.classList.add("pinned");

        container.appendChild(div);
    });
}

// ===== DRAG REORDER =====
async function reorderNotes(draggedId, targetId) {
    let notes = [...allNotes];

    const draggedIndex = notes.findIndex(n => n._id === draggedId);
    const targetIndex = notes.findIndex(n => n._id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [movedNote] = notes.splice(draggedIndex, 1);
    notes.splice(targetIndex, 0, movedNote);

    allNotes = notes;

    applyFilters();
}

// ===== CREATE NOTE =====
async function createNote() {
    const title = document.getElementById("noteTitle").value;
    const content = document.getElementById("noteContent").innerHTML;

    await apiRequest("/notes", "POST", { title, content, tags: [] });

    document.getElementById("noteTitle").value = "";
    document.getElementById("noteContent").innerHTML = "";

    await loadNotes(currentSearch);
}

// ===== DELETE NOTE =====
async function deleteNote(id) {
    if (!confirm("Delete this note?")) return;
    await apiRequest(`/notes/${id}`, "DELETE");
    await loadNotes(currentSearch);
}

// ===== PIN NOTE =====
async function togglePin(id) {
    await apiRequest(`/notes/pin/${id}`, "PUT");
    await loadNotes(currentSearch);
}

// ===== ARCHIVE NOTE =====
async function toggleArchive(id) {
    await apiRequest(`/notes/archive/${id}`, "PUT");
    await loadNotes(currentSearch);
}

// ===== TAG FILTER =====
function filterByTag(tag) {
    currentTag = currentTag === tag ? null : tag;
    applyFilters();
}

// ===== THEME TOGGLE =====
function toggleTheme() {
    document.body.classList.toggle("light");
}

// ===== EDIT NOTE =====
async function editNote(id) {
    const note = allNotes.find(n => n._id === id);
    if (!note) return;

    document.getElementById("noteTitle").value = note.title || "";
    document.getElementById("noteContent").innerHTML = note.content || "";

    document.getElementById("addNoteBtn").onclick = async () => {
        const updatedTitle = document.getElementById("noteTitle").value;
        const updatedContent = document.getElementById("noteContent").innerHTML;

        await apiRequest(`/notes/${id}`, "PUT", { title: updatedTitle, content: updatedContent });

        document.getElementById("noteTitle").value = "";
        document.getElementById("noteContent").innerHTML = "";

        document.getElementById("addNoteBtn").onclick = createNote;

        await loadNotes(currentSearch);
    };
}

// ===== TRASH ACTIONS =====
async function restoreNote(id) {
    await apiRequest(`/notes/restore/${id}`, "PUT");
    await loadNotes(currentSearch);
}

async function permanentDeleteNote(id) {
    if (!confirm("Permanently delete this note?")) return;
    await apiRequest(`/notes/permanent/${id}`, "DELETE");
    await loadNotes(currentSearch);
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
    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;
});

document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");
    const ids = Array.from(selectedNotes);
    await Promise.all(ids.map(id => toggleArchive(id)));
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

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNote);
loadNotes();
