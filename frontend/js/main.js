// ===== GLOBAL STATE =====
let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null;
let currentRequestId = 0; // 🆕 tracks latest request
window.addEventListener("DOMContentLoaded", () => {
    const search = document.getElementById("searchInput");
    if (search) {
        search.focus();
    }
});

// ===== AUTOSAVE STATE =====
let autosaveTimers = {};

// ===== DELETE UX STATE =====
let lastDeletedNote = null;
let undoTimeout = null;

// 🔍 Unified filter state
let currentSearch = "";
let currentTag = null;

// 🔥 Bulk selection state
let selectedNotes = new Set();
let selectMode = false; // toggles checkbox mode

// ===== EDIT HISTORY STACKS =====
const editHistory = {}; // { noteId: { undo: [], redo: [] } }

// ===== UI STATES =====
function showLoading() {
    const container = document.getElementById("notesContainer");
    container.innerHTML = `<div class="state-message">Loading notes...</div>`;
}

function showEmpty(message = "No notes yet") {
    const container = document.getElementById("notesContainer");
    container.innerHTML = `<div class="state-message">${message}</div>`;
}

// ===== MODAL HANDLING =====
const modal = document.getElementById("modal");
const modalOverlay = modal?.querySelector(".modal-overlay");
const modalCloseBtn = modal?.querySelector(".close-btn");

function openModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    setTimeout(() => modal.classList.add("active"), 10);
}

function closeModal() {
    if (!modal) return;
    modal.classList.remove("active");
    setTimeout(() => modal.classList.add("hidden"), 250);
}

modalOverlay?.addEventListener("click", closeModal);
modalCloseBtn?.addEventListener("click", closeModal);

// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    const requestId = ++currentRequestId; // 🆕 capture this request's ID

    showLoading(); // 🆕 show loading immediately

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

    // 🆕 Show empty state if no notes after filtering
    if (!notes.length) {
        const message = window.isTrashPage
            ? "Trash is empty"
            : isArchivePage
                ? "No archived notes"
                : search
                    ? "No notes match your search"
                    : "No notes yet";
        showEmpty(message);
        return; // Skip applyFilters if empty
    }

    applyFilters(); // Always go through filter system
}

// ===== DATE FORMATTING =====
function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    return date.toLocaleString(); // simple + clean
}

// ===== PREVIEW TEXT (STRIP HTML + LIMIT) =====
function getPreviewText(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Convert <br> to line breaks
    temp.querySelectorAll("br").forEach(br => br.replaceWith("\n"));

    return temp.innerText;
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

// ===== NOTE COLOR PICKER =====
const presetColors = [
    "#ffffff","#ffadad","#ffd6a5","#fdffb6","#caffbf",
    "#9bf6ff","#a0c4ff","#bdb2ff","#ffc6ff","#fffffc",
    "#2a2a40" // 🆕 dark custom color
];

function setNoteColor(noteId, color) {
    const note = allNotes.find(n => n._id === noteId);
    if (!note) return;

    note.color = color;

    const noteDiv = document.querySelector(`[data-id="${noteId}"]`);
    if (noteDiv) noteDiv.style.backgroundColor = color;

    updateNoteColor(noteId, color).catch(console.error);
}

let activeColorPopup = null;

function showColorPopup(noteId, btn) {
    if (activeColorPopup) activeColorPopup.remove();

    const popup = document.createElement("div");
    popup.id = "colorPopup";
    popup.className = "color-popup";

    presetColors.forEach(c => {
        const colorBtn = document.createElement("div");
        colorBtn.className = "color-btn";
        colorBtn.style.backgroundColor = c;
        colorBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setNoteColor(noteId, c);
            popup.remove();
        });
        popup.appendChild(colorBtn);
    });

    document.body.appendChild(popup);

    const rect = btn.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;

    const popupRect = popup.getBoundingClientRect();
    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - 10;
    }
    if (top + popupRect.height > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - popupRect.height - 5;
    }

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    activeColorPopup = popup;

    const removePopup = (e) => {
        if (!popup.contains(e.target) && e.target !== btn) {
            popup.remove();
            activeColorPopup = null;
            document.removeEventListener("click", removePopup);
            document.removeEventListener("touchstart", removePopup);
        }
    };

    document.addEventListener("click", removePopup);
    document.addEventListener("touchstart", removePopup);
}

