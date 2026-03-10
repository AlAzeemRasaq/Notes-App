from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import mongo
from bson import ObjectId
from datetime import datetime

notes_bp = Blueprint("notes", __name__)

# Create note
@notes_bp.route("/notes", methods=["POST"])
@jwt_required()
def create_note():
    user_id = get_jwt_identity()
    data = request.json

    note = {
        "user_id": user_id,
        "title": data.get("title", ""),
        "content": data.get("content", ""),
        "updated_at": datetime.utcnow()
    }

    result = mongo.db.notes.insert_one(note)

    return jsonify({"id": str(result.inserted_id)}), 201


# Get all notes
@notes_bp.route("/notes", methods=["GET"])
@jwt_required()
def get_notes():
    user_id = get_jwt_identity()

    notes = []
    for note in mongo.db.notes.find({"user_id": user_id}):
        note["_id"] = str(note["_id"])
        notes.append(note)

    return jsonify(notes)


# Update note
@notes_bp.route("/notes/<id>", methods=["PUT"])
@jwt_required()
def update_note(id):

    user_id = get_jwt_identity()
    data = request.json

    mongo.db.notes.update_one(
        {"_id": ObjectId(id), "user_id": user_id},
        {"$set": {
            "title": data.get("title", ""),
            "content": data.get("content", ""),
            "updated_at": datetime.utcnow()
        }}
    )

    return jsonify({"message": "Note updated"})


# Delete note
@notes_bp.route("/notes/<id>", methods=["DELETE"])
@jwt_required()
def delete_note(id):

    user_id = get_jwt_identity()

    mongo.db.notes.delete_one({
        "_id": ObjectId(id),
        "user_id": user_id
    })

    return jsonify({"message": "Note deleted"})
