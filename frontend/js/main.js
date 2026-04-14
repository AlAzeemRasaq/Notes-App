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

// ===== SAFE PAGE DETECTION =====
function isArchivePage() {
    return document.body?.dataset?.page === "archive";
}

function isTrashPage() {
    return document.body?.dataset?.page === "trash";
}

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

// Sort mode (default, date, title)
let sortMode = "default";

// More states
let currentPage = 1;
let isLoadingMore = false;
let hasMore = true;

// ===== EDIT HISTORY STACKS =====
const editHistory = {}; // { noteId: { undo: [], redo: [] } }

// ===== UI STATES =====
function showLoading() {
    const container = document.getElementById("notesContainer");
    container.replaceChildren();

    const skeletonCount = 1; // can be increased

    for (let i = 0; i < skeletonCount; i++) {
        const div = document.createElement("div");
        div.className = "skeleton";

        div.innerHTML = `
            <div class="skeleton-title"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text short"></div>
        `;

        container.appendChild(div);
    }
}

function showEmpty(message = "No notes yet") {
    const container = document.getElementById("notesContainer");
    container.innerHTML = `<div class="state-message">${message}</div>`;
}

// ===== SIMPLE MARKDOWN PARSER =====
function parseMarkdown(text) {
    if (!text) return "";

    let parsed = text;

    // Escape HTML first (prevent XSS issues)
    parsed = parsed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Bold **text**
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic *text*
    parsed = parsed.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Inline code `text`
    parsed = parsed.replace(/`(.*?)`/g, "<code>$1</code>");

    // Line breaks
    parsed = parsed.replace(/\n/g, "<br>");

    return parsed;
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
    console.log("LOAD NOTES:", window.location.href);

    const requestId = ++currentRequestId;

    currentPage = 1;
    hasMore = true;

    let notes = [];

    // 🧹 RESET UI STATE WHEN SWITCHING PAGES
    currentSearch = search || "";
    currentTag = null;
    selectedNotes.clear();
    selectMode = false;

    // ===== SHOW LOADING ONLY WHEN NEEDED =====
    if (!search && !isTrashPage() && !isArchivePage()) {
        showLoading();
    }

    try {
        // ===== FETCH DATA BY PAGE TYPE =====
        if (isTrashPage()) {
            const data = await getTrashNotes();
            allNotes = Array.isArray(data) ? data : (data?.notes || []);
            applyFilters();
            return;
        }

        if (isArchivePage()) {
            const data = await getArchivedNotes();
            allNotes = Array.isArray(data) ? data : (data?.notes || []);
            applyFilters();
            return;
        }

        else {
            notes = await getNotes(search || "");
        }
    } catch (err) {
        console.error("Failed to load notes:", err);
        showEmpty("Failed to load notes ❌");
        return;
    }

    // ===== IGNORE OLD REQUESTS =====
    if (requestId !== currentRequestId) return;

    // ===== SAFETY CHECK =====
    if (!Array.isArray(notes)) {
        console.warn("Invalid notes response:", notes);
        notes = [];
    }

    // ===== SORT PINS FIRST =====
    notes.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        if (a.pinned && b.pinned) return (b.pin_order || 0) - (a.pin_order || 0);
        return 0;
    });

    allNotes = notes;

    // IMPORTANT: prevent overwrite bugs on special pages
    if (isTrashPage() || isArchivePage()) {
        applyFilters();
        return;
    }

    // ===== CACHE ONLY FOR MAIN INDEX =====
    if (!search && !isTrashPage() && !isArchivePage()) {
        try {
            localStorage.setItem("notes_cache", JSON.stringify(notes));
        } catch (err) {
            console.warn("Cache write failed:", err);
        }
    }

    // ===== EMPTY STATE SAFETY =====
    if (notes.length === 0) {
        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes found ✍️");
    }


    console.log("PAGE CHECK:", {
        archive: isArchivePage(),
        trash: isTrashPage(),
        notes,
        type: typeof notes,
        isArray: Array.isArray(notes)
    });
    applyFilters();
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

