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

def validate_note_input(data, allow_empty_update=True):
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    if not allow_empty_update:
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
    data["history"] = []

    error = validate_note_input(data, allow_empty_update=False)
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

    # 🆕 pagination params
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))
    except:
        page = 1
        limit = 20

    skip = (page - 1) * limit

    query = {"user_id": user_id, "trashed": {"$ne": True}}

    # 🔍 SEARCH FILTER
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

    # 🆕 PAGINATED QUERY
    cursor = mongo.db.notes.find(query)\
        .sort([("position", 1)])\
        .skip(skip)\
        .limit(limit)

    notes = []
    for note in cursor:
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

    notes = list(mongo.db.notes.find({
        "user_id": user_id,
        "trashed": True
    }).sort("trashed_at", -1))

    for note in notes:
        note["_id"] = str(note["_id"])

    return jsonify(notes)

# ================= ARCHIVE =================
@notes_bp.route("/archived", methods=["GET"])
@jwt_required()
def get_archived_notes():
    user_id = str(get_jwt_identity())

    notes = list(mongo.db.notes.find({
        "user_id": user_id,
        "archived": True,
        "trashed": {"$ne": True}
    }))

    for note in notes:
        note["_id"] = str(note["_id"])

    return jsonify(notes)

# ================= UPDATE NOTE + HISTORY =================
@notes_bp.route("/<id>", methods=["PUT"])
@jwt_required()
def update_note(id):
    user_id = str(get_jwt_identity())
    data = get_json_request()

    # ✅ validate id FIRST (prevents crashes)
    if not ObjectId.is_valid(id):
        return jsonify({"message": "Invalid note id"}), 400

    # ================= FETCH CURRENT NOTE =================
    note = mongo.db.notes.find_one({
        "_id": ObjectId(id),
        "user_id": user_id,
        "trashed": {"$ne": True}
    })

    if not note:
        return jsonify({"message": "Note not found"}), 404

    # ================= VALIDATION (only if needed) =================
    if "title" in data or "content" in data:
        error = validate_note_input(data, allow_empty_update=True)
        if error:
            return jsonify({"message": error}), 400

    # ================= BUILD UPDATE PAYLOAD =================
    updated_fields = {}

    # TITLE
    if "title" in data:
        title = data["title"]
        if title is not None:
            updated_fields["title"] = bleach.clean(title.strip(), strip=True)

    # CONTENT
    if "content" in data:
        content = data["content"]
        if content is not None:
            updated_fields["content"] = sanitize_html(content.strip())

    # TAGS
    if "tags" in data:
        if isinstance(data["tags"], list):
            updated_fields["tags"] = data["tags"]

    # COLOR
    if "color" in data:
        color = (data["color"] or "").strip()
        if color.startswith("#") and len(color) in [4, 7]:
            updated_fields["color"] = color
        else:
            updated_fields["color"] = note.get("color", "#ffffff")

    # ================= PREVENT EMPTY UPDATE =================
    if not updated_fields:
        return jsonify({"message": "No valid fields to update"}), 400

    # ================= HISTORY ENTRY =================
    history_entry = {
        "title": note.get("title"),
        "content": note.get("content"),
        "tags": note.get("tags", []),
        "updated_at": note.get("updated_at", datetime.utcnow())
    }

    mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {
            "$push": {
                "history": {
                    "$each": [history_entry],
                    "$slice": -10
                }
            }
        }
    )

    # ================= APPLY UPDATE =================
    updated_fields["updated_at"] = datetime.utcnow()

    mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": updated_fields}
    )

    return jsonify({
        "message": "Note updated",
        "updated_fields": list(updated_fields.keys())
    }), 200

# ================= HISTORY ENDPOINT =================
@notes_bp.route("/history/<id>", methods=["GET"])
@jwt_required()
def get_note_history(id):
    user_id = str(get_jwt_identity())

    note = mongo.db.notes.find_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"history": 1}
    )

    if not note:
        return jsonify({"error": "Note not found"}), 404

    return jsonify(note.get("history", [])), 200

# ================= SOFT DELETE =================
@notes_bp.route("/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):
    user_id = str(get_jwt_identity())
    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": {
            "trashed": True, 
            "trashed_at": datetime.utcnow(),
            "archived": False
            }
        }
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
                    "trashed_at": None,
                    "archived": False
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

    note = mongo.db.notes.find_one({
        "_id": ObjectId(id),
        "user_id": user_id,
        "trashed": {"$ne": True}
    })

    if not note:
        return jsonify({"message": "Note not found"}), 404

    is_pinned = note.get("pinned", False)

    # ================= UNPIN =================
    if is_pinned:
        mongo.db.notes.update_one(
            {"_id": ObjectId(id)},
            {
                "$set": {
                    "pinned": False,
                    "pin_order": 0
                }
            }
        )
        return jsonify({"message": "Unpinned"}), 200

    # ================= PIN =================
    highest = mongo.db.notes.find_one(
        {"user_id": user_id, "pinned": True},
        sort=[("pin_order", -1)]
    )

    next_order = (highest.get("pin_order", 0) + 1) if highest else 1

    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {
            "$set": {
                "pinned": True,
                "pin_order": next_order
            }
        }
    )

    return jsonify({"message": "Pinned"}), 200

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

# ================= DUPLICATE NOTE =================
@notes_bp.route("/duplicate/<id>", methods=["POST"])
@jwt_required()
def duplicate_note(id):
    user_id = str(get_jwt_identity())

    note = mongo.db.notes.find_one({
        "_id": ObjectId(id),
        "user_id": user_id
    })

    if not note:
        return jsonify({"error": "Note not found"}), 404

    # Remove old ID and create new note
    note.pop("_id")

    # Optional: tweak duplicated note
    note["title"] = note.get("title", "") + " (Copy)"
    note["created_at"] = datetime.utcnow()

    result = mongo.db.notes.insert_one(note)

    return jsonify({
        "message": "Note duplicated",
        "id": str(result.inserted_id)
    }), 201

# ================= TAG SUGGESTIONS =================
@notes_bp.route("/tags", methods=["GET"])
@jwt_required()
def get_tags():
    user_id = str(get_jwt_identity())

    notes = mongo.db.notes.find({"user_id": user_id}, {"tags": 1})

    tag_set = set()
    for note in notes:
        for tag in note.get("tags", []):
            tag_set.add(tag.lower())

    return jsonify(sorted(tag_set)), 200

# ================= BULK TAG UPDATE =================
@notes_bp.route("/bulk-tags", methods=["POST"])
@jwt_required()
def bulk_update_tags():
    user_id = str(get_jwt_identity())
    data = request.get_json()

    note_ids = data.get("note_ids", [])
    tags = data.get("tags", [])

    if not note_ids:
        return jsonify({"message": "No notes selected"}), 400

    mongo.db.notes.update_many(
        {"_id": {"$in": [ObjectId(n) for n in note_ids]}, "user_id": user_id},
        {"$set": {"tags": tags}}
    )

    return jsonify({"message": "Tags updated"}), 200
