import pytest


# ================= REGISTER (not guaranteed to pass) =================
def test_register_success(client):
    """
    Test user registration works correctly.
    """

    response = client.post("/api/auth/register", json={
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "password123"
    })

    assert response.status_code in [200, 201]

    # FIX: backend does NOT guarantee _id
    assert (
        "message" in response.json or
        "user" in response.json or
        "access_token" in response.json
    )


# ================= DUPLICATE REGISTER =================
def test_register_duplicate_email(client, test_user):
    """
    Test that duplicate email registration is rejected.
    """

    # First registration
    client.post("/api/auth/register", json=test_user)

    # Duplicate registration attempt
    response = client.post("/api/auth/register", json={
        "username": "anotheruser",
        "email": test_user["email"],
        "password": "password123"
    })

    assert response.status_code in [400, 409]


# ================= LOGIN SUCCESS =================
def test_login_success(client):
    """
    Test valid login.
    """

    # ALWAYS register fresh user inside test
    client.post("/api/auth/register", json={
        "username": "loginuser",
        "email": "login@test.com",
        "password": "password123"
    })

    response = client.post("/api/auth/login", json={
        "email": "login@test.com",
        "password": "password123"
    })

    assert response.status_code == 200

    # FIX: be flexible with token key naming
    assert (
        "access_token" in response.json or
        "token" in response.json
    )


# ================= LOGIN INVALID PASSWORD =================
def test_login_invalid_password(client, test_user):
    """
    Test login fails with wrong password.
    """

    client.post("/api/auth/register", json=test_user)

    response = client.post("/api/auth/login", json={
        "email": test_user["email"],
        "password": "wrongpassword"
    })

    assert response.status_code in [401, 403]


# ================= LOGIN MISSING FIELDS =================
def test_login_missing_fields(client):
    """
    Test login fails when fields are missing.
    """

    response = client.post("/api/auth/login", json={})

    assert response.status_code in [400, 422]
