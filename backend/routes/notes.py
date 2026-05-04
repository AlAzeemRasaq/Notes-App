from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mongo
from bson import ObjectId
from datetime import datetime
import bleach

# Blueprint for notes routes
notes_bp = Blueprint("notes", __name__)

# ================= HTML SANITIZATION =================
# Allow safe HTML tags and attributes in note content, but strip all tags from titles. This prevents XSS while allowing basic formatting in notes.
ALLOWED_TAGS = [
    "b",
    "i",
    "u",
    "strong",
    "em",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "img",
    "iframe",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
]

# Restrict attributes to avoid malicious injections. For example, only allow href on <a> tags, and only allow src on <img> and <iframe> tags.
ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "iframe": ["src", "width", "height", "frameborder", "allow", "allowfullscreen"],
}

# Safe protocols only (no JavaScript)
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


# sanitization function that can be reused for both title and content while preserving allowed formatting
# For titles, we will strip all tags, but for content we will allow a limited set of tags and attributes.
def sanitize_html(content):
    return bleach.clean(
        content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )


# ================= INPUT VALIDATION =================
# Safely parse JSON without crashing is request is invalid
def get_json_request():
    data = request.get_json(silent=True)

    if data is None:
        return {}

    if not isinstance(data, dict):
        return {}

    return data


# Validate note input for create and update endpoints. For creation, we require at least a title or content. For updates, we allow empty updates but still validate field lengths and types if they are provided.
def validate_note_input(data, allow_empty_update=True):
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()

    # On create, prevent empty notes. On update, allow empty updates but still validate if title or content is provided.
    if not allow_empty_update:
        if not title and not content:
            return "Note cannot be empty"

    return None


# Access control query: allows owners AND collaborators to access a note
def note_access_query(note_id, user_id):
    return {
        "_id": ObjectId(note_id),
        "trashed": {"$ne": True},
        "$or": [{"user_id": user_id}, {"collaborators": user_id}],
    }


# ================= CREATE NOTE =================
@notes_bp.route("", methods=["POST"])
@jwt_required()
def create_note():
    # Get current logged in user ID from JWT token
    user_id = str(get_jwt_identity())

    data = get_json_request()
    data["history"] = []  # initialize history for new note

    # Validate input
    error = validate_note_input(data, allow_empty_update=False)
    if error:
        return jsonify({"message": error}), 400

    # Strip all HTML from title (titles should be plain text)
    title = bleach.clean((data.get("title") or "").strip(), strip=True)
    # Sanitize content but allow basic formatting
    content = sanitize_html((data.get("content") or "").strip())

    # Ensure tags is a list of strings
    tags = data.get("tags")
    if not isinstance(tags, list):
        tags = []

    # 🆕 Note color support
    color = (data.get("color") or "#ffffff").strip()
    if not color.startswith("#") or len(color) not in [4, 7]:
        color = "#ffffff"

    # Maintain position for ordering: new notes go to the end. We find the current max position and add 1.
    last_note = mongo.db.notes.find_one({"user_id": user_id}, sort=[("position", -1)])
    next_position = (last_note.get("position", -1) + 1) if last_note else 0

    now = datetime.utcnow()

    # Create a new note document
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
        # collaboration + version control
        "collaborators": [],
        "version": 1,
        "currently_editing": None,
        "created_at": now,
        "updated_at": now,
    }

    result = mongo.db.notes.insert_one(note)

    # Return the created note with its new ID and timestamps.
    # This allows the frontend to immediately display the new note with all its details.
    return (
        jsonify(
            {
                "_id": str(result.inserted_id),
                "title": title,
                "content": content,
                "tags": tags,
                "color": color,  # 🆕 include color in response
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        ),
        201,
    )


# ================= READ NOTES =================
@notes_bp.route("", methods=["GET"])
@jwt_required()
def get_notes():
    # Get current logged in user ID from JWT token
    user_id = str(get_jwt_identity())
    search_query = request.args.get("search", "").strip()

    # 🆕 pagination (prevents loading too many notes at once)
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))
    except:
        page = 1
        limit = 20

    skip = (page - 1) * limit

    # Base query: only non-trashed notes that the user owns or collaborates on
    query = {
        "trashed": {"$ne": True},
        "$or": [{"user_id": user_id}, {"collaborators": user_id}],
    }

    # 🔍 SEARCH FILTER: split query into terms and match each term
    if search_query:
        terms = search_query.split()
        regex_conditions = []

        for term in terms:
            regex = {"$regex": term, "$options": "i"}
            regex_conditions.append(
                {"$or": [{"title": regex}, {"content": regex}, {"tags": regex}]}
            )

        query["$and"] = regex_conditions

    # Apply sorting, pagination, and execute query
    cursor = mongo.db.notes.find(query).sort([("position", 1)]).skip(skip).limit(limit)

    notes = []
    for note in cursor:
        note["_id"] = str(note["_id"])
        notes.append(note)

    return jsonify(notes)


