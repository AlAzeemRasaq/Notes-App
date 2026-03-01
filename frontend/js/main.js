// Redirect if not logged in
if (!localStorage.getItem("token")) {
  window.location.href = "login.html";
}

const notesContainer = document.getElementById("notesContainer");
const addNoteBtn = document.getElementById("addNoteBtn");

addNoteBtn.onclick = async () => {
  const title = document.getElementById("noteTitle").value;
  const content = document.getElementById("noteContent").value;

  await apiRequest("/notes/", "POST", { title, content });

  loadNotes();
};

async function loadNotes() {
  const notes = await apiRequest("/notes/");

  notesContainer.innerHTML = "";

  notes.forEach(note => {
    const div = document.createElement("div");
    div.className = "note-card";
    div.innerHTML = `
      <h3>${note.title}</h3>
      <p>${note.content}</p>
    `;
    notesContainer.appendChild(div);
  });
}

loadNotes();