// ===== MODAL UPDATES =====
function showModal(title, message, onConfirm, onCancel) {
    if (!modal) return;

    const modalTitle = modal.querySelector(".modal-title");
    const modalMessage = modal.querySelector(".modal-message");
    const confirmBtn = modal.querySelector(".modal-confirm");
    const cancelBtn = modal.querySelector(".modal-cancel");

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    confirmBtn.onclick = () => {
        modal.classList.remove("active");
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.classList.remove("active");
        if (onCancel) onCancel();
    };

    modal.classList.add("active");
}

// ===== DELETE NOTE ANIMATION =====
function deleteNoteAnimated(noteDiv, noteId) {
    noteDiv.classList.add("deleting");
    setTimeout(async () => {
        const note = allNotes.find(n => n._id === noteId);
        lastDeletedNote = note;

        allNotes = allNotes.filter(n => n._id !== noteId);
        applyFilters();

        await deleteNote(noteId);
        showUndoToast();
    }, 400); // match CSS animation
}

// ===== RENDER NOTES =====
function renderNotes(notes) {
    const container = document.getElementById("notesContainer");
    container.innerHTML = "";

    const isArchivePage = window.isArchivePage;
    const isTrashPage = window.isTrashPage;

    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note";
        div.dataset.id = note._id;
        div.draggable = !isTrashPage;

        // ===== DRAG EVENTS =====
        div.addEventListener("dragstart", () => {
            draggedNoteId = note._id;
        });

        div.addEventListener("dragend", () => {
            draggedNoteId = null;
        });

        // 🖌️ preserve note color
        div.style.backgroundColor = note.color || "#ffffff";

        // ===== BULK SELECTION =====
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
        contentEl.innerHTML = note.content || ""; // ✅ preserve HTML

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

            actionsEl.append(restoreBtn, deleteBtn);
        } else {
            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.onclick = (e) => {
                e.stopPropagation();

                // Remove editing from other notes
                document.querySelectorAll(".note.editing").forEach(n => {
                    n.classList.remove("editing");
                });

                // Set this note to editing
                div.classList.add("editing");

                enableInlineEdit(div, note);
            };

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => deleteNoteAnimated(div, note._id);

            const pinBtn = document.createElement("button");
            pinBtn.textContent = "📌";
            pinBtn.onclick = () => togglePinAction(note._id);

            const archiveBtn = document.createElement("button");
            archiveBtn.textContent = isArchivePage ? "↩️" : "📦";
            archiveBtn.onclick = () => toggleArchiveAction(note._id);

            const colorBtn = document.createElement("button");
            colorBtn.textContent = "🎨";
            colorBtn.onclick = (e) => {
                e.stopPropagation();
                showColorPopup(note._id, colorBtn);
            };

            const duplicateBtn = document.createElement("button");
            duplicateBtn.textContent = "📄";
            duplicateBtn.title = "Duplicate";
            duplicateBtn.onclick = () => duplicateNote(note._id);

            // Undo/redo
            const undoBtn = document.createElement("button");
            undoBtn.textContent = "↩️";
            undoBtn.onclick = () => undoEdit(note._id);

            const redoBtn = document.createElement("button");
            redoBtn.textContent = "↪️";
            redoBtn.onclick = () => redoEdit(note._id);

            actionsEl.append(
                editBtn,
                deleteBtn,
                pinBtn,
                archiveBtn,
                colorBtn,
                duplicateBtn,
                undoBtn,
                redoBtn
            );
        }

        contentContainer.append(titleEl, contentEl, tagsEl, updatedEl, actionsEl);
        div.appendChild(contentContainer);

        // ===== CLICK/DOUBLECLICK =====
        contentContainer.addEventListener("click", () => div.classList.toggle("open"));

        contentContainer.addEventListener("dblclick", () => {
            // Remove editing from any other notes
            document.querySelectorAll(".note.editing").forEach(n => {
                n.classList.remove("editing");
            });

            // Set this note as editing
            div.classList.add("editing");

            enableInlineEdit(div, note);
        });

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
        allNotes.unshift({
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

        titleEl.value = "";
        contentEl.innerHTML = "";

        applyFilters();
    } catch (err) {
        console.error("Failed to create note:", err);
        alert("Failed to create note. See console for details.");
    }
}

// ===== DELETE NOTE =====
async function deleteNoteWithUndo(noteId) {
    const noteElement = document.querySelector(`[data-id="${noteId}"]`);
    if (!noteElement) return;

    noteElement.classList.add("deleting");

    setTimeout(async () => {
        const note = allNotes.find(n => n._id === noteId);
        lastDeletedNote = note;

        allNotes = allNotes.filter(n => n._id !== noteId);
        applyFilters();

        await deleteNote(noteId);

        showUndoToast();
    }, 200);
}

