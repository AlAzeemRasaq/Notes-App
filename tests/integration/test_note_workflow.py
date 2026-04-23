def test_register_login_create_note(client):
    """
    Test full workflow:
    register -> login -> create note
    """

    # Register user
    register_response = client.post("/api/auth/register", json={
        "username": "workflowuser",
        "email": "workflow@test.com",
        "password": "password123"
    })

    assert register_response.status_code in [200, 201]

    # Login user
    login_response = client.post("/api/auth/login", json={
        "email": "workflow@test.com",
        "password": "password123"
    })

    assert login_response.status_code == 200

    # Create note
    note_response = client.post("/api/notes/create", json={
        "title": "Workflow Note",
        "content": "Integration test note"
    })

    assert note_response.status_code in [200, 201]

def test_archive_restore_workflow(client):
    """
    Test create -> archive -> restore workflow
    """

    # Create note
    create_response = client.post("/api/notes/create", json={
        "title": "Archive Test",
        "content": "Archive workflow"
    })

    note_id = create_response.json.get("id")

    # Archive note
    archive_response = client.patch(
        f"/api/notes/{note_id}/archive"
    )

    assert archive_response.status_code == 200

    # Restore note
    restore_response = client.patch(
        f"/api/notes/{note_id}/restore"
    )

    assert restore_response.status_code == 200

def test_delete_restore_workflow(client):
    """
    Test delete -> restore from trash workflow
    """

    create_response = client.post("/api/notes/create", json={
        "title": "Trash Test",
        "content": "Trash workflow"
    })

    note_id = create_response.json.get("id")

    delete_response = client.delete(
        f"/api/notes/{note_id}"
    )

    assert delete_response.status_code in [200, 204]

    restore_response = client.patch(
        f"/api/notes/{note_id}/restore"
    )

    assert restore_response.status_code == 200

def test_search_created_note(client):
    """
    Test note search after creation
    """

    client.post("/api/notes/create", json={
        "title": "Searchable Note",
        "content": "Find me later"
    })

    search_response = client.get(
        "/api/notes/search?query=Searchable"
    )

    assert search_response.status_code == 200
    assert isinstance(search_response.json, list)
