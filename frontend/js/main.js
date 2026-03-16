// =========================
// DOM Elements
// =========================
const notesContainer = document.getElementById("notesContainer");
const addNoteBtn = document.getElementById("addNoteBtn");
const titleInput = document.getElementById("noteTitle");
const contentInput = document.getElementById("noteContent");

let editingNoteId = null;

// =========================
// Redirect if not logged in
// =========================
const token = localStorage.getItem("token");
if (!token) {
  console.warn("No JWT token, redirecting to login.");
  window.location.href = "login.html";
}

// =========================
// Load Notes
// =========================
async function loadNotes() {
  console.log("Loading notes...");

  try {
    const notes = await apiRequest("/notes");

    notesContainer.innerHTML = "";

    notes.forEach(note => {

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

  const title = (titleInput.value || "").trim();
  const content = contentInput.innerHTML.replace(/<[^>]*>/g, "").trim();

  if (!title && !content) {
    console.log("Empty note, skipping save.");
    return;
  }

  try {

    if (editingNoteId) {

      await apiRequest(`/notes/${editingNoteId}`, "PUT", {
        title,
        content
      });

    } else {

      const result = await apiRequest("/notes", "POST", {
        title,
        content
      });

      editingNoteId = result._id;
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

  titleInput.value = "";
  contentInput.innerHTML = "";

  titleInput.focus();
};

// =========================
// Delete Note
// =========================
async function deleteNote(id) {

  if (!confirm("Delete this note?")) return;

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
// Save when user clicks outside editor
// =========================
function handleBlurSave() {
  console.log("Editor lost focus. Saving...");
  saveNote();
}

titleInput.addEventListener("blur", handleBlurSave);
contentInput.addEventListener("blur", handleBlurSave);

// =========================
// Initial Load
// =========================
loadNotes();
