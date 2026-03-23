from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mongo
from bson import ObjectId
from datetime import datetime
import bleach

notes_bp = Blueprint("notes", __name__)

ALLOWED_TAGS = ["b","i","u","strong","em","a","p","br","ul","ol","li","img","iframe",
                "h1","h2","h3","h4","h5","h6","blockquote"]
ALLOWED_ATTRS = {
    "a": ["href","title","target","rel"],
    "img": ["src","alt","title","width","height"],
    "iframe": ["src","width","height","frameborder","allow","allowfullscreen"]
}
ALLOWED_PROTOCOLS = ["http","https","mailto"]

def sanitize_html(content):
    return bleach.clean(content, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS,
                        protocols=ALLOWED_PROTOCOLS, strip=True)

def get_json_request():
    try:
        data = request.get_json(force=True)
        return data or {}
    except:
        return {}

# ================= CREATE =================
@notes_bp.route("", methods=["POST"])
@jwt_required()
def create_note():
    user_id = str(get_jwt_identity())
    data = get_json_request()

    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    if not title and not content:
        return jsonify({"message":"Cannot save empty note"}), 400

    note = {
        "user_id": user_id,
        "title": bleach.clean(title, strip=True),
        "content": sanitize_html(content),
        "updated_at": datetime.utcnow(),
        "pinned": False,
        "archived": False,
        "tags": data.get("tags", [])
    }

    result = mongo.db.notes.insert_one(note)
    return jsonify({"_id": str(result.inserted_id)}), 201

# ================= READ (WITH SEARCH ADDED SAFELY) =================
@notes_bp.route("", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = str(get_jwt_identity())

    # 🔍 Get search query (optional)
    search_query = request.args.get("search", "").strip()

    # Base query (always filter by user)
    query = {"user_id": user_id}

    # Only add search if user typed something
    if search_query:
        query["$or"] = [
            {"title": {"$regex": search_query, "$options": "i"}},
            {"content": {"$regex": search_query, "$options": "i"}}
        ]

    notes = []
    for note in mongo.db.notes.find(
        query,
        sort=[("pinned", -1), ("updated_at", -1)]
    ):
        note["_id"] = str(note["_id"])
        notes.append(note)

    return jsonify(notes)

# ================= UPDATE =================
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
        return jsonify({"message":"Note not found"}), 404

    return jsonify({"message":"Note updated"})

# ================= DELETE =================
@notes_bp.route("/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):
    user_id = str(get_jwt_identity())

    result = mongo.db.notes.delete_one(
        {"_id": ObjectId(id), "user_id": user_id}
    )

    if result.deleted_count == 0:
        return jsonify({"message":"Note not found"}), 404

    return jsonify({"message":"Note deleted"})

# ================= PIN =================
@notes_bp.route("/pin/<id>", methods=["PUT"])
@jwt_required()
def toggle_pin(id):
    user_id = str(get_jwt_identity())

    note = mongo.db.notes.find_one({"_id": ObjectId(id), "user_id": user_id})
    if not note:
        return jsonify({"message": "Note not found"}), 404

    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"pinned": not note.get("pinned", False)}}
    )

    return jsonify({"message": "Pin toggled"})

# ================= ARCHIVE =================
@notes_bp.route("/archive/<id>", methods=["PUT"])
@jwt_required()
def toggle_archive(id):
    user_id = str(get_jwt_identity())

    note = mongo.db.notes.find_one({"_id": ObjectId(id), "user_id": user_id})
    if not note:
        return jsonify({"message": "Note not found"}), 404

    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"archived": not note.get("archived", False)}}
    )

    return jsonify({"message": "Archive toggled"})
