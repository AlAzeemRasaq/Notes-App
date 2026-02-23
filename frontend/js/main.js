async function createNote() {
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;

  await addNote({ title, content });

  loadNotes();
}

async function loadNotes() {
  const notes = await fetchNotes();
  const container = document.getElementById("notes-container");
  container.innerHTML = "";

  notes.forEach(note => {
    const div = document.createElement("div");
    div.className = "note-card";
    div.innerHTML = `<h3>${note.title}</h3><p>${note.content}</p>`;
    container.appendChild(div);
  });
}

loadNotes();