// ===== NOTE COLOR PICKER =====
const presetColors = [
    "#ffffff","#ffadad","#ffd6a5","#fdffb6","#caffbf",
    "#9bf6ff","#a0c4ff","#bdb2ff","#ffc6ff","#fffffc",
    "#2a2a40"
];

function setNoteColor(noteId, color) { // Update color in local state and UI immediately
    const note = allNotes.find(n => n._id === noteId);
    if (!note) return; // should never happen

    note.color = color;

    // Update note background immediately for instant feedback
    const noteDiv = document.querySelector(`[data-id="${noteId}"]`);
    if (noteDiv) noteDiv.style.backgroundColor = color;

    updateNoteColor(noteId, color).catch(console.error);
}

// ===== COLOR POPUP =====
// Floating color picker anchored to a button
let activeColorPopup = null;

function showColorPopup(noteId, btn) {

    // Close existing popup if one is already open
    if (activeColorPopup) activeColorPopup.remove();

    const popup = document.createElement("div");
    popup.id = "colorPopup";
    popup.className = "color-popup";

    // Prevent click propagation so outside-click handler doesn't immediately close it
    popup.addEventListener("click", e => e.stopPropagation());

    // ===== GENERATE COLOR OPTIONS =====
    presetColors.forEach(color => {
        const el = document.createElement("div");
        el.className = "color-btn";
        el.style.backgroundColor = color;

        el.onclick = (e) => {
            e.stopPropagation();

            // Apply color to note
            setNoteColor(noteId, color);

            // Clean up popup state
            popup.remove();
            activeColorPopup = null;
        };

        popup.appendChild(el);
    });

    document.body.appendChild(popup);
    activeColorPopup = popup;

    // ===== POSITIONING LOGIC =====
    // Align popup relative to button with viewport boundary checks
    const rect = btn.getBoundingClientRect();

    requestAnimationFrame(() => {
        const popRect = popup.getBoundingClientRect();

        let top = rect.bottom + window.scrollY + 5;
        let left = rect.left + window.scrollX;

        // Prevent overflow right side of screen
        if (left + popRect.width > window.innerWidth) {
            left = window.innerWidth - popRect.width - 10;
        }

        // If popup goes below viewport, flip above button
        if (top + popRect.height > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - popRect.height - 5;
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    });

    // ===== OUTSIDE CLICK HANDLING =====
    const remove = (e) => {
        if (!popup.contains(e.target) && e.target !== btn) {
            popup.remove();
            activeColorPopup = null;

            document.removeEventListener("click", remove);
            document.removeEventListener("touchstart", remove);
        }
    };

    // Delay binding so initial click doesn’t immediately close it
    setTimeout(() => {
        document.addEventListener("click", remove);
        document.addEventListener("touchstart", remove);
    }, 0);
}


// ===== DELETE NOTE (OPTIMISTIC UI) =====
// Immediately removes UI, then syncs with backend
function deleteNoteAnimated(noteDiv, noteId) {

    // Visual feedback before deletion
    noteDiv.classList.add("deleting");

    setTimeout(async () => {

        // Save reference for undo
        const note = allNotes.find(n => n._id === noteId);
        lastDeletedNote = note;

        // Optimistic update: remove locally first
        allNotes = allNotes.filter(n => n._id !== noteId);
        applyFilters();

        // Sync deletion with backend
        await deleteNote(noteId);

        showToast("Note deleted", "success");

        // Show undo option
        showUndoToast();

        // Auto-expire undo window
        clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            lastDeletedNote = null;
            document.getElementById("undoToast")?.classList.add("hidden");
        }, 5000);

    }, 300);
}


// ===== UNDO DELETE =====
// Restores last deleted note (if still available in undo window)
async function undoDelete() {

    if (!lastDeletedNote) return;

    // Restore on backend
    await restoreNote(lastDeletedNote._id);

    // Restore locally (front of list)
    allNotes.unshift(lastDeletedNote);
    applyFilters();

    // Clear undo state
    lastDeletedNote = null;
    document.getElementById("undoToast")?.classList.add("hidden");
}

// ===== REORDER NOTES (Drag & Drop Persistence) =====
async function reorderNotesAction(draggedId, targetId) {

    // Find index positions of dragged and target notes in global state
    const from = allNotes.findIndex(n => n._id === draggedId);
    const to = allNotes.findIndex(n => n._id === targetId);

    // Safety check: if either note doesn't exist, abort operation
    if (from < 0 || to < 0) return;

    // Remove dragged note from array
    const [moved] = allNotes.splice(from, 1);

    // Insert it at the target position
    allNotes.splice(to, 0, moved);

    // Persist new order to backend (send only ordered IDs)
    await reorderNotes(allNotes.map(n => n._id));

    // Re-apply filters + re-render UI to reflect new order
    applyFilters();
}