# ================= REORDER NOTES =================
@notes_bp.route("/reorder", methods=["PUT"])
@jwt_required()
def reorder_notes():
    # Get current logged in user ID from JWT token
    user_id = str(get_jwt_identity())
    data = get_json_request()
    ordered_ids = data.get("ordered_ids", [])

    if not ordered_ids:
        return jsonify({"message": "No order provided"}), 400

    # Update the position of each note based on the new order. We ensure that the note belongs to the user before updating.
    for index, note_id in enumerate(ordered_ids):
        mongo.db.notes.update_one(
            {"_id": ObjectId(note_id), "user_id": user_id},
            {"$set": {"position": index}},
        )

    return jsonify({"message": "Order updated"})


# ================= TRASH =================
@notes_bp.route("/trash", methods=["GET"])
@jwt_required()
def get_trash_notes():
    user_id = str(get_jwt_identity())

    # We only return trashed notes here, and we sort them by trashed_at date so the most recently trashed notes appear first.
    # This allows users to easily find and restore recently deleted notes.
    notes = list(
        mongo.db.notes.find({"user_id": user_id, "trashed": True}).sort(
            "trashed_at", -1
        )
    )

    for note in notes:
        note["_id"] = str(note["_id"])

    return jsonify(notes)


# ================= ARCHIVE =================
@notes_bp.route("/archived", methods=["GET"])
@jwt_required()
def get_archived_notes():
    user_id = str(get_jwt_identity())

    # For archived notes, we only return notes that are marked as archived and not trashed.
    # This keeps the archive separate from the trash and ensures users don't see deleted notes in their archive.
    notes = list(
        mongo.db.notes.find(
            {"user_id": user_id, "archived": True, "trashed": {"$ne": True}}
        )
    )

    # We can sort archived notes by updated_at date, so the most recently updated archived notes appear first.
    # This allows users to easily find their most relevant archived notes.
    for note in notes:
        note["_id"] = str(note["_id"])

    return jsonify(notes)


# ================= UPDATE NOTE + HISTORY =================
@notes_bp.route("/<id>", methods=["PUT"])
@jwt_required()
def update_note(id):
    user_id = str(get_jwt_identity())
    data = get_json_request()

    # ================= VALIDATE ID =================
    if not ObjectId.is_valid(id):
        return jsonify({"message": "Invalid note id"}), 400

    # ================= FETCH NOTE =================
    note = mongo.db.notes.find_one(note_access_query(id, user_id))
    if not note:
        return jsonify({"message": "Note not found"}), 404

    # ================= VALIDATION =================
    if "title" in data or "content" in data:
        error = validate_note_input(data, allow_empty_update=True)
        if error:
            return jsonify({"message": error}), 400

    updated_fields = {}

    # ================= TITLE =================
    if "title" in data and data["title"] is not None:
        updated_fields["title"] = bleach.clean(data["title"].strip(), strip=True)

    # ================= CONTENT =================
    if "content" in data and data["content"] is not None:
        updated_fields["content"] = sanitize_html(data["content"].strip())

    # ================= TAGS =================
    if "tags" in data and isinstance(data["tags"], list):
        updated_fields["tags"] = data["tags"]

    # ================= COLOR =================
    if "color" in data:
        color = (data["color"] or "").strip().lower()

        # Validate color format (simple check for hex code). If invalid, we can either ignore the update or set it to a default color. Here we choose to ignore invalid color updates.
        if color.startswith("#") and len(color) in (4, 7):
            updated_fields["color"] = color
        else:
            updated_fields["color"] = note.get("color", "#ffffff")

    # ================= BLOCK EMPTY UPDATE =================
    if not updated_fields:
        return jsonify({"message": "No valid fields to update"}), 400

    # ================= VERSION CHECK (FIXED LOGIC) =================
    incoming_version = data.get("version")

    # only enforce if user is actually doing a content edit
    is_content_update = any(k in data for k in ["title", "content"])

    if is_content_update and incoming_version is not None:
        if incoming_version != note.get("version", 1):
            return jsonify({"message": "Another collaborator updated this note."}), 409

    # ================= HISTORY =================
    history_entry = {
        "title": note.get("title"),
        "content": note.get("content"),
        "tags": note.get("tags", []),
        "updated_at": note.get("updated_at", datetime.utcnow()),
    }

    # We push the new history entry to the history array, and we use $slice to keep only the last 10 entries.
    # This prevents unbounded growth of the history array while still keeping recent changes accessible.
    mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$push": {"history": {"$each": [history_entry], "$slice": -10}}},
    )

    # ================= APPLY UPDATE =================
    updated_fields["updated_at"] = datetime.utcnow()
    updated_fields["version"] = note.get("version", 1) + 1
    updated_fields["currently_editing"] = None

    mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id}, {"$set": updated_fields}
    )

    return (
        jsonify(
            {"message": "Note updated", "updated_fields": list(updated_fields.keys())}
        ),
        200,
    )


