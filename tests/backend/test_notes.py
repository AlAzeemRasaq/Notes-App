import pytest


# ================= CREATE =================
def test_create_note(client, auth_headers, sample_note_payload):
    response = client.post(
        "/api/notes",
        json=sample_note_payload,
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code in [200, 201], data
    assert data is not None, "No JSON returned"
    assert "_id" in data


# ================= READ =================
def test_get_notes(client, auth_headers):
    response = client.get(
        "/api/notes",
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code == 200, data
    assert isinstance(data, list)


# ================= UPDATE =================
def test_update_note(client, auth_headers):
    create = client.post(
        "/api/notes",
        json={
            "title": "Old Title",
            "content": "Old Content"
        },
        headers=auth_headers
    )

    create_data = create.get_json()

    assert create.status_code in [200, 201], create_data
    assert "_id" in create_data

    note_id = create_data["_id"]

    response = client.put(
        f"/api/notes/{note_id}",
        json={"title": "Updated Title"},
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code == 200, data
    assert data is not None


# ================= ARCHIVE =================
def test_archive_note(client, auth_headers):
    create = client.post(
        "/api/notes",
        json={
            "title": "Archive Me",
            "content": "Archive test"
        },
        headers=auth_headers
    )

    create_data = create.get_json()

    assert "_id" in create_data

    note_id = create_data["_id"]

    response = client.put(
        f"/api/notes/archive/{note_id}",
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code == 200, data
    assert data is not None


# ================= DELETE =================
def test_delete_note(client, auth_headers):
    create = client.post(
        "/api/notes",
        json={
            "title": "Delete Me",
            "content": "Temporary note"
        },
        headers=auth_headers
    )

    create_data = create.get_json()

    assert "_id" in create_data

    note_id = create_data["_id"]

    response = client.delete(
        f"/api/notes/{note_id}",
        headers=auth_headers
    )

    if response.status_code == 200:
        assert response.get_json() is not None
    else:
        assert response.status_code == 204


# ================= RESTORE =================
def test_restore_from_trash(client, auth_headers):
    create = client.post(
        "/api/notes",
        json={
            "title": "Restore Me",
            "content": "Restore test"
        },
        headers=auth_headers
    )

    create_data = create.get_json()

    assert "_id" in create_data

    note_id = create_data["_id"]

    delete_response = client.delete(
        f"/api/notes/{note_id}",
        headers=auth_headers
    )

    assert delete_response.status_code in [200, 204]

    response = client.put(
        f"/api/notes/restore/{note_id}",
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code == 200, data
    assert data is not None


# ================= SEARCH =================
def test_search_notes(client, auth_headers):
    create = client.post(
        "/api/notes",
        json={
            "title": "Search Test",
            "content": "Find me"
        },
        headers=auth_headers
    )

    assert create.status_code in [200, 201]

    response = client.get(
        "/api/notes?search=Search",
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code == 200, data
    assert isinstance(data, list)


# ================= EDGE CASE =================
def test_access_invalid_note(client, auth_headers):
    response = client.get(
        "/api/notes/999999",
        headers=auth_headers
    )

    assert response.status_code in [400, 404, 500]
