// GLOBAL SAFE STATE

let checkboxCache = []; // cache for checkboxes to optimize bulk selection

// MUST be global-safe across files
window.markdownCache = window.markdownCache || new Map(); // cache for parsed markdown to avoid redundant parsing
window.isLoadingNotes = false; // global loading state to prevent duplicate fetches and manage skeleton display

let debouncedRender; // will hold the debounced version of renderNotes, initialized on DOMContentLoaded
let lastRenderedIds = []; // track last rendered note IDs to prevent unnecessary re-renders when data hasn't changed
let activeNoteId = null;// track currently active note being edited for collaboration purposes
let activeNoteVersion = null;// track version of the active note to detect external updates during collaboration
let collaborationInterval = null;// interval ID for collaboration polling, so we can stop it when user stops editing or navigates away

// GLOBAL UTILS (SAFE FALLBACKS)

// debounce MUST exist BEFORE usage anywhere
function debounce(fn, delay = 300) {
    let timeout; // closure to store timeout ID for debouncing
    return (...args) => { // clear previous timeout if function is called again within delay period
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// expose globally (prevents cross-file issues)
window.debounce = debounce;

// INIT

document.addEventListener("DOMContentLoaded", () => {
    debouncedRender = debounce(renderNotes, 50);
});

// UI STATES

// MUST be global because main-3-load.js calls it immediately
window.showLoading = function () {
    const container = document.getElementById("notesContainer");
    if (!container) return;

    // Prevent duplicate skeleton loads
    if (window.isLoadingNotes) return;

    // Don't wipe existing notes during refreshes
    const existingNotes = container.querySelector(".note");

    if (existingNotes) {
        return;
    }

    window.isLoadingNotes = true;

    container.replaceChildren();

    requestAnimationFrame(() => {
        // Show skeletons only if loading takes more than 100ms to prevent flicker on fast loads
        const skeletonCount = 10;

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < skeletonCount; i++) {
            const div = document.createElement("div");
            div.className = "skeleton";

            div.innerHTML = `
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
                <div class="skeleton-text short"></div>
            `;

            fragment.appendChild(div);
        }

        container.appendChild(fragment);
    });
};

// safe fallback
window.showEmpty = function (message = "No notes yet") {
    // Clear existing notes or skeletons
    const container = document.getElementById("notesContainer");
    if (!container) return; // prevent errors if container is missing

    container.innerHTML = `<div class="state-message">${message}</div>`;
};

// MODAL HANDLING

// Reference to the modal element (set after DOM loads)
let modal;

// Initialize modal and attach event listeners once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    modal = document.getElementById("modal");

    const modalOverlay = modal?.querySelector(".modal-overlay");
    const modalCloseBtn = modal?.querySelector(".close-btn");

    // Close modal when clicking outside content (overlay)
    modalOverlay?.addEventListener("click", closeModal);

    // Close modal via explicit close button
    modalCloseBtn?.addEventListener("click", closeModal);
});

// Opens modal with animation
function openModal() {
    if (!modal) return;

    // Remove hidden state first so element becomes visible
    modal.classList.remove("hidden");

    // Small delay ensures CSS transition triggers properly
    setTimeout(() => modal.classList.add("active"), 10);
}

// Closes modal with animation
function closeModal() {
    if (!modal) return;

    // Start fade-out transition
    modal.classList.remove("active");

    // Delay hiding until animation completes
    setTimeout(() => modal.classList.add("hidden"), 250);
}

// Generic modal handler (reusable for confirmations, prompts, etc.)
function showModal(title, message, onConfirm, onCancel) {
    if (!modal) return;

    const modalTitle = modal.querySelector(".modal-title");
    const modalMessage = modal.querySelector(".modal-message");
    const confirmBtn = modal.querySelector(".modal-confirm");
    const cancelBtn = modal.querySelector(".modal-cancel");

    // Inject dynamic content
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // Assign actions dynamically (decouples modal from specific logic)
    confirmBtn.onclick = () => {
        modal.classList.remove("active");
        onConfirm?.(); // optional chaining avoids errors if undefined
    };

    cancelBtn.onclick = () => {
        modal.classList.remove("active");
        onCancel?.();
    };

    // Show modal
    modal.classList.add("active");
}

