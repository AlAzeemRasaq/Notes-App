// =========================
// DOM Elements
// =========================
const notesContainer = document.getElementById("notesContainer");
const addNoteBtn = document.getElementById("addNoteBtn");
const titleInput = document.getElementById("noteTitle");
const contentInput = document.getElementById("noteContent"); // contenteditable div

// =========================
// Track currently editing note
// =========================
let editingNoteId = null;

// =========================
// Redirect if not logged in
// =========================
if (!localStorage.getItem("token")) {
  alert("You must be logged in to view your notes.");
  window.location.href = "login.html";
}

// =========================
// Load Notes From MongoDB
// =========================
async function loadNotes() {
  try {
    const notes = await apiRequest("/notes");
    notesContainer.innerHTML = "";

    notes.forEach(note => {
      const div = document.createElement("div");
      div.className = "note-card";

      // Use innerHTML to render rich text safely
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
    console.error("Failed to load notes", err);
  }
}

// =========================
// Create or Update Note
// =========================
async function saveNote() {
  const title = titleInput.value.trim();
  const content = contentInput.innerHTML.trim(); // grab innerHTML for rich text
  if (!title && !content) return;

  try {
    if (editingNoteId) {
      // Update existing note
      await apiRequest(`/notes/${editingNoteId}`, "PUT", { title, content });
      editingNoteId = null;
    } else {
      // Create new note
      await apiRequest("/notes", "POST", { title, content });
    }

    titleInput.value = "";
    contentInput.innerHTML = "";
    loadNotes();
  } catch (err) {
    console.error("Failed to save note", err);
  }
}

// =========================
// Add Note Button
// =========================
addNoteBtn.onclick = saveNote;

// =========================
// Delete Note
// =========================
async function deleteNote(id) {
  if (!confirm("Are you sure you want to delete this note?")) return;
  await apiRequest(`/notes/${id}`, "DELETE");
  loadNotes();
}

// =========================
// Edit Note
// =========================
async function editNote(id) {
  // Fetch the note to pre-fill inputs
  const notes = await apiRequest("/notes");
  const note = notes.find(n => n._id === id);
  if (!note) return;

  titleInput.value = note.title;
  contentInput.innerHTML = note.content; // set innerHTML for rich text
  editingNoteId = id;
  titleInput.focus();
}

// =========================
// Autosave Feature (3s after typing)
// =========================
let autosaveTimer;
contentInput.addEventListener("input", () => {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveNote();
  }, 3000);
});

// =========================
// Load notes when page opens
// =========================
loadNotes();
