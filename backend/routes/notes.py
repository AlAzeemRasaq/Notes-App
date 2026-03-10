from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mongo
from bson import ObjectId
from datetime import datetime
import bleach

notes_bp = Blueprint("notes", __name__)

# =========================
# Allowed tags and attributes for rich text
# =========================
ALLOWED_TAGS = [
    "b", "i", "u", "strong", "em", "a", "p", "br", "ul", "ol", "li",
    "img", "iframe", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"
]

ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "iframe": ["src", "width", "height", "frameborder", "allow", "allowfullscreen"]
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

def sanitize_html(html_content):
    return bleach.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True
    )

# =========================
# Create note
# POST /api/notes
# =========================
@notes_bp.route("", methods=["POST"])
@jwt_required()
def create_note():
    user_id = get_jwt_identity()
    data = request.json

    note = {
        "user_id": user_id,
        "title": bleach.clean(data.get("title", ""), strip=True),
        "content": sanitize_html(data.get("content", "")),
        "updated_at": datetime.utcnow()
    }

    result = mongo.db.notes.insert_one(note)
    return jsonify({"id": str(result.inserted_id)}), 201

# =========================
# Get all notes
# GET /api/notes
# =========================
@notes_bp.route("", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = get_jwt_identity()
    notes = []

    for note in mongo.db.notes.find({"user_id": user_id}):
        note["_id"] = str(note["_id"])
        notes.append(note)

    return jsonify(notes)

# =========================
# Update note
# PUT /api/notes/<id>
# =========================
@notes_bp.route("/<id>", methods=["PUT"])
@jwt_required()
def update_note(id):
    user_id = get_jwt_identity()
    data = request.json

    updated_fields = {
        "title": bleach.clean(data.get("title", ""), strip=True),
        "content": sanitize_html(data.get("content", "")),
        "updated_at": datetime.utcnow()
    }

    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": updated_fields}
    )

    if result.matched_count == 0:
        return jsonify({"error": "Note not found or not owned by user"}), 404
    return jsonify({"message": "Note updated"})

# =========================
# Delete note
# DELETE /api/notes/<id>
# =========================
@notes_bp.route("/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):
    user_id = get_jwt_identity()

    result = mongo.db.notes.delete_one({
        "_id": ObjectId(id),
        "user_id": user_id
    })

    if result.deleted_count == 0:
        return jsonify({"error": "Note not found or not owned by user"}), 404
    return jsonify({"message": "Note deleted"})