// ===== CREATE NOTE (Optimistic UI Insert) =====
async function createNoteAction() {

    // Grab input elements from DOM
    const titleEl = document.getElementById("noteTitle");
    const contentEl = document.getElementById("noteContent");

    // Extract and sanitize input
    const title = titleEl.value.trim();
    const content = contentEl.innerHTML.trim();

    // Prevent empty note creation
    if (!title && !content) return alert("Note cannot be empty!");

    try {
        // Send request to backend to create note
        const n = await createNote(title, content, []);

        // Optimistically update local state (insert at top of list)
        allNotes.unshift({
            _id: n._id,
            title: n.title,
            content: n.content,
            tags: n.tags,

            // Default state flags for new note
            pinned: false,
            archived: false,
            trashed: false,

            // Used for ordering system
            position: allNotes.length,

            created_at: n.created_at,
            updated_at: n.updated_at
        });

        // Clear input fields after successful creation
        titleEl.value = "";
        contentEl.innerHTML = "";

        // Re-run filtering + rendering pipeline
        applyFilters();

    } catch (e) {
        // Show error feedback to user if API call fails
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

// ===== INLINE EDIT MODE (Collaboration-aware editor) =====
let editingNoteId = null;

function enableInlineEdit(noteEl, note) {

    // Prevent editing multiple notes at the same time
    // (simple lock to avoid conflicting UI states)
    if (editingNoteId && editingNoteId !== note._id) return;
    editingNoteId = note._id;

    // Grab existing rendered elements from the note card
    const titleEl = noteEl.querySelector("h3");
    const contentEl = noteEl.querySelector(".note-content");

    // Use raw content (not HTML-rendered markdown) for editing
    const rawContent = contentEl.dataset.raw || note.content || "";

    // Store original values for cancel/rollback support
    const original = {
        title: titleEl.textContent,
        content: rawContent
    };

    // ===== CREATE EDIT INPUTS =====

    // Replace title with input field
    const titleInput = document.createElement("input");
    titleInput.className = "edit-title";
    titleInput.value = original.title;

    // Replace content with textarea for full editing
    const textarea = document.createElement("textarea");
    textarea.className = "edit-content";
    textarea.value = original.content;

    // Swap DOM elements (view mode → edit mode)
    titleEl.replaceWith(titleInput);
    contentEl.replaceWith(textarea);

    // Improve UX: focus title immediately
    titleInput.focus();

    // ===== AUTOSAVE HANDLER =====
    const autosave = () => {
        // Push partial updates to backend via autosave system
        triggerInlineAutosave(
            noteEl,
            note,
            titleInput.value,
            textarea.value
        );
    };

    // Autosave on every input change (live sync behavior)
    titleInput.oninput = autosave;
    textarea.oninput = autosave;

    // ===== MANUAL SAVE (on blur) =====
    const save = async () => {
        try {
            // Persist final state to backend
            const result = await saveInlineEdit(
                noteEl,
                note,
                titleInput.value,
                textarea.value,
                activeNoteVersion // used for optimistic concurrency control
            );

            // Update local version for collaboration tracking
            if (result?.version) {
                activeNoteVersion = result.version;
            }

            // Stop polling once save completes (reduce unnecessary sync checks)
            stopCollaborationPolling();

        } catch (err) {
            console.error(err);

            // Likely conflict: another user edited first (race condition)
            showToast(
                "Another collaborator updated this note first.",
                "error"
            );
        }

        // Exit edit mode regardless of success/failure
        editingNoteId = null;
    };

    // Save when user leaves field (blur-based persistence)
    titleInput.onblur = save;
    textarea.onblur = save;

    // ===== ESCAPE TO CANCEL EDIT =====
    document.addEventListener("keydown", function esc(e) {

        if (e.key !== "Escape") return;

        // Restore original DOM elements (cancel edit mode)
        titleInput.replaceWith(titleEl);
        textarea.replaceWith(contentEl);

        // Restore original content (discard changes)
        titleEl.textContent = original.title;
        contentEl.innerHTML = parseMarkdown(original.content);
        contentEl.dataset.raw = original.content;

        // Stop collaboration sync since edit session is cancelled
        stopCollaborationPolling();

        editingNoteId = null;

        // Remove listener after single use (prevents memory leaks)
        document.removeEventListener("keydown", esc);
    });
}

// ===== AUTOSAVE (debounced background sync) =====
function triggerInlineAutosave(noteEl, note, title, content) {
    const id = note._id;

    // UI feedback: show "Saving..." indicator
    showSavingIndicator(noteEl);

    // Prevent multiple pending saves for same note
    clearTimeout(autosaveTimers[id]);

    // Debounce autosave to avoid excessive API calls while typing
    autosaveTimers[id] = setTimeout(() => {
        updateNote(id, title.trim(), content.trim(), note.tags || [])
            .catch(console.error);
    }, 500);
}


// ===== SAVE INLINE EDIT (final commit + conflict handling) =====
async function saveInlineEdit(noteEl, note, title, content, version) {

    title = title.trim();
    content = content.trim();

    // Prevent saving empty notes
    if (!title && !content) {
        showToast("Empty note not allowed", "error");
        return;
    }

    try {
        // Send update with version for optimistic concurrency control
        const result = await updateNote(note._id, {
            title,
            content,
            tags: note.tags || [],
            version
        });

        // Sync server version for collaboration tracking
        if (result?.version) {
            activeNoteVersion = result.version;
        }

        // Update local state immediately (avoid refetching)
        Object.assign(note, {
            title,
            content,
            updated_at: new Date().toISOString(),
            version: activeNoteVersion
        });

        // Refresh markdown cache to keep render consistent
        window.markdownCache.set(
            note._id,
            parseMarkdown(content)
        );

        editingNoteId = null;

        // Stop collaboration polling once save completes
        stopCollaborationPolling();

        // Re-run filtering + rendering pipeline
        applyFilters();

        showToast("Note saved", "success");

        return result;

    } catch (err) {
        console.error(err);

        // Conflict error: another user updated note first
        if (err.message?.includes("409")) {
            showToast(
                "Another collaborator updated this note first.",
                "error"
            );
        } else {
            showToast("Failed to save note", "error");
        }
    }
}


// ===== CLOSE EDIT MODE (manual save fallback) =====
function closeEditMode(el) {
    const id = el.dataset.id;

    // Extract current DOM state (not ideal, but fallback save mechanism)
    const title = el.querySelector("h3").textContent.trim();
    const content = el.querySelector(".note-content").innerHTML.trim();

    // Persist current state
    updateNote(id, {
        title,
        content,
        tags: [],
        version: activeNoteVersion
    }).catch(console.error);

    stopCollaborationPolling();
    el.classList.remove("editing");
}


// ===== UNDO EDIT (local history stack per note) =====
async function undoEdit(id) {
    const n = allNotes.find(x => x._id === id);

    // Ensure history exists and undo stack is available
    if (!n || !editHistory[id]?.undo.length) return;

    // Pop previous state and push current into redo stack
    const prev = editHistory[id].undo.pop();
    editHistory[id].redo.push({ title: n.title, content: n.content });

    // Restore previous state locally
    Object.assign(n, prev);

    // Sync with backend
    await updateNote(id, {
        title: n.title,
        content: n.content,
        tags: n.tags || [],
        version: activeNoteVersion
    });

    activeNoteVersion++;
    applyFilters();
}


// ===== REDO EDIT =====
async function redoEdit(id) {
    const n = allNotes.find(x => x._id === id);

    if (!n || !editHistory[id]?.redo.length) return;

    const next = editHistory[id].redo.pop();
    editHistory[id].undo.push({ title: n.title, content: n.content });

    Object.assign(n, next);

    await updateNote(id, {
        title: n.title,
        content: n.content,
        tags: n.tags || [],
        version: activeNoteVersion
    });

    activeNoteVersion++;
    applyFilters();
}


// ===== RESTORE FROM TRASH =====
async function restoreNoteAction(id) {
    await restoreNote(id);

    // Reload full dataset to reflect restored state
    loadNotes(currentSearch);
}


// ===== PERMANENT DELETE (irreversible action) =====
async function permanentDeleteNoteAction(id) {

    // Confirmation modal before destructive action
    if (!(await showConfirmPopup("Delete permanently?"))) return;

    await deleteNotePermanently(id);

    // Remove from local state immediately
    allNotes = allNotes.filter(n => n._id !== id);

    applyFilters();
}


// ===== FILTER BY TAG (toggle behavior) =====
function filterByTag(tag) {

    // Clicking same tag toggles filter off
    currentTag = currentTag === tag ? null : tag;

    applyFilters();
}


// ===== DUPLICATE NOTE =====
async function duplicateNote(id) {
    try {
        await apiRequest(`/notes/duplicate/${id}`, "POST");

        // Refresh state after duplication
        loadNotes(currentSearch);

    } catch {
        showToast("Duplicate failed", "error");
    }
}


// ===== QUICK NOTE CREATION (minimal input flow) =====
async function createQuickNote(content) {
    await apiRequest("/notes", "POST", {
        title: content.slice(0, 20) || "Quick Note",
        content
    });

    loadNotes();
}


// ===== SHARE NOTE (collaboration setup) =====
async function openShareModal(note) {

    // Prompt user for collaborator email
    const email = await showInputPopup(
        "Enter email to share this note with:",
        "example@email.com"
    );

    if (!email) return;

    try {
        await shareNote(note._id, email);
        showToast("Note shared successfully", "success");

    } catch (err) {
        console.error(err);
        showToast("Failed to share note", "error");
    }
}
