from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mongo
from bson import ObjectId
from datetime import datetime
import bleach

notes_bp = Blueprint("notes", __name__)

# print("Incoming request data:", request.json)

# =========================
# Allowed HTML tags and attributes for rich text
# =========================
ALLOWED_TAGS = ["b","i","u","strong","em","a","p","br","ul","ol","li","img","iframe",
                "h1","h2","h3","h4","h5","h6","blockquote"]
ALLOWED_ATTRS = {
    "a": ["href","title","target","rel"],
    "img": ["src","alt","title","width","height"],
    "iframe": ["src","width","height","frameborder","allow","allowfullscreen"]
}
ALLOWED_PROTOCOLS = ["http","https","mailto"]

def sanitize_html(content):
    """Clean HTML content to allow only safe tags and attributes."""
    return bleach.clean(content, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS,
                        protocols=ALLOWED_PROTOCOLS, strip=True)

def get_json_request():
    """
    Safely parse JSON from request body.
    Logs raw body for debugging.
    """
    try:
        data = request.get_json(force=True)
        print(f"[NOTES] Received JSON: {data}")
        return data or {}
    except Exception as e:
        print(f"[NOTES] Failed to parse JSON. Raw data: {request.data}, Error: {e}")
        return {}

# =========================
# CREATE NOTE
# =========================
@notes_bp.route("", methods=["POST"])
@jwt_required()
def create_note():
    user_id = str(get_jwt_identity())
    data = get_json_request()

    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    # Reject truly empty notes
    if not title and not content:
        return jsonify({"message":"Cannot save empty note"}), 400

    note = {
        "user_id": user_id,
        "title": bleach.clean(title, strip=True),
        "content": sanitize_html(content),
        "updated_at": datetime.utcnow()
    }

    result = mongo.db.notes.insert_one(note)
    print(f"[CREATE NOTE] User {user_id} created note {result.inserted_id}")
    return jsonify({"_id": str(result.inserted_id)}), 201

# =========================
# GET ALL NOTES FOR USER
# =========================
@notes_bp.route("", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = str(get_jwt_identity())
    notes = []
    for note in mongo.db.notes.find({"user_id": user_id}):
        note["_id"] = str(note["_id"])
        notes.append(note)
    print(f"[GET NOTES] User {user_id} fetched {len(notes)} notes")
    return jsonify(notes)

# =========================
# UPDATE NOTE
# =========================
@notes_bp.route("/<id>", methods=["PUT"])
@jwt_required()
def update_note(id):
    user_id = str(get_jwt_identity())
    data = get_json_request()

    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    if not title and not content:
        return jsonify({"message":"Cannot save empty note"}), 400

    updated_fields = {
        "title": bleach.clean(title, strip=True),
        "content": sanitize_html(content),
        "updated_at": datetime.utcnow()
    }

    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": updated_fields}
    )

    if result.matched_count == 0:
        return jsonify({"message":"Note not found or not owned by user"}), 404

    print(f"[UPDATE NOTE] User {user_id} updated note {id}")
    return jsonify({"message":"Note updated"})

# =========================
# DELETE NOTE
# =========================
@notes_bp.route("/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):
    user_id = str(get_jwt_identity())
    result = mongo.db.notes.delete_one({"_id": ObjectId(id), "user_id": user_id})

    if result.deleted_count == 0:
        return jsonify({"message":"Note not found or not owned by user"}), 404

    print(f"[DELETE NOTE] User {user_id} deleted note {id}")
    return jsonify({"message":"Note deleted"})
