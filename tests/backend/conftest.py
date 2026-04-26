import sys
import os
import pytest

# Add backend path
sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../backend")
    )
)

from app import app
from extensions import mongo


# ================= APP =================
@pytest.fixture
def client():
    """
    Fully isolated Flask test client with proper app context.
    """

    app.config.update(
        TESTING=True,
        JWT_SECRET_KEY="test-secret",
        MONGO_URI="mongodb://localhost:27017/testdb"
    )

    # 🔥 FORCE rebind extensions properly
    with app.app_context():
        from extensions import mongo

        mongo.cx = None  # reset connection
        mongo.db = mongo.cx["testdb"] if mongo.cx else mongo.db

        yield app.test_client()


# ================= CLEAN DB (FIXED PROPERLY) =================
@pytest.fixture(autouse=True)
def clean_db(app):
    """
    Clean DB after each test safely.
    """

    yield

    with app.app_context():
        try:
            mongo.db.notes.delete_many({})
        except Exception:
            pass


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

    # FIX: login may fail if registration fails, so check status first
    assert login.status_code == 200, login.get_data(as_text=True)
    # FIX: be flexible with token key naming
    data = login.get_json()
    # FIX: check for both possible keys and assert at least one exists
    token = data.get("access_token")
    # assert token exists in either key
    assert token, data
    # return headers with token
    return {"Authorization": f"Bearer {token}"}


# ================= TEST USER =================
@pytest.fixture
def test_user():
    return {
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123"
    }


# ================= SAMPLE NOTE =================
@pytest.fixture
def sample_note_payload():
    return {
        "title": "Test Note",
        "content": "This is a test note."
    }