// ===== RENDER NOTES =====
// Responsible for rendering note cards based on current data
// Uses caching and ID tracking to optimize performance and prevent unnecessary re-renders
function renderNotes(notes) {
    checkboxCache = []; // reset checkbox cache on each render to ensure it stays in sync with current notes

    // ===== SAFETY CHECKS =====
    // Ensure notes is an array before proceeding to prevent runtime errors
    if (!Array.isArray(notes)) notes = [];

    const container = document.getElementById("notesContainer");
    if (!container) return;

    // Remove any null/undefined notes that might have slipped through to prevent rendering errors
    notes = notes.filter(Boolean);

    const ids = notes.map(n => n._id);

    // ===== RENDER OPTIMIZATION =====
    // Prevent unnecessary re-render
    if (
        ids.length === lastRenderedIds.length &&
        ids.every((id, i) => id === lastRenderedIds[i])
    ) {
        window.isLoadingNotes = false;
        return;
    }

    lastRenderedIds = ids;

    // ===== SKIP EMPTY DURING LOADING =====
    // prevents skeleton flicker being overwritten by empty render
    if (window.isLoadingNotes && notes.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();

    // Only clear container when NOT loading (keeps skeleton visible until notes are ready)
    if (!window.isLoadingNotes || container.children.length === 0) {
        container.replaceChildren();
    }

    notes = notes.filter(Boolean);

    // ===== RENDER EACH NOTE =====
    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note";
        div.dataset.id = note._id;
        // Only allow dragging if not in trash (archived notes can still be reordered)
        div.draggable = !isTrashPage();
        // Set background color based on note's color property, with a default fallback
        div.style.backgroundColor = note.color || "#ffffff";

        // ================= CHECKBOX =================
        // Used for bulk actions - only show if select mode is active
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "note-checkbox";

        checkbox.checked = selectedNotes.has(note._id);
        checkbox.style.display = selectMode ? "inline-block" : "none";

        // Sync selection state with global selectedNotes set and update "select all" checkbox accordingly
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                selectedNotes.add(note._id);
            } else {
                selectedNotes.delete(note._id);
            }

            // Update "select all" checkbox state based on current selection
            const visible = checkboxCache.filter(
                cb => cb.style.display !== "none"
            );

            // If all visible checkboxes are checked, mark "select all" as checked, otherwise uncheck it
            const allChecked =
                visible.length > 0 &&
                visible.every(cb => cb.checked);

            // Update "select all" checkbox state
            const selectAllCheckbox =
                document.getElementById("selectAllNotes");

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allChecked;
            }
        });

        div.appendChild(checkbox);
        checkboxCache.push(checkbox);

        // ================= CONTENT =================
        const contentContainer = document.createElement("div");
        contentContainer.className = "note-inner";

        const titleEl = document.createElement("h3");
        titleEl.textContent = note.title || "Untitled";

        const contentEl = document.createElement("div");
        contentEl.className = "note-content";

        const raw = note.content || "";

        // Cache parsed markdown to optimize performance, especially during edits when content may not change between renders
        if (!window.markdownCache.has(note._id)) {
            window.markdownCache.set(
                note._id,
                parseMarkdown(raw)
            );
        }

        contentEl.innerHTML = window.markdownCache.get(note._id);
        contentEl.dataset.raw = raw;

        // ================= TAGS =================
        const tagsEl = document.createElement("div");
        tagsEl.className = "tags";

        // Add click listeners to tags for filtering by tag when clicked
        (note.tags || []).forEach(tag => {
            const span = document.createElement("span");
            span.textContent = tag;

            // clicking a tag filters notes by that tag (toggle behavior)
            span.addEventListener("click", () => {
                filterByTag(tag);
            });

            tagsEl.appendChild(span);
        });

        // ================= UPDATED =================
        const updatedEl = document.createElement("small");
        updatedEl.className = "note-updated";

        updatedEl.textContent = note.updated_at
            ? `Last edited: ${formatDate(note.updated_at)}`
            : "";

        // ================= ACTIONS =================
        const actionsEl = document.createElement("div");
        actionsEl.className = "note-actions";

        if (isTrashPage()) { // only show restore/permanent delete in trash to prevent accidental loss of notes
            const restoreBtn = document.createElement("button");
            restoreBtn.textContent = "♻️";
            restoreBtn.title = "Restore note";
            restoreBtn.onclick = () =>
                restoreNoteAction(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "🗑️";
            deleteBtn.title = "Permanently delete note";
            deleteBtn.onclick = () =>
                permanentDeleteNoteAction(note._id);

            actionsEl.append(restoreBtn, deleteBtn);
        }

        else if (isArchivePage()) { // only show unarchive/delete in archive to prevent accidental loss of notes and keep UI focused on archived note management
            const unarchiveBtn = document.createElement("button");
            unarchiveBtn.textContent = "↩️";
            unarchiveBtn.title = "Unarchive note";
            unarchiveBtn.onclick = () =>
                toggleArchiveAction(note._id);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "🗑️";
            deleteBtn.title = "Move to trash";
            deleteBtn.onclick = () =>
                deleteNoteAnimated(div, note._id);

            actionsEl.append(unarchiveBtn, deleteBtn);
        }

        else {
            // ===== PRIMARY ACTIONS =====

            // ===== EDIT BUTTON =====
            // Edit button allows users to enter edit mode for the note, enabling inline editing of title and content. 
            // It also initiates collaborative editing features by marking the note as being edited and starting polling for updates from other collaborators.
            const editBtn = document.createElement("button");
            editBtn.textContent = "✏️";
            editBtn.title = "Edit note";
            editBtn.setAttribute("aria-label", "Edit note");

            editBtn.onclick = async (e) => {
                e.stopPropagation();
                // If already editing this note, do nothing (prevents multiple edit buttons from causing issues)
                document
                    .querySelectorAll(".note.editing")
                    .forEach(n => n.classList.remove("editing"));

                div.classList.add("editing");

                await startCollaborativeEditing(note._id); // Start collaborative editing session for this note
                enableInlineEdit(div, note); // enable inline editing
            };

            // ===== PIN BUTTON =====
            const pinBtn = document.createElement("button");
            pinBtn.textContent = "📌";
            pinBtn.title = note.pinned ? "Unpin note" : "Pin note";
            pinBtn.setAttribute(
                "aria-label",
                note.pinned ? "Unpin note" : "Pin note"
            );

            pinBtn.onclick = () => togglePinAction(note._id);

            // ===== SHARE BUTTON =====
            const shareBtn = document.createElement("button");
            shareBtn.textContent = "🤝";
            shareBtn.title = "Share note";
            shareBtn.setAttribute("aria-label", "Share note");

            shareBtn.onclick = (e) => {
                e.stopPropagation();
                openShareModal(note);
            };

            // ===== HAMBURGER MENU BUTTON =====
            const moreBtn = document.createElement("button");
            moreBtn.textContent = "...";
            moreBtn.title = "More actions";
            moreBtn.setAttribute("aria-label", "More actions");

            // ===== DROPDOWN MENU =====
            const menu = document.createElement("div");
            menu.classList.add("note-menu");
            menu.style.display = "none";

            // Helper to create menu items with consistent styling and behavior
            const createMenuItem = (label, tooltip, onClick) => {
                const btn = document.createElement("button");
                btn.textContent = label;

                // ✅ Tooltip + accessibility
                btn.title = tooltip;
                btn.setAttribute("aria-label", tooltip);

                btn.onclick = (e) => {
                    e.stopPropagation();
                    menu.style.display = "none";
                    onClick();
                };
                return btn;
            };

            // Secondary actions
            const deleteItem = createMenuItem("🗑️", "Move to trash", () =>
                deleteNoteAnimated(div, note._id)
            );

            const archiveItem = createMenuItem("📦",
                note.archived ? "Unarchive note" : "Archive note",
                () => toggleArchiveAction(note._id)
            );

            const colorItem = createMenuItem("🎨", "Change color", () =>
                showColorPopup(note._id, moreBtn)
            );

            const duplicateItem = createMenuItem("📄", "Duplicate note", () =>
                duplicateNote(note._id)
            );

            const historyItem = createMenuItem("🕒", "View history", () =>
                openHistory(note._id)
            );

            // Append items to menu
            menu.append(
                deleteItem,
                archiveItem,
                colorItem,
                duplicateItem,
                historyItem
            );

            // Toggle menu
            moreBtn.onclick = (e) => {
                e.stopPropagation();

                // Close other menus
                document
                    .querySelectorAll(".note-menu")
                    .forEach(m => {
                        if (m !== menu) m.style.display = "none";
                    });

                menu.style.display =
                    menu.style.display === "none" ? "block" : "none";
            };

            // Close menu on outside click
            document.addEventListener("click", () => {
                menu.style.display = "none";
            });

            // ===== APPEND =====
            actionsEl.append(editBtn, pinBtn, shareBtn, moreBtn);
            div.appendChild(menu);
        }

        // Assemble note structure
        contentContainer.append(
            titleEl,
            contentEl,
            tagsEl,
            updatedEl,
            actionsEl
        );

        div.appendChild(contentContainer);
        fragment.appendChild(div);
    });

    // Replace skeletons with actual notes
    container.replaceChildren(fragment);

    // loading officially ends here
    window.isLoadingNotes = false;
}

