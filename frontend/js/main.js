// =========================
// DOM Elements
// =========================
const notesContainer = document.getElementById("notesContainer");
const addNoteBtn = document.getElementById("addNoteBtn");
const titleInput = document.getElementById("noteTitle");
const contentInput = document.getElementById("noteContent");

// =========================
// Track editing note & autosave
// =========================
let editingNoteId = null;
let autosaveTimer = null;

// =========================
// Redirect to login if no JWT
// =========================
const token = localStorage.getItem("token");
if (!token) {
  console.warn("No JWT token, redirecting to login.");
  window.location.href = "login.html";
}

// =========================
// Load all notes
// =========================
async function loadNotes() {
  console.log("Loading notes...");
  try {
    const notes = await apiRequest("/notes");
    console.log("Notes loaded:", notes);

    notesContainer.innerHTML = "";

    notes.forEach(note => {
      console.log("Rendering note:", note._id, note.title);
      const div = document.createElement("div");
      div.className = "note-card";

      div.innerHTML = `
        <h3>${note.title || "Untitled"}</h3>
        <div class="note-content">${note.content || ""}</div>
        <div class="note-actions">
          <button onclick="editNote('${note._id}')">Edit</button>
          <button onclick="deleteNote('${note._id}')">Delete</button>
        </div>
      `;
      notesContainer.appendChild(div);
    });
  } catch (err) {
    console.error("Failed to load notes:", err);
  }
}

// =========================
// Save or Update Note
// =========================
async function saveNote() {
  const title = titleInput.value.trim();
  const content = contentInput.innerHTML.trim();

  if (!title && !content) return;

  try {
    if (editingNoteId) {
      console.log(`Updating note ID: ${editingNoteId}`);
      await apiRequest(`/notes/${editingNoteId}`, "PUT", { title, content });
    } else {
      console.log("Creating new note...");
      const result = await apiRequest("/notes", "POST", { title, content });
      editingNoteId = result.id;
      console.log("New note created with ID:", editingNoteId);
    }

    await loadNotes();
  } catch (err) {
    console.error("Failed to save note:", err);
  }
}

// =========================
// Add Note Button
// =========================
addNoteBtn.onclick = () => {
  editingNoteId = null;
  saveNote();
  titleInput.value = "";
  contentInput.innerHTML = "";
};

// =========================
// Delete Note
// =========================
async function deleteNote(id) {
  if (!confirm("Are you sure you want to delete this note?")) return;

  try {
    await apiRequest(`/notes/${id}`, "DELETE");

    if (editingNoteId === id) {
      editingNoteId = null;
      titleInput.value = "";
      contentInput.innerHTML = "";
    }

    await loadNotes();
  } catch (err) {
    console.error("Failed to delete note:", err);
  }
}

// =========================
// Edit Note
// =========================
async function editNote(id) {
  try {
    const notes = await apiRequest("/notes");
    const note = notes.find(n => n._id === id);

    if (!note) return;

    editingNoteId = id;
    titleInput.value = note.title || "";
    contentInput.innerHTML = note.content || "";
    titleInput.focus();
  } catch (err) {
    console.error("Failed to fetch note for editing:", err);
  }
}

// =========================
// Autosave (3s after typing)
// =========================
function triggerAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveNote();
  }, 3000);
}

titleInput.addEventListener("input", triggerAutosave);
contentInput.addEventListener("input", triggerAutosave);

// =========================
// Initial load
// =========================
if (token) loadNotes();