# ================= HISTORY ENDPOINT =================
@notes_bp.route("/history/<id>", methods=["GET"])
@jwt_required()
def get_note_history(id):
    user_id = str(get_jwt_identity())

    # We fetch only the history field of the note to minimize data transfer. The access control ensures that only owners and collaborators can view the history.
    note = mongo.db.notes.find_one(
        {"_id": ObjectId(id), "user_id": user_id}, {"history": 1}
    )

    if not note:
        return jsonify({"message": "Note not found"}), 404

    return jsonify(note.get("history", [])), 200


# ================= SOFT DELETE =================
@notes_bp.route("/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):

    if not ObjectId.is_valid(id):
        return jsonify({"message": "Invalid note id"}), 400

# We perform a soft delete by marking the note as trashed and setting the trashed_at timestamp.
# This allows users to restore notes from the trash if they deleted them by mistake.
    user_id = str(get_jwt_identity())
    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": {"trashed": True, "trashed_at": datetime.utcnow(), "archived": False}},
    )

    if result.matched_count == 0:
        return jsonify({"message": "Note not found"}), 404

    return jsonify({"message": "Note moved to trash"})


# ================= RESTORE NOTE =================
@notes_bp.route("/restore/<id>", methods=["PUT"])
@jwt_required()
def restore_note(id):

    if not ObjectId.is_valid(id):
        return jsonify({"message": "Invalid note id"}), 400

    user_id = str(get_jwt_identity())

# To restore a note, we set trashed to False and clear the trashed_at timestamp. 
# We also unarchive the note to ensure it appears in the main notes list after restoration.
    result = mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": {"trashed": False, "trashed_at": None, "archived": False}},
    )

    if result.matched_count == 0:
        return jsonify({"message": "Note not found"}), 404

    return jsonify({"message": "Note restored"}), 200


# ================= PERMANENT DELETE =================
@notes_bp.route("/permanent/<id>", methods=["DELETE"])
@jwt_required()
def permanent_delete(id):
    user_id = str(get_jwt_identity())
    # We only allow permanent deletion of notes that are already trashed. 
    # This adds an extra layer of protection against accidental data loss.
    result = mongo.db.notes.delete_one({"_id": ObjectId(id), "user_id": user_id})

    if result.deleted_count == 0:
        return jsonify({"message": "Note not found"}), 404

    return jsonify({"message": "Note permanently deleted"})


# ================= PIN NOTE =================
@notes_bp.route("/pin/<id>", methods=["PUT"])
@jwt_required()
def toggle_pin(id):

    if not ObjectId.is_valid(id):
        return jsonify({"message": "Invalid note id"}), 400

    user_id = str(get_jwt_identity())

    note = mongo.db.notes.find_one(
        {"_id": ObjectId(id), "user_id": user_id, "trashed": {"$ne": True}}
    )

    if not note:
        return jsonify({"message": "Note not found"}), 404

    is_pinned = note.get("pinned", False)

    # ================= UNPIN =================
    if is_pinned: # If the note is already pinned, we unpin it by setting pinned to False and resetting pin_order. This will move the note back to its normal position in the list.
        mongo.db.notes.update_one(
            {"_id": ObjectId(id)}, {"$set": {"pinned": False, "pin_order": 0}}
        )
        return jsonify({"message": "Unpinned"}), 200

    # ================= PIN =================
    highest = mongo.db.notes.find_one(
        {"user_id": user_id, "pinned": True}, sort=[("pin_order", -1)]
    ) # We find the currently highest pin_order among the user's pinned notes and add 1 to it for the new pinned note. This ensures that newly pinned notes are added to the end of the pinned section.

    next_order = (highest.get("pin_order", 0) + 1) if highest else 1

    mongo.db.notes.update_one(
        {"_id": ObjectId(id)}, {"$set": {"pinned": True, "pin_order": next_order}}
    )

    return jsonify({"message": "Pinned"}), 200