// ===== COLLABORATIVE EDITING =====
async function startCollaborativeEditing(noteId) {
    try {
        const note = await fetchSingleNote(noteId); // ensure we have the latest version before editing

        activeNoteId = noteId;
        activeNoteVersion = note.version;

        await markEditing(noteId);

        startCollaborationPolling(noteId);

        if (
            note.currently_editing &&
            note.currently_editing !== localStorage.getItem("user_id")
        ) {
            showToast(
                "Another collaborator is currently editing this note.",
                "warning"
            ); // non-blocking warning, user can still edit but should be aware of potential conflicts
        }

    } catch (err) {
        console.error("Collaboration start failed:", err);
    }
}

// stop polling when user leaves the page or stops editing
function startCollaborationPolling(noteId) {
    stopCollaborationPolling();

    // poll every 4 seconds for updates
    collaborationInterval = setInterval(async () => {
        try {
            const latest = await fetchSingleNote(noteId); // get latest version from server

            if (!latest) return; // note might have been deleted

            if (latest.version > activeNoteVersion) {
                const activeNote =
                    document.querySelector(`.note[data-id="${noteId}"]`); // find the currently active note element

                if (!activeNote) return; // note element might not be in DOM if user navigated away

                const titleEditor =
                    activeNote.querySelector(".edit-title"); // find the title editor within the active note

                const contentEditor =
                    activeNote.querySelector(".edit-content"); // find the content editor within the active note

                if (titleEditor) {
                    titleEditor.value = latest.title;
                } // if the title/content editors exist, update their values with the latest from the server.
                // This ensures that if another collaborator has made changes, the user will see those changes 
                // reflected in their editor without needing to refresh the page.

                if (contentEditor) {
                    contentEditor.value = latest.content;
                } // update the active version to the latest so we don't keep showing the toast on every poll

                activeNoteVersion = latest.version;

                showToast(
                    "Note updated by another collaborator",
                    "warning"
                );
            }

        } catch (err) {
            console.error("Collaboration polling failed:", err);
        }
    }, 4000);
}