// ===== APPLY FILTERS (SEARCH + TAG) =====
function applyFilters() {
    if (!Array.isArray(allNotes)) allNotes = [];

    const terms = currentSearch.split(/\s+/).filter(Boolean);

    let baseNotes = [...allNotes];

    // PAGE FILTERS
    if (isTrashPage()) {
        baseNotes = [...allNotes];
    } 
    else if (isArchivePage()) {
        baseNotes = [...allNotes];
    } 
    else if (!isTrashPage() && !isArchivePage()) {
        baseNotes = baseNotes.filter(n => !n.archived && !n.trashed);
    }

    // ===== EMPTY STATE SAFETY =====
    if (!baseNotes || baseNotes.length === 0) {
        const container = document.getElementById("notesContainer");
        if (container) container.replaceChildren();

        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes yet. Create one ✍️");
    }

    let filtered = baseNotes.filter(note => {
        const title = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tags = (note.tags || []).map(t => t.toLowerCase());

        const matchesSearch =
            terms.length === 0 ||
            terms.every(term =>
                title.includes(term) ||
                content.includes(term) ||
                tags.some(tag => tag.includes(term))
            );

        const matchesTag = currentTag
            ? (note.tags || []).includes(currentTag)
            : true;

        return matchesSearch && matchesTag;
    });

    if (filtered.length === 0) {
        showEmpty("No results found 🔍");
        return;
    }

    // RELEVANCE SORT
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

        // 🧠 Store deleted note
        lastDeletedNote = note;

        // 🧹 Remove from UI instantly
        allNotes = allNotes.filter(n => n._id !== noteId);
        applyFilters();

        // 🗑️ Backend delete
        await deleteNote(noteId);

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

// ===== RENDER NOTES =====
function renderNotes(notes) {
    if (!Array.isArray(notes)) notes = [];

    const container = document.getElementById("notesContainer");
    container.replaceChildren();

    notes = notes.filter(Boolean);

    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note";
        div.dataset.id = note._id;
        div.draggable = !isTrashPage();

        // ===== DRAG EVENTS (FIXED) =====
        div.draggable = !isTrashPage();

        div.addEventListener("dragstart", (e) => {
            if (e.target.closest("button") || e.target.isContentEditable) {
                e.preventDefault();
                return;
            }

            draggedNoteId = note._id;
            div.classList.add("dragging");
        });

        div.addEventListener("dragend", () => {
            draggedNoteId = null;
            div.classList.remove("dragging");
        });

        // ✅ ALLOW DROP
        div.addEventListener("dragover", (e) => {
            e.preventDefault();
        });

        // ✅ HANDLE DROP
        div.addEventListener("drop", async (e) => {
            e.preventDefault();

            const targetId = note._id;

            if (!draggedNoteId || draggedNoteId === targetId) return;

            await reorderNotesAction(draggedNoteId, targetId);
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
        contentEl.innerHTML = parseMarkdown(note.content || "");

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
        updatedEl.textContent =
            note.updated_at ? `Last edited: ${formatDate(note.updated_at)}` : "";

        const actionsEl = document.createElement("div");
        actionsEl.className = "note-actions";

        // ================= TRASH MODE =================
        if (isTrashPage()) {
            const restoreBtn = document.createElement("button");
            restoreBtn.textContent = "♻️ Restore";
            restoreBtn.onclick = () => restoreNoteAction(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "❌ Delete";
            deleteBtn.onclick = () => permanentDeleteNoteAction(note._id);

            actionsEl.append(restoreBtn, deleteBtn);
        }

        // ================= NORMAL MODE =================
        else {
            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.onclick = (e) => {
                e.stopPropagation();

                document.querySelectorAll(".note.editing").forEach(n => {
                    n.classList.remove("editing");
                });

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
            archiveBtn.textContent = isArchivePage() ? "↩️" : "📦";
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

            // ================= 🆕 HISTORY BUTTON =================
            const historyBtn = document.createElement("button");
            historyBtn.textContent = "🕒";
            historyBtn.title = "History";
            historyBtn.onclick = (e) => {
                e.stopPropagation();
                openHistory(note._id);
            };

            // Undo/redo
            const undoBtn = document.createElement("button");
            undoBtn.textContent = "↩️";
            undoBtn.onclick = () => undoEdit(note._id);

            const redoBtn = document.createElement("button");
            redoBtn.textContent = "↪️";
            redoBtn.onclick = () => redoEdit(note._id);

            actionsEl.addEventListener("mousedown", (e) => {
                e.stopPropagation();
            });

            actionsEl.append(
                editBtn,
                deleteBtn,
                pinBtn,
                archiveBtn,
                colorBtn,
                duplicateBtn,
                historyBtn,
                undoBtn,
                redoBtn
            );
        }

        contentContainer.append(titleEl, contentEl, tagsEl, updatedEl, actionsEl);
        div.appendChild(contentContainer);

        // ===== CLICK/DOUBLECLICK =====
        contentContainer.addEventListener("click", () => div.classList.toggle("open"));

        contentContainer.addEventListener("dblclick", () => {
            document.querySelectorAll(".note.editing").forEach(n => {
                n.classList.remove("editing");
            });

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
        await apiRequest(`/notes/duplicate/${id}`, "POST");
        loadNotes(currentSearch);
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

    archiveZone.addEventListener("drop", async (e) => {
        e.preventDefault();

        archiveZone.classList.remove("active");

        if (!draggedNoteId) return;

        await archiveNote(draggedNoteId);
        draggedNoteId = null;

        loadNotes(); // ✅ single source of truth
    });
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

function closeHistory() {
    document.getElementById("historyModal").classList.add("hidden");
}

// ===== DEBOUNCE UTILITY =====
function debounce(fn, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

const debouncedLoadNotes = debounce((value) => {
    loadNotes(value);
}, 300);

// ===== SORTING =====
document.getElementById("sortRecentBtn")?.addEventListener("click", () => {
    sortMode = sortMode === "recent" ? "default" : "recent";

    document.getElementById("sortRecentBtn").classList.toggle("active");

    loadNotes(currentSearch);
});

// ===== TAG SUGGESTIONS =====
const tagInput = document.getElementById("tagInput");
const tagSuggestions = document.getElementById("tagSuggestions");

let allTags = [];

async function loadTags() {
    allTags = await getTags();
    if (!Array.isArray(allTags)) allTags = [];
}

tagInput?.addEventListener("input", () => {
    const value = tagInput.value.toLowerCase();

    if (!value) {
        tagSuggestions.style.display = "none";
        return;
    }

    const matches = allTags.filter(tag => tag.includes(value));

    tagSuggestions.innerHTML = "";

    matches.forEach(tag => {
        const div = document.createElement("div");
        div.textContent = tag;

        div.onclick = () => {
            tagInput.value = tag;
            tagSuggestions.style.display = "none";
        };

        tagSuggestions.appendChild(div);
    });

    tagSuggestions.style.display = matches.length ? "block" : "none";
});

// call once on load
loadTags();

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

// ===== INFINITE SCROLL =====
async function loadMoreNotes() {
    if (isArchivePage() || isTrashPage()) return;
    if (isLoadingMore || !hasMore) return;

    isLoadingMore = true;

    try {
        const newNotes = await getNotesPaginated(currentPage + 1);

        if (!Array.isArray(newNotes) || newNotes.length === 0) {
            hasMore = false;
            return;
        }

        currentPage++;

        allNotes = [...allNotes, ...newNotes];
        applyFilters();

    } catch (err) {
        console.error("Pagination failed:", err);
    } finally {
        isLoadingMore = false;
    }
}

window.addEventListener("scroll", () => {
    if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 200
    ) {
        loadMoreNotes();
    }
});

console.log("Before filter:", allNotes.length);
console.log("After filter:", allNotes.length);

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

// ===== EMPTY TRASH =====
async function emptyTrash() {
    if (!confirm("This will permanently delete ALL trashed notes. Continue?")) return;

    await apiRequest("/notes/trash/empty", "DELETE");
    await loadNotes();
}

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
