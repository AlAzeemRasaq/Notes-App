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

// COLOR UPDATE (OPTIMISTIC UI)
let activeColorPopup = null;
function showColorPopup(noteId, btn) {
    // Remove existing popup
    if (activeColorPopup) activeColorPopup.remove();

    const popup = document.createElement("div");
    popup.id = "colorPopup";
    popup.className = "color-popup";

    // 🔥 Prevent popup clicks from bubbling to document
    popup.addEventListener("click", (e) => e.stopPropagation());

    presetColors.forEach(c => {
        const colorBtn = document.createElement("div");
        colorBtn.className = "color-btn";
        colorBtn.style.backgroundColor = c;

        colorBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // ✅ critical
            setNoteColor(noteId, c);

            // Clean up popup safely
            popup.remove();
            activeColorPopup = null;
        });

        popup.appendChild(colorBtn);
    });

    document.body.appendChild(popup);

    // ===== POSITIONING =====
    const rect = btn.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;

    document.body.appendChild(popup);

    // allow layout to settle BEFORE measuring
    requestAnimationFrame(() => {
        const rect = btn.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();

        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX;

        if (left + popupRect.width > window.innerWidth) {
            left = window.innerWidth - popupRect.width - 10;
        }

        if (top + popupRect.height > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - popupRect.height - 5;
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    });

    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - 10;
    }

    if (top + popupRect.height > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - popupRect.height - 5;
    }

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    activeColorPopup = popup;

    // ===== OUTSIDE CLICK HANDLER =====
    const removePopup = (e) => {
        if (!popup.contains(e.target) && e.target !== btn) {
            popup.remove();
            activeColorPopup = null;

            document.removeEventListener("click", removePopup);
            document.removeEventListener("touchstart", removePopup);
        }
    };

    // 🔥 Delay listener to avoid immediate trigger
    setTimeout(() => {
        document.addEventListener("click", removePopup);
        document.addEventListener("touchstart", removePopup);
    }, 0);
}

// ===== DELETE NOTE ANIMATION =====
function deleteNoteAnimated(noteDiv, noteId) {
    noteDiv.classList.add("deleting");

    setTimeout(async () => {
        const note = allNotes.find(n => n._id === noteId);

        // 🧠 Store deleted note
        lastDeletedNote = note;

        // 🧹 Remove from UI instantly
        allNotes = allNotes.filter(n => n._id !== noteId);
        applyFilters();

        // 🗑️ Backend delete
        await deleteNote(noteId);
        showToast("Note deleted", "success");

        // 🔥 Show undo toast
        showUndoToast();

        // ⏳ Auto clear after 5s
        clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            lastDeletedNote = null;
            document.getElementById("undoToast").classList.add("hidden");
        }, 5000);

    }, 400);
}

// ===== UNDO TOAST =====
function showUndoToast() {
    const toast = document.getElementById("undoToast");
    toast.classList.remove("hidden");
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
        showToast(err.message, "error");
    }
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
    if (editingNoteId && editingNoteId !== note._id) return;
    editingNoteId = note._id;

    const titleEl = noteEl.querySelector("h3");
    const contentEl = noteEl.querySelector(".note-content");

    // ===== STORE ORIGINAL STATE (for safety) =====
    const originalTitle = titleEl.textContent;
    const originalContent = contentEl.innerHTML;

    // ===== MAKE EDITABLE =====
    titleEl.contentEditable = true;
    contentEl.contentEditable = true;

    titleEl.classList.add("editing");
    contentEl.classList.add("editing");

    titleEl.focus();
    titleEl.addEventListener("mousedown", (e) => e.stopPropagation());
    contentEl.addEventListener("mousedown", (e) => e.stopPropagation());

    // ===== REMOVE OLD LISTENERS SAFELY =====
    const save = async () => {
        await saveInlineEdit(noteEl, note);
    };

    const autosave = () => triggerInlineAutosave(noteEl, note);

    // Prevent duplicate bindings
    titleEl.oninput = autosave;
    contentEl.oninput = autosave;

    titleEl.onblur = save;
    contentEl.onblur = save;

    // ===== ESC KEY SUPPORT INSIDE EDIT MODE =====
    const escHandler = (e) => {
        if (e.key === "Escape") {
            titleEl.textContent = originalTitle;
            contentEl.innerHTML = originalContent;

            titleEl.contentEditable = false;
            contentEl.contentEditable = false;

            titleEl.classList.remove("editing");
            contentEl.classList.remove("editing");

            editingNoteId = null;

            document.removeEventListener("keydown", escHandler);
        }
    };

    document.addEventListener("keydown", escHandler);
}

