from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mongo
from bson import ObjectId
from datetime import datetime
import bleach

notes_bp = Blueprint("notes", __name__)

# ================= HTML SANITIZATION =================
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

def validate_note_input(data):
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    if not title and not content:
        return "Note cannot be empty"

    if len(title) > 120:
        return "Title too long"

    if len(content) > 10000:
        return "Content too long"

    return None

# ================= CREATE NOTE =================
@notes_bp.route("", methods=["POST"])
@jwt_required()
def create_note():
    user_id = str(get_jwt_identity())
    data = get_json_request()

    error = validate_note_input(data)
    if error:
        return jsonify({"message": error}), 400

    title = bleach.clean((data.get("title") or "").strip(), strip=True)
    content = sanitize_html((data.get("content") or "").strip())
    tags = data.get("tags")
    if not isinstance(tags, list):
        tags = []

    # 🆕 Note color support
    color = (data.get("color") or "#ffffff").strip()
    if not color.startswith("#") or len(color) not in [4,7]:
        color = "#ffffff"

    # Determine next position
    last_note = mongo.db.notes.find_one({"user_id": user_id}, sort=[("position", -1)])
    next_position = (last_note.get("position", -1) + 1) if last_note else 0

    now = datetime.utcnow()
    note = {
        "user_id": user_id,
        "title": title,
        "content": content,
        "tags": tags,
        "color": color,  # 🆕
        "pinned": False,
        "archived": False,
        "trashed": False,
        "trashed_at": None,
        "position": next_position,
        "created_at": now,
        "updated_at": now
    }

    result = mongo.db.notes.insert_one(note)
    return jsonify({
        "_id": str(result.inserted_id),
        "title": title,
        "content": content,
        "tags": tags,
        "color": color,  # 🆕 include color in response
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }), 201

# ================= READ NOTES =================
@notes_bp.route("", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = str(get_jwt_identity())
    search_query = request.args.get("search", "").strip()

    query = {"user_id": user_id, "trashed": {"$ne": True}}

    if search_query:
        terms = search_query.split()
        regex_conditions = []
        for term in terms:
            regex = {"$regex": term, "$options": "i"}
            regex_conditions.append({
                "$or": [
                    {"title": regex},
                    {"content": regex},
                    {"tags": regex}
                ]
            })
        query["$and"] = regex_conditions

    notes = []
    for note in mongo.db.notes.find(query, sort=[("position", 1)]):
        note["_id"] = str(note["_id"])
        notes.append(note)

    return jsonify(notes)

# ================= REORDER NOTES =================
@notes_bp.route("/reorder", methods=["PUT"])
@jwt_required()
def reorder_notes():
    user_id = str(get_jwt_identity())
    data = get_json_request()
    ordered_ids = data.get("ordered_ids", [])

    if not ordered_ids:
        return jsonify({"message": "No order provided"}), 400

    for index, note_id in enumerate(ordered_ids):
        mongo.db.notes.update_one(
            {"_id": ObjectId(note_id), "user_id": user_id},
            {"$set": {"position": index}}
        )

    return jsonify({"message": "Order updated"})

# ================= TRASH =================
@notes_bp.route("/trash", methods=["GET"])
@jwt_required()
def get_trash_notes():
    user_id = str(get_jwt_identity())
    notes = []
    for note in mongo.db.notes.find({"user_id": user_id, "trashed": True},
                                    sort=[("trashed_at",-1)]):
        note["_id"] = str(note["_id"])
        notes.append(note)
    return jsonify(notes)

# ================= UPDATE NOTE =================
@notes_bp.route("/<id>", methods=["PUT"])
@jwt_required()
def update_note(id):
    user_id = str(get_jwt_identity())
    data = get_json_request()

    error = validate_note_input(data)
    if error:
        return jsonify({"message": error}), 400

    title = bleach.clean((data.get("title") or "").strip(), strip=True)
    content = sanitize_html((data.get("content") or "").strip())
    tags = data.get("tags")
    if not isinstance(tags, list):
        tags = []

    # 🆕 Handle color update
    color = (data.get("color") or "#ffffff").strip()
    if not color.startswith("#") or len(color) not in [4,7]:
        color = "#ffffff"

    updated_fields = {
        "title": title,
        "content": content,
        "tags": tags,
        "color": color,  # 🆕
        "updated_at": datetime.utcnow()
    }

    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id, "trashed": {"$ne": True}},
        {"$set": updated_fields}
    )

    if result.matched_count == 0:
        return jsonify({"message":"Note not found"}), 404

    return jsonify({"message":"Note updated"})

