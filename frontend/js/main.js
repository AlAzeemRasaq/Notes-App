// =========================
// Redirect if not logged in
// =========================
// if (!localStorage.getItem("token")) {
//   window.location.href = "login.html";
// }


// =========================
// DOM Elements
// =========================
const notesContainer = document.getElementById("notesContainer");
const addNoteBtn = document.getElementById("addNoteBtn");

const titleInput = document.getElementById("noteTitle");
const contentInput = document.getElementById("noteContent");


// =========================
// Create Note
// =========================
addNoteBtn.onclick = async () => {

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title && !content) return;

  await apiRequest("/notes", "POST", {
    title: title,
    content: content
  });

  titleInput.value = "";
  contentInput.value = "";

  loadNotes();
};



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

      div.innerHTML = `
        <h3>${note.title || "Untitled"}</h3>
        <p>${note.content || ""}</p>

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
// Delete Note
// =========================
async function deleteNote(id) {

  await apiRequest(`/notes/${id}`, "DELETE");

  loadNotes();

}



// =========================
// Edit Note
// =========================
async function editNote(id) {

  const newTitle = prompt("New title:");
  const newContent = prompt("New content:");

  if (newTitle === null || newContent === null) return;

  await apiRequest(`/notes/${id}`, "PUT", {
    title: newTitle,
    content: newContent
  });

  loadNotes();

}



// =========================
// Autosave Feature
// =========================
let autosaveTimer;

contentInput.addEventListener("input", () => {

  clearTimeout(autosaveTimer);

  autosaveTimer = setTimeout(async () => {

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title && !content) return;

    await apiRequest("/notes", "POST", {
      title: title,
      content: content
    });

    titleInput.value = "";
    contentInput.value = "";

    loadNotes();

  }, 3000);

});



// =========================
// Load notes when page opens
// =========================
loadNotes();
