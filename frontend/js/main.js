// ===== GLOBAL STATE =====
let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null;

// 🔍 NEW: unified filter state
let currentSearch = "";
let currentTag = null;

// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    let url = search
        ? `/notes?search=${encodeURIComponent(search)}`
        : "/notes";

    let notes = await apiRequest(url);

    const isArchivePage = window.location.pathname.includes("archive");

    // Keep archive filtering
    notes = notes.filter(n => isArchivePage ? n.archived : !n.archived);

    // Keep pin sorting
    notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    allNotes = notes;

    applyFilters(); // 🔥 IMPORTANT: always go through filter system
}

// ===== APPLY FILTERS (SEARCH + TAG) =====
function applyFilters() {
    let filtered = allNotes.filter(note => {
        // 🔍 Search match
        const matchesSearch =
            (note.title || "").toLowerCase().includes(currentSearch) ||
            (note.content || "").toLowerCase().includes(currentSearch);

        // 🏷️ Tag match
        const matchesTag = currentTag
            ? (note.tags || []).includes(currentTag)
            : true;

        return matchesSearch && matchesTag;
    });

    renderNotes(filtered);
}

// ===== SEARCH (HYBRID: BACKEND + INSTANT UI) =====
document.getElementById("searchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();

    currentSearch = query;

    // ⚡ instant UI update
    applyFilters();

    // ⏳ backend refresh (debounced)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadNotes(query);
    }, 300);
});

// ===== RENDER NOTES =====
function renderNotes(notes) {
    const container = document.getElementById("notesContainer");
    container.innerHTML = "";

    const isArchivePage = window.location.pathname.includes("archive");

    notes.forEach(note => {
        const div = document.createElement("div");
        div.className = "note";
        div.draggable = true;
        div.dataset.id = note._id;

        // ===== DRAG EVENTS =====
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

        // ===== NOTE CONTENT =====
        div.innerHTML = `
            <h3>${note.title || "Untitled"}</h3>
            <div class="note-content">${note.content || ""}</div>
            <div class="tags">
                ${(note.tags || []).map(tag =>
                    `<span onclick="filterByTag('${tag}')">${tag}</span>`
                ).join("")}
            </div>
            <div class="note-actions">
                <button onclick="editNote('${note._id}')">Edit</button>
                <button onclick="deleteNote('${note._id}')">Delete</button>
                <button onclick="togglePin('${note._id}')">📌</button>
                <button onclick="toggleArchive('${note._id}')">
                    ${isArchivePage ? "↩️" : "📦"}
                </button>
            </div>
        `;

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

    applyFilters(); // 🔥 keep filters applied after reorder
}

// ===== CREATE NOTE =====
async function createNote() {
    const title = document.getElementById("noteTitle").value;
    const content = document.getElementById("noteContent").innerHTML;

    await apiRequest("/notes", "POST", {
        title,
        content,
        tags: []
    });

    document.getElementById("noteTitle").value = "";
    document.getElementById("noteContent").innerHTML = "";

    await loadNotes(currentSearch); // 🔥 preserve search after create
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
    // Toggle tag on/off
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

        await apiRequest(`/notes/${id}`, "PUT", {
            title: updatedTitle,
            content: updatedContent
        });

        document.getElementById("noteTitle").value = "";
        document.getElementById("noteContent").innerHTML = "";

        document.getElementById("addNoteBtn").onclick = createNote;

        await loadNotes(currentSearch);
    };
}

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNote);
loadNotes();
