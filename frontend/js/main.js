const notesContainer = document.getElementById("notesContainer");
const addNoteBtn = document.getElementById("addNoteBtn");
const titleInput = document.getElementById("noteTitle");
const contentInput = document.getElementById("noteContent");
const searchInput = document.getElementById("searchInput");

let editingNoteId = null;
let notes = [];

const token = localStorage.getItem("token");
if (!token) window.location.href = "login.html";

// ================= LOAD =================
async function loadNotes() {
  notes = await apiRequest("/notes");

  // ❗ NO archive filtering here anymore
  notes.sort((a, b) => (b.pinned === true) - (a.pinned === true));

  renderNotes(notes);
}

// ================= RENDER =================
function renderNotes(list) {
  notesContainer.innerHTML = "";

  const isArchivePage = window.location.pathname.includes("archive");

  list.forEach(note => {
    const div = document.createElement("div");
    div.className = "note-card";

    if (note.pinned) div.classList.add("pinned");

    div.innerHTML = `
      <h3>${note.title || "Untitled"}</h3>
      <div class="note-content">${note.content || ""}</div>
      <div class="note-actions">
        <button onclick="editNote('${note._id}')">Edit</button>
        <button onclick="deleteNote('${note._id}')">Delete</button>
        <button onclick="togglePin('${note._id}')">📌</button>
        <button onclick="toggleArchive('${note._id}')">
          ${isArchivePage ? "↩️" : "📦"}
        </button>
      </div>
    `;

    notesContainer.appendChild(div);
  });
}

// ================= SAVE =================
async function saveNote() {
  const title = titleInput.value.trim();
  const content = contentInput.innerHTML.trim();

  if (!title && !content) return;

  if (editingNoteId) {
    await apiRequest(`/notes/${editingNoteId}`, "PUT", { title, content });
  } else {
    const res = await apiRequest("/notes", "POST", { title, content });
    editingNoteId = res._id;
  }

  loadNotes();
}

// ================= DELETE =================
async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;
  await apiRequest(`/notes/${id}`, "DELETE");
  loadNotes();
}

// ================= EDIT =================
function editNote(id) {
  const note = notes.find(n => n._id === id);
  if (!note) return;

  editingNoteId = id;
  titleInput.value = note.title || "";
  contentInput.innerHTML = note.content || "";
}

// ================= PIN =================
async function togglePin(id) {
  await apiRequest(`/notes/pin/${id}`, "PUT");
  loadNotes();
}

// ================= ARCHIVE =================
async function toggleArchive(id) {
  await apiRequest(`/notes/archive/${id}`, "PUT");
  loadNotes();
}

// ================= SEARCH =================
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();

    const filtered = notes.filter(n =>
      (n.title || "").toLowerCase().includes(q) ||
      (n.content || "").toLowerCase().includes(q)
    );

    renderNotes(filtered);
  });
}

// ================= THEME =================
function toggleTheme() {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

(function () {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light");
  }
})();

// ================= EVENTS =================
if (addNoteBtn) {
  addNoteBtn.onclick = () => {
    editingNoteId = null;
    titleInput.value = "";
    contentInput.innerHTML = "";
  };
}

if (titleInput) titleInput.addEventListener("blur", saveNote);
if (contentInput) contentInput.addEventListener("blur", saveNote);

// ================= INIT =================
if (notesContainer) loadNotes();