// ===== INLINE AUTOSAVE (DEBOUNCED) =====
function triggerInlineAutosave(noteElement, note) {
    const noteId = note._id;

    const titleEl = noteElement.querySelector("h3");
    const contentEl = noteElement.querySelector(".note-content");

    if (!noteId) return;

    const updatedTitle = titleEl.textContent.trim();
    const updatedContent = contentEl.innerHTML.trim();

    showSavingIndicator(noteElement);

    clearTimeout(autosaveTimers[noteId]);

    autosaveTimers[noteId] = setTimeout(() => {
        updateNote(noteId, updatedTitle, updatedContent, note.tags || [])
            .catch(console.error);
    }, 600);
}

async function saveInlineEdit(noteEl, note) {
    const titleEl = noteEl.querySelector("h3");
    const contentEl = noteEl.querySelector(".note-content");

    const newTitle = titleEl.textContent.trim();
    const newContent = contentEl.innerHTML.trim();

    if (!newTitle && !newContent) {
        alert("Note cannot be empty!");
        return;
    }

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

        applyFilters();

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

    const clickedInsideNote = activeNote.contains(e.target);
    const clickedPopup = e.target.closest(".color-popup");
    const clickedButton = e.target.closest("button");

    if (clickedInsideNote || clickedPopup || clickedButton) return;

    closeEditMode(activeNote);
});


// ===== CLOSE EDIT MODE FUNCTION =====
function closeEditMode(noteElement) {
    noteElement.classList.remove("editing");

    const titleEl = noteElement.querySelector("h3");
    const contentEl = noteElement.querySelector(".note-content");

    if (!titleEl || !contentEl) return;

    const id = noteElement.dataset.id;

    const updatedTitle = titleEl.textContent.trim();
    const updatedContent = contentEl.innerHTML.trim();

    // 🔥 FIX: correct updateNote signature (title, content, tags)
    updateNote(id, updatedTitle, updatedContent, [])
        .catch(console.error);
}

// ===== AUTOSAVE ON INPUT =====
function triggerAutosave(noteElement) {
    const noteId = noteElement.dataset.id;

    const titleInput = noteElement.querySelector("input");
    const textarea = noteElement.querySelector("textarea");

    if (!noteId) return;

    const updatedTitle = titleInput ? titleInput.value : "";
    const updatedContent = textarea ? textarea.value : "";

    showSavingIndicator(noteElement);

    clearTimeout(autosaveTimers[noteId]);

    autosaveTimers[noteId] = setTimeout(() => {
        updateNote(noteId, updatedTitle, updatedContent, [])
            .catch(console.error);
    }, 600);
}

// ===== TRASH ACTIONS =====
async function restoreNoteAction(id) {
    await restoreNote(id);
    loadNotes(currentSearch);
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

// ===== BULK UPDATE TAGS =====
document.getElementById("applyBulkTags")?.addEventListener("click", async () => {
    if (selectedNotes.size === 0) {
        alert("No notes selected!");
        return;
    }

    const raw = document.getElementById("bulkTagInput").value;
    const tags = raw.split(",").map(t => t.trim()).filter(Boolean);

    await bulkUpdateTags(Array.from(selectedNotes), tags);

    // update locally
    allNotes.forEach(n => {
        if (selectedNotes.has(n._id)) {
            n.tags = tags;
        }
    });

    applyFilters();
});

// ===== DUPLICATE NOTE =====
async function duplicateNote(id) {
    try {
        await apiRequest(`/notes/duplicate/${id}`, "POST");
        loadNotes(currentSearch);
    } catch (err) {
        console.error(err);
        alert("Failed to duplicate note");
    }
}

// ===== ARCHIVE NOTE (DRAG) =====
async function archiveNote(id) {
    try {
        await apiRequest(`/notes/archive/${id}`, "PUT");
    } catch (err) {
        console.error(err);
        alert("Failed to archive note");
    }
}

// ===== QUICK NOTE CREATE =====
async function createQuickNote(content) {
    try {
        await apiRequest("/notes", "POST", {
            title: content.substring(0, 20) || "Quick Note",
            content
        });

        loadNotes();
    } catch (err) {
        console.error(err);
        alert("Failed to create quick note");
    }
}
