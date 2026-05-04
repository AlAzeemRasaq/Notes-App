import sys
import os
import pytest

# Add backend path
sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../backend")
    )
)

from app import create_app
from extensions import mongo


# ================= APP =================
@pytest.fixture
def app():
    """
    Create a fresh app instance for testing with isolated config.
    """

    app = create_app({
        "TESTING": True,
        "JWT_SECRET_KEY": "test-secret",
        "MONGO_URI": "mongodb://localhost:27017/notes_app_test"
    })

    return app


# ================= CLIENT =================
@pytest.fixture
def client(app):
    """
    Flask test client bound to the test app.
    """
    with app.test_client() as client:
        yield client


# ================= CLEAN DB =================
@pytest.fixture(autouse=True)
def clean_db(app):
    """
    Clean DB BEFORE each test (safe).
    """

    with app.app_context():
        db_name = mongo.db.name

        # 🛑 SAFETY GUARD — NEVER DELETE REAL DATA
        assert "test" in db_name, f"Refusing to wipe non-test DB: {db_name}"

        mongo.db.notes.delete_many({})
        mongo.db.users.delete_many({})

    yield


# ================= AUTH HEADERS =================
@pytest.fixture
def auth_headers(client):
    """
    Create user + login once per test.
    """

    # Register
    client.post("/api/auth/register", json={
        "username": "noteuser",
        "email": "note@test.com",
        "password": "password123"
    })

    # Login
    login = client.post("/api/auth/login", json={
        "email": "note@test.com",
        "password": "password123"
    })

    assert login.status_code == 200, login.get_data(as_text=True)

    data = login.get_json()
    assert data is not None, "No JSON returned from login"

    # 🔥 FIX: accept real backend response
    token = data.get("access_token") or data.get("token")
    assert token is not None, data

    return {"Authorization": f"Bearer {token}"}


# ================= SAMPLE NOTE =================
@pytest.fixture
def sample_note_payload():
    return {
        "title": "Test Note",
        "content": "This is a test note."
    }
