import pytest

# AUTHENTICATION TESTS
def test_register_success(client):
    """
    Test user registration works correctly.
    """
    response = client.post("/register", json={
        "username": "newuser",
        "email": "new@example.com",
        "password": "password123"
    })

    assert response.status_code in [200, 201]


def test_register_duplicate_email(client, test_user):
    """
    Test that duplicate email registration is rejected.
    """
    response = client.post("/register", json={
        "username": "anotheruser",
        "email": test_user.email,
        "password": "password123"
    })

    assert response.status_code in [400, 409]


def test_login_success(client, test_user):
    """
    Test valid login.
    """
    response = client.post("/login", json={
        "email": test_user.email,
        "password": "password123"
    })

    assert response.status_code == 200


def test_login_invalid_password(client, test_user):
    """
    Test login fails with wrong password.
    """
    response = client.post("/login", json={
        "email": test_user.email,
        "password": "wrongpassword"
    })

    assert response.status_code in [401, 403]


def test_login_missing_fields(client):
    """
    Test login fails when fields are missing.
    """
    response = client.post("/login", json={})

    assert response.status_code in [400, 422]
