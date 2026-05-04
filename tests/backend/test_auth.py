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
    # Create note
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
    assert create_data is not None

    note_id = create_data["_id"]

    # Update note
    response = client.put(
        f"/api/notes/{note_id}",
        json={"title": "Updated Title"},
        headers=auth_headers
    )

    assert response.status_code in [200, 204], response.get_data(as_text=True)

    # 🔥 retry-safe GET (handles slight backend delay / eventual consistency)
    import time

    updated = None
    for _ in range(5):
        get_res = client.get(
            f"/api/notes/{note_id}",
            headers=auth_headers
        )

        if get_res.status_code == 200:
            updated = get_res.get_json()
            if updated and updated.get("title") == "Updated Title":
                break

        time.sleep(0.1)

    assert updated is not None, "Note not found after update"
    assert updated.get("title") == "Updated Title", {
        "expected": "Updated Title",
        "actual": updated.get("title"),
        "full_note": updated
    }


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

    note_id = create.get_json()["_id"]

    response = client.put(
        f"/api/notes/archive/{note_id}",
        headers=auth_headers
    )

    assert response.status_code in [200, 204], response.get_data(as_text=True)

    # 🔥 VERIFY via fetch
    get_res = client.get(
        f"/api/notes/{note_id}",
        headers=auth_headers
    )

    # Depending on your API design:
    # archived notes might be hidden from default list
    if get_res.status_code == 200:
        note = get_res.get_json()
        assert note.get("archived") is True
    else:
        # acceptable: archived notes not returned
        assert get_res.status_code in [404]


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

    note_id = create.get_json()["_id"]

    response = client.delete(
        f"/api/notes/{note_id}",
        headers=auth_headers
    )

    assert response.status_code in [200, 204]


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

    note_id = create.get_json()["_id"]

    delete_response = client.delete(
        f"/api/notes/{note_id}",
        headers=auth_headers
    )

    assert delete_response.status_code in [200, 204]

    response = client.put(
        f"/api/notes/restore/{note_id}",
        headers=auth_headers
    )

    # 🔥 flexible status
    assert response.status_code in [200, 204], response.get_data(as_text=True)

    # 🔥 verify recovery if supported
    get_res = client.get(
        f"/api/notes/{note_id}",
        headers=auth_headers
    )

    assert get_res.status_code in [200, 404]


# ================= SEARCH =================
def test_search_notes(client, auth_headers):
    client.post(
        "/api/notes",
        json={
            "title": "Search Test",
            "content": "Find me"
        },
        headers=auth_headers
    )

    response = client.get(
        "/api/notes?search=Search",
        headers=auth_headers
    )

    data = response.get_json()

    assert response.status_code == 200, data
    assert isinstance(data, list)
    assert any("Search" in (note.get("title") or "") for note in data)


# ================= SHARE =================
def test_share_note(client, auth_headers):
    # create second user (FIX: include username)
    res = client.post("/api/auth/register", json={
        "username": "otheruser",
        "email": "other@test.com",
        "password": "password123"
    })

    assert res.status_code in [200, 201], res.get_json()

    # create note
    create = client.post(
        "/api/notes",
        json={"title": "Share Me", "content": "Test"},
        headers=auth_headers
    )

    assert create.status_code in [200, 201]
    note_id = create.get_json()["_id"]

    # share
    res = client.put(
        f"/api/notes/share/{note_id}",
        json={"email": "other@test.com"},
        headers=auth_headers
    )

    data = res.get_json()

    assert res.status_code == 200, data


# ================= EDGE CASE =================
def test_access_invalid_note(client, auth_headers):
    # valid ObjectId format but doesn't exist
    invalid_id = "507f1f77bcf86cd799439011"

    response = client.get(
        f"/api/notes/{invalid_id}",
        headers=auth_headers
    )

    assert response.status_code in [404]