# ================= ARCHIVE NOTE =================
@notes_bp.route("/archive/<id>", methods=["PUT"])
@jwt_required()
def toggle_archive(id):
    user_id = str(get_jwt_identity())
    note = mongo.db.notes.find_one(
        {"_id": ObjectId(id), "user_id": user_id, "trashed": {"$ne": True}}
    )
    if not note:
        return jsonify({"message": "Note not found"}), 404

# To toggle the archived status, we simply set archived to the opposite of its current value.
# This allows users to easily archive and unarchive notes.
    mongo.db.notes.update_one(
        {"_id": ObjectId(id)}, {"$set": {"archived": not note.get("archived", False)}}
    )

    return jsonify({"message": "Archive toggled"})


# ================= BULK DELETE =================
@notes_bp.route("/bulk-delete", methods=["POST"])
@jwt_required()
def bulk_delete(): # This endpoint allows users to bulk delete (trash) multiple notes at once. We perform a soft delete by marking the notes as trashed and setting the trashed_at timestamp. This allows users to restore notes from the trash if they deleted them by mistake.
    user_id = str(get_jwt_identity())
    data = get_json_request()
    note_ids = data.get("note_ids", [])

    if not note_ids:
        return jsonify({"message": "No notes provided"}), 400

# We perform a soft delete by marking the notes as trashed and setting the trashed_at timestamp.
# This allows users to restore notes from the trash if they deleted them by mistake.
    result = mongo.db.notes.update_many(
        {"_id": {"$in": [ObjectId(nid) for nid in note_ids]}, "user_id": user_id},
        {"$set": {"trashed": True, "trashed_at": datetime.utcnow()}},
    )

    return jsonify({"message": f"{result.modified_count} notes moved to trash"})


# ================= BULK ARCHIVE =================
@notes_bp.route("/bulk-archive", methods=["POST"])
@jwt_required()
def bulk_archive(): # This endpoint allows users to bulk archive multiple notes at once. We set archived to True for the selected notes, but we only apply this to notes that are not trashed to keep the archive separate from the trash.
    user_id = str(get_jwt_identity())
    data = get_json_request()
    note_ids = data.get("note_ids", [])

    if not note_ids:
        return jsonify({"message": "No notes provided"}), 400

    result = mongo.db.notes.update_many(
        {
            "_id": {"$in": [ObjectId(nid) for nid in note_ids]},
            "user_id": user_id,
            "trashed": {"$ne": True},
        },
        {"$set": {"archived": True}},
    )

    return jsonify({"message": f"{result.modified_count} notes archived"})


# ================= DUPLICATE NOTE =================
@notes_bp.route("/duplicate/<id>", methods=["POST"])
@jwt_required()
def duplicate_note(id):

    if not ObjectId.is_valid(id):
        return jsonify({"message": "Invalid note id"}), 400

    user_id = str(get_jwt_identity())

    note = mongo.db.notes.find_one({"_id": ObjectId(id), "user_id": user_id})

    if not note:
        return jsonify({"message": "Note not found"}), 404

    # Remove old ID and create new note
    note.pop("_id")

    # Optional: tweak duplicated note
    note["title"] = note.get("title", "") + " (Copy)"
    note["created_at"] = datetime.utcnow()

    result = mongo.db.notes.insert_one(note)

    return jsonify({"message": "Note duplicated", "id": str(result.inserted_id)}), 201


# ================= TAG SUGGESTIONS =================
@notes_bp.route("/tags", methods=["GET"])
@jwt_required()
def get_tags():
    user_id = str(get_jwt_identity())

    notes = mongo.db.notes.find({"user_id": user_id}, {"tags": 1})

# We use a set to collect unique tags across all notes. This allows us to provide tag suggestions based on the user's existing tags.
    tag_set = set()
    for note in notes:
        for tag in note.get("tags", []):
            tag_set.add(tag.lower())

    return jsonify(sorted(tag_set)), 200


# ================= BULK TAG UPDATE =================
@notes_bp.route("/bulk-tags", methods=["POST"])
@jwt_required()
def bulk_update_tags():
    # This endpoint allows users to bulk update tags for multiple notes at once. 
    # We replace the tags of the selected notes with the new set of tags provided in the request. 
    # This makes it easy for users to organize their notes by applying consistent tags across multiple notes.
    user_id = str(get_jwt_identity())
    data = request.get_json()

    note_ids = data.get("note_ids", [])
    tags = data.get("tags", [])

    if not note_ids:
        return jsonify({"message": "No notes selected"}), 400

    mongo.db.notes.update_many(
        {"_id": {"$in": [ObjectId(n) for n in note_ids]}, "user_id": user_id},
        {"$set": {"tags": tags}},
    )

    return jsonify({"message": "Tags updated"}), 200