// ===== UNDO TOAST =====
function showUndoToast() {
    const toast = document.getElementById("undoToast");
    toast.classList.remove("hidden");

    clearTimeout(undoTimeout);

    undoTimeout = setTimeout(() => {
        toast.classList.add("hidden");
        lastDeletedNote = null;
    }, 5000);
}

// ===== UNDO DELETE =====
async function undoDelete() {
    if (!lastDeletedNote) return;

    await restoreNote(lastDeletedNote._id);

    allNotes.unshift(lastDeletedNote);
    applyFilters();

    lastDeletedNote = null;

    document.getElementById("undoToast").classList.add("hidden");
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

    // Initialize undo/redo stack for this note if not exists
    if (!editHistory[id]) editHistory[id] = { undo: [], redo: [] };

    document.getElementById("addNoteBtn").onclick = async () => {
        const updatedTitle = (titleEl.value || "").trim();
        const updatedContent = (contentEl.innerHTML || "").trim();

        if (!updatedTitle && !updatedContent) {
            alert("Note cannot be empty!");
            return;
        }

        try {
            // PUSH current state to undo before updating
            editHistory[id].undo.push({ title: note.title, content: note.content });
            // CLEAR redo stack on new edit
            editHistory[id].redo = [];

            const updatedNote = await updateNote(id, updatedTitle, updatedContent, note.tags || []);
            Object.assign(note, {
                title: updatedTitle,
                content: updatedContent,
                updated_at: new Date().toISOString()
            });

            titleEl.value = "";
            contentEl.innerHTML = "";

            document.getElementById("addNoteBtn").onclick = createNoteAction;

            applyFilters();
        } catch (err) {
            console.error("Failed to update note:", err);
            alert("Failed to update note. See console for details.");
        }
    };
}

// ===== INLINE EDITING =====
let editingNoteId = null;

function enableInlineEdit(noteEl, note) {
    if (editingNoteId && editingNoteId !== note._id) return; // only one edit at a time
    editingNoteId = note._id;

    const titleEl = noteEl.querySelector("h3");
    const contentEl = noteEl.querySelector(".note-content");

    titleEl.contentEditable = true;
    contentEl.contentEditable = true;

    titleEl.classList.add("editing");
    contentEl.classList.add("editing");

    titleEl.focus();

    // After creating inputs/textarea inside enableInlineEdit()
    titleInput?.addEventListener("input", () => triggerAutosave(noteElement));
    textarea?.addEventListener("input", () => triggerAutosave(noteElement));

    const saveHandler = () => saveInlineEdit(noteEl, note);
    titleEl.addEventListener("blur", saveHandler, { once: true });
    contentEl.addEventListener("blur", saveHandler, { once: true });
}

async function saveInlineEdit(noteEl, note) {
    const titleEl = noteEl.querySelector("h3");
    const contentEl = noteEl.querySelector(".note-content");

    const newTitle = titleEl.textContent.trim();
    const newContent = contentEl.innerHTML.trim(); // ✅ keep HTML

    if (!newTitle && !newContent) {
        alert("Note cannot be empty!");
        return;
    }

    if (!editHistory[note._id]) editHistory[note._id] = { undo: [], redo: [] };

    editHistory[note._id].undo.push({ title: note.title, content: note.content });
    editHistory[note._id].redo = [];

    try {
        await updateNote(note._id, newTitle, newContent, note.tags || []);

        Object.assign(note, {
            title: newTitle,
            content: newContent,
            updated_at: new Date().toISOString()
        });

        titleEl.contentEditable = false;
        contentEl.contentEditable = false;

        titleEl.classList.remove("editing");
        contentEl.classList.remove("editing");

        editingNoteId = null;

        applyFilters(); // re-render notes safely

    } catch (err) {
        console.error("Inline update failed:", err);
        alert("Failed to update note.");
    }
}

// ===== UNDO EDIT =====
async function undoEdit(noteId) {
    const note = allNotes.find(n => n._id === noteId);
    if (!note || !editHistory[noteId] || editHistory[noteId].undo.length === 0) return;

    const lastState = editHistory[noteId].undo.pop();
    editHistory[noteId].redo.push({ title: note.title, content: note.content });

    Object.assign(note, lastState, { updated_at: new Date().toISOString() });
    await updateNote(noteId, note.title, note.content, note.tags || []);
    applyFilters();
}

// ===== REDO EDIT =====
async function redoEdit(noteId) {
    const note = allNotes.find(n => n._id === noteId);
    if (!note || !editHistory[noteId] || editHistory[noteId].redo.length === 0) return;

    const nextState = editHistory[noteId].redo.pop();
    editHistory[noteId].undo.push({ title: note.title, content: note.content });

    Object.assign(note, nextState, { updated_at: new Date().toISOString() });
    await updateNote(noteId, note.title, note.content, note.tags || []);
    applyFilters();
}