// stop polling when user leaves the page or stops editing
function stopCollaborationPolling() {
    if (collaborationInterval) {
        clearInterval(collaborationInterval);
        collaborationInterval = null;
    } // reset active note tracking when stopping polling (e.g. when user stops editing or navigates away) to prevent stale state if they later start editing a different note

    activeNoteId = null;
    activeNoteVersion = null;
}

// ===== DRAG & DROP =====
// Uses event delegation (single listeners on document) for better performance

// When dragging starts
document.addEventListener("dragstart", (e) => {
    // Find the closest note element being dragged
    const note = e.target.closest(".note");
    if (!note) return;

    // Prevent drag if user is interacting with buttons or editing content
    // (avoids accidental drags while clicking or typing)
    if (e.target.closest("button") || e.target.isContentEditable) {
        e.preventDefault();
        return;
    }

    // Store dragged note ID globally for use on drop
    draggedNoteId = note.dataset.id;

    // Add visual feedback (e.g. opacity or border via CSS)
    note.classList.add("dragging");
});

// When dragging ends (cleanup)
document.addEventListener("dragend", (e) => {
    const note = e.target.closest(".note");
    if (!note) return;

    // Reset drag state
    draggedNoteId = null;

    // Remove visual feedback
    note.classList.remove("dragging");
});

