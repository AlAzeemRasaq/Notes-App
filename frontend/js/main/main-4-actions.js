// ===== NOTE COLOR PICKER =====
const presetColors = [
    "#ffffff","#ffadad","#ffd6a5","#fdffb6","#caffbf",
    "#9bf6ff","#a0c4ff","#bdb2ff","#ffc6ff","#fffffc",
    "#2a2a40"
];

function setNoteColor(noteId, color) {
    const note = allNotes.find(n => n._id === noteId);
    if (!note) return;

    note.color = color;

    const noteDiv = document.querySelector(`[data-id="${noteId}"]`);
    if (noteDiv) noteDiv.style.backgroundColor = color;

    updateNoteColor(noteId, color).catch(console.error);
}

// ===== COLOR POPUP =====
let activeColorPopup = null;

function showColorPopup(noteId, btn) {
    if (activeColorPopup) activeColorPopup.remove();

    const popup = document.createElement("div");
    popup.id = "colorPopup";
    popup.className = "color-popup";
    popup.addEventListener("click", e => e.stopPropagation());

    presetColors.forEach(color => {
        const el = document.createElement("div");
        el.className = "color-btn";
        el.style.backgroundColor = color;

        el.onclick = (e) => {
            e.stopPropagation();
            setNoteColor(noteId, color);
            popup.remove();
            activeColorPopup = null;
        };

        popup.appendChild(el);
    });

    document.body.appendChild(popup);
    activeColorPopup = popup;

    const rect = btn.getBoundingClientRect();

    requestAnimationFrame(() => {
        const popRect = popup.getBoundingClientRect();

        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX;

        if (left + popRect.width > window.innerWidth) {
            left = window.innerWidth - popRect.width - 10;
        }

        if (top + popRect.height > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - popRect.height - 5;
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    });

    const remove = (e) => {
        if (!popup.contains(e.target) && e.target !== btn) {
            popup.remove();
            activeColorPopup = null;
            document.removeEventListener("click", remove);
            document.removeEventListener("touchstart", remove);
        }
    };

    setTimeout(() => {
        document.addEventListener("click", remove);
        document.addEventListener("touchstart", remove);
    }, 0);
}

// ===== DELETE NOTE =====
function deleteNoteAnimated(noteDiv, noteId) {
    noteDiv.classList.add("deleting");

    setTimeout(async () => {
        const note = allNotes.find(n => n._id === noteId);
        lastDeletedNote = note;

        allNotes = allNotes.filter(n => n._id !== noteId);
        applyFilters();

        await deleteNote(noteId);
        showToast("Note deleted", "success");

        showUndoToast();

        clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            lastDeletedNote = null;
            document.getElementById("undoToast")?.classList.add("hidden");
        }, 5000);

    }, 300);
}

// ===== UNDO DELETE =====
async function undoDelete() {
    if (!lastDeletedNote) return;

    await restoreNote(lastDeletedNote._id);

    allNotes.unshift(lastDeletedNote);
    applyFilters();

    lastDeletedNote = null;
    document.getElementById("undoToast")?.classList.add("hidden");
}

// ===== REORDER =====
async function reorderNotesAction(draggedId, targetId) {
    const from = allNotes.findIndex(n => n._id === draggedId);
    const to = allNotes.findIndex(n => n._id === targetId);

    if (from < 0 || to < 0) return;

    const [moved] = allNotes.splice(from, 1);
    allNotes.splice(to, 0, moved);

    await reorderNotes(allNotes.map(n => n._id));
    applyFilters();
}

// ===== CREATE NOTE =====
async function createNoteAction() {
    const titleEl = document.getElementById("noteTitle");
    const contentEl = document.getElementById("noteContent");

    const title = titleEl.value.trim();
    const content = contentEl.innerHTML.trim();

    if (!title && !content) return alert("Note cannot be empty!");

    try {
        const n = await createNote(title, content, []);

        allNotes.unshift({
            _id: n._id,
            title: n.title,
            content: n.content,
            tags: n.tags,
            pinned: false,
            archived: false,
            trashed: false,
            position: allNotes.length,
            created_at: n.created_at,
            updated_at: n.updated_at
        });

        titleEl.value = "";
        contentEl.innerHTML = "";

        applyFilters();
    } catch (e) {
        showToast(e.message, "error");
    }
}

// ===== PIN / ARCHIVE =====
async function togglePinAction(id) {
    await togglePin(id);
    const n = allNotes.find(x => x._id === id);
    if (n) n.pinned = !n.pinned;
    applyFilters();
}

async function toggleArchiveAction(id) {
    await toggleArchive(id);
    const n = allNotes.find(x => x._id === id);
    if (n) n.archived = !n.archived;
    applyFilters();
}

