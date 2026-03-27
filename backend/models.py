from extensions import db
from datetime import datetime

# 1️⃣ USERS TABLE
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    notes = db.relationship("Note", backref="owner", lazy=True)


# 2️⃣ NOTES TABLE
class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
    content = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    # ✅ EXISTING
    pinned = db.Column(db.Boolean, default=False)
    archived = db.Column(db.Boolean, default=False)

    # 🔧 FIX: avoid mutable default bug (VERY important)
    tags = db.Column(db.JSON, default=list)

    # 🔥 NEW: soft delete support
    trashed = db.Column(db.Boolean, default=False, nullable=False)

    # 🔧 OPTIONAL (future-proofing): track when note was trashed
    trashed_at = db.Column(db.DateTime, nullable=True)


# 3️⃣ CATEGORIES TABLE
class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)


# 4️⃣ NOTE-CATEGORY JUNCTION TABLE (Many-to-Many)
class NoteCategory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    note_id = db.Column(db.Integer, db.ForeignKey("note.id"))
    category_id = db.Column(db.Integer, db.ForeignKey("category.id"))


# 5️⃣ PASSWORD RESET TABLE
class PasswordReset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    expires_at = db.Column(db.DateTime)
