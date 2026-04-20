// ===== UI STATES =====
function showLoading() {
    const container = document.getElementById("notesContainer");
    container.replaceChildren();

    const skeletonCount = 10; // can be increased

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

   // ===== ADVANCED FILTERING =====
    const filters = parseSearch(currentSearch);

    let filtered = baseNotes.filter(note => {
        const title = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tags = (note.tags || []).map(t => t.toLowerCase());

        // 🔤 TEXT SEARCH
        const matchesText =
            filters.text.length === 0 ||
            filters.text.every(term =>
                title.includes(term) ||
                content.includes(term) ||
                tags.some(tag => tag.includes(term))
            );

        // 🏷️ TAG FILTER
        const matchesTag =
            !filters.tag || tags.includes(filters.tag);

        // 📌 PIN FILTER
        const matchesPinned =
            filters.pinned === null || note.pinned === filters.pinned;

        // 📦 ARCHIVE FILTER
        const matchesArchived =
            filters.archived === null || note.archived === filters.archived;

        return matchesText && matchesTag && matchesPinned && matchesArchived;
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

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = "info", duration = 2500) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    // ===== ICON SYSTEM =====
    const icons = {
        success: "✅",
        error: "❌",
        warning: "⚠️",
        info: "ℹ️"
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close">✖</button>
    `;

    // ===== CLOSE BUTTON =====
    toast.querySelector(".toast-close").onclick = () => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    // ===== AUTO REMOVE (unless error) =====
    if (type !== "error") {
        setTimeout(() => {
            toast.classList.add("fade-out");
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}
