const API_URL = "http://127.0.0.1:5000/api";

async function fetchNotes() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/notes/`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return await res.json();
}

async function addNote(note) {
  const token = localStorage.getItem("token");

  await fetch(`${API_URL}/notes/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(note)
  });
}