// Allow dropping by preventing default browser behavior
document.addEventListener("dragover", (e) => {
    if (e.target.closest(".note")) e.preventDefault();
});

// When item is dropped
document.addEventListener("drop", async (e) => {
    const target = e.target.closest(".note");

    // Ensure valid drop target and active drag
    if (!target || !draggedNoteId) return;

    e.preventDefault();

    const targetId = target.dataset.id;

    // Ignore dropping onto itself
    if (draggedNoteId === targetId) return;

    // Persist new order via backend
    await reorderNotesAction(draggedNoteId, targetId);
});

// ===== APPLY FILTERS =====
// Applies search + tag + state filters, then triggers rendering
function applyFilters() {

    // Ensure global notes state is always valid
    if (!Array.isArray(allNotes)) allNotes = [];

    // Work on a copy to avoid mutating original state
    let baseNotes = [...allNotes];

    // ===== DEFAULT FILTERING =====
    // On main page: hide archived and trashed notes
    if (!isTrashPage() && !isArchivePage()) {
        baseNotes = baseNotes.filter(
            n => n.archived !== true && n.trashed !== true
        );
    }

    // ===== EMPTY STATE HANDLING =====
    // Show appropriate UI messages depending on context
    if (!baseNotes.length) {
        const container = document.getElementById("notesContainer");

        // Avoid clearing UI while still loading
        if (!window.isLoadingNotes) {
            container?.replaceChildren();
        }

        if (isTrashPage()) return showEmpty("Trash is empty 🗑️");
        if (isArchivePage()) return showEmpty("No archived notes 📦");
        return showEmpty("No notes yet. Create one ✍️");
    }

    // Parse structured search filters (e.g. tag:, pinned:)
    const filters = parseSearch(currentSearch);

    // Split search into individual terms for matching + scoring
    const terms = currentSearch.split(/\s+/).filter(Boolean);

    // ===== FILTER LOGIC =====
    let filtered = baseNotes.filter(note => {
        const title = (note.title || "").toLowerCase();
        const content = (note.content || "").toLowerCase();
        const tags = (note.tags || []).map(t => t.toLowerCase());

        return (
            // Text search: all terms must match somewhere
            (filters.text.length === 0 ||
                filters.text.every(t =>
                    title.includes(t) ||
                    content.includes(t) ||
                    tags.some(tag => tag.includes(t))
                )) &&

            // Tag filter
            (!filters.tag || tags.includes(filters.tag)) &&

            // Pinned filter
            (filters.pinned === null || note.pinned === filters.pinned) &&

            // Archived filter
            (filters.archived === null || note.archived === filters.archived)
        );
    });

    // ===== NO RESULTS =====
    if (!filtered.length) return showEmpty("No results found 🔍");

    // ===== SEARCH RANKING =====
    // Improve UX by ranking more relevant results higher
    if (terms.length) {
        filtered.sort((a, b) => {

            // Simple scoring system
            const score = (n) => {
                let s = 0;

                const t = (n.title || "").toLowerCase();
                const c = (n.content || "").toLowerCase();
                const tg = (n.tags || []).join(" ").toLowerCase();

                terms.forEach(term => {
                    if (t.includes(term)) s += 3;  // title matches are most important
                    if (c.includes(term)) s += 2;  // content matches medium importance
                    if (tg.includes(term)) s += 1; // tag matches lowest weight
                });

                return s;
            };

            return score(b) - score(a); // higher score first
        });
    }

    // ===== RENDER RESULT =====
    // Use debounced render to avoid excessive DOM updates
    debouncedRender(filtered);
}

