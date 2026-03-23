// ===== GLOBAL STATE =====
let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null; // debounce timer

// ===== LOAD NOTES =====
async function loadNotes(search = "") {
    // 🔍 If search exists, send it to backend
    let url = search
        ? `/notes?search=${encodeURIComponent(search)}`
        : "/notes";

    let notes = await apiRequest(url);

    const isArchivePage = window.location.pathname.includes("archive");

    // Filter archive state (UNCHANGED)
    notes = notes.filter(n => isArchivePage ? n.archived : !n.archived);

    // Sort pinned (UNCHANGED)
    notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    allNotes = notes;

    renderNotes(notes);
}

// ===== SEARCH (UPGRADED, SAFE) =====
document.getElementById("searchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.trim();

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        loadNotes(query); // 🔥 backend search
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

    renderNotes(notes);
    // Optional: persist order to backend later
}

// ===== CREATE NOTE =====
async function createNote() {
    const title = document.getElementById("noteTitle").value;
    const content = document.getElementById("noteContent").innerHTML;

    await apiRequest("/notes", "POST", {
        title,
        content,
        tags: [] // can add tag input later
    });

    // Clear inputs after saving
    document.getElementById("noteTitle").value = "";
    document.getElementById("noteContent").innerHTML = "";

    await loadNotes();
}

// ===== DELETE NOTE =====
async function deleteNote(id) {
    if (!confirm("Delete this note?")) return;

    // 🔹 FIXED: Proper string syntax
    await apiRequest(`/notes/${id}`, "DELETE");
    await loadNotes();
}

// ===== PIN NOTE =====
async function togglePin(id) {
    await apiRequest(`/notes/pin/${id}`, "PUT");
    await loadNotes();
}

// ===== ARCHIVE NOTE =====
async function toggleArchive(id) {
    await apiRequest(`/notes/archive/${id}`, "PUT");
    await loadNotes();
}

// ===== SEARCH NOTES =====
document.getElementById("searchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();

    const filtered = allNotes.filter(n =>
        (n.title || "").toLowerCase().includes(query) ||
        (n.content || "").toLowerCase().includes(query)
    );

    renderNotes(filtered);
});

// ===== TAG FILTER =====
function filterByTag(tag) {
    const filtered = allNotes.filter(n => (n.tags || []).includes(tag));
    renderNotes(filtered);
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

    // Override addNoteBtn for updating
    document.getElementById("addNoteBtn").onclick = async () => {
        const updatedTitle = document.getElementById("noteTitle").value;
        const updatedContent = document.getElementById("noteContent").innerHTML;

        await apiRequest(`/notes/${id}`, "PUT", {
            title: updatedTitle,
            content: updatedContent
        });

        // Clear inputs
        document.getElementById("noteTitle").value = "";
        document.getElementById("noteContent").innerHTML = "";

        // Restore default click
        document.getElementById("addNoteBtn").onclick = createNote;

        await loadNotes();
    };
}

// ===== INIT =====
document.getElementById("addNoteBtn")?.addEventListener("click", createNote);
loadNotes();