// ===== CLICK OUTSIDE TO CLOSE EDIT MODE =====
document.addEventListener("click", (e) => {
    const activeNote = document.querySelector(".note.editing");
    if (!activeNote) return;

    // If the click is INSIDE the note → do nothing
    if (activeNote.contains(e.target)) return;

    // Otherwise → close edit mode
    closeEditMode(activeNote);
});


// ===== CLOSE EDIT MODE FUNCTION =====
function closeEditMode(noteElement) {
    noteElement.classList.remove("editing");

    // OPTIONAL: trigger save when closing
    const textarea = noteElement.querySelector("textarea");
    const titleInput = noteElement.querySelector("input");

    if (textarea || titleInput) {
        const id = noteElement.dataset.id;

        const updatedData = {
            title: titleInput ? titleInput.value : "",
            content: textarea ? textarea.value : ""
        };

        // Call your existing update function
        updateNote(id, updatedData);
    }
}

// ===== AUTOSAVE ON INPUT =====
function triggerAutosave(noteElement) {
    const noteId = noteElement.dataset.id;

    const titleInput = noteElement.querySelector("input");
    const textarea = noteElement.querySelector("textarea");

    if (!noteId || (!titleInput && !textarea)) return;

    const updatedData = {
        title: titleInput ? titleInput.value : "",
        content: textarea ? textarea.value : ""
    };

    // Show saving indicator
    showSavingIndicator(noteElement);

    // Debounce per note
    clearTimeout(autosaveTimers[noteId]);
    autosaveTimers[noteId] = setTimeout(() => {
        updateNote(noteId, updatedData);
    }, 600); // tweak delay if needed
}

// ===== SAVING INDICATOR =====
function showSavingIndicator(noteElement) {
    let indicator = noteElement.querySelector(".saving-indicator");

    if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "saving-indicator";
        indicator.textContent = "Saving...";
        indicator.style.fontSize = "12px";
        indicator.style.opacity = "0.7";
        indicator.style.marginLeft = "8px";

        // Attach near actions or at bottom
        const actions = noteElement.querySelector(".note-actions");
        if (actions) {
            actions.appendChild(indicator);
        } else {
            noteElement.appendChild(indicator);
        }
    }

    // Remove after a short delay
    setTimeout(() => {
        indicator?.remove();
    }, 1000);
}

// ===== TRASH ACTIONS =====
async function restoreNoteAction(id) {
    await restoreNote(id);
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

    allNotes = allNotes.filter(n => !selectedNotes.has(n._id));

    selectedNotes.clear();
    document.getElementById("selectAllNotes").checked = false;

    applyFilters();
});

document.getElementById("bulkArchive")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) return alert("No notes selected!");

    const ids = Array.from(selectedNotes);
    await Promise.all(ids.map(id => toggleArchive(id)));

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

// ===== THEME TOGGLE =====
function toggleTheme() {
    document.body.classList.toggle("light");
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = message;

    container.appendChild(toast);

    // Auto remove with fade-out
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ===== QUICK NOTE CREATE =====
async function createQuickNote(content) {
    try {
        const res = await fetch("/notes", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                title: content.substring(0, 20) || "Quick Note",
                content: content
            })
        });

        if (!res.ok) throw new Error("Failed to create note");

        loadNotes(); // refresh notes
    } catch (err) {
        console.error(err);
        alert("Failed to create quick note");
    }
}

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

// ===== DUPLICATE NOTE =====
async function duplicateNote(id) {
    try {
        const res = await fetch(`/notes/duplicate/${id}`, {
            method: "POST"
        });

        if (!res.ok) throw new Error("Failed to duplicate note");

        loadNotes(); // refresh UI
    } catch (err) {
        console.error(err);
        alert("Failed to duplicate note");
    }
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

    archiveZone.addEventListener("drop", async () => {
        archiveZone.classList.remove("active");

        if (!draggedNoteId) return;

        await archiveNote(draggedNoteId);
        draggedNoteId = null;
    });
}

// ===== ARCHIVE NOTE (DRAG) =====
async function archiveNote(id) {
    try {
        const res = await fetch(`/notes/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                archived: true
            })
        });

        if (!res.ok) throw new Error("Failed to archive note");

        loadNotes();
    } catch (err) {
        console.error(err);
        alert("Failed to archive note");
    }
}

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNoteAction);
loadNotes();