# ================= SOFT DELETE =================
@notes_bp.route("/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):
    user_id = str(get_jwt_identity())
    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": {"trashed": True, "trashed_at": datetime.utcnow()}}
    )

    if result.matched_count == 0:
        return jsonify({"message":"Note not found"}), 404

    return jsonify({"message":"Note moved to trash"})

# ================= RESTORE NOTE =================
@notes_bp.route("/restore/<id>", methods=["PUT"])
@jwt_required()
def restore_note(id):
    user_id = str(get_jwt_identity())

    try:
        result = mongo.db.notes.update_one(
            {"_id": ObjectId(id), "user_id": user_id},
            {
                "$set": {
                    "trashed": False,
                    "trashed_at": None
                }
            }
        )

        if result.matched_count == 0:
            return jsonify({"message": "Note not found"}), 404

        return jsonify({"message": "Note restored"}), 200

    except Exception as e:
        return jsonify({"message": "Failed to restore note", "error": str(e)}), 500

# ================= PERMANENT DELETE =================
@notes_bp.route("/permanent/<id>", methods=["DELETE"])
@jwt_required()
def permanent_delete(id):
    user_id = str(get_jwt_identity())
    result = mongo.db.notes.delete_one({"_id": ObjectId(id), "user_id": user_id})

    if result.deleted_count == 0:
        return jsonify({"message":"Note not found"}), 404

    return jsonify({"message":"Note permanently deleted"})

# ================= PIN NOTE =================
@notes_bp.route("/pin/<id>", methods=["PUT"])
@jwt_required()
def toggle_pin(id):
    user_id = str(get_jwt_identity())
    note = mongo.db.notes.find_one({"_id": ObjectId(id), "user_id": user_id, "trashed": {"$ne": True}})
    if not note:
        return jsonify({"message":"Note not found"}), 404

    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"pinned": not note.get("pinned", False)}}
    )

    return jsonify({"message":"Pin toggled"})

# ================= ARCHIVE NOTE =================
@notes_bp.route("/archive/<id>", methods=["PUT"])
@jwt_required()
def toggle_archive(id):
    user_id = str(get_jwt_identity())
    note = mongo.db.notes.find_one({"_id": ObjectId(id), "user_id": user_id, "trashed": {"$ne": True}})
    if not note:
        return jsonify({"message":"Note not found"}), 404

    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"archived": not note.get("archived", False)}}
    )

    return jsonify({"message":"Archive toggled"})

# ================= BULK DELETE =================
@notes_bp.route("/bulk-delete", methods=["POST"])
@jwt_required()
def bulk_delete():
    user_id = str(get_jwt_identity())
    data = get_json_request()
    note_ids = data.get("note_ids", [])

    if not note_ids:
        return jsonify({"message":"No notes provided"}), 400

    result = mongo.db.notes.update_many(
        {"_id": {"$in": [ObjectId(nid) for nid in note_ids]}, "user_id": user_id},
        {"$set": {"trashed": True, "trashed_at": datetime.utcnow()}}
    )

    return jsonify({"message": f"{result.modified_count} notes moved to trash"})

# ================= BULK ARCHIVE =================
@notes_bp.route("/bulk-archive", methods=["POST"])
@jwt_required()
def bulk_archive():
    user_id = str(get_jwt_identity())
    data = get_json_request()
    note_ids = data.get("note_ids", [])

    if not note_ids:
        return jsonify({"message":"No notes provided"}), 400

    result = mongo.db.notes.update_many(
        {"_id": {"$in": [ObjectId(nid) for nid in note_ids]}, "user_id": user_id, "trashed": {"$ne": True}},
        {"$set": {"archived": True}}
    )

    return jsonify({"message": f"{result.modified_count} notes archived"})