// ===== SAVING =====
function showSavingIndicator(noteElement) {
    let indicator = noteElement.querySelector(".saving-indicator");

    // If indicator already exists, reset the timer by removing and re-adding it
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

// ===== TOAST NOTIFICATIONS =====
// Lightweight feedback system for user actions (success, error, etc.)
function showToast(message, type = "info", duration = 2500) {

    // Find container where all toasts live
    const container = document.getElementById("toastContainer");
    if (!container) return;

    // Create toast element
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`; // dynamic styling

    // Icon mapping for visual feedback
    const icons = {
        success: "✅",
        error: "❌",
        warning: "⚠️",
        info: "ℹ️"
    };

    // Build toast UI
    toast.innerHTML = `
        <span>${icons[type] || icons.info}</span>
        <span>${message}</span>
        <button>✖</button>
    `;

    // Manual dismiss button
    toast.querySelector("button").onclick = () => {
        toast.classList.add("fade-out"); // CSS animation
        setTimeout(() => toast.remove(), 300);
    };

    // Add to DOM
    container.appendChild(toast);

    // Auto-dismiss after duration
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, duration);
}


// ===== AUTO-SAVE / CLICK-OUTSIDE LOGIC =====
// Detect when user clicks outside an editing note and auto-save
document.addEventListener("click", (e) => {

    const activeNote = document.querySelector(".note.editing");
    if (!activeNote) return;

    const clickedInside = activeNote.contains(e.target);
    const clickedButton = e.target.closest("button");

    // Ignore clicks inside note or on buttons (to prevent accidental saves)
    if (clickedInside || clickedButton) return;

    // ===== COMMIT EDIT =====
    const saveBtn = activeNote.querySelector(".save-btn");

    if (saveBtn) {
        saveBtn.click(); // preferred explicit save
    } else {
        // fallback: trigger blur event on editable content
        const editable = activeNote.querySelector("[contenteditable='true']");
        if (editable) editable.blur();
    }

    // Exit editing mode + stop collaboration polling
    activeNote.classList.remove("editing");
    stopCollaborationPolling();
});


// ===== CONFIRM POPUP (ASYNC MODAL) =====
// Custom modal that returns a Promise (true/false)
function showConfirmPopup(message) {

    return new Promise((resolve) => {

        // Create overlay
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";

        // Modal structure
        overlay.innerHTML = `
            <div class="modal">
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn-cancel">Cancel</button>
                    <button class="btn-confirm">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const cancelBtn = overlay.querySelector(".btn-cancel");
        const confirmBtn = overlay.querySelector(".btn-confirm");

        // Clean up DOM + resolve Promise
        function cleanup(result) {
            overlay.remove();
            resolve(result);
        }

        cancelBtn.onclick = () => cleanup(false);
        confirmBtn.onclick = () => cleanup(true);

        // Clicking outside modal cancels
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup(false);
        };
    });
}


// ===== INPUT POPUP (ASYNC PROMPT) =====
// Modal with input field (used for things like sharing via email)
function showInputPopup(message, placeholder = "") {

    return new Promise((resolve) => {

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";

        overlay.innerHTML = `
            <div class="modal">
                <p>${message}</p>
                <input 
                    type="email" 
                    class="modal-input" 
                    placeholder="${placeholder}"
                />
                <div class="modal-actions">
                    <button class="btn-cancel">Cancel</button>
                    <button class="btn-confirm">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector(".modal-input");
        const cancelBtn = overlay.querySelector(".btn-cancel");
        const confirmBtn = overlay.querySelector(".btn-confirm");

        input.focus(); // improve UX

        function cleanup(value) {
            overlay.remove();
            resolve(value);
        }

        cancelBtn.onclick = () => cleanup(null);

        confirmBtn.onclick = () => {
            const value = input.value.trim();
            cleanup(value || null); // return null if empty
        };

        // Click outside cancels
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup(null);
        };
    });
}