# ================= EXPORT / IMPORT =================
@notes_bp.route("/export", methods=["GET"])
@jwt_required()
def export_notes():
    # This endpoint allows users to export all their notes in a JSON format. The exported data includes all note details, which can be used for backup or migration purposes.
    user_id = str(get_jwt_identity())

    notes = list(mongo.db.notes.find({"user_id": user_id}))

    # Convert ObjectId → string
    for note in notes:
        note["_id"] = str(note["_id"])

    return jsonify(notes), 200


@notes_bp.route("/import", methods=["POST"])
@jwt_required()
def import_notes():
    # This endpoint allows users to import notes from a JSON payload. The user can import multiple notes at once, and the imported notes will be associated with the current user.
    # This is useful for restoring from a backup or migrating from another service.
    user_id = str(get_jwt_identity())
    data = request.get_json()

    if not isinstance(data, list):
        return jsonify({"error": "Invalid format"}), 400

    new_notes = []

# We iterate through the provided notes and create new note documents for each one. 
# We ensure that the imported notes are associated with the current user and we set default values for any missing fields.
    for note in data:
        new_note = {
            "user_id": user_id,
            "title": note.get("title", ""),
            "content": note.get("content", ""),
            "tags": note.get("tags", []),
            "pinned": note.get("pinned", False),
            "archived": note.get("archived", False),
            "trashed": False,  # safety
            "color": note.get("color", "#ffffff"),
            "created_at": note.get("created_at"),
            "updated_at": note.get("updated_at"),
        }
        new_notes.append(new_note)

    if new_notes:
        mongo.db.notes.insert_many(new_notes)

    return jsonify({"message": "Import successful"}), 201


# ================= SHARE NOTE (COLLABORATION) =================
@notes_bp.route("/share/<id>", methods=["PUT"])
@jwt_required()
def share_note(id):
    # Identify the current authenticated user (note owner)
    user_id = str(get_jwt_identity())

    # Safely parse request body
    data = get_json_request()

    # Require an email to identify collaborator
    email = data.get("email")
    if not email:
        return jsonify({"message": "Email is required"}), 400

    # 🔍 Look up the user to share with
    user = mongo.db.users.find_one({"email": email})
    if not user:
        return jsonify({"message": "User not found"}), 404

    collaborator_id = str(user["_id"])

    # 🔒 Only the note owner can share the note
    note = mongo.db.notes.find_one({
        "_id": ObjectId(id),
        "user_id": user_id
    })

    if not note:
        return jsonify({"message": "Note not found or unauthorized"}), 404

    # 🚫 Prevent sharing the note with yourself (no-op + avoids duplication)
    if collaborator_id == user_id:
        return jsonify({"message": "Cannot share with yourself"}), 400

    # Add collaborator safely (no duplicates due to $addToSet)
    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {
            "$addToSet": {
                "collaborators": collaborator_id
            }
        }
    )

    return jsonify({"message": "Collaborator added"})


# ================= GET SINGLE NOTE (with access check) =================
@notes_bp.route("/single/<id>", methods=["GET"])
@jwt_required()
def get_single_note(id):
    user_id = str(get_jwt_identity())

    # Reuse centralized access logic (owner OR collaborator)
    note = mongo.db.notes.find_one(
        note_access_query(id, user_id)
    )

    if not note:
        return jsonify({"message": "Note not found"}), 404

    # Convert ObjectId → string for JSON response
    note["_id"] = str(note["_id"])
    return jsonify(note)


# ================= MARK NOTE AS EDITING =================
@notes_bp.route("/editing/<id>", methods=["PUT"])
@jwt_required()
def mark_editing(id):
    user_id = str(get_jwt_identity())

    # Ensure user has access before marking as editing
    note = mongo.db.notes.find_one(
        note_access_query(id, user_id)
    )

    if not note:
        return jsonify({"message": "Note not found"}), 404

    # Store who is currently editing (used for collaboration awareness / conflict UX)
    mongo.db.notes.update_one(
        {"_id": ObjectId(id)},
        {
            "$set": {
                "currently_editing": user_id
            }
        }
    )

    return jsonify({"message": "Editing status updated"})
