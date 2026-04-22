let checkboxCache = [];
const markdownCache = new Map();

let debouncedRender;

// ===== INIT (safe debounce setup) =====
document.addEventListener("DOMContentLoaded", () => {
    debouncedRender = debounce(renderNotes, 50);
});

// ===== UI STATES =====
function showLoading() {
    const container = document.getElementById("notesContainer");
    container.replaceChildren();

    const skeletonCount = 10;

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
let modal;

document.addEventListener("DOMContentLoaded", () => {
    modal = document.getElementById("modal");

    const modalOverlay = modal?.querySelector(".modal-overlay");
    const modalCloseBtn = modal?.querySelector(".close-btn");

    modalOverlay?.addEventListener("click", closeModal);
    modalCloseBtn?.addEventListener("click", closeModal);
});

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
        onConfirm?.();
    };

    cancelBtn.onclick = () => {
        modal.classList.remove("active");
        onCancel?.();
    };

    modal.classList.add("active");
}

let lastRenderedIds = [];

// ===== RENDER NOTES =====
function renderNotes(notes) {
    checkboxCache = [];

    if (!Array.isArray(notes)) notes = [];
    const fragment = document.createDocumentFragment();

    const ids = notes.map(n => n._id);

    if (
        ids.length === lastRenderedIds.length &&
        ids.every((id, i) => id === lastRenderedIds[i])
    ) return;

    lastRenderedIds = ids;

    const container = document.getElementById("notesContainer");
    container.replaceChildren();

    notes = notes.filter(Boolean);

    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note";
        div.dataset.id = note._id;
        div.draggable = !isTrashPage();
        div.style.backgroundColor = note.color || "#ffffff";

        // ===== CHECKBOX =====
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "note-checkbox";
        checkbox.checked = selectedNotes.has(note._id);
        checkbox.style.display = selectMode ? "inline-block" : "none";

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedNotes.add(note._id);
            else selectedNotes.delete(note._id);

            const visible = checkboxCache.filter(cb => cb.style.display !== "none");
            const allChecked = visible.length > 0 && visible.every(cb => cb.checked);

            const selectAllCheckbox = document.getElementById("selectAllNotes");
            if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
        });

        div.appendChild(checkbox);
        checkboxCache.push(checkbox);

        // ===== NOTE CONTENT =====
        const contentContainer = document.createElement("div");
        contentContainer.className = "note-inner";

        const titleEl = document.createElement("h3");
        titleEl.textContent = note.title || "Untitled";

        const contentEl = document.createElement("div");
        contentEl.className = "note-content";

        const raw = note.content || "";

        if (!markdownCache.has(note._id)) {
            markdownCache.set(note._id, parseMarkdown(raw));
        }

        contentEl.innerHTML = markdownCache.get(note._id);

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
        updatedEl.textContent = note.updated_at
            ? `Last edited: ${formatDate(note.updated_at)}`
            : "";

        const actionsEl = document.createElement("div");
        actionsEl.className = "note-actions";

        if (isTrashPage()) {
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
                document.querySelectorAll(".note.editing")
                    .forEach(n => n.classList.remove("editing"));

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
            duplicateBtn.onclick = () => duplicateNote(note._id);

            const historyBtn = document.createElement("button");
            historyBtn.textContent = "🕒";
            historyBtn.onclick = (e) => {
                e.stopPropagation();
                openHistory(note._id);
            };

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
                historyBtn,
                undoBtn,
                redoBtn
            );
        }

        contentContainer.append(titleEl, contentEl, tagsEl, updatedEl, actionsEl);
        div.appendChild(contentContainer);

        contentContainer.addEventListener("click", () =>
            div.classList.toggle("open")
        );

        contentContainer.addEventListener("dblclick", () => {
            document.querySelectorAll(".note.editing")
                .forEach(n => n.classList.remove("editing"));

            div.classList.add("editing");
            enableInlineEdit(div, note);
        });

        if (note.pinned) div.classList.add("pinned");

        fragment.appendChild(div);
    });

    container.appendChild(fragment);
}

// ===== DRAG & DROP =====
let draggedNoteId = null;

document.addEventListener("dragstart", (e) => {
    const note = e.target.closest(".note");
    if (!note) return;

    if (e.target.closest("button") || e.target.isContentEditable) {
        e.preventDefault();
        return;
    }

    draggedNoteId = note.dataset.id;
    note.classList.add("dragging");
});

document.addEventListener("dragend", (e) => {
    const note = e.target.closest(".note");
    if (!note) return;

    draggedNoteId = null;
    note.classList.remove("dragging");
});

document.addEventListener("dragover", (e) => {
    if (e.target.closest(".note")) e.preventDefault();
});

document.addEventListener("drop", async (e) => {
    const target = e.target.closest(".note");
    if (!target || !draggedNoteId) return;

    e.preventDefault();

    const targetId = target.dataset.id;
    if (draggedNoteId === targetId) return;

    await reorderNotesAction(draggedNoteId, targetId);
});

// ===== APPLY FILTERS =====
function applyFilters() {
    if (!Array.isArray(allNotes)) allNotes = [];

    let baseNotes = [...allNotes];

    if (!isTrashPage() && !isArchivePage()) {
        baseNotes = baseNotes.filter(n => !n.archived && !n.trashed);
    }

    if (!baseNotes.length) {
        const container = document.getElementById("notesContainer");
        container?.replaceChildren();

        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes yet. Create one ✍️");
    }

    const filters = parseSearch(currentSearch);
    const terms = currentSearch.split(/\s+/).filter(Boolean);

    let filtered = baseNotes.filter(note => {
        const title = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tags = (note.tags || []).map(t => t.toLowerCase());

        return (
            (filters.text.length === 0 ||
                filters.text.every(t =>
                    title.includes(t) ||
                    content.includes(t) ||
                    tags.some(tag => tag.includes(t))
                )) &&
            (!filters.tag || tags.includes(filters.tag)) &&
            (filters.pinned === null || note.pinned === filters.pinned) &&
            (filters.archived === null || note.archived === filters.archived)
        );
    });

    if (!filtered.length) return showEmpty("No results found 🔍");

    if (terms.length) {
        filtered.sort((a, b) => {
            const score = (n) => {
                let s = 0;
                const t = (n.title || "").toLowerCase();
                const c = (n.content || "").toLowerCase();
                const tg = (n.tags || []).join(" ").toLowerCase();

                terms.forEach(term => {
                    if (t.includes(term)) s += 3;
                    if (c.includes(term)) s += 2;
                    if (tg.includes(term)) s += 1;
                });

                return s;
            };
            return score(b) - score(a);
        });
    }

    debouncedRender(filtered);
}

// ===== SAVING =====
function showSavingIndicator(noteElement) {
    let indicator = noteElement.querySelector(".saving-indicator");

    if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "saving-indicator";
        indicator.textContent = "Saving...";
        indicator.style.fontSize = "12px";
        indicator.style.opacity = "0.7";
        indicator.style.marginLeft = "8px";

        const actions = noteElement.querySelector(".note-actions");
        (actions || noteElement).appendChild(indicator);
    }

    setTimeout(() => indicator?.remove(), 1000);
}

// ===== TOAST =====
function showToast(message, type = "info", duration = 2500) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icons = {
        success: "✅",
        error: "❌",
        warning: "⚠️",
        info: "ℹ️"
    };

    toast.innerHTML = `
        <span>${icons[type] || icons.info}</span>
        <span>${message}</span>
        <button>✖</button>
    `;

    toast.querySelector("button").onclick = () => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    if (type !== "error") {
        setTimeout(() => {
            toast.classList.add("fade-out");
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}
