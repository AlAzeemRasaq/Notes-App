# ================= REGISTER =================
def test_register_success(client):
    response = client.post("/api/auth/register", json={
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "password123"
    })

    data = response.get_json()

    assert response.status_code in [200, 201], data
    assert data is not None
    assert "message" in data  # enforce contract


# ================= DUPLICATE REGISTER =================
def test_register_duplicate_email(client):
    user = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123"
    }

    client.post("/api/auth/register", json=user)

    response = client.post("/api/auth/register", json=user)

    data = response.get_json()

    assert response.status_code in [400, 409], data
    assert data is not None


# ================= LOGIN SUCCESS =================
def test_login_success(client):
    client.post("/api/auth/register", json={
        "username": "loginuser",
        "email": "login@test.com",
        "password": "password123"
    })

    response = client.post("/api/auth/login", json={
        "email": "login@test.com",
        "password": "password123"
    })

    print("STATUS:", response.status_code)
    print("BODY:", response.get_data(as_text=True))

    data = response.get_json()
    print("JSON:", data)

    assert False


# ================= LOGIN INVALID PASSWORD =================
def test_login_invalid_password(client):
    user = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123"
    }

    client.post("/api/auth/register", json=user)

    response = client.post("/api/auth/login", json={
        "email": user["email"],
        "password": "wrongpassword"
    })

    data = response.get_json()

    assert response.status_code in [401, 403], data
    assert data is not None


# ================= LOGIN MISSING FIELDS =================
def test_login_missing_fields(client):
    response = client.post("/api/auth/login", json={})

    data = response.get_json()

    assert response.status_code in [400, 422], data
    assert data is not None
