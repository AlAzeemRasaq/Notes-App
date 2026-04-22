import pytest
from app import create_app
from extensions import db
from models import User, Note


# ===== APP FIXTURE =====
@pytest.fixture
def app():
    """
    Create a fresh Flask app instance for testing.
    """
    app = create_app()

    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["WTF_CSRF_ENABLED"] = False

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


# ===== CLIENT FIXTURE =====
@pytest.fixture
def client(app):
    """
    Test client using the test app instance.
    """
    return app.test_client()


# ===== TEST USER FIXTURE =====
@pytest.fixture
def test_user():
    """
    Create a reusable test user
    for authentication-related tests.
    """
    user = User(
        username="testuser",
        email="test@example.com"
    )

    user.set_password("password123")

    db.session.add(user)
    db.session.commit()

    return user


# ===== SAMPLE NOTE FIXTURE =====
@pytest.fixture
def sample_note(test_user):
    """
    Create a reusable sample note
    for note-related tests.
    """
    note = Note(
        title="Test Note",
        content="This is a test note.",
        user_id=test_user.id
    )

    db.session.add(note)
    db.session.commit()

    return note
