import pytest

# CREATE + READ tests for notes
def test_create_note(client, test_user):
    """
    Test creating a new note.
    """
    response = client.post("/notes/create", json={
        "title": "New Note",
        "content": "This is a new note.",
        "user_id": test_user.id
    })

    assert response.status_code in [200, 201]


def test_get_notes(client, test_user, sample_note):
    """
    Test retrieving notes for a user.
    """
    response = client.get(f"/notes/user/{test_user.id}")
    assert response.status_code == 200
    assert len(response.json) >= 1  # At least the sample note should be returned


def test_get_single_note(client, sample_note):
    """
    Test retrieving a single note by ID.
    """
    response = client.get(f"/notes/{sample_note.id}")

    assert response.status_code == 200
    assert response.json["title"] == sample_note.title

# UPDATE
def test_update_note(client, sample_note):
    """
    Test updating an existing note.
    """
    response = client.put(f"/notes/update/{sample_note.id}", json={
        "title": "Updated Note",
        "content": "This note has been updated."
    })

    assert response.status_code == 200
    assert response.json["title"] == "Updated Note"

# ARCHIVE
def test_archive_note(client, sample_note):
    """
    Test archiving a note.
    """
    response = client.put(f"/notes/archive/{sample_note.id}")

    assert response.status_code == 200
    assert response.json["archived"] is True

def test_unarchive_note(client, sample_note):
    """
    Test unarchiving a note.
    """
    # First archive the note
    client.put(f"/notes/archive/{sample_note.id}")

    # Then unarchive it
    response = client.put(f"/notes/unarchive/{sample_note.id}")

    assert response.status_code == 200
    assert response.json["archived"] is False

# DELETE + TRASH
def test_delete_note(client, sample_note):
    """
    Test deleting a note.
    """
    response = client.delete(f"/notes/delete/{sample_note.id}")

    assert response.status_code == [200, 204]

def test_restore_from_trash(client, sample_note):
    """
    Test restoring a note from trash.
    """
    # First delete the note
    client.delete(f"/notes/delete/{sample_note.id}")

    # Then restore it
    response = client.put(f"/notes/restore/{sample_note.id}")

    assert response.status_code == 200
    assert response.json["trashed"] is False

# SEARCH + EDGE CASE
def test_search_notes(client, test_user, sample_note):
    """
    Test searching for notes by keyword.
    """
    response = client.get(f"/notes/search?query=Test&user_id={test_user.id}")

    assert response.status_code == 200
    assert len(response.json) >= 1  # Should find the sample note

# EDGE CASE / SAFETY
def test_access_invalid_note(client):
    """
    Test accessing a note that doesn't exist.
    """
    response = client.get("/notes/9999")  # Assuming this ID doesn't exist

    assert response.status_code in [404, 400]