// ===== EDIT =====
let editingNoteId = null;

function enableInlineEdit(noteEl, note) {
    if (editingNoteId && editingNoteId !== note._id) return;
    editingNoteId = note._id;

    const titleEl = noteEl.querySelector("h3");
    const contentEl = noteEl.querySelector(".note-content");

    const rawContent = contentEl.dataset.raw || note.content || "";

    const original = {
        title: titleEl.textContent,
        content: rawContent
    };

    // ===== CREATE EDIT FIELDS =====
    const titleInput = document.createElement("input");
    titleInput.className = "edit-title";
    titleInput.value = original.title;

    const textarea = document.createElement("textarea");
    textarea.className = "edit-content";
    textarea.value = original.content;

    // Replace elements
    titleEl.replaceWith(titleInput);
    contentEl.replaceWith(textarea);

    titleInput.focus();

    // ===== AUTOSAVE =====
    const autosave = () => {
        triggerInlineAutosave(noteEl, note, titleInput.value, textarea.value);
    };

    titleInput.oninput = autosave;
    textarea.oninput = autosave;

    // ===== SAVE =====
    const save = async () => {
        await saveInlineEdit(noteEl, note, titleInput.value, textarea.value);
    };

    titleInput.onblur = save;
    textarea.onblur = save;

    // ===== ESC CANCEL =====
    document.addEventListener("keydown", function esc(e) {
        if (e.key !== "Escape") return;

        titleInput.replaceWith(titleEl);
        textarea.replaceWith(contentEl);

        titleEl.textContent = original.title;
        contentEl.innerHTML = parseMarkdown(original.content);
        contentEl.dataset.raw = original.content;

        editingNoteId = null;
        document.removeEventListener("keydown", esc);
    });
}

// ===== AUTOSAVE =====
function triggerInlineAutosave(noteEl, note, title, content) {
    const id = note._id;

    showSavingIndicator(noteEl);

    clearTimeout(autosaveTimers[id]);

    autosaveTimers[id] = setTimeout(() => {
        updateNote(id, title.trim(), content.trim(), note.tags || [])
            .catch(console.error);
    }, 500);
}

async function saveInlineEdit(noteEl, note, title, content) {
    title = title.trim();
    content = content.trim();

    if (!title && !content) return alert("Empty note not allowed");

    await updateNote(note._id, title, content, note.tags || []);

    // ✅ update local state
    Object.assign(note, {
        title,
        content,
        updated_at: new Date().toISOString()
    });

    // ✅ update markdown cache
    window.markdownCache.set(note._id, parseMarkdown(content));

    editingNoteId = null;

    applyFilters();
}

// ===== CLOSE EDIT =====
function closeEditMode(el) {
    const id = el.dataset.id;

    const title = el.querySelector("h3").textContent.trim();
    const content = el.querySelector(".note-content").innerHTML.trim();

    updateNote(id, title, content, []).catch(console.error);
    el.classList.remove("editing");
}

// ===== UNDO / REDO =====
async function undoEdit(id) {
    const n = allNotes.find(x => x._id === id);
    if (!n || !editHistory[id]?.undo.length) return;

    const prev = editHistory[id].undo.pop();
    editHistory[id].redo.push({ title: n.title, content: n.content });

    Object.assign(n, prev);
    await updateNote(id, n.title, n.content, n.tags || []);
    applyFilters();
}

async function redoEdit(id) {
    const n = allNotes.find(x => x._id === id);
    if (!n || !editHistory[id]?.redo.length) return;

    const next = editHistory[id].redo.pop();
    editHistory[id].undo.push({ title: n.title, content: n.content });

    Object.assign(n, next);
    await updateNote(id, n.title, n.content, n.tags || []);
    applyFilters();
}

// ===== TRASH =====
async function restoreNoteAction(id) {
    await restoreNote(id);
    loadNotes(currentSearch);
}

async function permanentDeleteNoteAction(id) {
    if (!(await showConfirmPopup("Delete permanently?"))) return;

    await deleteNotePermanently(id);
    allNotes = allNotes.filter(n => n._id !== id);
    applyFilters();
}

// ===== TAG FILTER =====
function filterByTag(tag) {
    currentTag = currentTag === tag ? null : tag;
    applyFilters();
}

// ===== DUPLICATE =====
async function duplicateNote(id) {
    try {
        await apiRequest(`/notes/duplicate/${id}`, "POST");
        loadNotes(currentSearch);
    } catch {
        showToast("Duplicate failed", "error");
    }
}

// ===== QUICK NOTE =====
async function createQuickNote(content) {
    await apiRequest("/notes", "POST", {
        title: content.slice(0, 20) || "Quick Note",
        content
    });

    loadNotes();
}
